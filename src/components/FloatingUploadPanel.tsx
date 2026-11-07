import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { FolderIllustration } from './FileTypeIcon';
import { OverallUploadMetrics } from '../utils/kioskLogic';

interface FloatingUploadPanelProps {
  uploadMetrics: OverallUploadMetrics;
  isAnyProcessing: boolean;
  canContinue: boolean;
  totalReadyPages: number;
}

export const FloatingUploadPanel: React.FC<FloatingUploadPanelProps> = ({
  uploadMetrics,
  isAnyProcessing,
  canContinue,
  totalReadyPages,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      role="region"
      aria-label="Upload Activity Indicator"
      data-testid="floating-upload-panel"
      data-panel-state={canContinue ? 'ready' : 'uploading'}
      className="mt-3 rounded-2xl bg-white/95 backdrop-blur-md border border-[#1B4D2E]/15 shadow-[0_6px_20px_rgba(25,28,26,0.06)] px-3.5 py-2.5 flex flex-col gap-2 transition-all duration-300 animate-panel-slide-up"
    >
      {/* Top Row: Small Animated Folder / Success Icon + Label + Percentage + Expand Toggle */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {canContinue ? (
            <div className="w-8 h-8 rounded-xl bg-[#EAF4EE] border border-[#1B4D2E]/20 text-[#1B4D2E] flex items-center justify-center shrink-0 animate-check-pop">
              <Check className="w-4 h-4 stroke-[2.75]" aria-hidden="true" />
            </div>
          ) : (
            <div className="shrink-0 scale-90 origin-left">
              <FolderIllustration />
            </div>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[12.5px] font-semibold text-[#191C1A] truncate leading-tight">
              {canContinue
                ? 'Your documents are ready'
                : 'Uploading documents...'}
            </span>
            <span className="text-[11px] text-[#5C665E] truncate tabular-nums mt-0.5">
              {canContinue
                ? `${uploadMetrics.completedCount} of ${uploadMetrics.totalCount} ${
                    uploadMetrics.totalCount === 1 ? 'document' : 'documents'
                  } · ${totalReadyPages} ${
                    totalReadyPages === 1 ? 'page' : 'pages'
                  }`
                : `${uploadMetrics.completedCount} of ${uploadMetrics.totalCount} ${
                    uploadMetrics.totalCount === 1 ? 'document' : 'documents'
                  } uploaded`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[12.5px] font-bold text-[#1B4D2E] tabular-nums">
            {uploadMetrics.overallPercent}%
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? 'Collapse upload activity details'
                : 'Expand upload activity details'
            }
            className="w-7 h-7 rounded-lg text-[#5C665E] hover:text-[#191C1A] hover:bg-[#F2F6F3] flex items-center justify-center transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Slim Progress Bar */}
      <div className="w-full h-1 rounded-full bg-[#E5ECE7] overflow-hidden relative">
        <div
          className="h-full rounded-full bg-[#1B4D2E] transition-[width] duration-200 ease-out relative overflow-hidden"
          style={{ width: `${Math.max(4, uploadMetrics.overallPercent)}%` }}
        >
          {isAnyProcessing && (
            <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress-shimmer" />
          )}
        </div>
      </div>

      {/* Optional Expanded Activity Detail */}
      {isExpanded && (
        <div className="pt-1.5 border-t border-[#EAEFEA] flex items-center justify-between text-[11px] text-[#545D56] animate-apple-card">
          <span className="truncate">
            {canContinue
              ? 'All files verified & formatted for Kiosk #04'
              : uploadMetrics.activeDocumentName
              ? `Active: ${uploadMetrics.activeDocumentName}`
              : 'Preparing upload stream...'}
          </span>
          <span className="font-semibold text-[#1B4D2E] shrink-0 ml-2 tabular-nums">
            {canContinue ? 'Ready to print' : uploadMetrics.headlineStatus}
          </span>
        </div>
      )}
    </div>
  );
};
