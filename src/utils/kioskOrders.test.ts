import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveStationFromInput,
  pairKioskStation,
  getKioskSession,
  KIOSK_STATIONS,
} from './kioskSession';
import {
  recordPrintOrder,
  claimOrderRefund,
  getPrintOrders,
} from './kioskOrders';
import { getKioskWalletBalance } from './kioskWallet';
import { getTranslation } from './i18n';

describe('Kiosk Session, Orders, Refunds & i18n', () => {
  it('resolves known and numeric kiosk payloads dynamically', () => {
    const s07 = resolveStationFromInput('KIOSK-07');
    assert.strictEqual(s07.name, 'Kiosk #07');
    assert.strictEqual(s07.bwRateInr, 1);

    const s19 = resolveStationFromInput('https://printpoint.app/pair?station=19');
    assert.strictEqual(s19.name, 'Kiosk #19');

    const paired = pairKioskStation(KIOSK_STATIONS[1], 'KIOSK-07');
    assert.strictEqual(paired.activeStation.name, 'Kiosk #07');
    assert.strictEqual(getKioskSession().activeStation.name, 'Kiosk #07');
  });

  it('records failed print orders and processes instant wallet refunds once', () => {
    const balanceBefore = getKioskWalletBalance();
    const order = recordPrintOrder({
      kioskName: 'Kiosk #04',
      documentCount: 1,
      totalPages: 4,
      totalSheets: 4,
      colourLabel: 'Black & White',
      sidesLabel: '1-Sided',
      amountInr: 4,
      paymentMethod: 'Print Point Wallet',
      status: 'Failed',
      failureReason: 'Paper feed interruption on tray A',
      items: [
        {
          name: 'Notes.pdf',
          pages: 4,
          copies: 1,
          colourMode: 'bw',
          sides: '1-sided',
        },
      ],
    });

    assert.ok(getPrintOrders().some((o) => o.id === order.id && o.status === 'Failed'));

    const refund = claimOrderRefund(order.id);
    assert.strictEqual(refund.success, true);
    assert.strictEqual(refund.order?.status, 'Refunded');
    assert.strictEqual(refund.newBalance, Number((balanceBefore + 4).toFixed(2)));

    // Second refund attempt must be rejected
    const duplicate = claimOrderRefund(order.id);
    assert.strictEqual(duplicate.success, false);
  });

  it('returns valid localized dictionaries for English, Gujarati, and Hindi', () => {
    assert.strictEqual(getTranslation('English').navHome, 'Home');
    assert.strictEqual(getTranslation('ગુજરાતી').navHome, 'હોમ');
    assert.strictEqual(getTranslation('हिन्दी').navHome, 'होम');
  });

  it('respects user notification preference when recording alerts', async () => {
    const { pushAppNotification, getNotifications } = await import('./kioskOrders');
    const { saveUserProfile, resetUserProfile } = await import('./userProfile');

    saveUserProfile({ notificationsEnabled: false });
    const beforeCount = getNotifications().length;
    pushAppNotification({
      kind: 'print',
      title: 'Muted Alert',
      message: 'Should not persist when muted.',
    });
    assert.strictEqual(getNotifications().length, beforeCount);

    resetUserProfile();
  });
});

