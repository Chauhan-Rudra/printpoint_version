import { PDFDocument, degrees, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

function createPdfFile(pdfBytes: Uint8Array, filename: string): File {
  return new File([pdfBytes as unknown as BlobPart], filename, {
    type: 'application/pdf',
  });
}

/**
 * Merges multiple PDF files in user-specified order into a single PDF document.
 */
export async function mergePdfFiles(files: File[]): Promise<File> {
  if (files.length === 0) {
    throw new Error('At least one PDF file is required to merge.');
  }

  const mergedDoc = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
    copiedPages.forEach((page) => mergedDoc.addPage(page));
  }

  const mergedBytes = await mergedDoc.save();
  return createPdfFile(mergedBytes, 'merged_document.pdf');
}

/**
 * Rotates specific pages in a PDF document by 90°, 180°, or 270°.
 * @param rotations Map of 1-based page number to degrees to ADD (e.g. { 1: 90, 2: 180 })
 */
export async function rotatePdfPages(
  file: File,
  rotations: Record<number, number>
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  for (let p = 1; p <= totalPages; p++) {
    const addDeg = rotations[p] || 0;
    if (addDeg !== 0) {
      const page = pdfDoc.getPage(p - 1);
      const currentRotation = page.getRotation().angle;
      const nextRotation = (currentRotation + addDeg) % 360;
      page.setRotation(degrees(nextRotation));
    }
  }

  const modifiedBytes = await pdfDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, '_rotated.pdf'));
}

/**
 * Removes selected 1-based page numbers from a PDF document.
 */
export async function deletePdfPages(
  file: File,
  pagesToDelete: number[]
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const zeroIndices = [...new Set(pagesToDelete)]
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < totalPages)
    .sort((a, b) => b - a); // descending to avoid index shifting

  if (zeroIndices.length >= totalPages) {
    throw new Error('Cannot delete all pages from document. At least one page must remain.');
  }

  for (const idx of zeroIndices) {
    pdfDoc.removePage(idx);
  }

  const modifiedBytes = await pdfDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, '_edited.pdf'));
}

/**
 * Reorders PDF pages according to a new array of 1-based page numbers.
 */
export async function reorderPdfPages(
  file: File,
  newPageOrder: number[]
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const zeroBasedOrder = newPageOrder.map((p) => p - 1);
  const copiedPages = await newDoc.copyPages(sourceDoc, zeroBasedOrder);
  copiedPages.forEach((p) => newDoc.addPage(p));

  const modifiedBytes = await newDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, '_reordered.pdf'));
}

/**
 * Extracts a subset of 1-based page numbers into a standalone PDF.
 */
export async function splitPdfPages(
  file: File,
  pagesToExtract: number[]
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();

  const validPages = pagesToExtract
    .filter((p) => p >= 1 && p <= sourceDoc.getPageCount())
    .map((p) => p - 1);

  if (validPages.length === 0) {
    throw new Error('No valid pages selected for extraction.');
  }

  const copiedPages = await newDoc.copyPages(sourceDoc, validPages);
  copiedPages.forEach((p) => newDoc.addPage(p));

  const modifiedBytes = await newDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, '_split.pdf'));
}

/**
 * Arranges 2 or 4 pages per sheet on standard A4 (595.28 x 841.89 pt) for N-Up printing.
 */
