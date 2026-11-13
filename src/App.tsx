/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { KioskHeader } from './components/KioskHeader';
import { UploadHomeStep } from './components/UploadHomeStep';
import { FileBrowserStep } from './components/FileBrowserStep';
import { FloatingUploadSheet } from './components/FloatingUploadSheet';
import { PreferencesStep } from './components/PreferencesStep';
import { SummaryStep } from './components/SummaryStep';
import { MobilePdfEditor } from './components/MobilePdfEditor';
import {
  PrintDocumentSettings,
  UploadedPrintDocument,
  WorkflowStep,
} from './types/kiosk';
import {
  applyGlobalSettingsToDocs,
  calculateLivePrintEstimate,
  calculateMultiDocPrintSummary,
  detectActualPageCount,
  detectBlankPagesFromBuffer,
} from './utils/kioskLogic';
import {
  detectBlankPagesInPdf,
  removePagesFromPdf,
} from './utils/blankPageDetector';

const DEFAULT_SETTINGS: PrintDocumentSettings = {
  colourMode: 'bw',
  sides: '1-sided',
  copies: 1,
  removeBlankPages: true,
};

export default function App() {
  const [step, setStep] = useState<WorkflowStep>('home');
  const [documents, setDocuments] = useState<UploadedPrintDocument[]>([]);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState<boolean>(false);
  const [globalSettings, setGlobalSettings] =
    useState<PrintDocumentSettings>(DEFAULT_SETTINGS);
  const [previewBeforePrint, setPreviewBeforePrint] = useState<boolean>(true);

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
  const activeFileReaderRef = useRef<FileReader | null>(null);
  const activeTimeoutsRef = useRef<number[]>([]);

  const clearPendingUploadTimers = () => {
    for (const timerId of activeTimeoutsRef.current) {
      window.clearTimeout(timerId);
    }
    activeTimeoutsRef.current = [];
    if (activeFileReaderRef.current) {
      try {
        activeFileReaderRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      activeFileReaderRef.current = null;
    }
  };

  /**
   * Reads a single File via FileReader with real-time progress events across
   * Uploading, Processing document, and Preparing preview stages, extracting
   * the actual binary page count. Respects cancellation via sessionId.
   */
  const processSingleFile = (
    docId: string,
    file: File,
    sessionId: number
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (uploadSessionIdRef.current !== sessionId) {
        resolve(false);
        return;
      }

      if (file.size === 0) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  progressPercent: 0,
                  status: 'Failed',
                  errorMessage: 'File is empty (0 bytes).',
                }
              : d
          )
        );
        resolve(false);
        return;
      }

      const reader = new FileReader();
      activeFileReaderRef.current = reader;

      reader.onabort = () => {
        activeFileReaderRef.current = null;
        resolve(false);
      };

      reader.onerror = () => {
        activeFileReaderRef.current = null;
        if (uploadSessionIdRef.current !== sessionId) {
          resolve(false);
          return;
        }
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  status: 'Failed',
                  errorMessage: 'Could not read file from device.',
                }
              : d
          )
        );
        resolve(false);
      };

      reader.onprogress = (evt) => {
        if (uploadSessionIdRef.current !== sessionId) return;
        if (evt.lengthComputable && evt.total > 0) {
          const rawRatio = evt.loaded / evt.total;
          const mappedPct = Math.max(12, Math.min(76, Math.round(rawRatio * 76)));
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === docId && d.progressPercent < mappedPct
                ? {
                    ...d,
                    progressPercent: mappedPct,
                    status: 'Uploading...',
                  }
                : d
            )
          );
        }
      };

      reader.onload = () => {
        activeFileReaderRef.current = null;
        if (uploadSessionIdRef.current !== sessionId) {
          resolve(false);
          return;
        }

        const buffer =
          reader.result instanceof ArrayBuffer
            ? new Uint8Array(reader.result)
            : new Uint8Array(0);

        const detectedPages = detectActualPageCount(file.name, buffer);
        const detectedBlanks = detectBlankPagesFromBuffer(file.name, buffer);

        const steps: Array<{
          pct: number;
          status: UploadedPrintDocument['status'];
          delayMs: number;
        }> = [
          { pct: 28, status: 'Uploading...', delayMs: 80 },
          { pct: 48, status: 'Uploading...', delayMs: 85 },
          { pct: 68, status: 'Uploading...', delayMs: 90 },
          { pct: 84, status: 'Uploading...', delayMs: 90 },
          { pct: 92, status: 'Processing document...', delayMs: 110 },
          { pct: 97, status: 'Preparing preview...', delayMs: 95 },
          { pct: 100, status: 'Ready', delayMs: 75 },
        ];

        let idx = 0;
        const advanceStep = () => {
          if (uploadSessionIdRef.current !== sessionId) {
            resolve(false);
            return;
          }
          if (idx >= steps.length) {
            resolve(true);
            return;
          }
          const current = steps[idx++];
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === docId
                ? {
                    ...d,
                    pageCount:
                      current.pct >= 85 ? detectedPages : d.pageCount,
                    originalPageCount:
                      current.pct >= 85
                        ? d.originalPageCount ?? detectedPages
                        : d.originalPageCount,
                    originalFile: d.originalFile || file,
                    blankPages:
                      current.pct >= 85
                        ? detectedBlanks.length > 0
                          ? detectedBlanks
                          : d.blankPages
                        : d.blankPages,
                    progressPercent: Math.max(d.progressPercent, current.pct),
                    status: current.status,
                    errorMessage: undefined,
                  }
                : d
            )
          );
          if (idx < steps.length) {
            const tId = window.setTimeout(advanceStep, current.delayMs);
            activeTimeoutsRef.current.push(tId);
          } else {
            // Asynchronously run multi-layer PDF.js verification for complete accuracy
            if (file.name.toLowerCase().endsWith('.pdf')) {
              detectBlankPagesInPdf(file, docId)
                .then((result) => {
                  if (uploadSessionIdRef.current !== sessionId) return;
                  setDocuments((prev) =>
                    prev.map((d) =>
                      d.id === docId
                        ? {
                            ...d,
                            blankPages: result.blankPages,
                            uncertainPages: result.uncertainPages,
                          }
                        : d
                    )
                  );
                })
                .catch(() => {
                  // Keep initial state
                });
            }
            resolve(true);
          }
        };

        const initialTimer = window.setTimeout(advanceStep, 30);
        activeTimeoutsRef.current.push(initialTimer);
      };

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                progressPercent: 10,
                status: 'Uploading...',
              }
            : d
        )
      );

      reader.readAsArrayBuffer(file);
    });
  };

  /**
   * Handles new files selected from the native mobile file picker.
   * Opens the floating bottom-sheet upload panel over the existing website
   * without navigating to a separate full-page loading screen or auto-advancing.
   */
  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;

    const sessionId = ++uploadSessionIdRef.current;

    const newDocs: UploadedPrintDocument[] = files.map((file, idx) => {
      const orderIndex = nextOrderIndexRef.current++;
      const customSize = (file as unknown as { virtualSizeBytes?: number })
        .virtualSizeBytes;
      const customModified = (
        file as unknown as { virtualModifiedLabel?: string }
      ).virtualModifiedLabel;

      return {
        id: `doc-${Date.now()}-${orderIndex}`,
        orderIndex,
        name: file.name,
        sizeBytes: customSize ?? file.size,
        modifiedLabel: customModified,
        pageCount: 1,
        progressPercent: idx === 0 ? 8 : 0,
        status: idx === 0 ? 'Uploading...' : 'Waiting',
        rawFile: file,
        settings: { ...globalSettings },
      };
    });

    setDocuments((prev) => [...prev, ...newDocs]);
    setIsUploadSheetOpen(true);

    let allSucceeded = true;
    for (const doc of newDocs) {
      if (uploadSessionIdRef.current !== sessionId) {
        allSucceeded = false;
        break;
      }
      if (doc.rawFile) {
        const ok = await processSingleFile(doc.id, doc.rawFile, sessionId);
        if (!ok) allSucceeded = false;
      }
    }

    // After documents upload and process successfully, open the PDF editor automatically!
    if (allSucceeded && uploadSessionIdRef.current === sessionId) {
      window.setTimeout(() => {
        if (uploadSessionIdRef.current === sessionId) {
          setIsUploadSheetOpen(false);
          setStep('editor');
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }, 350);
    }
  };

  const handleRetryDocument = async (docId: string) => {
    const target = documents.find((d) => d.id === docId);
    if (!target || !target.rawFile) return;
    const sessionId = ++uploadSessionIdRef.current;
    await processSingleFile(docId, target.rawFile, sessionId);
  };

  const handleRemoveDocument = (docId: string) => {
    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      if (next.length === 0) {
        clearPendingUploadTimers();
        setIsUploadSheetOpen(false);
        setStep('home');
      }
      return next;
    });
  };

  const handleCancelUpload = () => {
    uploadSessionIdRef.current++;
    clearPendingUploadTimers();
    setDocuments([]);
    setIsUploadSheetOpen(false);
    setStep('home');
  };

  const handleReviewDocuments = () => {
    setIsUploadSheetOpen(false);
    setStep('editor');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleUpdateGlobalSettings = (
    nextPatch: Partial<PrintDocumentSettings>
  ) => {
    setGlobalSettings((prev) => {
      const merged: PrintDocumentSettings = { ...prev, ...nextPatch };
      setDocuments((docs) => applyGlobalSettingsToDocs(docs, merged));
      return merged;
    });
  };

  const handleStartNewSession = () => {
    uploadSessionIdRef.current++;
    clearPendingUploadTimers();
    setDocuments([]);
    setIsUploadSheetOpen(false);
    setGlobalSettings(DEFAULT_SETTINGS);
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

  /**
   * Real PDF Page Removal using pdf-lib:
   * Removes confirmed blank pages from the target documents, creating updated
   * printable PDF files while preserving the original documents.
   */
  const handleRemoveBlankPages = async (
    docPagesMap: Record<string, number[]>
  ) => {
    const updatedDocs = await Promise.all(
      documents.map(async (doc) => {
        const pagesToRemove = docPagesMap[doc.id];
        if (!pagesToRemove || pagesToRemove.length === 0 || !doc.rawFile) {
          return doc;
        }

        try {
          const fileBuffer = await doc.rawFile.arrayBuffer();
          const modifiedBytes = await removePagesFromPdf(
            fileBuffer,
            pagesToRemove
          );
          const originalFile = doc.originalFile || doc.rawFile;
          const newFile = new File(
            [modifiedBytes.buffer as ArrayBuffer],
            doc.name,
            { type: 'application/pdf' }
          );

          const newPageCount = Math.max(1, doc.pageCount - pagesToRemove.length);
          const remainingBlanks = (doc.blankPages || []).filter(
            (p) => !pagesToRemove.includes(p)
          );

          return {
            ...doc,
            rawFile: newFile,
            originalFile,
            pageCount: newPageCount,
            originalPageCount: doc.originalPageCount ?? doc.pageCount,
            blankPages: remainingBlanks,
            removedBlankPages: [
              ...(doc.removedBlankPages || []),
              ...pagesToRemove,
            ],
          };
        } catch (err) {
          console.error('Failed to remove blank pages with pdf-lib:', err);
          return doc;
        }
      })
    );

    setDocuments(updatedDocs);
  };

  /**
   * Restores original untouched files and original page counts.
   */
  const handleRestoreOriginalPages = () => {
    setDocuments((prevDocs) =>
      prevDocs.map((doc) => {
        if (!doc.originalFile) return doc;
        return {
          ...doc,
          rawFile: doc.originalFile,
          pageCount: doc.originalPageCount ?? doc.pageCount,
          blankPages: doc.removedBlankPages
            ? [...(doc.blankPages || []), ...doc.removedBlankPages]
            : doc.blankPages,
          removedBlankPages: [],
        };
      })
    );
  };

  const handleReplaceDocument = async (docId: string, newFile: File) => {
    const buffer = await newFile.arrayBuffer();
    const detectedPages = detectActualPageCount(newFile.name, new Uint8Array(buffer));
    const detectedBlanks = detectBlankPagesFromBuffer(newFile.name, new Uint8Array(buffer));

    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? {
              ...d,
              rawFile: newFile,
              name: newFile.name,
              sizeBytes: newFile.size,
              pageCount: detectedPages,
              blankPages: detectedBlanks,
            }
          : d
      )
    );
  };

  const summary = calculateMultiDocPrintSummary(documents);
  const liveEstimate = calculateLivePrintEstimate(documents, globalSettings);

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex flex-col">
      {step !== 'home' && step !== 'file-browser' && step !== 'editor' && (
        <KioskHeader
          onGoHome={() => {
            setStep('home');
            setIsUploadSheetOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <main
        className={`flex-1 w-full bg-surface flex flex-col mx-auto max-w-md ${
          step === 'home' || step === 'editor' ? 'p-0' : 'pt-3.5 pb-8 px-4'
        }`}
      >
        {step === 'home' && (
          <UploadHomeStep
            onFilesSelected={handleFilesSelected}
            onOpenBrowser={() => {
              setStep('file-browser');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            isSheetOpen={isUploadSheetOpen && documents.length > 0}
          />
        )}

        {step === 'file-browser' && (
          <FileBrowserStep
            onBack={() => {
              setStep('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onConfirmFiles={handleFilesSelected}
          />
        )}

        {step === 'editor' && (
          <MobilePdfEditor
            documents={documents}
            onSaveAndContinue={(updatedDocs) => {
              setDocuments(updatedDocs);
              setStep('preferences');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onAddMoreFiles={handleFilesSelected}
            onRemoveDocument={handleRemoveDocument}
            onBack={() => {
              setStep('home');
              setIsUploadSheetOpen(false);
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
            onTogglePreviewBeforePrint={() =>
              setPreviewBeforePrint((prev) => !prev)
            }
            onUpdateGlobalSettings={handleUpdateGlobalSettings}
            onUpdateBlankPages={handleUpdateDocumentBlankPages}
            onRemoveBlankPages={handleRemoveBlankPages}
            onRestoreOriginalPages={handleRestoreOriginalPages}
            onReplaceDocument={handleReplaceDocument}
            onBack={() => {
              setStep('home');
              setIsUploadSheetOpen(true);
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            onContinueToPayment={() => {
              setStep('payment');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        )}

        {(step === 'summary' || step === 'payment') && (
          <SummaryStep
            step={step}
            summary={summary}
            estimatedTotalInr={liveEstimate.estimatedTotalInr}
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
          />
        )}
      </main>

      {/* Floating Document Upload Bottom-Sheet Popup over the Existing Mobile Website */}
      {isUploadSheetOpen && documents.length > 0 && step !== 'editor' && (
        <FloatingUploadSheet
          documents={documents}
          onAddMoreFiles={handleFilesSelected}
          onRemoveDocument={handleRemoveDocument}
          onRetryDocument={handleRetryDocument}
          onCancelUpload={handleCancelUpload}
          onReviewDocuments={handleReviewDocuments}
        />
      )}
    </div>
  );
}
