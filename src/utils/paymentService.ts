import { getFirebaseIdToken } from '../firebase';
import { KioskSessionState } from './kioskSession';
import { UserProfile } from './userProfile';
import {
  addKioskWalletFunds,
  setAuthoritativeWalletState,
  KioskWalletTransaction,
} from './kioskWallet';
import { PrintOrderRecord, upsertOrderRecord } from './kioskOrders';

export type PaymentPhase =
  | 'idle'
  | 'creating_order'
  | 'awaiting_checkout'
  | 'pending'
  | 'rechecking'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export type RazorpayPaymentChannel = 'upi' | 'card' | 'netbanking';

export interface PaymentEnvConfig {
  VITE_RAZORPAY_KEY_ID?: string;
  VITE_PAYMENT_API_BASE_URL?: string;
  VITE_RAZORPAY_CREATE_ORDER_URL?: string;
  VITE_RAZORPAY_VERIFY_URL?: string;
  VITE_PAYMENT_STATUS_URL?: string;
  VITE_WALLET_API_URL?: string;
}

export interface PaymentCapabilities {
  razorpayKeyId: string;
  razorpayKeyConfigured: boolean;
  createOrderUrl: string;
  verifyUrl: string;
  statusUrl: string;
  walletApiUrl: string;
  backendOrderConfigured: boolean;
  backendVerificationConfigured: boolean;
  backendStatusRecheckConfigured: boolean;
  backendWalletConfigured: boolean;
  razorpayReady: boolean;
  topupSupported: boolean;
  missingConfigItems: string[];
}

export interface CheckoutEligibilityResult {
  valid: boolean;
  reason?: string;
}

export interface BackendOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  amountInr?: number;
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
  };
}

export interface PaymentVerificationResult {
  status: 'successful' | 'failed' | 'unknown';
  referenceId?: string;
  orderId?: string;
  verifiedByBackend: boolean;
  message: string;
  printOrder?: PrintOrderRecord;
  newBalanceInr?: number;
}

interface FetchOptions {
  env?: PaymentEnvConfig;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

export const MIN_WALLET_TOPUP_INR = 10;
export const MAX_WALLET_TOPUP_INR = 5000;

let serverHydratedCapabilities: {
  razorpayReady: boolean;
  keyId?: string;
  missingConfigItems: string[];
} | null = null;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (resp: RazorpayFailureResponse) => void) => void;
    };
  }
}

function readRuntimeEnv(override?: PaymentEnvConfig): PaymentEnvConfig {
  if (override) return override;
  try {
    const metaEnv = (import.meta as unknown as { env?: PaymentEnvConfig }).env;
    if (metaEnv) return metaEnv;
  } catch {
    // Running outside Vite (e.g. Node unit tests)
  }
  return {};
}

function normalizeUrl(raw?: string): string {
  const val = (raw || '').trim();
  if (!val || val.startsWith('MY_')) return '';
  return val.replace(/\/+$/, '');
}

export async function hydratePaymentCapabilitiesFromServer(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/payments/capabilities', { method: 'GET' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      razorpayReady?: boolean;
      keyId?: string;
      missingConfigItems?: string[];
    };
    serverHydratedCapabilities = {
      razorpayReady: Boolean(data.razorpayReady),
      keyId: data.keyId,
      missingConfigItems: Array.isArray(data.missingConfigItems)
        ? data.missingConfigItems
        : [],
    };
  } catch {
    // ignore
  }
}

