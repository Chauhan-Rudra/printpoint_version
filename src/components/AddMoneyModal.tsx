import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CreditCard,
  Smartphone,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Haptics } from '../utils/haptics';
import { addKioskWalletFunds } from '../utils/kioskWallet';
import { formatInrCurrency } from '../utils/kioskLogic';

interface AddMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
}

const PRESET_AMOUNTS = [50, 100, 200, 500];

export const AddMoneyModal: React.FC<AddMoneyModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
}) => {
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card'>('upi');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successResult, setSuccessResult] = useState<{ amount: number; newBalance: number } | null>(null);

  if (!isOpen) return null;

  const effectiveAmount = customAmount ? parseFloat(customAmount) || 0 : selectedAmount;

  const handleSelectPreset = (amt: number) => {
    Haptics.buttonPress();
    setSelectedAmount(amt);
    setCustomAmount('');
  };

  const handleConfirmAddMoney = () => {
    if (effectiveAmount < 10) {
      alert('Please enter a minimum of ₹10.');
      return;
    }

    Haptics.selection();
    setIsProcessing(true);

    // Simulate instant payment gateway authorization via UPI/Cards
    setTimeout(() => {
      const methodLabel = paymentMethod === 'upi' ? 'UPI Express (GPay / PhonePe)' : 'Debit / Credit Card';
      const result = addKioskWalletFunds(effectiveAmount, methodLabel);
      setIsProcessing(false);

      if (result.success) {
        Haptics.success();
        setSuccessResult({ amount: effectiveAmount, newBalance: result.newBalance });
      } else {
        Haptics.error();
        alert('Could not add money to wallet. Please try again.');
      }
    }, 700);
  };

  const handleCloseAndReset = () => {
    setSuccessResult(null);
    setCustomAmount('');
    setSelectedAmount(100);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Money to Kiosk Wallet"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
      onClick={handleCloseAndReset}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-2xl p-5 animate-apple-card max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {successResult ? (
          /* Success Screen */
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center mb-3 animate-check-pop">
              <CheckCircle2 className="w-7 h-7 stroke-[2.3]" />
            </div>

            <h3 className="text-[18px] font-bold text-[#191C1A]">
              Money Added Successfully!
            </h3>
            <p className="text-[13px] text-[#545D56] mt-1 mb-4">
              ₹{successResult.amount} has been added to your Kiosk Wallet.
            </p>

            <div className="w-full rounded-2xl bg-[#F8FAF8] border border-black/[0.06] p-3.5 mb-5 flex flex-col gap-1.5 text-left text-xs">
              <div className="flex justify-between text-[#545D56]">
                <span>Added Amount</span>
                <span className="font-bold text-[#191C1A]">₹{successResult.amount}</span>
              </div>
              <div className="flex justify-between text-[#545D56]">
                <span>Payment Mode</span>
                <span className="font-semibold text-[#1B4D2E]">
                  {paymentMethod === 'upi' ? 'UPI (Google Pay / PhonePe)' : 'Card'}
                </span>
              </div>
              <div className="flex justify-between border-t border-black/[0.06] pt-1.5 font-bold text-[#191C1A]">
                <span>Updated Balance</span>
                <span className="text-[#1B4D2E] text-sm">₹{successResult.newBalance}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseAndReset}
              className="w-full h-11 rounded-2xl bg-[#1B4D2E] hover:bg-[#153D24] text-white font-semibold text-[13.5px] shadow-xs active:scale-[0.98] transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          /* Add Money Form */
          <>
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                  <Smartphone className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#191C1A] leading-tight">
                    Add Money
                  </h3>
                  <span className="text-[11px] text-[#545D56]">
                    Current Balance: <strong className="text-[#1B4D2E]">₹{currentBalance.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseAndReset}
                aria-label="Close add money"
                className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Amount Selector */}
            <div className="mb-3">
              <label className="text-[11.5px] font-semibold text-[#545D56] block mb-1.5">
                Select Amount
              </label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {PRESET_AMOUNTS.map((amt) => {
                  const isSelected = !customAmount && selectedAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSelectPreset(amt)}
                      className={`h-10 rounded-xl font-bold text-xs transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-[#1B4D2E] text-white shadow-2xs'
                          : 'bg-[#F2F7F4] text-[#1B4D2E] hover:bg-[#E2EFE7] border border-[#1B4D2E]/10'
                      }`}
                    >
                      +₹{amt}
                    </button>
                  );
                })}
              </div>

              {/* Custom Amount Input */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#1B4D2E]">
                  ₹
                </span>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  placeholder="Or enter custom amount"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full h-10 pl-7 pr-3 rounded-xl bg-[#F8FAF8] border border-black/10 focus:border-[#1B4D2E] focus:bg-white text-xs font-semibold text-[#191C1A] outline-none transition-all"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="mb-4">
              <label className="text-[11.5px] font-semibold text-[#545D56] block mb-1.5">
                Payment Option
              </label>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    setPaymentMethod('upi');
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                    paymentMethod === 'upi'
                      ? 'bg-[#EDF5F0] border-[#1B4D2E]'
                      : 'bg-white border-black/10 hover:border-black/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-black/5 flex items-center justify-center text-[#1B4D2E]">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#191C1A] block">
                        UPI Express
                      </span>
                      <span className="text-[10px] text-[#545D56]">
                        Google Pay · PhonePe · Paytm · BHIM
                      </span>
                    </div>
                  </div>
                  {paymentMethod === 'upi' && (
                    <span className="text-[11px] font-bold text-[#1B4D2E]">Selected</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    setPaymentMethod('card');
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                    paymentMethod === 'card'
                      ? 'bg-[#EDF5F0] border-[#1B4D2E]'
                      : 'bg-white border-black/10 hover:border-black/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-black/5 flex items-center justify-center text-[#1B4D2E]">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#191C1A] block">
                        Debit / Credit Card
                      </span>
                      <span className="text-[10px] text-[#545D56]">
                        Visa · Mastercard · RuPay
                      </span>
                    </div>
                  </div>
                  {paymentMethod === 'card' && (
                    <span className="text-[11px] font-bold text-[#1B4D2E]">Selected</span>
                  )}
                </button>
              </div>
            </div>

            {/* Security Guarantee Footnote */}
            <div className="flex items-center gap-1.5 text-[10.5px] text-[#707B72] mb-4">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1B4D2E] shrink-0" />
              <span>Instant auto-credit · 256-bit encrypted kiosk checkout</span>
            </div>

            {/* Confirm CTA */}
            <button
              type="button"
              disabled={isProcessing || effectiveAmount <= 0}
              onClick={handleConfirmAddMoney}
              className="w-full h-11 rounded-2xl bg-[#1B4D2E] hover:bg-[#153D24] text-white font-semibold text-[13.5px] shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <span>Authorizing payment...</span>
              ) : (
                <>
                  <span>Add ₹{effectiveAmount} to Wallet</span>
                  <ArrowRight className="w-4 h-4" />
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
