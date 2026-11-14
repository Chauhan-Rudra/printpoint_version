/**
 * Print Point - Kiosk QR Code Validation & Session Extractor
 * Validates physical kiosk QR codes strictly for station ID, active session token,
 * expiry, active status, and duplicate/used-session protection.
 */

import { isSessionTokenUsed } from './kioskSession';

export type KioskQrRejectReason =
  | 'empty'
  | 'invalid_format'
  | 'missing_token'
  | 'expired'
  | 'already_used'
  | 'inactive';

export interface KioskQrValidationResult {
  valid: boolean;
  kioskId?: string;
  kioskName?: string;
  sessionToken?: string;
  expiresAt?: number;
  location?: string;
  reason?: KioskQrRejectReason;
  error?: string;
}

const DEFAULT_STATION_LOCATION = 'Print Point Self-Service Kiosk';
const MIN_TOKEN_LENGTH = 6;

function parseExpiryTimestamp(rawExp: unknown): number | undefined {
  if (rawExp === undefined || rawExp === null || rawExp === '') return undefined;

  if (typeof rawExp === 'number' && Number.isFinite(rawExp)) {
    // Support Unix seconds vs milliseconds
    return rawExp < 1_000_000_000_000 ? rawExp * 1000 : rawExp;
  }

  const str = String(rawExp).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num < 1_000_000_000_000 ? num * 1000 : num;
  }

  const parsedMs = Date.parse(str);
  return Number.isFinite(parsedMs) ? parsedMs : undefined;
}

function isValidTokenFormat(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < MIN_TOKEN_LENGTH) return false;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed);
}

function validateSessionFields(
  kioskIdRaw: unknown,
  tokenRaw: unknown,
  options: {
    kioskName?: unknown;
    location?: unknown;
    expiresAt?: unknown;
    status?: unknown;
    active?: unknown;
    used?: unknown;
  },
  nowMs: number
): KioskQrValidationResult {
  const idStr = typeof kioskIdRaw === 'string' || typeof kioskIdRaw === 'number'
    ? String(kioskIdRaw).trim()
    : '';

  if (!idStr) {
    return {
      valid: false,
      reason: 'invalid_format',
      error: 'Unrecognized QR code. Scan the Print Point kiosk QR code.',
    };
  }

  if (!isValidTokenFormat(tokenRaw)) {
    return {
      valid: false,
      reason: 'missing_token',
      error: 'Missing or invalid kiosk session token. Refresh the QR code on the kiosk screen.',
    };
  }

  const sessionToken = tokenRaw.trim();
  const statusStr = typeof options.status === 'string' ? options.status.trim().toLowerCase() : '';

  if (
    options.used === true ||
    statusStr === 'used' ||
    statusStr === 'consumed' ||
    isSessionTokenUsed(sessionToken)
  ) {
    return {
      valid: false,
      reason: 'already_used',
      error: 'This kiosk session has already been used. Please generate a new QR on the kiosk.',
    };
  }

  if (
    options.active === false ||
    statusStr === 'inactive' ||
    statusStr === 'revoked' ||
    statusStr === 'cancelled'
  ) {
    return {
      valid: false,
      reason: 'inactive',
      error: 'This kiosk session is inactive. Please refresh the kiosk screen.',
    };
  }

  const expiresAt = parseExpiryTimestamp(options.expiresAt);
  if (statusStr === 'expired' || (expiresAt !== undefined && nowMs > expiresAt)) {
    return {
      valid: false,
      reason: 'expired',
      error: 'This kiosk QR session has expired. Refresh the QR code on the kiosk screen.',
    };
  }

  const normalizedId = formatKioskName(idStr);
  return {
    valid: true,
    kioskId: normalizedId,
    kioskName:
      typeof options.kioskName === 'string' && options.kioskName.trim()
        ? options.kioskName.trim()
        : normalizedId,
    sessionToken,
    expiresAt,
    location:
      typeof options.location === 'string' && options.location.trim()
        ? options.location.trim()
        : DEFAULT_STATION_LOCATION,
  };
}

export function validateKioskQrCode(
  rawContent: string,
  nowMs: number = Date.now()
): KioskQrValidationResult {
  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
    return {
      valid: false,
      reason: 'empty',
      error: 'Empty or unreadable QR code.',
    };
  }

  const trimmed = rawContent.trim();

  // 1. JSON Kiosk Session Payload
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const id = data.kioskId ?? data.stationId ?? data.id ?? data.kiosk;
      const token = data.sessionToken ?? data.token ?? data.sessionId ?? data.sid;

      if (id !== undefined) {
        return validateSessionFields(
          id,
          token,
          {
            kioskName: data.kioskName,
            location: data.location,
            expiresAt: data.expiresAt ?? data.exp ?? data.expiry,
            status: data.status,
            active: data.active,
            used: data.used,
          },
          nowMs
        );
      }
    } catch {
      return {
        valid: false,
        reason: 'invalid_format',
        error: 'This QR code is not a valid Print Point kiosk session.',
      };
    }
  }

  // 2. Kiosk Session URL (https://, http://, printpoint://, creator4://)
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('printpoint://') ||
    trimmed.startsWith('creator4://')
  ) {
    try {
      const url = new URL(trimmed);
      const hostname = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const params = url.searchParams;

      const isKnownKioskBrand =
        hostname.includes('printpoint') ||
        hostname.includes('creator4') ||
        hostname.includes('kiosk') ||
        url.protocol === 'printpoint:' ||
        url.protocol === 'creator4:';

      const hasExplicitKioskRoute =
        path.includes('kiosk') ||
        path.includes('session') ||
        path.includes('station') ||
        path.includes('pair');

      const idParam =
        params.get('kiosk') ||
        params.get('kiosk_id') ||
        params.get('station') ||
        params.get('id');

      const tokenParam =
        params.get('token') ||
        params.get('session') ||
        params.get('sessionId') ||
        params.get('sid');

      if ((isKnownKioskBrand || hasExplicitKioskRoute) && idParam) {
        return validateSessionFields(
          idParam,
          tokenParam,
          {
            kioskName: params.get('name'),
            location: params.get('location'),
            expiresAt: params.get('expiresAt') || params.get('exp'),
            status: params.get('status'),
            active: params.get('active') === 'false' ? false : undefined,
            used: params.get('used') === 'true' ? true : undefined,
          },
          nowMs
        );
      }
    } catch {
      // Fall through to invalid error
    }
  }

  // 3. Structured Colon/Delimited Session Token (e.g. "PRINTPOINT:KIOSK-04:sess_abc123")
  const delimitedMatch = trimmed.match(
    /^(?:PRINTPOINT|C4|KIOSK):([A-Za-z0-9_-]+):([A-Za-z0-9._-]{6,})(?::(\d{10,13}))?$/i
  );
  if (delimitedMatch) {
    return validateSessionFields(
      delimitedMatch[1],
      delimitedMatch[2],
      { expiresAt: delimitedMatch[3] },
      nowMs
    );
  }

  // Reject arbitrary strings, bare kiosk IDs without session tokens, Wi-Fi QR codes, and external URLs
  return {
    valid: false,
    reason: 'invalid_format',
    error: 'This QR code is not a valid Print Point kiosk session. Scan the QR code on the kiosk screen.',
  };
}

function formatKioskName(rawId: string): string {
  const digits = rawId.replace(/\D/g, '');
  if (digits) {
    const padded = digits.length === 1 ? `0${digits}` : digits;
    return `Kiosk #${padded}`;
  }
  const clean = rawId.replace(/^kiosk\s*#?/i, '').trim();
  return clean ? `Kiosk #${clean}` : 'Kiosk #04';
}
