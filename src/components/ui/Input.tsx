import React, { useId } from 'react';
import { MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerClassName?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  helperText,
  error,
  leftIcon,
  rightSlot,
  id,
  disabled,
  className = '',
  containerClassName = '',
  ...rest
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className={`flex flex-col gap-1.5 w-full min-w-0 ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12.5px] font-semibold text-[#191C1A] leading-tight"
        >
          {label}
        </label>
      )}

      <div
        className={`min-h-[46px] w-full rounded-xl border bg-white px-3.5 flex items-center gap-2.5 transition-colors duration-150 ${
          error
            ? 'border-[#BA1A1A] bg-[#FFF1F2]/30 focus-within:ring-2 focus-within:ring-[#BA1A1A]/20'
            : disabled
              ? 'border-[#D5DDD7] bg-[#F3F4F0] opacity-70'
              : 'border-[#D5DDD7] focus-within:border-[#194F34] focus-within:ring-2 focus-within:ring-[#194F34]/15'
        }`}
      >
        {leftIcon && (
          <span className="text-[#545D56] shrink-0 flex items-center" aria-hidden="true">
            {leftIcon}
          </span>
        )}

        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={`flex-1 min-w-0 bg-transparent py-2.5 text-[14.5px] font-medium text-[#191C1A] placeholder:text-[#626E65] focus:outline-none disabled:cursor-not-allowed ${className}`}
          {...rest}
        />

        {rightSlot && <div className="shrink-0 flex items-center">{rightSlot}</div>}
      </div>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-[12px] font-medium text-[#93000A] flex items-center gap-1.5 leading-snug"
        >
          <WarningCircle size={14} weight="fill" className="text-[#BA1A1A] shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-[12px] text-[#545D56] leading-snug">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

export interface SearchFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  containerClassName?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  onClear,
  clearLabel = 'Clear search',
  placeholder = 'Search documents...',
  className = '',
  containerClassName = '',
  ...rest
}) => {
  const handleClear = () => {
    Haptics.selection();
    onChange('');
    onClear?.();
  };

  return (
    <div
      className={`min-h-[44px] w-full rounded-xl border border-[#D5DDD7] bg-white pl-3.5 pr-1.5 flex items-center gap-2 focus-within:border-[#194F34] focus-within:ring-2 focus-within:ring-[#194F34]/15 transition-colors duration-150 ${containerClassName}`}
    >
      <MagnifyingGlass
        size={18}
        weight="bold"
        className="text-[#545D56] shrink-0"
        aria-hidden="true"
      />

      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 min-w-0 bg-transparent py-2 text-[14px] font-medium text-[#191C1A] placeholder:text-[#626E65] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none ${className}`}
        {...rest}
      />

      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearLabel}
          className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-[#545D56] hover:bg-[#EAF3ED] hover:text-[#194F34] active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
