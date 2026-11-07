import React from 'react';
import {
  Check,
  AlertCircle,
  Loader2,
  RotateCcw,
  X,
  Clock,
} from 'lucide-react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  computeOverallUploadMetrics,
  formatFileSize,
  getDocumentVisualState,
} from '../utils/kioskLogic';
import { FileTypeIcon } from './FileTypeIcon';

interface LoadingStepProps {
  documents: UploadedPrintDocument[];
  onRetryDocument: (docId: string) => void;
  onRemoveDocument: (docId: string) => void;
}

export const LoadingStep: React.FC<LoadingStepProps> = ({
  documents,
  onRetryDocument,
  onRemoveDocument,
}) => {
  const metrics = computeOverallUploadMetrics(documents);
  const {
    totalCount,
    completedCount,
    overallPercent,
    overallState,
    activeDocumentName,
  } = metrics;

  const isAnyProcessing = documents.some(
    (d) =>
      d.status === 'Waiting' ||
      d.status === 'Uploading...' ||
      d.status === 'Processing document...' ||
      d.status === 'Preparing preview...'
  );

  return (
    <div
      className="flex flex-col flex-1 w-full animate-apple-reveal pb-24"
      aria-live="polite"
    >
      {/* Heading & Supporting Text */}
      <section className="mt-1 mb-4">
        <h1 className="text-[22px] font-bold text-[#191C1A] tracking-[-0.015em] leading-snug">
          Getting your documents ready
        </h1>
        <p className="text-[13.5px] text-[#545D56] leading-relaxed mt-0.5">
          We&apos;re preparing your files for a smooth printing experience.
        </p>

        {/* Prominent Overall Progress Indicator */}
        <div
          data-testid="upload-progress-card"
          data-upload-state={overallState}
          className="mt-3.5 p-4 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-2.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              data-testid="overall-upload-percent"
              className="text-[17px] font-bold text-[#191C1A] tracking-tight tabular-nums"
            >
              {overallPercent}% complete
            </span>
            <span
              data-testid="overall-upload-count"
              className="text-[12.5px] font-medium text-[#545D56] tabular-nums"
            >
              {completedCount} of {totalCount}{' '}
              {totalCount === 1 ? 'document' : 'documents'} ready
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall document upload progress"
            className="w-full h-1.5 rounded-full bg-[#E6ECE8] overflow-hidden relative"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-out relative overflow-hidden ${
                overallState === 'Failed' ? 'bg-error' : 'bg-[#1B4D2E]'
              }`}
              style={{
                width: `${Math.max(
                  overallState === 'Waiting' ? 3 : 0,
                  overallPercent
                )}%`,
              }}
            >
              {isAnyProcessing && (
                <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-progress-shimmer" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[12px] text-[#545D56]">
            {isAnyProcessing ? (
              <Loader2 className="w-3.5 h-3.5 text-[#1B4D2E] animate-spin shrink-0" />
            ) : overallState === 'Failed' ? (
              <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center shrink-0 animate-check-pop">
                <Check className="w-2.5 h-2.5 stroke-[2.75]" />
              </span>
            )}
            <span
              data-testid="active-upload-filename"
              className="truncate font-medium text-[#3F4841]"
            >
              {activeDocumentName
                ? `${overallState === 'Processing' ? 'Processing' : 'Uploading'} ${activeDocumentName}`
                : 'Preparing files...'}
            </span>
          </div>
        </div>
      </section>

      {/* Apple Files-Inspired Compact Document List */}
      <section aria-label="Document Processing Queue" className="flex flex-col gap-2">
        <div className="w-full rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-[#EAEFEA] overflow-hidden">
          {documents.map((doc) => {
            const visualState = getDocumentVisualState(doc.status);
            const isReady = visualState === 'Completed';
            const isFailed = visualState === 'Failed';
            const isWaiting = visualState === 'Waiting';
            const isUploading = visualState === 'Uploading';
            const isProcessing = visualState === 'Processing';
            const showPageCount = isReady || doc.progressPercent >= 80;

            const statusLabel = (() => {
              if (isReady) return 'Ready';
              if (isFailed) return doc.errorMessage || 'Failed';
              if (isWaiting) return 'Waiting';
              if (isProcessing) return 'Processing';
              return `Uploading · ${doc.progressPercent}%`;
            })();

            return (
              <div
                key={doc.id}
                data-file-state={visualState}
                className="px-3.5 py-2.5 flex flex-col justify-center animate-apple-card"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileTypeIcon fileName={doc.name} size="sm" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13.5px] font-semibold text-[#191C1A] truncate leading-snug">
                        {doc.name}
                      </span>
                      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11.5px] text-[#646D66] mt-0.5 leading-tight tabular-nums">
                        <span>{formatFileSize(doc.sizeBytes)}</span>
                        {showPageCount && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {doc.pageCount}{' '}
                              {doc.pageCount === 1 ? 'page' : 'pages'}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            isReady || isUploading || isProcessing
                              ? 'font-medium text-[#1B4D2E]'
                              : isFailed
                              ? 'font-medium text-error'
                              : 'text-[#717971]'
                          }
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isReady && (
                      <span
                        className="w-5 h-5 rounded-full bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center animate-check-pop mr-0.5"
                        aria-label="Completed"
                      >
                        <Check className="w-3 h-3 stroke-[2.75]" />
                      </span>
                    )}
                    {(isUploading || isProcessing) && (
                      <Loader2 className="w-3.5 h-3.5 text-[#1B4D2E] animate-spin mr-1" />
                    )}
                    {isWaiting && (
                      <Clock className="w-3.5 h-3.5 text-[#858E87] mr-1" />
                    )}
                    {isFailed && (
                      <button
                        type="button"
                        onClick={() => onRetryDocument(doc.id)}
                        aria-label={`Retry ${doc.name}`}
                        className="h-7 px-2 rounded-lg bg-[#FFF2F0] border border-error/25 text-error text-[11px] font-semibold flex items-center gap-1 mr-0.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveDocument(doc.id)}
                      aria-label={`Remove ${doc.name}`}
                      className="w-8 h-8 rounded-lg text-[#7A837C] hover:text-error hover:bg-error-container/25 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isUploading && (
                  <div className="w-full h-1 rounded-full bg-[#E8EFEA] overflow-hidden mt-2">
                    <div
                      className="h-full rounded-full bg-[#1B4D2E] transition-[width] duration-150 ease-out"
                      style={{ width: `${Math.max(4, doc.progressPercent)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};


