import type * as pdfjsLib from 'pdfjs-dist';

export interface BlankPageDetectionResult {
  blankPageNumbers: number[]; // 1-based page numbers
  hasBlankPages: boolean;
  totalAnalyzed: number;
}

/**
 * Inspects a loaded PDF document to detect genuinely blank pages.
 * A page is considered blank if:
 * 1. It contains no text characters (trimmed string length === 0)
 * 2. It contains no visual paint operators (images, vector shapes, strokes, fills)
 */
export async function detectBlankPagesInPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy
): Promise<number[]> {
  const blankPages: number[] = [];
  const numPages = pdfDoc.numPages;

  // Drawing operators that render visible ink on a page
  const drawingOpCodes = new Set([
    20, // stroke
    22, // fill
    23, // eoFill
    24, // fillStroke
    25, // eoFillStroke
    48, // showText
    49, // showSpacedText
    85, // paintImageXObject
    86, // paintInlineImageXObject
    87, // paintImageMaskXObject
    88, // paintSolidColorImageMask
    92, // shadingFill
  ]);

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const hasText = textContent.items.some((item) => {
        const str = 'str' in item ? (item.str as string).trim() : '';
        return str.length > 0;
      });

      if (hasText) {
        continue;
      }

      const opList = await page.getOperatorList();
      const hasDrawing = opList.fnArray.some((fn) => drawingOpCodes.has(fn));

      if (!hasDrawing) {
        blankPages.push(i);
      }
    } catch {
      // If error inspecting page, conservatively do not mark as blank
    }
  }

  return blankPages;
}
