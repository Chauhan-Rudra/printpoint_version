import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BackendPricingConfig,
  calculatePerDocumentPricing,
  resolveStationPricingConfig,
  verifyPricingAndSessionForPayment,
} from './pricingService';
import { KIOSK_STATIONS, KioskSessionState } from './kioskSession';
import { UploadedPrintDocument } from '../types/kiosk';

const stationConfig: BackendPricingConfig = {
  stationId: 'kiosk-04',
  currency: 'INR',
  bwPerPageInr: 1,
  colourPerPageInr: 3,
  bwDuplexSheetInr: 1.5,
  colourDuplexSheetInr: 5,
  supportsColour: true,
  supportsDuplex: true,
  minCopies: 1,
  maxCopies: 99,
  source: 'kiosk-station',
};

function makeReadyDoc(
  overrides: Partial<UploadedPrintDocument>
): UploadedPrintDocument {
  return {
    id: 'doc-1',
    orderIndex: 0,
    name: 'Doc_One.pdf',
    sizeBytes: 2048,
    pageCount: 5,
    progressPercent: 100,
    status: 'Ready',
    rawFile: new File(['%PDF-1.4\n%%EOF'], overrides.name || 'Doc_One.pdf', {
      type: 'application/pdf',
    }),
    settings: {
      colourMode: 'bw',
      sides: '1-sided',
      copies: 1,
      removeBlankPages: false,
    },
    ...overrides,
  };
}

test('resolveStationPricingConfig fails cleanly when station config is missing or invalid', () => {
  const missing = resolveStationPricingConfig(null);
  assert.equal(missing.available, false);

  const invalidRates = resolveStationPricingConfig({
    ...KIOSK_STATIONS[0],
    bwRateInr: 0,
  });
  assert.equal(invalidRates.available, false);

  const valid = resolveStationPricingConfig(KIOSK_STATIONS[0]);
  assert.equal(valid.available, true);
  if (valid.available) {
    assert.equal(valid.config.bwPerPageInr, 1);
    assert.equal(valid.config.colourPerPageInr, 3);
    assert.equal(valid.config.bwDuplexSheetInr, 1.5);
    assert.equal(valid.config.colourDuplexSheetInr, 5);
  }
});

test('calculatePerDocumentPricing evaluates each document independently and distinguishes sheets, pages, and duplex remainder', () => {
  const doc1 = makeReadyDoc({
    id: 'd1',
    orderIndex: 0,
    name: 'First.pdf',
    pageCount: 5,
    settings: {
      colourMode: 'colour',
      sides: '2-sided', // 2 full duplex sheets (2*5=10) + 1 single page remainder (3) = ₹13/copy * 2 copies = ₹26
      copies: 2,
      removeBlankPages: false,
    },
  });

  const doc2 = makeReadyDoc({
    id: 'd2',
    orderIndex: 1,
    name: 'Second.pdf',
    pageCount: 4,
    settings: {
      colourMode: 'bw',
      sides: '1-sided', // 4 pages * ₹1 = ₹4/copy * 3 copies = ₹12
      copies: 3,
      removeBlankPages: false,
    },
  });

  // Pass intentionally unsorted to verify original orderIndex preservation
  const breakdown = calculatePerDocumentPricing([doc2, doc1], stationConfig);

  assert.equal(breakdown.documentCount, 2);
  assert.deepEqual(
    breakdown.items.map((i) => i.id),
    ['d1', 'd2']
  );

  // Doc 1: 5 pages 2-sided => 3 sheets/copy * 2 copies = 6 sheets; 10 impressions; ₹26
  assert.equal(breakdown.items[0].sheetsPerCopy, 3);
  assert.equal(breakdown.items[0].totalSheets, 6);
  assert.equal(breakdown.items[0].totalImpressions, 10);
  assert.equal(breakdown.items[0].subtotalInr, 26);

  // Doc 2: 4 pages 1-sided => 4 sheets/copy * 3 copies = 12 sheets; 12 impressions; ₹12
  assert.equal(breakdown.items[1].totalSheets, 12);
  assert.equal(breakdown.items[1].totalImpressions, 12);
  assert.equal(breakdown.items[1].subtotalInr, 12);

  // Combined totals
  assert.equal(breakdown.totalCopies, 5);
  assert.equal(breakdown.totalSheets, 18);
  assert.equal(breakdown.totalImpressions, 22);
  assert.equal(breakdown.colourDocumentsCount, 1);
  assert.equal(breakdown.bwDocumentsCount, 1);
  assert.equal(breakdown.twoSidedDocumentsCount, 1);
  assert.equal(breakdown.oneSidedDocumentsCount, 1);
  assert.equal(breakdown.combinedTotalInr, 38);
});

test('verifyPricingAndSessionForPayment rejects expired sessions and incomplete documents before payment', async () => {
  const doc = makeReadyDoc({ id: 'd1', pageCount: 3 });

  const expiredSession: KioskSessionState = {
    connected: true,
    activeStation: KIOSK_STATIONS[0],
    pairedAt: Date.now() - 3600_000,
    expiresAt: Date.now() - 1000,
  };

  const expiredRes = await verifyPricingAndSessionForPayment(
    [doc],
    stationConfig,
    expiredSession
  );
  assert.equal(expiredRes.ok, false);
  if (!expiredRes.ok) {
    assert.equal(expiredRes.reason, 'session-expired');
  }

  const validSession: KioskSessionState = {
    connected: true,
    activeStation: KIOSK_STATIONS[0],
    pairedAt: Date.now(),
    expiresAt: Date.now() + 600_000,
  };

  const missingFileDoc = makeReadyDoc({ id: 'd2', rawFile: undefined, originalFile: undefined });
  const invalidDocRes = await verifyPricingAndSessionForPayment(
    [missingFileDoc],
    stationConfig,
    validSession
  );
  assert.equal(invalidDocRes.ok, false);
  if (!invalidDocRes.ok) {
    assert.equal(invalidDocRes.reason, 'invalid-documents');
  }

  const okRes = await verifyPricingAndSessionForPayment(
    [doc],
    stationConfig,
    validSession
  );
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.equal(okRes.verifiedTotalInr, 3);
  }
});
