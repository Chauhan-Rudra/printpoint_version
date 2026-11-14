import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CreditCard,
  DeviceMobile,
  Bank,
  Printer,
  ArrowCounterClockwise,
  FileText,
  Wallet,
  Plus,
  WarningCircle,
  ArrowLeft,
  Receipt,
  CheckCircle,
  ShieldCheck,
  Clock,
  Info,
  CaretDown,
  CaretUp,
  QrCode,
  SignIn,
} from '@phosphor-icons/react';
import {
  MultiDocPrintSummary,
  UploadedPrintDocument,
  WorkflowStep,
} from '../types/kiosk';
import { formatInrCurrency } from '../utils/kioskLogic';
import { syncWalletFromBackend, useKioskWallet } from '../utils/kioskWallet';
import { useKioskSession } from '../utils/kioskSession';
import {
  claimServerOrderRefund,
  fetchOrderStatusFromBackend,
  PrintOrderRecord,
  syncOrdersFromBackend,
} from '../utils/kioskOrders';
import { useUserProfile } from '../utils/userProfile';
import { Haptics } from '../utils/haptics';
import { AddMoneyModal } from './AddMoneyModal';
import { useTranslation } from '../utils/i18n';
import {
  PaymentPhase,
  RazorpayPaymentChannel,
  getPaymentCapabilities,
  hydratePaymentCapabilitiesFromServer,
  validateCheckoutEligibility,
  computeWalletShortfall,
  createPaymentIdempotencyKey,
  createBackendPaymentOrder,
  loadRazorpayCheckoutScript,
  openRazorpayCheckout,
  verifyBackendPaymentSignature,
  recheckBackendPaymentStatus,
  processWalletDebitAndPrintOrder,
} from '../utils/paymentService';

interface SummaryStepProps {
  step: Extract<WorkflowStep, 'summary' | 'payment'>;
  summary: MultiDocPrintSummary;
  documents?: UploadedPrintDocument[];
  estimatedTotalInr?: number;
  previewBeforePrint?: boolean;
  onEditSettings: () => void;
  onProceedToPayment: () => void;
  onStartNewSession: () => void;
  onOpenScanner?: () => void;
  onOpenAccount?: () => void;
}

const RAZORPAY_CHANNEL_LABELS: Record<RazorpayPaymentChannel, string> = {
  upi: 'Razorpay UPI',
  card: 'Razorpay Card',
  netbanking: 'Razorpay Netbanking',
};

