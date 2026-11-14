import React from 'react';
import { motion } from 'motion/react';
import { CaretRight } from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';
import { PP_EASE } from '../../design-system/motion';

export interface NavItemProps {
  label: string;
  description?: string;
  icon: React.ReactNode;
  active?: boolean;
  badgeText?: string;
  showCaret?: boolean;
  danger?: boolean;
  onClick?: () => void;
  className?: string;
}

export const NavItem: React.FC<NavItemProps> = ({
  label,
  description,
  icon,
  active = false,
  badgeText,
  showCaret = true,
  danger = false,
  onClick,
  className = '',
}) => {
  const handleClick = () => {
    Haptics.selection();
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full min-h-[54px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors duration-150 cursor-pointer ${
        active
          ? 'bg-[#F4F8F5]'
          : 'bg-transparent hover:bg-[#F8FAF6] active:bg-[#F3F4F0]'
      } ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            danger
              ? 'bg-[#FFF1F2] text-[#BA1A1A]'
              : active
                ? 'bg-[#194F34] text-white'
                : 'bg-[#EAF3ED] text-[#194F34]'
          }`}
        >
          {icon}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className={`text-[14px] font-semibold leading-snug truncate ${
              danger ? 'text-[#93000A]' : 'text-[#191C1A]'
            }`}
          >
            {label}
          </span>
          {description && (
            <span className="text-[12px] text-[#545D56] leading-snug truncate">
              {description}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {badgeText && (
          <span className="text-[12px] font-semibold text-[#194F34] tabular-nums">
            {badgeText}
          </span>
        )}
        {showCaret && (
          <CaretRight size={16} weight="bold" className="text-[#626E65]" aria-hidden="true" />
        )}
      </div>
    </button>
  );
};

export interface BottomNavItemConfig {
  id: string;
  label: string;
  ariaLabel?: string;
  isPrimary?: boolean;
  renderIcon: (active: boolean) => React.ReactNode;
}

export interface BottomNavProps {
  items: BottomNavItemConfig[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  items,
  activeId,
  onSelect,
  ariaLabel = 'Main Navigation',
  className = '',
}) => {
  const handleSelect = (id: string) => {
    Haptics.buttonPress();
    onSelect(id);
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={`fixed bottom-0 left-0 right-0 z-40 pb-safe bg-white/95 backdrop-blur-md border-t border-[#E4EAE5] ${className}`}
    >
      <div
        className="max-w-lg mx-auto h-[66px] px-1.5 grid items-center"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;

          if (item.isPrimary) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                aria-label={item.ariaLabel || item.label}
                aria-current={isActive ? 'page' : undefined}
                className="group flex flex-col items-center justify-center gap-1 min-h-[52px] h-full py-1 px-0.5 min-w-0 rounded-xl active:scale-95 transition-transform select-none cursor-pointer"
              >
                <div
                  className={`w-12 h-8 rounded-xl flex items-center justify-center transition-all duration-150 ${
                    isActive
                      ? 'bg-[#143F2A] text-white ring-2 ring-[#194F34]/25 shadow-[0_2px_6px_rgba(25,79,52,0.28)]'
                      : 'bg-[#194F34] text-white group-hover:bg-[#143F2A] shadow-[0_1px_4px_rgba(25,79,52,0.2)]'
                  }`}
                >
                  {item.renderIcon(isActive)}
                </div>
                <span className="text-[11px] font-bold text-[#194F34] tracking-tight leading-none whitespace-nowrap truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              aria-label={item.ariaLabel || item.label}
              aria-current={isActive ? 'page' : undefined}
              className="group flex flex-col items-center justify-center gap-1 min-h-[52px] h-full py-1 px-0.5 min-w-0 rounded-xl active:scale-95 transition-transform select-none cursor-pointer"
            >
              <div
                className={`relative w-12 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ${
                  isActive
                    ? 'text-[#194F34]'
                    : 'text-[#626E65] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/50'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="pp-bottom-nav-active-pill"
                    transition={{ duration: 0.22, ease: PP_EASE.standard }}
                    className="absolute inset-0 rounded-full bg-[#EAF3ED]"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  {item.renderIcon(isActive)}
                </span>
              </div>
              <span
                className={`text-[11px] tracking-tight leading-none whitespace-nowrap truncate max-w-full transition-colors duration-150 ${
                  isActive
                    ? 'font-bold text-[#194F34]'
                    : 'font-medium text-[#626E65] group-hover:text-[#194F34]'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
