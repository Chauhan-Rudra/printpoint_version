/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  initializeApp,
  getApps,
  getApp,
  cert,
  applicationDefault,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  photoURL?: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'printingkiosk-1e1b7';
const GOOGLE_X509_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let adminAuthInitialized = false;
let adminAvailable = false;

export function getFirebaseAdminApp(): App | null {
  if (adminAuthInitialized) {
    return adminAvailable ? getApp() : null;
  }
  adminAuthInitialized = true;
  try {
    if (getApps().length > 0) {
      adminAvailable = true;
      return getApp();
    }
    const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (serviceJson) {
      const parsed = JSON.parse(serviceJson) as ServiceAccount;
      const app = initializeApp({
        credential: cert(parsed),
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
      });
      adminAvailable = true;
      return app;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const app = initializeApp({
        credential: applicationDefault(),
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
      });
      adminAvailable = true;
      return app;
    }
  } catch (err) {
    console.warn('Firebase Admin initialization skipped:', err instanceof Error ? err.message : err);
  }
  adminAvailable = false;
  return null;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;

async function fetchFirebasePublicCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAtMs) {
    return certCache.certs;
  }
  const resp = await fetch(GOOGLE_X509_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase X.509 certificates (${resp.status})`);
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  certCache = {
    certs,
    expiresAtMs: Date.now() + Math.max(60, maxAgeSec) * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

async function verifyJwtWithGoogleCerts(idToken: string): Promise<AuthenticatedUser> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid Firebase ID token algorithm or key identifier.');
  }

  const certs = await fetchFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    certCache = null;
    const refreshed = await fetchFirebasePublicCerts();
    if (!refreshed[header.kid]) {
      throw new Error('Firebase ID token signing key not recognized.');
    }
    return verifySignatureAndClaims(headerB64, payloadB64, signatureB64, refreshed[header.kid]);
  }
  return verifySignatureAndClaims(headerB64, payloadB64, signatureB64, certPem);
}

function verifySignatureAndClaims(
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  certPem: string
): AuthenticatedUser {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const sigNormalized = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  const sigPadded = sigNormalized.padEnd(
    sigNormalized.length + ((4 - (sigNormalized.length % 4)) % 4),
    '='
  );
  const validSig = verifier.verify(certPem, Buffer.from(sigPadded, 'base64'));
  if (!validSig) {
    throw new Error('Firebase ID token signature verification failed.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    user_id?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Firebase ID token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Firebase ID token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase ID token subject missing.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued-at invalid.');
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    name: payload.name || payload.email?.split('@')[0] || 'Print Point User',
    emailVerified: Boolean(payload.email_verified),
    photoURL: payload.picture,
  };
}

export type TokenVerifierFn = (token: string) => Promise<AuthenticatedUser>;
let customTokenVerifier: TokenVerifierFn | null = null;

/** Test-only override for unit/integration test suites. Never active in production. */
export function setCustomTokenVerifierForTests(fn: TokenVerifierFn | null): void {
  customTokenVerifier = fn;
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedUser> {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing Firebase ID token.');
  }
  if (customTokenVerifier) {
    return customTokenVerifier(token);
  }
  const app = getFirebaseAdminApp();
  if (app) {
    const decoded = await getAuth(app).verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      name: decoded.name || decoded.email?.split('@')[0] || 'Print Point User',
      emailVerified: Boolean(decoded.email_verified),
      photoURL: decoded.picture,
    };
  }
  return verifyJwtWithGoogleCerts(token);
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    res.status(401).json({ error: 'Authentication required. Sign in with your account first.' });
    return;
  }

  try {
    req.authUser = await verifyFirebaseIdToken(match[1].trim());
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid or expired authentication token.',
    });
  }
}

export function getExpectedKioskSecret(): string {
  return process.env.KIOSK_API_SECRET?.trim() || 'dev-kiosk-secret-change-in-prod';
}

export function requireKioskSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = String(req.headers['x-kiosk-secret'] || '');
  const expected = getExpectedKioskSecret();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized kiosk hardware credentials.' });
    return;
  }
  next();
}
