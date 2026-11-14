import {
  PrintDocumentSettings,
  ProcessingErrorCode,
  ProcessingStageId,
  UploadedPrintDocument,
  WorkflowStep,
} from '../types/kiosk';
import { formatFileSize } from './kioskLogic';

export type StepVisualStatus = 'completed' | 'active' | 'pending' | 'error';

export interface ProcessingStageViewItem {
  id: Exclude<ProcessingStageId, 'failed'>;
  title: string;
  description: string;
  status: StepVisualStatus;
}

export interface ProcessingProgressSummary {
  mode: 'determinate' | 'indeterminate' | 'complete' | 'error';
  percent: number;
  activeStageId: ProcessingStageId;
  activeStageTitle: string;
  detailLabel: string;
  totalFiles: number;
  readyFiles: number;
  failedFiles: number;
  inFlightFiles: number;
  totalPages: number;
}

export interface ErrorClassification {
  title: string;
  message: string;
  retryable: boolean;
}

export interface PersistedDocumentSnapshot {
  id: string;
  orderIndex: number;
  name: string;
  sizeBytes: number;
  uploadedBytes?: number;
  lastModified?: number;
  pageCount: number;
  originalPageCount?: number;
  blankPages?: number[];
  removedBlankPages?: number[];
  uncertainPages?: number[];
  progressPercent: number;
  status: UploadedPrintDocument['status'];
  processingStage?: ProcessingStageId;
  errorCode?: ProcessingErrorCode;
  errorMessage?: string;
  retryable?: boolean;
  requiresConversion?: boolean;
  conversionStatus?: UploadedPrintDocument['conversionStatus'];
  conversionError?: string;
  pageRotations?: Record<number, number>;
  removedPages?: number[];
  keptBlankPages?: number[];
  modifiedLabel?: string;
  storagePath?: string;
  serverDocId?: string;
  convertedPdfUrl?: string;
  expiresAt?: number;
  kioskId?: string;
  kioskName?: string;
  sessionToken?: string;
  settings: PrintDocumentSettings;
}

export interface PersistedProcessingSnapshot {
  version: 1;
  savedAt: number;
  step: WorkflowStep;
  globalSettings: PrintDocumentSettings;
  documents: PersistedDocumentSnapshot[];
}

export interface RestoredBlobBundle {
  rawFile?: File;
  originalFile?: File;
  convertedPdfFile?: File;
}

export const PROCESSING_SNAPSHOT_KEY = 'printpoint_processing_state_v1';
const DB_NAME = 'printpoint_session_store_v1';
const STORE_NAME = 'document_blobs';
const DB_VERSION = 1;

export function documentRequiresConversion(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return !lower.endsWith('.pdf');
}

export function classifyProcessingError(
  code: ProcessingErrorCode,
  fileName: string,
  detail?: string
): ErrorClassification {
  switch (code) {
    case 'password-protected':
      return {
        title: 'Password-protected PDF',
        message:
          detail ||
          `"${fileName}" is locked with a password. Remove password protection from the PDF and select it again.`,
        retryable: false,
      };
    case 'unsupported':
      return {
        title: 'Unsupported file format',
        message:
          detail ||
          `"${fileName}" is not a supported document format or exceeds the 100 MB limit.`,
        retryable: false,
      };
    case 'corrupted':
      return {
        title: 'Corrupted or unreadable file',
        message:
          detail ||
          `"${fileName}" could not be read because the file appears damaged or empty.`,
        retryable: false,
      };
    case 'conversion-failed':
      return {
        title: 'Document conversion failed',
        message:
          detail ||
          `Could not convert "${fileName}" into a print-ready PDF. Save or export it as a PDF and try again.`,
        retryable: false,
      };
    case 'network-offline':
      return {
        title: 'Connection lost',
        message:
          detail ||
          `Network connection was lost while preparing "${fileName}". Reconnect to the internet and tap Retry.`,
        retryable: true,
      };
    case 'session-expired':
      return {
        title: 'Kiosk session expired',
        message:
          detail ||
          `Your kiosk session expired while preparing "${fileName}". Reconnect to a kiosk and retry.`,
        retryable: true,
      };
    case 'storage-failed':
      return {
        title: 'Session storage failed',
        message:
          detail ||
          `Could not save "${fileName}" to your session storage. Free up device space and tap Retry.`,
        retryable: true,
      };
    case 'interrupted':
    default:
      return {
        title: 'Upload interrupted',
        message:
          detail ||
          `Processing of "${fileName}" was interrupted before completion.`,
        retryable: true,
      };
  }
}

