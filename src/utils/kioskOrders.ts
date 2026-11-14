import { useState, useEffect } from 'react';
import { getFirebaseIdToken } from '../firebase';
import { refundKioskWalletFunds, syncWalletFromBackend } from './kioskWallet';
import { getUserProfile } from './userProfile';

export type PrintOrderStatus =
  | 'Queued'
  | 'Claimed'
  | 'Printing'
  | 'Printed'
  | 'Failed'
  | 'Refunded';
export type PrintOrderPaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface PrintOrderItemSummary {
  docId?: string;
  name: string;
  pages: number;
  copies: number;
  colourMode: 'bw' | 'colour';
  sides: '1-sided' | '2-sided';
}

export interface PrintOrderRecord {
  id: string;
  orderNumber: string;
  createdAt: number;
  updatedAt?: number;
  stationId?: string;
  kioskName: string;
  releaseCode?: string;
  documentCount: number;
  totalPages: number;
  totalSheets: number;
  colourLabel: string;
  sidesLabel: string;
  amountInr: number;
  paymentMethod: string;
  status: PrintOrderStatus;
  paymentStatus?: PrintOrderPaymentStatus;
  paymentReferenceId?: string;
  idempotencyKey?: string;
  failureReason?: string;
  refundedAt?: number;
  items: PrintOrderItemSummary[];
}

export type AppNotificationKind = 'print' | 'wallet' | 'refund' | 'kiosk';

export interface AppNotificationItem {
  id: string;
  kind: AppNotificationKind;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

const ORDERS_STORAGE_KEY = 'printpoint_orders_v2';
const NOTIFICATIONS_STORAGE_KEY = 'printpoint_notifications_v2';

let memoryOrders: PrintOrderRecord[] = [];
let memoryNotifications: AppNotificationItem[] = [];

function generateOrderNumber(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(3);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return `PP-${hex}`;
  }
  const timePart = (Date.now() % 16777215).toString(16).toUpperCase().padStart(6, '0');
  return `PP-${timePart}`;
}

function loadOrders(): PrintOrderRecord[] {
  if (typeof localStorage === 'undefined') return memoryOrders;
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return memoryOrders;
    const parsed = JSON.parse(raw) as PrintOrderRecord[];
    return Array.isArray(parsed) ? parsed : memoryOrders;
  } catch {
    return memoryOrders;
  }
}

function saveOrders(orders: PrintOrderRecord[]) {
  memoryOrders = orders;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
      window.dispatchEvent(new Event('printpoint:orders-updated'));
    } catch {
      // Ignore storage errors
    }
  }
}

function loadNotifications(): AppNotificationItem[] {
  if (typeof localStorage === 'undefined') return memoryNotifications;
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return memoryNotifications;
    const parsed = JSON.parse(raw) as AppNotificationItem[];
    return Array.isArray(parsed) ? parsed : memoryNotifications;
  } catch {
    return memoryNotifications;
  }
}

function saveNotifications(items: AppNotificationItem[]) {
  memoryNotifications = items;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new Event('printpoint:notifications-updated'));
    } catch {
      // Ignore storage errors
    }
  }
}

export function getPrintOrders(): PrintOrderRecord[] {
  return loadOrders();
}

export function setAuthoritativePrintOrders(orders: PrintOrderRecord[]): void {
  const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  saveOrders(sorted);
}

export function upsertOrderRecord(order: PrintOrderRecord): void {
  const existing = loadOrders();
  const idx = existing.findIndex((o) => o.id === order.id);
  const next =
    idx >= 0
      ? existing.map((o) => (o.id === order.id ? order : o))
      : [order, ...existing];
  saveOrders(next);
}

export function clearLocalPrintOrders(): void {
  saveOrders([]);
}

export async function syncOrdersFromBackend(): Promise<PrintOrderRecord[] | null> {
  const token = await getFirebaseIdToken();
  if (!token) {
    return null;
  }
  try {
    const res = await fetch('/api/orders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { orders?: PrintOrderRecord[] };
    if (!Array.isArray(data.orders)) return null;
    setAuthoritativePrintOrders(data.orders);
    return data.orders;
  } catch {
    return null;
  }
}

export async function fetchOrderStatusFromBackend(
  orderId: string
): Promise<PrintOrderRecord | null> {
  const token = await getFirebaseIdToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { order?: PrintOrderRecord };
    if (data.order) {
      upsertOrderRecord(data.order);
      return data.order;
    }
    return null;
  } catch {
    return null;
  }
}

export function getNotifications(): AppNotificationItem[] {
  return loadNotifications();
}

export function pushAppNotification(
  input: Omit<AppNotificationItem, 'id' | 'createdAt' | 'read'>
): AppNotificationItem {
  const item: AppNotificationItem = {
    ...input,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    read: false,
  };
  if (!getUserProfile().notificationsEnabled) {
    return item;
  }
  const next = [item, ...loadNotifications()].slice(0, 50);
  saveNotifications(next);
  return item;
}

