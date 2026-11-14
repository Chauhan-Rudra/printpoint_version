import { getFirebaseIdToken } from '../firebase';
import {
  ColourOption,
  DocumentSummaryItem,
  MultiDocPrintSummary,
  SidesOption,
  UploadedPrintDocument,
} from '../types/kiosk';
import { calculateDocumentSheets } from './kioskLogic';
import { KioskSessionState, KioskStation } from './kioskSession';

export const MIN_PRINT_COPIES = 1;
export const MAX_PRINT_COPIES = 99;

export interface BackendPricingConfig {
  stationId: string;
  currency: 'INR';
  bwPerPageInr: number;
  colourPerPageInr: number;
  bwDuplexSheetInr: number;
  colourDuplexSheetInr: number;
  supportsColour: boolean;
  supportsDuplex: boolean;
  minCopies: number;
  maxCopies: number;
  source: 'backend-api' | 'kiosk-station';
}

export type PricingConfigResult =
  | { available: true; config: BackendPricingConfig }
  | { available: false; error: string };

export interface DocumentPricingLineItem {
  id: string;
  orderIndex: number;
  name: string;
  originalPages: number;
  blankPagesSkipped: number;
  printablePagesPerCopy: number;
  colourMode: ColourOption;
  sides: SidesOption;
  copies: number;
  sheetsPerCopy: number;
  totalSheets: number;
  totalImpressions: number;
  unitRateInr: number;
  duplexSheetRateInr: number;
  subtotalInr: number;
}

export interface PerDocumentPricingBreakdown {
  documentCount: number;
  totalOriginalPages: number;
  totalPrintablePages: number;
  totalCopies: number;
  totalSheets: number;
  totalImpressions: number;
  bwDocumentsCount: number;
  colourDocumentsCount: number;
  bwPagesCount: number;
  colourPagesCount: number;
  oneSidedDocumentsCount: number;
  twoSidedDocumentsCount: number;
  combinedTotalInr: number;
  items: DocumentPricingLineItem[];
  summary: MultiDocPrintSummary;
}

export type PaymentVerificationResult =
  | {
      ok: true;
      verifiedTotalInr: number;
      breakdown: PerDocumentPricingBreakdown;
      verificationSource: 'backend-api' | 'kiosk-station';
    }
  | {
      ok: false;
      reason: 'session-expired' | 'invalid-documents' | 'pricing-unavailable' | 'network-error';
      error: string;
    };

