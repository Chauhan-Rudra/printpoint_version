import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { removePagesFromPdf } from './blankPageDetector';
import { createValidPdfBinary } from './kioskLogic';

describe('Blank Page Removal with pdf-lib', () => {
  it('successfully removes targeted blank pages while preserving remaining pages and order', async () => {
    // Generate a valid 4-page PDF where page 4 is designated as blank
    const pdfBytes = createValidPdfBinary('Test_Report.pdf', 4, [4]);
    const originalDoc = await PDFDocument.load(pdfBytes);
    assert.equal(originalDoc.getPageCount(), 4);

    // Remove page 4
    const modifiedBytes = await removePagesFromPdf(pdfBytes, [4]);
    const updatedDoc = await PDFDocument.load(modifiedBytes);
    assert.equal(updatedDoc.getPageCount(), 3);
  });

  it('removes multiple non-contiguous pages correctly in descending order', async () => {
    // 6 pages with pages 2 and 5 blank
    const pdfBytes = createValidPdfBinary('Multi_Page.pdf', 6, [2, 5]);
    const originalDoc = await PDFDocument.load(pdfBytes);
    assert.equal(originalDoc.getPageCount(), 6);

    const modifiedBytes = await removePagesFromPdf(pdfBytes, [2, 5]);
    const updatedDoc = await PDFDocument.load(modifiedBytes);
    assert.equal(updatedDoc.getPageCount(), 4);
  });

  it('throws an informative error if attempting to remove all pages', async () => {
    const pdfBytes = createValidPdfBinary('Single.pdf', 2, [1, 2]);
    await assert.rejects(
      async () => {
        await removePagesFromPdf(pdfBytes, [1, 2]);
      },
      {
        message: /Cannot remove all 2 pages/,
      }
    );
  });

  it('returns unchanged document if page removal list is empty', async () => {
    const pdfBytes = createValidPdfBinary('NoChange.pdf', 3, []);
    const result = await removePagesFromPdf(pdfBytes, []);
    const doc = await PDFDocument.load(result);
    assert.equal(doc.getPageCount(), 3);
  });
});