const STAGE_ORDER: Array<Exclude<ProcessingStageId, 'failed'>> = [
  'uploading',
  'validating',
  'converting',
  'preparing',
  'ready',
];

function getDocumentStageIndex(
  doc: UploadedPrintDocument,
  includeConversion: boolean
): number {
  if (doc.status === 'Ready' || doc.processingStage === 'ready') {
    return includeConversion ? 4 : 3;
  }

  let stage: Exclude<ProcessingStageId, 'failed'>;
  if (doc.processingStage && doc.processingStage !== 'failed') {
    stage = doc.processingStage;
  } else if (doc.status === 'Uploading...' || doc.status === 'Waiting') {
    stage = 'uploading';
  } else if (doc.status === 'Processing document...') {
    stage = 'validating';
  } else if (doc.status === 'Preparing preview...') {
    stage = 'preparing';
  } else {
    stage = 'uploading';
  }

  if (!includeConversion) {
    if (stage === 'uploading') return 0;
    if (stage === 'validating' || stage === 'converting') return 1;
    if (stage === 'preparing') return 2;
    return 3;
  }

  return STAGE_ORDER.indexOf(stage);
}

export function buildProcessingStages(
  docs: UploadedPrintDocument[]
): ProcessingStageViewItem[] {
  const includeConversion = docs.some(
    (d) => d.requiresConversion ?? documentRequiresConversion(d.name)
  );

  const stageDefinitions: Array<{
    id: Exclude<ProcessingStageId, 'failed'>;
    title: string;
    description: string;
  }> = [
    {
      id: 'uploading',
      title: 'Uploading Files',
      description: 'Transferring documents into your print session.',
    },
    {
      id: 'validating',
      title: 'Validating Documents',
      description: 'Checking format, size, and PDF file integrity.',
    },
    ...(includeConversion
      ? [
          {
            id: 'converting' as const,
            title: 'Converting Documents',
            description: 'Converting supported non-PDF files into print-ready PDFs.',
          },
        ]
      : []),
    {
      id: 'preparing',
      title: 'Preparing Pages',
      description: 'Reading real page counts and checking blank pages.',
    },
    {
      id: 'ready',
      title: 'Ready to Print',
      description: 'All documents verified and ready for print settings.',
    },
  ];

  if (docs.length === 0) {
    return stageDefinitions.map((def, idx) => ({
      ...def,
      status: idx === 0 ? 'active' : 'pending',
    }));
  }

  const failedDocs = docs.filter((d) => d.status === 'Failed');
  const activeDocs = docs.filter(
    (d) => d.status !== 'Ready' && d.status !== 'Failed'
  );
  const readyDocs = docs.filter((d) => d.status === 'Ready');

  if (activeDocs.length === 0 && failedDocs.length === 0 && readyDocs.length > 0) {
    return stageDefinitions.map((def) => ({
      ...def,
      status: 'completed',
    }));
  }

  if (activeDocs.length > 0) {
    const minActiveIdx = Math.min(
      ...activeDocs.map((d) => getDocumentStageIndex(d, includeConversion))
    );
    return stageDefinitions.map((def, idx) => ({
      ...def,
      status:
        idx < minActiveIdx
          ? 'completed'
          : idx === minActiveIdx
            ? 'active'
            : 'pending',
    }));
  }

  // Only failed docs (and possibly ready docs) remain
  const minFailedIdx = Math.min(
    ...failedDocs.map((d) => getDocumentStageIndex(d, includeConversion))
  );
  return stageDefinitions.map((def, idx) => ({
    ...def,
    status:
      idx < minFailedIdx
        ? 'completed'
        : idx === minFailedIdx
          ? 'error'
          : 'pending',
  }));
}