function isPositiveFinite(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

export function resolveStationPricingConfig(
  station: KioskStation | null | undefined
): PricingConfigResult {
  if (!station || !station.id) {
    return {
      available: false,
      error: 'No active kiosk pricing configuration is available.',
    };
  }

  const bwPerPage = station.bwRateInr;
  const colourPerPage = station.colourRateInr;
  const bwDuplexSheet =
    station.bwDuplexSheetRateInr ??
    (isPositiveFinite(bwPerPage) ? Number((bwPerPage * 1.5).toFixed(2)) : NaN);
  const colourDuplexSheet =
    station.colourDuplexSheetRateInr ??
    (isPositiveFinite(colourPerPage)
      ? Number((colourPerPage * (5 / 3)).toFixed(2))
      : NaN);

  if (
    !isPositiveFinite(bwPerPage) ||
    !isPositiveFinite(colourPerPage) ||
    !isPositiveFinite(bwDuplexSheet) ||
    !isPositiveFinite(colourDuplexSheet)
  ) {
    return {
      available: false,
      error: `Pricing configuration for ${station.name} is incomplete or invalid.`,
    };
  }

  return {
    available: true,
    config: {
      stationId: station.id,
      currency: 'INR',
      bwPerPageInr: bwPerPage,
      colourPerPageInr: colourPerPage,
      bwDuplexSheetInr: bwDuplexSheet,
      colourDuplexSheetInr: colourDuplexSheet,
      supportsColour: Boolean(station.supportsColour),
      supportsDuplex: Boolean(station.supportsDuplex),
      minCopies: MIN_PRINT_COPIES,
      maxCopies: MAX_PRINT_COPIES,
      source: 'kiosk-station',
    },
  };
}

export async function fetchBackendPricingConfig(
  station: KioskStation | null | undefined,
  fetchFn: typeof fetch = fetch
): Promise<PricingConfigResult> {
  const configuredEndpoint =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_PRICING_CONFIG_URL;

  const endpoint =
    configuredEndpoint ||
    (typeof window !== 'undefined' ? '/api/pricing/config' : undefined);

  if (endpoint) {
    try {
      const url = new URL(
        endpoint,
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
      );
      if (station?.id) url.searchParams.set('stationId', station.id);
      const res = await fetchFn(url.toString(), { method: 'GET' });
      if (!res.ok) {
        return {
          available: false,
          error: `Pricing service returned status ${res.status}. Unable to load print rates.`,
        };
      }
      const data = (await res.json()) as Partial<BackendPricingConfig>;
      if (
        !isPositiveFinite(data.bwPerPageInr) ||
        !isPositiveFinite(data.colourPerPageInr) ||
        !isPositiveFinite(data.bwDuplexSheetInr) ||
        !isPositiveFinite(data.colourDuplexSheetInr)
      ) {
        return {
          available: false,
          error: 'Backend pricing response is missing valid rate fields.',
        };
      }

      return {
        available: true,
        config: {
          stationId: data.stationId || station?.id || 'kiosk-default',
          currency: 'INR',
          bwPerPageInr: data.bwPerPageInr,
          colourPerPageInr: data.colourPerPageInr,
          bwDuplexSheetInr: data.bwDuplexSheetInr,
          colourDuplexSheetInr: data.colourDuplexSheetInr,
          supportsColour: data.supportsColour ?? station?.supportsColour ?? true,
          supportsDuplex: data.supportsDuplex ?? station?.supportsDuplex ?? true,
          minCopies: data.minCopies ?? MIN_PRINT_COPIES,
          maxCopies: data.maxCopies ?? MAX_PRINT_COPIES,
          source: 'backend-api',
        },
      };
    } catch {
      return {
        available: false,
        error: 'Could not reach pricing configuration server. Check your connection and retry.',
      };
    }
  }

  return resolveStationPricingConfig(station);
}

export function calculatePerDocumentPricing(
  documents: UploadedPrintDocument[],
  config: BackendPricingConfig
): PerDocumentPricingBreakdown {
  const readyDocs = documents
    .filter((d) => d.status === 'Ready')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const orderedDocs =
    readyDocs.length > 0
      ? readyDocs
      : [...documents].sort((a, b) => a.orderIndex - b.orderIndex);

  let totalOriginalPages = 0;
  let totalPrintablePages = 0;
  let totalCopies = 0;
  let totalSheets = 0;
  let totalImpressions = 0;
  let bwDocumentsCount = 0;
  let colourDocumentsCount = 0;
  let bwPagesCount = 0;
  let colourPagesCount = 0;
  let oneSidedDocumentsCount = 0;
  let twoSidedDocumentsCount = 0;
  let combinedTotalInr = 0;

  const colourModes = new Set<ColourOption>();
  const sidesModes = new Set<SidesOption>();
  const copiesValues = new Set<number>();

  const items: DocumentPricingLineItem[] = orderedDocs.map((doc) => {
    const rawPages = Math.max(1, doc.pageCount);
    const shouldSkipBlanks = doc.settings.removeBlankPages ?? true;
    const rawBlanksCount = doc.blankPages?.length ?? 0;
    const blankPagesSkipped = shouldSkipBlanks
      ? Math.min(Math.max(0, rawPages - 1), rawBlanksCount)
      : 0;
    const printablePagesPerCopy = Math.max(1, rawPages - blankPagesSkipped);

    const colourMode: ColourOption =
      doc.settings.colourMode === 'colour' && config.supportsColour
        ? 'colour'
        : 'bw';
    const sides: SidesOption =
      doc.settings.sides === '2-sided' && config.supportsDuplex
        ? '2-sided'
        : '1-sided';
    const copies = Math.max(
      config.minCopies,
      Math.min(config.maxCopies, Math.round(doc.settings.copies || 1))
    );

    colourModes.add(colourMode);
    sidesModes.add(sides);
    copiesValues.add(copies);

    const unitRateInr =
      colourMode === 'colour' ? config.colourPerPageInr : config.bwPerPageInr;
    const duplexSheetRateInr =
      colourMode === 'colour'
        ? config.colourDuplexSheetInr
        : config.bwDuplexSheetInr;

    const sheetsPerCopy = calculateDocumentSheets(printablePagesPerCopy, sides, 1);
    const docTotalSheets = sheetsPerCopy * copies;
    const docTotalImpressions = printablePagesPerCopy * copies;

    let costPerCopyInr = 0;
    if (sides === '1-sided') {
      costPerCopyInr = printablePagesPerCopy * unitRateInr;
      oneSidedDocumentsCount += 1;
    } else {
      const fullDuplexSheets = Math.floor(printablePagesPerCopy / 2);
      const remainderSinglePages = printablePagesPerCopy % 2;
      costPerCopyInr =
        fullDuplexSheets * duplexSheetRateInr +
        remainderSinglePages * unitRateInr;
      twoSidedDocumentsCount += 1;
    }

    const subtotalInr = Number((costPerCopyInr * copies).toFixed(2));

    if (colourMode === 'colour') {
      colourDocumentsCount += 1;
      colourPagesCount += docTotalImpressions;
    } else {
      bwDocumentsCount += 1;
      bwPagesCount += docTotalImpressions;
    }

    totalOriginalPages += rawPages;
    totalPrintablePages += printablePagesPerCopy;
    totalCopies += copies;
    totalSheets += docTotalSheets;
    totalImpressions += docTotalImpressions;
    combinedTotalInr += subtotalInr;

    return {
      id: doc.id,
      orderIndex: doc.orderIndex,
      name: doc.name,
      originalPages: rawPages,
      blankPagesSkipped,
      printablePagesPerCopy,
      colourMode,
      sides,
      copies,
      sheetsPerCopy,
      totalSheets: docTotalSheets,
      totalImpressions: docTotalImpressions,
      unitRateInr,
      duplexSheetRateInr,
      subtotalInr,
    };
  });

  const roundedTotal = Number(combinedTotalInr.toFixed(2));

  const colourModeLabel =
    colourModes.size === 1
      ? colourModes.has('colour')
        ? 'Colour'
        : 'Black & White'
      : 'Mixed (Per-document)';

  const sidesModeLabel =
    sidesModes.size === 1
      ? sidesModes.has('2-sided')
        ? '2-Sided'
        : '1-Sided'
      : 'Mixed (Per-document)';

  const singleCopyVal = copiesValues.values().next().value ?? 1;
  const copiesLabel =
    copiesValues.size === 1
      ? `${singleCopyVal} ${singleCopyVal === 1 ? 'copy' : 'copies'}`
      : `${totalCopies} copies (per-doc)`;

  const summaryItems: DocumentSummaryItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    originalPages: item.printablePagesPerCopy,
    copies: item.copies,
    colourMode: item.colourMode,
    sides: item.sides,
    estimatedSheets: item.totalSheets,
    subtotalPrice: item.subtotalInr,
  }));

  const summary: MultiDocPrintSummary = {
    documentCount: items.length,
    totalOriginalPages: totalPrintablePages,
    colourModeLabel,
    sidesModeLabel,
    copiesLabel,
    totalEstimatedSheets: totalSheets,
    totalPrice: roundedTotal,
    items: summaryItems,
  };

  return {
    documentCount: items.length,
    totalOriginalPages,
    totalPrintablePages,
    totalCopies,
    totalSheets,
    totalImpressions,
    bwDocumentsCount,
    colourDocumentsCount,
    bwPagesCount,
    colourPagesCount,
    oneSidedDocumentsCount,
    twoSidedDocumentsCount,
    combinedTotalInr: roundedTotal,
    items,
    summary,
  };
}