export async function nUpPdfPages(
  file: File,
  pagesPerSheet: 2 | 4
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const outputDoc = await PDFDocument.create();

  const totalPages = sourceDoc.getPageCount();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  const MARGIN = 20;

  if (pagesPerSheet === 2) {
    // 2 pages per sheet in Landscape (841.89 x 595.28)
    const SHEET_W = A4_HEIGHT;
    const SHEET_H = A4_WIDTH;
    const slotW = (SHEET_W - MARGIN * 3) / 2;
    const slotH = SHEET_H - MARGIN * 2;

    for (let i = 0; i < totalPages; i += 2) {
      const sheet = outputDoc.addPage([SHEET_W, SHEET_H]);
      const indicesToEmbed = [i, i + 1].filter((idx) => idx < totalPages);
      const embedded = await outputDoc.embedPdf(sourceDoc, indicesToEmbed);

      embedded.forEach((pageEmbed, idx) => {
        const xOffset = MARGIN + idx * (slotW + MARGIN);
        const scale = Math.min(slotW / pageEmbed.width, slotH / pageEmbed.height);
        const drawW = pageEmbed.width * scale;
        const drawH = pageEmbed.height * scale;
        const yOffset = MARGIN + (slotH - drawH) / 2;

        sheet.drawPage(pageEmbed, {
          x: xOffset + (slotW - drawW) / 2,
          y: yOffset,
          width: drawW,
          height: drawH,
        });
      });
    }
  } else {
    // 4 pages per sheet in Portrait (595.28 x 841.89)
    const slotW = (A4_WIDTH - MARGIN * 3) / 2;
    const slotH = (A4_HEIGHT - MARGIN * 3) / 2;

    for (let i = 0; i < totalPages; i += 4) {
      const sheet = outputDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const indicesToEmbed = [i, i + 1, i + 2, i + 3].filter((idx) => idx < totalPages);
      const embedded = await outputDoc.embedPdf(sourceDoc, indicesToEmbed);

      // Grid: Top-Left (0), Top-Right (1), Bottom-Left (2), Bottom-Right (3)
      const positions = [
        { col: 0, row: 1 }, // top-left
        { col: 1, row: 1 }, // top-right
        { col: 0, row: 0 }, // bottom-left
        { col: 1, row: 0 }, // bottom-right
      ];

      embedded.forEach((pageEmbed, idx) => {
        const { col, row } = positions[idx];
        const scale = Math.min(slotW / pageEmbed.width, slotH / pageEmbed.height);
        const drawW = pageEmbed.width * scale;
        const drawH = pageEmbed.height * scale;

        const xOffset = MARGIN + col * (slotW + MARGIN) + (slotW - drawW) / 2;
        const yOffset = MARGIN + row * (slotH + MARGIN) + (slotH - drawH) / 2;

        sheet.drawPage(pageEmbed, {
          x: xOffset,
          y: yOffset,
          width: drawW,
          height: drawH,
        });
      });
    }
  }

  const modifiedBytes = await outputDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, `_${pagesPerSheet}up.pdf`));
}

/**
 * Trims margins or adjusts crop box of a PDF document by specified margin points.
 */
export async function cropPdfMargins(
  file: File,
  marginPt: number
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    if (width > marginPt * 2 && height > marginPt * 2) {
      page.setCropBox(marginPt, marginPt, width - marginPt * 2, height - marginPt * 2);
    }
  }

  const modifiedBytes = await pdfDoc.save();
  return createPdfFile(modifiedBytes, file.name.replace(/\.pdf$/i, '_cropped.pdf'));
}

/**
 * Compresses a PDF file by re-encoding pages with rasterized optimization.
 * Offers Low (90% quality), Medium (75% quality), and High (55% quality) compression levels.
 */
export async function compressPdfFile(
  file: File,
  level: 'low' | 'medium' | 'high' = 'medium',
  onProgress?: (progressPct: number) => void
): Promise<{ compressedFile: File; originalSize: number; newSize: number }> {
  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdfjsDoc.numPages;

  const outputDoc = await PDFDocument.create();

  const qualityMap = {
    low: { scale: 1.5, quality: 0.85 },
    medium: { scale: 1.2, quality: 0.70 },
    high: { scale: 0.95, quality: 0.50 },
  };
  const { scale, quality } = qualityMap[level];

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpegBytes = await fetch(jpegDataUrl).then((r) => r.arrayBuffer());
      const embeddedImage = await outputDoc.embedJpg(jpegBytes);

      const outPage = outputDoc.addPage([page.view[2], page.view[3]]);
      outPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: page.view[2],
        height: page.view[3],
      });
    }

    if (onProgress) {
      onProgress(Math.round((p / totalPages) * 100));
    }
  }

  const compressedBytes = await outputDoc.save({ useObjectStreams: true });
  const compressedFile = createPdfFile(compressedBytes, file.name.replace(/\.pdf$/i, '_compressed.pdf'));

  return {
    compressedFile,
    originalSize,
    newSize: compressedFile.size,
  };
}