export function markAllNotificationsRead(): void {
  const updated = loadNotifications().map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
}

export function clearAppNotifications(): void {
  saveNotifications([]);
}

export function recordPrintOrder(
  input: Omit<PrintOrderRecord, 'id' | 'orderNumber' | 'createdAt'>
): PrintOrderRecord {
  const existingOrders = loadOrders();
  if (input.idempotencyKey) {
    const duplicate = existingOrders.find(
      (order) => order.idempotencyKey === input.idempotencyKey
    );
    if (duplicate) {
      return duplicate;
    }
  }

  const orderNumber = generateOrderNumber();
  const order: PrintOrderRecord = {
    ...input,
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    orderNumber,
    createdAt: Date.now(),
    paymentStatus:
      input.paymentStatus || (input.status === 'Failed' ? 'failed' : 'paid'),
  };

  const next = [order, ...existingOrders];
  saveOrders(next);

  if (order.status === 'Printed') {
    pushAppNotification({
      kind: 'print',
      title: `Order ${orderNumber} Printed`,
      message: `${order.totalSheets} sheet${order.totalSheets === 1 ? '' : 's'} printed at ${order.kioskName}.`,
    });
  } else if (order.status === 'Queued') {
    pushAppNotification({
      kind: 'print',
      title: `Order ${orderNumber} Queued`,
      message: `Release PIN ${order.releaseCode || '----'} ready for ${order.kioskName}.`,
    });
  } else if (order.status === 'Failed') {
    pushAppNotification({
      kind: 'print',
      title: `Order ${orderNumber} Interrupted`,
      message: `${order.failureReason || 'Printer interruption detected.'} Eligible for wallet refund.`,
    });
  }

  return order;
}

export function claimOrderRefund(orderId: string): {
  success: boolean;
  order?: PrintOrderRecord;
  newBalance?: number;
} {
  const orders = loadOrders();
  const target = orders.find((o) => o.id === orderId);
  if (!target || target.status !== 'Failed') {
    return { success: false };
  }

  const refundResult = refundKioskWalletFunds(
    target.amountInr,
    `Refund · ${target.orderNumber}`,
    {
      idempotencyKey: `refund_${target.id}`,
      orderId: target.id,
      orderNumber: target.orderNumber,
      referenceId: `REF-${target.orderNumber}`,
    }
  );
  if (!refundResult.success) {
    return { success: false };
  }

  const updatedOrder: PrintOrderRecord = {
    ...target,
    status: 'Refunded',
    paymentStatus: 'refunded',
    refundedAt: Date.now(),
  };
  const next = orders.map((o) => (o.id === orderId ? updatedOrder : o));
  saveOrders(next);

  pushAppNotification({
    kind: 'refund',
    title: `₹${target.amountInr.toFixed(2)} Refunded`,
    message: `Order ${target.orderNumber} credited back to your Print Point Wallet.`,
  });

  return {
    success: true,
    order: updatedOrder,
    newBalance: refundResult.newBalance,
  };
}

export async function claimServerOrderRefund(orderId: string): Promise<{
  success: boolean;
  order?: PrintOrderRecord;
  newBalance?: number;
  error?: string;
}> {
  const token = await getFirebaseIdToken();
  if (!token) {
    return { success: false, error: 'Sign in required to process refund.' };
  }
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      order?: PrintOrderRecord;
      newBalanceInr?: number;
      error?: string;
    };
    if (!res.ok || !data.success || !data.order) {
      return { success: false, error: data.error || 'Refund failed.' };
    }
    upsertOrderRecord(data.order);
    await syncWalletFromBackend();
    pushAppNotification({
      kind: 'refund',
      title: `₹${data.order.amountInr.toFixed(2)} Refunded`,
      message: `Order ${data.order.orderNumber} credited back to your Print Point Wallet.`,
    });
    return {
      success: true,
      order: data.order,
      newBalance: data.newBalanceInr,
    };
  } catch {
    return { success: false, error: 'Network error while requesting refund.' };
  }
}

export function useKioskOrders() {
  const [orders, setOrders] = useState<PrintOrderRecord[]>(getPrintOrders);

  useEffect(() => {
    const refresh = () => setOrders(getPrintOrders());
    window.addEventListener('printpoint:orders-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('printpoint:orders-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    orders,
    recordOrder: recordPrintOrder,
    claimRefund: claimOrderRefund,
    claimServerRefund: claimServerOrderRefund,
    syncFromBackend: syncOrdersFromBackend,
  };
}

export function useAppNotifications() {
  const [notifications, setNotifications] = useState<AppNotificationItem[]>(getNotifications);

  useEffect(() => {
    const refresh = () => setNotifications(getNotifications());
    window.addEventListener('printpoint:notifications-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('printpoint:notifications-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    pushNotification: pushAppNotification,
    markAllRead: markAllNotificationsRead,
    clearAll: clearAppNotifications,
  };
}