export function getPaymentCapabilities(envOverride?: PaymentEnvConfig): PaymentCapabilities {
  const env = readRuntimeEnv(envOverride);
  const inBrowserWithoutOverride =
    envOverride === undefined && typeof window !== 'undefined';

  const keyId = (
    env.VITE_RAZORPAY_KEY_ID ||
    (inBrowserWithoutOverride ? serverHydratedCapabilities?.keyId : '') ||
    ''
  ).trim();
  const baseUrl = normalizeUrl(
    env.VITE_PAYMENT_API_BASE_URL || (inBrowserWithoutOverride ? '/api' : '')
  );

  const createOrderUrl =
    normalizeUrl(env.VITE_RAZORPAY_CREATE_ORDER_URL) ||
    (baseUrl ? `${baseUrl}/payments/create-order` : '');
  const verifyUrl =
    normalizeUrl(env.VITE_RAZORPAY_VERIFY_URL) ||
    (baseUrl ? `${baseUrl}/payments/verify` : '');
  const statusUrl =
    normalizeUrl(env.VITE_PAYMENT_STATUS_URL) ||
    (baseUrl ? `${baseUrl}/payments/status` : '');
  const walletApiUrl =
    normalizeUrl(env.VITE_WALLET_API_URL) || (baseUrl ? `${baseUrl}/wallet` : '');

  const razorpayKeyConfigured = Boolean(keyId && !keyId.startsWith('MY_'));
  const backendOrderConfigured = Boolean(createOrderUrl);
  const backendVerificationConfigured = Boolean(verifyUrl);
  const backendStatusRecheckConfigured = Boolean(statusUrl);
  const backendWalletConfigured = Boolean(walletApiUrl);

  const serverReadyOverride =
    inBrowserWithoutOverride && serverHydratedCapabilities
      ? serverHydratedCapabilities.razorpayReady
      : true;

  const razorpayReady =
    razorpayKeyConfigured &&
    backendOrderConfigured &&
    backendVerificationConfigured &&
    serverReadyOverride;

  const missingConfigItems: string[] = [];
  if (!razorpayKeyConfigured) {
    missingConfigItems.push('RAZORPAY_KEY_ID / VITE_RAZORPAY_KEY_ID');
  }
  if (inBrowserWithoutOverride && serverHydratedCapabilities?.missingConfigItems?.length) {
    for (const item of serverHydratedCapabilities.missingConfigItems) {
      if (!missingConfigItems.includes(item)) missingConfigItems.push(item);
    }
  }
  if (!backendOrderConfigured) {
    missingConfigItems.push('Backend order creation endpoint');
  }
  if (!backendVerificationConfigured) {
    missingConfigItems.push('Backend signature verification endpoint');
  }

  return {
    razorpayKeyId: razorpayKeyConfigured ? keyId : '',
    razorpayKeyConfigured,
    createOrderUrl,
    verifyUrl,
    statusUrl,
    walletApiUrl,
    backendOrderConfigured,
    backendVerificationConfigured,
    backendStatusRecheckConfigured,
    backendWalletConfigured,
    razorpayReady,
    topupSupported: razorpayReady,
    missingConfigItems,
  };
}

export function createPaymentIdempotencyKey(prefix: 'job' | 'topup', seed?: string): string {
  const cleanSeed = (seed || 'session').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'session';
  const rand = Math.random().toString(36).slice(2, 8);
  return `pp_${prefix}_${cleanSeed}_${Date.now()}_${rand}`;
}

export function computeWalletShortfall(walletBalance: number, totalDueInr: number): number {
  const safeBalance = Number.isFinite(walletBalance) && walletBalance >= 0 ? walletBalance : 0;
  const safeTotal = Number.isFinite(totalDueInr) && totalDueInr >= 0 ? totalDueInr : 0;
  const diff = safeTotal - safeBalance;
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
}

export function validateTopupAmount(amount: number): { valid: boolean; reason?: string } {
  if (!Number.isFinite(amount) || amount < MIN_WALLET_TOPUP_INR) {
    return {
      valid: false,
      reason: `Minimum top-up amount is ₹${MIN_WALLET_TOPUP_INR}.`,
    };
  }
  if (amount > MAX_WALLET_TOPUP_INR) {
    return {
      valid: false,
      reason: `Maximum single top-up limit is ₹${MAX_WALLET_TOPUP_INR.toLocaleString('en-IN')}.`,
    };
  }
  return { valid: true };
}

export function validateCheckoutEligibility(params: {
  session: KioskSessionState;
  profile: UserProfile;
  isSignedOut?: boolean;
  totalAmountInr: number;
  now?: number;
}): CheckoutEligibilityResult {
  const { session, profile, isSignedOut, totalAmountInr, now = Date.now() } = params;

  if (isSignedOut) {
    return {
      valid: false,
      reason: 'Please sign in to your Print Point account before completing payment.',
    };
  }

  if (!profile.name?.trim() || !profile.email?.includes('@')) {
    return {
      valid: false,
      reason: 'A valid user name and email address are required before payment.',
    };
  }

  if (!session.connected || !session.activeStation?.id) {
    return {
      valid: false,
      reason: 'No kiosk is connected. Scan or select a kiosk before paying.',
    };
  }

  if (session.expiresAt && session.expiresAt <= now) {
    return {
      valid: false,
      reason: `Your pairing session with ${session.activeStation.name} has expired. Reconnect before paying.`,
    };
  }

  if (!Number.isFinite(totalAmountInr) || totalAmountInr <= 0) {
    return {
      valid: false,
      reason: 'Verified printable amount must be greater than ₹0.00.',
    };
  }

  return { valid: true };
}

