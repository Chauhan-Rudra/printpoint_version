import React from 'react';
import { ArrowClockwise, FolderOpen, WarningCircle, X } from '@phosphor-icons/react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`w-full rounded-2xl bg-white border border-[#D5DDD7] px-5 py-8 flex flex-col items-center justify-center text-center gap-3 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#EAF3ED] border border-[#194F34]/12 text-[#194F34] flex items-center justify-center shrink-0">
        {icon ?? <FolderOpen size={22} weight="duotone" aria-hidden="true" />}
      </div>

      <div className="space-y-1 max-w-xs">
        <h3 className="text-[15px] font-bold text-[#191C1A] leading-snug">{title}</h3>
        {description && (
          <p className="text-[13px] text-[#545D56] leading-relaxed">{description}</p>
        )}
      </div>

      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {actionLabel && onAction && (
            <Button variant="primary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="sm" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  variant?: 'banner' | 'block';
  retryLabel?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  variant = 'banner',
  retryLabel = 'Try Again',
  onRetry,
  onDismiss,
  className = '',
}) => {
  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={`w-full rounded-xl bg-[#FFF1F2] border border-[#FECDD3] px-3.5 py-3 text-[#93000A] flex items-start justify-between gap-2.5 ${className}`}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <WarningCircle
            size={18}
            weight="fill"
            className="text-[#BA1A1A] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex flex-col min-w-0 gap-1">
            <span className="text-[12.5px] font-bold leading-snug">{message}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="self-start inline-flex items-center gap-1 text-[12px] font-bold text-[#BA1A1A] underline underline-offset-2 hover:text-[#93000A] cursor-pointer"
              >
                <ArrowClockwise size={12} weight="bold" aria-hidden="true" />
                <span>{retryLabel}</span>
              </button>
            )}
          </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0 text-[#93000A] cursor-pointer"
          >
            <X size={14} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`w-full rounded-2xl bg-white border border-[#FECDD3] px-5 py-7 flex flex-col items-center justify-center text-center gap-3 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] flex items-center justify-center shrink-0">
        <WarningCircle size={22} weight="fill" aria-hidden="true" />
      </div>

      <div className="space-y-1 max-w-xs">
        <h3 className="text-[15px] font-bold text-[#191C1A] leading-snug">{title}</h3>
        <p className="text-[13px] text-[#545D56] leading-relaxed">{message}</p>
      </div>

      {(onRetry || onDismiss) && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {onRetry && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ArrowClockwise size={14} weight="bold" aria-hidden="true" />}
              onClick={onRetry}
            >
              {retryLabel}
            </Button>
          )}
          {onDismiss && (
            <Button variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