export const SummaryStep: React.FC<SummaryStepProps> = ({
  step,
  summary,
  documents = [],
  estimatedTotalInr,
  onEditSettings,
  onProceedToPayment,
  onStartNewSession,
  onOpenScanner,
  onOpenAccount,
}) => {
  const { t } = useTranslation();
  const { balance: walletBalance } = useKioskWallet();
  const { session } = useKioskSession();
  const { profile } = useUserProfile();

  const [capRevision, setCapRevision] = useState(0);
  useEffect(() => {
    void hydratePaymentCapabilitiesFromServer().then(() => {
      setCapRevision((v) => v + 1);
    });
  }, []);
  const capabilities = useMemo(() => getPaymentCapabilities(), [capRevision]);

  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'razorpay'>('wallet');
  const [razorpayChannel, setRazorpayChannel] = useState<RazorpayPaymentChannel>('upi');
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>('idle');
  const [completedOrder, setCompletedOrder] = useState<PrintOrderRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [verifiedByBackend, setVerifiedByBackend] = useState<boolean>(false);
  const [showAddMoney, setShowAddMoney] = useState<boolean>(false);
  const [showDocBreakdown, setShowDocBreakdown] = useState<boolean>(false);
  const [isClaimingRefund, setIsClaimingRefund] = useState<boolean>(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const payLockRef = useRef<boolean>(false);

  const jobFingerprint = useMemo(
    () =>
      `${session.activeStation.id}_${summary.documentCount}_${summary.totalEstimatedSheets}_${
        typeof estimatedTotalInr === 'number' ? estimatedTotalInr : summary.totalPrice
      }`,
    [
      session.activeStation.id,
      summary.documentCount,
      summary.totalEstimatedSheets,
      estimatedTotalInr,
      summary.totalPrice,
    ]
  );

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createPaymentIdempotencyKey('job', jobFingerprint)
  );

  const totalDueAmount =
    typeof estimatedTotalInr === 'number' ? estimatedTotalInr : summary.totalPrice;
  const formattedPaymentTotal = formatInrCurrency(totalDueAmount);
  const station = session.activeStation;
  const walletShortfall = computeWalletShortfall(walletBalance, totalDueAmount);
  const walletInsufficient = walletShortfall > 0;
  const isSignedOut = !profile.authenticated;

  const eligibility = validateCheckoutEligibility({
    session,
    profile,
    isSignedOut,
    totalAmountInr: totalDueAmount,
  });

  const isProcessing =
    paymentPhase === 'creating_order' ||
    paymentPhase === 'awaiting_checkout' ||
    paymentPhase === 'pending' ||
    paymentPhase === 'rechecking';

  const backendItems = useMemo(() => {
    const readyDocs = documents
      .filter((d) => d.status === 'Ready')
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (readyDocs.length > 0) {
      return readyDocs.map((d) => ({
        docId: d.serverDocId || d.id,
        name: d.name,
        copies: d.settings.copies,
        colourMode: d.settings.colourMode,
        sides: d.settings.sides,
        removeBlankPages: d.settings.removeBlankPages,
      }));
    }
    return summary.items.map((item) => ({
      docId: item.id,
      name: item.name,
      copies: item.copies,
      colourMode: item.colourMode,
      sides: item.sides,
      removeBlankPages: true,
    }));
  }, [documents, summary.items]);

  // Poll kiosk job lifecycle while order is Queued, Claimed, or Printing
  useEffect(() => {
    if (
      paymentPhase !== 'successful' ||
      !completedOrder ||
      (completedOrder.status !== 'Queued' &&
        completedOrder.status !== 'Claimed' &&
        completedOrder.status !== 'Printing')
    ) {
      return;
    }

    const timer = window.setInterval(async () => {
      const updated = await fetchOrderStatusFromBackend(completedOrder.id);
      if (updated) {
        setCompletedOrder(updated);
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [paymentPhase, completedOrder]);

  const applyConfirmedOrderFromBackend = async (params: {
    order?: PrintOrderRecord;
    idempotencyKey: string;
    verified: boolean;
  }) => {
    let resolvedOrder = params.order;
    if (!resolvedOrder) {
      const ordersList = await syncOrdersFromBackend();
      resolvedOrder =
        ordersList?.find((o) => o.idempotencyKey === params.idempotencyKey) ||
        ordersList?.[0];
    }

    if (!resolvedOrder) {
      setPaymentPhase('unknown');
      setStatusMessage(
        'Payment confirmed, but order receipt sync is delayed. Tap Recheck Status.'
      );
      return;
    }

    Haptics.success();
    setVerifiedByBackend(params.verified);
    setCompletedOrder(resolvedOrder);
    setPaymentPhase('successful');
    setStatusMessage(null);
    void syncWalletFromBackend();
  };

  const handleConfirmPayAndPrint = async () => {
    if (payLockRef.current || isProcessing) return;
    setStatusMessage(null);

    if (!eligibility.valid) {
      Haptics.error();
      setStatusMessage(eligibility.reason || 'Session check failed before payment.');
      return;
    }

    if (!session.sessionToken) {
      Haptics.error();
      setStatusMessage(
        'A verified kiosk QR session token is required before payment. Scan the kiosk QR code.'
      );
      return;
    }

    if (backendItems.length === 0) {
      Haptics.error();
      setStatusMessage('No ready documents found in this print job.');
      return;
    }

    payLockRef.current = true;
    const attemptKey =
      paymentPhase === 'idle' || paymentPhase === 'failed' || paymentPhase === 'cancelled'
        ? createPaymentIdempotencyKey('job', jobFingerprint)
        : idempotencyKey;
    setIdempotencyKey(attemptKey);

    try {
      if (paymentMethod === 'wallet') {
        if (walletInsufficient) {
          Haptics.error();
          setStatusMessage(
            `Wallet balance (${formatInrCurrency(walletBalance)}) is short by ${formatInrCurrency(
              walletShortfall
            )}. Add money or select another configured payment method.`
          );
          return;
        }

        Haptics.selection();
        setPaymentPhase('pending');

        const walletResult = await processWalletDebitAndPrintOrder({
          idempotencyKey: attemptKey,
          stationId: station.id,
          sessionToken: session.sessionToken,
          items: backendItems,
        });

        if (walletResult.status === 'successful' && walletResult.order) {
          Haptics.success();
          setCompletedOrder(walletResult.order);
          setVerifiedByBackend(walletResult.verifiedByBackend);
          setPaymentPhase('successful');
          setStatusMessage(null);
          void syncWalletFromBackend();
        } else if (walletResult.status === 'unknown') {
          setPaymentPhase('unknown');
          setStatusMessage(walletResult.message);
        } else {
          Haptics.error();
          setPaymentPhase('failed');
          setStatusMessage(walletResult.message);
        }
        return;
      }

      // Razorpay payment path
      if (!capabilities.razorpayReady) {
        Haptics.error();
        setStatusMessage(
          `Razorpay checkout is not configured: missing ${capabilities.missingConfigItems.join(', ')}.`
        );
        return;
      }

      Haptics.selection();
      setPaymentPhase('creating_order');

      const sdkReady = await loadRazorpayCheckoutScript();
      if (!sdkReady) {
        Haptics.error();
        setPaymentPhase('failed');
        setStatusMessage('Unable to load Razorpay Checkout SDK. Check connectivity and retry.');
        return;
      }

      const order = await createBackendPaymentOrder({
        idempotencyKey: attemptKey,
        amountInr: totalDueAmount,
        purpose: 'print_job',
        preferredMethod: razorpayChannel,
        customerName: profile.name,
        customerEmail: profile.email,
        customerPhone: profile.phone,
        kioskId: station.id,
        stationId: station.id,
        sessionToken: session.sessionToken,
        items: backendItems,
        kioskName: station.name,
        description: `${summary.documentCount} doc(s) · ${summary.totalEstimatedSheets} sheets at ${station.name}`,
      });

      setActiveOrderId(order.orderId);
      setPaymentPhase('awaiting_checkout');

      openRazorpayCheckout({
        order,
        preferredMethod: razorpayChannel,
        customerName: profile.name,
        customerEmail: profile.email,
        customerPhone: profile.phone,
        description: `Print at ${station.name} (${summary.totalEstimatedSheets} sheets)`,
        onSuccess: async (rzpResponse) => {
          setPaymentPhase('pending');
          const verification = await verifyBackendPaymentSignature({
            idempotencyKey: attemptKey,
            purpose: 'print_job',
            amountInr: typeof order.amountInr === 'number' ? order.amountInr : totalDueAmount,
            response: rzpResponse,
          });

          if (verification.status === 'successful') {
            await applyConfirmedOrderFromBackend({
              order: verification.printOrder,
              idempotencyKey: `rzp_print_${order.orderId}`,
              verified: verification.verifiedByBackend,
            });
          } else if (verification.status === 'unknown') {
            setPaymentPhase('unknown');
            setStatusMessage(verification.message);
          } else {
            Haptics.error();
            setPaymentPhase('failed');
            setStatusMessage(verification.message);
          }
        },
        onFailed: (reason) => {
          Haptics.error();
          setPaymentPhase('failed');
          setStatusMessage(reason);
        },
        onCancelled: () => {
          setPaymentPhase('cancelled');
          setStatusMessage(
            'Payment was cancelled. Your print settings and documents are preserved.'
          );
        },
      });
    } catch (err) {
      Haptics.error();
      setPaymentPhase('failed');
      setStatusMessage(
        err instanceof Error ? err.message : 'Unable to start Razorpay checkout.'
      );
    } finally {
      payLockRef.current = false;
    }
  };

  const handleRecheckPaymentStatus = async () => {
    if (!activeOrderId) {
      setStatusMessage('No gateway order ID recorded for recheck. Please try again.');
      setPaymentPhase('failed');
      return;
    }

    Haptics.buttonPress();
    setPaymentPhase('rechecking');
    setStatusMessage(null);

    const check = await recheckBackendPaymentStatus({
      idempotencyKey,
      orderId: activeOrderId,
      purpose: 'print_job',
    });

    if (check.status === 'successful') {
      await applyConfirmedOrderFromBackend({
        order: check.printOrder,
        idempotencyKey: `rzp_print_${activeOrderId}`,
        verified: check.verifiedByBackend,
      });
    } else if (check.status === 'failed') {
      Haptics.error();
      setPaymentPhase('failed');
      setStatusMessage(check.message);
    } else {
      setPaymentPhase('unknown');
      setStatusMessage(check.message);
    }
  };

  const handleClaimRefund = async () => {
    if (!completedOrder || isClaimingRefund) return;
    Haptics.buttonPress();
    setRefundError(null);
    setIsClaimingRefund(true);
    try {
      const res = await claimServerOrderRefund(completedOrder.id);
      if (res.success && res.order) {
        setCompletedOrder(res.order);
        Haptics.success();
      } else {
        Haptics.error();
        setRefundError(res.error || 'Unable to process refund right now.');
      }
    } finally {
      setIsClaimingRefund(false);
    }
  };

  // Payment Screen
  if (step === 'payment') {
    if (completedOrder && paymentPhase === 'successful') {
      const isRefunded = completedOrder.status === 'Refunded';
      const isFailed = completedOrder.status === 'Failed';
      const isPrinted = completedOrder.status === 'Printed';
      const isActiveQueue =
        completedOrder.status === 'Queued' ||
        completedOrder.status === 'Claimed' ||
        completedOrder.status === 'Printing';

      const statusLabel = isRefunded
        ? 'Refunded to Wallet'
        : isFailed
        ? 'Print Failed at Kiosk'
        : isPrinted
        ? 'Printed at Kiosk'
        : completedOrder.status === 'Printing'
        ? 'Printing at Kiosk'
        : completedOrder.status === 'Claimed'
        ? 'Claimed by Kiosk'
        : verifiedByBackend
        ? 'Payment Verified · Queued for Kiosk'
        : 'Queued for Kiosk';
      return (
        <div className="flex flex-col flex-1 w-full animate-view-enter max-w-lg mx-auto pb-8">
          <div className="mt-2 p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E7E1] text-center">
            <div className="relative w-16 h-16 flex items-center justify-center mx-auto mb-3.5">
              <div className="absolute inset-0 rounded-full bg-[#194F34]/15 animate-gpay-ripple" />
              <div className="w-14 h-14 rounded-full bg-[#194F34] text-white flex items-center justify-center animate-gpay-circle">
                <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
                  <path
                    d="M6.5 14.5L11.5 19.5L21.5 9"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-gpay-check"
                  />
                </svg>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold mb-2 ${
                isFailed
                  ? 'bg-[#FFF1F2] text-[#BA1A1A] border border-[#FECDD3]'
                  : 'bg-[#EAF3ED] text-[#194F34]'
              }`}
            >
              <ShieldCheck size={13} weight="fill" aria-hidden="true" />
              <span>{statusLabel}</span>
            </div>

            <h1 className="text-[22px] font-bold text-[#191C1A] tracking-tight">
              {isRefunded
                ? 'Refund Credited'
                : isFailed
                ? 'Print Job Interrupted'
                : isPrinted
                ? 'Print Completed'
                : 'Payment Successful'}
            </h1>
            <p className="text-[13px] text-[#545D56] mt-1 mb-4">
              {isRefunded
                ? `${formatInrCurrency(completedOrder.amountInr)} has been returned to your wallet.`
                : isFailed
                ? completedOrder.failureReason ||
                  'Kiosk reported a print interruption. Claim a wallet refund below.'
                : isPrinted
                ? `Your ${completedOrder.totalSheets} ${
                    completedOrder.totalSheets === 1 ? 'sheet' : 'sheets'
                  } finished printing at ${completedOrder.kioskName}.`
                : `Enter the 4-digit PIN below on ${completedOrder.kioskName} to release your ${
                    completedOrder.totalSheets
                  } ${completedOrder.totalSheets === 1 ? 'sheet' : 'sheets'}.`}
            </p>

            {/* 4-Digit Kiosk Release PIN Card */}
            {isActiveQueue && completedOrder.releaseCode && (
              <div className="mb-4 p-4 rounded-xl bg-[#EAF3ED] border border-[#B8D6C2] flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#194F34]">
                  Kiosk Release PIN · {completedOrder.status}
                </span>
                <span
                  data-testid="kiosk-release-pin"
                  className="text-[32px] font-extrabold font-mono tracking-[0.25em] text-[#194F34] tabular-nums bg-white px-5 py-1.5 rounded-xl border border-[#B8D6C2]"
                >
                  {completedOrder.releaseCode}
                </span>
                <span className="text-[11.5px] text-[#545D56]">
                  Live kiosk status updates automatically every 3 seconds.
                </span>
              </div>
            )}

            {/* Verified Receipt */}
            <div className="rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] p-4 text-left text-[13px] flex flex-col gap-2 mb-5">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E7E1]">
                <span className="font-bold text-[#191C1A] flex items-center gap-1.5">
                  <Receipt size={15} weight="duotone" className="text-[#194F34]" />
                  Payment Receipt
                </span>
                <span className="text-xs font-bold text-[#194F34] tabular-nums">
                  #{completedOrder.orderNumber}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#545D56]">Transaction Ref</span>
                <span className="font-mono text-[12px] font-semibold text-[#191C1A] truncate max-w-[190px]">
                  {completedOrder.paymentReferenceId || completedOrder.orderNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#545D56]">Kiosk Station</span>
                <span className="font-semibold text-[#191C1A]">
                  {completedOrder.kioskName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#545D56]">Job Status</span>
                <span className="font-semibold text-[#194F34]">
                  {completedOrder.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#545D56]">Documents · Sheets</span>
                <span className="font-semibold text-[#191C1A] tabular-nums">
                  {completedOrder.documentCount}{' '}
                  {completedOrder.documentCount === 1 ? 'file' : 'files'} ·{' '}
                  {completedOrder.totalSheets}{' '}
                  {completedOrder.totalSheets === 1 ? 'sheet' : 'sheets'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#545D56]">Payment Method</span>
                <span className="font-semibold text-[#191C1A]">
                  {completedOrder.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#E2E7E1] pt-2">
                <span className="font-bold text-[#191C1A]">
                  {isRefunded ? 'Amount Refunded' : 'Amount Paid'}
                </span>
                <span className="font-bold text-[#194F34] tabular-nums">
                  {formatInrCurrency(completedOrder.amountInr)}
                </span>
              </div>
            </div>

            {refundError && (
              <div className="mb-3 p-2.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] text-[12px] font-medium text-left">
                {refundError}
              </div>
            )}

            {isFailed && (
              <button
                type="button"
                disabled={isClaimingRefund}
                onClick={() => void handleClaimRefund()}
                className="w-full min-h-[44px] mb-2.5 rounded-xl bg-[#EAF3ED] text-[#194F34] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-55 cursor-pointer"
              >
                <ArrowCounterClockwise
                  size={15}
                  weight="bold"
                  className={isClaimingRefund ? 'animate-spin' : ''}
                />
                <span>
                  {isClaimingRefund
                    ? 'Crediting Refund...'
                    : 'Claim Instant Wallet Refund'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onStartNewSession}
              className="w-full min-h-[48px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors active:scale-[0.99] cursor-pointer"
            >
              <ArrowCounterClockwise size={16} weight="bold" />
              <span>Print Another Document</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 w-full animate-view-enter max-w-lg mx-auto pb-8">
        <div className="mb-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onEditSettings}
            className="min-h-[40px] px-3.5 rounded-xl bg-white border border-[#E2E7E1] text-[12.5px] font-semibold text-[#191C1A] hover:bg-[#F8FAF6] active:scale-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
          >
            <ArrowLeft size={15} weight="bold" className="text-[#194F34]" />
            <span>Back to Settings</span>
          </button>
        </div>

        <section className="mb-4">
          <h1 className="pp-text-page-heading">Complete Your Payment</h1>
          <p className="pp-text-secondary mt-1">
            Confirm your print summary and pay securely to release at {station.name}.
          </p>
        </section>

        {/* Session / Eligibility Alert */}
        {!eligibility.valid && (
          <div
            role="alert"
            className="mb-3.5 p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] text-[12.5px] font-semibold flex flex-col gap-2.5"
          >
            <div className="flex items-start gap-2">
              <WarningCircle size={17} weight="fill" className="shrink-0 mt-0.5" />
              <span>{eligibility.reason}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isSignedOut && onOpenAccount && (
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="min-h-[36px] px-3 rounded-lg bg-[#194F34] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <SignIn size={14} weight="bold" aria-hidden="true" />
                  <span>Sign In</span>
                </button>
              )}
              {(!session.connected ||
                (typeof session.expiresAt === 'number' && session.expiresAt <= Date.now())) &&
                onOpenScanner && (
                  <button
                    type="button"
                    onClick={onOpenScanner}
                    className="min-h-[36px] px-3 rounded-lg bg-[#194F34] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <QrCode size={14} weight="bold" aria-hidden="true" />
                    <span>Scan Kiosk QR</span>
                  </button>
                )}
            </div>
          </div>
        )}

        {/* Payment Status States (Pending / Cancelled / Failed / Unknown) */}
        {isProcessing && (
          <div
            role="status"
            className="mb-3.5 p-3.5 rounded-xl bg-[#EAF3ED] border border-[#B8D6C2] text-[#194F34] text-[12.5px] flex items-center gap-2.5"
          >
            <ArrowCounterClockwise size={18} weight="bold" className="animate-spin shrink-0" />
            <div>
              <strong className="block font-bold">
                {paymentPhase === 'creating_order'
                  ? 'Creating Payment Order'
                  : paymentPhase === 'awaiting_checkout'
                  ? 'Waiting for Razorpay Checkout'
                  : paymentPhase === 'rechecking'
                  ? 'Rechecking Payment Status'
                  : 'Verifying Payment Confirmation'}
              </strong>
              <span className="text-[11.5px] text-[#194F34]/85">
                Please keep this screen open until confirmation completes.
              </span>
            </div>
          </div>
        )}

        {paymentPhase === 'unknown' && (
          <div
            role="status"
            className="mb-3.5 p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12.5px] flex flex-col gap-2.5"
          >
            <div className="flex items-start gap-2">
              <Clock size={18} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" />
              <div>
                <strong className="block font-bold">Payment Status Pending Confirmation</strong>
                <span className="text-[12px]">
                  {statusMessage ||
                    'Gateway confirmation is delayed. Your job has not been printed or double-charged.'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRecheckPaymentStatus}
              className="w-full min-h-[40px] rounded-xl bg-[#92400E] text-white font-semibold text-[12.5px] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              <span>Recheck Status</span>
            </button>
          </div>
        )}

        {statusMessage && (paymentPhase === 'failed' || paymentPhase === 'cancelled' || paymentPhase === 'idle') && (
          <div
            role="alert"
            className={`mb-3.5 p-3.5 rounded-xl border text-[12.5px] flex items-start gap-2 ${
              paymentPhase === 'cancelled'
                ? 'bg-[#F3F4F0] border-[#D5DDD7] text-[#191C1A]'
                : 'bg-[#FFF1F2] border-[#FECDD3] text-[#BA1A1A]'
            }`}
          >
            <WarningCircle size={17} weight="fill" className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <strong className="block font-bold">
                {paymentPhase === 'cancelled' ? 'Payment Cancelled' : 'Payment Not Completed'}
              </strong>
              <span className="text-[12px] font-medium block mt-0.5">{statusMessage}</span>
            </div>
          </div>
        )}

        {/* Compact Order Summary */}
        <section
          aria-label="Order summary"
          className="mb-4 p-4 rounded-2xl bg-white border border-[#E2E7E1]"
        >
          <div className="flex items-baseline justify-between pb-3 mb-3 border-b border-[#E2E7E1]">
            <div>
              <span className="text-[12px] font-semibold text-[#545D56] block">
                Final Verified Amount
              </span>
              <span className="text-[11.5px] text-[#545D56] tabular-nums">
                {station.name} · {summary.totalEstimatedSheets}{' '}
                {summary.totalEstimatedSheets === 1 ? 'sheet' : 'sheets'}
              </span>
            </div>
            <span className="text-[26px] font-bold text-[#194F34] tracking-tight tabular-nums">
              {formattedPaymentTotal}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12.5px]">
            <div>
              <span className="text-[#545D56] block text-[11px]">Documents</span>
              <span className="font-semibold text-[#191C1A] tabular-nums">
                {summary.documentCount} {summary.documentCount === 1 ? 'file' : 'files'}
              </span>
            </div>
            <div>
              <span className="text-[#545D56] block text-[11px]">Total Pages</span>
              <span className="font-semibold text-[#191C1A] tabular-nums">
                {summary.totalOriginalPages}{' '}
                {summary.totalOriginalPages === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <div>
              <span className="text-[#545D56] block text-[11px]">Print Settings</span>
              <span className="font-semibold text-[#191C1A]">
                {summary.colourModeLabel} · {summary.sidesModeLabel}
              </span>
            </div>
            <div>
              <span className="text-[#545D56] block text-[11px]">Copies</span>
              <span className="font-semibold text-[#191C1A] tabular-nums">
                {summary.copiesLabel}
              </span>
            </div>
          </div>

          {summary.items.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-[#E2E7E1]">
              <button
                type="button"
                onClick={() => setShowDocBreakdown((v) => !v)}
                className="w-full flex items-center justify-between text-[11.5px] font-semibold text-[#194F34] cursor-pointer"
              >
                <span className="truncate pr-2">
                  {summary.items.map((d) => d.name).join(', ')}
                </span>
                {showDocBreakdown ? (
                  <CaretUp size={14} weight="bold" className="shrink-0" />
                ) : (
                  <CaretDown size={14} weight="bold" className="shrink-0" />
                )}
              </button>

              {showDocBreakdown && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {summary.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-[11.5px] text-[#545D56] bg-[#F8FAF6] px-2.5 py-1.5 rounded-lg"
                    >
                      <span className="font-medium text-[#191C1A] truncate pr-2">
                        {item.name}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {item.originalPages}p · {item.copies}× ·{' '}
                        {item.colourMode === 'colour' ? 'Colour' : 'B&W'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Payment Methods */}
        <section
          aria-label="Payment methods"
          className="mb-5 p-4 rounded-2xl bg-white border border-[#E2E7E1]"
        >
          <h2 className="pp-text-card-heading mb-3">Payment Method</h2>

          <div className="flex flex-col gap-2.5">
            {/* 1. Print Point Wallet */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isProcessing) return;
                setPaymentMethod('wallet');
                setStatusMessage(null);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isProcessing) {
                  e.preventDefault();
                  setPaymentMethod('wallet');
                }
              }}
              className={`w-full p-3.5 rounded-xl border flex flex-col gap-2 text-left transition-all cursor-pointer ${
                paymentMethod === 'wallet'
                  ? 'bg-[#F4F8F5] border-2 border-[#194F34]'
                  : 'bg-white border-[#E2E7E1]'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                    <Wallet size={19} weight="duotone" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-bold text-[#191C1A]">
                        Print Point Wallet
                      </span>
                      <span className="text-[12.5px] font-bold text-[#194F34] tabular-nums">
                        {formatInrCurrency(walletBalance)}
                      </span>
                    </div>
                    <span className="text-[11.5px] text-[#545D56] block tabular-nums">
                      {walletInsufficient
                        ? `Insufficient balance · Short by ${formatInrCurrency(walletShortfall)}`
                        : `Deducts ${formattedPaymentTotal} · Remaining ${formatInrCurrency(
                            walletBalance - totalDueAmount
                          )}`}
                    </span>
                  </div>
                </div>

                {walletInsufficient ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      Haptics.buttonPress();
                      setShowAddMoney(true);
                    }}
                    className="min-h-[36px] px-3 rounded-lg bg-[#194F34] hover:bg-[#143F2A] text-white text-[11.5px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Plus size={12} weight="bold" />
                    <span>Add Money</span>
                  </button>
                ) : (
                  paymentMethod === 'wallet' && (
                    <CheckCircle size={19} weight="fill" className="text-[#194F34] shrink-0" />
                  )
                )}
              </div>

              {walletInsufficient && (
                <div className="rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-2 text-[11px] text-[#92400E] tabular-nums">
                  Your wallet has {formatInrCurrency(walletBalance)}. Add at least{' '}
                  <strong>{formatInrCurrency(walletShortfall)}</strong> to complete this payment
                  without a negative balance.
                </div>
              )}
            </div>

            {/* 2. Razorpay Online Checkout (UPI / Card / Netbanking) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isProcessing) return;
                setPaymentMethod('razorpay');
                setStatusMessage(null);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !isProcessing) {
                  e.preventDefault();
                  setPaymentMethod('razorpay');
                }
              }}
              className={`w-full p-3.5 rounded-xl border flex flex-col gap-2.5 text-left transition-all cursor-pointer ${
                paymentMethod === 'razorpay'
                  ? 'bg-[#F4F8F5] border-2 border-[#194F34]'
                  : 'bg-white border-[#E2E7E1]'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#F3F4F0] text-[#194F34] flex items-center justify-center shrink-0">
                    <DeviceMobile size={19} weight="duotone" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-bold text-[#191C1A]">
                        UPI, Card &amp; Netbanking
                      </span>
                      {!capabilities.razorpayReady && (
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
                          Not Configured
                        </span>
                      )}
                    </div>
                    <span className="text-[11.5px] text-[#545D56] block">
                      {capabilities.razorpayReady
                        ? 'Secured by Razorpay Checkout'
                        : 'Requires Razorpay key & backend verification'}
                    </span>
                  </div>
                </div>

                {paymentMethod === 'razorpay' && capabilities.razorpayReady && (
                  <CheckCircle size={19} weight="fill" className="text-[#194F34] shrink-0" />
                )}
              </div>

              {capabilities.razorpayReady ? (
                paymentMethod === 'razorpay' && (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {(
                      [
                        { id: 'upi', label: 'UPI', Icon: DeviceMobile },
                        { id: 'card', label: 'Card', Icon: CreditCard },
                        { id: 'netbanking', label: 'Netbanking', Icon: Bank },
                      ] as const
                    ).map(({ id, label, Icon }) => {
                      const active = razorpayChannel === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            Haptics.buttonPress();
                            setRazorpayChannel(id);
                          }}
                          className={`min-h-[40px] px-2 rounded-lg border text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            active
                              ? 'bg-[#194F34] text-white border-[#194F34]'
                              : 'bg-white text-[#191C1A] border-[#E2E7E1] hover:border-[#194F34]/40'
                          }`}
                        >
                          <Icon size={14} weight="bold" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="rounded-lg bg-[#F8FAF6] border border-[#E2E7E1] px-2.5 py-2 text-[11px] text-[#545D56] flex items-start gap-1.5">
                  <Info size={14} weight="fill" className="text-[#92400E] shrink-0 mt-0.5" />
                  <span>
                    Missing {capabilities.missingConfigItems.join(' & ')}. Configure backend
                    order creation and signature verification to enable Razorpay.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Primary Payment CTA */}
        <div className="flex flex-col gap-2.5 mt-auto pt-1">
          <button
            type="button"
            disabled={
              !eligibility.valid ||
              isProcessing ||
              (paymentMethod === 'wallet' && walletInsufficient) ||
              (paymentMethod === 'razorpay' && !capabilities.razorpayReady)
            }
            onClick={handleConfirmPayAndPrint}
            className="w-full min-h-[50px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] disabled:opacity-45 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer disabled:cursor-not-allowed"
          >
            <Printer size={18} weight="bold" />
            <span className="tabular-nums">
              {isProcessing
                ? 'Processing payment...'
                : paymentMethod === 'wallet'
                ? walletInsufficient
                  ? `Add ${formatInrCurrency(walletShortfall)} to Pay`
                  : `Pay ${formattedPaymentTotal} with Wallet`
                : capabilities.razorpayReady
                ? paymentPhase === 'failed' || paymentPhase === 'cancelled'
                  ? `Retry ${formattedPaymentTotal} (${razorpayChannel.toUpperCase()})`
                  : `Pay ${formattedPaymentTotal} via Razorpay`
                : 'Razorpay Checkout Not Configured'}
            </span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onEditSettings}
            className="w-full min-h-[46px] rounded-xl bg-white border border-[#E2E7E1] text-[#191C1A] font-semibold text-[14px] hover:bg-[#F3F4F0] transition-colors disabled:opacity-45 cursor-pointer"
          >
            Edit Print Settings
          </button>
        </div>

        <AddMoneyModal
          isOpen={showAddMoney}
          onClose={() => setShowAddMoney(false)}
          currentBalance={walletBalance}
          suggestedAmount={Math.max(10, Math.ceil(walletShortfall))}
        />
      </div>
    );
  }

  // Order Review Summary Screen (Intermediate Step)
  return (
    <div className="flex flex-col flex-1 w-full pb-28 max-w-lg mx-auto">
      <div className="flex flex-col flex-1 w-full animate-view-enter">
        <section className="mt-1 mb-4">
          <h1 className="pp-text-page-heading mb-0.5">{t.summaryTitle}</h1>
          <p className="pp-text-secondary leading-relaxed">
            Verify documents, settings, and total before printing at {station.name}.
          </p>
        </section>

        <section className="mb-4 p-4 rounded-2xl bg-white border border-[#E2E7E1]">
          <div className="divide-y divide-[#E2E7E1] text-[13px]">
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Station</span>
              <span className="font-bold text-[#191C1A]">{station.name}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Documents</span>
              <span
                data-testid="summary-doc-count"
                className="font-bold text-[#191C1A] tabular-nums"
              >
                {summary.documentCount} {summary.documentCount === 1 ? 'document' : 'documents'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Total pages</span>
              <span
                data-testid="summary-total-pages"
                className="font-bold text-[#191C1A] tabular-nums"
              >
                {summary.totalOriginalPages}{' '}
                {summary.totalOriginalPages === 1 ? 'page' : 'pages'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Colour mode</span>
              <span className="font-bold text-[#191C1A]">{summary.colourModeLabel}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Printing sides</span>
              <span className="font-bold text-[#191C1A]">{summary.sidesModeLabel}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-[#545D56]">Copies &amp; sheets</span>
              <span
                data-testid="summary-total-sheets"
                className="font-bold text-[#191C1A] tabular-nums"
              >
                {summary.copiesLabel} · {summary.totalEstimatedSheets}{' '}
                {summary.totalEstimatedSheets === 1 ? 'sheet' : 'sheets'}
              </span>
            </div>

            <div className="pt-2.5 pb-0.5 flex items-center justify-between">
              <span className="text-[14px] font-bold text-[#191C1A]">Total payable</span>
              <span
                data-testid="summary-total-price"
                className="text-[20px] font-bold text-[#194F34] tabular-nums"
              >
                {formattedPaymentTotal}
              </span>
            </div>
          </div>
        </section>

        <section className="mb-4 flex flex-col gap-2">
          {summary.items.map((item) => (
            <div
              key={item.id}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E2E7E1] flex items-center justify-between text-[12px]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText size={16} weight="duotone" className="text-[#194F34] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-[#191C1A] truncate block">
                    {item.name}
                  </span>
                  <span className="text-[11px] text-[#545D56] tabular-nums">
                    {item.originalPages} pgs ·{' '}
                    {item.colourMode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                    {item.sides === '2-sided' ? '2-Sided' : '1-Sided'} · {item.copies}×
                  </span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E2E7E1] px-4 pt-3 pb-6 pb-safe">
        <div className="max-w-lg mx-auto w-full flex items-center gap-2.5">
          <button
            type="button"
            onClick={onEditSettings}
            className="min-h-[48px] px-4 rounded-xl bg-white border border-[#D5DDD7] text-[#191C1A] font-semibold text-[14px] hover:bg-[#F3F4F0] transition-colors active:scale-[0.99] shrink-0 cursor-pointer"
          >
            Edit Settings
          </button>

          <button
            type="button"
            onClick={onProceedToPayment}
            className="flex-1 min-h-[48px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-bold text-[15px] flex items-center justify-center transition-all active:scale-[0.99] cursor-pointer"
          >
            Continue to Payment
          </button>
        </div>
      </div>
    </div>
  );
};
