import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  createValidPdfBinary,
  calculateLivePrintEstimate,
  calculateMultiDocPrintSummary,
} from './kioskLogic';
import { removePagesFromPdf } from './blankPageDetector';
import { UploadedPrintDocument, PrintDocumentSettings } from '../types/kiosk';

describe('Real Blank Page Detection & Removal End-to-End Workflow', () => {
  const defaultSettings: PrintDocumentSettings = {
    colourMode: 'bw',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: true,
  };

  it('detects blank pages, removes them via pdf-lib, and verifies synchronized document updates', async () => {
    // 1. Create a 4-page PDF where page 4 is blank
    const originalPdfBytes = createValidPdfBinary('Test_Doc.pdf', 4, [4]);
    const originalFile = new File([originalPdfBytes.buffer as ArrayBuffer], 'Test_Doc.pdf', {
      type: 'application/pdf',
    });

    const doc: UploadedPrintDocument = {
      id: 'doc-1',
      orderIndex: 0,
      name: 'Test_Doc.pdf',
      sizeBytes: originalPdfBytes.length,
      pageCount: 4,
      originalPageCount: 4,
      blankPages: [4],
      progressPercent: 100,
      status: 'Ready',
      rawFile: originalFile,
      originalFile: originalFile,
      settings: { ...defaultSettings },
    };

    // 2. Initial state: 4 pages total
    const initialEstimate = calculateLivePrintEstimate([doc], defaultSettings);
    assert.equal(initialEstimate.totalOriginalPages, 4);

    // 3. User reviews and removes page 4 using pdf-lib
    const modifiedBytes = await removePagesFromPdf(originalPdfBytes, [4]);
    const updatedPdfDoc = await PDFDocument.load(modifiedBytes);
    assert.equal(updatedPdfDoc.getPageCount(), 3);

    const updatedFile = new File([modifiedBytes.buffer as ArrayBuffer], 'Test_Doc.pdf', {
      type: 'application/pdf',
    });

    const updatedDoc: UploadedPrintDocument = {
      ...doc,
      rawFile: updatedFile,
      pageCount: 3,
      blankPages: [],
      removedBlankPages: [4],
    };

    // 4. Verify preview and print calculations synchronized
    const postRemovalEstimate = calculateLivePrintEstimate([updatedDoc], defaultSettings);
    assert.equal(postRemovalEstimate.totalPrintedPages, 3);
    assert.equal(postRemovalEstimate.totalSheets, 3);
    assert.equal(postRemovalEstimate.estimatedTotalInr, 3); // 3 pages * ₹1 = ₹3

    // 5. Test MultiDocPrintSummary
    const summary = calculateMultiDocPrintSummary([updatedDoc]);
    assert.equal(summary.totalEstimatedSheets, 3);
    assert.equal(summary.totalPrice, 0.30); // 3 pages * 0.10 standard
  });

  it('handles multiple documents with blank pages independently and preserves non-affected documents', async () => {
    // Doc 1: 8 pages with page 4 blank
    const doc1Bytes = createValidPdfBinary('Report.pdf', 8, [4]);
    // Doc 2: 2 pages with page 2 blank
    const doc2Bytes = createValidPdfBinary('Resume.pdf', 2, [2]);

    const doc1: UploadedPrintDocument = {
      id: 'doc-1',
      orderIndex: 0,
      name: 'Report.pdf',
      sizeBytes: doc1Bytes.length,
      pageCount: 8,
      originalPageCount: 8,
      blankPages: [4],
      progressPercent: 100,
      status: 'Ready',
      rawFile: new File([doc1Bytes.buffer as ArrayBuffer], 'Report.pdf'),
      settings: { ...defaultSettings },
    };

    const doc2: UploadedPrintDocument = {
      id: 'doc-2',
      orderIndex: 1,
      name: 'Resume.pdf',
      sizeBytes: doc2Bytes.length,
      pageCount: 2,
      originalPageCount: 2,
      blankPages: [2],
      progressPercent: 100,
      status: 'Ready',
      rawFile: new File([doc2Bytes.buffer as ArrayBuffer], 'Resume.pdf'),
      settings: { ...defaultSettings },
    };

    // Before removal: 8 + 2 = 10 pages total
    const preEstimate = calculateLivePrintEstimate([doc1, doc2], defaultSettings);
    assert.equal(preEstimate.totalOriginalPages, 10);

    // Remove page 4 from Doc 1 and page 2 from Doc 2
    const doc1UpdatedBytes = await removePagesFromPdf(doc1Bytes, [4]);
    const doc2UpdatedBytes = await removePagesFromPdf(doc2Bytes, [2]);

    const updatedDoc1: UploadedPrintDocument = {
      ...doc1,
      pageCount: 7,
      blankPages: [],
      removedBlankPages: [4],
      rawFile: new File([doc1UpdatedBytes.buffer as ArrayBuffer], 'Report.pdf'),
    };

    const updatedDoc2: UploadedPrintDocument = {
      ...doc2,
      pageCount: 1,
      blankPages: [],
      removedBlankPages: [2],
      rawFile: new File([doc2UpdatedBytes.buffer as ArrayBuffer], 'Resume.pdf'),
    };

    // After removal: 7 + 1 = 8 pages total
    const postEstimate = calculateLivePrintEstimate([updatedDoc1, updatedDoc2], defaultSettings);
    assert.equal(postEstimate.totalPrintedPages, 8);
    assert.equal(postEstimate.estimatedTotalInr, 8); // 8 pages * ₹1 = ₹8
  });
});
