import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle } from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';
import { pressableTap } from '../../design-system/motion';

export interface SelectionCardProps {
  title: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  meta?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'radio' | 'checkbox';
  className?: string;
}

export const SelectionCard: React.FC<SelectionCardProps> = ({
  title,
  description,
  selected = false,
  disabled = false,
  icon,
  meta,
  trailing,
  onClick,
  type = 'radio',
  className = '',
}) => {
  const handleClick = () => {
    if (disabled) return;
    Haptics.selection();
    onClick?.();
  };

  return (
    <motion.button
      type="button"
      role={type === 'button' ? undefined : type}
      aria-checked={type === 'button' ? undefined : selected}
      disabled={disabled}
      onClick={handleClick}
      whileTap={disabled ? undefined : pressableTap.whileTap}
      transition={pressableTap.transition}
      className={`w-full min-h-[56px] p-3.5 rounded-2xl border text-left transition-colors duration-150 flex items-center justify-between gap-3 ${
        disabled
          ? 'bg-[#F3F4F0] border-[#D5DDD7] opacity-60 cursor-not-allowed'
          : selected
            ? 'bg-[#F4F8F5] border-[#194F34] ring-1 ring-[#194F34]/15 cursor-pointer'
            : 'bg-white border-[#D5DDD7] hover:border-[#194F34]/40 cursor-pointer'
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              selected
                ? 'bg-[#194F34] text-white'
                : 'bg-[#EAF3ED] text-[#194F34] border border-[#194F34]/10'
            }`}
          >
            {icon}
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[14px] font-bold text-[#191C1A] leading-snug truncate">
            {title}
          </span>
          {description && (
            <span className="text-[12px] text-[#545D56] leading-snug mt-0.5 line-clamp-2">
              {description}
            </span>
          )}
          {meta && (
            <span className="text-[11.5px] font-semibold text-[#194F34] mt-1 tabular-nums truncate">
              {meta}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {trailing}
        {type !== 'button' &&
          (selected ? (
            <CheckCircle size={20} weight="fill" className="text-[#194F34] shrink-0" aria-hidden="true" />
          ) : (
            <span
              className="w-5 h-5 rounded-full border-2 border-[#C1C9BF] shrink-0"
              aria-hidden="true"
            />
          ))}
      </div>
    </motion.button>
  );
};
