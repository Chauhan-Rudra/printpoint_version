import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getKioskWalletBalance,
  addKioskWalletFunds,
  deductKioskWalletFunds,
  formatWalletBalanceInr,
} from './kioskWallet';

describe('Kiosk Wallet Utilities', () => {
  it('initializes with default balance of ₹100 or current balance', () => {
    const bal = getKioskWalletBalance();
    assert.strictEqual(typeof bal, 'number');
    assert.ok(bal >= 0, 'Balance must be non-negative');
  });

  it('correctly adds funds to the wallet', () => {
    const initial = getKioskWalletBalance();
    const result = addKioskWalletFunds(50, 'Test UPI');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.newBalance, Number((initial + 50).toFixed(2)));
  });

  it('correctly deducts funds from the wallet when balance is sufficient', () => {
    const before = getKioskWalletBalance();
    const result = deductKioskWalletFunds(25, 'Test Print Deduction');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.newBalance, Number((before - 25).toFixed(2)));
  });

  it('rejects deduction when amount exceeds current balance', () => {
    const current = getKioskWalletBalance();
    const result = deductKioskWalletFunds(current + 99999, 'Overdraft Attempt');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.newBalance, current);
  });

  it('formats wallet balance in INR with two decimal places', () => {
    assert.strictEqual(formatWalletBalanceInr(100), '₹100.00');
    assert.strictEqual(formatWalletBalanceInr(240.5), '₹240.50');
    assert.strictEqual(formatWalletBalanceInr(0), '₹0.00');
    assert.strictEqual(formatWalletBalanceInr(-5), '₹0.00');
  });
});
