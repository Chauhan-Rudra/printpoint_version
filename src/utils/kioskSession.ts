import { useState, useEffect } from 'react';
import { getFirebaseIdToken } from '../firebase';
import { PRICE_INR_PER_PAGE_BW, PRICE_INR_PER_PAGE_COLOUR } from './kioskLogic';

export type PrinterPaperStatus = 'Ready' | 'Busy' | 'Low Paper';

export interface KioskStation {
  id: string;
  code: string;
  name: string;
  location: string;
  distanceLabel: string;
  status: PrinterPaperStatus;
  paperTrayPercent: number;
  supportsColour: boolean;
  supportsDuplex: boolean;
  bwRateInr: number;
  colourRateInr: number;
  bwDuplexSheetRateInr?: number;
  colourDuplexSheetRateInr?: number;
}

export interface KioskSessionState {
  connected: boolean;
  activeStation: KioskStation;
  pairedAt: number;
  qrPayload?: string;
  sessionToken?: string;
  expiresAt?: number;
}

export const KIOSK_STATIONS: readonly KioskStation[] = [
  {
    id: 'kiosk-04',
    code: 'KIOSK-04',
    name: 'Kiosk #04',
    location: 'Main Library Lobby, Ground Floor',
    distanceLabel: 'Main Library Lobby',
    status: 'Ready',
    paperTrayPercent: 92,
    supportsColour: true,
    supportsDuplex: true,
    bwRateInr: PRICE_INR_PER_PAGE_BW,
    colourRateInr: PRICE_INR_PER_PAGE_COLOUR,
    bwDuplexSheetRateInr: 1.5,
    colourDuplexSheetRateInr: 5,
  },
  {
    id: 'kiosk-07',
    code: 'KIOSK-07',
    name: 'Kiosk #07',
    location: 'Engineering Block B, Atrium',
    distanceLabel: 'Engineering Block B',
    status: 'Ready',
    paperTrayPercent: 84,
    supportsColour: true,
    supportsDuplex: true,
    bwRateInr: PRICE_INR_PER_PAGE_BW,
    colourRateInr: PRICE_INR_PER_PAGE_COLOUR,
    bwDuplexSheetRateInr: 1.5,
    colourDuplexSheetRateInr: 5,
  },
  {
    id: 'kiosk-12',
    code: 'KIOSK-12',
    name: 'Kiosk #12',
    location: 'Student Center West Entrance',
    distanceLabel: 'Student Center',
    status: 'Low Paper',
    paperTrayPercent: 28,
    supportsColour: true,
    supportsDuplex: true,
    bwRateInr: PRICE_INR_PER_PAGE_BW,
    colourRateInr: PRICE_INR_PER_PAGE_COLOUR,
    bwDuplexSheetRateInr: 1.5,
    colourDuplexSheetRateInr: 5,
  },
] as const;

const SESSION_STORAGE_KEY = 'printpoint_kiosk_session_v2';
const USED_TOKENS_STORAGE_KEY = 'printpoint_used_qr_tokens_v1';

let memoryUsedTokens: string[] = [];

export function isSessionTokenUsed(token: string): boolean {
  const clean = token.trim();
  if (!clean) return false;
  if (typeof localStorage === 'undefined') {
    return memoryUsedTokens.includes(clean);
  }
  try {
    const raw = localStorage.getItem(USED_TOKENS_STORAGE_KEY);
    if (!raw) return memoryUsedTokens.includes(clean);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.includes(clean) : false;
  } catch {
    return memoryUsedTokens.includes(clean);
  }
}