export function computeProcessingProgressSummary(
  docs: UploadedPrintDocument[]
): ProcessingProgressSummary {
  const totalFiles = docs.length;
  const readyDocs = docs.filter((d) => d.status === 'Ready');
  const failedDocs = docs.filter((d) => d.status === 'Failed');
  const activeDocs = docs.filter(
    (d) => d.status !== 'Ready' && d.status !== 'Failed'
  );
  const totalPages = readyDocs.reduce(
    (sum, doc) => sum + Math.max(1, doc.pageCount),
    0
  );

  const stages = buildProcessingStages(docs);
  const activeStage = stages.find((s) => s.status === 'active');
  const errorStage = stages.find((s) => s.status === 'error');

  if (totalFiles > 0 && activeDocs.length === 0 && failedDocs.length === 0) {
    return {
      mode: 'complete',
      percent: 100,
      activeStageId: 'ready',
      activeStageTitle: 'Ready to Print',
      detailLabel: `${readyDocs.length} ${
        readyDocs.length === 1 ? 'document' : 'documents'
      } verified (${totalPages} ${totalPages === 1 ? 'page' : 'pages'})`,
      totalFiles,
      readyFiles: readyDocs.length,
      failedFiles: 0,
      inFlightFiles: 0,
      totalPages,
    };
  }

  if (activeDocs.length === 0 && failedDocs.length > 0) {
    return {
      mode: 'error',
      percent: 0,
      activeStageId: errorStage?.id ?? 'failed',
      activeStageTitle: errorStage?.title ?? 'Action Needed',
      detailLabel:
        readyDocs.length > 0
          ? `${failedDocs.length} failed · ${readyDocs.length} ready to print`
          : `${failedDocs.length} ${
              failedDocs.length === 1 ? 'file needs' : 'files need'
            } attention`,
      totalFiles,
      readyFiles: readyDocs.length,
      failedFiles: failedDocs.length,
      inFlightFiles: 0,
      totalPages,
    };
  }

  const stageId = activeStage?.id ?? 'uploading';
  const stageTitle = activeStage?.title ?? 'Uploading Files';

  // Determinate progress ONLY when reading real file bytes or scanning exact pages
  if (stageId === 'uploading') {
    const uploadingDocs = docs.filter(
      (d) => d.status !== 'Failed' && d.sizeBytes > 0
    );
    const totalBytes = uploadingDocs.reduce((sum, d) => sum + d.sizeBytes, 0);
    const transferredBytes = uploadingDocs.reduce((sum, d) => {
      if (d.status === 'Ready' || (d.processingStage && d.processingStage !== 'uploading')) {
        return sum + d.sizeBytes;
      }
      return sum + Math.min(d.sizeBytes, Math.max(0, d.uploadedBytes ?? 0));
    }, 0);

    if (totalBytes > 0) {
      const percent = Math.max(
        0,
        Math.min(100, Math.round((transferredBytes / totalBytes) * 100))
      );
      return {
        mode: 'determinate',
        percent,
        activeStageId: 'uploading',
        activeStageTitle: 'Uploading Files',
        detailLabel: `${formatFileSize(transferredBytes)} of ${formatFileSize(totalBytes)}`,
        totalFiles,
        readyFiles: readyDocs.length,
        failedFiles: failedDocs.length,
        inFlightFiles: activeDocs.length,
        totalPages,
      };
    }
  }

  if (stageId === 'preparing') {
    const scanningDoc = activeDocs.find(
      (d) => d.pageScanProgress && d.pageScanProgress.total > 0
    );
    if (scanningDoc?.pageScanProgress) {
      const { current, total } = scanningDoc.pageScanProgress;
      const percent = Math.max(
        0,
        Math.min(100, Math.round((current / total) * 100))
      );
      return {
        mode: 'determinate',
        percent,
        activeStageId: 'preparing',
        activeStageTitle: 'Preparing Pages',
        detailLabel: `Analyzing page ${current} of ${total} in ${scanningDoc.name}`,
        totalFiles,
        readyFiles: readyDocs.length,
        failedFiles: failedDocs.length,
        inFlightFiles: activeDocs.length,
        totalPages,
      };
    }
  }

  // Indeterminate indicator whenever a local/backend stage has no byte-level percentage
  const activeFile = activeDocs[0];
  return {
    mode: 'indeterminate',
    percent: 0,
    activeStageId: stageId,
    activeStageTitle: stageTitle,
    detailLabel: activeFile
      ? `${stageTitle} · ${activeFile.name}`
      : stageTitle,
    totalFiles,
    readyFiles: readyDocs.length,
    failedFiles: failedDocs.length,
    inFlightFiles: activeDocs.length,
    totalPages,
  };
}

