import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  CheckSquare,
  Square,
  AlertTriangle,
  FileText,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { BlankPageItem } from '../types/kiosk';
import { triggerHaptic } from '../utils/haptics';

interface ReviewBlankPagesModalProps {
  isOpen: boolean;
  detectedItems: BlankPageItem[];
  selectedIndices: number[]; // indices in detectedItems selected for removal
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
    detectedItems.length > 0 &&
    selectedIndices.length === detectedItems.length;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-blank-pages-title"
      onClick={onClose}
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
        className="relative w-full max-w-md my-auto bg-white rounded-3xl shadow-2xl border border-black/[0.08] max-h-[85vh] flex flex-col overflow-hidden animate-apple-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-black/[0.06] flex items-center justify-between bg-[#F8FAF9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3
                id="review-blank-pages-title"
                className="text-[15px] font-bold text-[#141A16] leading-tight"
              >
                Review Blank Pages
              </h3>
              <p className="text-[11.5px] text-[#5A645D] leading-tight">
                Inspect pages and exclude any you wish to keep in print
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
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-[#556058] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick select toolbar */}
        <div className="px-4 py-2 bg-[#F1F6F2] border-b border-black/[0.04] flex items-center justify-between text-[11.5px]">
          <span className="text-[#455047] font-medium">
            {selectedIndices.length} of {detectedItems.length} selected for removal
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onSelectAll(!allSelected);
            }}
            className="text-[#1B4D2E] font-bold hover:underline"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* List of detected pages */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-black/[0.04]">
          {detectedItems.map((item, idx) => {
            const isSelected = selectedIndices.includes(idx);
            const isReviewNeeded = item.confidence === 'needs_review';

            return (
              <div
                key={`${item.documentId}-p${item.pageNumber}-${idx}`}
                className={`pt-2.5 first:pt-0 rounded-xl p-2.5 transition-all ${
                  isSelected
                    ? 'bg-[#F2F8F4] border border-[#1B4D2E]/20'
                    : 'bg-white border border-black/[0.06] opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Selection Checkbox */}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      onToggleIndex(idx);
                    }}
                    className="flex items-start gap-2.5 flex-1 text-left min-w-0"
                  >
                    <div className="mt-0.5 text-[#1B4D2E] shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 fill-[#1B4D2E] text-white" />
                      ) : (
                        <Square className="w-5 h-5 text-black/30" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-bold text-[#141A16]">
                          Page {item.pageNumber}
                        </span>
                        {isReviewNeeded ? (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Needs Review
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#EAF3EC] text-[#1B4D2E]">
                            Empty Page
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-[#556058] truncate mt-0.5">
                        <FileText className="w-3 h-3 text-[#1B4D2E]/60 shrink-0" />
                        <span className="truncate">{item.documentName}</span>
                      </div>

                      <p className="text-[10.5px] text-[#717E75] leading-tight mt-1">
                        {item.reason}
                      </p>
                    </div>
                  </button>

                  {/* Jump to Page in Preview Button */}
                  <button
                    type="button"
                    title="Jump to this page in preview"
                    onClick={() => {
                      triggerHaptic('selection');
                      onJumpToPage(item.documentId, item.pageNumber);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-black/10 hover:border-[#1B4D2E] text-[#1B4D2E] text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-2xs active:scale-95 transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="p-3.5 border-t border-black/[0.06] bg-[#F8FAF9] grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            className="h-10 rounded-xl border border-black/15 bg-white text-[#333D36] text-[12.5px] font-semibold hover:bg-neutral-50 active:scale-[0.98] transition-all flex items-center justify-center shadow-2xs"
          >
            Keep All Pages
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('buttonPress');
              onProceedToRemove();
            }}
            disabled={selectedIndices.length === 0}
            className="h-10 rounded-xl bg-[#1B4D2E] text-white text-[12.5px] font-bold hover:bg-[#153D24] shadow-[0_2px_8px_rgba(27,77,46,0.22)] active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove ({selectedIndices.length})</span>
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
