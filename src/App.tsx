/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { ToastProvider } from './components/ui';
import { KioskHeader } from './components/KioskHeader';
import { UploadHomeStep } from './components/UploadHomeStep';
import { FileBrowserStep } from './components/FileBrowserStep';
import { DocumentProcessingStep } from './components/DocumentProcessingStep';
import { PreferencesStep } from './components/PreferencesStep';
import { SummaryStep } from './components/SummaryStep';
import { MobilePdfEditor } from './components/MobilePdfEditor';
import { ScannerModal } from './components/ScannerModal';
import {
  PrintDocumentSettings,
  ProcessingErrorCode,
  UploadedPrintDocument,
  WorkflowStep,
} from './types/kiosk';
import {
  buildKioskStoragePath,
  calculateLivePrintEstimate,
  calculateMultiDocPrintSummary,
  detectActualPageCount,
  detectBlankPagesFromBuffer,
  validateAndDeduplicateFiles,
  validateSelectedFile,
} from './utils/kioskLogic';
import { getKioskSession } from './utils/kioskSession';
import {
  getFirebaseIdToken,
  subscribeFirebaseAuthState,
  testFirestoreConnection,
} from './firebase';
import {
  clearUserProfile,
  fetchAndSyncBackendProfile,
  syncProfileFromFirebaseUser,
} from './utils/userProfile';
import {
  clearLocalWalletState,
  syncWalletFromBackend,
} from './utils/kioskWallet';
import {
  clearLocalPrintOrders,
  syncOrdersFromBackend,
} from './utils/kioskOrders';
import { hydratePaymentCapabilitiesFromServer } from './utils/paymentService';
import {
  detectBlankPagesInPdf,
  removePagesFromPdf,
} from './utils/blankPageDetector';
import { ensureEditablePdfDocument } from './utils/documentConversion';
import { PerDocumentPricingBreakdown } from './utils/pricingService';
import {
  classifyProcessingError,
  clearDocumentBlobs,
  clearProcessingSnapshot,
  documentRequiresConversion,
  loadDocumentBlobs,
  loadProcessingSnapshot,
  reconcileRecoveredDocument,
  removeDocumentBlobs,
  saveDocumentBlobs,
  saveProcessingSnapshot,
} from './utils/processingRecovery';
import {
  BottomNavTab,
  getPathForTab,
  parseTabFromLocation,
} from './utils/navigationConfig';

const DEFAULT_SETTINGS: PrintDocumentSettings = {
  colourMode: 'bw',
  sides: '1-sided',
  copies: 1,
  removeBlankPages: true,
};