export function reconcileRecoveredDocument(
  snap: PersistedDocumentSnapshot,
  blobs: RestoredBlobBundle
): { doc: UploadedPrintDocument; needsResume: boolean } {
  const baseDoc: UploadedPrintDocument = {
    ...snap,
    rawFile: blobs.rawFile,
    originalFile: blobs.originalFile,
    convertedPdfFile: blobs.convertedPdfFile,
    isAnalyzingBlanks: false,
  };

  if (snap.status === 'Failed') {
    const canRetry = Boolean(snap.retryable && (blobs.originalFile || blobs.rawFile));
    return {
      doc: {
        ...baseDoc,
        status: 'Failed',
        processingStage: 'failed',
        retryable: canRetry,
      },
      needsResume: false,
    };
  }

  // Prefer edited rawFile when it is already a printable PDF; fallback to convertedPdfFile/originalFile
  const rawIsPdf =
    Boolean(blobs.rawFile) &&
    (blobs.rawFile!.type === 'application/pdf' ||
      blobs.rawFile!.name.toLowerCase().endsWith('.pdf'));
  const usablePrintFile =
    (rawIsPdf ? blobs.rawFile : undefined) ||
    blobs.convertedPdfFile ||
    blobs.rawFile ||
    blobs.originalFile;

  if (snap.status === 'Ready' && usablePrintFile) {
    return {
      doc: {
        ...baseDoc,
        rawFile: usablePrintFile,
        convertedPdfFile: rawIsPdf ? usablePrintFile : blobs.convertedPdfFile,
        originalFile: blobs.originalFile || usablePrintFile,
        status: 'Ready',
        processingStage: 'ready',
        progressPercent: 100,
      },
      needsResume: false,
    };
  }

  const resumableSource = blobs.originalFile || blobs.rawFile;
  if (resumableSource) {
    return {
      doc: {
        ...baseDoc,
        rawFile: resumableSource,
        originalFile: resumableSource,
        status: 'Waiting',
        processingStage: 'validating',
        progressPercent: 0,
        errorMessage: undefined,
        errorCode: undefined,
      },
      needsResume: true,
    };
  }

  const error = classifyProcessingError(
    'interrupted',
    snap.name,
    `Processing of "${snap.name}" was interrupted when the page refreshed. Remove this file and select it again.`
  );

  return {
    doc: {
      ...baseDoc,
      status: 'Failed',
      processingStage: 'failed',
      errorCode: 'interrupted',
      errorMessage: error.message,
      retryable: false,
      progressPercent: 0,
    },
    needsResume: false,
  };
}

