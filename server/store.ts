/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ServerKioskStation } from './pricing';

export type OrderStatus =
  | 'Queued'
  | 'Claimed'
  | 'Printing'
  | 'Printed'
  | 'Failed'
  | 'Refunded';

export interface StoredKioskSession {
  token: string;
  stationId: string;
  kioskName: string;
  location: string;
  status: 'open' | 'paired' | 'expired' | 'revoked';
  boundUid?: string;
  createdAt: number;
  expiresAt: number;
  pairedAt?: number;
}

export interface StoredPrintDocument {
  id: string;
  uid: string;
  stationId: string;
  sessionToken: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  blankPages: number[];
  storagePath: string;
  localPdfPath: string;
  convertedFromFormat: string;
  converterEngine: string;
  createdAt: number;
  expiresAt: number;
  deleted: boolean;
}

export interface StoredWalletTransaction {
  id: string;
  uid: string;
  type: 'credit' | 'debit' | 'refund';
  amountInr: number;
  balanceAfterInr: number;
  title: string;
  referenceId: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface StoredPaymentOrder {
  orderId: string;
  uid: string;
  purpose: 'wallet_topup' | 'print_job';
  amountInr: number;
  amountPaise: number;
  currency: 'INR';
  preferredMethod?: string;
  idempotencyKey: string;
  status: 'created' | 'paid' | 'failed';
  razorpayPaymentId?: string;
  stationId?: string;
  sessionToken?: string;
  jobPayload?: {
    stationId: string;
    sessionToken: string;
    items: Array<{
      docId: string;
      name: string;
      pages: number;
      copies: number;
      colourMode: 'bw' | 'colour';
      sides: '1-sided' | '2-sided';
      removeBlankPages: boolean;
    }>;
  };
  createdAt: number;
  updatedAt: number;
}

export interface StoredPrintOrderItem {
  docId: string;
  name: string;
  pages: number;
  copies: number;
  colourMode: 'bw' | 'colour';
  sides: '1-sided' | '2-sided';
  removeBlankPages?: boolean;
}

export interface StoredPrintOrder {
  id: string;
  orderNumber: string;
  uid: string;
  stationId: string;
  kioskName: string;
  sessionToken: string;
  releaseCode: string;
  documentCount: number;
  totalPages: number;
  totalSheets: number;
  colourLabel: string;
  sidesLabel: string;
  amountInr: number;
  paymentMethod: string;
  paymentReferenceId?: string;
  status: OrderStatus;
  failureReason?: string;
  idempotencyKey: string;
  items: StoredPrintOrderItem[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface StoredUserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  photoURL?: string;
  language: 'English' | 'ગુજરાતી' | 'हिन्दी';
  notificationsEnabled: boolean;
  role: 'user';
  joinedDate: string;
  updatedAt: number;
}

interface PersistedState {
  stations: Record<string, ServerKioskStation>;
  sessions: Record<string, StoredKioskSession>;
  documents: Record<string, StoredPrintDocument>;
  wallets: Record<string, number>;
  walletTransactions: Record<string, StoredWalletTransaction[]>;
  appliedIdempotencyKeys: Record<string, { result: unknown; createdAt: number }>;
  paymentOrders: Record<string, StoredPaymentOrder>;
  printOrders: Record<string, StoredPrintOrder>;
  users: Record<string, StoredUserProfile>;
}

const DEFAULT_STATIONS: ServerKioskStation[] = [
  {
    id: 'kiosk-04',
    name: 'Kiosk #04',
    location: 'Main Library Lobby',
    online: true,
    bwRateInr: 1,
    colourRateInr: 3,
    bwDuplexSheetInr: 1.5,
    colourDuplexSheetInr: 5,
    supportsColour: true,
    supportsDuplex: true,
    minCopies: 1,
    maxCopies: 99,
  },
  {
    id: 'kiosk-07',
    name: 'Kiosk #07',
    location: 'Engineering Block B',
    online: true,
    bwRateInr: 1,
    colourRateInr: 3,
    bwDuplexSheetInr: 1.5,
    colourDuplexSheetInr: 5,
    supportsColour: true,
    supportsDuplex: true,
    minCopies: 1,
    maxCopies: 99,
  },
  {
    id: 'kiosk-12',
    name: 'Kiosk #12',
    location: 'Student Center Atrium',
    online: true,
    bwRateInr: 1,
    colourRateInr: 3,
    bwDuplexSheetInr: 1.5,
    colourDuplexSheetInr: 5,
    supportsColour: true,
    supportsDuplex: true,
    minCopies: 1,
    maxCopies: 99,
  },
  {
    id: 'kiosk-19',
    name: 'Kiosk #19',
    location: 'Academic Wing C',
    online: true,
    bwRateInr: 1,
    colourRateInr: 3,
    bwDuplexSheetInr: 1.5,
    colourDuplexSheetInr: 5,
    supportsColour: true,
    supportsDuplex: true,
    minCopies: 1,
    maxCopies: 99,
  },
];

export class ServerDataStore {
  private readonly dataDir: string;
  private readonly uploadsDir: string;
  private readonly dbFile: string;
  private state: PersistedState;
  private mutexPromise: Promise<unknown> = Promise.resolve();

