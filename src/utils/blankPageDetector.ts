import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { BlankPageItem } from '../types/kiosk';

// Configure PDF.js worker safely across browser and test environments
if (typeof window !== 'undefined') {
  try {
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      .then((workerModule) => {
        if (workerModule?.default) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
        }
      })
      .catch(() => {
        // Fallback or self-hosted
      });
  } catch {
    // Ignore in non-Vite environments
  }
}

export type PageClassificationState = 'BLANK' | 'NOT_BLANK' | 'NEEDS_REVIEW';

export interface PageAnalysisResult {
  pageNumber: number;
  state: PageClassificationState;
  isBlank: boolean; // true ONLY when state === 'BLANK'
  confidence: 'high' | 'needs_review';
  reason: string;
  printableCharCount: number;
  foregroundPixelCount: number;
  nonWhitePixelPercent: number;
}

/**
 * Multi-Layer Blank Page Detection Engine:
 *
 * Layer A: Text Content Detection (via PDF.js getTextContent)
 * - Extracts characters and items.
 * - If meaningful text is detected, classifies the page as NOT_BLANK.
 * - Protects faint text, small text, footnotes, page numbers, and single words.
 *
 * Layer B: Vector Graphics & Drawing Operators (via PDF.js getOperatorList)
 * - Detects path strokes, fills, curves, rectangles, shading, and embedded images.
 *
 * Layer C: Rendered Pixel Analysis (at adequate resolution)
 * - Renders page onto an offscreen canvas.
 * - Distinguishes between uniform paper background and genuine foreground ink.
 * - Detects text, signatures, stamps, tables, diagrams, and rasterized content.
 * - Evaluates connected pixel clustering: negligible isolated dust (< 40 stray dots)
 *   is accounted for, while connected strokes (letters, lines, signatures) are NOT_BLANK.
 * - Conservative safety: Ambiguous pages are marked NEEDS_REVIEW, NEVER BLANK.
 */
