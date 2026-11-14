import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CreditCard,
  DeviceMobile,
  Bank,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  WarningCircle,
  ArrowCounterClockwise,
  Clock,
  Info,
} from '@phosphor-icons/react';
import { Haptics } from '../utils/haptics';
import { pushAppNotification } from '../utils/kioskOrders';
import { syncWalletFromBackend } from '../utils/kioskWallet';
import { useUserProfile } from '../utils/userProfile';
import {
  PaymentPhase,
  RazorpayPaymentChannel,
  MIN_WALLET_TOPUP_INR,
  MAX_WALLET_TOPUP_INR,
  getPaymentCapabilities,
  hydratePaymentCapabilitiesFromServer,
  validateTopupAmount,
  createPaymentIdempotencyKey,
  createBackendPaymentOrder,
  loadRazorpayCheckoutScript,
  openRazorpayCheckout,
  verifyBackendPaymentSignature,
  recheckBackendPaymentStatus,
} from '../utils/paymentService';

interface AddMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  suggestedAmount?: number;
}

const PRESET_AMOUNTS = [50, 100, 200, 500];

const CHANNEL_LABEL: Record<RazorpayPaymentChannel, string> = {
  upi: 'Razorpay UPI',
  card: 'Razorpay Card',
  netbanking: 'Razorpay Netbanking',
};

