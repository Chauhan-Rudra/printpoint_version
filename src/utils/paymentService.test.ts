import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getPaymentCapabilities,
  computeWalletShortfall,
  validateTopupAmount,
  validateCheckoutEligibility,
  createBackendPaymentOrder,
  verifyBackendPaymentSignature,
  recheckBackendPaymentStatus,
  creditVerifiedWalletTopup,
  PaymentEnvConfig,
} from './paymentService';
import {
  getKioskWalletBalance,
  addKioskWalletFunds,
  deductKioskWalletFunds,
} from './kioskWallet';
import { recordPrintOrder, getPrintOrders } from './kioskOrders';
import { KIOSK_STATIONS } from './kioskSession';

const CONFIGURED_ENV: PaymentEnvConfig = {
  VITE_RAZORPAY_KEY_ID: 'rzp_test_123456',
  VITE_PAYMENT_API_BASE_URL: 'https://api.printpoint.example.com',
};

describe('Payment Service, Capabilities, Verification & Idempotency', () => {
  it('reports missing Razorpay/backend configuration honestly when unset', () => {
    const caps = getPaymentCapabilities({});
    assert.strictEqual(caps.razorpayReady, false);
    assert.strictEqual(caps.topupSupported, false);
    assert.ok(caps.missingConfigItems.length >= 2);
  });

  it('detects configured Razorpay + backend verification endpoints', () => {
    const caps = getPaymentCapabilities(CONFIGURED_ENV);
    assert.strictEqual(caps.razorpayReady, true);
    assert.strictEqual(caps.topupSupported, true);
    assert.strictEqual(caps.createOrderUrl, 'https://api.printpoint.example.com/payments/create-order');
    assert.strictEqual(caps.verifyUrl, 'https://api.printpoint.example.com/payments/verify');
    assert.strictEqual(caps.statusUrl, 'https://api.printpoint.example.com/payments/status');
  });

  it('calculates exact wallet shortfall without allowing negative amounts', () => {
    assert.strictEqual(computeWalletShortfall(100, 125.5), 25.5);
    assert.strictEqual(computeWalletShortfall(100, 45), 0);
    assert.strictEqual(computeWalletShortfall(-20, 30), 30);
  });

  it('enforces wallet top-up min ₹10 and max ₹5,000 bounds', () => {
    assert.strictEqual(validateTopupAmount(9).valid, false);
    assert.strictEqual(validateTopupAmount(10).valid, true);
    assert.strictEqual(validateTopupAmount(5000).valid, true);
    assert.strictEqual(validateTopupAmount(5001).valid, false);
  });

  it('enforces idempotent credits and debits on kioskWallet', () => {
    const start = getKioskWalletBalance();
    const topupKey = `test_topup_${Date.now()}`;

    const firstCredit = creditVerifiedWalletTopup({
      amountInr: 40,
      methodLabel: 'Razorpay UPI',
      idempotencyKey: topupKey,
      referenceId: 'pay_test_01',
    });
    assert.strictEqual(firstCredit.success, true);
    assert.strictEqual(firstCredit.newBalance, Number((start + 40).toFixed(2)));

    // Replay same idempotencyKey -> must NOT credit twice
    const replayCredit = creditVerifiedWalletTopup({
      amountInr: 40,
      methodLabel: 'Razorpay UPI',
      idempotencyKey: topupKey,
      referenceId: 'pay_test_01',
    });
    assert.strictEqual(replayCredit.success, true);
    assert.strictEqual(replayCredit.duplicate, true);
    assert.strictEqual(getKioskWalletBalance(), Number((start + 40).toFixed(2)));

    const debitKey = `test_debit_${Date.now()}`;
    const firstDebit = deductKioskWalletFunds(15, 'Idempotent print job', {
      idempotencyKey: debitKey,
    });
    assert.strictEqual(firstDebit.success, true);

    const replayDebit = deductKioskWalletFunds(15, 'Idempotent print job', {
      idempotencyKey: debitKey,
    });
    assert.strictEqual(replayDebit.success, true);
    assert.strictEqual(replayDebit.duplicate, true);
    assert.strictEqual(getKioskWalletBalance(), Number((start + 25).toFixed(2)));

    // Also test addKioskWalletFunds direct idempotency
    const directKey = `direct_${Date.now()}`;
    const a1 = addKioskWalletFunds(5, 'Direct', { idempotencyKey: directKey });
    const a2 = addKioskWalletFunds(5, 'Direct', { idempotencyKey: directKey });
    assert.strictEqual(a1.success, true);
    assert.strictEqual(a2.duplicate, true);
  });

  it('prevents duplicate print orders with the same idempotencyKey', () => {
    const key = `order_key_${Date.now()}`;
    const o1 = recordPrintOrder({
      kioskName: 'Kiosk #04',
      documentCount: 1,
      totalPages: 5,
      totalSheets: 5,
      colourLabel: 'Black & White',
      sidesLabel: '1-Sided',
      amountInr: 5,
      paymentMethod: 'Print Point Wallet',
      status: 'Printed',
      idempotencyKey: key,
      items: [{ name: 'doc.pdf', pages: 5, copies: 1, colourMode: 'bw', sides: '1-sided' }],
    });

    const o2 = recordPrintOrder({
      kioskName: 'Kiosk #04',
      documentCount: 1,
      totalPages: 5,
      totalSheets: 5,
      colourLabel: 'Black & White',
      sidesLabel: '1-Sided',
      amountInr: 5,
      paymentMethod: 'Print Point Wallet',
      status: 'Printed',
      idempotencyKey: key,
      items: [{ name: 'doc.pdf', pages: 5, copies: 1, colourMode: 'bw', sides: '1-sided' }],
    });

    assert.strictEqual(o1.id, o2.id);
    assert.strictEqual(
      getPrintOrders().filter((o) => o.idempotencyKey === key).length,
      1
    );
  });

  it('validates user & kiosk session before allowing checkout', () => {
    const baseProfile = {
      name: 'Test User',
      email: 'user@example.com',
      phone: '+919999999999',
      initials: 'TU',
      language: 'English' as const,
      notificationsEnabled: true,
      joinedDate: 'Nov 2026',
    };
    const validSession = {
      connected: true,
      activeStation: KIOSK_STATIONS[0],
      pairedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };

    assert.strictEqual(
      validateCheckoutEligibility({
        session: validSession,
        profile: baseProfile,
        totalAmountInr: 12,
      }).valid,
      true
    );

    assert.strictEqual(
      validateCheckoutEligibility({
        session: validSession,
        profile: baseProfile,
        isSignedOut: true,
        totalAmountInr: 12,
      }).valid,
      false
    );

    assert.strictEqual(
      validateCheckoutEligibility({
        session: { ...validSession, expiresAt: Date.now() - 1000 },
        profile: baseProfile,
        totalAmountInr: 12,
      }).valid,
      false
    );
  });

  it('handles backend order creation, signature verification, and status recheck safely', async () => {
    const orderFetch = (async () =>
      new Response(
        JSON.stringify({ orderId: 'order_rzp_99', amountPaise: 2400, currency: 'INR' }),
        { status: 200 }
      )) as typeof fetch;

    const order = await createBackendPaymentOrder(
      {
        idempotencyKey: 'job_123',
        amountInr: 24,
        purpose: 'print_job',
        preferredMethod: 'upi',
        customerName: 'Test',
        customerEmail: 't@example.com',
        description: 'Test print',
      },
      { env: CONFIGURED_ENV, fetchFn: orderFetch }
    );
    assert.strictEqual(order.orderId, 'order_rzp_99');
    assert.strictEqual(order.amountPaise, 2400);

    // Verified success
    const verifyOk = await verifyBackendPaymentSignature(
      {
        idempotencyKey: 'job_123',
        purpose: 'print_job',
        amountInr: 24,
        response: {
          razorpay_order_id: 'order_rzp_99',
          razorpay_payment_id: 'pay_rzp_88',
          razorpay_signature: 'sig_valid',
        },
      },
      {
        env: CONFIGURED_ENV,
        fetchFn: (async () =>
          new Response(JSON.stringify({ verified: true, referenceId: 'pay_rzp_88' }), {
            status: 200,
          })) as typeof fetch,
      }
    );
    assert.strictEqual(verifyOk.status, 'successful');
    assert.strictEqual(verifyOk.verifiedByBackend, true);

    // Delayed / 503 -> must return 'unknown' (never assume success!)
    const verifyDelayed = await verifyBackendPaymentSignature(
      {
        idempotencyKey: 'job_123',
        purpose: 'print_job',
        amountInr: 24,
        response: {
          razorpay_order_id: 'order_rzp_99',
          razorpay_payment_id: 'pay_rzp_88',
          razorpay_signature: 'sig_valid',
        },
      },
      {
        env: CONFIGURED_ENV,
        fetchFn: (async () => new Response('Gateway Timeout', { status: 504 })) as typeof fetch,
      }
    );
    assert.strictEqual(verifyDelayed.status, 'unknown');
    assert.strictEqual(verifyDelayed.verifiedByBackend, false);

    // Recheck confirms paid
    const recheckOk = await recheckBackendPaymentStatus(
      { idempotencyKey: 'job_123', orderId: 'order_rzp_99', purpose: 'print_job' },
      {
        env: CONFIGURED_ENV,
        fetchFn: (async () =>
          new Response(JSON.stringify({ status: 'paid', paymentId: 'pay_rzp_88' }), {
            status: 200,
          })) as typeof fetch,
      }
    );
    assert.strictEqual(recheckOk.status, 'successful');
    assert.strictEqual(recheckOk.referenceId, 'pay_rzp_88');
  });
});