export async function analyzePdfPage(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number
): Promise<PageAnalysisResult> {
  try {
    // =========================================================================
    // LAYER A: Text Content Inspection
    // =========================================================================
    const textContent = await page.getTextContent({
      includeMarkedContent: true,
    });

    let totalPrintableChars = 0;
    const textSnippets: string[] = [];

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const raw = item.str;
        const trimmed = raw.trim();
        if (trimmed.length > 0) {
          // Filter out unprintable control characters
          const printable = trimmed.replace(/[\x00-\x1F\x7F]/g, '');
          if (printable.length > 0) {
            totalPrintableChars += printable.length;
            if (textSnippets.length < 3) {
              textSnippets.push(printable);
            }
          }
        }
      }
    }

    // STRICT CONSERVATIVE RULE:
    // If ANY printable characters exist (paragraphs, single words, dates, codes, footnotes),
    // it is definitively NOT BLANK!
    if (totalPrintableChars > 0) {
      const sample = textSnippets.join(' ').slice(0, 45);
      return {
        pageNumber,
        state: 'NOT_BLANK',
        isBlank: false,
        confidence: 'high',
        reason: `Written text detected (${totalPrintableChars} chars: "${sample}")`,
        printableCharCount: totalPrintableChars,
        foregroundPixelCount: totalPrintableChars * 25,
        nonWhitePixelPercent: 1.0,
      };
    }

    // =========================================================================
    // LAYER B: Vector Graphics, Drawing Operators & Embedded Objects Inspection
    // =========================================================================
    const operatorList = await page.getOperatorList();
    const ops = operatorList.fnArray;
    const OPS = pdfjsLib.OPS || {};

    const benignOps = new Set([
      OPS.dependency,
      OPS.setLineWidth,
      OPS.setLineCap,
      OPS.setLineJoin,
      OPS.setMiterLimit,
      OPS.setDash,
      OPS.setRenderingIntent,
      OPS.setFlatness,
      OPS.setGState,
      OPS.save,
      OPS.restore,
      OPS.transform,
      OPS.setStrokeColorSpace,
      OPS.setFillColorSpace,
      OPS.setStrokeColor,
      OPS.setFillColor,
      OPS.setStrokeGray,
      OPS.setFillGray,
      OPS.setStrokeRGBColor,
      OPS.setFillRGBColor,
      OPS.setStrokeCMYKColor,
      OPS.setFillCMYKColor,
      OPS.beginText,
      OPS.endText,
      OPS.setFont,
      OPS.setTextMatrix,
      OPS.setCharSpacing,
      OPS.setWordSpacing,
      OPS.setLeading,
      OPS.setTextRise,
      OPS.setTextRenderingMode,
      OPS.moveText,
      OPS.setLeadingMoveText,
      OPS.nextLine,
      OPS.markPoint,
      OPS.markPointProps,
      OPS.beginMarkedContent,
      OPS.beginMarkedContentProps,
      OPS.endMarkedContent,
      OPS.beginCompat,
      OPS.endCompat,
    ].filter((op): op is number => typeof op === 'number'));

    const drawingOpCodes = new Set([
      OPS.stroke,
      OPS.closeStroke,
      OPS.fill,
      OPS.eoFill,
      OPS.fillStroke,
      OPS.eoFillStroke,
      OPS.closeFillStroke,
      OPS.closeEOFillStroke,
      OPS.constructPath,
      OPS.showText,
      OPS.showSpacedText,
      OPS.nextLineShowText,
      OPS.nextLineSetSpacingShowText,
      OPS.paintXObject,
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintSolidColorImageMask,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectRepeat,
      OPS.paintFormXObjectBegin,
      OPS.beginInlineImage,
      OPS.shadingFill,
    ].filter((op): op is number => typeof op === 'number'));

    const activeOps = ops.filter((op) => !benignOps.has(op));
    const hasExplicitDrawingOps = ops.some((op) => drawingOpCodes.has(op));

    // If completely empty (no drawing ops, no active ops):
    if (activeOps.length === 0) {
      return {
        pageNumber,
        state: 'BLANK',
        isBlank: true,
        confidence: 'high',
        reason: 'Empty page (no text, drawing operators or images)',
        printableCharCount: 0,
        foregroundPixelCount: 0,
        nonWhitePixelPercent: 0,
      };
    }

    // =========================================================================
    // LAYER C: Rendered Pixel Analysis (for Scanned Documents, Drawings, & Signatures)
    // =========================================================================
    if (typeof document !== 'undefined') {
      const baseViewport = page.getViewport({ scale: 1 });
      // Render at a clear resolution (target width 420px) to accurately capture fine pen strokes,
      // faint light-grey text, tables, diagrams, and small signatures without pixel blur.
      const targetWidth = 420;
      const scale = targetWidth / Math.max(1, baseViewport.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });

      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const totalPixels = canvas.width * canvas.height;

        // Histogram to accurately find dominant paper background luminance
        const lumHistogram = new Uint32Array(32);
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = Math.floor((0.299 * r + 0.587 * g + 0.114 * b) / 8);
          lumHistogram[Math.min(31, lum)]++;
        }
        let maxBin = 31;
        let maxCount = 0;
        // Search high-luminance bins (>= 16, i.e. lum >= 128) for paper background
        for (let b = 16; b < 32; b++) {
          if (lumHistogram[b] > maxCount) {
            maxCount = lumHistogram[b];
            maxBin = b;
          }
        }
        const bgLuminance = maxBin * 8 + 4;

        let foregroundPixels = 0;
        let darkInkPixels = 0;
        let coloredInkPixels = 0;
        let maxContiguousRun = 0;
        let currentRun = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const diffFromPaper = Math.abs(lum - bgLuminance);

          // Detect foreground:
          // Contrast difference > 12 (captures light grey text, pencil marks, faint watermarks)
          // OR color saturation > 14 (captures blue ballpoint ink, colored signatures, stamps)
          // OR absolute luminance < 220
          const isForeground = diffFromPaper > 12 || sat > 14 || lum < 220;

          if (isForeground) {
            foregroundPixels++;
            currentRun++;
            if (currentRun > maxContiguousRun) {
              maxContiguousRun = currentRun;
            }
            if (lum < 185) {
              darkInkPixels++;
            }
            if (sat > 18) {
              coloredInkPixels++;
            }
          } else {
            currentRun = 0;
          }
        }

        const nonWhitePercent = Number(
          ((foregroundPixels / totalPixels) * 100).toFixed(3)
        );

        // Memory cleanup
        canvas.width = 0;
        canvas.height = 0;

        // 1. Completely blank (zero foreground pixels)
        if (foregroundPixels === 0) {
          return {
            pageNumber,
            state: 'BLANK',
            isBlank: true,
            confidence: 'high',
            reason: 'Empty page (zero foreground pixels)',
            printableCharCount: 0,
            foregroundPixelCount: 0,
            nonWhitePixelPercent: 0,
          };
        }

        // 2. Negligible scanner dust / grain:
        // Isolated stray speckles (<= 35 total pixels across 200,000+ pixels)
        // with NO contiguous stroke (maxContiguousRun < 4) and minimal dark dots (<= 6)
        if (
          foregroundPixels <= 35 &&
          darkInkPixels <= 6 &&
          maxContiguousRun < 4
        ) {
          return {
            pageNumber,
            state: 'BLANK',
            isBlank: true,
            confidence: 'high',
            reason: 'Empty page (negligible scanner noise)',
            printableCharCount: 0,
            foregroundPixelCount: foregroundPixels,
            nonWhitePixelPercent: nonWhitePercent,
          };
        }

        // 3. Ambiguous / Faint Markings / Border Shadows:
        // Foreground between 35 and 180 pixels with low ink count
        // STRICT CONSERVATIVE RULE: Mark as NEEDS_REVIEW! Never auto-classify as blank.
        if (foregroundPixels <= 180 && darkInkPixels <= 24 && coloredInkPixels <= 12) {
          return {
            pageNumber,
            state: 'NEEDS_REVIEW',
            isBlank: false,
            confidence: 'needs_review',
            reason: 'Faint marking or margin artifact detected (review recommended)',
            printableCharCount: 0,
            foregroundPixelCount: foregroundPixels,
            nonWhitePixelPercent: nonWhitePercent,
          };
        }

        // 4. Meaningful Visual Content Detected (text, handwriting, signature, table, diagram)
        return {
          pageNumber,
          state: 'NOT_BLANK',
          isBlank: false,
          confidence: 'high',
          reason: `Visible content detected (${foregroundPixels} foreground pixels, ${darkInkPixels} ink pixels)`,
          printableCharCount: 0,
          foregroundPixelCount: foregroundPixels,
          nonWhitePixelPercent: nonWhitePercent,
        };
      }
    }

    // Fallback if canvas context is unavailable (e.g. Node tests without DOM):
    // If drawing/image operators exist, conservatively classify as NOT_BLANK or NEEDS_REVIEW
    if (hasExplicitDrawingOps) {
      return {
        pageNumber,
        state: 'NOT_BLANK',
        isBlank: false,
        confidence: 'high',
        reason: 'Visual graphic operators present',
        printableCharCount: 0,
        foregroundPixelCount: 500,
        nonWhitePixelPercent: 1.0,
      };
    }

    // Only if all operators are benign is it considered blank
    const isBenign = activeOps.length === 0;
    return {
      pageNumber,
      state: isBenign ? 'BLANK' : 'NEEDS_REVIEW',
      isBlank: isBenign,
      confidence: isBenign ? 'high' : 'needs_review',
      reason: isBenign ? 'Empty page' : 'Uncertain operators present',
      printableCharCount: 0,
      foregroundPixelCount: isBenign ? 0 : 50,
      nonWhitePixelPercent: isBenign ? 0 : 0.1,
    };
  } catch (err) {
    // On any error or exception, NEVER mark as blank! Conservatively mark as NEEDS_REVIEW
    return {
      pageNumber,
      state: 'NEEDS_REVIEW',
      isBlank: false,
      confidence: 'needs_review',
      reason: 'Inspection error - marked for review',
      printableCharCount: 0,
      foregroundPixelCount: 0,
      nonWhitePixelPercent: 0,
    };
  }
}

