import React from 'react';
import { createPortal } from 'react-dom';
import { Trash, ShieldCheck, X } from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';

interface ConfirmRemovalModalProps {
  isOpen: boolean;
  blankCount: number;
  documentCount: number;
  isRemoving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmRemovalModal: React.FC<ConfirmRemovalModalProps> = ({
  isOpen,
  blankCount,
  isRemoving = false,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-removal-title"
      onClick={onCancel}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[1px] overflow-y-auto animate-backdrop-fade"
    >
      <div
        className="relative w-full max-w-[330px] my-auto rounded-2xl bg-white p-5 shadow-2xl border border-outline-variant/60 flex flex-col items-center text-center gap-3 animate-view-enter shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            onCancel();
          }}
          aria-label="Close dialog"
          className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant transition-colors"
        >
          <X size={15} weight="bold" />
        </button>

        <div className="w-11 h-11 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center mt-0.5">
          <Trash size={20} weight="duotone" />
        </div>

        <div className="space-y-1 w-full px-1">
          <h3
            id="confirm-removal-title"
            className="text-[16px] font-bold text-on-surface tracking-tight leading-snug tabular-nums"
          >
            Exclude {blankCount} {blankCount === 1 ? 'blank page' : 'blank pages'}?
          </h3>
          <p className="text-[12px] text-on-surface-variant leading-relaxed">
            Excluded pages will not be printed. Your original uploaded file remains untouched.
          </p>
        </div>

        <div className="w-full rounded-xl bg-[#F4F8F5] border border-[#194F34]/15 px-3 py-2 flex items-center gap-2 text-left">
          <ShieldCheck size={16} weight="duotone" className="text-[#194F34] shrink-0" />
          <p className="text-[11px] text-on-surface-variant leading-snug flex-1">
            You can restore excluded pages anytime before payment.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onCancel();
            }}
            disabled={isRemoving}
            className="min-h-[44px] rounded-xl border border-outline-variant/70 bg-white text-on-surface text-[12.5px] font-semibold hover:bg-surface-container-low active:scale-[0.98] transition-all disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid="confirm-remove-pages-btn"
            onClick={() => {
              triggerHaptic('buttonPress');
              onConfirm();
            }}
            disabled={isRemoving}
            className="min-h-[44px] rounded-xl bg-[#194F34] text-white text-[12.5px] font-bold hover:bg-[#143E29] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {isRemoving ? (
              <span>Removing...</span>
            ) : (
              <>
                <Trash size={14} weight="bold" />
                <span>Exclude</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
