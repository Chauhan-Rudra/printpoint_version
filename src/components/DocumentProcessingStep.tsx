import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Check,
  CheckCircle,
  FileText,
  FolderSimple,
  Plus,
  Trash,
  WarningCircle,
  WifiSlash,
} from '@phosphor-icons/react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  formatFileSize,
  NATIVE_FILE_ACCEPT_ATTR,
} from '../utils/kioskLogic';
import {
  buildProcessingStages,
  computeProcessingProgressSummary,
  ProcessingStageViewItem,
} from '../utils/processingRecovery';
import { FileTypeIcon } from './FileTypeIcon';
import {
  Button,
  LoadingSpinner,
  ProgressBar,
  StatusIndicator,
  PP_EASE,
} from './ui';

interface DocumentProcessingStepProps {
  documents: UploadedPrintDocument[];
  isOnline: boolean;
  isKioskSessionExpired: boolean;
  onAddMoreFiles: (files: File[]) => { addedCount: number; errors: string[] };
  onRetryDocument: (docId: string) => void;
  onRemoveDocument: (docId: string) => void;
  onRemoveAllFailed: () => void;
  onReconnectKiosk: () => void;
  onCancelProcessing: () => void;
  onContinueToPrintSettings: () => void;
  onOpenPdfEditor: () => void;
}

function getFileStageLabel(doc: UploadedPrintDocument): string {
  if (doc.status === 'Failed') {
    return doc.errorCode === 'password-protected'
      ? 'Password locked'
      : doc.errorCode === 'unsupported'
        ? 'Unsupported'
        : 'Failed';
  }
  if (doc.status === 'Ready') {
    const pages = Math.max(1, doc.pageCount);
    return `${pages} ${pages === 1 ? 'page' : 'pages'} ready`;
  }
  switch (doc.processingStage) {
    case 'uploading': {
      if (doc.sizeBytes > 0 && typeof doc.uploadedBytes === 'number') {
        const pct = Math.min(100, Math.round((doc.uploadedBytes / doc.sizeBytes) * 100));
        return `Uploading · ${pct}%`;
      }
      return 'Uploading...';
    }
    case 'validating':
      return 'Validating format & integrity...';
    case 'converting':
      return 'Converting to PDF...';
    case 'preparing':
      if (doc.pageScanProgress && doc.pageScanProgress.total > 0) {
        return `Checking page ${doc.pageScanProgress.current} of ${doc.pageScanProgress.total}`;
      }
      return 'Preparing pages...';
    default:
      return doc.status === 'Waiting' ? 'Queued' : doc.status;
  }
}