export const AddMoneyModal: React.FC<AddMoneyModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  suggestedAmount,
}) => {
  const { profile } = useUserProfile();
  const capabilities = getPaymentCapabilities();

  const initialPreset =
    suggestedAmount && suggestedAmount >= MIN_WALLET_TOPUP_INR
      ? Math.min(MAX_WALLET_TOPUP_INR, Math.ceil(suggestedAmount))
      : 100;

  const [selectedAmount, setSelectedAmount] = useState<number>(initialPreset);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [channel, setChannel] = useState<RazorpayPaymentChannel>('upi');
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createPaymentIdempotencyKey('topup', profile.email)
  );
  const [successResult, setSuccessResult] = useState<{
    amount: number;
    newBalance: number;
    referenceId: string;
    methodLabel: string;
  } | null>(null);
  const [, setCapsRevision] = useState(0);
  const lockedOrderAmountRef = useRef<number | null>(null);
  const submitLockRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedAmount(
        suggestedAmount && suggestedAmount >= MIN_WALLET_TOPUP_INR
          ? Math.min(MAX_WALLET_TOPUP_INR, Math.ceil(suggestedAmount))
          : 100
      );
      setIdempotencyKey(createPaymentIdempotencyKey('topup', profile.email || 'user'));
      lockedOrderAmountRef.current = null;
      void hydratePaymentCapabilitiesFromServer().then(() => setCapsRevision((r) => r + 1));
    }
  }, [isOpen, suggestedAmount, profile.email]);

  if (!isOpen) return null;

  const isAuthenticated = Boolean(profile.authenticated);
  const parsedCustom = customAmount.trim() ? Number(customAmount) : null;
  const effectiveAmount = parsedCustom !== null ? parsedCustom : selectedAmount;
  const amountCheck = validateTopupAmount(effectiveAmount);
  const isBusy =
    phase === 'creating_order' ||
    phase === 'awaiting_checkout' ||
    phase === 'pending' ||
    phase === 'rechecking';

  const handleSelectPreset = (amt: number) => {
    if (isBusy) return;
    Haptics.buttonPress();
    setStatusMessage(null);
    if (phase === 'failed' || phase === 'cancelled') setPhase('idle');
    setSelectedAmount(amt);
    setCustomAmount('');
    setIdempotencyKey(createPaymentIdempotencyKey('topup', profile.email || 'user'));
  };

  const finalizeVerifiedTopup = async (
    amountInr: number,
    referenceId: string,
    methodLabel: string,
    serverBalanceInr?: number
  ) => {
    const synced = await syncWalletFromBackend();
    const resolvedBalance =
      typeof serverBalanceInr === 'number'
        ? serverBalanceInr
        : synced?.balance ?? Number((currentBalance + amountInr).toFixed(2));

    Haptics.success();
    pushAppNotification({
      kind: 'wallet',
      title: `₹${amountInr.toFixed(2)} Added to Wallet`,
      message: `Verified via ${methodLabel} (Ref: ${referenceId}). Updated balance: ₹${resolvedBalance.toFixed(2)}.`,
    });

    lockedOrderAmountRef.current = null;
    setPhase('successful');
    setStatusMessage(null);
    setSuccessResult({
      amount: amountInr,
      newBalance: resolvedBalance,
      referenceId,
      methodLabel,
    });
  };

  const handleConfirmAddMoney = async () => {
    if (submitLockRef.current || isBusy) return;
    setStatusMessage(null);

    if (!isAuthenticated) {
      Haptics.error();
      setStatusMessage('Sign in on the Account tab with Google before adding money to your wallet.');
      return;
    }

    if (!capabilities.topupSupported) {
      Haptics.error();
      setStatusMessage(
        `Online wallet top-up is unavailable: missing ${capabilities.missingConfigItems.join(', ')}.`
      );
      return;
    }

    if (!amountCheck.valid) {
      Haptics.error();
      setStatusMessage(amountCheck.reason || 'Invalid top-up amount.');
      return;
    }

    submitLockRef.current = true;
    const lockedAmount = Number(effectiveAmount.toFixed(2));
    lockedOrderAmountRef.current = lockedAmount;

    const attemptKey =
      phase === 'idle' || phase === 'failed' || phase === 'cancelled'
        ? createPaymentIdempotencyKey('topup', profile.email || 'user')
        : idempotencyKey;
    setIdempotencyKey(attemptKey);

    Haptics.selection();
    setPhase('creating_order');

    try {
      const sdkLoaded = await loadRazorpayCheckoutScript();
      if (!sdkLoaded) {
        Haptics.error();
        setPhase('failed');
        setStatusMessage('Unable to load Razorpay Checkout. Check your network connection and retry.');
        return;
      }

      const order = await createBackendPaymentOrder({
        idempotencyKey: attemptKey,
        amountInr: lockedAmount,
        purpose: 'wallet_topup',
        preferredMethod: channel,
        customerName: profile.name,
        customerEmail: profile.email,
        customerPhone: profile.phone,
        description: `Print Point Wallet Top-up (₹${lockedAmount.toFixed(2)})`,
      });

      const authoritativeAmount =
        typeof order.amountInr === 'number' ? order.amountInr : lockedAmount;
      lockedOrderAmountRef.current = authoritativeAmount;
      setActiveOrderId(order.orderId);
      setPhase('awaiting_checkout');

      openRazorpayCheckout({
        order,
        preferredMethod: channel,
        customerName: profile.name,
        customerEmail: profile.email,
        customerPhone: profile.phone,
        description: `Add ₹${authoritativeAmount.toFixed(2)} to Print Point Wallet`,
        onSuccess: async (rzpResponse) => {
          setPhase('pending');
          const verification = await verifyBackendPaymentSignature({
            idempotencyKey: attemptKey,
            purpose: 'wallet_topup',
            amountInr: authoritativeAmount,
            response: rzpResponse,
          });

          if (verification.status === 'successful') {
            await finalizeVerifiedTopup(
              authoritativeAmount,
              verification.referenceId || rzpResponse.razorpay_payment_id,
              CHANNEL_LABEL[channel],
              verification.newBalanceInr
            );
          } else if (verification.status === 'unknown') {
            setPhase('unknown');
            setStatusMessage(verification.message);
          } else {
            Haptics.error();
            setPhase('failed');
            setStatusMessage(verification.message);
          }
        },
        onFailed: (reason) => {
          Haptics.error();
          setPhase('failed');
          setStatusMessage(reason);
        },
        onCancelled: () => {
          setPhase('cancelled');
          setStatusMessage('Top-up cancelled. No funds were charged.');
        },
      });
    } catch (err) {
      Haptics.error();
      setPhase('failed');
      setStatusMessage(
        err instanceof Error ? err.message : 'Unable to initialize wallet top-up.'
      );
    } finally {
      submitLockRef.current = false;
    }
  };

  const handleRecheckStatus = async () => {
    if (!activeOrderId || isBusy) return;
    Haptics.buttonPress();
    setPhase('rechecking');
    setStatusMessage(null);

    const check = await recheckBackendPaymentStatus({
      idempotencyKey,
      orderId: activeOrderId,
      purpose: 'wallet_topup',
    });

    const lockedAmount = lockedOrderAmountRef.current ?? effectiveAmount;
    if (check.status === 'successful') {
      await finalizeVerifiedTopup(
        lockedAmount,
        check.referenceId || activeOrderId,
        CHANNEL_LABEL[channel],
        check.newBalanceInr
      );
    } else if (check.status === 'failed') {
      Haptics.error();
      setPhase('failed');
      setStatusMessage(check.message);
    } else {
      setPhase('unknown');
      setStatusMessage(check.message);
    }
  };

  const handleCloseAndReset = () => {
    if (isBusy) return;
    lockedOrderAmountRef.current = null;
    setSuccessResult(null);
    setCustomAmount('');
    setStatusMessage(null);
    setPhase('idle');
    setActiveOrderId(null);
    setSelectedAmount(100);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Money to Print Point Wallet"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4 animate-backdrop-fade"
      onClick={handleCloseAndReset}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E7E1] shadow-2xl p-5 animate-view-enter max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {successResult ? (
          <div className="flex flex-col items-center text-center py-3">
            <div className="relative w-16 h-16 flex items-center justify-center mb-3">
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

            <h3 className="text-[18px] font-bold text-[#191C1A]">
              Payment Successful
            </h3>
            <p className="text-[13px] text-[#545D56] mt-1 mb-4 tabular-nums">
              ₹{successResult.amount.toFixed(2)} credited to your Print Point Wallet.
            </p>

            <div className="w-full rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] p-3.5 mb-5 flex flex-col gap-2 text-left text-xs">
              <div className="flex justify-between text-[#545D56]">
                <span>Credited Amount</span>
                <span className="font-bold text-[#191C1A] tabular-nums">
                  ₹{successResult.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[#545D56]">
                <span>Payment Method</span>
                <span className="font-semibold text-[#194F34]">
                  {successResult.methodLabel}
                </span>
              </div>
              <div className="flex justify-between text-[#545D56]">
                <span>Transaction Ref</span>
                <span className="font-mono font-semibold text-[#191C1A] truncate max-w-[165px]">
                  {successResult.referenceId}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#E2E7E1] pt-2 font-bold text-[#191C1A]">
                <span>Updated Balance</span>
                <span className="text-[#194F34] text-sm tabular-nums">
                  ₹{successResult.newBalance.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseAndReset}
              className="w-full min-h-[46px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-[13.5px] active:scale-[0.98] transition-all cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <DeviceMobile size={19} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-[15.5px] font-bold text-[#191C1A] leading-tight">
                    Add Money
                  </h3>
                  <span className="text-[11.5px] text-[#545D56] tabular-nums">
                    Current balance:{' '}
                    <strong className="text-[#194F34]">
                      ₹{currentBalance.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleCloseAndReset}
                aria-label="Close add money"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {!capabilities.topupSupported && (
              <div
                role="status"
                className="mb-3.5 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12px] leading-snug flex items-start gap-2"
              >
                <Info size={16} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" />
                <div>
                  <strong className="block font-bold mb-0.5">
                    Online Top-Up Not Configured
                  </strong>
                  <span>
                    Verified wallet top-ups require Razorpay Checkout and backend signature
                    verification ({capabilities.missingConfigItems.join('; ')}).
                  </span>
                </div>
              </div>
            )}

            {phase === 'unknown' && (
              <div
                role="status"
                className="mb-3.5 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12px] flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <Clock size={16} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" />
                  <div>
                    <strong className="block font-bold">Verification Pending</strong>
                    <span>{statusMessage || 'Waiting for confirmation from payment gateway.'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRecheckStatus}
                  className="w-full min-h-[38px] rounded-lg bg-[#92400E] text-white font-semibold text-[12px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowCounterClockwise size={14} weight="bold" />
                  <span>Recheck Payment Status</span>
                </button>
              </div>
            )}

            {statusMessage && phase !== 'unknown' && (
              <div
                role="alert"
                className={`mb-3 p-2.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-2 ${
                  phase === 'cancelled'
                    ? 'bg-[#F3F4F0] border-[#D5DDD7] text-[#191C1A]'
                    : 'bg-[#FFF1F2] border-[#FECDD3] text-[#BA1A1A]'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
                  <span>{statusMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="text-[11px] font-bold underline shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="mb-3.5">
              <label className="text-[12px] font-semibold text-[#545D56] block mb-1.5">
                Top-up Amount (₹{MIN_WALLET_TOPUP_INR} – ₹{MAX_WALLET_TOPUP_INR.toLocaleString('en-IN')})
              </label>
              <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                {PRESET_AMOUNTS.map((amt) => {
                  const isSelected = !customAmount && selectedAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSelectPreset(amt)}
                      className={`min-h-[44px] rounded-xl font-bold text-xs tabular-nums transition-all active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-[#194F34] text-white'
                          : 'bg-[#F4F8F5] text-[#194F34] hover:bg-[#EAF3ED] border border-[#194F34]/15'
                      }`}
                    >
                      +₹{amt}
                    </button>
                  );
                })}
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#194F34]">
                  ₹
                </span>
                <input
                  type="number"
                  min={MIN_WALLET_TOPUP_INR}
                  max={MAX_WALLET_TOPUP_INR}
                  disabled={isBusy}
                  placeholder={`Enter custom amount (₹${MIN_WALLET_TOPUP_INR} – ₹${MAX_WALLET_TOPUP_INR.toLocaleString('en-IN')})`}
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setStatusMessage(null);
                    if (phase === 'failed' || phase === 'cancelled') setPhase('idle');
                  }}
                  className="w-full h-11 pl-8 pr-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] focus:border-[#194F34] focus:bg-white text-[13px] font-semibold text-[#191C1A] tabular-nums outline-none transition-all"
                />
              </div>
              {customAmount && !amountCheck.valid && (
                <p className="text-[11px] font-semibold text-[#BA1A1A] mt-1">
                  {amountCheck.reason}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="text-[12px] font-semibold text-[#545D56] block mb-1.5">
                Razorpay Checkout Method
              </label>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isBusy || !capabilities.topupSupported}
                  onClick={() => {
                    Haptics.buttonPress();
                    setChannel('upi');
                  }}
                  className={`min-h-[50px] p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                    channel === 'upi'
                      ? 'bg-[#EAF3ED] border-[#194F34]'
                      : 'bg-white border-[#E2E7E1] hover:border-[#C1C9BF]'
                  } disabled:opacity-55`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#E2E7E1] flex items-center justify-center text-[#194F34]">
                      <DeviceMobile size={17} weight="regular" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#191C1A] block">UPI</span>
                      <span className="text-[11px] text-[#545D56]">
                        GPay · PhonePe · Paytm · BHIM
                      </span>
                    </div>
                  </div>
                  {channel === 'upi' && (
                    <CheckCircle size={18} weight="fill" className="text-[#194F34] shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={isBusy || !capabilities.topupSupported}
                  onClick={() => {
                    Haptics.buttonPress();
                    setChannel('card');
                  }}
                  className={`min-h-[50px] p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                    channel === 'card'
                      ? 'bg-[#EAF3ED] border-[#194F34]'
                      : 'bg-white border-[#E2E7E1] hover:border-[#C1C9BF]'
                  } disabled:opacity-55`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#E2E7E1] flex items-center justify-center text-[#194F34]">
                      <CreditCard size={17} weight="regular" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#191C1A] block">
                        Debit / Credit Card
                      </span>
                      <span className="text-[11px] text-[#545D56]">
                        Visa · Mastercard · RuPay
                      </span>
                    </div>
                  </div>
                  {channel === 'card' && (
                    <CheckCircle size={18} weight="fill" className="text-[#194F34] shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={isBusy || !capabilities.topupSupported}
                  onClick={() => {
                    Haptics.buttonPress();
                    setChannel('netbanking');
                  }}
                  className={`min-h-[50px] p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                    channel === 'netbanking'
                      ? 'bg-[#EAF3ED] border-[#194F34]'
                      : 'bg-white border-[#E2E7E1] hover:border-[#C1C9BF]'
                  } disabled:opacity-55`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-white border border-[#E2E7E1] flex items-center justify-center text-[#194F34]">
                      <Bank size={17} weight="regular" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#191C1A] block">Netbanking</span>
                      <span className="text-[11px] text-[#545D56]">Supported Indian banks</span>
                    </div>
                  </div>
                  {channel === 'netbanking' && (
                    <CheckCircle size={18} weight="fill" className="text-[#194F34] shrink-0" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#545D56] mb-4">
              <ShieldCheck size={14} weight="duotone" className="text-[#194F34] shrink-0" />
              <span>Balance updates only after backend-verified confirmation.</span>
            </div>

            {!isAuthenticated && (
              <div
                role="status"
                className="mb-3.5 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-[12px] leading-snug flex items-start gap-2"
              >
                <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" />
                <span>
                  Sign in with Google on the Account tab before adding money to your Print Point Wallet.
                </span>
              </div>
            )}

            <button
              type="button"
              disabled={!isAuthenticated || !capabilities.topupSupported || isBusy || !amountCheck.valid}
              onClick={handleConfirmAddMoney}
              className="w-full min-h-[46px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-[13.5px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <>
                  <ArrowCounterClockwise size={16} className="animate-spin" />
                  <span>
                    {phase === 'creating_order'
                      ? 'Creating order...'
                      : phase === 'awaiting_checkout'
                      ? 'Awaiting checkout...'
                      : phase === 'rechecking'
                      ? 'Checking status...'
                      : 'Verifying payment...'}
                  </span>
                </>
              ) : !isAuthenticated ? (
                <span>Sign In to Add Money</span>
              ) : !capabilities.topupSupported ? (
                <span>Top-Up Requires Backend Setup</span>
              ) : (
                <>
                  <span className="tabular-nums">
                    Pay ₹{Number.isFinite(effectiveAmount) ? effectiveAmount.toFixed(0) : '0'} to Add
                  </span>
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
