import React from 'react';
import { Haptics } from '../utils/haptics';

export const CREATOR_LAB_LOGO_SRC =
  '/assets/aistudio/creator_lab_logo.jpg_76ea274d.png';

export interface Creator4LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

const sizeConfig = {
  xs: {
    box: 'w-7 h-7 rounded-[8px]',
    textSize: 'text-[12.5px]',
    subSize: 'text-[9px]',
  },
  sm: {
    box: 'w-8.5 h-8.5 rounded-[10px]',
    textSize: 'text-[13.5px]',
    subSize: 'text-[10px]',
  },
  md: {
    box: 'w-10 h-10 rounded-[12px]',
    textSize: 'text-[15.5px]',
    subSize: 'text-[11.5px]',
  },
  lg: {
    box: 'w-12 h-12 rounded-[14px]',
    textSize: 'text-[18px]',
    subSize: 'text-[12.5px]',
  },
  xl: {
    box: 'w-16 h-16 rounded-[18px]',
    textSize: 'text-[24px]',
    subSize: 'text-[14px]',
  },
};

/**
 * Authentic Creator4 Lab Logo Component.
 * Displays the exact provided brand logo image unmodified and fitted as-is.
 */
export const Creator4Logo: React.FC<Creator4LogoProps> = ({
  size = 'md',
  showWordmark = false,
  subtitle,
  className = '',
  onClick,
  interactive = true,
}) => {
  const cfg = sizeConfig[size];

  const handleClick = () => {
    if (interactive) {
      Haptics.selection();
    }
    if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      onClick={onClick ? handleClick : undefined}
    >
      {/* Exact Unmodified Logo Container */}
      <div
        className={`relative shrink-0 ${cfg.box} aspect-square overflow-hidden shadow-2xs border border-black/[0.08] transition-transform duration-200 ${
          interactive && onClick
            ? 'cursor-pointer hover:scale-[1.04] active:scale-95'
            : ''
        }`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label="the Creato4 Lab Logo"
      >
        <img
          src={CREATOR_LAB_LOGO_SRC}
          alt="the Creato4 Lab"
          className="w-full h-full object-cover object-center block"
          loading="eager"
          decoding="async"
        />
      </div>

      {/* Optional Wordmark Pair */}
      {showWordmark && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`${cfg.textSize} font-black text-[#191C1A] tracking-tight leading-tight truncate`}
            >
              Print <span className="text-[#1B4D2E]">Point</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>
          {subtitle && (
            <span
              className={`${cfg.subSize} text-[#545D56] font-medium leading-tight truncate mt-0.5`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
