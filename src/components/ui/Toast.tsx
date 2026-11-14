import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { feedbackVariants } from '../../design-system/motion';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => '',
      dismissToast: () => undefined,
    };
  }
  return ctx;
};

const toastToneConfig: Record<
  ToastTone,
  { wrap: string; iconColor: string; titleColor: string }
> = {
  success: {
    wrap: 'bg-white border-[#B8D6C2]',
    iconColor: 'text-[#194F34]',
    titleColor: 'text-[#191C1A]',
  },
  error: {
    wrap: 'bg-white border-[#FECDD3]',
    iconColor: 'text-[#BA1A1A]',
    titleColor: 'text-[#93000A]',
  },
  warning: {
    wrap: 'bg-white border-[#FDE68A]',
    iconColor: 'text-[#D97706]',
    titleColor: 'text-[#92400E]',
  },
  info: {
    wrap: 'bg-white border-[#CDE1EC]',
    iconColor: 'text-[#1E4E68]',
    titleColor: 'text-[#191C1A]',
  },
};

export const ToastViewport: React.FC<{
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  const content = (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-3 left-0 right-0 z-[120] pt-safe px-4 pointer-events-none flex flex-col items-center gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = toast.tone ?? 'info';
          const cfg = toastToneConfig[tone];
          return (
            <motion.div
              key={toast.id}
              layout
              variants={feedbackVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              role={tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto w-full max-w-md rounded-2xl border shadow-lg px-3.5 py-3 flex items-start gap-2.5 ${cfg.wrap}`}
            >
              <span className={`shrink-0 mt-0.5 ${cfg.iconColor}`} aria-hidden="true">
                {tone === 'success' ? (
                  <CheckCircle size={18} weight="fill" />
                ) : tone === 'error' ? (
                  <WarningCircle size={18} weight="fill" />
                ) : tone === 'warning' ? (
                  <Warning size={18} weight="fill" />
                ) : (
                  <Info size={18} weight="fill" />
                )}
              </span>

              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-[13px] font-bold leading-snug ${cfg.titleColor}`}>
                  {toast.title}
                </span>
                {toast.description && (
                  <span className="text-[12px] text-[#545D56] leading-snug mt-0.5">
                    {toast.description}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#545D56] hover:bg-[#F3F4F0] shrink-0 cursor-pointer"
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, tone = 'info', durationMs = 3400 }: Omit<ToastItem, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, description, tone, durationMs }]);

      if (durationMs > 0) {
        timersRef.current[id] = window.setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
      return id;
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(timersRef.current)) {
        window.clearTimeout(timerId);
      }
      timersRef.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};
