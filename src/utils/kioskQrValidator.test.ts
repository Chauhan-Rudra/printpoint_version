import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateKioskQrCode } from './kioskQrValidator';

describe('Kiosk QR Code Validation', () => {
  it('validates a standard kiosk URL and extracts station id', () => {
    const result = validateKioskQrCode('https://kiosk.creator4lab.com/session?kiosk=04&token=tok_xyz');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.kioskId, 'Kiosk #04');
    assert.strictEqual(result.sessionToken, 'tok_xyz');
  });

  it('validates JSON kiosk pairing payload', () => {
    const payload = JSON.stringify({
      kioskId: '04',
      kioskName: 'Kiosk #04',
      token: 'c4_session_99',
      location: 'Ground Floor Hub',
    });
    const result = validateKioskQrCode(payload);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.kioskId, 'Kiosk #04');
    assert.strictEqual(result.sessionToken, 'c4_session_99');
    assert.strictEqual(result.location, 'Ground Floor Hub');
  });

  it('validates formatted direct kiosk strings', () => {
    const res1 = validateKioskQrCode('KIOSK-04');
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.kioskId, 'Kiosk #04');

    const res2 = validateKioskQrCode('C4-KIOSK-04');
    assert.strictEqual(res2.valid, true);
    assert.strictEqual(res2.kioskId, 'Kiosk #04');

    const res3 = validateKioskQrCode('Kiosk #04');
    assert.strictEqual(res3.valid, true);
    assert.strictEqual(res3.kioskId, 'Kiosk #04');
  });

  it('rejects arbitrary non-kiosk QR codes with helpful error message', () => {
    const res1 = validateKioskQrCode('https://random-website.org/unrelated-page');
    assert.strictEqual(res1.valid, false);
    assert.ok(res1.error?.includes('not a Creator4 Lab Kiosk station'));

    const res2 = validateKioskQrCode('WIFI:S:MyWifi;T:WPA;P:secret;;');
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.error?.includes('not a Creator4 Lab Kiosk station'));

    const res3 = validateKioskQrCode('');
    assert.strictEqual(res3.valid, false);
  });
});
