import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProcessingStages,
  classifyProcessingError,
  computeProcessingProgressSummary,
  documentRequiresConversion,
  reconcileRecoveredDocument,
} from './processingRecovery';
import { UploadedPrintDocument } from '../types/kiosk';

const baseSettings = {
  colourMode: 'bw' as const,
  sides: '1-sided' as const,
  copies: 1,
  removeBlankPages: true,
};

function makeDoc(
  overrides: Partial<UploadedPrintDocument> = {}
): UploadedPrintDocument {
  return {
    id: 'doc-1',
    orderIndex: 0,
    name: 'Lecture_Notes.pdf',
    sizeBytes: 1000,
    uploadedBytes: 0,
    pageCount: 4,
    progressPercent: 0,
    status: 'Uploading...',
    processingStage: 'uploading',
    requiresConversion: false,
    settings: baseSettings,
    ...overrides,
  };
}

test('buildProcessingStages omits Converting Documents when only native PDFs are queued', () => {
  const pdfDoc = makeDoc({ name: 'Syllabus.pdf', requiresConversion: false });
  const stages = buildProcessingStages([pdfDoc]);
  assert.deepEqual(
    stages.map((s) => s.id),
    ['uploading', 'validating', 'preparing', 'ready']
  );
  assert.equal(documentRequiresConversion('Syllabus.pdf'), false);
  assert.equal(documentRequiresConversion('Scan.png'), true);
});

test('buildProcessingStages includes Converting Documents when any non-PDF file is queued', () => {
  const pdfDoc = makeDoc({
    id: 'd1',
    name: 'Syllabus.pdf',
    requiresConversion: false,
    status: 'Ready',
    processingStage: 'ready',
  });
  const imgDoc = makeDoc({
    id: 'd2',
    name: 'Notes_Photo.png',
    requiresConversion: true,
    status: 'Processing document...',
    processingStage: 'converting',
  });
  const stages = buildProcessingStages([pdfDoc, imgDoc]);
  assert.deepEqual(
    stages.map((s) => s.id),
    ['uploading', 'validating', 'converting', 'preparing', 'ready']
  );
  assert.equal(stages[0].status, 'completed');
  assert.equal(stages[1].status, 'completed');
  assert.equal(stages[2].status, 'active');
});

test('computeProcessingProgressSummary only emits determinate percent for measurable tasks', () => {
  // Byte-level upload stage -> genuine determinate percent
  const uploadingDoc = makeDoc({
    sizeBytes: 2000,
    uploadedBytes: 1000,
    processingStage: 'uploading',
    status: 'Uploading...',
  });
  const uploadProgress = computeProcessingProgressSummary([uploadingDoc]);
  assert.equal(uploadProgress.mode, 'determinate');
  assert.equal(uploadProgress.percent, 50);

  // Validation stage -> indeterminate (no invented percentage)
  const validatingDoc = makeDoc({
    sizeBytes: 2000,
    uploadedBytes: 2000,
    processingStage: 'validating',
    status: 'Processing document...',
  });
  const validationProgress = computeProcessingProgressSummary([validatingDoc]);
  assert.equal(validationProgress.mode, 'indeterminate');

  // Conversion stage -> indeterminate (no invented percentage)
  const convertingDoc = makeDoc({
    name: 'Photo.jpg',
    requiresConversion: true,
    processingStage: 'converting',
    status: 'Processing document...',
  });
  const conversionProgress = computeProcessingProgressSummary([convertingDoc]);
  assert.equal(conversionProgress.mode, 'indeterminate');

  // Preparing pages with real page scan progress -> genuine determinate percent
  const preparingDoc = makeDoc({
    processingStage: 'preparing',
    status: 'Preparing preview...',
    pageCount: 10,
    pageScanProgress: { current: 3, total: 10 },
  });
  const preparingProgress = computeProcessingProgressSummary([preparingDoc]);
  assert.equal(preparingProgress.mode, 'determinate');
  assert.equal(preparingProgress.percent, 30);

  // All ready -> complete with total pages
  const readyDoc = makeDoc({
    processingStage: 'ready',
    status: 'Ready',
    pageCount: 10,
    progressPercent: 100,
  });
  const readyProgress = computeProcessingProgressSummary([readyDoc]);
  assert.equal(readyProgress.mode, 'complete');
  assert.equal(readyProgress.totalPages, 10);
});

test('classifyProcessingError keeps non-retryable errors non-retryable and names the file', () => {
  const locked = classifyProcessingError('password-protected', 'Secret_Tax.pdf');
  assert.equal(locked.retryable, false);
  assert.ok(locked.message.includes('Secret_Tax.pdf'));

  const unsupported = classifyProcessingError('unsupported', 'Archive.zip');
  assert.equal(unsupported.retryable, false);
  assert.ok(unsupported.message.includes('Archive.zip'));

  const offline = classifyProcessingError('network-offline', 'Report.docx');
  assert.equal(offline.retryable, true);
  assert.ok(offline.message.includes('Report.docx'));
});

test('reconcileRecoveredDocument restores ready files, resumes cached uploads, and flags missing blobs honestly', () => {
  const file = new File(['%PDF-1.4\n%%EOF'], 'Recovered.pdf', {
    type: 'application/pdf',
  });

  // 1. Ready document with cached blob restores directly
  const readySnap = {
    ...makeDoc({
      status: 'Ready',
      processingStage: 'ready',
      pageCount: 6,
      progressPercent: 100,
    }),
  };
  const readyRes = reconcileRecoveredDocument(readySnap, {
    rawFile: file,
    originalFile: file,
  });
  assert.equal(readyRes.needsResume, false);
  assert.equal(readyRes.doc.status, 'Ready');
  assert.equal(readyRes.doc.rawFile?.name, 'Recovered.pdf');

  // 2. Interrupted mid-validation WITH cached raw blob queues for clean resume
  const midSnap = {
    ...makeDoc({
      status: 'Processing document...',
      processingStage: 'validating',
    }),
  };
  const resumeRes = reconcileRecoveredDocument(midSnap, {
    rawFile: file,
    originalFile: file,
  });
  assert.equal(resumeRes.needsResume, true);
  assert.equal(resumeRes.doc.status, 'Waiting');

  // 3. Interrupted WITHOUT cached blob is flagged honestly as failed (non-retryable without file)
  const lostRes = reconcileRecoveredDocument(midSnap, {});
  assert.equal(lostRes.needsResume, false);
  assert.equal(lostRes.doc.status, 'Failed');
  assert.equal(lostRes.doc.errorCode, 'interrupted');
  assert.equal(lostRes.doc.retryable, false);
});
