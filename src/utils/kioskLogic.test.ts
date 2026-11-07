import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectActualPageCount,
  calculateDocumentSheets,
  calculateDocumentPrice,
  calculateMultiDocPrintSummary,
  formatCurrency,
  VIRTUAL_FILES,
  filterVirtualFiles,
  detectFileFormatKind,
  buildRealFileFromVirtualItem,
  computeOverallUploadMetrics,
  getDocumentVisualState,
  validateSelectedFile,
  MAX_FILE_SIZE_BYTES,
  calculateLivePrintEstimate,
  formatInrCurrency,
  buildDocumentPageContent,
} from './kioskLogic';
import { UploadedPrintDocument } from '../types/kiosk';

test('detectActualPageCount parses actual /Type /Page objects from PDF binary data', () => {
  const rawPdfContent = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >> endobj
4 0 obj << /Type /Page /Parent 2 0 R >> endobj
5 0 obj << /Type /Page /Parent 2 0 R >> endobj
%%EOF`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(rawPdfContent);
  assert.equal(detectActualPageCount('Assignment.pdf', bytes), 3);
});

test('detectActualPageCount falls back to /Count in compressed PDF page trees', () => {
  const rawPdfContent = `%PDF-1.7\n<< /Type /Pages /Count 12 >>\n%%EOF`;
  const bytes = new TextEncoder().encode(rawPdfContent);
  assert.equal(detectActualPageCount('Assignment.pdf', bytes), 12);
});

test('calculateDocumentSheets and calculateDocumentPrice compute accurate values', () => {
  // 12 pages, 2-sided, 2 copies -> 6 sheets per copy * 2 = 12 sheets
  assert.equal(calculateDocumentSheets(12, '2-sided', 2), 12);
  // 9 pages, 2-sided, 1 copy -> ceil(9/2) = 5 sheets
  assert.equal(calculateDocumentSheets(9, '2-sided', 1), 5);
  // 12 pages, bw ($0.10), 2 copies = $2.40
  assert.equal(calculateDocumentPrice(12, 'bw', 2), 2.4);
  // 8 pages, colour ($0.30), 1 copy = $2.40
  assert.equal(calculateDocumentPrice(8, 'colour', 1), 2.4);
});

test('calculateMultiDocPrintSummary aggregates uniform and per-document settings', () => {
  const docs: UploadedPrintDocument[] = [
    {
      id: 'doc-1',
      orderIndex: 0,
      name: 'Assignment.pdf',
      sizeBytes: 245000,
      pageCount: 12,
      progressPercent: 100,
      status: 'Ready',
      settings: { colourMode: 'bw', sides: '2-sided', copies: 1, removeBlankPages: false },
    },
    {
      id: 'doc-2',
      orderIndex: 1,
      name: 'Project_Report.pdf',
      sizeBytes: 512000,
      pageCount: 8,
      progressPercent: 100,
      status: 'Ready',
      settings: { colourMode: 'bw', sides: '2-sided', copies: 1, removeBlankPages: false },
    },
  ];

  const summary = calculateMultiDocPrintSummary(docs);
  assert.equal(summary.documentCount, 2);
  assert.equal(summary.totalOriginalPages, 20);
  assert.equal(summary.colourModeLabel, 'Black & White');
  assert.equal(summary.sidesModeLabel, '2-Sided');
  assert.equal(summary.copiesLabel, '1 copy');
  assert.equal(summary.totalEstimatedSheets, 10);
  assert.equal(summary.totalPrice, 2.0);
  assert.equal(formatCurrency(summary.totalPrice), '$2.00');
});

test('filterVirtualFiles filters by category, folder, and search query', () => {
  const recentFiles = filterVirtualFiles(VIRTUAL_FILES, 'recent', null, '');
  assert.ok(recentFiles.some((f) => f.name === 'Assignment_01.pdf'));
  assert.ok(recentFiles.some((f) => f.name === 'Project_Report.pdf'));

  const pdfOnly = filterVirtualFiles(VIRTUAL_FILES, 'pdfs', null, '');
  assert.ok(pdfOnly.every((f) => f.formatKind === 'pdf'));

  const assignmentFolder = filterVirtualFiles(VIRTUAL_FILES, 'recent', 'assignments', '');
  assert.equal(assignmentFolder.length, 2);
  assert.ok(assignmentFolder.every((f) => f.folderId === 'assignments'));

  const searchMatch = filterVirtualFiles(VIRTUAL_FILES, 'recent', null, 'Resume');
  assert.equal(searchMatch.length, 1);
  assert.equal(searchMatch[0].name, 'Resume.pdf');
});

test('detectFileFormatKind classifies PDF, Word, Excel, Presentation, and Image files accurately', () => {
  assert.equal(detectFileFormatKind('Assignment_01.pdf'), 'pdf');
  assert.equal(detectFileFormatKind('Course_Outline_Notes.docx'), 'word');
  assert.equal(detectFileFormatKind('Lab_Equipment_Schedule.xlsx'), 'excel');
  assert.equal(detectFileFormatKind('Pitch_Deck.pptx'), 'presentation');
  assert.equal(detectFileFormatKind('System_Diagram_A4.png'), 'image');
  assert.equal(detectFileFormatKind('Readme.txt'), 'text');
});

test('validateSelectedFile accepts all supported extensions and rejects unsupported or invalid sizes', () => {
  const supportedSamples = [
    'doc.pdf',
    'notes.doc',
    'notes.docx',
    'sheet.xls',
    'sheet.xlsx',
    'slides.ppt',
    'slides.pptx',
    'photo.jpg',
    'photo.jpeg',
    'scan.png',
    'readme.txt',
  ];
  for (const name of supportedSamples) {
    assert.equal(validateSelectedFile(name, 1024).valid, true, `Should accept ${name}`);
  }

  const badExt = validateSelectedFile('archive.zip', 2048);
  assert.equal(badExt.valid, false);
  assert.ok(badExt.error?.includes('Unsupported file'));

  const emptyFile = validateSelectedFile('Assignment.pdf', 0);
  assert.equal(emptyFile.valid, false);
  assert.ok(emptyFile.error?.includes('empty'));

  const oversizedFile = validateSelectedFile('Huge.pdf', MAX_FILE_SIZE_BYTES + 1);
  assert.equal(oversizedFile.valid, false);
  assert.ok(oversizedFile.error?.includes('100 MB'));
});

test('buildRealFileFromVirtualItem creates binary File with detectable PDF page count', async () => {
  const item = VIRTUAL_FILES[0]; // Assignment_01.pdf (12 pages)
  const realFile = buildRealFileFromVirtualItem(item);
  const buffer = new Uint8Array(await realFile.arrayBuffer());
  assert.equal(detectActualPageCount(realFile.name, buffer), 12);
});

test('computeOverallUploadMetrics and getDocumentVisualState track 5 progress states', () => {
  assert.equal(getDocumentVisualState('Waiting'), 'Waiting');
  assert.equal(getDocumentVisualState('Uploading...'), 'Uploading');
  assert.equal(getDocumentVisualState('Processing document...'), 'Processing');
  assert.equal(getDocumentVisualState('Ready'), 'Completed');
  assert.equal(getDocumentVisualState('Failed'), 'Failed');

  const docs: UploadedPrintDocument[] = [
    {
      id: 'd1',
      orderIndex: 0,
      name: 'Assignment_01.pdf',
      sizeBytes: 1420000,
      pageCount: 12,
      progressPercent: 100,
      status: 'Ready',
      settings: { colourMode: 'bw', sides: '1-sided', copies: 1, removeBlankPages: false },
    },
    {
      id: 'd2',
      orderIndex: 1,
      name: 'Project_Report.pdf',
      sizeBytes: 2180000,
      pageCount: 8,
      progressPercent: 100,
      status: 'Ready',
      settings: { colourMode: 'bw', sides: '1-sided', copies: 1, removeBlankPages: false },
    },
    {
      id: 'd3',
      orderIndex: 2,
      name: 'Resume.pdf',
      sizeBytes: 428000,
      pageCount: 2,
      progressPercent: 4,
      status: 'Uploading...',
      settings: { colourMode: 'bw', sides: '1-sided', copies: 1, removeBlankPages: false },
    },
  ];

  const metrics = computeOverallUploadMetrics(docs);
  assert.equal(metrics.totalCount, 3);
  assert.equal(metrics.completedCount, 2);
  assert.equal(metrics.overallPercent, 68);
  assert.equal(metrics.overallState, 'Uploading');
  assert.equal(metrics.activeDocumentName, 'Resume.pdf');
});

test('calculateLivePrintEstimate updates dynamically across B&W/Colour, 1-Sided/2-Sided, and Copies', () => {
  const docs: UploadedPrintDocument[] = [
    {
      id: 'd1',
      orderIndex: 0,
      name: 'Smart_City_Project_Report.pdf',
      sizeBytes: 277000,
      pageCount: 14,
      progressPercent: 100,
      status: 'Ready',
      settings: { colourMode: 'bw', sides: '1-sided', copies: 1, removeBlankPages: false },
    },
  ];

  // 14 pages, 1-sided, B&W (₹1/page), 1 copy -> ₹14
  const bw1Sided = calculateLivePrintEstimate(docs, {
    colourMode: 'bw',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: false,
  });
  assert.equal(bw1Sided.totalOriginalPages, 14);
  assert.equal(bw1Sided.estimatedTotalInr, 14);
  assert.equal(formatInrCurrency(bw1Sided.estimatedTotalInr), '₹14');

  // 14 pages, 1-sided, Colour (₹3/page), 1 copy -> ₹42
  const col1Sided = calculateLivePrintEstimate(docs, {
    colourMode: 'colour',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: false,
  });
  assert.equal(col1Sided.estimatedTotalInr, 42);

  // 14 pages, 2-sided (7 duplex sheets * ₹1.5 = ₹10.50), 2 copies -> ₹21
  const bw2SidedCopies2 = calculateLivePrintEstimate(docs, {
    colourMode: 'bw',
    sides: '2-sided',
    copies: 2,
    removeBlankPages: false,
  });
  assert.equal(bw2SidedCopies2.totalSheets, 14);
  assert.equal(bw2SidedCopies2.estimatedTotalInr, 21);

  const page1 = buildDocumentPageContent('Smart_City_Project_Report.pdf', 1, 14);
  assert.equal(page1.pageNumber, 1);
  assert.equal(page1.totalPages, 14);
  assert.ok(page1.documentTitle.includes('Smart City Project Report'));
});

test('calculateLivePrintEstimate detects blank pages and calculates paper and monetary savings when removeBlankPages is true', () => {
  const docWithBlank: UploadedPrintDocument = {
    id: 'doc-blank-1',
    orderIndex: 0,
    name: 'Smart_City_Project_Report.pdf',
    sizeBytes: 277000,
    pageCount: 14,
    blankPages: [4],
    progressPercent: 100,
    status: 'Ready',
    settings: { colourMode: 'bw', sides: '1-sided', copies: 1, removeBlankPages: true },
  };

  // 14 pages - 1 blank page = 13 printed pages -> ₹13 (saves ₹1 and 1 sheet)
  const estimateWithRemoval = calculateLivePrintEstimate([docWithBlank], {
    colourMode: 'bw',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: true,
  });

  assert.equal(estimateWithRemoval.totalOriginalPages, 14);
  assert.equal(estimateWithRemoval.totalBlankPagesCount, 1);
  assert.equal(estimateWithRemoval.totalPrintedPages, 13);
  assert.equal(estimateWithRemoval.totalSheets, 13);
  assert.equal(estimateWithRemoval.estimatedTotalInr, 13);
  assert.equal(estimateWithRemoval.removedBlankPagesSavedInr, 1);
  assert.equal(estimateWithRemoval.removedBlankPagesSavedSheets, 1);

  // When removeBlankPages is toggled false: full 14 pages -> ₹14
  const estimateWithoutRemoval = calculateLivePrintEstimate([docWithBlank], {
    colourMode: 'bw',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: false,
  });

  assert.equal(estimateWithoutRemoval.totalPrintedPages, 14);
  assert.equal(estimateWithoutRemoval.estimatedTotalInr, 14);
  assert.equal(estimateWithoutRemoval.removedBlankPagesSavedInr, 0);
});