  constructor(baseDir = path.resolve(process.cwd(), '.data')) {
    this.dataDir = baseDir;
    this.uploadsDir = path.join(this.dataDir, 'uploads');
    this.dbFile = path.join(this.dataDir, 'printpoint-store.json');
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.state = this.loadInitialState();
  }

  private loadInitialState(): PersistedState {
    const stationsMap: Record<string, ServerKioskStation> = {};
    for (const s of DEFAULT_STATIONS) {
      stationsMap[s.id] = s;
    }

    if (fs.existsSync(this.dbFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.dbFile, 'utf8')) as Partial<PersistedState>;
        return {
          stations: { ...stationsMap, ...(parsed.stations || {}) },
          sessions: parsed.sessions || {},
          documents: parsed.documents || {},
          wallets: parsed.wallets || {},
          walletTransactions: parsed.walletTransactions || {},
          appliedIdempotencyKeys: parsed.appliedIdempotencyKeys || {},
          paymentOrders: parsed.paymentOrders || {},
          printOrders: parsed.printOrders || {},
          users: parsed.users || {},
        };
      } catch {
        // Corrupted file fallback
      }
    }

    return {
      stations: stationsMap,
      sessions: {},
      documents: {},
      wallets: {},
      walletTransactions: {},
      appliedIdempotencyKeys: {},
      paymentOrders: {},
      printOrders: {},
      users: {},
    };
  }

