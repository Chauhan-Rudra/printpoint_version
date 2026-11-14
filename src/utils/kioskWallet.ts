import { useState, useEffect } from 'react';
import { getFirebaseIdToken } from '../firebase';

export type WalletTransactionStatus = 'completed' | 'pending' | 'failed';

export interface KioskWalletTransaction {
  id: string;
  timestamp: number;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  paymentMethod?: string;
  balanceAfter: number;
  status?: WalletTransactionStatus;
  referenceId?: string;
  orderId?: string;
  orderNumber?: string;
  idempotencyKey?: string;
}

export interface KioskWalletState {
  balance: number;
  currency: string;
  lastUpdated: number;
  transactions: KioskWalletTransaction[];
}

export interface WalletOperationMetadata {
  idempotencyKey?: string;
  referenceId?: string;
  orderId?: string;
  orderNumber?: string;
  paymentMethod?: string;
  status?: WalletTransactionStatus;
  description?: string;
}

const STORAGE_KEY = 'printpoint_wallet_v2';
export const DEFAULT_INITIAL_WALLET_BALANCE = 0; // Server-authoritative zero initial balance

let memoryWalletState: KioskWalletState = {
  balance: 0,
  currency: 'INR',
  lastUpdated: Date.now(),
  transactions: [],
};

function persistWalletState(nextState: KioskWalletState): void {
  memoryWalletState = nextState;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // ignore localStorage write errors
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('creator4:wallet-updated'));
  }
}

export function getKioskWalletState(): KioskWalletState {
  if (typeof localStorage === 'undefined') {
    return memoryWalletState;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return memoryWalletState;
    }

    const parsed = JSON.parse(raw) as KioskWalletState;
    if (typeof parsed.balance !== 'number' || Number.isNaN(parsed.balance) || parsed.balance < 0) {
      parsed.balance = 0;
    }
    if (!Array.isArray(parsed.transactions)) {
      parsed.transactions = [];
    }
    return parsed;
  } catch {
    return memoryWalletState;
  }
}

export function setAuthoritativeWalletState(params: {
  balanceInr: number;
  transactions?: Array<{
    id: string;
    type: 'credit' | 'debit' | 'refund';
    amountInr: number;
    balanceAfterInr: number;
    title: string;
    referenceId?: string;
    idempotencyKey?: string;
    createdAt: number;
  }>;
}): KioskWalletState {
  const normalizedTx: KioskWalletTransaction[] = (params.transactions || []).map((tx) => ({
    id: tx.id,
    timestamp: tx.createdAt,
    type: tx.type === 'debit' ? 'debit' : 'credit',
    amount: Number(tx.amountInr.toFixed(2)),
    description: tx.title,
    balanceAfter: Number(tx.balanceAfterInr.toFixed(2)),
    status: 'completed',
    referenceId: tx.referenceId,
    idempotencyKey: tx.idempotencyKey,
  }));

  const nextState: KioskWalletState = {
    balance: Math.max(0, Number(params.balanceInr.toFixed(2))),
    currency: 'INR',
    lastUpdated: Date.now(),
    transactions: normalizedTx,
  };
  persistWalletState(nextState);
  return nextState;
}

export function clearLocalWalletState(): void {
  persistWalletState({
    balance: 0,
    currency: 'INR',
    lastUpdated: Date.now(),
    transactions: [],
  });
}

export async function syncWalletFromBackend(): Promise<KioskWalletState | null> {
  const token = await getFirebaseIdToken();
  if (!token) {
    clearLocalWalletState();
    return null;
  }
  try {
    const res = await fetch('/api/wallet', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      balanceInr?: number;
      transactions?: Array<{
        id: string;
        type: 'credit' | 'debit' | 'refund';
        amountInr: number;
        balanceAfterInr: number;
        title: string;
        referenceId?: string;
        idempotencyKey?: string;
        createdAt: number;
      }>;
    };
    if (typeof data.balanceInr !== 'number') return null;
    return setAuthoritativeWalletState({
      balanceInr: data.balanceInr,
      transactions: data.transactions || [],
    });
  } catch {
    return null;
  }
}

export function getKioskWalletBalance(): number {
  const bal = getKioskWalletState().balance;
  return Number.isFinite(bal) && bal >= 0 ? Number(bal.toFixed(2)) : 0;
}

export function getKioskWalletTransactions(): KioskWalletTransaction[] {
  return getKioskWalletState().transactions || [];
}

export function addKioskWalletFunds(
  amount: number,
  method = 'UPI Express',
  metadata?: WalletOperationMetadata
): {
  success: boolean;
  newBalance: number;
  duplicate?: boolean;
  transaction?: KioskWalletTransaction;
} {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, newBalance: getKioskWalletBalance() };
  }

  try {
    const current = getKioskWalletState();

    if (metadata?.idempotencyKey) {
      const existing = (current.transactions || []).find(
        (tx) => tx.idempotencyKey === metadata.idempotencyKey && tx.type === 'credit'
      );
      if (existing) {
        return {
          success: true,
          newBalance: current.balance,
          duplicate: true,
          transaction: existing,
        };
      }
    }

    const cleanAmount = Number(amount.toFixed(2));
    const newBalance = Number((current.balance + cleanAmount).toFixed(2));
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tx: KioskWalletTransaction = {
      id: txId,
      timestamp: Date.now(),
      type: 'credit',
      amount: cleanAmount,
      description: metadata?.description || `Added via ${method}`,
      paymentMethod: metadata?.paymentMethod || method,
      balanceAfter: newBalance,
      status: metadata?.status || 'completed',
      referenceId: metadata?.referenceId || txId.toUpperCase(),
      idempotencyKey: metadata?.idempotencyKey,
    };

    const nextState: KioskWalletState = {
      ...current,
      balance: newBalance,
      lastUpdated: Date.now(),
      transactions: [tx, ...(current.transactions || [])],
    };

    persistWalletState(nextState);
    return { success: true, newBalance, transaction: tx };
  } catch (err) {
    console.error('Failed to add funds to kiosk wallet:', err);
    return { success: false, newBalance: getKioskWalletBalance() };
  }
}

