import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from '@phosphor-icons/react';
import {
  backdropVariants,
  bottomSheetVariants,
  modalPanelVariants,
} from '../../design-system/motion';
import { Button, IconButton } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  icon?: React.ReactNode;
  note?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  icon,
  note,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, loading, onCancel]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={() => {
            if (!loading) onCancel();
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px] overflow-y-auto"
        >
          <motion.div
            variants={modalPanelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[340px] my-auto rounded-2xl bg-white p-5 shadow-xl border border-[#D5DDD7] flex flex-col items-center text-center gap-3"
          >
            <IconButton
              aria-label="Close dialog"
              icon={<X size={16} weight="bold" aria-hidden="true" />}
              size="sm"
              disabled={loading}
              onClick={onCancel}
              className="absolute top-2.5 right-2.5"
            />

            {icon && (
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center mt-1 ${
                  destructive
                    ? 'bg-[#FFF1F2] text-[#BA1A1A]'
                    : 'bg-[#EAF3ED] text-[#194F34]'
                }`}
              >
                {icon}
              </div>
            )}

            <div className="space-y-1.5 w-full px-1">
              <h3
                id={titleId}
                className="text-[16px] font-bold text-[#191C1A] tracking-tight leading-snug"
              >
                {title}
              </h3>
              <p className="text-[13px] text-[#545D56] leading-relaxed">{description}</p>
            </div>

            {note && <div className="w-full text-left">{note}</div>}

            <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
              <Button variant="outline" size="md" disabled={loading} onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                variant={destructive ? 'danger' : 'primary'}
                size="md"
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidthClass = 'sm:max-w-lg',
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[1px] sm:p-4"
        >
          <motion.div
            variants={bottomSheetVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass} max-h-[88dvh] bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-[#D5DDD7] shadow-2xl flex flex-col overflow-hidden pb-safe`}
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
              <div className="w-10 h-1 rounded-full bg-[#C1C9BF]" />
            </div>

            {(title || subtitle) && (
              <div className="px-4 py-3 border-b border-[#E4EAE5] flex items-center justify-between gap-3 shrink-0">
                <div className="flex flex-col min-w-0">
                  {title && (
                    <h2
                      id={titleId}
                      className="text-[16px] font-bold text-[#191C1A] tracking-tight truncate"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-[12px] text-[#545D56] truncate mt-0.5">{subtitle}</p>
                  )}
                </div>

                <IconButton
                  aria-label="Close sheet"
                  icon={<X size={17} weight="bold" aria-hidden="true" />}
                  size="sm"
                  onClick={onClose}
                  className="-mr-1.5"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

            {footer && (
              <div className="px-4 py-3 border-t border-[#E4EAE5] bg-[#F8FAF6] shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
