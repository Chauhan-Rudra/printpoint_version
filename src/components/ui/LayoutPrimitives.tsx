import React from 'react';
import { CaretRight } from '@phosphor-icons/react';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  rightSlot?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onAction,
  rightSlot,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between gap-3 min-w-0 ${className}`}>
      <div className="flex flex-col min-w-0">
        <h2 className="pp-text-section-heading truncate">{title}</h2>
        {subtitle && (
          <p className="text-[12px] text-[#545D56] leading-snug mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {rightSlot ? (
        <div className="shrink-0">{rightSlot}</div>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[36px] px-2 -mr-2 rounded-lg inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#194F34] hover:bg-[#EAF3ED] active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>{actionLabel}</span>
          <CaretRight size={13} weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  className = '',
}) => {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={`w-px self-stretch bg-[#E4EAE5] shrink-0 ${className}`}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        className={`flex items-center gap-3 w-full ${className}`}
      >
        <div className="h-px flex-1 bg-[#E4EAE5]" />
        <span className="text-[11.5px] font-semibold text-[#626E65] whitespace-nowrap">
          {label}
        </span>
        <div className="h-px flex-1 bg-[#E4EAE5]" />
      </div>
    );
  }

  return <hr className={`border-0 h-px w-full bg-[#E4EAE5] my-0 ${className}`} />;
};

export interface SurfaceCardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  tone?: 'default' | 'subtle' | 'tinted';
  className?: string;
}

const cardPaddingMap = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

const cardToneMap = {
  default: 'bg-white border-[#D5DDD7]',
  subtle: 'bg-[#F3F4F0] border-[#D5DDD7]',
  tinted: 'bg-[#F4F8F5] border-[#B8D6C2]',
};

export const SurfaceCard: React.FC<SurfaceCardProps> = ({
  children,
  padding = 'md',
  tone = 'default',
  className = '',
}) => {
  return (
    <div
      className={`w-full rounded-2xl border ${cardToneMap[tone]} ${cardPaddingMap[padding]} ${className}`}
    >
      {children}
    </div>
  );
};

export interface PageContainerProps {
  children: React.ReactNode;
  size?: 'narrow' | 'standard' | 'wide';
  withBottomNavPadding?: boolean;
  className?: string;
}

const containerWidthMap = {
  narrow: 'max-w-md md:max-w-2xl',
  standard: 'max-w-md md:max-w-3xl lg:max-w-4xl',
  wide: 'max-w-md md:max-w-4xl lg:max-w-6xl',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  size = 'standard',
  withBottomNavPadding = false,
  className = '',
}) => {
  return (
    <div
      className={`w-full mx-auto px-4 pt-4 ${
        withBottomNavPadding ? 'pb-24' : 'pb-8'
      } ${containerWidthMap[size]} ${className}`}
    >
      {children}
    </div>
  );
};