export async function loadRazorpayCheckoutScript(timeoutMs = 10000): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (typeof window.Razorpay === 'function') {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    const timer = window.setTimeout(() => resolve(false), timeoutMs);

    const handleLoad = () => {
      window.clearTimeout(timer);
      resolve(typeof window.Razorpay === 'function');
    };
    const handleError = () => {
      window.clearTimeout(timer);
      resolve(false);
    };

    if (existing) {
      existing.addEventListener('load', handleLoad, { once: true });
      existing.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = handleLoad;
    script.onerror = handleError;
    document.head.appendChild(script);
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  timeoutMs = 12000
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchFn(url, {
      ...init,
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildAuthHeaders(extra: Record<string, string>): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function createBackendPaymentOrder(
  params: {
    idempotencyKey: string;
    amountInr: number;
    purpose: 'print_job' | 'wallet_topup';
    preferredMethod: RazorpayPaymentChannel;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    kioskId?: string;
    kioskName?: string;
    stationId?: string;
    sessionToken?: string;
    items?: Array<{
      docId: string;
      name: string;
      copies: number;
      colourMode: 'bw' | 'colour';
      sides: '1-sided' | '2-sided';
      removeBlankPages: boolean;
    }>;
    description: string;
  },
  opts?: FetchOptions
): Promise<BackendOrderResponse> {
  const caps = getPaymentCapabilities(opts?.env);
  if (!caps.razorpayReady) {
    throw new Error(
      `Razorpay checkout is not configured. Missing: ${caps.missingConfigItems.join(', ')}.`
    );
  }

  const fetchImpl = opts?.fetchFn || fetch;
  const amountPaise = Math.round(Number(params.amountInr.toFixed(2)) * 100);
  const headers = await buildAuthHeaders({
    'Content-Type': 'application/json',
    'X-Idempotency-Key': params.idempotencyKey,
  });

  const res = await fetchWithTimeout(
    caps.createOrderUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: params.idempotencyKey,
        amountInr: Number(params.amountInr.toFixed(2)),
        amountPaise,
        currency: 'INR',
        purpose: params.purpose,
        preferredMethod: params.preferredMethod,
        kioskId: params.kioskId,
        stationId: params.stationId || params.kioskId,
        sessionToken: params.sessionToken,
        items: params.items,
        kioskName: params.kioskName,
        customer: {
          name: params.customerName,
          email: params.customerEmail,
          contact: params.customerPhone,
        },
        description: params.description,
      }),
    },
    fetchImpl,
    opts?.timeoutMs
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      errText || `Backend refused to create payment order (HTTP ${res.status}).`
    );
  }

  const data = (await res.json()) as Partial<BackendOrderResponse>;
  if (!data?.orderId) {
    throw new Error('Backend did not return a valid Razorpay orderId.');
  }

  return {
    orderId: data.orderId,
    amountPaise: typeof data.amountPaise === 'number' ? data.amountPaise : amountPaise,
    currency: 'INR',
    keyId: data.keyId || caps.razorpayKeyId,
    amountInr: data.amountInr,
  };
}