export default function App() {
  const initialRouteTab = parseTabFromLocation();
  const [step, setStep] = useState<WorkflowStep>('home');
  const [homeTab, setHomeTab] = useState<'home' | 'files' | 'tools' | 'account'>(
    initialRouteTab === 'scan' ? 'home' : initialRouteTab
  );
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(initialRouteTab === 'scan');
  const [documents, setDocuments] = useState<UploadedPrintDocument[]>([]);
  const [globalSettings, setGlobalSettings] =
    useState<PrintDocumentSettings>(DEFAULT_SETTINGS);
  const [verifiedPricing, setVerifiedPricing] =
    useState<PerDocumentPricingBreakdown | null>(null);
  const [previewBeforePrint, setPreviewBeforePrint] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isKioskSessionExpired, setIsKioskSessionExpired] = useState<boolean>(false);
  const [hasHydratedRecovery, setHasHydratedRecovery] = useState<boolean>(false);

  const navigateHomeTab = (nextTab: 'home' | 'files' | 'tools' | 'account') => {
    setHomeTab(nextTab);
    setIsScannerOpen(false);
    const targetPath = getPathForTab(nextTab);
    if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.history.pushState({ tab: nextTab }, '', targetPath);
    }
  };

  const handleScannerOpenChange = (open: boolean) => {
    setIsScannerOpen(open);
    if (typeof window === 'undefined') return;
    if (open) {
      const scanPath = getPathForTab('scan');
      if (window.location.pathname !== scanPath) {
        window.history.pushState({ tab: 'scan' as BottomNavTab }, '', scanPath);
      }
    } else {
      const returnPath = getPathForTab(homeTab);
      if (window.location.pathname !== returnPath) {
        window.history.replaceState({ tab: homeTab }, '', returnPath);
      }
    }
  };

  useEffect(() => {
    const onPopState = () => {
      const routeTab = parseTabFromLocation();
      if (routeTab === 'scan') {
        setIsScannerOpen(true);
      } else {
        setIsScannerOpen(false);
        setHomeTab(routeTab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkSession = () => {
      const s = getKioskSession();
      const expired =
        !s.connected || (typeof s.expiresAt === 'number' && Date.now() > s.expiresAt);
      setIsKioskSessionExpired(expired);
    };
    checkSession();
    window.addEventListener('printpoint:session-updated', checkSession);
    window.addEventListener('storage', checkSession);

    void testFirestoreConnection();
    void hydratePaymentCapabilitiesFromServer();

    const unsubscribeAuth = subscribeFirebaseAuthState((user) => {
      if (user) {
        syncProfileFromFirebaseUser(user);
        void Promise.all([
          fetchAndSyncBackendProfile(),
          syncWalletFromBackend(),
          syncOrdersFromBackend(),
        ]);
      } else {
        clearUserProfile();
        clearLocalWalletState();
        clearLocalPrintOrders();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('printpoint:session-updated', checkSession);
      window.removeEventListener('storage', checkSession);
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('creator4_device_mode');
      localStorage.removeItem('c4_device_mode');
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const nextOrderIndexRef = useRef<number>(0);
  const uploadSessionIdRef = useRef<number>(0);
  const activeReadersRef = useRef<Map<string, FileReader>>(new Map());
  const activeXhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const inFlightDocIdsRef = useRef<Set<string>>(new Set());

  const clearPendingUploadReaders = () => {
    for (const reader of activeReadersRef.current.values()) {
      try {
        reader.abort();
      } catch {
        // Ignore abort errors
      }
    }
    activeReadersRef.current.clear();
    for (const xhr of activeXhrsRef.current.values()) {
      try {
        xhr.abort();
      } catch {
        // Ignore abort errors
      }
    }
    activeXhrsRef.current.clear();
    inFlightDocIdsRef.current.clear();
  };

  const deleteServerDocument = async (serverDocId?: string) => {
    if (!serverDocId) return;
    const token = await getFirebaseIdToken();
    if (!token) return;
    try {
      await fetch(`/api/documents/${encodeURIComponent(serverDocId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore network error during cleanup
    }
  };

  const syncEditedPdfToBackendAndDb = async (doc: UploadedPrintDocument) => {
    if (!doc.rawFile) return;
    await saveDocumentBlobs(doc.id, {
      rawFile: doc.rawFile,
      originalFile: doc.originalFile || doc.rawFile,
      convertedPdfFile: doc.convertedPdfFile,
    });
    if (!doc.serverDocId) return;
    const token = await getFirebaseIdToken();
    if (!token) return;
    try {
      const form = new FormData();
      form.append('file', doc.rawFile, doc.rawFile.name || `${doc.id}.pdf`);
      await fetch(`/api/documents/${encodeURIComponent(doc.serverDocId)}/pdf`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch {
      // keep local copy if offline
    }
  };

  const markDocumentFailed = (
    docId: string,
    code: ProcessingErrorCode,
    fileName: string,
    detail?: string,
    retryableOverride?: boolean
  ) => {
    const classified = classifyProcessingError(code, fileName, detail);
    const retryable =
      retryableOverride !== undefined ? retryableOverride : classified.retryable;

    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              progressPercent: 0,
              status: 'Failed',
              processingStage: 'failed',
              errorCode: code,
              errorMessage: classified.message,
              retryable,
              pageScanProgress: undefined,
            }
          : d
      )
    );
  };

  const inspectPdfIntegrity = async (
    buffer: Uint8Array,
    fileName: string
  ): Promise<{ ok: true; numPages: number } | { ok: false; code: ProcessingErrorCode; detail: string }> => {
    const headerSlice = new TextDecoder('latin1').decode(
      buffer.subarray(0, Math.min(1024, buffer.length))
    );
    if (!headerSlice.includes('%PDF-')) {
      return {
        ok: false,
        code: 'corrupted',
        detail: `"${fileName}" does not contain a valid PDF header and appears corrupted.`,
      };
    }

    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: buffer.slice(),
        useWorkerFetch: false,
        isEvalSupported: false,
      });
      pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;
      if (!numPages || numPages < 1) {
        return {
          ok: false,
          code: 'corrupted',
          detail: `"${fileName}" contains 0 readable pages.`,
        };
      }
      return { ok: true, numPages };
    } catch (err) {
      const errName = (err as { name?: string })?.name || '';
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errName === 'PasswordException' || /password/i.test(errMsg)) {
        return {
          ok: false,
          code: 'password-protected',
          detail: `"${fileName}" is password-protected. Remove the password and upload it again.`,
        };
      }
      return {
        ok: false,
        code: 'corrupted',
        detail: `"${fileName}" appears corrupted or unreadable as a PDF.`,
      };
    } finally {
      if (pdfDoc) {
        try {
          await pdfDoc.cleanup();
          await pdfDoc.destroy();
        } catch {
          // Ignore PDF cleanup failure
        }
      }
    }
  };

  const uploadFileToBackend = (params: {
    docId: string;
    file: File;
    stationId: string;
    sessionToken: string;
    authToken: string;
    sessionId: number;
    onProgress: (loaded: number, total: number) => void;
  }): Promise<
    | {
        ok: true;
        docId: string;
        pageCount: number;
        blankPages: number[];
        convertedPdfUrl: string;
        expiresAt?: number;
      }
    | {
        ok: false;
        code: ProcessingErrorCode;
        message: string;
        retryable: boolean;
      }
  > => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      activeXhrsRef.current.set(params.docId, xhr);
      xhr.open('POST', '/api/documents/upload', true);
      xhr.timeout = 60000;
      xhr.setRequestHeader('Authorization', `Bearer ${params.authToken}`);

      xhr.upload.onprogress = (evt) => {
        if (uploadSessionIdRef.current !== params.sessionId) return;
        if (evt.lengthComputable && evt.total > 0) {
          params.onProgress(evt.loaded, evt.total);
        }
      };

      const finish = (
        result:
          | {
              ok: true;
              docId: string;
              pageCount: number;
              blankPages: number[];
              convertedPdfUrl: string;
              expiresAt?: number;
            }
          | {
              ok: false;
              code: ProcessingErrorCode;
              message: string;
              retryable: boolean;
            }
      ) => {
        activeXhrsRef.current.delete(params.docId);
        resolve(result);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText || '{}') as {
              docId?: string;
              pageCount?: number;
              blankPages?: number[];
              convertedPdfUrl?: string;
              expiresAt?: number;
            };
            if (!data.docId || !data.convertedPdfUrl) {
              finish({
                ok: false,
                code: 'storage-failed',
                message: 'Server returned an incomplete document record.',
                retryable: true,
              });
              return;
            }
            finish({
              ok: true,
              docId: data.docId,
              pageCount: typeof data.pageCount === 'number' ? data.pageCount : 1,
              blankPages: Array.isArray(data.blankPages) ? data.blankPages : [],
              convertedPdfUrl: data.convertedPdfUrl,
              expiresAt: data.expiresAt,
            });
          } catch {
            finish({
              ok: false,
              code: 'storage-failed',
              message: 'Invalid response received from upload server.',
              retryable: true,
            });
          }
          return;
        }

        let serverError = `Upload failed (HTTP ${xhr.status}).`;
        try {
          const parsed = JSON.parse(xhr.responseText || '{}') as { error?: string };
          if (parsed.error) serverError = parsed.error;
        } catch {
          // ignore parse failure
        }

        if (xhr.status === 401 || xhr.status === 403) {
          if (xhr.status === 403) setIsKioskSessionExpired(true);
          finish({
            ok: false,
            code: 'session-expired',
            message: serverError,
            retryable: true,
          });
          return;
        }

        const isConversionOrCorrupt =
          xhr.status === 400 &&
          (documentRequiresConversion(params.file.name) || /password|corrupt|encrypt|unsupported/i.test(serverError));
        finish({
          ok: false,
          code: /password|encrypt/i.test(serverError)
            ? 'password-protected'
            : isConversionOrCorrupt
            ? documentRequiresConversion(params.file.name)
              ? 'conversion-failed'
              : 'corrupted'
            : 'storage-failed',
          message: serverError,
          retryable: xhr.status >= 500,
        });
      };

      xhr.onerror = () => {
        finish({
          ok: false,
          code: 'network-offline',
          message: `Network connection failed while uploading "${params.file.name}". Check connectivity and tap Retry.`,
          retryable: true,
        });
      };

      xhr.ontimeout = () => {
        finish({
          ok: false,
          code: 'network-offline',
          message: `Upload timed out for "${params.file.name}". Tap Retry to upload again.`,
          retryable: true,
        });
      };

      xhr.onabort = () => {
        finish({
          ok: false,
          code: 'interrupted',
          message: `Upload of "${params.file.name}" was interrupted before completion.`,
          retryable: true,
        });
      };

      const form = new FormData();
      form.append('file', params.file, params.file.name);
      form.append('docId', params.docId);
      form.append('stationId', params.stationId);
      form.append('sessionToken', params.sessionToken);
      xhr.send(form);
    });
  };

  const processSingleFile = (
    docId: string,
    file: File,
    sessionId: number,
    existingSnapshotDoc?: UploadedPrintDocument
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (uploadSessionIdRef.current !== sessionId) {
        resolve(false);
        return;
      }

      if (inFlightDocIdsRef.current.has(docId)) {
        resolve(false);
        return;
      }
      inFlightDocIdsRef.current.add(docId);

      const finish = (ok: boolean) => {
        inFlightDocIdsRef.current.delete(docId);
        activeReadersRef.current.delete(docId);
        activeXhrsRef.current.delete(docId);
        resolve(ok);
      };

      const activeKiosk = getKioskSession();
      const sessionExpired =
        !activeKiosk.connected ||
        !activeKiosk.sessionToken ||
        (typeof activeKiosk.expiresAt === 'number' &&
          Date.now() > activeKiosk.expiresAt);
      if (sessionExpired) {
        setIsKioskSessionExpired(true);
        markDocumentFailed(
          docId,
          'session-expired',
          file.name,
          `Your kiosk session is not active or expired while preparing "${file.name}". Scan the kiosk QR code and tap Retry.`,
          true
        );
        finish(false);
        return;
      }

      const validation = validateSelectedFile(file.name, file.size);
      if (!validation.valid) {
        const isEmpty = file.size <= 0;
        markDocumentFailed(
          docId,
          isEmpty ? 'corrupted' : 'unsupported',
          file.name,
          validation.error,
          false
        );
        finish(false);
        return;
      }

      const reader = new FileReader();
      activeReadersRef.current.set(docId, reader);

      reader.onabort = () => {
        if (uploadSessionIdRef.current === sessionId) {
          markDocumentFailed(
            docId,
            'interrupted',
            file.name,
            `Reading "${file.name}" was interrupted before completion.`,
            true
          );
        }
        finish(false);
      };

      reader.onerror = () => {
        if (uploadSessionIdRef.current !== sessionId) {
          finish(false);
          return;
        }
        markDocumentFailed(
          docId,
          'corrupted',
          file.name,
          `Could not read "${file.name}" from device storage. Check the file and tap Retry.`,
          true
        );
        finish(false);
      };

      reader.onload = async () => {
        activeReadersRef.current.delete(docId);
        if (uploadSessionIdRef.current !== sessionId) {
          finish(false);
          return;
        }

        const buffer =
          reader.result instanceof ArrayBuffer
            ? new Uint8Array(reader.result)
            : new Uint8Array(0);

        if (buffer.length === 0) {
          markDocumentFailed(
            docId,
            'corrupted',
            file.name,
            `"${file.name}" is empty (0 bytes) or unreadable.`,
            false
          );
          finish(false);
          return;
        }

        const authToken = await getFirebaseIdToken();
        if (!authToken) {
          markDocumentFailed(
            docId,
            'session-expired',
            file.name,
            'Sign in with Google on the Account tab to securely upload and process documents, then tap Retry.',
            true
          );
          finish(false);
          return;
        }

        // Persist raw bytes for refresh recovery
        await saveDocumentBlobs(docId, { rawFile: file, originalFile: file });

        // Stage 2: Validating Documents locally before upload
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  status: 'Processing document...',
                  processingStage: 'validating',
                  errorCode: undefined,
                  errorMessage: undefined,
                }
              : d
          )
        );

        const lower = file.name.toLowerCase();
        const needsConversion = documentRequiresConversion(file.name);
        let verifiedPageCount = detectActualPageCount(file.name, buffer);

        if (lower.endsWith('.pdf')) {
          const pdfCheck = await inspectPdfIntegrity(buffer, file.name);
          if (uploadSessionIdRef.current !== sessionId) {
            finish(false);
            return;
          }
          if (!pdfCheck.ok) {
            markDocumentFailed(
              docId,
              pdfCheck.code,
              file.name,
              pdfCheck.detail,
              false
            );
            finish(false);
            return;
          }
          verifiedPageCount = pdfCheck.numPages;
        } else if (/\.(jpg|jpeg|png)$/i.test(lower) && typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(file);
            bitmap.close();
          } catch {
            if (uploadSessionIdRef.current !== sessionId) {
              finish(false);
              return;
            }
            markDocumentFailed(
              docId,
              'corrupted',
              file.name,
              `"${file.name}" appears corrupted and could not be decoded as an image.`,
              false
            );
            finish(false);
            return;
          }
        }

        // Stage 1: Real Multipart Upload to Print Point Backend
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          markDocumentFailed(
            docId,
            'network-offline',
            file.name,
            `You are offline. Reconnect to upload "${file.name}" and tap Retry.`,
            true
          );
          finish(false);
          return;
        }

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  uploadedBytes: 0,
                  progressPercent: 5,
                  status: 'Uploading...',
                  processingStage: 'uploading',
                }
              : d
          )
        );

        const uploadOutcome = await uploadFileToBackend({
          docId,
          file,
          stationId: activeKiosk.activeStation.id,
          sessionToken: activeKiosk.sessionToken || '',
          authToken,
          sessionId,
          onProgress: (loaded, total) => {
            const pct = Math.min(99, Math.max(5, Math.round((loaded / total) * 100)));
            setDocuments((prev) =>
              prev.map((d) =>
                d.id === docId
                  ? {
                      ...d,
                      uploadedBytes: loaded,
                      progressPercent: pct,
                      status: 'Uploading...',
                      processingStage: 'uploading',
                    }
                  : d
              )
            );
          },
        });

        if (uploadSessionIdRef.current !== sessionId) {
          finish(false);
          return;
        }

        if (!uploadOutcome.ok) {
          markDocumentFailed(
            docId,
            uploadOutcome.code,
            file.name,
            uploadOutcome.message,
            uploadOutcome.retryable
          );
          finish(false);
          return;
        }

        verifiedPageCount = uploadOutcome.pageCount || verifiedPageCount;

        // Stage 3: Fetch converted PDF when source file was non-PDF
        let workingPdfFile: File = file;
        let conversionStatus: UploadedPrintDocument['conversionStatus'] = 'native-pdf';
        let convertedPdfFile: File | undefined;

        if (needsConversion) {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === docId
                ? {
                    ...d,
                    uploadedBytes: file.size,
                    progressPercent: 100,
                    status: 'Processing document...',
                    processingStage: 'converting',
                  }
                : d
            )
          );

          try {
            const freshToken = (await getFirebaseIdToken()) || authToken;
            const pdfRes = await fetch(uploadOutcome.convertedPdfUrl, {
              method: 'GET',
              headers: { Authorization: `Bearer ${freshToken}` },
            });
            if (pdfRes.ok) {
              const pdfBlob = await pdfRes.blob();
              const pdfName = file.name.replace(/\.[^.]+$/, '.pdf');
              const serverPdf = new File([pdfBlob], pdfName, {
                type: 'application/pdf',
              });
              workingPdfFile = serverPdf;
              convertedPdfFile = serverPdf;
              conversionStatus = 'converted';
            }
          } catch {
            // Fall through to local fallback below if server PDF fetch failed
          }

          if (conversionStatus !== 'converted') {
            const baseDocForConversion: UploadedPrintDocument = existingSnapshotDoc ?? {
              id: docId,
              orderIndex: 0,
              name: file.name,
              sizeBytes: file.size,
              pageCount: verifiedPageCount,
              progressPercent: 100,
              status: 'Processing document...',
              rawFile: file,
              originalFile: file,
              settings: { ...globalSettings },
            };

            const convOutcome = await ensureEditablePdfDocument({
              ...baseDocForConversion,
              rawFile: file,
              originalFile: file,
            });

            if (uploadSessionIdRef.current !== sessionId) {
              finish(false);
              return;
            }

            if (convOutcome.status === 'failed' || convOutcome.status === 'conversion-required' || !convOutcome.pdfFile) {
              markDocumentFailed(
                docId,
                'conversion-failed',
                file.name,
                convOutcome.error,
                false
              );
              finish(false);
              return;
            }

            workingPdfFile = convOutcome.pdfFile;
            convertedPdfFile = convOutcome.pdfFile;
            conversionStatus = convOutcome.status;
            if (convOutcome.pageCount && convOutcome.pageCount > 0) {
              verifiedPageCount = convOutcome.pageCount;
            }
          }
        }

        // Stage 4: Preparing Pages (actual page count + page-by-page blank page inspection)
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  uploadedBytes: file.size,
                  progressPercent: 100,
                  status: 'Preparing preview...',
                  processingStage: 'preparing',
                  pageCount: verifiedPageCount,
                  originalPageCount: d.originalPageCount ?? verifiedPageCount,
                  pageScanProgress: { current: 1, total: verifiedPageCount },
                }
              : d
          )
        );

        let detectedBlanks =
          uploadOutcome.blankPages.length > 0
            ? uploadOutcome.blankPages
            : detectBlankPagesFromBuffer(file.name, buffer);
        let uncertainPages: number[] | undefined;

        try {
          const pdfResult = await detectBlankPagesInPdf(
            workingPdfFile,
            docId,
            (current, total) => {
              if (uploadSessionIdRef.current !== sessionId) return;
              setDocuments((prev) =>
                prev.map((d) =>
                  d.id === docId
                    ? {
                        ...d,
                        pageScanProgress: { current, total },
                      }
                    : d
                )
              );
            }
          );
          if (uploadSessionIdRef.current !== sessionId) {
            finish(false);
            return;
          }
          detectedBlanks = pdfResult.blankPages;
          uncertainPages = pdfResult.uncertainPages;
        } catch {
          // Keep server / buffer-level detection if renderer inspection fails
        }

        await saveDocumentBlobs(docId, {
          rawFile: workingPdfFile,
          originalFile: file,
          convertedPdfFile,
        });

        if (uploadSessionIdRef.current !== sessionId) {
          finish(false);
          return;
        }

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  uploadedBytes: file.size,
                  pageCount: verifiedPageCount,
                  originalPageCount: d.originalPageCount ?? verifiedPageCount,
                  rawFile: workingPdfFile,
                  originalFile: d.originalFile || file,
                  convertedPdfFile,
                  conversionStatus,
                  serverDocId: uploadOutcome.docId,
                  convertedPdfUrl: uploadOutcome.convertedPdfUrl,
                  expiresAt: uploadOutcome.expiresAt,
                  blankPages: detectedBlanks,
                  uncertainPages,
                  progressPercent: 100,
                  status: 'Ready',
                  processingStage: 'ready',
                  pageScanProgress: undefined,
                  errorCode: undefined,
                  errorMessage: undefined,
                  retryable: undefined,
                }
              : d
          )
        );

        finish(true);
      };

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                uploadedBytes: 0,
                progressPercent: 0,
                status: 'Uploading...',
                processingStage: 'uploading',
                errorCode: undefined,
                errorMessage: undefined,
                retryable: undefined,
                pageScanProgress: undefined,
              }
            : d
        )
      );

      reader.readAsArrayBuffer(file);
    });
  };

  // Recover processing state & prepared files after browser refresh
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const snapshot = loadProcessingSnapshot();
      if (!snapshot) {
        setHasHydratedRecovery(true);
        return;
      }

      const blobMap = await loadDocumentBlobs(snapshot.documents.map((d) => d.id));
      if (cancelled) return;

      const restoredDocs: UploadedPrintDocument[] = [];
      const docsToResume: UploadedPrintDocument[] = [];

      let maxOrder = nextOrderIndexRef.current;
      for (const snapDoc of snapshot.documents) {
        if (snapDoc.orderIndex >= maxOrder) {
          maxOrder = snapDoc.orderIndex + 1;
        }
        const reconciled = reconcileRecoveredDocument(
          snapDoc,
          blobMap[snapDoc.id] || {}
        );
        restoredDocs.push(reconciled.doc);
        if (reconciled.needsResume) {
          docsToResume.push(reconciled.doc);
        }
      }
      nextOrderIndexRef.current = maxOrder;

      setGlobalSettings(snapshot.globalSettings);
      setDocuments(restoredDocs);

      const safeStep: WorkflowStep =
        snapshot.step === 'loading' ||
        snapshot.step === 'editor' ||
        snapshot.step === 'preferences' ||
        snapshot.step === 'summary'
          ? docsToResume.length > 0 ||
            restoredDocs.some((d) => d.status === 'Failed')
            ? 'loading'
            : snapshot.step
          : 'home';

      setStep(safeStep);
      setHasHydratedRecovery(true);

      if (docsToResume.length > 0) {
        const sessionId = uploadSessionIdRef.current;
        for (const doc of docsToResume) {
          if (uploadSessionIdRef.current !== sessionId) break;
          if (doc.originalFile || doc.rawFile) {
            await processSingleFile(
              doc.id,
              (doc.originalFile || doc.rawFile)!,
              sessionId,
              doc
            );
          }
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist current queue & step for refresh recovery
  useEffect(() => {
    if (!hasHydratedRecovery) return;
    if (documents.length === 0) {
      clearProcessingSnapshot();
      return;
    }
    saveProcessingSnapshot(step, globalSettings, documents);
  }, [documents, step, globalSettings, hasHydratedRecovery]);

  const hasPdfDocuments = (docs: UploadedPrintDocument[]) =>
    docs.some((d) => d.name.toLowerCase().endsWith('.pdf'));

  const enqueueDocuments = (
    files: File[],
    options: { openProcessingScreen: boolean }
  ): { addedCount: number; errors: string[] } => {
    if (files.length === 0) return { addedCount: 0, errors: [] };

    const { validFiles, errors } = validateAndDeduplicateFiles(files, documents);
    if (validFiles.length === 0) {
      return { addedCount: 0, errors };
    }

    const sessionId = uploadSessionIdRef.current;
    const activeKiosk = getKioskSession();

    const newDocs: UploadedPrintDocument[] = validFiles.map((file, idx) => {
      const orderIndex = nextOrderIndexRef.current++;
      const docId = `doc-${Date.now()}-${orderIndex}`;
      const customSize = (file as unknown as { virtualSizeBytes?: number }).virtualSizeBytes;
      const customModified = (file as unknown as { virtualModifiedLabel?: string })
        .virtualModifiedLabel;

      return {
        id: docId,
        orderIndex,
        name: file.name,
        sizeBytes: customSize ?? file.size,
        uploadedBytes: 0,
        lastModified: file.lastModified,
        modifiedLabel: customModified,
        pageCount: 1,
        progressPercent: 0,
        status: idx === 0 ? 'Uploading...' : 'Waiting',
        processingStage: 'uploading',
        requiresConversion: documentRequiresConversion(file.name),
        rawFile: file,
        originalFile: file,
        kioskId: activeKiosk.activeStation.id,
        kioskName: activeKiosk.activeStation.name,
        sessionToken: activeKiosk.sessionToken,
        storagePath: buildKioskStoragePath(
          activeKiosk.activeStation.id,
          activeKiosk.sessionToken,
          docId,
          file.name
        ),
        settings: { ...globalSettings },
      };
    });

    const combinedDocs = [...documents, ...newDocs];
    setDocuments(combinedDocs);

    if (options.openProcessingScreen) {
      setStep('loading');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    void (async () => {
      for (const doc of newDocs) {
        if (uploadSessionIdRef.current !== sessionId) {
          break;
        }
        if (doc.rawFile) {
          await processSingleFile(doc.id, doc.rawFile, sessionId, doc);
        }
      }
    })();

    return { addedCount: newDocs.length, errors };
  };

  const handleFilesSelected = (files: File[]) => {
    enqueueDocuments(files, { openProcessingScreen: true });
  };

  const handleFilesPageAdd = (files: File[]) => {
    return enqueueDocuments(files, { openProcessingScreen: false });
  };

  const handleRetryDocument = async (docId: string) => {
    const target = documents.find((d) => d.id === docId);
    const sourceFile = target?.originalFile || target?.rawFile;
    if (!target || !sourceFile || inFlightDocIdsRef.current.has(docId)) return;
    const sessionId = uploadSessionIdRef.current;
    await processSingleFile(docId, sourceFile, sessionId, target);
  };

  const handleRemoveDocument = (docId: string) => {
    const target = documents.find((d) => d.id === docId);
    const activeReader = activeReadersRef.current.get(docId);
    if (activeReader) {
      try {
        activeReader.abort();
      } catch {
        // Ignore abort errors
      }
      activeReadersRef.current.delete(docId);
    }
    const activeXhr = activeXhrsRef.current.get(docId);
    if (activeXhr) {
      try {
        activeXhr.abort();
      } catch {
        // Ignore abort errors
      }
      activeXhrsRef.current.delete(docId);
    }
    inFlightDocIdsRef.current.delete(docId);
    void removeDocumentBlobs(docId);
    void deleteServerDocument(target?.serverDocId);

    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      if (next.length === 0) {
        clearPendingUploadReaders();
        clearProcessingSnapshot();
        if (step !== 'home' && step !== 'file-browser') {
          setStep('home');
        }
      }
      return next;
    });
  };

  const handleRemoveAllFailed = () => {
    const failedDocs = documents.filter((d) => d.status === 'Failed');
    if (failedDocs.length === 0) return;
    for (const doc of failedDocs) {
      inFlightDocIdsRef.current.delete(doc.id);
      void removeDocumentBlobs(doc.id);
      void deleteServerDocument(doc.serverDocId);
    }
    setDocuments((prev) => {
      const next = prev.filter((d) => d.status !== 'Failed');
      if (next.length === 0) {
        clearProcessingSnapshot();
        setStep('home');
      }
      return next;
    });
  };

  const handleReconnectKiosk = () => {
    handleScannerOpenChange(true);
  };

  const handleKioskReconnected = async () => {
    setIsKioskSessionExpired(false);
    handleScannerOpenChange(false);

    const expiredDocs = documents.filter(
      (d) => d.status === 'Failed' && d.errorCode === 'session-expired'
    );
    if (expiredDocs.length > 0) {
      const sessionId = uploadSessionIdRef.current;
      for (const doc of expiredDocs) {
        const sourceFile = doc.originalFile || doc.rawFile;
        if (sourceFile && uploadSessionIdRef.current === sessionId) {
          await processSingleFile(doc.id, sourceFile, sessionId, doc);
        }
      }
    }
  };

  const handleCancelUpload = () => {
    uploadSessionIdRef.current++;
    for (const doc of documents) {
      void deleteServerDocument(doc.serverDocId);
    }
    clearPendingUploadReaders();
    clearProcessingSnapshot();
    void clearDocumentBlobs();
    setDocuments([]);
    setStep('home');
  };

  const handleReviewDocuments = () => {
    const readyDocs = documents.filter((d) => d.status === 'Ready');
    const hasPendingOrFailed = documents.some((d) => d.status !== 'Ready');
    if (readyDocs.length === 0 || hasPendingOrFailed) return;
    setStep('editor');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleContinueToPrintSettings = () => {
    const hasPendingOrFailed = documents.some((d) => d.status !== 'Ready');
    if (documents.length === 0 || hasPendingOrFailed) return;
    setStep('preferences');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleUpdateDocumentSettings = (
    docId: string,
    nextPatch: Partial<PrintDocumentSettings>
  ) => {
    setVerifiedPricing(null);
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, settings: { ...d.settings, ...nextPatch } }
          : d
      )
    );
  };

  const handleStartNewSession = () => {
    uploadSessionIdRef.current++;
    clearPendingUploadReaders();
    clearProcessingSnapshot();
    void clearDocumentBlobs();
    setDocuments([]);
    setVerifiedPricing(null);
    setGlobalSettings(DEFAULT_SETTINGS);
    navigateHomeTab('home');
    setStep('home');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleUpdateDocumentBlankPages = (
    docId: string,
    blankPages: number[],
    uncertainPages?: number[]
  ) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              blankPages,
              ...(uncertainPages !== undefined ? { uncertainPages } : {}),
            }
          : d
      )
    );
  };

  const handleRemoveBlankPages = async (docPagesMap: Record<string, number[]>) => {
    const updatedDocs = await Promise.all(
      documents.map(async (doc) => {
        const pagesToRemove = docPagesMap[doc.id];
        if (!pagesToRemove || pagesToRemove.length === 0 || !doc.rawFile) {
          return doc;
        }

        try {
          const fileBuffer = await doc.rawFile.arrayBuffer();
          const modifiedBytes = await removePagesFromPdf(fileBuffer, pagesToRemove);
          const originalFile = doc.originalFile || doc.rawFile;
          const newFile = new File([modifiedBytes.buffer as ArrayBuffer], doc.name, {
            type: 'application/pdf',
          });

          const newPageCount = Math.max(1, doc.pageCount - pagesToRemove.length);
          const remainingBlanks = (doc.blankPages || []).filter(
            (p) => !pagesToRemove.includes(p)
          );

          const updatedDoc: UploadedPrintDocument = {
            ...doc,
            rawFile: newFile,
            originalFile,
            pageCount: newPageCount,
            originalPageCount: doc.originalPageCount ?? doc.pageCount,
            blankPages: remainingBlanks,
            removedBlankPages: [...(doc.removedBlankPages || []), ...pagesToRemove],
          };
          await syncEditedPdfToBackendAndDb(updatedDoc);
          return updatedDoc;
        } catch {
          return doc;
        }
      })
    );

    setDocuments(updatedDocs);
  };

  const handleRestoreOriginalPages = () => {
    setDocuments((prevDocs) =>
      prevDocs.map((doc) => {
        const baselineFile = doc.convertedPdfFile || doc.originalFile;
        if (!baselineFile) return doc;
        const restoredDoc: UploadedPrintDocument = {
          ...doc,
          rawFile: baselineFile,
          pageCount: doc.originalPageCount ?? doc.pageCount,
          blankPages: doc.removedBlankPages
            ? [...(doc.blankPages || []), ...doc.removedBlankPages]
            : doc.blankPages,
          removedBlankPages: [],
        };
        void syncEditedPdfToBackendAndDb(restoredDoc);
        return restoredDoc;
      })
    );
  };

  const handleReplaceDocument = async (docId: string, newFile: File) => {
    const validation = validateSelectedFile(newFile.name, newFile.size);
    if (!validation.valid) return;

    const buffer = new Uint8Array(await newFile.arrayBuffer());
    let detectedPages = detectActualPageCount(newFile.name, buffer);
    if (newFile.name.toLowerCase().endsWith('.pdf') || newFile.type === 'application/pdf') {
      const check = await inspectPdfIntegrity(buffer, newFile.name);
      if (!check.ok) {
        return;
      }
      detectedPages = check.numPages;
    }

    const detectedBlanks = detectBlankPagesFromBuffer(newFile.name, buffer);

    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d;
        const updatedDoc: UploadedPrintDocument = {
          ...d,
          rawFile: newFile,
          name: newFile.name,
          sizeBytes: newFile.size,
          pageCount: detectedPages,
          blankPages: detectedBlanks,
        };
        void syncEditedPdfToBackendAndDb(updatedDoc);
        return updatedDoc;
      })
    );
  };

  const summary = calculateMultiDocPrintSummary(documents);
  const liveEstimate = calculateLivePrintEstimate(documents, globalSettings);
  const hasPdfs = hasPdfDocuments(documents);

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col">
      {step !== 'home' && step !== 'file-browser' && step !== 'editor' && (
        <KioskHeader
          onGoHome={() => {
            navigateHomeTab('home');
            setStep('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <main
        className={`flex-1 w-full bg-surface flex flex-col mx-auto ${
          step === 'home' || step === 'editor' || step === 'loading'
            ? 'p-0'
            : 'pt-3.5 pb-8 px-4 max-w-4xl'
        }`}
      >
        {step === 'home' && (
          <UploadHomeStep
            activeTab={homeTab}
            onTabChange={navigateHomeTab}
            isScannerOpen={isScannerOpen}
            onScannerOpenChange={handleScannerOpenChange}
            onFilesSelected={handleFilesSelected}
            documents={documents}
            onAddFilesToFilesTab={handleFilesPageAdd}
            onRemoveDocument={handleRemoveDocument}
            onRetryDocument={handleRetryDocument}
            onContinueFromFiles={handleReviewDocuments}
            isSheetOpen={false}
          />
        )}

        {step === 'file-browser' && (
          <FileBrowserStep
            documents={documents}
            onAddFiles={handleFilesPageAdd}
            onRemoveDocument={handleRemoveDocument}
            onRetryDocument={handleRetryDocument}
            onContinue={handleReviewDocuments}
            onBack={() => {
              setStep('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        )}

        {step === 'loading' && (
          <DocumentProcessingStep
            documents={documents}
            isOnline={isOnline}
            isKioskSessionExpired={isKioskSessionExpired}
            onAddMoreFiles={(files) =>
              enqueueDocuments(files, { openProcessingScreen: true })
            }
            onRetryDocument={handleRetryDocument}
            onRemoveDocument={handleRemoveDocument}
            onRemoveAllFailed={handleRemoveAllFailed}
            onReconnectKiosk={handleReconnectKiosk}
            onCancelProcessing={handleCancelUpload}
            onContinueToPrintSettings={handleContinueToPrintSettings}
            onOpenPdfEditor={handleReviewDocuments}
          />
        )}

        {step === 'editor' && (
          <MobilePdfEditor
            documents={documents}
            onSaveAndContinue={(updatedDocs) => {
              for (const doc of updatedDocs) {
                const prevDoc = documents.find((d) => d.id === doc.id);
                if (
                  doc.rawFile &&
                  (doc.rawFile !== prevDoc?.rawFile || doc.pageCount !== prevDoc?.pageCount)
                ) {
                  void syncEditedPdfToBackendAndDb(doc);
                }
              }
              setDocuments(updatedDocs);
              setStep('preferences');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onBack={() => {
              setStep('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        )}

        {step === 'preferences' && (
          <PreferencesStep
            documents={documents}
            globalSettings={globalSettings}
            previewBeforePrint={previewBeforePrint}
            isMobileView={true}
            onTogglePreviewBeforePrint={() => setPreviewBeforePrint((prev) => !prev)}
            onUpdateDocumentSettings={handleUpdateDocumentSettings}
            onUpdateBlankPages={handleUpdateDocumentBlankPages}
            onRemoveBlankPages={handleRemoveBlankPages}
            onRestoreOriginalPages={handleRestoreOriginalPages}
            onReplaceDocument={handleReplaceDocument}
            onReconnectKiosk={handleReconnectKiosk}
            onBack={() => {
              if (documents.length > 0 || hasPdfs) {
                setStep('editor');
              } else {
                navigateHomeTab('home');
                setStep('home');
              }
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onContinueToPayment={(verifiedBreakdown) => {
              setVerifiedPricing(verifiedBreakdown);
              setStep(previewBeforePrint ? 'summary' : 'payment');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        )}

        {(step === 'summary' || step === 'payment') && (
          <SummaryStep
            step={step}
            summary={verifiedPricing?.summary ?? summary}
            documents={documents}
            estimatedTotalInr={
              verifiedPricing?.combinedTotalInr ?? liveEstimate.estimatedTotalInr
            }
            previewBeforePrint={previewBeforePrint}
            onEditSettings={() => {
              setStep('preferences');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onProceedToPayment={() => {
              setStep('payment');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onStartNewSession={handleStartNewSession}
            onOpenScanner={() => handleScannerOpenChange(true)}
            onOpenAccount={() => {
              setStep('home');
              navigateHomeTab('account');
            }}
          />
        )}
      </main>
        {step !== 'home' && (
          <ScannerModal
            isOpen={isScannerOpen}
            onClose={() => handleScannerOpenChange(false)}
            onKioskConnected={() => void handleKioskReconnected()}
          />
        )}
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}
