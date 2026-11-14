import React from 'react';
import {
  MagnifyingGlass,
  CheckCircle,
  Warning,
  ArrowCounterClockwise,
  CaretRight,
  Trash,
} from '@phosphor-icons/react';
import { BlankPageItem } from '../types/kiosk';
import { triggerHaptic } from '../utils/haptics';

interface BlankPageDetectionSectionProps {
  isAnalyzing: boolean;
  hasScanned: boolean;
  analysisProgress?: { current: number; total: number };
  detectedItems: BlankPageItem[];
  removedItems: BlankPageItem[];
  onReviewPages: () => void;
  onRequestRemoval: () => void;
  onRestoreOriginal: () => void;
}

export const BlankPageDetectionSection: React.FC<
  BlankPageDetectionSectionProps
> = ({
  isAnalyzing,
  hasScanned,
  analysisProgress,
  detectedItems,
  removedItems,
  onReviewPages,
  onRequestRemoval,
  onRestoreOriginal,
}) => {
  const blankCount = detectedItems.length;
  const removedCount = removedItems.length;

  const affectedDocsMap = detectedItems.reduce<Record<string, number[]>>(
    (acc, item) => {
      if (!acc[item.documentName]) {
        acc[item.documentName] = [];
      }
      if (!acc[item.documentName].includes(item.pageNumber)) {
        acc[item.documentName].push(item.pageNumber);
      }
      return acc;
    },
    {}
  );

  const affectedDocEntries = Object.entries(affectedDocsMap);
  const hasUncertainPages = detectedItems.some(
    (item) => item.confidence === 'needs_review'
  );

  return (
    <div
      data-testid="blank-page-detection-section"
      className="animate-view-enter transition-all"
    >
      {isAnalyzing && (
        <div className="w-full p-3 rounded-2xl bg-[#F2F7F4] border border-[#194F34]/15 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-[#194F34]/10 text-[#194F34] flex items-center justify-center shrink-0">
            <MagnifyingGlass size={14} weight="bold" />
          </div>
          <div className="min-w-0 flex-1 flex items-center justify-between text-[12px] font-semibold text-on-surface">
            <span>Scanning for blank pages...</span>
            {analysisProgress && analysisProgress.total > 0 && (
              <span className="text-[11px] font-bold text-[#194F34] tabular-nums">
                {analysisProgress.current}/{analysisProgress.total}
              </span>
            )}
          </div>
        </div>
      )}

      {!isAnalyzing && blankCount > 0 && (
        <div className="w-full p-3.5 rounded-2xl bg-[#F2F7F4] border border-[#194F34]/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#194F34]/10 text-[#194F34] flex items-center justify-center shrink-0">
                <MagnifyingGlass size={15} weight="bold" />
              </div>
              <h3 className="text-[13px] font-bold text-on-surface leading-tight truncate">
                Blank Pages Found
              </h3>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasUncertainPages && (
                <span className="text-[10.5px] font-semibold text-amber-800 flex items-center gap-1">
                  <Warning size={13} weight="fill" />
                  Needs review
                </span>
              )}
              <span
                data-testid="blank-pages-count-badge"
                className="text-[11px] font-bold text-[#194F34] tabular-nums"
              >
                {blankCount} {blankCount === 1 ? 'page' : 'pages'}
              </span>
            </div>
          </div>

          <p className="text-[11.5px] text-on-surface-variant leading-snug mt-1.5">
            Exclude empty pages to avoid unnecessary print charges.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {affectedDocEntries.map(([docName, pages]) => (
              <div
                key={docName}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#194F34]/15 text-[11px] text-on-surface font-medium max-w-full"
              >
                <span className="font-semibold truncate max-w-[190px]">
                  {docName}
                </span>
                <span className="text-outline">·</span>
                <span className="text-[#194F34] font-bold shrink-0 tabular-nums">
                  {pages.length === 1
                    ? `Page ${pages[0]}`
                    : `Pages ${pages.join(', ')}`}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="review-blank-pages-btn"
              onClick={() => {
                triggerHaptic('selection');
                onReviewPages();
              }}
              className="min-h-[40px] px-3 rounded-xl border border-[#194F34]/20 bg-white hover:bg-[#F8FAF8] text-[#194F34] text-[12px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
            >
              <span>Review</span>
              <CaretRight size={13} weight="bold" />
            </button>

            <button
              type="button"
              data-testid="remove-blank-pages-btn"
              onClick={() => {
                triggerHaptic('buttonPress');
                onRequestRemoval();
              }}
              className="min-h-[40px] px-3 rounded-xl bg-[#194F34] hover:bg-[#143E29] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <Trash size={13} weight="bold" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}

      {!isAnalyzing && blankCount === 0 && removedCount > 0 && (
        <div className="w-full p-3 rounded-2xl bg-[#F2F7F4] border border-[#194F34]/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle size={18} weight="fill" className="text-[#194F34] shrink-0" />
            <span className="text-[12px] font-bold text-[#143B21] truncate tabular-nums">
              {removedCount} {removedCount === 1 ? 'blank page' : 'blank pages'} excluded
            </span>
          </div>

          <button
            type="button"
            data-testid="restore-original-pages-btn"
            onClick={() => {
              triggerHaptic('selection');
              onRestoreOriginal();
            }}
            className="min-h-[36px] px-2.5 rounded-lg bg-white border border-[#194F34]/20 hover:bg-[#F8FAF8] text-[#194F34] text-[11px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all"
          >
            <ArrowCounterClockwise size={12} weight="bold" />
            <span>Restore</span>
          </button>
        </div>
      )}

      {!isAnalyzing && hasScanned && blankCount === 0 && removedCount === 0 && (
        <div
          data-testid="no-blank-pages-confirmed"
          className="w-full px-3 py-2.5 rounded-2xl bg-[#F2F7F4] border border-[#194F34]/15 flex items-center gap-2"
        >
          <CheckCircle size={17} weight="fill" className="text-[#194F34] shrink-0" />
          <span className="text-[12px] font-semibold text-on-surface">
            No blank pages detected
          </span>
        </div>
      )}
    </div>
  );
};
