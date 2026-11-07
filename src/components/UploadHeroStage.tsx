import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  detectFileFormatKind,
  getFileTypeShortLabel,
  OverallUploadMetrics,
} from '../utils/kioskLogic';

interface UploadHeroStageProps {
  documents: UploadedPrintDocument[];
  uploadMetrics: OverallUploadMetrics;
  isAnyProcessing: boolean;
  canContinue: boolean;
  totalReadyPages: number;
}

export const UploadHeroStage: React.FC<UploadHeroStageProps> = ({
  documents,
  uploadMetrics,
  isAnyProcessing,
  canContinue,
  totalReadyPages,
}) => {
  // Track folder-closing to Google Pay checkmark transition when all documents finish
  const [stagePhase, setStagePhase] = useState<'uploading' | 'closing' | 'ready'>(
    canContinue ? 'ready' : 'uploading'
  );

  useEffect(() => {
    if (isAnyProcessing) {
      setStagePhase('uploading');
      return;
    }
    if (canContinue) {
      setStagePhase((prev) => {
        if (prev === 'ready') return 'ready';
        return 'closing';
      });
      const timer = window.setTimeout(() => {
        setStagePhase('ready');
      }, 220);
      return () => window.clearTimeout(timer);
    }
  }, [isAnyProcessing, canContinue]);

  // Actual selected files used for the entering document icons (no random decorative items)
  const visibleEnteringDocs = documents.slice(0, 5);

  const getBadgeStyle = (fileName: string) => {
    const kind = detectFileFormatKind(fileName);
    switch (kind) {
      case 'pdf':
        return { bg: '#FDF3F2', border: '#F2D0CC', text: '#B43426' };
      case 'word':
        return { bg: '#F2F6FC', border: '#CEDFF4', text: '#245696' };
      case 'excel':
        return { bg: '#F0F7F3', border: '#C6E2D1', text: '#1C643F' };
      case 'presentation':
        return { bg: '#FDF6EF', border: '#F0D5BC', text: '#B85418' };
      default:
        return { bg: '#F3F6F3', border: '#CFE0D4', text: '#1B4D2E' };
    }
  };

  // 1. UPLOADING / PROCESSING STAGE (or brief closing transition)
  if (isAnyProcessing || stagePhase === 'closing') {
    return (
      <section
        aria-label="Document Upload Animation and Progress"
        data-testid="upload-hero-stage"
        data-stage="uploading"
        className="mb-3 rounded-3xl bg-white border border-black/[0.06] shadow-[0_2px_10px_rgba(25,28,26,0.03)] p-4 flex flex-col items-center text-center animate-folder-stage-appear"
      >
        {/* Centered 2D Folder Illustration with Actual Selected Documents Entering */}
        <div
          className={`relative w-28 h-24 flex items-center justify-center mb-2 select-none ${
            stagePhase === 'closing' ? 'animate-folder-close-away' : ''
          }`}
          aria-hidden="true"
        >
          {/* Soft Brand-Coloured Highlight Glow */}
          <div className="absolute w-20 h-20 rounded-full bg-[#1B4D2E]/[0.08] blur-md animate-folder-halo" />

          {/* Sequential Selected Document Icons Entering the Open Folder */}
          <div className="absolute inset-x-0 top-0 h-14 flex items-center justify-center pointer-events-none z-10">
            {visibleEnteringDocs.map((doc, idx) => {
              const badge = getBadgeStyle(doc.name);
              const shortLabel = getFileTypeShortLabel(doc.name);
              const horizontalOffset =
                visibleEnteringDocs.length === 1
                  ? 0
                  : (idx - (visibleEnteringDocs.length - 1) / 2) * 10;

              return (
                <div
                  key={doc.id}
                  style={{
                    left: `calc(50% - 15px + ${horizontalOffset}px)`,
                    animationDelay: `${idx * 240}ms`,
                  }}
                  className="absolute top-1 w-[30px] h-[36px] rounded-md bg-white border shadow-2xs flex flex-col items-center justify-between p-1 animate-doc-enter-folder"
                >
                  <div className="w-full flex flex-col gap-0.5 mt-0.5">
                    <span className="w-3/4 h-[1.5px] rounded-full bg-[#1B4D2E]/35" />
                    <span className="w-full h-[1.5px] rounded-full bg-[#1B4D2E]/20" />
                  </div>
                  <span
                    style={{
                      backgroundColor: badge.bg,
                      borderColor: badge.border,
                      color: badge.text,
                    }}
                    className="w-full text-[6.5px] font-bold tracking-wider uppercase rounded-[3px] border py-[1px] leading-none text-center"
                  >
                    {shortLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 2D Animated Folder SVG */}
          <svg
            className="w-20 h-20 relative z-20 overflow-visible mt-3"
            viewBox="0 0 80 72"
            fill="none"
          >
            {/* Folder Back Plate & Tab */}
            <path
              d="M10 18C10 14.6863 12.6863 12 16 12H30.5C32.3 12 34 12.8 35.1 14.2L38.8 18.8H64C67.3137 18.8 70 21.4863 70 24.8V54C70 57.3137 67.3137 60 64 60H16C12.6863 60 10 57.3137 10 54V18Z"
              fill="#DCECE1"
              stroke="#1B4D2E"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />

            {/* Folder Inner Opening Rim / Lid */}
            <path
              d="M12 25C12 22.7909 13.7909 21 16 21H64C66.2091 21 68 22.7909 68 25V31H12V25Z"
              fill="#B9DFC5"
              stroke="#1B4D2E"
              strokeWidth="1.8"
              className="animate-folder-lid-open"
            />

            {/* Folder Front Pocket Reacting as Documents Enter */}
            <path
              d="M8.5 31.5C8.5 28.7386 10.7386 26.5 13.5 26.5H66.5C69.2614 26.5 71.5 28.7386 71.5 31.5L69.5 54.5C69.2 57.6 66.6 60 63.5 60H16.5C13.4 60 10.8 57.6 10.5 54.5L8.5 31.5Z"
              fill="#FFFFFF"
              stroke="#1B4D2E"
              strokeWidth="2.2"
              strokeLinejoin="round"
              className="animate-folder-pocket-open"
            />

            {/* Subtle Brand Green Emblem Bar on Front Pocket */}
            <rect
              x="31"
              y="41.5"
              width="18"
              height="3"
              rx="1.5"
              fill="#1B4D2E"
              fillOpacity="0.22"
            />
          </svg>
        </div>

        {/* Heading & Supporting Text */}
        <h1 className="text-[19px] font-bold text-[#191C1A] tracking-[-0.015em] leading-snug">
          Uploading your documents
        </h1>
        <p className="text-[12.5px] text-[#545D56] leading-snug mt-0.5 max-w-[290px]">
          Please wait while we prepare your files for printing.
        </p>

        {/* Real-Time Progress Metrics & Slim Rounded Brand Progress Bar */}
        <div
          data-testid="upload-progress-card"
          data-upload-state={uploadMetrics.overallState}
          className="w-full mt-3.5 pt-3 border-t border-[#EAEFEA] flex flex-col gap-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              data-testid="overall-upload-percent"
              className="text-[15px] font-bold text-[#1B4D2E] tracking-tight tabular-nums"
            >
              {uploadMetrics.overallPercent}% uploaded
            </span>
            <span
              data-testid="upload-summary-subtitle"
              className="text-[12px] font-medium text-[#545D56] tabular-nums"
            >
              {uploadMetrics.completedCount} of {uploadMetrics.totalCount}{' '}
              {uploadMetrics.totalCount === 1 ? 'document' : 'documents'} uploaded
            </span>
          </div>

          {/* Slim Rounded Progress Track */}
          <div
            role="progressbar"
            aria-valuenow={uploadMetrics.overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall document upload progress"
            className="w-full h-1.5 rounded-full bg-[#E5ECE7] overflow-hidden relative"
          >
            <div
              className="h-full rounded-full bg-[#1B4D2E] transition-[width] duration-200 ease-out relative overflow-hidden"
              style={{
                width: `${Math.max(4, uploadMetrics.overallPercent)}%`,
              }}
            >
              <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress-shimmer" />
            </div>
          </div>

          {/* Current Document Name & Current Upload Status */}
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#545D56] pt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 className="w-3.5 h-3.5 text-[#1B4D2E] animate-spin shrink-0" />
              <span
                data-testid="active-upload-filename"
                className="font-medium text-[#2F3731] truncate"
              >
                {uploadMetrics.activeDocumentName || 'Preparing files...'}
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#1B4D2E] shrink-0">
              {uploadMetrics.overallState === 'Processing'
                ? 'Preparing document...'
                : 'Uploading...'}
            </span>
          </div>
        </div>
      </section>
    );
  }

  // 2. FAILED STATE (When at least one document failed and none are currently uploading)
  if (!canContinue && uploadMetrics.failedCount > 0) {
    return (
      <section
        aria-label="Document Upload Attention Needed"
        data-testid="upload-hero-stage"
        data-stage="failed"
        className="mb-3 rounded-3xl bg-white border border-error/25 p-4 flex flex-col items-center text-center animate-apple-reveal"
      >
        <div className="w-12 h-12 rounded-full bg-error-container/70 text-error flex items-center justify-center mb-2">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-[18px] font-bold text-[#191C1A] tracking-tight">
          Some documents need attention
        </h1>
        <p className="text-[12.5px] text-[#545D56] mt-0.5">
          Please retry or remove the failed file below to continue.
        </p>
      </section>
    );
  }

  // 3. GOOGLE PAY-STYLE SUCCESS ANIMATION & ALL DOCUMENTS READY STATE
  return (
    <section
      aria-label="All Documents Ready"
      data-testid="upload-hero-stage"
      data-stage="ready"
      className="mb-3 rounded-3xl bg-white border border-black/[0.06] shadow-[0_2px_10px_rgba(25,28,26,0.03)] px-4 py-3.5 flex flex-col items-center text-center animate-apple-reveal"
    >
      {/* Google Pay-Style Animated Green Success Circle + Ripple + Stroke-Drawn Checkmark */}
      <div className="relative w-14 h-14 flex items-center justify-center mb-2 select-none">
        {/* Expanding Subtle Success Ripple */}
        <span
          className="absolute inset-0 rounded-full bg-[#1B4D2E]/20 animate-gpay-ripple pointer-events-none"
          aria-hidden="true"
        />
        <span
          className="absolute -inset-1.5 rounded-full bg-[#EAF4EE] border border-[#1B4D2E]/10 pointer-events-none"
          aria-hidden="true"
        />

        {/* Green Circular Success Indicator */}
        <div
          data-testid="gpay-success-circle"
          className="relative z-10 w-12 h-12 rounded-full bg-[#1B4D2E] shadow-[0_6px_16px_rgba(27,77,46,0.22)] flex items-center justify-center animate-gpay-circle"
        >
          <svg
            className="w-6 h-6 text-white overflow-visible"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5.5 12.5L10 17L18.5 7.5"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-gpay-check"
            />
          </svg>
        </div>
      </div>

      {/* Success Heading & Supporting Text */}
      <h1 className="text-[19px] font-bold text-[#191C1A] tracking-[-0.015em] leading-tight">
        All documents ready!
      </h1>
      <p className="text-[12.5px] text-[#545D56] leading-snug mt-0.5">
        Your files are ready to print.
      </p>

      {/* Total Documents & Actual Total Pages Summary */}
      <div
        data-testid="upload-progress-card"
        data-upload-state="Completed"
        className="mt-2.5 pt-2.5 border-t border-[#EAEFEA] w-full flex items-center justify-between gap-2 text-[12px]"
      >
        <span
          data-testid="overall-upload-percent"
          className="font-semibold text-[#1B4D2E] tabular-nums"
        >
          {uploadMetrics.completedCount}{' '}
          {uploadMetrics.completedCount === 1 ? 'document' : 'documents'} ready
        </span>
        <span className="text-[#9FA8A1]" aria-hidden="true">
          ·
        </span>
        <span
          data-testid="upload-summary-subtitle"
          className="font-semibold text-[#191C1A] tabular-nums"
        >
          {totalReadyPages} {totalReadyPages === 1 ? 'page' : 'pages'} total
        </span>
      </div>
    </section>
  );
};
