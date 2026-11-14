import React from 'react';
import { Plus, Wallet } from '@phosphor-icons/react';
import { formatWalletBalanceInr } from '../../utils/kioskWallet';
import { Button } from './Button';

export interface WalletCardProps {
  balanceInr: number;
  variant?: 'compact' | 'summary' | 'hero';
  subtitle?: string;
  onAddMoney?: () => void;
  addMoneyLabel?: string;
  className?: string;
}

export const WalletCard: React.FC<WalletCardProps> = ({
  balanceInr,
  variant = 'summary',
  subtitle,
  onAddMoney,
  addMoneyLabel = 'Add Money',
  className = '',
}) => {
  const formatted = formatWalletBalanceInr(balanceInr);

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl bg-[#EAF3ED] border border-[#194F34]/12 px-3 min-h-[42px] ${className}`}
      >
        <Wallet size={17} weight="fill" className="text-[#194F34] shrink-0" aria-hidden="true" />
        <span className="text-[13.5px] font-bold text-[#191C1A] tabular-nums leading-none whitespace-nowrap">
          {formatted}
        </span>
        {onAddMoney && (
          <button
            type="button"
            onClick={onAddMoney}
            aria-label={addMoneyLabel}
            className="ml-0.5 w-6 h-6 rounded-lg bg-[#194F34] text-white flex items-center justify-center hover:bg-[#143F2A] active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={13} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div
        className={`w-full rounded-2xl bg-[#194F34] text-white p-4 sm:p-5 flex items-center justify-between gap-4 ${className}`}
      >
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-white/80 text-[12px] font-semibold">
            <Wallet size={15} weight="duotone" aria-hidden="true" />
            <span>Print Point Wallet</span>
          </div>
          <span className="mt-1 text-[28px] leading-tight font-bold tracking-tight tabular-nums">
            {formatted}
          </span>
          {subtitle && (
            <span className="text-[12px] text-white/80 mt-1 leading-snug">{subtitle}</span>
          )}
        </div>

        {onAddMoney && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus size={14} weight="bold" aria-hidden="true" />}
            onClick={onAddMoney}
            className="bg-white text-[#194F34] hover:bg-[#EAF3ED]"
          >
            {addMoneyLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-2xl bg-white border border-[#D5DDD7] p-4 flex items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-[#EAF3ED] border border-[#194F34]/12 text-[#194F34] flex items-center justify-center shrink-0">
          <Wallet size={21} weight="duotone" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] font-semibold text-[#545D56]">Wallet Balance</span>
          <span className="text-[20px] font-bold text-[#191C1A] tracking-tight tabular-nums leading-tight">
            {formatted}
          </span>
          {subtitle && (
            <span className="text-[12px] text-[#545D56] mt-0.5 truncate">{subtitle}</span>
          )}
        </div>
      </div>

      {onAddMoney && (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={14} weight="bold" aria-hidden="true" />}
          onClick={onAddMoney}
        >
          {addMoneyLabel}
        </Button>
      )}
    </div>
  );
};
