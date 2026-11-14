/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import Razorpay from 'razorpay';
import { PDFDocument } from 'pdf-lib';
import {
  AuthenticatedRequest,
  requireFirebaseAuth,
  requireKioskSecret,
  getFirebaseAdminApp,
} from './server/auth';
import { ServerDataStore, StoredPrintOrderItem } from './server/store';
import { computeAuthoritativePricing, ServerDocumentInput } from './server/pricing';
import { validateAndConvertToPdf, stripPagesFromPdfBuffer } from './server/converter';

export interface RazorpayClientLike {
  orders: {
    create(params: {
      amount: number;
      currency: string;
      receipt: string;
      notes?: Record<string, string>;
    }): Promise<{ id: string; amount: number; currency: string; status?: string }>;
    fetchPayments(orderId: string): Promise<{
      items?: Array<{ id: string; status: string; amount: number; method?: string }>;
    }>;
  };
}

function resolveRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  return {
    keyId,
    keySecret,
    webhookSecret,
    ready: Boolean(keyId && keySecret),
  };
}

function buildRazorpayClient(): RazorpayClientLike | null {
  const cfg = resolveRazorpayConfig();
  if (!cfg.ready) return null;
  return new Razorpay({
    key_id: cfg.keyId,
    key_secret: cfg.keySecret,
  }) as unknown as RazorpayClientLike;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'txt',
  'csv',
]);

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  const a = Buffer.from(aHex, 'utf8');
  const b = Buffer.from(bHex, 'utf8');
  return crypto.timingSafeEqual(a, b);
}

function parseKioskQrInput(rawInput: string): {
  stationId: string;
  sessionToken: string;
  expiresAt?: number;
} | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const kioskRaw = String(obj.kioskId || obj.stationId || obj.kioskName || '');
      const tokenRaw = String(obj.sessionToken || obj.token || obj.session || '').trim();
      const exp = typeof obj.expiresAt === 'number' ? obj.expiresAt : undefined;
      if (kioskRaw && tokenRaw) {
        return { stationId: kioskRaw, sessionToken: tokenRaw, expiresAt: exp };
      }
    } catch {
      return null;
    }
  }

  if (trimmed.toUpperCase().startsWith('PRINTPOINT:')) {
    const parts = trimmed.split(':');
    if (parts.length >= 3) {
      return {
        stationId: parts[1].trim(),
        sessionToken: parts[2].trim(),
        expiresAt: parts[3] ? Number(parts[3]) : undefined,
      };
    }
  }

  try {
    const url = new URL(trimmed);
    const kioskRaw = url.searchParams.get('kiosk') || url.searchParams.get('station') || '';
    const tokenRaw = url.searchParams.get('token') || url.searchParams.get('session') || '';
    const expRaw = url.searchParams.get('exp');
    if (kioskRaw && tokenRaw) {
      return {
        stationId: kioskRaw.trim(),
        sessionToken: tokenRaw.trim(),
        expiresAt: expRaw ? Number(expRaw) : undefined,
      };
    }
  } catch {
    // not a URL
  }

  return null;
}

