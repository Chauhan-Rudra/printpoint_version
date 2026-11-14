import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateKioskQrCode } from './kioskQrValidator';
import { markSessionTokenUsed } from './kioskSession';

describe('Kiosk QR Code Validation', () => {
  const futureMs = Date.now() + 10 * 60 * 1000;
  const pastMs = Date.now() - 60 * 1000;

  it('validates a standard active kiosk URL with station id and session token', () => {
    const result = validateKioskQrCode(
      `https://kiosk.printpoint.app/session?kiosk=04&token=sess_active_001&exp=${futureMs}`
    );
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.kioskId, 'Kiosk #04');
    assert.strictEqual(result.sessionToken, 'sess_active_001');
  });

  it('validates a JSON kiosk pairing payload with active token and expiry', () => {
    const payload = JSON.stringify({
      kioskId: '04',
      kioskName: 'Kiosk #04',
      sessionToken: 'sess_json_9912',
      location: 'Main Library Lobby',
      expiresAt: futureMs,
      active: true,
    });
    const result = validateKioskQrCode(payload);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.kioskId, 'Kiosk #04');
    assert.strictEqual(result.sessionToken, 'sess_json_9912');
    assert.strictEqual(result.location, 'Main Library Lobby');
  });

  it('validates structured colon-delimited kiosk session payload', () => {
    const result = validateKioskQrCode(`PRINTPOINT:KIOSK-07:tok_live_7788:${futureMs}`);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.kioskId, 'Kiosk #07');
    assert.strictEqual(result.sessionToken, 'tok_live_7788');
  });

  it('rejects expired kiosk sessions', () => {
    const expiredUrl = validateKioskQrCode(
      `https://kiosk.printpoint.app/session?kiosk=04&token=sess_old_111&exp=${pastMs}`
    );
    assert.strictEqual(expiredUrl.valid, false);
    assert.strictEqual(expiredUrl.reason, 'expired');

    const expiredJson = validateKioskQrCode(
      JSON.stringify({
        kioskId: '04',
        token: 'sess_old_222',
        status: 'expired',
      })
    );
    assert.strictEqual(expiredJson.valid, false);
    assert.strictEqual(expiredJson.reason, 'expired');
  });

  it('rejects already-used and inactive session tokens', () => {
    const usedPayload = validateKioskQrCode(
      JSON.stringify({
        kioskId: '04',
        token: 'sess_used_flag_1',
        used: true,
      })
    );
    assert.strictEqual(usedPayload.valid, false);
    assert.strictEqual(usedPayload.reason, 'already_used');

    markSessionTokenUsed('sess_consumed_abc123');
    const reused = validateKioskQrCode(
      `https://kiosk.printpoint.app/session?kiosk=04&token=sess_consumed_abc123&exp=${futureMs}`
    );
    assert.strictEqual(reused.valid, false);
    assert.strictEqual(reused.reason, 'already_used');

    const inactive = validateKioskQrCode(
      JSON.stringify({
        kioskId: '04',
        token: 'sess_inactive_99',
        active: false,
      })
    );
    assert.strictEqual(inactive.valid, false);
    assert.strictEqual(inactive.reason, 'inactive');
  });

  it('rejects bare kiosk IDs without session tokens and arbitrary unrelated QR codes', () => {
    const bareId = validateKioskQrCode('KIOSK-04');
    assert.strictEqual(bareId.valid, false);

    const noTokenUrl = validateKioskQrCode('https://kiosk.printpoint.app/session?kiosk=04');
    assert.strictEqual(noTokenUrl.valid, false);
    assert.strictEqual(noTokenUrl.reason, 'missing_token');

    const randomUrl = validateKioskQrCode('https://example.com/?id=04');
    assert.strictEqual(randomUrl.valid, false);
    assert.strictEqual(randomUrl.reason, 'invalid_format');

    const wifiQr = validateKioskQrCode('WIFI:S:MyWifi;T:WPA;P:secret;;');
    assert.strictEqual(wifiQr.valid, false);

    const emptyQr = validateKioskQrCode('');
    assert.strictEqual(emptyQr.valid, false);
  });
});