export async function verifyBackendPaymentSignature(
  params: {
    idempotencyKey: string;
    purpose: 'print_job' | 'wallet_topup';
    amountInr: number;
    response: RazorpaySuccessResponse;
  },
  opts?: FetchOptions
): Promise<PaymentVerificationResult> {
  const caps = getPaymentCapabilities(opts?.env);
  if (!caps.backendVerificationConfigured) {
    return {
      status: 'failed',
      verifiedByBackend: false,
      message: 'Backend payment signature verification endpoint is not configured.',
    };
  }

  const fetchImpl = opts?.fetchFn || fetch;
  try {
    const headers = await buildAuthHeaders({
      'Content-Type': 'application/json',
      'X-Idempotency-Key': params.idempotencyKey,
    });
    const res = await fetchWithTimeout(
      caps.verifyUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: params.idempotencyKey,
          purpose: params.purpose,
          amountInr: Number(params.amountInr.toFixed(2)),
          razorpay_payment_id: params.response.razorpay_payment_id,
          razorpay_order_id: params.response.razorpay_order_id,
          razorpay_signature: params.response.razorpay_signature,
        }),
      },
      fetchImpl,
      opts?.timeoutMs
    );

    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      return {
        status: 'unknown',
        orderId: params.response.razorpay_order_id,
        referenceId: params.response.razorpay_payment_id,
        verifiedByBackend: false,
        message: 'Verification response delayed. Recheck payment status before retrying.',
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      verified?: boolean;
      status?: string;
      referenceId?: string;
      message?: string;
      printOrder?: PrintOrderRecord;
      newBalanceInr?: number;
    };

    if (!res.ok) {
      return {
        status: 'failed',
        orderId: params.response.razorpay_order_id,
        verifiedByBackend: false,
        message: data.message || `Payment signature verification failed (HTTP ${res.status}).`,
      };
    }

    if (data.status === 'pending' || data.status === 'delayed') {
      return {
        status: 'unknown',
        orderId: params.response.razorpay_order_id,
        referenceId: data.referenceId || params.response.razorpay_payment_id,
        verifiedByBackend: false,
        message: data.message || 'Payment is still awaiting confirmation from the gateway.',
      };
    }

    if (data.verified === true || data.status === 'paid' || data.status === 'captured') {
      if (data.printOrder) {
        upsertOrderRecord(data.printOrder);
      }
      return {
        status: 'successful',
        orderId: params.response.razorpay_order_id,
        referenceId: data.referenceId || params.response.razorpay_payment_id,
        verifiedByBackend: true,
        message: data.message || 'Payment signature verified by backend.',
        printOrder: data.printOrder,
        newBalanceInr: data.newBalanceInr,
      };
    }

    return {
      status: 'failed',
      orderId: params.response.razorpay_order_id,
      verifiedByBackend: false,
      message: data.message || 'Backend did not confirm payment signature.',
    };
  } catch {
    return {
      status: 'unknown',
      orderId: params.response.razorpay_order_id,
      referenceId: params.response.razorpay_payment_id,
      verifiedByBackend: false,
      message: 'Network timeout while confirming payment signature. Please recheck status.',
    };
  }
}

export async function recheckBackendPaymentStatus(
  params: {
    idempotencyKey: string;
    orderId: string;
    purpose: 'print_job' | 'wallet_topup';
  },
  opts?: FetchOptions
): Promise<PaymentVerificationResult> {
  const caps = getPaymentCapabilities(opts?.env);
  const endpoint = caps.statusUrl || caps.verifyUrl;
  if (!endpoint) {
    return {
      status: 'unknown',
      orderId: params.orderId,
      verifiedByBackend: false,
      message: 'Payment status recheck endpoint is not configured.',
    };
  }

  const fetchImpl = opts?.fetchFn || fetch;
  try {
    const query = new URLSearchParams({
      orderId: params.orderId,
      idempotencyKey: params.idempotencyKey,
      purpose: params.purpose,
    }).toString();
    const headers = await buildAuthHeaders({
      'X-Idempotency-Key': params.idempotencyKey,
    });
    const res = await fetchWithTimeout(
      `${endpoint}?${query}`,
      {
        method: 'GET',
        headers,
      },
      fetchImpl,
      opts?.timeoutMs
    );

    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      verified?: boolean;
      referenceId?: string;
      paymentId?: string;
      message?: string;
      printOrder?: PrintOrderRecord;
      newBalanceInr?: number;
    };

    if (res.ok && (data.verified === true || data.status === 'paid' || data.status === 'captured')) {
      if (data.printOrder) {
        upsertOrderRecord(data.printOrder);
      }
      return {
        status: 'successful',
        orderId: params.orderId,
        referenceId: data.referenceId || data.paymentId || params.orderId,
        verifiedByBackend: true,
        message: data.message || 'Payment confirmed.',
        printOrder: data.printOrder,
        newBalanceInr: data.newBalanceInr,
      };
    }

    if (res.ok && (data.status === 'failed' || data.status === 'cancelled')) {
      return {
        status: 'failed',
        orderId: params.orderId,
        verifiedByBackend: false,
        message: data.message || 'Payment did not succeed. You may safely retry.',
      };
    }

    return {
      status: 'unknown',
      orderId: params.orderId,
      referenceId: data.referenceId || data.paymentId,
      verifiedByBackend: false,
      message: data.message || 'Confirmation is still pending from the payment provider.',
    };
  } catch {
    return {
      status: 'unknown',
      orderId: params.orderId,
      verifiedByBackend: false,
      message: 'Unable to reach verification server. Please retry status check.',
    };
  }
}