export function deductKioskWalletFunds(
  amount: number,
  description = 'Print Job Payment',
  metadata?: WalletOperationMetadata
): {
  success: boolean;
  newBalance: number;
  duplicate?: boolean;
  transaction?: KioskWalletTransaction;
} {
  const currentBalance = getKioskWalletBalance();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, newBalance: currentBalance };
  }

  try {
    const current = getKioskWalletState();

    if (metadata?.idempotencyKey) {
      const existing = (current.transactions || []).find(
        (tx) => tx.idempotencyKey === metadata.idempotencyKey && tx.type === 'debit'
      );
      if (existing) {
        return {
          success: true,
          newBalance: current.balance,
          duplicate: true,
          transaction: existing,
        };
      }
    }

    const cleanAmount = Number(amount.toFixed(2));
    if (current.balance < cleanAmount) {
      return { success: false, newBalance: current.balance };
    }

    const newBalance = Number((current.balance - cleanAmount).toFixed(2));
    if (newBalance < 0) {
      return { success: false, newBalance: current.balance };
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tx: KioskWalletTransaction = {
      id: txId,
      timestamp: Date.now(),
      type: 'debit',
      amount: cleanAmount,
      description,
      paymentMethod: metadata?.paymentMethod || 'Print Point Wallet',
      balanceAfter: newBalance,
      status: metadata?.status || 'completed',
      referenceId: metadata?.referenceId || txId.toUpperCase(),
      orderId: metadata?.orderId,
      orderNumber: metadata?.orderNumber,
      idempotencyKey: metadata?.idempotencyKey,
    };

    const nextState: KioskWalletState = {
      ...current,
      balance: newBalance,
      lastUpdated: Date.now(),
      transactions: [tx, ...(current.transactions || [])],
    };

    persistWalletState(nextState);
    return { success: true, newBalance, transaction: tx };
  } catch (err) {
    console.error('Failed to deduct kiosk wallet balance:', err);
    return { success: false, newBalance: currentBalance };
  }
}

export function attachOrderToWalletTransaction(
  transactionId: string,
  orderId: string,
  orderNumber: string
): void {
  const current = getKioskWalletState();
  let changed = false;
  const updatedTransactions = (current.transactions || []).map((tx) => {
    if (tx.id !== transactionId) return tx;
    changed = true;
    return { ...tx, orderId, orderNumber };
  });

  if (!changed) return;

  persistWalletState({
    ...current,
    transactions: updatedTransactions,
  });
}

export function refundKioskWalletFunds(
  amount: number,
  description = 'Print Job Refund',
  metadata?: WalletOperationMetadata
): {
  success: boolean;
  newBalance: number;
  duplicate?: boolean;
  transaction?: KioskWalletTransaction;
} {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, newBalance: getKioskWalletBalance() };
  }

  try {
    const current = getKioskWalletState();

    if (metadata?.idempotencyKey) {
      const existing = (current.transactions || []).find(
        (tx) => tx.idempotencyKey === metadata.idempotencyKey && tx.type === 'credit'
      );
      if (existing) {
        return {
          success: true,
          newBalance: current.balance,
          duplicate: true,
          transaction: existing,
        };
      }
    }

    const cleanAmount = Number(amount.toFixed(2));
    const newBalance = Number((current.balance + cleanAmount).toFixed(2));
    const txId = `tx_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tx: KioskWalletTransaction = {
      id: txId,
      timestamp: Date.now(),
      type: 'credit',
      amount: cleanAmount,
      description,
      paymentMethod: metadata?.paymentMethod || 'Instant Refund',
      balanceAfter: newBalance,
      status: metadata?.status || 'completed',
      referenceId: metadata?.referenceId || txId.toUpperCase(),
      orderId: metadata?.orderId,
      orderNumber: metadata?.orderNumber,
      idempotencyKey: metadata?.idempotencyKey,
    };

    const nextState: KioskWalletState = {
      ...current,
      balance: newBalance,
      lastUpdated: Date.now(),
      transactions: [tx, ...(current.transactions || [])],
    };

    persistWalletState(nextState);
    return { success: true, newBalance, transaction: tx };
  } catch (err) {
    console.error('Failed to refund kiosk wallet balance:', err);
    return { success: false, newBalance: getKioskWalletBalance() };
  }
}

export function useKioskWallet() {
  const [balance, setBalance] = useState<number>(getKioskWalletBalance);

  useEffect(() => {
    const update = () => setBalance(getKioskWalletBalance());
    if (typeof window !== 'undefined') {
      window.addEventListener('creator4:wallet-updated', update);
      window.addEventListener('storage', update);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('creator4:wallet-updated', update);
        window.removeEventListener('storage', update);
      }
    };
  }, []);

  return {
    balance,
    addFunds: addKioskWalletFunds,
    deductFunds: deductKioskWalletFunds,
    refundFunds: refundKioskWalletFunds,
    attachOrderToTransaction: attachOrderToWalletTransaction,
    getTransactions: getKioskWalletTransactions,
    syncFromBackend: syncWalletFromBackend,
  };
}

export function formatWalletBalanceInr(amount: number): string {
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  return `₹${safeAmount.toFixed(2)}`;
}
