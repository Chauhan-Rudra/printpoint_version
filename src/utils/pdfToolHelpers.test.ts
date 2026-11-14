import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  MAX_TOOL_FILE_SIZE_BYTES,
  validateToolFiles,
  formatCompressionSummary,
  mergePdfFiles,
  splitPdfPages,
  rotatePdfPages,
  deletePdfPages,
} from './pdfToolHelpers.ts';

async function makeTestPdfFile(name: string, pageCount: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([400, 600]);
  }
  const bytes = await doc.save();
  return new File([bytes as unknown as BlobPart], name, { type: 'application/pdf' });
}

test('validateToolFiles rejects empty, oversized, and wrong-type files', () => {
  const emptyFile = new File([], 'empty.pdf', { type: 'application/pdf' });
  const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  const validPdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
  const validPng = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

  const oversized = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
  Object.defineProperty(oversized, 'size', { value: MAX_TOOL_FILE_SIZE_BYTES + 1 });

  const pdfResult = validateToolFiles([emptyFile, textFile, oversized, validPng, validPdf], 'pdf');
  assert.equal(pdfResult.validFiles.length, 1);
  assert.equal(pdfResult.validFiles[0].name, 'doc.pdf');
  assert.equal(pdfResult.errors.length, 4);

  const imageResult = validateToolFiles([validPdf, validPng], 'image');
  assert.equal(imageResult.validFiles.length, 1);
  assert.equal(imageResult.validFiles[0].name, 'photo.png');
  assert.equal(imageResult.errors.length, 1);

  const mixedResult = validateToolFiles([validPdf, validPng, textFile], 'image-or-pdf');
  assert.equal(mixedResult.validFiles.length, 2);
  assert.equal(mixedResult.errors.length, 1);
});

test('formatCompressionSummary calculates saved percentage cleanly', () => {
  const reduced = formatCompressionSummary(4 * 1024 * 1024, 1 * 1024 * 1024);
  assert.equal(reduced.savedPercent, 75);
  assert.match(reduced.summaryText, /75% smaller/);

  const optimal = formatCompressionSummary(1024 * 1024, 1024 * 1024);
  assert.equal(optimal.savedPercent, 0);
  assert.match(optimal.summaryText, /already optimal/);
});

test('mergePdfFiles combines multiple PDFs in order', async () => {
  const pdfA = await makeTestPdfFile('a.pdf', 1);
  const pdfB = await makeTestPdfFile('b.pdf', 2);

  const merged = await mergePdfFiles([pdfA, pdfB]);
  assert.equal(merged.name, 'merged_document.pdf');
  assert.equal(merged.type, 'application/pdf');

  const loaded = await PDFDocument.load(await merged.arrayBuffer());
  assert.equal(loaded.getPageCount(), 3);
});

test('splitPdfPages, rotatePdfPages, and deletePdfPages transform real PDFs accurately', async () => {
  const source = await makeTestPdfFile('sample.pdf', 3);

  const split = await splitPdfPages(source, [1, 3]);
  assert.equal(split.name, 'sample_split.pdf');
  const splitDoc = await PDFDocument.load(await split.arrayBuffer());
  assert.equal(splitDoc.getPageCount(), 2);

  const rotated = await rotatePdfPages(source, { 1: 90, 2: 180 });
  assert.equal(rotated.name, 'sample_rotated.pdf');
  const rotatedDoc = await PDFDocument.load(await rotated.arrayBuffer());
  assert.equal(rotatedDoc.getPage(0).getRotation().angle, 90);
  assert.equal(rotatedDoc.getPage(1).getRotation().angle, 180);

  const deleted = await deletePdfPages(source, [2]);
  assert.equal(deleted.name, 'sample_edited.pdf');
  const deletedDoc = await PDFDocument.load(await deleted.arrayBuffer());
  assert.equal(deletedDoc.getPageCount(), 2);

  await assert.rejects(() => deletePdfPages(source, [1, 2, 3]));
});
