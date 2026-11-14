import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { ensureEditablePdfDocument } from './documentConversion';
import { UploadedPrintDocument } from '../types/kiosk';

function makeDoc(file: File): UploadedPrintDocument {
  return {
    id: `doc-${file.name}`,
    orderIndex: 0,
    name: file.name,
    sizeBytes: file.size,
    pageCount: 1,
    progressPercent: 100,
    status: 'Ready',
    rawFile: file,
    originalFile: file,
    settings: {
      colourMode: 'bw',
      sides: '1-sided',
      copies: 1,
      removeBlankPages: true,
    },
  };
}

test('ensureEditablePdfDocument passes native PDFs directly without modification', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const bytes = await pdf.save();
  const file = new File([bytes as unknown as BlobPart], 'Report.pdf', {
    type: 'application/pdf',
  });

  const outcome = await ensureEditablePdfDocument(makeDoc(file));
  assert.equal(outcome.status, 'native-pdf');
  assert.equal(outcome.pdfFile, file);
});

test('ensureEditablePdfDocument converts TXT and CSV files into genuine multi-page PDFs', async () => {
  const manyLines = Array.from({ length: 70 }, (_, i) => `Line ${i + 1}: Sample log record`).join('\n');
  const txtFile = new File([manyLines], 'Notes.txt', { type: 'text/plain' });

  const txtOutcome = await ensureEditablePdfDocument(makeDoc(txtFile));
  assert.equal(txtOutcome.status, 'converted');
  assert.ok(txtOutcome.pdfFile);
  assert.equal(txtOutcome.pdfFile.name, 'Notes.pdf');
  assert.equal(txtOutcome.pageCount, 2);

  const parsedTxtPdf = await PDFDocument.load(await txtOutcome.pdfFile.arrayBuffer());
  assert.equal(parsedTxtPdf.getPageCount(), 2);

  const csvFile = new File(['id,amount\n1,250\n2,400'], 'Ledger.csv', {
    type: 'text/csv',
  });
  const csvOutcome = await ensureEditablePdfDocument(makeDoc(csvFile));
  assert.equal(csvOutcome.status, 'converted');
  assert.ok(csvOutcome.pdfFile);
  assert.equal(csvOutcome.pdfFile.name, 'Ledger.pdf');
  assert.equal(csvOutcome.pageCount, 1);
});

test('ensureEditablePdfDocument does not pretend DOCX/XLSX/PPTX can be rendered directly by PDF.js', async () => {
  const docxFile = new File(['dummy-binary'], 'Thesis.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const outcome = await ensureEditablePdfDocument(makeDoc(docxFile));
  assert.equal(outcome.status, 'conversion-required');
  assert.equal(outcome.pdfFile, undefined);
  assert.ok(outcome.error?.includes('conversion service'));
});