const StageIcon: React.FC<{ status: ProcessingStageViewItem['status'] }> = ({
  status,
}) => {
  if (status === 'completed') {
    return (
      <span className="w-6 h-6 rounded-full bg-[#194F34] text-white flex items-center justify-center shrink-0">
        <Check size={13} weight="bold" aria-hidden="true" />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="w-6 h-6 rounded-full bg-[#EAF3ED] border border-[#194F34]/30 text-[#194F34] flex items-center justify-center shrink-0">
        <LoadingSpinner size={14} label="In progress" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="w-6 h-6 rounded-full bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] flex items-center justify-center shrink-0">
        <WarningCircle size={14} weight="fill" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="w-6 h-6 rounded-full bg-[#F1F4F0] border border-[#D5DDD7] shrink-0"
    />
  );
};

export const DocumentProcessingStep: React.FC<DocumentProcessingStepProps> = ({
  documents,
  isOnline,
  isKioskSessionExpired,
  onAddMoreFiles,
  onRetryDocument,
  onRemoveDocument,
  onRemoveAllFailed,
  onReconnectKiosk,
  onCancelProcessing,
  onContinueToPrintSettings,
  onOpenPdfEditor,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [addFilesError, setAddFilesError] = useState<string | null>(null);

  const stages = buildProcessingStages(documents);
  const summary = computeProcessingProgressSummary(documents);

  const isComplete =
    documents.length > 0 &&
    summary.inFlightFiles === 0 &&
    summary.failedFiles === 0 &&
    summary.readyFiles === documents.length;

  const hasFailures = summary.failedFiles > 0;
  const hasReadyDocs = summary.readyFiles > 0;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      const outcome = onAddMoreFiles(files);
      if (outcome.errors.length > 0) {
        setAddFilesError(outcome.errors.join(' '));
      } else {
        setAddFilesError(null);
      }
    }
    e.target.value = '';
  };

  const handleContinueClick = () => {
    if (!isComplete || isNavigating) return;
    setIsNavigating(true);
    onContinueToPrintSettings();
  };

  return (
    <div className="w-full max-w-[430px] mx-auto px-4 pt-3 pb-8 pb-safe flex flex-col gap-5 min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={NATIVE_FILE_ACCEPT_ATTR}
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Add more documents"
      />

      {/* Top minimal bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancelProcessing}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#545D56] hover:text-[#191C1A] min-h-[40px] pr-2 -ml-1 active:scale-95 transition-transform"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isNavigating}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#194F34] hover:text-[#123B26] min-h-[40px] px-2.5 rounded-lg bg-[#EAF3ED] active:scale-95 transition-transform disabled:opacity-50"
        >
          <Plus size={15} weight="bold" aria-hidden="true" />
          <span>Add files</span>
        </button>
      </div>

      {addFilesError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-3 text-[12.5px] text-[#93000A]"
        >
          <p className="leading-snug">{addFilesError}</p>
          <button
            type="button"
            onClick={() => setAddFilesError(null)}
            className="text-[12px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Live status alerts (offline or kiosk session expiry) */}
      {!isOnline && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3 text-[12.5px] text-[#92400E]"
        >
          <WifiSlash size={18} weight="bold" className="shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">You appear to be offline</p>
            <p className="text-[12px] opacity-90 mt-0.5">
              Local PDF and image checks continue on your device, while remote server steps require an internet connection.
            </p>
          </div>
        </div>
      )}

      {isKioskSessionExpired && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-3 text-[12.5px] text-[#93000A]"
        >
          <div className="min-w-0">
            <p className="font-semibold">Kiosk session expired</p>
            <p className="text-[12px] opacity-90 mt-0.5">
              Reconnect to your Print Point kiosk to continue preparing files.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onReconnectKiosk}
            className="shrink-0 border-[#FECDD3] text-[#93000A] bg-white hover:bg-[#FFF1F2]"
          >
            Reconnect
          </Button>
        </div>
      )}

      {/* Main Header & Visual State */}
      {isComplete ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: PP_EASE.standard }}
          aria-live="polite"
          className="flex flex-col items-center text-center pt-2 pb-1 gap-3"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32, ease: PP_EASE.standard }}
            className="w-16 h-16 rounded-2xl bg-[#EAF3ED] border border-[#B8D6C2] text-[#194F34] flex items-center justify-center"
          >
            <CheckCircle size={36} weight="fill" aria-hidden="true" />
          </motion.div>

          <div className="space-y-1">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#191C1A]">
              Your Documents Are Ready!
            </h1>
            <p className="text-[14px] text-[#545D56]">
              All files have been verified and prepared for printing.
            </p>
          </div>

          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-white border border-[#E2E7E1] text-[13px] font-semibold text-[#191C1A] tabular-nums">
            <span>
              {summary.readyFiles}{' '}
              {summary.readyFiles === 1 ? 'Document' : 'Documents'}
            </span>
            <span className="text-[#C5CEC7]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#194F34]">
              {summary.totalPages}{' '}
              {summary.totalPages === 1 ? 'Page' : 'Pages'}
            </span>
          </div>
        </motion.section>
      ) : (
        <section aria-live="polite" className="flex flex-col gap-4 pt-1">
          <div className="flex items-start gap-3.5">
            <motion.div
              animate={
                summary.inFlightFiles > 0
                  ? { y: [0, -3, 0] }
                  : { y: 0 }
              }
              transition={
                summary.inFlightFiles > 0
                  ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
                  : undefined
              }
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                summary.mode === 'error'
                  ? 'bg-[#FFF1F2] border-[#FECDD3] text-[#BA1A1A]'
                  : 'bg-[#EAF3ED] border-[#B8D6C2] text-[#194F34]'
              }`}
              aria-hidden="true"
            >
              {summary.mode === 'error' ? (
                <WarningCircle size={24} weight="fill" />
              ) : (
                <div className="relative">
                  <FolderSimple size={24} weight="duotone" />
                  <FileText
                    size={12}
                    weight="fill"
                    className="absolute -right-1 -bottom-0.5 text-[#194F34]"
                  />
                </div>
              )}
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#191C1A] leading-tight">
                  Preparing Your Documents
                </h1>
              </div>
              <p className="text-[13.5px] text-[#545D56] mt-1">
                We&apos;re getting your files ready for printing.
              </p>
              <p className="text-[12px] font-semibold text-[#194F34] mt-1.5 tabular-nums">
                {summary.totalFiles}{' '}
                {summary.totalFiles === 1 ? 'file' : 'files'} in queue
                {summary.readyFiles > 0 ? ` · ${summary.readyFiles} ready` : ''}
                {summary.failedFiles > 0 ? ` · ${summary.failedFiles} failed` : ''}
              </p>
            </div>
          </div>

          {/* Genuine Progress Indicator */}
          <div className="rounded-2xl bg-white border border-[#E2E7E1] p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-[#191C1A] truncate">
                {summary.activeStageTitle}
              </span>
              {summary.mode === 'determinate' ? (
                <span className="text-[12.5px] font-bold text-[#194F34] tabular-nums shrink-0">
                  {summary.percent}%
                </span>
              ) : summary.mode === 'indeterminate' ? (
                <span className="text-[11.5px] font-semibold text-[#545D56] shrink-0">
                  In progress
                </span>
              ) : null}
            </div>

            <ProgressBar
              value={summary.mode === 'determinate' ? summary.percent : 0}
              indeterminate={summary.mode === 'indeterminate'}
              tone={summary.mode === 'error' ? 'error' : 'brand'}
              label={undefined}
              showPercent={false}
            />

            <p className="text-[12px] text-[#545D56] truncate tabular-nums">
              {summary.detailLabel}
            </p>
          </div>
        </section>
      )}

      {/* Real Processing Stages List */}
      <section
        aria-label="Processing stages"
        className="rounded-2xl bg-white border border-[#E2E7E1] p-4"
      >
        <ol className="flex flex-col gap-3">
          {stages.map((stage) => {
            const isStageActive = stage.status === 'active';
            const isStageDone = stage.status === 'completed';
            const isStageError = stage.status === 'error';

            return (
              <li key={stage.id} className="flex items-start gap-3">
                <StageIcon status={stage.status} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[13.5px] font-semibold leading-snug ${
                        isStageError
                          ? 'text-[#BA1A1A]'
                          : isStageActive || isStageDone
                            ? 'text-[#191C1A]'
                            : 'text-[#717B73]'
                      }`}
                    >
                      {stage.title}
                    </span>
                    {isStageDone && (
                      <span className="text-[11px] font-semibold text-[#194F34]">
                        Done
                      </span>
                    )}
                    {isStageActive && (
                      <span className="text-[11px] font-semibold text-[#194F34]">
                        Active
                      </span>
                    )}
                    {isStageError && (
                      <span className="text-[11px] font-semibold text-[#BA1A1A]">
                        Attention
                      </span>
                    )}
                  </div>
                  {(isStageActive || isStageError) && (
                    <p className="text-[12px] text-[#545D56] mt-0.5 leading-snug">
                      {stage.description}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Per-File Status & Error List */}
      <section aria-label="Queued documents" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h2 className="text-[13px] font-bold text-[#191C1A]">
            Documents ({documents.length})
          </h2>
          {hasFailures && hasReadyDocs && (
            <button
              type="button"
              onClick={onRemoveAllFailed}
              className="text-[12px] font-semibold text-[#BA1A1A] hover:underline min-h-[32px]"
            >
              Remove failed &amp; keep valid
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {documents.map((doc) => {
            const isFailed = doc.status === 'Failed';
            const isReady = doc.status === 'Ready';
            const showDocDeterminate =
              !isFailed &&
              !isReady &&
              ((doc.processingStage === 'uploading' &&
                doc.sizeBytes > 0 &&
                typeof doc.uploadedBytes === 'number') ||
                (doc.processingStage === 'preparing' &&
                  Boolean(doc.pageScanProgress?.total)));

            const docPercent =
              doc.processingStage === 'preparing' && doc.pageScanProgress?.total
                ? Math.round(
                    (doc.pageScanProgress.current / doc.pageScanProgress.total) * 100
                  )
                : doc.sizeBytes > 0 && typeof doc.uploadedBytes === 'number'
                  ? Math.round((doc.uploadedBytes / doc.sizeBytes) * 100)
                  : doc.progressPercent;

            return (
              <li
                key={doc.id}
                className={`rounded-xl border px-3.5 py-3 bg-white transition-colors ${
                  isFailed ? 'border-[#FECDD3] bg-[#FFFDFD]' : 'border-[#E2E7E1]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <FileTypeIcon fileName={doc.name} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-[#191C1A] truncate">
                        {doc.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => onRemoveDocument(doc.id)}
                        aria-label={`Remove ${doc.name}`}
                        className="text-[#717B73] hover:text-[#BA1A1A] p-1 -mr-1 -mt-0.5 rounded-lg transition-colors shrink-0"
                      >
                        <Trash size={16} weight="regular" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5 text-[12px] text-[#545D56] tabular-nums">
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isFailed
                            ? 'text-[#BA1A1A] font-semibold'
                            : isReady
                              ? 'text-[#194F34] font-semibold'
                              : 'text-[#545D56] font-medium'
                        }
                      >
                        {getFileStageLabel(doc)}
                      </span>
                    </div>

                    {/* Per-file live progress bar while active */}
                    {!isReady && !isFailed && (
                      <div className="mt-2">
                        <ProgressBar
                          size="sm"
                          value={showDocDeterminate ? docPercent : 0}
                          indeterminate={!showDocDeterminate}
                        />
                      </div>
                    )}

                    {/* Plain-language failure details & safe actions */}
                    {isFailed && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        <p className="text-[12.5px] text-[#93000A] leading-snug">
                          {doc.errorMessage ||
                            `Could not process "${doc.name}". Remove this file or retry.`}
                        </p>
                        <div className="flex items-center flex-wrap gap-2">
                          {doc.retryable && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onRetryDocument(doc.id)}
                              disabled={
                                !isOnline && doc.errorCode === 'network-offline'
                              }
                              leftIcon={<ArrowsClockwise size={14} weight="bold" />}
                            >
                              Retry
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveDocument(doc.id)}
                            className="text-[#93000A] hover:bg-[#FFF1F2]"
                          >
                            Remove file
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {isReady && (
                    <StatusIndicator
                      tone="success"
                      label="Ready"
                      size="sm"
                      className="shrink-0 mt-0.5"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Completion or Wait Footer Actions */}
      {isComplete ? (
        <div className="flex flex-col gap-2.5 pt-1">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isNavigating}
            loading={isNavigating}
            onClick={handleContinueClick}
            rightIcon={<ArrowRight size={18} weight="bold" />}
          >
            Continue to Print Settings
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            disabled={isNavigating}
            onClick={onOpenPdfEditor}
          >
            Review or Edit Pages First
          </Button>
        </div>
      ) : (
        <div className="pt-1 flex flex-col gap-2">
          {hasFailures && hasReadyDocs && summary.inFlightFiles === 0 && (
            <p className="text-center text-[12px] text-[#545D56]">
              Remove or retry failed files above before continuing to print settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
