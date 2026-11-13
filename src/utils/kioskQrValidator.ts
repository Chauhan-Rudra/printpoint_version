/**
 * Creator4 Lab - Kiosk QR Code Validation & Session Extractor
 * Validates physical kiosk QR codes and extracts station pairing credentials.
 */

export interface KioskQrValidationResult {
  valid: boolean;
  kioskId?: string;
  kioskName?: string;
  sessionToken?: string;
  location?: string;
  error?: string;
}

const DEFAULT_STATION_LOCATION = 'Main Innovation Hub · Ground Floor';

export function validateKioskQrCode(rawContent: string): KioskQrValidationResult {
  if (!rawContent || typeof rawContent !== 'string') {
    return {
      valid: false,
      error: 'Empty or invalid QR code format.',
    };
  }

  const trimmed = rawContent.trim();

  // 1. Check if payload is a JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      const id = data.kioskId || data.stationId || data.id || data.kiosk;
      if (id) {
        const normalizedId = formatKioskName(String(id));
        return {
          valid: true,
          kioskId: normalizedId,
          kioskName: data.kioskName || normalizedId,
          sessionToken: data.token || data.sessionId || `session_${Date.now()}`,
          location: data.location || DEFAULT_STATION_LOCATION,
        };
      }
    } catch {
      // Continue to URL / pattern matching
    }
  }

  // 2. Check if payload is a Kiosk URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('creator4://')) {
    try {
      const url = new URL(trimmed);
      const hostname = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const params = url.searchParams;

      const isKioskHost =
        hostname.includes('creator4') ||
        hostname.includes('kiosk') ||
        hostname.includes('printpoint') ||
        hostname.includes('localhost') ||
        hostname.includes('run.app');

      const isKioskPath =
        path.includes('kiosk') ||
        path.includes('print') ||
        path.includes('station') ||
        path.includes('session');

      const idParam =
        params.get('kiosk') ||
        params.get('kiosk_id') ||
        params.get('id') ||
        params.get('station');

      if ((isKioskHost || isKioskPath) && (idParam || path.includes('kiosk'))) {
        const rawId = idParam || path.split('/').filter(Boolean).pop() || '04';
        const normalizedId = formatKioskName(rawId);
        return {
          valid: true,
          kioskId: normalizedId,
          kioskName: normalizedId,
          sessionToken: params.get('token') || `session_${Date.now()}`,
          location: params.get('location') || DEFAULT_STATION_LOCATION,
        };
      }
    } catch {
      // Ignore URL parse error and continue
    }
  }

  // 3. Direct Pairing Code / Identifier Format (e.g. "KIOSK-04", "C4-KIOSK-04", "Kiosk #04", "PRINTPOINT-04")
  const upper = trimmed.toUpperCase();
  const kioskMatch = upper.match(/(?:C4[-_])?(?:KIOSK|STATION|PRINTPOINT)[-_#\s]*([A-Z0-9]+)/i);

  if (kioskMatch) {
    const rawNumber = kioskMatch[1];
    const normalizedId = formatKioskName(rawNumber);
    return {
      valid: true,
      kioskId: normalizedId,
      kioskName: normalizedId,
      sessionToken: `c4_tok_${Date.now()}`,
      location: DEFAULT_STATION_LOCATION,
    };
  }

  // Fallback for simple standalone kiosk numbers or tags if formatted as kiosk
  if (/^KIOSK\s*#?\d+$/i.test(trimmed)) {
    const normalized = formatKioskName(trimmed.replace(/\D/g, ''));
    return {
      valid: true,
      kioskId: normalized,
      kioskName: normalized,
      sessionToken: `c4_tok_${Date.now()}`,
      location: DEFAULT_STATION_LOCATION,
    };
  }

  // If the QR code does not belong to a Creator4 Lab Kiosk station
  return {
    valid: false,
    error: 'This QR code is not a Creator4 Lab Kiosk station. Please scan the QR code displayed on the physical kiosk screen.',
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
