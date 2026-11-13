import React, { useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { Haptics } from '../utils/haptics';
import { PRICE_INR_PER_PAGE_BW } from '../utils/kioskLogic';
import { useKioskWallet } from '../utils/kioskWallet';
import { AddMoneyModal } from './AddMoneyModal';

interface KioskWalletCardProps {
  onAddMoneyClick?: () => void;
}

export const KioskWalletCard: React.FC<KioskWalletCardProps> = () => {
  const { balance } = useKioskWallet();
  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);

  const estimatedBwPages = Math.floor(balance / PRICE_INR_PER_PAGE_BW);

  const handleOpenAddMoney = () => {
    Haptics.buttonPress();
    setIsAddMoneyOpen(true);
  };

  return (
    <>
      <section
        aria-label="Kiosk Wallet Balance"
        className="mb-3.5 w-full"
      >
        <div className="relative w-full rounded-2xl bg-[#1B4D2E] text-white p-4 sm:p-4.5 shadow-xs border border-[#163F26]">
          {/* Top Row: Heading & Add Money CTA */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white/90">
                <Wallet className="w-3.5 h-3.5 stroke-[2.2]" aria-hidden="true" />
              </span>
              <h2 className="text-[13px] font-bold tracking-tight text-white">
                My Wallet
              </h2>
            </div>

            <button
              type="button"
              onClick={handleOpenAddMoney}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white text-[#1B4D2E] hover:bg-[#F2F7F4] active:scale-95 font-semibold text-[12px] shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
              <span>Add Money</span>
            </button>
          </div>

          {/* Main Content Row: Balance + Clean Wallet Icon Container */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-white/90">₹</span>
                <span className="text-[28px] sm:text-[30px] font-black tracking-tight leading-none text-white tabular-nums">
                  {balance % 1 === 0 ? balance : balance.toFixed(2)}
                </span>
              </div>

              {/* Natural product description */}
              <p className="text-[12px] text-white/80 font-normal leading-tight mt-1.5">
                Pay for printing using your balance.
              </p>

              {/* Plain text metadata (zero-pill discipline) */}
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-200">
                <span>Covers ~{estimatedBwPages} B&amp;W pages</span>
                <span aria-hidden="true" className="opacity-60">·</span>
                <span className="opacity-80">₹{PRICE_INR_PER_PAGE_BW}/page</span>
              </div>
            </div>

            {/* Consistent Vector Wallet Icon Badge */}
            <div className="w-13 h-13 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0">
              <Wallet className="w-6 h-6 stroke-[2]" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      {/* Add Money Modal */}
      <AddMoneyModal
        isOpen={isAddMoneyOpen}
        onClose={() => setIsAddMoneyOpen(false)}
        currentBalance={balance}
      />
    </>
  );
};
