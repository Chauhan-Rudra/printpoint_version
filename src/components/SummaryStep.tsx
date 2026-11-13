import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Smartphone,
  Printer,
  RotateCcw,
  FileText,
  Wallet,
} from 'lucide-react';
import { MultiDocPrintSummary, WorkflowStep } from '../types/kiosk';
import { formatCurrency, formatInrCurrency } from '../utils/kioskLogic';
import { useKioskWallet } from '../utils/kioskWallet';

interface SummaryStepProps {
  step: Extract<WorkflowStep, 'summary' | 'payment'>;
  summary: MultiDocPrintSummary;
  estimatedTotalInr?: number;
  previewBeforePrint?: boolean;
  onEditSettings: () => void;
  onProceedToPayment: () => void;
  onStartNewSession: () => void;
}

export const SummaryStep: React.FC<SummaryStepProps> = ({
  step,
  summary,
  estimatedTotalInr,
  previewBeforePrint = true,
  onEditSettings,
  onProceedToPayment,
  onStartNewSession,
}) => {
  const { balance: walletBalance, deductFunds } = useKioskWallet();
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'apple_google' | 'card'>('wallet');
  const [isPrintingJob, setIsPrintingJob] = useState<boolean>(false);
  const [printDispatched, setPrintDispatched] = useState<boolean>(false);

  const formattedPaymentTotal =
    typeof estimatedTotalInr === 'number'
      ? formatInrCurrency(estimatedTotalInr)
      : formatCurrency(summary.totalPrice);

  const totalDueAmount = typeof estimatedTotalInr === 'number' ? estimatedTotalInr : summary.totalPrice;

  const handleConfirmPayAndPrint = () => {
    setIsPrintingJob(true);
    setTimeout(() => {
      if (paymentMethod === 'wallet') {
        deductFunds(totalDueAmount, `Print Job (${summary.documentCount} docs, ${summary.totalEstimatedSheets} sheets)`);
      }
      setIsPrintingJob(false);
      setPrintDispatched(true);
    }, 600);
  };

  // Step 9: Payment & Printing Screen
  if (step === 'payment') {
    if (printDispatched) {
      return (
        <div className="flex flex-col flex-1 w-full animate-fade-in-up">
          <div className="mt-3 p-5 rounded-2xl bg-white border border-outline-variant/60 shadow-2xs text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1B4D2E] text-white flex items-center justify-center mx-auto mb-3 animate-check-pop">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h1 className="text-[22px] font-bold text-on-surface mb-1">
              Printing in progress
            </h1>
            <p className="text-[13px] text-on-surface-variant mb-5">
              Your {summary.documentCount}{' '}
              {summary.documentCount === 1 ? 'document is' : 'documents are'} printing now at
              Kiosk #04. Collect your {summary.totalEstimatedSheets}{' '}
              {summary.totalEstimatedSheets === 1 ? 'sheet' : 'sheets'} from the output tray.
            </p>

            <div className="rounded-xl bg-[#F3F6F3] p-3.5 text-left text-[13px] flex flex-col gap-1.5 mb-5 border border-emerald-900/10">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Documents</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {summary.documentCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total Sheets</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {summary.totalEstimatedSheets}
                </span>
              </div>
              <div className="flex justify-between border-t border-emerald-900/10 pt-1.5">
                <span className="font-semibold text-on-surface">Amount Paid</span>
                <span className="font-bold text-[#1B4D2E] tabular-nums">
                  {formattedPaymentTotal}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartNewSession}
              className="w-full min-h-[48px] rounded-xl bg-[#1B4D2E] hover:bg-primary text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Print More Documents</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 w-full animate-fade-in-up">
        <section className="mt-2 mb-5">
          <h1 className="text-[24px] font-bold text-on-surface tracking-tight leading-tight mb-1">
            Payment &amp; Print
          </h1>
          <p className="text-[14px] text-on-surface-variant">
            Complete payment to start printing immediately at the kiosk.
          </p>
        </section>

        <section className="mb-4 p-4 rounded-2xl bg-white border border-outline-variant/60 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-outline-variant/30">
            <span className="text-[14px] font-medium text-on-surface-variant">Total Due</span>
            <span className="text-[24px] font-bold text-[#1B4D2E] tabular-nums">
              {formattedPaymentTotal}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* 1. Kiosk Wallet Option */}
            <button
              type="button"
              onClick={() => setPaymentMethod('wallet')}
              className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                paymentMethod === 'wallet'
                  ? 'bg-[#F3F6F3] border-2 border-[#1B4D2E]'
                  : 'bg-white border-outline-variant/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                  <Wallet className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-on-surface block">
                      Kiosk Wallet
                    </span>
                    <span className="text-[11px] font-bold text-[#1B4D2E] bg-emerald-100/70 px-1.5 py-0.5 rounded-md">
                      Balance: ₹{walletBalance.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    {walletBalance >= totalDueAmount
                      ? 'Instant 1-tap payment from wallet'
                      : 'Insufficient balance · Use UPI or Add Money'}
                  </span>
                </div>
              </div>
              {paymentMethod === 'wallet' && (
                <span className="text-[12px] font-bold text-[#1B4D2E]">Selected</span>
              )}
            </button>

            {/* 2. Mobile Express Pay */}
            <button
              type="button"
              onClick={() => setPaymentMethod('apple_google')}
              className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                paymentMethod === 'apple_google'
                  ? 'bg-[#F3F6F3] border-2 border-[#1B4D2E]'
                  : 'bg-white border-outline-variant/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-[#1B4D2E]" />
                <div>
                  <span className="text-[14px] font-bold text-on-surface block">
                    Mobile Express Pay
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    UPI · Apple Pay · Google Pay · Contactless
                  </span>
                </div>
              </div>
              {paymentMethod === 'apple_google' && (
                <span className="text-[12px] font-bold text-[#1B4D2E]">Selected</span>
              )}
            </button>

            {/* 3. Card */}
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                paymentMethod === 'card'
                  ? 'bg-[#F3F6F3] border-2 border-[#1B4D2E]'
                  : 'bg-white border-outline-variant/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-on-surface-variant" />
                <div>
                  <span className="text-[14px] font-bold text-on-surface block">
                    Credit or Debit Card
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Visa · Mastercard · RuPay
                  </span>
                </div>
              </div>
              {paymentMethod === 'card' && (
                <span className="text-[12px] font-bold text-[#1B4D2E]">Selected</span>
              )}
            </button>
          </div>
        </section>

        <div className="flex flex-col gap-2.5 mt-auto pt-4">
          <button
            type="button"
            disabled={isPrintingJob || (paymentMethod === 'wallet' && walletBalance < totalDueAmount)}
            onClick={handleConfirmPayAndPrint}
            className="w-full min-h-[50px] rounded-xl bg-[#1B4D2E] hover:bg-primary disabled:opacity-50 text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isPrintingJob
                ? 'Sending to Kiosk...'
                : paymentMethod === 'wallet'
                ? `Pay ${formattedPaymentTotal} from Wallet & Print`
                : `Pay ${formattedPaymentTotal} & Print`}
            </span>
          </button>

          <button
            type="button"
            onClick={onEditSettings}
            className="w-full min-h-[46px] rounded-xl bg-white border border-outline-variant/70 text-on-surface font-semibold text-[14px] hover:bg-surface-container-low transition-colors"
          >
            Edit Settings
          </button>
        </div>
      </div>
    );
  }

  // Screen 5: Review your print
  return (
    <div className="flex flex-col flex-1 w-full pb-28">
      <div className="flex flex-col flex-1 w-full animate-fade-in-up">
        {/* Heading */}
        <section className="mt-1 mb-3.5">
          <h1 className="text-[22px] font-bold text-on-surface tracking-tight leading-tight mb-0.5">
            Review your print
          </h1>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            Check your settings and total before continuing to payment.
          </p>
        </section>

        {/* Page Preview Strip when Preview Pages Before You Print is enabled */}
        {previewBeforePrint && summary.items.length > 0 && (
          <section aria-label="Document Page Preview" className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Page Preview
              </span>
              <span className="text-[11px] font-semibold text-[#1B4D2E]">
                {summary.colourModeLabel} · {summary.sidesModeLabel}
              </span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {summary.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="w-[118px] shrink-0 p-2 rounded-xl bg-white border border-outline-variant/60 shadow-2xs flex flex-col gap-1.5"
                >
                  <div className="w-full h-[72px] rounded-lg bg-[#F5F7F5] border border-outline-variant/40 p-2 flex flex-col justify-between">
                    <div className="flex flex-col gap-1">
                      <div
                        className={`w-2/3 h-1.5 rounded ${
                          item.colourMode === 'colour'
                            ? 'bg-[#1B4D2E]'
                            : 'bg-neutral-700'
                        }`}
                      />
                      <div className="w-full h-1 rounded bg-neutral-300" />
                      <div className="w-5/6 h-1 rounded bg-neutral-300" />
                      <div className="w-3/4 h-1 rounded bg-neutral-300" />
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-semibold text-on-surface-variant">
                      <span>Doc {idx + 1}</span>
                      <span>1–{item.originalPages}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-on-surface truncate">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main Summary Card */}
        <section className="mb-3.5 p-3.5 rounded-2xl bg-white border border-outline-variant/60 shadow-2xs">
          <div className="divide-y divide-outline-variant/30 text-[13px]">
            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Uploaded documents</span>
              <span
                data-testid="summary-doc-count"
                className="font-bold text-on-surface tabular-nums"
              >
                {summary.documentCount} {summary.documentCount === 1 ? 'document' : 'documents'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Total original pages</span>
              <span
                data-testid="summary-total-pages"
                className="font-bold text-on-surface tabular-nums"
              >
                {summary.totalOriginalPages}{' '}
                {summary.totalOriginalPages === 1 ? 'page' : 'pages'}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Selected colour mode</span>
              <span className="font-bold text-on-surface">{summary.colourModeLabel}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Selected printing sides</span>
              <span className="font-bold text-on-surface">{summary.sidesModeLabel}</span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Number of copies</span>
              <span className="font-bold text-on-surface tabular-nums">
                {summary.copiesLabel}
              </span>
            </div>

            <div className="py-2 flex items-center justify-between">
              <span className="text-on-surface-variant">Total estimated sheets</span>
              <span
                data-testid="summary-total-sheets"
                className="font-bold text-on-surface tabular-nums"
              >
                {summary.totalEstimatedSheets}{' '}
                {summary.totalEstimatedSheets === 1 ? 'sheet' : 'sheets'}
              </span>
            </div>

            <div className="pt-2.5 pb-0.5 flex items-center justify-between">
              <span className="text-[14px] font-bold text-on-surface">Total price</span>
              <span
                data-testid="summary-total-price"
                className="text-[20px] font-bold text-[#1B4D2E] tabular-nums"
              >
                {formatCurrency(summary.totalPrice)}
              </span>
            </div>
          </div>
        </section>

        {/* Compact Per-Document Breakdown */}
        <section className="mb-4 flex flex-col gap-2">
          {summary.items.map((item) => (
            <div
              key={item.id}
              className="px-3.5 py-2 rounded-xl bg-white border border-outline-variant/40 flex items-center justify-between text-[12px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#1B4D2E] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-on-surface truncate block">
                    {item.name}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {item.originalPages} pgs ·{' '}
                    {item.colourMode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                    {item.sides === '2-sided' ? '2-Sided' : '1-Sided'} · {item.copies}×
                  </span>
                </div>
              </div>
              <span className="font-bold text-on-surface tabular-nums shrink-0 ml-2">
                {formatCurrency(item.subtotalPrice)}
              </span>
            </div>
          ))}
        </section>
      </div>

      {/* Sticky Bottom Actions: Edit Settings & Continue to Payment */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-outline-variant/35 px-4 pt-3 pb-6 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        <div className="max-w-md mx-auto w-full flex items-center gap-2.5">
          <button
            type="button"
            onClick={onEditSettings}
            className="min-h-[48px] px-4 rounded-xl bg-white border border-outline-variant/70 text-on-surface font-semibold text-[14px] hover:bg-surface-container-low transition-colors active:scale-[0.99] shrink-0"
          >
            Edit Settings
          </button>

          <button
            type="button"
            onClick={onProceedToPayment}
            className="flex-1 min-h-[48px] rounded-xl bg-[#1B4D2E] hover:bg-primary text-white font-bold text-[15px] flex items-center justify-center shadow-xs transition-all active:scale-[0.99]"
          >
            Continue to Payment
          </button>
        </div>
      </div>
    </div>
  );
};