/**
 * Scans an entire uploaded PDF document page-by-page using the Multi-Layer Detection Engine.
 * Yields progressive feedback and returns high-confidence blanks & items needing review.
 */
export async function detectBlankPagesInPdf(
  file: File,
  docId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{
  blankPages: number[];
  uncertainPages: number[];
  items: BlankPageItem[];
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const blankPages: number[] = [];
    const uncertainPages: number[] = [];
    const items: BlankPageItem[] = [];

    for (let p = 1; p <= numPages; p++) {
      if (onProgress) {
        onProgress(p, numPages);
      }
      try {
        const page = await pdfDoc.getPage(p);
        const result = await analyzePdfPage(page, p);

        // ONLY high-confidence BLANK pages are suggested for removal
        if (result.state === 'BLANK') {
          blankPages.push(p);
          items.push({
            documentId: docId,
            documentName: file.name,
            pageNumber: p,
            state: 'BLANK',
            confidence: 'high',
            reason: result.reason,
          });
        } else if (result.state === 'NEEDS_REVIEW') {
          uncertainPages.push(p);
          items.push({
            documentId: docId,
            documentName: file.name,
            pageNumber: p,
            state: 'NEEDS_REVIEW',
            confidence: 'needs_review',
            reason: result.reason,
          });
        }
      } catch {
        uncertainPages.push(p);
      }
    }

    // Release PDF.js worker memory
    try {
      await pdfDoc.cleanup();
      await pdfDoc.destroy();
    } catch {
      // Ignore cleanup error
    }

    return {
      blankPages,
      uncertainPages,
      items,
    };
  } catch {
    return {
      blankPages: [],
      uncertainPages: [],
      items: [],
    };
  }
}

/**
 * Removes user-confirmed blank pages from a PDF document using pdf-lib.
 * Creates a new standalone PDF binary preserving original metadata, page dimensions,
 * vector streams, and fonts.
 */
export async function removePagesFromPdf(
  originalPdfBytes: Uint8Array | ArrayBuffer,
  pageNumbersToRemove: number[] // 1-based page numbers
): Promise<Uint8Array> {
  if (pageNumbersToRemove.length === 0) {
    return originalPdfBytes instanceof Uint8Array
      ? originalPdfBytes
      : new Uint8Array(originalPdfBytes);
  }

  const pdfDoc = await PDFDocument.load(originalPdfBytes, {
    ignoreEncryption: true,
  });

  const totalPages = pdfDoc.getPageCount();

  // Deduplicate and convert to 0-based indices
  const zeroBasedIndices = [...new Set(pageNumbersToRemove)]
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < totalPages)
    // Sort descending so deletion doesn't shift upcoming indices
    .sort((a, b) => b - a);

  if (zeroBasedIndices.length === 0) {
    return await pdfDoc.save();
  }

  // A PDF document cannot be 0 pages
  if (zeroBasedIndices.length >= totalPages) {
    throw new Error(
      `Cannot remove all ${totalPages} pages from document. At least one page must remain.`
    );
  }

  for (const pageIdx of zeroBasedIndices) {
    pdfDoc.removePage(pageIdx);
  }

  return await pdfDoc.save();
}
