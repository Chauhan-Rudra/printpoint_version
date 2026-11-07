import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, ShieldCheck, X } from 'lucide-react';
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
  documentCount,
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fade-in"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
      }}
    >
      <div
        className="relative w-full max-w-[325px] my-auto rounded-[24px] bg-white p-4.5 sm:p-5 shadow-2xl border border-black/[0.08] flex flex-col items-center text-center gap-3 animate-apple-card shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Icon in Top Corner */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            onCancel();
          }}
          aria-label="Close dialog"
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-[#556058] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Top Icon Badge */}
        <div className="w-11 h-11 rounded-2xl bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center shadow-2xs mt-0.5">
          <Trash2 className="w-5 h-5 stroke-[2.2]" />
        </div>

        {/* Title and Supporting Text */}
        <div className="space-y-1 w-full px-1">
          <h3
            id="confirm-removal-title"
            className="text-[16px] font-bold text-[#141A16] tracking-tight leading-snug"
          >
            Remove {blankCount} {blankCount === 1 ? 'blank page' : 'blank pages'}?
          </h3>
          <p className="text-[11.5px] text-[#556058] leading-relaxed">
            {blankCount === 1
              ? 'This page will be excluded from your print copy. Your original uploaded file remains untouched.'
              : 'These pages will be excluded from your print copy. Your original uploaded files remain untouched.'}
          </p>
        </div>

        {/* Safety Note Banner with Centered Alignment */}
        <div className="w-full rounded-xl bg-[#F4F8F5] border border-[#1B4D2E]/15 px-2.5 py-2 flex items-center gap-2 text-left shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-[#1B4D2E] shrink-0" />
          <p className="text-[10.5px] text-[#334237] leading-snug flex-1">
            Original files stay safe. You can restore pages anytime before payment.
          </p>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2 w-full pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onCancel();
            }}
            disabled={isRemoving}
            className="h-10 rounded-xl border border-black/15 bg-white text-[#333D36] text-[12.5px] font-semibold hover:bg-neutral-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center shadow-2xs"
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
            className="h-10 rounded-xl bg-[#1B4D2E] text-white text-[12.5px] font-bold hover:bg-[#153D24] shadow-[0_2px_8px_rgba(27,77,46,0.22)] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {isRemoving ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