export function serializeDocumentSnapshot(
  doc: UploadedPrintDocument
): PersistedDocumentSnapshot {
  return {
    id: doc.id,
    orderIndex: doc.orderIndex,
    name: doc.name,
    sizeBytes: doc.sizeBytes,
    uploadedBytes: doc.uploadedBytes,
    lastModified: doc.lastModified,
    pageCount: doc.pageCount,
    originalPageCount: doc.originalPageCount,
    blankPages: doc.blankPages,
    removedBlankPages: doc.removedBlankPages,
    uncertainPages: doc.uncertainPages,
    progressPercent: doc.progressPercent,
    status: doc.status,
    processingStage: doc.processingStage,
    errorCode: doc.errorCode,
    errorMessage: doc.errorMessage,
    retryable: doc.retryable,
    requiresConversion: doc.requiresConversion,
    conversionStatus: doc.conversionStatus,
    conversionError: doc.conversionError,
    pageRotations: doc.pageRotations,
    removedPages: doc.removedPages,
    keptBlankPages: doc.keptBlankPages,
    modifiedLabel: doc.modifiedLabel,
    storagePath: doc.storagePath,
    serverDocId: doc.serverDocId,
    convertedPdfUrl: doc.convertedPdfUrl,
    expiresAt: doc.expiresAt,
    kioskId: doc.kioskId,
    kioskName: doc.kioskName,
    sessionToken: doc.sessionToken,
    settings: doc.settings,
  };
}

export function saveProcessingSnapshot(
  step: WorkflowStep,
  globalSettings: PrintDocumentSettings,
  documents: UploadedPrintDocument[]
): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    if (documents.length === 0) {
      sessionStorage.removeItem(PROCESSING_SNAPSHOT_KEY);
      return true;
    }
    const payload: PersistedProcessingSnapshot = {
      version: 1,
      savedAt: Date.now(),
      step,
      globalSettings,
      documents: documents.map(serializeDocumentSnapshot),
    };
    sessionStorage.setItem(PROCESSING_SNAPSHOT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadProcessingSnapshot(): PersistedProcessingSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PROCESSING_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProcessingSnapshot;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.documents) ||
      parsed.documents.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearProcessingSnapshot(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PROCESSING_SNAPSHOT_KEY);
  } catch {
    // Ignore storage clear errors
  }
}

function openBlobDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open session file store'));
  });
}

export async function saveDocumentBlobs(
  docId: string,
  blobs: RestoredBlobBundle
): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openBlobDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (blobs.rawFile) store.put(blobs.rawFile, `${docId}::raw`);
      if (blobs.originalFile) store.put(blobs.originalFile, `${docId}::original`);
      if (blobs.convertedPdfFile)
        store.put(blobs.convertedPdfFile, `${docId}::converted`);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('Failed to store document blob'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadDocumentBlobs(
  docIds: string[]
): Promise<Record<string, RestoredBlobBundle>> {
  const result: Record<string, RestoredBlobBundle> = {};
  if (typeof indexedDB === 'undefined' || docIds.length === 0) return result;
  try {
    const db = await openBlobDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const getKey = (key: string): Promise<File | undefined> =>
        new Promise((res) => {
          const req = store.get(key);
          req.onsuccess = () =>
            res(req.result instanceof File ? req.result : undefined);
          req.onerror = () => res(undefined);
        });

      void Promise.all(
        docIds.map(async (id) => {
          const [rawFile, originalFile, convertedPdfFile] = await Promise.all([
            getKey(`${id}::raw`),
            getKey(`${id}::original`),
            getKey(`${id}::converted`),
          ]);
          result[id] = { rawFile, originalFile, convertedPdfFile };
        })
      ).then(() => resolve());

      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Return partial/empty bundles cleanly on IndexedDB errors
  }
  return result;
}

export async function removeDocumentBlobs(docId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openBlobDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(`${docId}::raw`);
      store.delete(`${docId}::original`);
      store.delete(`${docId}::converted`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore cleanup failures
  }
}

export async function clearDocumentBlobs(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openBlobDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore cleanup failures
  }
}
