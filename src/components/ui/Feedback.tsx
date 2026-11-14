import React from 'react';
import {
  CheckCircle,
  CircleNotch,
  Info,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusIndicatorProps {
  tone?: StatusTone;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

const toneStyles: Record<StatusTone, { wrap: string; iconColor: string }> = {
  success: {
    wrap: 'bg-[#EAF3ED] text-[#194F34] border-[#B8D6C2]',
    iconColor: 'text-[#194F34]',
  },
  warning: {
    wrap: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
    iconColor: 'text-[#D97706]',
  },
  error: {
    wrap: 'bg-[#FFF1F2] text-[#93000A] border-[#FECDD3]',
    iconColor: 'text-[#BA1A1A]',
  },
  info: {
    wrap: 'bg-[#EFF6FA] text-[#1E4E68] border-[#CDE1EC]',
    iconColor: 'text-[#1E4E68]',
  },
  neutral: {
    wrap: 'bg-[#F3F4F0] text-[#545D56] border-[#D5DDD7]',
    iconColor: 'text-[#545D56]',
  },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  tone = 'neutral',
  label,
  size = 'sm',
  className = '',
}) => {
  const styles = toneStyles[tone];
  const iconSize = size === 'sm' ? 13 : 15;

  const renderIcon = () => {
    switch (tone) {
      case 'success':
        return <CheckCircle size={iconSize} weight="fill" className={`${styles.iconColor} shrink-0`} aria-hidden="true" />;
      case 'warning':
        return <Warning size={iconSize} weight="fill" className={`${styles.iconColor} shrink-0`} aria-hidden="true" />;
      case 'error':
        return <WarningCircle size={iconSize} weight="fill" className={`${styles.iconColor} shrink-0`} aria-hidden="true" />;
      case 'info':
      default:
        return <Info size={iconSize} weight="fill" className={`${styles.iconColor} shrink-0`} aria-hidden="true" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold whitespace-nowrap ${
        size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12.5px]'
      } ${styles.wrap} ${className}`}
    >
      {renderIcon()}
      <span>{label}</span>
    </span>
  );
};

export interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 20,
  className = '',
  label = 'Loading',
}) => (
  <CircleNotch
    size={size}
    weight="bold"
    aria-label={label}
    className={`animate-spin text-[#194F34] shrink-0 ${className}`}
  />
);

export const LoadingState: React.FC<{
  title?: string;
  subtitle?: string;
  className?: string;
}> = ({ title = 'Loading...', subtitle, className = '' }) => (
  <div
    role="status"
    aria-live="polite"
    className={`w-full py-10 px-4 flex flex-col items-center justify-center text-center gap-2.5 ${className}`}
  >
    <div className="w-11 h-11 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
      <LoadingSpinner size={22} label={title} />
    </div>
    <p className="text-[14px] font-semibold text-[#191C1A]">{title}</p>
    {subtitle && <p className="text-[12.5px] text-[#545D56] max-w-xs">{subtitle}</p>}
  </div>
);

export const SkeletonBlock: React.FC<{
  className?: string;
}> = ({ className = 'h-4 w-full' }) => (
  <div
    aria-hidden="true"
    className={`rounded-lg bg-[#E7E9E5] animate-pulse ${className}`}
  />
);

export interface ProgressBarProps {
  value: number;
  indeterminate?: boolean;
  label?: string;
  showPercent?: boolean;
  tone?: 'brand' | 'success' | 'error';
  size?: 'sm' | 'md';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  indeterminate = false,
  label,
  showPercent = false,
  tone = 'brand',
  size = 'md',
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fillColor =
    tone === 'error'
      ? 'bg-[#BA1A1A]'
      : tone === 'success'
        ? 'bg-[#194F34]'
        : 'bg-[#194F34]';

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {(label || (showPercent && !indeterminate)) && (
        <div className="flex items-center justify-between gap-2 text-[12px]">
          {label ? (
            <span className="font-semibold text-[#191C1A] truncate">{label}</span>
          ) : (
            <span />
          )}
          {showPercent && !indeterminate && (
            <span className="font-bold text-[#194F34] tabular-nums shrink-0">
              {clamped}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-label={label || 'Progress'}
        className={`w-full rounded-full bg-[#E4EAE5] overflow-hidden ${
          size === 'sm' ? 'h-1.5' : 'h-2.5'
        }`}
      >
        {indeterminate ? (
          <div
            className={`h-full w-1/2 rounded-full origin-left animate-pp-indeterminate ${fillColor}`}
          />
        ) : (
          <div
            className={`h-full w-full rounded-full origin-left transition-transform duration-200 ease-out ${fillColor}`}
            style={{ transform: `scaleX(${clamped / 100})` }}
          />
        )}
      </div>
    </div>
  );
};