export function createApp(options?: {
  store?: ServerDataStore;
  razorpayClient?: RazorpayClientLike | null;
}) {
  const store = options?.store || new ServerDataStore();
  const app = express();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Capture raw body for Razorpay HMAC webhook signature verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.get('/api/health', (_req, res) => {
    const rzp = resolveRazorpayConfig();
    res.json({
      ok: true,
      service: 'printpoint-backend',
      razorpayReady: rzp.ready,
      firebaseAdminReady: Boolean(getFirebaseAdminApp()),
      timestamp: Date.now(),
    });
  });

  // ── Stations & QR Sessions ──────────────────────────────────────────────────
  app.get('/api/kiosk/stations', (_req, res) => {
    res.json({ stations: store.listStations() });
  });

  app.get('/api/kiosk/stations/:stationId', (req, res) => {
    const station = store.getStation(req.params.stationId);
    if (!station) {
      res.status(404).json({ error: 'Kiosk station not found.' });
      return;
    }
    res.json({ station });
  });

  // Issued by physical Windows Kiosk screen (authenticated with X-Kiosk-Secret)
  app.post('/api/kiosk/sessions', requireKioskSecret, async (req, res, next) => {
    try {
      const stationId = String(req.body?.stationId || 'kiosk-04');
      const ttlMs = Math.min(60 * 60 * 1000, Math.max(60_000, Number(req.body?.ttlMs || 15 * 60 * 1000)));
      const session = await store.issueKioskSession(stationId, ttlMs);
      const qrUrl = `https://kiosk.printpoint.app/session?kiosk=${encodeURIComponent(session.stationId)}&token=${encodeURIComponent(session.token)}&exp=${session.expiresAt}`;
      res.status(201).json({ session, qrPayload: qrUrl });
    } catch (err) {
      next(err);
    }
  });

  // Validated when mobile user scans kiosk QR
  app.post(
    '/api/kiosk/sessions/validate',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        let stationId = String(req.body?.stationId || '').trim();
        let sessionToken = String(req.body?.sessionToken || '').trim();
        let expiresAtHint =
          typeof req.body?.expiresAt === 'number' ? req.body.expiresAt : undefined;

        if (req.body?.qrPayload) {
          const parsed = parseKioskQrInput(String(req.body.qrPayload));
          if (!parsed) {
            res.status(400).json({
              valid: false,
              reason: 'invalid_format',
              error: 'Not a recognized Print Point kiosk QR code.',
            });
            return;
          }
          stationId = parsed.stationId;
          sessionToken = parsed.sessionToken;
          expiresAtHint = parsed.expiresAt;
        }

        if (!stationId || !sessionToken) {
          res.status(400).json({
            valid: false,
            reason: 'missing_token',
            error: 'Kiosk ID and active session token are required.',
          });
          return;
        }

        const result = await store.validateAndPairSession({
          token: sessionToken,
          stationId,
          uid,
          expiresAtHint,
        });

        if (!result.ok) {
          res.status(409).json(result);
          return;
        }

        res.json({
          valid: true,
          station: result.station,
          session: result.session,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── User Profile ────────────────────────────────────────────────────────────
  app.get('/api/profile', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser!;
    const stored = store.getUserProfile(authUser.uid);
    res.json({
      profile: stored || {
        uid: authUser.uid,
        name: authUser.name,
        email: authUser.email,
        phone: '',
        photoURL: authUser.photoURL,
        language: 'English',
        notificationsEnabled: true,
        role: 'user',
        joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        updatedAt: Date.now(),
      },
    });
  });

  app.put('/api/profile', requireFirebaseAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.authUser!;
      const body = req.body || {};
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : authUser.name;
      const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 32) : '';
      const language = ['English', 'ગુજરાતી', 'हिन्दी'].includes(body.language)
        ? body.language
        : 'English';
      const notificationsEnabled =
        typeof body.notificationsEnabled === 'boolean' ? body.notificationsEnabled : true;

      const updated = await store.upsertUserProfile({
        uid: authUser.uid,
        name,
        email: authUser.email,
        phone,
        photoURL: typeof body.photoURL === 'string' ? body.photoURL.slice(0, 1024) : authUser.photoURL,
        language,
        notificationsEnabled,
        role: 'user',
        joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        updatedAt: Date.now(),
      });
      res.json({ profile: updated });
    } catch (err) {
      next(err);
    }
  });

  // ── Document Upload, Conversion, Editing & Cleanup ──────────────────────────
  app.post(
    '/api/documents/upload',
    requireFirebaseAuth,
    upload.single('file'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No file attached in multipart request.' });
          return;
        }

        const originalName = path.basename(file.originalname || 'document.pdf');
        const ext = originalName.toLowerCase().split('.').pop() || '';
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          res.status(400).json({ error: `Unsupported file type ".${ext}".` });
          return;
        }

        const stationId = String(req.body?.stationId || '').trim();
        const sessionToken = String(req.body?.sessionToken || '').trim();
        if (!stationId || !sessionToken) {
          res.status(400).json({ error: 'An active paired kiosk session is required before uploading.' });
          return;
        }

        const pairedSession = store.getSessionForUser(sessionToken, uid);
        if (!pairedSession || pairedSession.stationId.toLowerCase() !== (store.getStation(stationId)?.id || '').toLowerCase()) {
          res.status(403).json({
            error: 'Kiosk session is invalid, expired, or not paired with your account. Scan the kiosk QR again.',
          });
          return;
        }

        const converted = await validateAndConvertToPdf(file.buffer, originalName);
        const docId = String(req.body?.docId || `doc_${crypto.randomBytes(6).toString('hex')}`).replace(/[^a-zA-Z0-9_-]/g, '');
        const userDir = store.getUploadDirForUser(uid);
        const pdfFileName = `${docId}.pdf`;
        const localPdfPath = path.join(userDir, pdfFileName);
        fs.writeFileSync(localPdfPath, converted.pdfBuffer);

        const ttlMinutes = Math.max(5, Number(process.env.UPLOAD_TTL_MINUTES || 30));
        const now = Date.now();
        const safeBaseName = originalName.replace(/\.[^.]+$/, '.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `kiosks/${uid}/${sessionToken}/${docId}/${safeBaseName}`;

        const storedDoc = await store.saveDocument({
          id: docId,
          uid,
          stationId: pairedSession.stationId,
          sessionToken,
          name: originalName,
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: converted.pdfBuffer.length,
          pageCount: converted.pageCount,
          blankPages: converted.blankPages,
          storagePath,
          localPdfPath,
          convertedFromFormat: converted.convertedFromFormat,
          converterEngine: converted.converterEngine,
          createdAt: now,
          expiresAt: now + ttlMinutes * 60 * 1000,
          deleted: false,
        });

        res.status(201).json({
          docId: storedDoc.id,
          name: storedDoc.name,
          pageCount: storedDoc.pageCount,
          blankPages: storedDoc.blankPages,
          storagePath: storedDoc.storagePath,
          convertedFromFormat: storedDoc.convertedFromFormat,
          converterEngine: storedDoc.converterEngine,
          convertedPdfUrl: `/api/documents/${encodeURIComponent(storedDoc.id)}/pdf`,
          expiresAt: storedDoc.expiresAt,
        });
      } catch (err) {
        if (err instanceof Error && !res.headersSent) {
          res.status(400).json({ error: err.message });
          return;
        }
        next(err);
      }
    }
  );

  app.get('/api/documents/:docId/pdf', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const doc = store.getDocumentForUser(req.params.docId, req.authUser!.uid);
    if (!doc || !fs.existsSync(doc.localPdfPath)) {
      res.status(404).json({ error: 'Document not found or expired.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name.replace(/\.[^.]+$/, '.pdf'))}"`);
    fs.createReadStream(doc.localPdfPath).pipe(res);
  });

  app.put(
    '/api/documents/:docId/pdf',
    requireFirebaseAuth,
    upload.single('file'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const doc = store.getDocumentForUser(req.params.docId, uid);
        if (!doc) {
          res.status(404).json({ error: 'Document not found or expired.' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: 'Updated PDF file is required.' });
          return;
        }

        const parsed = await PDFDocument.load(req.file.buffer, { ignoreEncryption: false });
        const pageCount = parsed.getPageCount();
        if (pageCount < 1) {
          res.status(400).json({ error: 'Edited PDF must retain at least 1 page.' });
          return;
        }

        fs.writeFileSync(doc.localPdfPath, req.file.buffer);
        doc.sizeBytes = req.file.buffer.length;
        doc.pageCount = pageCount;
        doc.blankPages = [];
        await store.saveDocument(doc);

        res.json({
          docId: doc.id,
          pageCount: doc.pageCount,
          sizeBytes: doc.sizeBytes,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.delete('/api/documents/:docId', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
    const deleted = await store.deleteDocumentForUser(req.params.docId, req.authUser!.uid);
    if (!deleted) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // ── Authoritative Pricing Endpoints ─────────────────────────────────────────
  app.get('/api/pricing/config', (req, res) => {
    const stationId = String(req.query.stationId || 'kiosk-04');
    const station = store.getStation(stationId);
    if (!station) {
      res.status(404).json({ error: 'Kiosk pricing config unavailable.' });
      return;
    }
    res.json({
      stationId: station.id,
      currency: 'INR',
      bwPerPageInr: station.bwRateInr,
      colourPerPageInr: station.colourRateInr,
      bwDuplexSheetInr: station.bwDuplexSheetInr,
      colourDuplexSheetInr: station.colourDuplexSheetInr,
      supportsColour: station.supportsColour,
      supportsDuplex: station.supportsDuplex,
      minCopies: station.minCopies,
      maxCopies: station.maxCopies,
      source: 'backend',
    });
  });

  app.post('/api/pricing/quote', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
    const uid = req.authUser!.uid;
    const stationId = String(req.body?.stationId || '').trim();
    const sessionToken = String(req.body?.sessionToken || '').trim();
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    const session = store.getSessionForUser(sessionToken, uid);
    if (!session) {
      res.status(403).json({
        ok: false,
        reason: 'session-expired',
        error: 'Kiosk pairing session expired or invalid. Scan QR again.',
      });
      return;
    }

    const station = store.getStation(stationId || session.stationId);
    if (!station) {
      res.status(404).json({ ok: false, reason: 'pricing-unavailable', error: 'Kiosk station not found.' });
      return;
    }

    if (rawItems.length === 0) {
      res.status(400).json({ ok: false, reason: 'invalid-documents', error: 'No documents in print job.' });
      return;
    }

    const serverInputs: ServerDocumentInput[] = [];
    for (const item of rawItems) {
      const docId = String(item.docId || item.id || '');
      const doc = store.getDocumentForUser(docId, uid);
      if (!doc || !fs.existsSync(doc.localPdfPath)) {
        res.status(400).json({
          ok: false,
          reason: 'invalid-documents',
          error: `Document "${item.name || docId}" must be uploaded and processed before payment.`,
        });
        return;
      }
      serverInputs.push({
        docId: doc.id,
        name: doc.name,
        pageCount: doc.pageCount,
        blankPagesCount: doc.blankPages.length,
        colourMode: item.colourMode === 'colour' ? 'colour' : 'bw',
        sides: item.sides === '2-sided' ? '2-sided' : '1-sided',
        copies: Number(item.copies || 1),
        removeBlankPages: Boolean(item.removeBlankPages),
      });
    }

    const quote = computeAuthoritativePricing(station, serverInputs);
    res.json({
      ok: true,
      stationId: station.id,
      verifiedTotalInr: quote.totalInr,
      currency: 'INR',
      breakdown: quote,
    });
  });

  // ── Wallet & Payment Endpoints ──────────────────────────────────────────────
  app.get('/api/payments/capabilities', (_req, res) => {
    const rzp = resolveRazorpayConfig();
    const missing: string[] = [];
    if (!rzp.keyId) missing.push('RAZORPAY_KEY_ID');
    if (!rzp.keySecret) missing.push('RAZORPAY_KEY_SECRET');
    res.json({
      razorpayReady: rzp.ready,
      topupSupported: rzp.ready,
      directPaymentSupported: rzp.ready,
      keyId: rzp.keyId || undefined,
      missingConfigItems: missing,
    });
  });

  app.get('/api/wallet', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    res.json(store.getWalletSnapshot(req.authUser!.uid));
  });

  app.get('/api/wallet/transactions', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const snap = store.getWalletSnapshot(req.authUser!.uid);
    res.json({ transactions: snap.transactions });
  });

  // Atomic print job checkout via Print Point Wallet
  app.post(
    '/api/wallet/debit-and-print',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
        const sessionToken = String(req.body?.sessionToken || '').trim();
        const stationId = String(req.body?.stationId || '').trim();
        const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

        if (!idempotencyKey) {
          res.status(400).json({ error: 'idempotencyKey is required.' });
          return;
        }

        const session = store.getSessionForUser(sessionToken, uid);
        if (!session) {
          res.status(403).json({ error: 'Kiosk pairing session expired or invalid. Scan QR again.' });
          return;
        }

        const station = store.getStation(stationId || session.stationId);
        if (!station) {
          res.status(404).json({ error: 'Kiosk station unavailable.' });
          return;
        }

        if (rawItems.length === 0) {
          res.status(400).json({ error: 'At least one uploaded document is required.' });
          return;
        }

        // Load & prepare authoritative server documents (strip blank pages if requested so quoted pages == printed PDF!)
        const serverInputs: ServerDocumentInput[] = [];
        const orderItems: StoredPrintOrderItem[] = [];

        for (const item of rawItems) {
          const docId = String(item.docId || item.id || '');
          const doc = store.getDocumentForUser(docId, uid);
          if (!doc || !fs.existsSync(doc.localPdfPath)) {
            res.status(400).json({ error: `Document "${item.name || docId}" is missing or expired.` });
            return;
          }
          const removeBlankPages = Boolean(item.removeBlankPages);
          if (removeBlankPages && doc.blankPages.length > 0 && doc.blankPages.length < doc.pageCount) {
            const stripped = await stripPagesFromPdfBuffer(fs.readFileSync(doc.localPdfPath), doc.blankPages);
            fs.writeFileSync(doc.localPdfPath, stripped.pdfBuffer);
            doc.pageCount = stripped.pageCount;
            doc.sizeBytes = stripped.pdfBuffer.length;
            doc.blankPages = [];
            await store.saveDocument(doc);
          }

          serverInputs.push({
            docId: doc.id,
            name: doc.name,
            pageCount: doc.pageCount,
            blankPagesCount: 0,
            colourMode: item.colourMode === 'colour' ? 'colour' : 'bw',
            sides: item.sides === '2-sided' ? '2-sided' : '1-sided',
            copies: Number(item.copies || 1),
            removeBlankPages,
          });
          orderItems.push({
            docId: doc.id,
            name: doc.name,
            pages: doc.pageCount,
            copies: Math.max(1, Number(item.copies || 1)),
            colourMode: item.colourMode === 'colour' ? 'colour' : 'bw',
            sides: item.sides === '2-sided' ? '2-sided' : '1-sided',
            removeBlankPages,
          });
        }

        const quote = computeAuthoritativePricing(station, serverInputs);

        // Idempotent debit
        const debit = await store.applyWalletMutation({
          uid,
          type: 'debit',
          amountInr: quote.totalInr,
          title: `Print Job · ${station.name}`,
          referenceId: idempotencyKey,
          idempotencyKey: `print_debit_${idempotencyKey}`,
        });

        if (!debit.success) {
          res.status(400).json({
            error: debit.error || 'Wallet debit failed.',
            balanceInr: debit.newBalanceInr,
          });
          return;
        }

        const colourModes = new Set(orderItems.map((i) => i.colourMode));
        const sidesModes = new Set(orderItems.map((i) => i.sides));
        const colourLabel =
          colourModes.size > 1 ? 'Mixed' : colourModes.has('colour') ? 'Colour' : 'Black & White';
        const sidesLabel =
          sidesModes.size > 1 ? 'Mixed' : sidesModes.has('2-sided') ? '2-Sided' : '1-Sided';

        const { order, duplicate } = await store.createPrintOrder({
          uid,
          stationId: station.id,
          kioskName: station.name,
          sessionToken,
          documentCount: orderItems.length,
          totalPages: quote.totalPrintablePages,
          totalSheets: quote.totalSheets,
          colourLabel,
          sidesLabel,
          amountInr: quote.totalInr,
          paymentMethod: 'Print Point Wallet',
          paymentReferenceId: debit.transaction?.id,
          idempotencyKey,
          items: orderItems,
        });

        res.status(201).json({
          success: true,
          duplicate,
          order,
          newBalanceInr: debit.newBalanceInr,
          transaction: debit.transaction,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/payments/create-order',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const purpose = req.body?.purpose === 'wallet_topup' ? 'wallet_topup' : 'print_job';
        const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
        if (!idempotencyKey) {
          res.status(400).json({ error: 'idempotencyKey is required.' });
          return;
        }

        const existing = store.findPaymentOrderByIdempotencyKey(uid, idempotencyKey);
        if (existing) {
          res.json({
            orderId: existing.orderId,
            amountPaise: existing.amountPaise,
            currency: existing.currency,
            amountInr: existing.amountInr,
            keyId: resolveRazorpayConfig().keyId,
          });
          return;
        }

        const rzpClient = options?.razorpayClient !== undefined ? options.razorpayClient : buildRazorpayClient();
        if (!rzpClient) {
          res.status(503).json({
            error: 'Razorpay payment gateway credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured on the server.',
          });
          return;
        }

        let authoritativeAmountInr = 0;
        let jobPayload:
          | {
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
            }
          | undefined;

        if (purpose === 'wallet_topup') {
          const requested = Number(req.body?.amountInr || 0);
          if (!Number.isFinite(requested) || requested < 10 || requested > 5000) {
            res.status(400).json({ error: 'Wallet top-up amount must be between ₹10 and ₹5,000.' });
            return;
          }
          authoritativeAmountInr = Math.round(requested * 100) / 100;
        } else {
          // NEVER trust req.body.amountInr for print jobs; derive 100% from server station & uploaded docs!
          const sessionToken = String(req.body?.sessionToken || '').trim();
          const stationId = String(req.body?.stationId || '').trim();
          const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

          const session = store.getSessionForUser(sessionToken, uid);
          if (!session) {
            res.status(403).json({ error: 'Active paired kiosk session required.' });
            return;
          }
          const station = store.getStation(stationId || session.stationId);
          if (!station) {
            res.status(404).json({ error: 'Kiosk station not found.' });
            return;
          }
          if (rawItems.length === 0) {
            res.status(400).json({ error: 'At least one uploaded document is required.' });
            return;
          }

          const serverInputs: ServerDocumentInput[] = [];
          const normalizedItems: NonNullable<typeof jobPayload>['items'] = [];

          for (const item of rawItems) {
            const docId = String(item.docId || item.id || '');
            const doc = store.getDocumentForUser(docId, uid);
            if (!doc || !fs.existsSync(doc.localPdfPath)) {
              res.status(400).json({ error: `Uploaded document "${item.name || docId}" not found.` });
              return;
            }
            const removeBlankPages = Boolean(item.removeBlankPages);
            serverInputs.push({
              docId: doc.id,
              name: doc.name,
              pageCount: doc.pageCount,
              blankPagesCount: doc.blankPages.length,
              colourMode: item.colourMode === 'colour' ? 'colour' : 'bw',
              sides: item.sides === '2-sided' ? '2-sided' : '1-sided',
              copies: Number(item.copies || 1),
              removeBlankPages,
            });
            normalizedItems.push({
              docId: doc.id,
              name: doc.name,
              pages: doc.pageCount,
              copies: Math.max(1, Number(item.copies || 1)),
              colourMode: item.colourMode === 'colour' ? 'colour' : 'bw',
              sides: item.sides === '2-sided' ? '2-sided' : '1-sided',
              removeBlankPages,
            });
          }

          const quote = computeAuthoritativePricing(station, serverInputs);
          authoritativeAmountInr = quote.totalInr;
          jobPayload = {
            stationId: station.id,
            sessionToken,
            items: normalizedItems,
          };
        }

        const amountPaise = Math.round(authoritativeAmountInr * 100);
        const receipt = `pp_${purpose === 'wallet_topup' ? 'topup' : 'job'}_${crypto.randomBytes(6).toString('hex')}`;
        const rzpOrder = await rzpClient.orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt,
          notes: {
            uid,
            purpose,
            idempotencyKey,
          },
        });

        await store.savePaymentOrder({
          orderId: rzpOrder.id,
          uid,
          purpose,
          amountInr: authoritativeAmountInr,
          amountPaise: rzpOrder.amount,
          currency: 'INR',
          preferredMethod: req.body?.preferredMethod,
          idempotencyKey,
          status: 'created',
          stationId: jobPayload?.stationId,
          sessionToken: jobPayload?.sessionToken,
          jobPayload,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        res.status(201).json({
          orderId: rzpOrder.id,
          amountPaise: rzpOrder.amount,
          currency: 'INR',
          amountInr: authoritativeAmountInr,
          keyId: resolveRazorpayConfig().keyId,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  async function fulfillVerifiedPaymentOrder(params: {
    orderId: string;
    paymentId: string;
    methodLabel?: string;
  }) {
    const order = store.getPaymentOrder(params.orderId);
    if (!order) {
      throw new Error('Payment order not found.');
    }
    order.status = 'paid';
    order.razorpayPaymentId = params.paymentId;
    order.updatedAt = Date.now();
    await store.savePaymentOrder(order);

    if (order.purpose === 'wallet_topup') {
      const credit = await store.applyWalletMutation({
        uid: order.uid,
        type: 'credit',
        amountInr: order.amountInr,
        title: `Wallet Top-up · ${params.methodLabel || 'Razorpay'}`,
        referenceId: params.paymentId,
        idempotencyKey: `rzp_topup_${order.orderId}`,
      });
      return {
        purpose: 'wallet_topup' as const,
        newBalanceInr: credit.newBalanceInr,
        transaction: credit.transaction,
      };
    }

    const jobPayload = order.jobPayload;
    if (!jobPayload) {
      throw new Error('Missing print job payload for payment order.');
    }
    const station = store.getStation(jobPayload.stationId);
    if (!station) {
      throw new Error('Kiosk station unavailable.');
    }

    const serverInputs: ServerDocumentInput[] = [];
    const items: StoredPrintOrderItem[] = [];
    for (const item of jobPayload.items) {
      const doc = store.getDocumentForUser(item.docId, order.uid);
      if (doc && fs.existsSync(doc.localPdfPath) && item.removeBlankPages && doc.blankPages.length > 0) {
        const stripped = await stripPagesFromPdfBuffer(fs.readFileSync(doc.localPdfPath), doc.blankPages);
        fs.writeFileSync(doc.localPdfPath, stripped.pdfBuffer);
        doc.pageCount = stripped.pageCount;
        doc.sizeBytes = stripped.pdfBuffer.length;
        doc.blankPages = [];
        await store.saveDocument(doc);
      }
      const pages = doc?.pageCount || item.pages;
      serverInputs.push({
        docId: item.docId,
        name: item.name,
        pageCount: pages,
        blankPagesCount: 0,
        colourMode: item.colourMode,
        sides: item.sides,
        copies: item.copies,
        removeBlankPages: item.removeBlankPages,
      });
      items.push({ ...item, pages });
    }

    const quote = computeAuthoritativePricing(station, serverInputs);
    const colourModes = new Set(items.map((i) => i.colourMode));
    const sidesModes = new Set(items.map((i) => i.sides));
    const { order: printOrder } = await store.createPrintOrder({
      uid: order.uid,
      stationId: station.id,
      kioskName: station.name,
      sessionToken: jobPayload.sessionToken,
      documentCount: items.length,
      totalPages: quote.totalPrintablePages,
      totalSheets: quote.totalSheets,
      colourLabel: colourModes.size > 1 ? 'Mixed' : colourModes.has('colour') ? 'Colour' : 'Black & White',
      sidesLabel: sidesModes.size > 1 ? 'Mixed' : sidesModes.has('2-sided') ? '2-Sided' : '1-Sided',
      amountInr: order.amountInr,
      paymentMethod: params.methodLabel || 'Razorpay UPI / Card',
      paymentReferenceId: params.paymentId,
      idempotencyKey: `rzp_print_${order.orderId}`,
      items,
    });

    return {
      purpose: 'print_job' as const,
      printOrder,
    };
  }

  app.post(
    '/api/payments/verify',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          res.status(400).json({ verified: false, message: 'Missing Razorpay signature parameters.' });
          return;
        }

        const rzpCfg = resolveRazorpayConfig();
        if (!rzpCfg.keySecret) {
          res.status(503).json({ verified: false, message: 'Razorpay key secret not configured.' });
          return;
        }

        const order = store.getPaymentOrder(String(razorpay_order_id));
        if (!order || order.uid !== uid) {
          res.status(404).json({ verified: false, message: 'Payment order not found.' });
          return;
        }

        const expectedSig = crypto
          .createHmac('sha256', rzpCfg.keySecret)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest('hex');

        if (!timingSafeEqualHex(expectedSig, String(razorpay_signature))) {
          order.status = 'failed';
          order.updatedAt = Date.now();
          await store.savePaymentOrder(order);
          res.status(400).json({
            verified: false,
            message: 'Razorpay signature verification failed.',
          });
          return;
        }

        const fulfilled = await fulfillVerifiedPaymentOrder({
          orderId: order.orderId,
          paymentId: String(razorpay_payment_id),
        });

        res.json({
          verified: true,
          referenceId: razorpay_payment_id,
          ...fulfilled,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get(
    '/api/payments/status',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const uid = req.authUser!.uid;
        const orderId = String(req.query.orderId || '').trim();
        const idempotencyKey = String(req.query.idempotencyKey || '').trim();
        const order =
          (orderId ? store.getPaymentOrder(orderId) : null) ||
          (idempotencyKey ? store.findPaymentOrderByIdempotencyKey(uid, idempotencyKey) : null);

        if (!order || order.uid !== uid) {
          res.status(404).json({ status: 'failed', message: 'Payment order not found.' });
          return;
        }

        if (order.status === 'paid') {
          const fulfilled = await fulfillVerifiedPaymentOrder({
            orderId: order.orderId,
            paymentId: order.razorpayPaymentId || `pay_${order.orderId}`,
          });
          res.json({
            status: 'paid',
            paymentId: order.razorpayPaymentId,
            ...fulfilled,
          });
          return;
        }

        const rzpClient = options?.razorpayClient !== undefined ? options.razorpayClient : buildRazorpayClient();
        if (rzpClient) {
          const payments = await rzpClient.orders.fetchPayments(order.orderId);
          const captured = payments.items?.find((p) => p.status === 'captured' || p.status === 'authorized');
          if (captured && captured.amount === order.amountPaise) {
            const fulfilled = await fulfillVerifiedPaymentOrder({
              orderId: order.orderId,
              paymentId: captured.id,
              methodLabel: captured.method ? `Razorpay ${captured.method.toUpperCase()}` : undefined,
            });
            res.json({
              status: 'paid',
              paymentId: captured.id,
              ...fulfilled,
            });
            return;
          }
        }

        res.json({ status: 'pending' });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post('/api/webhooks/razorpay', async (req: Request, res, next) => {
    try {
      const cfg = resolveRazorpayConfig();
      const signature = String(req.headers['x-razorpay-signature'] || '');
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

      if (!cfg.webhookSecret) {
        res.status(503).json({ error: 'Razorpay webhook secret not configured.' });
        return;
      }
      if (!rawBody || !signature) {
        res.status(400).json({ error: 'Missing webhook payload or signature.' });
        return;
      }

      const expected = crypto.createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
      if (!timingSafeEqualHex(expected, signature)) {
        res.status(400).json({ error: 'Invalid webhook signature.' });
        return;
      }

      const event = req.body as {
        event?: string;
        payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string; status?: string } } };
      };
      const entity = event?.payload?.payment?.entity;
      if (
        (event?.event === 'payment.captured' || event?.event === 'order.paid') &&
        entity?.order_id &&
        entity?.id
      ) {
        const order = store.getPaymentOrder(entity.order_id);
        if (order) {
          await fulfillVerifiedPaymentOrder({
            orderId: order.orderId,
            paymentId: entity.id,
            methodLabel: entity.method ? `Razorpay ${entity.method.toUpperCase()}` : undefined,
          });
        }
      }

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  });

  // ── User Print Orders & Refunds ─────────────────────────────────────────────
  app.get('/api/orders', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    res.json({ orders: store.listOrdersForUser(req.authUser!.uid) });
  });

  app.get('/api/orders/:orderId', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    const order = store.getOrderForUser(req.params.orderId, req.authUser!.uid);
    if (!order) {
      res.status(404).json({ error: 'Print order not found.' });
      return;
    }
    res.json({ order });
  });

  app.post(
    '/api/orders/:orderId/refund',
    requireFirebaseAuth,
    async (req: AuthenticatedRequest, res) => {
      const result = await store.refundFailedOrder(req.params.orderId, req.authUser!.uid);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    }
  );

  // ── Windows Electron Kiosk Fulfillment Endpoints ────────────────────────────
  app.get('/api/kiosk/:stationId/jobs', requireKioskSecret, (req, res) => {
    const jobs = store.listQueuedOrdersForKiosk(req.params.stationId);
    res.json({ jobs });
  });

  app.post('/api/kiosk/jobs/release-by-pin', requireKioskSecret, async (req, res) => {
    const stationId = String(req.body?.stationId || '').trim();
    const releaseCode = String(req.body?.releaseCode || '').trim();
    if (!stationId || !/^\d{4}$/.test(releaseCode)) {
      res.status(400).json({ error: 'Valid stationId and 4-digit releaseCode PIN are required.' });
      return;
    }
    const order = await store.releaseOrderByPin(stationId, releaseCode);
    if (!order) {
      res.status(404).json({ error: 'No queued print job matches this station and 4-digit PIN.' });
      return;
    }
    res.json({ order });
  });

  app.get('/api/kiosk/jobs/:orderId/files/:docId', requireKioskSecret, (req, res) => {
    const match = store.getOrderForKioskFile(req.params.orderId, req.params.docId);
    if (!match || !fs.existsSync(match.doc.localPdfPath)) {
      res.status(404).json({ error: 'Print file not found or already cleaned up.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(match.doc.name.replace(/\.[^.]+$/, '.pdf'))}"`);
    fs.createReadStream(match.doc.localPdfPath).pipe(res);
  });

  app.post('/api/kiosk/jobs/:orderId/status', requireKioskSecret, async (req, res) => {
    const allowed = ['Claimed', 'Printing', 'Printed', 'Failed'] as const;
    const status = req.body?.status;
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid kiosk job status.' });
      return;
    }
    const updated = await store.updateOrderStatusFromKiosk(
      req.params.orderId,
      status,
      typeof req.body?.failureReason === 'string' ? req.body.failureReason : undefined
    );
    if (!updated) {
      res.status(404).json({ error: 'Print job order not found.' });
      return;
    }
    res.json({ order: updated });
  });

  // Error handler for API routes
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return { app, store };
}

async function startServer() {
  const { app, store } = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  // Periodic temp upload & expired session cleanup every 5 minutes
  const cleanupTimer = setInterval(() => {
    void store.cleanupExpiredResources();
  }, 5 * 60 * 1000);
  cleanupTimer.unref?.();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Print Point server running on http://0.0.0.0:${port}`);
  });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  void startServer();
}
