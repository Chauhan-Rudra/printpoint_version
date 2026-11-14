import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { UploadedPrintDocument } from '../types/kiosk';
import { imagesToPdf } from './pdfToolHelpers';

export interface DocumentConversionOutcome {
  status: NonNullable<UploadedPrintDocument['conversionStatus']>;
  pdfFile?: File;
  pageCount?: number;
  error?: string;
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png)$/i;
const TEXT_EXT_RE = /\.(txt|csv)$/i;
const OFFICE_EXT_RE = /\.(doc|docx|xls|xlsx|ppt|pptx)$/i;

function toPdfFileName(originalName: string): string {
  const trimmed = originalName.trim();
  const base = trimmed.replace(/\.[^/.]+$/, '') || 'document';
  return `${base}.pdf`;
}

function hasNonWinAnsiUnicode(text: string): boolean {
  return /[^\t\r\n\x20-\x7E\xA0-\xFF]/.test(text);
}

function wrapTextLines(rawText: string, maxCharsPerLine: number): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim().length === 0) {
      lines.push('');
      continue;
    }

    const sanitized = para.replace(/\t/g, '  ');
    let remaining = sanitized;
    while (remaining.length > maxCharsPerLine) {
      let breakAt = remaining.lastIndexOf(' ', maxCharsPerLine);
      if (breakAt <= Math.floor(maxCharsPerLine * 0.4)) {
        breakAt = maxCharsPerLine;
      }
      lines.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    lines.push(remaining);
  }

  return lines.length > 0 ? lines : [''];
}

async function unicodeTextCanvasToPdfFile(sourceFile: File, rawText: string): Promise<{ file: File; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();
  const isCsv = /\.csv$/i.test(sourceFile.name);
  const lines = wrapTextLines(rawText, isCsv ? 84 : 88);
  const linesPerPage = 42;
  const width = 1190;
  const height = 1684;

  for (let start = 0; start < lines.length; start += linesPerPage) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#141715';
    ctx.font = isCsv
      ? '20px "Noto Sans", "DejaVu Sans", monospace'
      : '22px "Noto Sans Gujarati", "Noto Sans Devanagari", "Noto Sans", sans-serif';

    const chunk = lines.slice(start, start + linesPerPage);
    let y = 96;
    for (const line of chunk) {
      if (line.length > 0) {
        ctx.fillText(line, 76, y, width - 152);
      }
      y += 35;
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png')
    );
    const pngImage = await pdfDoc.embedPng(await blob.arrayBuffer());
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawImage(pngImage, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }

  const bytes = await pdfDoc.save();
  return {
    file: new File([bytes as unknown as BlobPart], toPdfFileName(sourceFile.name), {
      type: 'application/pdf',
    }),
    pageCount: pdfDoc.getPageCount(),
  };
}

async function textToPdfFile(sourceFile: File): Promise<{ file: File; pageCount: number }> {
  const rawText = await sourceFile.text();
  if (
    hasNonWinAnsiUnicode(rawText) &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  ) {
    return unicodeTextCanvasToPdfFile(sourceFile, rawText);
  }

  const isCsv = /\.csv$/i.test(sourceFile.name);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(
    isCsv ? StandardFonts.Courier : StandardFonts.Helvetica
  );

  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const MARGIN_X = 42;
  const MARGIN_Y = 48;
  const FONT_SIZE = isCsv ? 9.5 : 10.5;
  const LINE_HEIGHT = isCsv ? 13.5 : 15;
  const MAX_CHARS = isCsv ? 84 : 88;

  const lines = wrapTextLines(rawText, MAX_CHARS);
  const linesPerPage = Math.max(
    1,
    Math.floor((A4_HEIGHT - MARGIN_Y * 2) / LINE_HEIGHT)
  );

  for (let start = 0; start < lines.length; start += linesPerPage) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const chunk = lines.slice(start, start + linesPerPage);
    let y = A4_HEIGHT - MARGIN_Y - FONT_SIZE;

    for (const line of chunk) {
      if (line.length > 0) {
        const winAnsiSafe = line.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
        page.drawText(winAnsiSafe, {
          x: MARGIN_X,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.1, 0.11, 0.1),
        });
      }
      y -= LINE_HEIGHT;
    }
  }

  const bytes = await pdfDoc.save();
  const pdfFile = new File(
    [bytes as unknown as BlobPart],
    toPdfFileName(sourceFile.name),
    { type: 'application/pdf' }
  );

  return { file: pdfFile, pageCount: pdfDoc.getPageCount() };
}

/**
 * Converts supported non-PDF files into genuine PDFs for PDF.js preview and editing,
 * preserving Unicode characters cleanly and delegating Office docs to the server converter.
 */
export async function ensureEditablePdfDocument(
  doc: UploadedPrintDocument
): Promise<DocumentConversionOutcome> {
  const sourceFile = doc.originalFile || doc.rawFile;
  if (!sourceFile) {
    return {
      status: 'failed',
      error: 'Original document file is missing from this session.',
    };
  }

  if (doc.convertedPdfFile) {
    return {
      status: doc.conversionStatus || 'converted',
      pdfFile: doc.convertedPdfFile,
      pageCount: doc.originalPageCount ?? doc.pageCount,
    };
  }

  const lower = sourceFile.name.toLowerCase();

  if (lower.endsWith('.pdf') || sourceFile.type === 'application/pdf') {
    return {
      status: 'native-pdf',
      pdfFile: sourceFile,
      pageCount: doc.originalPageCount ?? doc.pageCount,
    };
  }

  if (IMAGE_EXT_RE.test(lower)) {
    try {
      const converted = await imagesToPdf([sourceFile]);
      const renamed = new File(
        [await converted.arrayBuffer()],
        toPdfFileName(sourceFile.name),
        { type: 'application/pdf' }
      );
      return {
        status: 'converted',
        pdfFile: renamed,
        pageCount: 1,
      };
    } catch {
      return {
        status: 'failed',
        error: `Could not convert image "${sourceFile.name}" into a PDF for editing.`,
      };
    }
  }

  if (TEXT_EXT_RE.test(lower)) {
    try {
      const { file, pageCount } = await textToPdfFile(sourceFile);
      return {
        status: 'converted',
        pdfFile: file,
        pageCount,
      };
    } catch {
      return {
        status: 'failed',
        error: `Could not convert "${sourceFile.name}" into a PDF for preview.`,
      };
    }
  }

  if (OFFICE_EXT_RE.test(lower)) {
    const conversionEndpoint =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> }).env
        ?.VITE_DOCUMENT_CONVERSION_URL;

    if (conversionEndpoint) {
      try {
        const formData = new FormData();
        formData.append('file', sourceFile);
        const res = await fetch(conversionEndpoint, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          throw new Error(`Conversion server returned ${res.status}`);
        }
        const pdfBlob = await res.blob();
        const pdfBytes = await pdfBlob.arrayBuffer();
        const parsed = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const convertedFile = new File(
          [pdfBytes],
          toPdfFileName(sourceFile.name),
          { type: 'application/pdf' }
        );
        return {
          status: 'converted',
          pdfFile: convertedFile,
          pageCount: parsed.getPageCount(),
        };
      } catch {
        return {
          status: 'failed',
          error: `Conversion service failed to convert "${sourceFile.name}" to PDF.`,
        };
      }
    }

    return {
      status: 'conversion-required',
      error: `"${sourceFile.name}" requires the server conversion service before PDF.js preview.`,
    };
  }

  return {
    status: 'failed',
    error: `Unsupported file format for PDF preview: "${sourceFile.name}".`,
  };
}