export function openRazorpayCheckout(params: {
  order: BackendOrderResponse;
  preferredMethod: RazorpayPaymentChannel;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description: string;
  onSuccess: (response: RazorpaySuccessResponse) => void;
  onFailed: (reason: string) => void;
  onCancelled: () => void;
}): void {
  if (typeof window === 'undefined' || typeof window.Razorpay !== 'function') {
    params.onFailed('Razorpay Checkout SDK could not be initialized.');
    return;
  }

  let terminalHandled = false;

  const rzp = new window.Razorpay({
    key: params.order.keyId,
    amount: params.order.amountPaise,
    currency: params.order.currency,
    name: 'Print Point',
    description: params.description,
    order_id: params.order.orderId,
    prefill: {
      name: params.customerName,
      email: params.customerEmail,
      contact: params.customerPhone || '',
    },
    method: {
      upi: params.preferredMethod === 'upi',
      card: params.preferredMethod === 'card',
      netbanking: params.preferredMethod === 'netbanking',
      wallet: false,
    },
    theme: {
      color: '#194F34',
    },
    handler: (response: RazorpaySuccessResponse) => {
      if (terminalHandled) return;
      terminalHandled = true;
      params.onSuccess(response);
    },
    modal: {
      ondismiss: () => {
        if (terminalHandled) return;
        terminalHandled = true;
        params.onCancelled();
      },
    },
  });

  rzp.on('payment.failed', (failureResp: RazorpayFailureResponse) => {
    if (terminalHandled) return;
    terminalHandled = true;
    const msg =
      failureResp?.error?.description ||
      failureResp?.error?.reason ||
      'Payment could not be completed.';
    params.onFailed(msg);
  });

  rzp.open();
}

export async function processWalletDebitAndPrintOrder(params: {
  idempotencyKey: string;
  stationId: string;
  sessionToken: string;
  items: Array<{
    docId: string;
    name: string;
    copies: number;
    colourMode: 'bw' | 'colour';
    sides: '1-sided' | '2-sided';
    removeBlankPages: boolean;
  }>;
}): Promise<{
  status: 'successful' | 'failed' | 'unknown';
  order?: PrintOrderRecord;
  newBalance: number;
  verifiedByBackend: boolean;
  message: string;
}> {
  const token = await getFirebaseIdToken();
  if (!token) {
    return {
      status: 'failed',
      newBalance: 0,
      verifiedByBackend: false,
      message: 'Please sign in before paying with Print Point Wallet.',
    };
  }

  try {
    const res = await fetch('/api/wallet/debit-and-print', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': params.idempotencyKey,
      },
      body: JSON.stringify(params),
    });

    if (res.status >= 500 || res.status === 408) {
      return {
        status: 'unknown',
        newBalance: 0,
        verifiedByBackend: false,
        message: 'Wallet server confirmation delayed. Recheck order history before retrying.',
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      order?: PrintOrderRecord;
      newBalanceInr?: number;
      balanceInr?: number;
      error?: string;
    };

    if (!res.ok || !data.success || !data.order) {
      return {
        status: 'failed',
        newBalance: data.balanceInr ?? 0,
        verifiedByBackend: false,
        message: data.error || 'Wallet payment declined by server.',
      };
    }

    upsertOrderRecord(data.order);
    const bal = typeof data.newBalanceInr === 'number' ? data.newBalanceInr : 0;
    setAuthoritativeWalletState({ balanceInr: bal });

    return {
      status: 'successful',
      order: data.order,
      newBalance: bal,
      verifiedByBackend: true,
      message: 'Wallet payment verified and print job queued for kiosk.',
    };
  } catch {
    return {
      status: 'unknown',
      newBalance: 0,
      verifiedByBackend: false,
      message: 'Network timeout while confirming wallet payment.',
    };
  }
}

export function creditVerifiedWalletTopup(params: {
  amountInr: number;
  methodLabel: string;
  idempotencyKey: string;
  referenceId: string;
}): {
  success: boolean;
  newBalance: number;
  duplicate?: boolean;
  transaction?: KioskWalletTransaction;
} {
  return addKioskWalletFunds(params.amountInr, params.methodLabel, {
    idempotencyKey: params.idempotencyKey,
    referenceId: params.referenceId,
    status: 'completed',
    description: `Top-up via ${params.methodLabel}`,
  });
}