/**
 * Converts PDF pages into individual JPG images using PDF.js.
 */
export async function convertPdfToJpg(
  file: File,
  onProgress?: (progressPct: number) => void
): Promise<Array<{ pageNumber: number; dataUrl: string; blob: Blob }>> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdfjsDoc.numPages;
  const results: Array<{ pageNumber: number; dataUrl: string; blob: Blob }> = [];

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdfjsDoc.getPage(p);
    const viewport = page.getViewport({ scale: 2.0 }); // Crisp 2x render for clean JPGs

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92)
      );

      results.push({ pageNumber: p, dataUrl, blob });
    }

    if (onProgress) {
      onProgress(Math.round((p / totalPages) * 100));
    }
  }

  return results;
}

/**
 * Converts one or multiple image files (JPG, PNG, WebP) into a clean, printable PDF document.
 */
export async function imagesToPdf(files: File[]): Promise<File> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    let imageBytes: Uint8Array;
    let isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);

    if (isJpg || isPng) {
      const buffer = await file.arrayBuffer();
      imageBytes = new Uint8Array(buffer);
    } else {
      // Normalize other image formats (WebP, GIF) to JPEG via offscreen canvas
      const imgBitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = imgBitmap.width;
      canvas.height = imgBitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(imgBitmap, 0, 0);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const buffer = await fetch(jpegDataUrl).then((r) => r.arrayBuffer());
      imageBytes = new Uint8Array(buffer);
      isJpg = true;
    }

    const embeddedImage = isJpg
      ? await pdfDoc.embedJpg(imageBytes)
      : await pdfDoc.embedPng(imageBytes);

    // Standard A4 dimensions
    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const MARGIN = 36; // 0.5 inch margin

    const availW = A4_WIDTH - MARGIN * 2;
    const availH = A4_HEIGHT - MARGIN * 2;

    const scale = Math.min(availW / embeddedImage.width, availH / embeddedImage.height, 1);
    const drawW = embeddedImage.width * scale;
    const drawH = embeddedImage.height * scale;

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(embeddedImage, {
      x: MARGIN + (availW - drawW) / 2,
      y: MARGIN + (availH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return createPdfFile(pdfBytes, 'images_document.pdf');
}

/**
 * Creates an A4 sheet tiled with 6 or 8 passport photos (35x45mm) with cut lines, ready to print.
 */
export async function generatePassportPhotoPdf(
  imageSource: string | File,
  photoCount: 6 | 8 = 8
): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const A4_WIDTH = 595.28; // 210mm
  const A4_HEIGHT = 841.89; // 297mm

  // Convert image source to JPEG bytes
  let jpegBytes: Uint8Array;
  if (typeof imageSource === 'string') {
    const buffer = await fetch(imageSource).then((r) => r.arrayBuffer());
    jpegBytes = new Uint8Array(buffer);
  } else {
    const imgBitmap = await createImageBitmap(imageSource);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(imgBitmap, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const buffer = await fetch(dataUrl).then((r) => r.arrayBuffer());
    jpegBytes = new Uint8Array(buffer);
  }

  const embeddedImage = await pdfDoc.embedJpg(jpegBytes);
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  // Standard Passport Dimensions: 35mm x 45mm (approx 99.2pt x 127.5pt)
  const PHOTO_W = 99.21;
  const PHOTO_H = 127.56;
  const GAP_X = 20;
  const GAP_Y = 24;

  const cols = photoCount === 6 ? 3 : 4;
  const rows = photoCount === 6 ? 2 : 2;

  const totalGridW = cols * PHOTO_W + (cols - 1) * GAP_X;
  const totalGridH = rows * PHOTO_H + (rows - 1) * GAP_Y;

  const startX = (A4_WIDTH - totalGridW) / 2;
  const startY = A4_HEIGHT - 120 - totalGridH;

  // Header Title on A4 Sheet
  // Draw light boundary and trim guidelines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (PHOTO_W + GAP_X);
      const y = startY + (rows - 1 - r) * (PHOTO_H + GAP_Y);

      // Draw photo
      page.drawImage(embeddedImage, {
        x,
        y,
        width: PHOTO_W,
        height: PHOTO_H,
      });

      // Draw thin border guideline for clean trimming
      page.drawRectangle({
        x: x - 0.5,
        y: y - 0.5,
        width: PHOTO_W + 1,
        height: PHOTO_H + 1,
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 0.5,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return createPdfFile(pdfBytes, 'passport_photos_a4.pdf');
}

/**
 * Creates an ID Card printing layout (Front and Back side-by-side or stacked on A4).
 */
export async function generateIdCardPdf(
  frontImage: File,
  backImage?: File
): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  // Standard ID Card: 85.6mm x 54mm (approx 242.6pt x 153.0pt)
  const CARD_W = 242.6;
  const CARD_H = 153.0;

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const loadJpgBytes = async (file: File) => {
    const imgBitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgBitmap, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const buffer = await fetch(dataUrl).then((r) => r.arrayBuffer());
    return new Uint8Array(buffer);
  };

  const frontBytes = await loadJpgBytes(frontImage);
  const embeddedFront = await pdfDoc.embedJpg(frontBytes);

  const startX = (A4_WIDTH - CARD_W) / 2;
  const topY = A4_HEIGHT - 220 - CARD_H;

  // Draw Front Card
  page.drawImage(embeddedFront, {
    x: startX,
    y: topY,
    width: CARD_W,
    height: CARD_H,
  });

  page.drawRectangle({
    x: startX - 1,
    y: topY - 1,
    width: CARD_W + 2,
    height: CARD_H + 2,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  // If back image provided, stack it beneath with 40pt margin
  if (backImage) {
    const backBytes = await loadJpgBytes(backImage);
    const embeddedBack = await pdfDoc.embedJpg(backBytes);
    const backY = topY - CARD_H - 40;

    page.drawImage(embeddedBack, {
      x: startX,
      y: backY,
      width: CARD_W,
      height: CARD_H,
    });

    page.drawRectangle({
      x: startX - 1,
      y: backY - 1,
      width: CARD_W + 2,
      height: CARD_H + 2,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return createPdfFile(pdfBytes, 'id_card_layout_a4.pdf');
}

export const MAX_TOOL_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function validateToolFiles(
  files: File[],
  mode: 'pdf' | 'image' | 'image-or-pdf'
): { validFiles: File[]; errors: string[] } {
  const validFiles: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!file || file.size <= 0) {
      errors.push(`"${file?.name || 'Selected file'}" is empty (0 bytes).`);
      continue;
    }

    if (file.size > MAX_TOOL_FILE_SIZE_BYTES) {
      errors.push(`"${file.name}" exceeds the 100 MB maximum file size limit.`);
      continue;
    }

    const lower = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
    const isImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(lower);

    if (mode === 'pdf' && !isPdf) {
      errors.push(`"${file.name}" is not a PDF file. Please choose a .pdf document.`);
      continue;
    }
    if (mode === 'image' && !isImage) {
      errors.push(`"${file.name}" is not a supported image (JPG, PNG, WebP).`);
      continue;
    }
    if (mode === 'image-or-pdf' && !isPdf && !isImage) {
      errors.push(`"${file.name}" must be a PDF or image file.`);
      continue;
    }

    validFiles.push(file);
  }

  return { validFiles, errors };
}

export function formatCompressionSummary(originalBytes: number, newBytes: number): {
  savedPercent: number;
  summaryText: string;
} {
  if (originalBytes <= 0) {
    return { savedPercent: 0, summaryText: 'Compressed' };
  }
  const diff = Math.max(0, originalBytes - newBytes);
  const savedPercent = Math.round((diff / originalBytes) * 100);
  const origMb = (originalBytes / (1024 * 1024)).toFixed(2);
  const newMb = (newBytes / (1024 * 1024)).toFixed(2);
  return {
    savedPercent,
    summaryText:
      savedPercent > 0
        ? `${origMb} MB → ${newMb} MB (${savedPercent}% smaller)`
        : `${newMb} MB (already optimal)`,
  };
}

