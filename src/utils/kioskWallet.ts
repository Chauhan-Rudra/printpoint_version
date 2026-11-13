import { useState, useEffect } from 'react';

export interface KioskWalletTransaction {
  id: string;
  timestamp: number;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  paymentMethod?: string;
  balanceAfter: number;
}

export interface KioskWalletState {
  balance: number;
  currency: string;
  lastUpdated: number;
  transactions: KioskWalletTransaction[];
}

const STORAGE_KEY = 'creator4_kiosk_wallet';
export const DEFAULT_INITIAL_WALLET_BALANCE = 100; // Initial ₹100 student/kiosk printing allocation

let memoryWalletState: KioskWalletState = {
  balance: DEFAULT_INITIAL_WALLET_BALANCE,
  currency: 'INR',
  lastUpdated: Date.now(),
  transactions: [
    {
      id: 'tx_init_100',
      timestamp: Date.now() - 3600000,
      type: 'credit',
      amount: 100,
      description: 'Kiosk Printing Balance',
      paymentMethod: 'Station Allocation',
      balanceAfter: 100,
    },
  ],
};

export function getKioskWalletState(): KioskWalletState {
  if (typeof localStorage === 'undefined') {
    return memoryWalletState;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: KioskWalletState = {
        balance: DEFAULT_INITIAL_WALLET_BALANCE,
        currency: 'INR',
        lastUpdated: Date.now(),
        transactions: [
          {
            id: 'tx_init_100',
            timestamp: Date.now() - 3600000,
            type: 'credit',
            amount: 100,
            description: 'Kiosk Printing Balance',
            paymentMethod: 'Station Allocation',
            balanceAfter: 100,
          },
        ],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const parsed = JSON.parse(raw) as KioskWalletState;
    if (typeof parsed.balance !== 'number' || isNaN(parsed.balance)) {
      parsed.balance = DEFAULT_INITIAL_WALLET_BALANCE;
    }
    return parsed;
  } catch {
    return memoryWalletState;
  }
}

export function getKioskWalletBalance(): number {
  return getKioskWalletState().balance;
}

export function getKioskWalletTransactions(): KioskWalletTransaction[] {
  return getKioskWalletState().transactions || [];
}

export function addKioskWalletFunds(
  amount: number,
  method = 'UPI Express'
): { success: boolean; newBalance: number } {
  if (amount <= 0 || isNaN(amount)) {
    return { success: false, newBalance: getKioskWalletBalance() };
  }

  try {
    const current = getKioskWalletState();
    const newBalance = Number((current.balance + amount).toFixed(2));
    const tx: KioskWalletTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: 'credit',
      amount,
      description: `Added via ${method}`,
      paymentMethod: method,
      balanceAfter: newBalance,
    };

    const nextState: KioskWalletState = {
      ...current,
      balance: newBalance,
      lastUpdated: Date.now(),
      transactions: [tx, ...(current.transactions || [])].slice(0, 50),
    };

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
    return { success: true, newBalance };
  } catch (err) {
    console.error('Failed to add funds to kiosk wallet:', err);
    return { success: false, newBalance: getKioskWalletBalance() };
  }
}

export function deductKioskWalletFunds(
  amount: number,
  description = 'Print Job Payment'
): { success: boolean; newBalance: number } {
  const currentBalance = getKioskWalletBalance();
  if (amount <= 0 || currentBalance < amount) {
    return { success: false, newBalance: currentBalance };
  }

  try {
    const current = getKioskWalletState();
    const newBalance = Number((current.balance - amount).toFixed(2));
    const tx: KioskWalletTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: 'debit',
      amount,
      description,
      balanceAfter: newBalance,
    };

    const nextState: KioskWalletState = {
      ...current,
      balance: newBalance,
      lastUpdated: Date.now(),
      transactions: [tx, ...(current.transactions || [])].slice(0, 50),
    };

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
    return { success: true, newBalance };
  } catch (err) {
    console.error('Failed to deduct kiosk wallet balance:', err);
    return { success: false, newBalance: currentBalance };
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
    getTransactions: getKioskWalletTransactions,
  };
}
