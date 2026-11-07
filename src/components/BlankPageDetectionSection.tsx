import React from 'react';
import {
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  Trash2,
} from 'lucide-react';
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

  // Group detected items by document for clear, compact display
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
      className="animate-apple-card transition-all"
    >
      {/* 1. Active Scanning State */}
      {isAnalyzing && (
        <div className="w-full p-2.5 rounded-[16px] bg-[#F2F7F4] border border-[#1B4D2E]/15 flex items-center gap-2.5 shadow-2xs">
          <div className="w-5 h-5 rounded-md bg-[#1B4D2E]/10 text-[#1B4D2E] flex items-center justify-center shrink-0">
            <FileSearch className="w-3 h-3 animate-pulse text-[#1B4D2E]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-[#141A16]">
              <span>Checking for blank pages...</span>
              {analysisProgress && analysisProgress.total > 0 && (
                <span className="text-[10px] font-bold text-[#1B4D2E] tabular-nums">
                  {analysisProgress.current}/{analysisProgress.total}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Blank Pages Detected State (Compact Notification-Style Section) */}
      {!isAnalyzing && blankCount > 0 && (
        <div className="w-full p-3.5 rounded-[18px] bg-[#F2F7F4] border border-[#1B4D2E]/20 shadow-2xs">
          {/* Top Row: Icon, Heading, Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-[#1B4D2E]/10 text-[#1B4D2E] flex items-center justify-center shrink-0">
                <FileSearch className="w-3.5 h-3.5 stroke-[2.2]" />
              </div>
              <h3 className="text-[13px] font-bold text-[#141A16] leading-tight truncate">
                Blank Pages Detected
              </h3>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {hasUncertainPages && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Review
                </span>
              )}
              <span
                data-testid="blank-pages-count-badge"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1B4D2E] text-white tabular-nums shadow-2xs"
              >
                {blankCount} {blankCount === 1 ? 'page' : 'pages'}
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-[11.5px] text-[#475249] leading-snug mt-1.5">
            {blankCount === 1
              ? '1 blank page found across your documents.'
              : `${blankCount} blank pages found across your documents.`}
          </p>

          {/* Affected Document: Compact inline element */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {affectedDocEntries.map(([docName, pages]) => (
              <div
                key={docName}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 border border-[#1B4D2E]/15 text-[11px] text-[#203024] font-medium shadow-2xs max-w-full"
              >
                <span className="font-semibold truncate max-w-[190px] xs:max-w-[220px]">
                  {docName}
                </span>
                <span className="text-[#8B968E]">·</span>
                <span className="text-[#1B4D2E] font-bold shrink-0">
                  {pages.length === 1
                    ? `Page ${pages[0]}`
                    : `Pages ${pages.join(', ')}`}
                </span>
              </div>
            ))}
          </div>

          {/* Action Row: Horizontal compact buttons */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-testid="review-blank-pages-btn"
              onClick={() => {
                triggerHaptic('selection');
                onReviewPages();
              }}
              className="flex-1 h-8 px-3 rounded-xl border border-[#1B4D2E]/20 bg-white hover:bg-[#F8FAF8] text-[#1B4D2E] text-[11.5px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-[0.98] shadow-2xs"
            >
              <span>Review</span>
              <ChevronRight className="w-3 h-3 text-[#1B4D2E]/70" />
            </button>

            <button
              type="button"
              data-testid="remove-blank-pages-btn"
              onClick={() => {
                triggerHaptic('buttonPress');
                onRequestRemoval();
              }}
              className="flex-1 h-8 px-3.5 rounded-xl bg-[#1B4D2E] hover:bg-[#153D24] text-white text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-2xs"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Removed Blank Pages Confirmation State */}
      {!isAnalyzing && blankCount === 0 && removedCount > 0 && (
        <div className="w-full p-2.5 rounded-[16px] bg-[#F2F7F4] border border-[#1B4D2E]/20 flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-full bg-[#1B4D2E] text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <span className="text-[11.5px] font-bold text-[#143B21] truncate block">
                {removedCount} {removedCount === 1 ? 'blank page' : 'blank pages'} removed from print
              </span>
            </div>
          </div>

          <button
            type="button"
            data-testid="restore-original-pages-btn"
            onClick={() => {
              triggerHaptic('selection');
              onRestoreOriginal();
            }}
            className="h-7 px-2.5 rounded-lg bg-white border border-[#1B4D2E]/20 hover:bg-[#F8FAF8] text-[#1B4D2E] text-[10.5px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Restore</span>
          </button>
        </div>
      )}

      {/* 4. No Blank Pages Found State (Compact Notification) */}
      {!isAnalyzing && hasScanned && blankCount === 0 && removedCount === 0 && (
        <div
          data-testid="no-blank-pages-confirmed"
          className="w-full px-3 py-2 rounded-[16px] bg-[#F2F7F4] border border-[#1B4D2E]/15 flex items-center gap-2 shadow-2xs"
        >
          <div className="w-5 h-5 rounded-full bg-[#1B4D2E]/10 text-[#1B4D2E] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <span className="text-[12px] font-bold text-[#191C1A]">
            No blank pages detected
          </span>
        </div>
      )}
    </div>
  );
};