export function markSessionTokenUsed(token: string): void {
  const clean = token.trim();
  if (!clean) return;
  if (!memoryUsedTokens.includes(clean)) {
    memoryUsedTokens = [clean, ...memoryUsedTokens].slice(0, 50);
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(USED_TOKENS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      if (!list.includes(clean)) {
        const next = [clean, ...list].slice(0, 50);
        localStorage.setItem(USED_TOKENS_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // Ignore storage errors
    }
  }
}

// Start disconnected until user scans a real kiosk QR session
let memorySession: KioskSessionState = {
  connected: false,
  activeStation: KIOSK_STATIONS[0],
  pairedAt: 0,
};

export function resolveStationFromInput(rawInput: string): KioskStation {
  const cleaned = rawInput.trim().toUpperCase();
  const matched = KIOSK_STATIONS.find(
    (station) =>
      cleaned.includes(station.code) ||
      cleaned.includes(station.name.toUpperCase()) ||
      cleaned.includes(station.id.toUpperCase())
  );
  if (matched) return matched;

  const numMatch = cleaned.match(/(\d{1,3})/);
  if (numMatch) {
    const padded = numMatch[1].padStart(2, '0');
    return {
      id: `kiosk-${padded}`,
      code: `KIOSK-${padded}`,
      name: `Kiosk #${padded}`,
      location: `Self-Service Print Station #${padded}`,
      distanceLabel: 'Paired via QR',
      status: 'Ready',
      paperTrayPercent: 88,
      supportsColour: true,
      supportsDuplex: true,
      bwRateInr: PRICE_INR_PER_PAGE_BW,
      colourRateInr: PRICE_INR_PER_PAGE_COLOUR,
      bwDuplexSheetRateInr: 1.5,
      colourDuplexSheetRateInr: 5,
    };
  }

  return KIOSK_STATIONS[0];
}

export function getKioskSession(): KioskSessionState {
  if (typeof localStorage === 'undefined') {
    return memorySession;
  }
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return memorySession;
    const parsed = JSON.parse(raw) as KioskSessionState;
    if (!parsed?.activeStation?.name) return memorySession;
    if (parsed.connected && parsed.expiresAt && Date.now() > parsed.expiresAt) {
      return { ...parsed, connected: false };
    }
    return parsed;
  } catch {
    return memorySession;
  }
}

export function pairKioskStation(
  stationOrName: string | KioskStation,
  qrPayload?: string,
  sessionToken?: string,
  expiresAt?: number
): KioskSessionState {
  const station =
    typeof stationOrName === 'string'
      ? resolveStationFromInput(stationOrName)
      : stationOrName;

  const next: KioskSessionState = {
    connected: true,
    activeStation: station,
    pairedAt: Date.now(),
    qrPayload,
    sessionToken,
    expiresAt,
  };

  memorySession = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('printpoint:session-updated'));
    } catch {
      // Ignore storage errors
    }
  }
  return next;
}

export async function validateAndPairQrWithBackend(qrPayload: string): Promise<{
  ok: boolean;
  session?: KioskSessionState;
  error?: string;
}> {
  const token = await getFirebaseIdToken();
  if (!token) {
    return {
      ok: false,
      error: 'Please sign in on the Account tab before pairing with a kiosk.',
    };
  }
  try {
    const res = await fetch('/api/kiosk/sessions/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ qrPayload }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      valid?: boolean;
      error?: string;
      station?: {
        id: string;
        name: string;
        location: string;
        bwRateInr: number;
        colourRateInr: number;
        bwDuplexSheetInr: number;
        colourDuplexSheetInr: number;
        supportsColour: boolean;
        supportsDuplex: boolean;
      };
      session?: {
        token: string;
        expiresAt: number;
      };
    };

    if (!res.ok || !data.valid || !data.station || !data.session) {
      return {
        ok: false,
        error: data.error || 'Could not validate this kiosk QR code.',
      };
    }

    const station: KioskStation = {
      id: data.station.id,
      code: data.station.id.toUpperCase(),
      name: data.station.name,
      location: data.station.location,
      distanceLabel: 'Paired via QR',
      status: 'Ready',
      paperTrayPercent: 92,
      supportsColour: data.station.supportsColour,
      supportsDuplex: data.station.supportsDuplex,
      bwRateInr: data.station.bwRateInr,
      colourRateInr: data.station.colourRateInr,
      bwDuplexSheetRateInr: data.station.bwDuplexSheetInr,
      colourDuplexSheetRateInr: data.station.colourDuplexSheetInr,
    };

    const paired = pairKioskStation(
      station,
      qrPayload,
      data.session.token,
      data.session.expiresAt
    );
    return { ok: true, session: paired };
  } catch {
    return {
      ok: false,
      error: 'Network error while verifying kiosk QR session.',
    };
  }
}

export function disconnectKioskSession(): KioskSessionState {
  const current = getKioskSession();
  const next: KioskSessionState = {
    ...current,
    connected: false,
    sessionToken: undefined,
    expiresAt: undefined,
  };
  memorySession = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('printpoint:session-updated'));
    } catch {
      // Ignore storage errors
    }
  }
  return next;
}

export function useKioskSession() {
  const [session, setSession] = useState<KioskSessionState>(getKioskSession);

  useEffect(() => {
    const refresh = () => setSession(getKioskSession());
    window.addEventListener('printpoint:session-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('printpoint:session-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    session,
    stations: KIOSK_STATIONS,
    pairStation: pairKioskStation,
    disconnect: disconnectKioskSession,
  };
}
