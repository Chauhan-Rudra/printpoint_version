import React from 'react';
import { motion } from 'motion/react';
import { CircleNotch } from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';
import { pressableTap } from '../../design-system/motion';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  haptic?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#194F34] text-white border border-transparent hover:bg-[#143F2A] active:bg-[#0F3120] disabled:bg-[#E1E3DF] disabled:text-[#6E7770]',
  secondary:
    'bg-[#EAF3ED] text-[#194F34] border border-[#194F34]/12 hover:bg-[#DDECE2] disabled:bg-[#E1E3DF] disabled:text-[#6E7770]',
  outline:
    'bg-white text-[#191C1A] border border-[#D5DDD7] hover:bg-[#F4F8F5] hover:border-[#194F34]/35 disabled:bg-[#F3F4F0] disabled:text-[#6E7770]',
  ghost:
    'bg-transparent text-[#191C1A] border border-transparent hover:bg-[#EAF3ED]/60 hover:text-[#194F34] disabled:text-[#6E7770]',
  danger:
    'bg-[#BA1A1A] text-white border border-transparent hover:bg-[#93000A] disabled:bg-[#E1E3DF] disabled:text-[#6E7770]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'min-h-[44px] px-4 text-[14px] rounded-xl gap-2',
  lg: 'min-h-[48px] px-5 text-[14.5px] rounded-xl gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  haptic = true,
  disabled,
  onClick,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const isDisabled = Boolean(disabled || loading);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (haptic) {
      Haptics.buttonPress();
    }
    onClick?.(e);
  };

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      onClick={handleClick}
      whileTap={isDisabled ? undefined : pressableTap.whileTap}
      transition={pressableTap.transition}
      className={`inline-flex items-center justify-center font-semibold tracking-[-0.005em] whitespace-nowrap shrink-0 transition-colors duration-150 select-none ${
        isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${variantClasses[variant]} ${sizeClasses[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...(rest as Record<string, unknown>)}
    >
      {loading ? (
        <CircleNotch size={17} weight="bold" className="animate-spin shrink-0" aria-hidden="true" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span className="truncate">{children}</span>
      {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </motion.button>
  );
};

export type IconButtonVariant = 'ghost' | 'surface' | 'tinted' | 'primary' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  haptic?: boolean;
}

const iconVariantClasses: Record<IconButtonVariant, string> = {
  ghost: 'bg-transparent text-[#545D56] hover:bg-[#EAF3ED]/70 hover:text-[#194F34]',
  surface: 'bg-white text-[#191C1A] border border-[#D5DDD7] hover:bg-[#F4F8F5] hover:border-[#194F34]/35',
  tinted: 'bg-[#EAF3ED] text-[#194F34] border border-[#194F34]/12 hover:bg-[#DDECE2]',
  primary: 'bg-[#194F34] text-white hover:bg-[#143F2A]',
  danger: 'bg-[#FFF1F2] text-[#BA1A1A] border border-[#FECDD3] hover:bg-[#FFE4E6]',
};

const iconSizeClasses: Record<IconButtonSize, string> = {
  sm: 'min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl',
  md: 'min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl',
  lg: 'min-w-[48px] min-h-[48px] w-12 h-12 rounded-xl',
};

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  haptic = true,
  disabled,
  onClick,
  className = '',
  type = 'button',
  ...rest
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (haptic) {
      Haptics.selection();
    }
    onClick?.(e);
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={handleClick}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={pressableTap.transition}
      className={`inline-flex items-center justify-center shrink-0 transition-colors duration-150 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${iconVariantClasses[variant]} ${iconSizeClasses[size]} ${className}`}
      {...(rest as Record<string, unknown>)}
    >
      {icon}
    </motion.button>
  );
};