export async function verifyPricingAndSessionForPayment(
  documents: UploadedPrintDocument[],
  config: BackendPricingConfig | null,
  session: KioskSessionState,
  fetchFn: typeof fetch = fetch
): Promise<PaymentVerificationResult> {
  const isExpired =
    !session.connected ||
    (typeof session.expiresAt === 'number' && Date.now() > session.expiresAt);
  if (isExpired) {
    return {
      ok: false,
      reason: 'session-expired',
      error: 'Your kiosk session has expired. Reconnect to your kiosk before continuing to payment.',
    };
  }

  if (!config) {
    return {
      ok: false,
      reason: 'pricing-unavailable',
      error: 'Pricing configuration is unavailable. Reload pricing rates before continuing.',
    };
  }

  const readyDocs = documents
    .filter((d) => d.status === 'Ready')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (readyDocs.length === 0 || readyDocs.length !== documents.length) {
    return {
      ok: false,
      reason: 'invalid-documents',
      error: 'One or more documents are not ready for printing. Remove or resolve failed files first.',
    };
  }

  for (const doc of readyDocs) {
    if (!doc.rawFile && !doc.originalFile) {
      return {
        ok: false,
        reason: 'invalid-documents',
        error: `Document "${doc.name}" is missing its printable file reference.`,
      };
    }
    if (!Number.isFinite(doc.pageCount) || doc.pageCount < 1) {
      return {
        ok: false,
        reason: 'invalid-documents',
        error: `Document "${doc.name}" has an invalid page count.`,
      };
    }
    if (
      !Number.isFinite(doc.settings.copies) ||
      doc.settings.copies < config.minCopies ||
      doc.settings.copies > config.maxCopies
    ) {
      return {
        ok: false,
        reason: 'invalid-documents',
        error: `Copies for "${doc.name}" must be between ${config.minCopies} and ${config.maxCopies}.`,
      };
    }
  }

  const breakdown = calculatePerDocumentPricing(readyDocs, config);

  const customValidateEndpoint =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_PRICING_VALIDATE_URL;

  const canUseDefaultBackendQuote =
    typeof window !== 'undefined' &&
    Boolean(session.sessionToken) &&
    readyDocs.every((d) => Boolean(d.serverDocId));

  const validateEndpoint =
    customValidateEndpoint || (canUseDefaultBackendQuote ? '/api/pricing/quote' : undefined);

  if (validateEndpoint) {
    try {
      const token = await getFirebaseIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetchFn(validateEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stationId: session.activeStation.id,
          sessionToken: session.sessionToken,
          items: readyDocs.map((d) => ({
            docId: d.serverDocId || d.id,
            name: d.name,
            copies: d.settings.copies,
            colourMode: d.settings.colourMode,
            sides: d.settings.sides,
            removeBlankPages: d.settings.removeBlankPages,
          })),
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        valid?: boolean;
        verifiedTotalInr?: number;
        error?: string;
      };

      if (!res.ok || payload.ok === false || payload.valid === false || !isPositiveFinite(payload.verifiedTotalInr)) {
        return {
          ok: false,
          reason: 'pricing-unavailable',
          error: payload.error || `Backend price verification failed (${res.status}). Please retry.`,
        };
      }

      const verifiedSummary: MultiDocPrintSummary = {
        ...breakdown.summary,
        totalPrice: Number(payload.verifiedTotalInr.toFixed(2)),
      };

      return {
        ok: true,
        verifiedTotalInr: Number(payload.verifiedTotalInr.toFixed(2)),
        breakdown: {
          ...breakdown,
          combinedTotalInr: Number(payload.verifiedTotalInr.toFixed(2)),
          summary: verifiedSummary,
        },
        verificationSource: 'backend-api',
      };
    } catch {
      return {
        ok: false,
        reason: 'network-error',
        error: 'Could not verify pricing with the backend. Check your connection and retry.',
      };
    }
  }

  return {
    ok: true,
    verifiedTotalInr: breakdown.combinedTotalInr,
    breakdown,
    verificationSource: 'kiosk-station',
  };
}
