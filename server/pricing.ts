/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ServerKioskStation {
  id: string;
  name: string;
  location: string;
  online: boolean;
  bwRateInr: number;
  colourRateInr: number;
  bwDuplexSheetInr: number;
  colourDuplexSheetInr: number;
  supportsColour: boolean;
  supportsDuplex: boolean;
  minCopies: number;
  maxCopies: number;
}

export interface ServerDocumentInput {
  docId: string;
  name: string;
  pageCount: number;
  blankPagesCount: number;
  colourMode: 'bw' | 'colour';
  sides: '1-sided' | '2-sided';
  copies: number;
  removeBlankPages: boolean;
}

export interface ServerDocumentPriceItem {
  docId: string;
  name: string;
  originalPages: number;
  removedBlankPagesCount: number;
  printablePages: number;
  colourMode: 'bw' | 'colour';
  sides: '1-sided' | '2-sided';
  copies: number;
  sheetsPerCopy: number;
  totalSheets: number;
  totalImpressions: number;
  perCopyInr: number;
  subtotalInr: number;
}

export interface ServerPricingBreakdown {
  stationId: string;
  currency: 'INR';
  items: ServerDocumentPriceItem[];
  totalOriginalPages: number;
  totalPrintablePages: number;
  totalSheets: number;
  totalImpressions: number;
  totalCopies: number;
  totalInr: number;
}

function roundInr(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeAuthoritativePricing(
  station: ServerKioskStation,
  docs: ServerDocumentInput[]
): ServerPricingBreakdown {
  let totalOriginalPages = 0;
  let totalPrintablePages = 0;
  let totalSheets = 0;
  let totalImpressions = 0;
  let totalCopies = 0;
  let totalInr = 0;

  const items: ServerDocumentPriceItem[] = docs.map((doc) => {
    const copies = Math.min(
      station.maxCopies,
      Math.max(station.minCopies, Math.floor(doc.copies || 1))
    );
    const effectiveColourMode: 'bw' | 'colour' =
      doc.colourMode === 'colour' && station.supportsColour ? 'colour' : 'bw';
    const effectiveSides: '1-sided' | '2-sided' =
      doc.sides === '2-sided' && station.supportsDuplex ? '2-sided' : '1-sided';

    const originalPages = Math.max(1, Math.floor(doc.pageCount || 1));
    const removedBlankPagesCount = doc.removeBlankPages
      ? Math.min(Math.max(0, originalPages - 1), Math.max(0, Math.floor(doc.blankPagesCount || 0)))
      : 0;
    const printablePages = Math.max(1, originalPages - removedBlankPagesCount);

    const perPageRate =
      effectiveColourMode === 'colour' ? station.colourRateInr : station.bwRateInr;
    const fullDuplexSheetRate =
      effectiveColourMode === 'colour' ? station.colourDuplexSheetInr : station.bwDuplexSheetInr;

    let sheetsPerCopy = printablePages;
    let perCopyInr = 0;

    if (effectiveSides === '2-sided') {
      const fullSheets = Math.floor(printablePages / 2);
      const remainderPage = printablePages % 2;
      sheetsPerCopy = fullSheets + remainderPage;
      perCopyInr = roundInr(fullSheets * fullDuplexSheetRate + remainderPage * perPageRate);
    } else {
      sheetsPerCopy = printablePages;
      perCopyInr = roundInr(printablePages * perPageRate);
    }

    const docSheets = sheetsPerCopy * copies;
    const docImpressions = printablePages * copies;
    const subtotalInr = roundInr(perCopyInr * copies);

    totalOriginalPages += originalPages;
    totalPrintablePages += printablePages;
    totalSheets += docSheets;
    totalImpressions += docImpressions;
    totalCopies += copies;
    totalInr = roundInr(totalInr + subtotalInr);

    return {
      docId: doc.docId,
      name: doc.name,
      originalPages,
      removedBlankPagesCount,
      printablePages,
      colourMode: effectiveColourMode,
      sides: effectiveSides,
      copies,
      sheetsPerCopy,
      totalSheets: docSheets,
      totalImpressions: docImpressions,
      perCopyInr,
      subtotalInr,
    };
  });

  return {
    stationId: station.id,
    currency: 'INR',
    items,
    totalOriginalPages,
    totalPrintablePages,
    totalSheets,
    totalImpressions,
    totalCopies,
    totalInr,
  };
}
