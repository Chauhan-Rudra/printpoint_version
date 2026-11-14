import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  CheckSquare,
  Square,
  Warning,
  FileText,
  Trash,
} from '@phosphor-icons/react';
import { BlankPageItem } from '../types/kiosk';
import { triggerHaptic } from '../utils/haptics';

interface ReviewBlankPagesModalProps {
  isOpen: boolean;
  detectedItems: BlankPageItem[];
  selectedIndices: number[];
  onToggleIndex: (index: number) => void;
  onSelectAll: (select: boolean) => void;
  onJumpToPage: (docId: string, pageNumber: number) => void;
  onProceedToRemove: () => void;
  onClose: () => void;
}

export const ReviewBlankPagesModal: React.FC<ReviewBlankPagesModalProps> = ({
  isOpen,
  detectedItems,
  selectedIndices,
  onToggleIndex,
  onSelectAll,
  onJumpToPage,
  onProceedToRemove,
  onClose,
}) => {
  if (!isOpen) return null;

  const allSelected =
    detectedItems.length > 0 && selectedIndices.length === detectedItems.length;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-blank-pages-title"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[1px] overflow-y-auto animate-backdrop-fade"
    >
      <div
        className="relative w-full max-w-md my-auto bg-white rounded-2xl shadow-2xl border border-outline-variant/60 max-h-[85vh] flex flex-col overflow-hidden animate-view-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-outline-variant/40 flex items-center justify-between bg-[#F8FAF8]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
              <FileText size={18} weight="duotone" />
            </div>
            <div className="min-w-0">
              <h3
                id="review-blank-pages-title"
                className="text-[15px] font-bold text-on-surface leading-tight"
              >
                Review Blank Pages
              </h3>
              <p className="text-[11.5px] text-on-surface-variant leading-tight truncate">
                Select pages to exclude before printing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            aria-label="Close review dialog"
            className="w-9 h-9 rounded-lg hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant transition-colors"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-4 py-2.5 bg-[#F1F6F2] border-b border-outline-variant/30 flex items-center justify-between text-[12px]">
          <span className="text-on-surface-variant font-medium tabular-nums">
            {selectedIndices.length} of {detectedItems.length} selected
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onSelectAll(!allSelected);
            }}
            className="text-[#194F34] font-bold hover:underline min-h-[32px] px-1"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {detectedItems.map((item, idx) => {
            const isSelected = selectedIndices.includes(idx);
            const isReviewNeeded = item.confidence === 'needs_review';

            return (
              <div
                key={`${item.documentId}-p${item.pageNumber}-${idx}`}
                className={`rounded-xl p-3 border transition-all ${
                  isSelected
                    ? 'bg-[#F2F8F4] border-[#194F34]/30'
                    : 'bg-white border-outline-variant/45 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      onToggleIndex(idx);
                    }}
                    className="flex items-start gap-2.5 flex-1 text-left min-w-0"
                  >
                    <div className="mt-0.5 text-[#194F34] shrink-0">
                      {isSelected ? (
                        <CheckSquare size={20} weight="fill" />
                      ) : (
                        <Square size={20} weight="regular" className="text-outline" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-bold text-on-surface tabular-nums">
                          Page {item.pageNumber}
                        </span>
                        <span className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1">
                          {isReviewNeeded && (
                            <Warning size={12} weight="fill" className="text-amber-700" />
                          )}
                          {isReviewNeeded ? 'Low ink · Review' : 'Empty page'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-on-surface-variant truncate mt-0.5">
                        <span className="truncate">{item.documentName}</span>
                      </div>

                      <p className="text-[10.5px] text-on-surface-variant/85 leading-tight mt-1">
                        {item.reason}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    title="View page in preview"
                    onClick={() => {
                      triggerHaptic('selection');
                      onJumpToPage(item.documentId, item.pageNumber);
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white border border-outline-variant/60 hover:border-[#194F34] text-[#194F34] text-[11.5px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                  >
                    <Eye size={13} weight="bold" />
                    <span>View</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3.5 border-t border-outline-variant/40 bg-[#F8FAF8] grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            className="min-h-[44px] rounded-xl border border-outline-variant/70 bg-white text-on-surface text-[12.5px] font-semibold hover:bg-surface-container-low active:scale-[0.98] transition-all"
          >
            Keep All
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('buttonPress');
              onProceedToRemove();
            }}
            disabled={selectedIndices.length === 0}
            className="min-h-[44px] rounded-xl bg-[#194F34] text-white text-[12.5px] font-bold hover:bg-[#143E29] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 tabular-nums"
          >
            <Trash size={14} weight="bold" />
            <span>Remove ({selectedIndices.length})</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
