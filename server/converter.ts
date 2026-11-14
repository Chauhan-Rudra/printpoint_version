/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const execFileAsync = promisify(execFile);

const FONT_PATHS = {
  latin: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  latinBold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  gujarati: '/usr/share/fonts/truetype/noto/NotoSansGujarati-Regular.ttf',
  devanagari: '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf',
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 48;

export interface ConvertedDocumentResult {
  pdfBuffer: Buffer;
  pageCount: number;
  blankPages: number[];
  convertedFromFormat: string;
  converterEngine: string;
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function isPdfMagic(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isZipMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function isPngMagic(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function isJpegMagic(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

interface EmbeddedFonts {
  latin: PDFFont;
  latinBold: PDFFont;
  gujarati?: PDFFont;
  devanagari?: PDFFont;
}

async function loadDocumentFonts(pdfDoc: PDFDocument): Promise<EmbeddedFonts> {
  try {
    pdfDoc.registerFontkit(fontkit);
    const latin = fs.existsSync(FONT_PATHS.latin)
      ? await pdfDoc.embedFont(fs.readFileSync(FONT_PATHS.latin))
      : await pdfDoc.embedFont(StandardFonts.Helvetica);
    const latinBold = fs.existsSync(FONT_PATHS.latinBold)
      ? await pdfDoc.embedFont(fs.readFileSync(FONT_PATHS.latinBold))
      : await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const gujarati = fs.existsSync(FONT_PATHS.gujarati)
      ? await pdfDoc.embedFont(fs.readFileSync(FONT_PATHS.gujarati))
      : undefined;
    const devanagari = fs.existsSync(FONT_PATHS.devanagari)
      ? await pdfDoc.embedFont(fs.readFileSync(FONT_PATHS.devanagari))
      : undefined;
    return { latin, latinBold, gujarati, devanagari };
  } catch {
    const latin = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    return { latin, latinBold };
  }
}

function selectFontForSegment(ch: string, fonts: EmbeddedFonts, bold = false): PDFFont {
  const code = ch.codePointAt(0) || 0;
  if (code >= 0x0a80 && code <= 0x0aff && fonts.gujarati) {
    return fonts.gujarati;
  }
  if (code >= 0x0900 && code <= 0x097f && fonts.devanagari) {
    return fonts.devanagari;
  }
  return bold ? fonts.latinBold : fonts.latin;
}

function splitByScript(text: string, fonts: EmbeddedFonts, bold = false): Array<{ text: string; font: PDFFont }> {
  const runs: Array<{ text: string; font: PDFFont }> = [];
  for (const char of text) {
    const targetFont = selectFontForSegment(char, fonts, bold);
    const last = runs[runs.length - 1];
    if (last && last.font === targetFont) {
      last.text += char;
    } else {
      runs.push({ text: char, font: targetFont });
    }
  }
  return runs;
}

function safeWidth(text: string, size: number, fonts: EmbeddedFonts, bold = false): number {
  let width = 0;
  for (const run of splitByScript(text, fonts, bold)) {
    try {
      width += run.font.widthOfTextAtSize(run.text, size);
    } catch {
      width += run.text.length * size * 0.52;
    }
  }
  return width;
}

function drawSafeUnicodeText(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  x: number,
  y: number,
  size: number,
  fonts: EmbeddedFonts,
  bold = false,
  color = rgb(0.1, 0.14, 0.12)
): void {
  let cursorX = x;
  for (const run of splitByScript(text, fonts, bold)) {
    try {
      page.drawText(run.text, {
        x: cursorX,
        y,
        size,
        font: run.font,
        color,
      });
      cursorX += run.font.widthOfTextAtSize(run.text, size);
    } catch {
      const sanitized = run.text.replace(/[^\x20-\x7E]/g, ' ');
      if (sanitized.trim().length > 0) {
        page.drawText(sanitized, {
          x: cursorX,
          y,
          size,
          font: fonts.latin,
          color,
        });
        cursorX += fonts.latin.widthOfTextAtSize(sanitized, size);
      }
    }
  }
}

function wrapTextLines(
  rawText: string,
  maxWidth: number,
  fontSize: number,
  fonts: EmbeddedFonts,
  bold = false
): string[] {
  const out: string[] = [];
  const paragraphs = rawText.replace(/\r\n?/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const token of words) {
      const candidate = line + token;
      if (safeWidth(candidate, fontSize, fonts, bold) <= maxWidth) {
        line = candidate;
      } else {
        if (line.trim()) out.push(line.trimEnd());
        if (safeWidth(token, fontSize, fonts, bold) > maxWidth) {
          let chunk = '';
          for (const ch of token) {
            if (safeWidth(chunk + ch, fontSize, fonts, bold) > maxWidth && chunk.length > 0) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = token.trimStart();
        }
      }
    }
    if (line.length > 0) out.push(line.trimEnd());
  }
  return out.length > 0 ? out : [''];
}

async function renderStructuredBlocksToPdf(
  title: string,
  blocks: Array<{ text: string; heading?: boolean; mono?: boolean }>,
  landscape = false
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadDocumentFonts(pdfDoc);
  const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
  const maxWidth = pageWidth - PAGE_MARGIN * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - PAGE_MARGIN;

  drawSafeUnicodeText(page, title, PAGE_MARGIN, cursorY, 12, fonts, true, rgb(0.1, 0.31, 0.2));
  cursorY -= 20;
  page.drawLine({
    start: { x: PAGE_MARGIN, y: cursorY + 6 },
    end: { x: pageWidth - PAGE_MARGIN, y: cursorY + 6 },
    thickness: 0.75,
    color: rgb(0.84, 0.87, 0.85),
  });
  cursorY -= 10;

  for (const block of blocks) {
    const fontSize = block.heading ? 12.5 : block.mono ? 9 : 10.5;
    const lineHeight = block.heading ? 18 : block.mono ? 13.5 : 15.5;
    const isBold = Boolean(block.heading);
    const wrapped = wrapTextLines(block.text, maxWidth, fontSize, fonts, isBold);

    for (const line of wrapped) {
      if (cursorY < PAGE_MARGIN + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        cursorY = pageHeight - PAGE_MARGIN;
      }
      if (line.length > 0) {
        drawSafeUnicodeText(page, line, PAGE_MARGIN, cursorY, fontSize, fonts, isBold);
      }
      cursorY -= lineHeight;
    }
    cursorY -= block.heading ? 6 : 3;
  }

  return Buffer.from(await pdfDoc.save());
}

async function tryLibreOfficeConversion(buffer: Buffer, fileName: string): Promise<Buffer | null> {
  const candidates = ['soffice', 'libreoffice'];
  let foundBin: string | null = null;
  for (const bin of candidates) {
    try {
      await execFileAsync('which', [bin]);
      foundBin = bin;
      break;
    } catch {
      // Binary not present
    }
  }
  if (!foundBin) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printpoint-lo-'));
  try {
    const inputPath = path.join(tmpDir, path.basename(fileName));
    fs.writeFileSync(inputPath, buffer);
    await execFileAsync(
      foundBin,
      ['--headless', '--convert-to', 'pdf', '--outdir', tmpDir, inputPath],
      { timeout: 45_000 }
    );
    const expectedPdf = path.join(
      tmpDir,
      `${path.basename(fileName, path.extname(fileName))}.pdf`
    );
    if (fs.existsSync(expectedPdf)) {
      return fs.readFileSync(expectedPdf);
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function detectLikelyBlankPdfPages(pdfDoc: PDFDocument): number[] {
  const blankPages: number[] = [];
  const pages = pdfDoc.getPages();
  // Heuristic fast check for empty PDF content streams (client PDF.js handles pixel density as well)
  for (let i = 0; i < pages.length; i++) {
    const contents = pages[i].node.Contents();
    if (!contents) {
      blankPages.push(i + 1);
    }
  }
  return blankPages;
}

export async function validateAndConvertToPdf(
  buffer: Buffer,
  fileName: string
): Promise<ConvertedDocumentResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error(`"${fileName}" is empty (0 bytes).`);
  }

  const ext = getExtension(fileName);

  // 1. Native PDF
  if (ext === 'pdf') {
    if (!isPdfMagic(buffer)) {
      throw new Error(`"${fileName}" does not contain a valid %PDF header.`);
    }
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/encrypt|password/i.test(msg)) {
        throw new Error(`"${fileName}" is password-protected. Please remove the password before uploading.`);
      }
      throw new Error(`"${fileName}" is corrupted or unreadable.`);
    }
    const pageCount = pdfDoc.getPageCount();
    if (pageCount < 1) {
      throw new Error(`"${fileName}" contains zero printable pages.`);
    }
    return {
      pdfBuffer: buffer,
      pageCount,
      blankPages: detectLikelyBlankPdfPages(pdfDoc),
      convertedFromFormat: 'pdf',
      converterEngine: 'pdf-lib-native',
    };
  }

  // 2. Images (PNG / JPG / JPEG)
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    if (ext === 'png' && !isPngMagic(buffer)) {
      throw new Error(`"${fileName}" has an invalid PNG signature.`);
    }
    if ((ext === 'jpg' || ext === 'jpeg') && !isJpegMagic(buffer)) {
      throw new Error(`"${fileName}" has an invalid JPEG signature.`);
    }
    const pdfDoc = await PDFDocument.create();
    const img =
      ext === 'png' ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
    const margin = 28;
    const maxW = A4_WIDTH - margin * 2;
    const maxH = A4_HEIGHT - margin * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(img, {
      x: (A4_WIDTH - drawW) / 2,
      y: (A4_HEIGHT - drawH) / 2,
      width: drawW,
      height: drawH,
    });
    const out = Buffer.from(await pdfDoc.save());
    return {
      pdfBuffer: out,
      pageCount: 1,
      blankPages: [],
      convertedFromFormat: ext,
      converterEngine: 'pdf-lib-image',
    };
  }

  // 3. Plain text & CSV with full Unicode font support
  if (ext === 'txt' || ext === 'csv') {
    const decoded = buffer.toString('utf8');
    let blocks: Array<{ text: string; heading?: boolean; mono?: boolean }>;
    if (ext === 'csv') {
      const workbook = XLSX.read(decoded, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
      blocks = rows.map((row, idx) => ({
        text: row.map((cell) => String(cell ?? '')).join('  |  '),
        heading: idx === 0,
        mono: idx > 0,
      }));
    } else {
      blocks = decoded.split(/\r?\n/).map((line) => ({ text: line }));
    }
    const pdfBuffer = await renderStructuredBlocksToPdf(fileName, blocks, ext === 'csv');
    const parsed = await PDFDocument.load(pdfBuffer);
    return {
      pdfBuffer,
      pageCount: parsed.getPageCount(),
      blankPages: [],
      convertedFromFormat: ext,
      converterEngine: 'pdf-lib-unicode',
    };
  }

  // 4. Try LibreOffice headless first if available on host for Office docs
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
    const loPdf = await tryLibreOfficeConversion(buffer, fileName);
    if (loPdf) {
      const parsed = await PDFDocument.load(loPdf);
      return {
        pdfBuffer: loPdf,
        pageCount: parsed.getPageCount(),
        blankPages: [],
        convertedFromFormat: ext,
        converterEngine: 'libreoffice-headless',
      };
    }
  }

  // 5. Pure-Node DOCX conversion (mammoth -> paginated Unicode PDF)
  if (ext === 'docx') {
    if (!isZipMagic(buffer)) {
      throw new Error(`"${fileName}" is not a valid DOCX archive.`);
    }
    const result = await mammoth.extractRawText({ buffer });
    const lines = result.value.split(/\r?\n/).filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0));
    const blocks = lines.length > 0 ? lines.map((text) => ({ text })) : [{ text: '(Document has no extractable text)' }];
    const pdfBuffer = await renderStructuredBlocksToPdf(fileName, blocks);
    const parsed = await PDFDocument.load(pdfBuffer);
    return {
      pdfBuffer,
      pageCount: parsed.getPageCount(),
      blankPages: [],
      convertedFromFormat: 'docx',
      converterEngine: 'mammoth-unicode-pdf',
    };
  }

  // 6. Pure-Node XLS / XLSX spreadsheet conversion (SheetJS -> landscape A4 PDF)
  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames.length) {
      throw new Error(`"${fileName}" contains no worksheets.`);
    }
    const blocks: Array<{ text: string; heading?: boolean; mono?: boolean }> = [];
    for (const sheetName of workbook.SheetNames) {
      blocks.push({ text: `Sheet: ${sheetName}`, heading: true });
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      if (rows.length === 0) {
        blocks.push({ text: '(Empty sheet)', mono: true });
      } else {
        for (let r = 0; r < rows.length; r++) {
          const rowText = rows[r].map((c) => String(c ?? '')).join('  |  ');
          blocks.push({ text: rowText, heading: r === 0, mono: r > 0 });
        }
      }
    }
    const pdfBuffer = await renderStructuredBlocksToPdf(fileName, blocks, true);
    const parsed = await PDFDocument.load(pdfBuffer);
    return {
      pdfBuffer,
      pageCount: parsed.getPageCount(),
      blankPages: [],
      convertedFromFormat: ext,
      converterEngine: 'sheetjs-unicode-pdf',
    };
  }

  // 7. Pure-Node PPTX slide deck conversion (JSZip XML extraction -> one slide per PDF page)
  if (ext === 'pptx') {
    if (!isZipMagic(buffer)) {
      throw new Error(`"${fileName}" is not a valid PPTX archive.`);
    }
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
        const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
        return na - nb;
      });

    if (slideFiles.length === 0) {
      throw new Error(`"${fileName}" contains no slides.`);
    }

    const pdfDoc = await PDFDocument.create();
    const fonts = await loadDocumentFonts(pdfDoc);
    const landscapeW = A4_HEIGHT;
    const landscapeH = A4_WIDTH;
    const maxW = landscapeW - PAGE_MARGIN * 2;

    for (let s = 0; s < slideFiles.length; s++) {
      const xml = await zip.files[slideFiles[s]].async('string');
      const paragraphMatches = Array.from(xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g));
      const slideLines: string[] = [];
      for (const pMatch of paragraphMatches) {
        const texts = Array.from(pMatch[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
        );
        const joined = texts.join('');
        if (joined.trim()) slideLines.push(joined.trim());
      }

      const page = pdfDoc.addPage([landscapeW, landscapeH]);
      let y = landscapeH - PAGE_MARGIN;
      drawSafeUnicodeText(
        page,
        `Slide ${s + 1} of ${slideFiles.length} — ${fileName}`,
        PAGE_MARGIN,
        y,
        12,
        fonts,
        true,
        rgb(0.1, 0.31, 0.2)
      );
      y -= 28;
      if (slideLines.length === 0) {
        drawSafeUnicodeText(page, '(Visual slide with no embedded text runs)', PAGE_MARGIN, y, 11, fonts);
      } else {
        for (let idx = 0; idx < slideLines.length; idx++) {
          const isTitle = idx === 0;
          const size = isTitle ? 16 : 12;
          const wrapped = wrapTextLines(slideLines[idx], maxW, size, fonts, isTitle);
          for (const line of wrapped) {
            if (y < PAGE_MARGIN + 20) break;
            drawSafeUnicodeText(page, line, PAGE_MARGIN, y, size, fonts, isTitle);
            y -= isTitle ? 22 : 18;
          }
          y -= 6;
        }
      }
    }

    const pdfBuffer = Buffer.from(await pdfDoc.save());
    return {
      pdfBuffer,
      pageCount: pdfDoc.getPageCount(),
      blankPages: [],
      convertedFromFormat: 'pptx',
      converterEngine: 'jszip-pptx-unicode-pdf',
    };
  }

  // 8. Legacy binary .doc / .ppt without LibreOffice
  if (ext === 'doc' || ext === 'ppt') {
    throw new Error(
      `Legacy binary .${ext} requires LibreOffice on the host server. Please save as .${ext}x or .pdf and upload again.`
    );
  }

  throw new Error(`Unsupported document extension ".${ext}".`);
}

export async function stripPagesFromPdfBuffer(
  pdfBuffer: Buffer,
  oneBasedPagesToRemove: number[]
): Promise<{ pdfBuffer: Buffer; pageCount: number }> {
  const src = await PDFDocument.load(pdfBuffer, { ignoreEncryption: false });
  const total = src.getPageCount();
  const removeSet = new Set(
    oneBasedPagesToRemove.filter((p) => Number.isInteger(p) && p >= 1 && p <= total)
  );
  if (removeSet.size === 0 || removeSet.size >= total) {
    return { pdfBuffer, pageCount: total };
  }
  const keepIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!removeSet.has(i + 1)) {
      keepIndices.push(i);
    }
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keepIndices);
  for (const page of copied) {
    out.addPage(page);
  }
  const saved = Buffer.from(await out.save());
  return { pdfBuffer: saved, pageCount: out.getPageCount() };
}