  private persist(): void {
    const tmpFile = `${this.dbFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmpFile, this.dbFile);
  }

  public withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.mutexPromise.then(() => fn());
    this.mutexPromise = next.catch(() => undefined);
    return next;
  }

  public getUploadDirForUser(uid: string): string {
    const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(this.uploadsDir, safeUid);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public listStations(): ServerKioskStation[] {
    return Object.values(this.state.stations);
  }

  public getStation(stationId: string): ServerKioskStation | null {
    const normalized = stationId.trim().toLowerCase();
    if (this.state.stations[normalized]) {
      return this.state.stations[normalized];
    }
    const numMatch = stationId.match(/(\d+)/);
    if (numMatch) {
      const padded = numMatch[1].padStart(2, '0');
      const key = `kiosk-${padded}`;
      if (this.state.stations[key]) return this.state.stations[key];
      return {
        id: key,
        name: `Kiosk #${padded}`,
        location: `Print Point Station #${padded}`,
        online: true,
        bwRateInr: 1,
        colourRateInr: 3,
        bwDuplexSheetInr: 1.5,
        colourDuplexSheetInr: 5,
        supportsColour: true,
        supportsDuplex: true,
        minCopies: 1,
        maxCopies: 99,
      };
    }
    return null;
  }

  public async issueKioskSession(stationId: string, ttlMs = 15 * 60 * 1000): Promise<StoredKioskSession> {
    return this.withLock(() => {
      const station = this.getStation(stationId);
      if (!station) {
        throw new Error(`Unknown kiosk station "${stationId}".`);
      }
      this.state.stations[station.id] = station;
      const token = `sess_${crypto.randomBytes(12).toString('hex')}`;
      const now = Date.now();
      const session: StoredKioskSession = {
        token,
        stationId: station.id,
        kioskName: station.name,
        location: station.location,
        status: 'open',
        createdAt: now,
        expiresAt: now + ttlMs,
      };
      this.state.sessions[token] = session;
      this.persist();
      return session;
    });
  }

  public async validateAndPairSession(params: {
    token: string;
    stationId: string;
    uid: string;
    expiresAtHint?: number;
  }): Promise<{ ok: true; session: StoredKioskSession; station: ServerKioskStation } | { ok: false; reason: string; error: string }> {
    return this.withLock(() => {
      const { token, stationId, uid, expiresAtHint } = params;
      if (!token || token.length < 6) {
        return { ok: false, reason: 'missing_token', error: 'QR code does not contain a valid kiosk session token.' };
      }

      const station = this.getStation(stationId);
      if (!station || !station.online) {
        return { ok: false, reason: 'inactive', error: 'Kiosk station is unavailable or offline.' };
      }

      const now = Date.now();
      let existing = this.state.sessions[token];

      // Allow pre-printed kiosk QR URLs whose token wasn't pre-registered, provided exp is in the future
      // and token was NOT previously revoked/consumed.
      if (!existing) {
        const exp = expiresAtHint && expiresAtHint > now ? Math.min(expiresAtHint, now + 60 * 60 * 1000) : now + 15 * 60 * 1000;
        existing = {
          token,
          stationId: station.id,
          kioskName: station.name,
          location: station.location,
          status: 'open',
          createdAt: now,
          expiresAt: exp,
        };
      }

      if (existing.status === 'revoked') {
        return { ok: false, reason: 'inactive', error: 'This kiosk session has been revoked.' };
      }
      if (existing.status === 'expired' || now > existing.expiresAt) {
        existing.status = 'expired';
        this.state.sessions[token] = existing;
        this.persist();
        return { ok: false, reason: 'expired', error: 'This kiosk QR session has expired. Please scan the fresh QR on the kiosk.' };
      }
      if (existing.status === 'paired' && existing.boundUid && existing.boundUid !== uid) {
        return { ok: false, reason: 'already_used', error: 'This kiosk QR code has already been claimed by another session.' };
      }

      existing.status = 'paired';
      existing.boundUid = uid;
      existing.pairedAt = now;
      this.state.sessions[token] = existing;
      this.state.stations[station.id] = station;
      this.persist();
      return { ok: true, session: existing, station };
    });
  }

  public getSessionForUser(token: string, uid: string): StoredKioskSession | null {
    const s = this.state.sessions[token];
    if (!s || s.boundUid !== uid) return null;
    if (s.status === 'revoked' || s.status === 'expired' || Date.now() > s.expiresAt) return null;
    return s;
  }

  public async saveDocument(doc: StoredPrintDocument): Promise<StoredPrintDocument> {
    return this.withLock(() => {
      this.state.documents[doc.id] = doc;
      this.persist();
      return doc;
    });
  }

  public getDocumentForUser(docId: string, uid: string): StoredPrintDocument | null {
    const doc = this.state.documents[docId];
    if (!doc || doc.uid !== uid || doc.deleted) return null;
    if (Date.now() > doc.expiresAt) return null;
    return doc;
  }

  public getDocumentById(docId: string): StoredPrintDocument | null {
    const doc = this.state.documents[docId];
    if (!doc || doc.deleted) return null;
    return doc;
  }

  public async deleteDocumentForUser(docId: string, uid: string): Promise<boolean> {
    return this.withLock(() => {
      const doc = this.state.documents[docId];
      if (!doc || doc.uid !== uid) return false;
      doc.deleted = true;
      if (doc.localPdfPath && fs.existsSync(doc.localPdfPath)) {
        try {
          fs.unlinkSync(doc.localPdfPath);
        } catch {
          // ignore
        }
      }
      this.persist();
      return true;
    });
  }

  public getWalletSnapshot(uid: string): {
    balanceInr: number;
    currency: 'INR';
    transactions: StoredWalletTransaction[];
  } {
    const balanceInr = Number((this.state.wallets[uid] ?? 0).toFixed(2));
    const transactions = [...(this.state.walletTransactions[uid] || [])].sort(
      (a, b) => b.createdAt - a.createdAt
    );
    return { balanceInr, currency: 'INR', transactions };
  }

  public async applyWalletMutation(params: {
    uid: string;
    type: 'credit' | 'debit' | 'refund';
    amountInr: number;
    title: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<{
    success: boolean;
    duplicate?: boolean;
    newBalanceInr: number;
    transaction?: StoredWalletTransaction;
    error?: string;
  }> {
    return this.withLock(() => {
      const { uid, type, amountInr, title, referenceId, idempotencyKey } = params;
      if (!idempotencyKey) {
        return {
          success: false,
          newBalanceInr: Number((this.state.wallets[uid] ?? 0).toFixed(2)),
          error: 'Missing idempotencyKey.',
        };
      }
      const existing = this.state.appliedIdempotencyKeys[`wallet:${uid}:${idempotencyKey}`];
      if (existing) {
        const res = existing.result as {
          newBalanceInr: number;
          transaction: StoredWalletTransaction;
        };
        return {
          success: true,
          duplicate: true,
          newBalanceInr: Number((this.state.wallets[uid] ?? res.newBalanceInr).toFixed(2)),
          transaction: res.transaction,
        };
      }

      const amount = Number(amountInr.toFixed(2));
      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          success: false,
          newBalanceInr: Number((this.state.wallets[uid] ?? 0).toFixed(2)),
          error: 'Amount must be greater than zero.',
        };
      }

      const current = Number((this.state.wallets[uid] ?? 0).toFixed(2));
      if (type === 'debit' && current < amount) {
        return {
          success: false,
          newBalanceInr: current,
          error: 'Insufficient Print Point wallet balance.',
        };
      }

      const nextBalance =
        type === 'debit'
          ? Number((current - amount).toFixed(2))
          : Number((current + amount).toFixed(2));

      const tx: StoredWalletTransaction = {
        id: `tx_${crypto.randomBytes(6).toString('hex')}`,
        uid,
        type,
        amountInr: amount,
        balanceAfterInr: nextBalance,
        title,
        referenceId,
        idempotencyKey,
        createdAt: Date.now(),
      };

      this.state.wallets[uid] = nextBalance;
      if (!this.state.walletTransactions[uid]) {
        this.state.walletTransactions[uid] = [];
      }
      this.state.walletTransactions[uid].unshift(tx);
      this.state.appliedIdempotencyKeys[`wallet:${uid}:${idempotencyKey}`] = {
        result: { newBalanceInr: nextBalance, transaction: tx },
        createdAt: Date.now(),
      };
      this.persist();
      return {
        success: true,
        newBalanceInr: nextBalance,
        transaction: tx,
      };
    });
  }

  public async savePaymentOrder(order: StoredPaymentOrder): Promise<StoredPaymentOrder> {
    return this.withLock(() => {
      this.state.paymentOrders[order.orderId] = order;
      this.persist();
      return order;
    });
  }

  public getPaymentOrder(orderId: string): StoredPaymentOrder | null {
    return this.state.paymentOrders[orderId] || null;
  }

  public findPaymentOrderByIdempotencyKey(uid: string, idempotencyKey: string): StoredPaymentOrder | null {
    return (
      Object.values(this.state.paymentOrders).find(
        (o) => o.uid === uid && o.idempotencyKey === idempotencyKey
      ) || null
    );
  }

  private generateUniqueReleaseCode(stationId: string): string {
    const activeCodes = new Set(
      Object.values(this.state.printOrders)
        .filter((o) => o.stationId === stationId && (o.status === 'Queued' || o.status === 'Claimed' || o.status === 'Printing'))
        .map((o) => o.releaseCode)
    );
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = String(crypto.randomInt(1000, 10000));
      if (!activeCodes.has(code)) return code;
    }
    return String(crypto.randomInt(1000, 10000));
  }

  public async createPrintOrder(params: {
    uid: string;
    stationId: string;
    kioskName: string;
    sessionToken: string;
    documentCount: number;
    totalPages: number;
    totalSheets: number;
    colourLabel: string;
    sidesLabel: string;
    amountInr: number;
    paymentMethod: string;
    paymentReferenceId?: string;
    idempotencyKey: string;
    items: StoredPrintOrderItem[];
  }): Promise<{ order: StoredPrintOrder; duplicate: boolean }> {
    return this.withLock(() => {
      const existing = Object.values(this.state.printOrders).find(
        (o) => o.uid === params.uid && o.idempotencyKey === params.idempotencyKey
      );
      if (existing) {
        return { order: existing, duplicate: true };
      }

      const now = Date.now();
      const orderId = `ord_${crypto.randomBytes(6).toString('hex')}`;
      const shortSeq = crypto.randomBytes(3).toString('hex').toUpperCase();
      const releaseCode = this.generateUniqueReleaseCode(params.stationId);

      const order: StoredPrintOrder = {
        id: orderId,
        orderNumber: `PP-${shortSeq}`,
        uid: params.uid,
        stationId: params.stationId,
        kioskName: params.kioskName,
        sessionToken: params.sessionToken,
        releaseCode,
        documentCount: params.documentCount,
        totalPages: params.totalPages,
        totalSheets: params.totalSheets,
        colourLabel: params.colourLabel,
        sidesLabel: params.sidesLabel,
        amountInr: Number(params.amountInr.toFixed(2)),
        paymentMethod: params.paymentMethod,
        paymentReferenceId: params.paymentReferenceId,
        status: 'Queued',
        idempotencyKey: params.idempotencyKey,
        items: params.items,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 30 * 60 * 1000,
      };

      this.state.printOrders[order.id] = order;
      this.persist();
      return { order, duplicate: false };
    });
  }

  public listOrdersForUser(uid: string): StoredPrintOrder[] {
    return Object.values(this.state.printOrders)
      .filter((o) => o.uid === uid)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public getOrderForUser(orderId: string, uid: string): StoredPrintOrder | null {
    const order = this.state.printOrders[orderId];
    return order && order.uid === uid ? order : null;
  }

  public listQueuedOrdersForKiosk(stationId: string): StoredPrintOrder[] {
    const normalized = stationId.trim().toLowerCase();
    return Object.values(this.state.printOrders)
      .filter(
        (o) =>
          o.stationId.toLowerCase() === normalized &&
          (o.status === 'Queued' || o.status === 'Claimed' || o.status === 'Printing')
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  public async releaseOrderByPin(stationId: string, releaseCode: string): Promise<StoredPrintOrder | null> {
    return this.withLock(() => {
      const normalized = stationId.trim().toLowerCase();
      const match = Object.values(this.state.printOrders).find(
        (o) =>
          o.stationId.toLowerCase() === normalized &&
          o.releaseCode === releaseCode.trim() &&
          o.status === 'Queued'
      );
      if (!match) return null;
      match.status = 'Claimed';
      match.updatedAt = Date.now();
      this.persist();
      return match;
    });
  }

  public async updateOrderStatusFromKiosk(
    orderId: string,
    status: 'Claimed' | 'Printing' | 'Printed' | 'Failed',
    failureReason?: string
  ): Promise<StoredPrintOrder | null> {
    return this.withLock(() => {
      const order = this.state.printOrders[orderId];
      if (!order) return null;
      order.status = status;
      order.updatedAt = Date.now();
      if (status === 'Failed' && failureReason) {
        order.failureReason = failureReason;
      }

      // Immediately delete printed temporary files once print job completes on kiosk
      if (status === 'Printed') {
        for (const item of order.items) {
          const doc = this.state.documents[item.docId];
          if (doc && !doc.deleted) {
            doc.deleted = true;
            if (doc.localPdfPath && fs.existsSync(doc.localPdfPath)) {
              try {
                fs.unlinkSync(doc.localPdfPath);
              } catch {
                // ignore
              }
            }
          }
        }
      }

      this.persist();
      return order;
    });
  }

  public async refundFailedOrder(orderId: string, uid: string): Promise<{
    success: boolean;
    order?: StoredPrintOrder;
    newBalanceInr: number;
    error?: string;
  }> {
    return this.withLock(async () => {
      const order = this.state.printOrders[orderId];
      const currentBal = Number((this.state.wallets[uid] ?? 0).toFixed(2));
      if (!order || order.uid !== uid) {
        return { success: false, newBalanceInr: currentBal, error: 'Order not found.' };
      }
      if (order.status === 'Refunded') {
        return { success: false, newBalanceInr: currentBal, error: 'Order already refunded.' };
      }
      if (order.status !== 'Failed') {
        return { success: false, newBalanceInr: currentBal, error: 'Only failed orders can be refunded.' };
      }

      const txKey = `refund_${order.id}`;
      // inline atomic refund inside same state mutation
      const existing = this.state.appliedIdempotencyKeys[`wallet:${uid}:${txKey}`];
      if (existing) {
        return { success: false, newBalanceInr: currentBal, error: 'Order refund already processed.' };
      }

      const nextBalance = Number((currentBal + order.amountInr).toFixed(2));
      const tx: StoredWalletTransaction = {
        id: `tx_${crypto.randomBytes(6).toString('hex')}`,
        uid,
        type: 'refund',
        amountInr: order.amountInr,
        balanceAfterInr: nextBalance,
        title: `Refund · ${order.orderNumber}`,
        referenceId: order.id,
        idempotencyKey: txKey,
        createdAt: Date.now(),
      };
      this.state.wallets[uid] = nextBalance;
      if (!this.state.walletTransactions[uid]) this.state.walletTransactions[uid] = [];
      this.state.walletTransactions[uid].unshift(tx);
      this.state.appliedIdempotencyKeys[`wallet:${uid}:${txKey}`] = {
        result: { newBalanceInr: nextBalance, transaction: tx },
        createdAt: Date.now(),
      };
      order.status = 'Refunded';
      order.updatedAt = Date.now();
      this.persist();
      return { success: true, order, newBalanceInr: nextBalance };
    });
  }

  public getOrderForKioskFile(orderId: string, docId: string): { order: StoredPrintOrder; doc: StoredPrintDocument } | null {
    const order = this.state.printOrders[orderId];
    if (!order) return null;
    if (!order.items.some((i) => i.docId === docId)) return null;
    const doc = this.state.documents[docId];
    if (!doc || doc.deleted) return null;
    return { order, doc };
  }

  public async upsertUserProfile(profile: StoredUserProfile): Promise<StoredUserProfile> {
    return this.withLock(() => {
      const existing = this.state.users[profile.uid];
      const merged: StoredUserProfile = {
        uid: profile.uid,
        name: profile.name || existing?.name || 'Print Point User',
        email: existing?.email || profile.email,
        phone: profile.phone ?? existing?.phone ?? '',
        photoURL: profile.photoURL ?? existing?.photoURL,
        language: profile.language ?? existing?.language ?? 'English',
        notificationsEnabled:
          typeof profile.notificationsEnabled === 'boolean'
            ? profile.notificationsEnabled
            : existing?.notificationsEnabled ?? true,
        role: 'user',
        joinedDate: existing?.joinedDate || profile.joinedDate,
        updatedAt: Date.now(),
      };
      this.state.users[profile.uid] = merged;
      this.persist();
      return merged;
    });
  }

  public getUserProfile(uid: string): StoredUserProfile | null {
    return this.state.users[uid] || null;
  }

  public async cleanupExpiredResources(): Promise<number> {
    return this.withLock(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const session of Object.values(this.state.sessions)) {
        if (session.status !== 'expired' && now > session.expiresAt) {
          session.status = 'expired';
          cleaned++;
        }
      }

      for (const doc of Object.values(this.state.documents)) {
        if (!doc.deleted && now > doc.expiresAt) {
          doc.deleted = true;
          if (doc.localPdfPath && fs.existsSync(doc.localPdfPath)) {
            try {
              fs.unlinkSync(doc.localPdfPath);
            } catch {
              // ignore
            }
          }
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.persist();
      }
      return cleaned;
    });
  }
}
