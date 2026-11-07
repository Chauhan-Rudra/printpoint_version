import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjsLib from 'pdfjs-dist';
import {
  analyzePdfPage,
  detectBlankPagesInPdf,
  removePagesFromPdf,
} from './blankPageDetector';
import {
  createValidPdfBinary,
  detectBlankPagesFromBuffer,
} from './kioskLogic';

describe('Blank Page Detection Accuracy & False Positive Protection', () => {
  it('never classifies pages containing paragraphs and text as blank in buffer detection', () => {
    // Generate an 8-page document with full content on every page
    const docBytes = createValidPdfBinary('Annual_Project_Report.pdf', 8, []);
    const detected = detectBlankPagesFromBuffer('Annual_Project_Report.pdf', docBytes);

    // Absolutely zero false positives - page 4 or any other page MUST NOT be detected as blank
    assert.deepEqual(detected, []);
  });

  it('detects genuine blank pages generated in buffer detection without false positives', () => {
    // 6-page document where only page 3 is an empty page
    const docBytes = createValidPdfBinary('Report_With_Blank.pdf', 6, [3]);
    const detected = detectBlankPagesFromBuffer('Report_With_Blank.pdf', docBytes);

    assert.deepEqual(detected, [3]);
  });

  it('PDF.js Multi-Layer detection never classifies text-bearing pages as blank', async () => {
    // 4-page PDF with text on pages 1, 2, 4 and blank on page 3
    const pdfBytes = createValidPdfBinary('Smart_City_Proposal.pdf', 4, [3]);
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdfDoc = await loadingTask.promise;

    // Page 1 has title and paragraphs
    const page1 = await pdfDoc.getPage(1);
    const result1 = await analyzePdfPage(page1, 1);
    assert.equal(result1.state, 'NOT_BLANK');
    assert.equal(result1.isBlank, false);
    assert.ok(result1.printableCharCount > 0);
    assert.match(result1.reason, /Written text detected/);

    // Page 2 has diagrams and text
    const page2 = await pdfDoc.getPage(2);
    const result2 = await analyzePdfPage(page2, 2);
    assert.equal(result2.state, 'NOT_BLANK');
    assert.equal(result2.isBlank, false);
    assert.ok(result2.printableCharCount > 0);

    // Page 3 is truly blank (empty stream 'q Q')
    const page3 = await pdfDoc.getPage(3);
    const result3 = await analyzePdfPage(page3, 3);
    assert.equal(result3.state, 'BLANK');
    assert.equal(result3.isBlank, true);
    assert.equal(result3.printableCharCount, 0);

    // Page 4 has text and tables
    const page4 = await pdfDoc.getPage(4);
    const result4 = await analyzePdfPage(page4, 4);
    assert.equal(result4.state, 'NOT_BLANK');
    assert.equal(result4.isBlank, false);

    await pdfDoc.cleanup();
    await pdfDoc.destroy();
  });

  it('detectBlankPagesInPdf accurately detects only real blank pages in a File object', async () => {
    // 5-page document with blank page on page 2 and page 5
    const pdfBytes = createValidPdfBinary('Course_Notes.pdf', 5, [2, 5]);
    const file = new File([pdfBytes.buffer as ArrayBuffer], 'Course_Notes.pdf', {
      type: 'application/pdf',
    });

    const analysis = await detectBlankPagesInPdf(file, 'doc-123');
    assert.deepEqual(analysis.blankPages, [2, 5]);
    assert.equal(analysis.items.length, 2);
    assert.equal(analysis.items[0].pageNumber, 2);
    assert.equal(analysis.items[1].pageNumber, 5);
  });

  it('safely handles non-blank documents with zero blank pages found', async () => {
    const pdfBytes = createValidPdfBinary('Full_Thesis.pdf', 3, []);
    const file = new File([pdfBytes.buffer as ArrayBuffer], 'Full_Thesis.pdf', {
      type: 'application/pdf',
    });

    const analysis = await detectBlankPagesInPdf(file, 'doc-456');
    assert.deepEqual(analysis.blankPages, []);
    assert.deepEqual(analysis.uncertainPages, []);
    assert.equal(analysis.items.length, 0);
  });

  it('removes confirmed blank pages from PDF while preserving remaining text pages intact', async () => {
    const originalBytes = createValidPdfBinary('Thesis_Draft.pdf', 4, [2]);
    const cleanedBytes = await removePagesFromPdf(originalBytes, [2]);

    const loadingTask = pdfjsLib.getDocument({
      data: cleanedBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const cleanedPdf = await loadingTask.promise;
    assert.equal(cleanedPdf.numPages, 3);

    // All 3 remaining pages must have written text
    for (let p = 1; p <= 3; p++) {
      const page = await cleanedPdf.getPage(p);
      const res = await analyzePdfPage(page, p);
      assert.equal(res.state, 'NOT_BLANK');
      assert.equal(res.isBlank, false);
      assert.ok(res.printableCharCount > 0);
    }

    await cleanedPdf.cleanup();
    await cleanedPdf.destroy();
  });
});
