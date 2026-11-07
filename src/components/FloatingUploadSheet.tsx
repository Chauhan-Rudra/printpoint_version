import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  computeOverallUploadMetrics,
  detectFileFormatKind,
  formatFileSize,
  getFileTypeShortLabel,
  NATIVE_FILE_ACCEPT_ATTR,
  validateSelectedFile,
} from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';
import { FileTypeIcon } from './FileTypeIcon';

interface FloatingUploadSheetProps {
  documents: UploadedPrintDocument[];
  onAddMoreFiles: (files: File[]) => void;
  onRemoveDocument: (docId: string) => void;
  onRetryDocument: (docId: string) => void;
  onCancelUpload: () => void;
  onReviewDocuments: () => void;
}

export const FloatingUploadSheet: React.FC<FloatingUploadSheetProps> = ({
  documents,
  onAddMoreFiles,
  onRemoveDocument,
  onRetryDocument,
  onCancelUpload,
  onReviewDocuments,
}) => {
  const moreFileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const sortedDocs = [...documents].sort((a, b) => a.orderIndex - b.orderIndex);
  const readyDocs = sortedDocs.filter((d) => d.status === 'Ready');
  const failedDocs = sortedDocs.filter((d) => d.status === 'Failed');

  const isAnyUploadingOrProcessing = sortedDocs.some(
    (d) =>
      d.status === 'Waiting' ||
      d.status === 'Uploading...' ||
      d.status === 'Processing document...' ||
      d.status === 'Preparing preview...'
  );

  const allReadySuccess =
    sortedDocs.length > 0 &&
    !isAnyUploadingOrProcessing &&
    failedDocs.length === 0 &&
    readyDocs.length === sortedDocs.length;

  const hasFailure =
    sortedDocs.length > 0 &&
    !isAnyUploadingOrProcessing &&
    failedDocs.length > 0;

  const uploadMetrics = computeOverallUploadMetrics(sortedDocs);

  // Smooth real-time animated percentage counter that follows upload progress without jerky jumps
  const [displayPercent, setDisplayPercent] = useState<number>(() => uploadMetrics.overallPercent);
  const lastHapticMilestoneRef = useRef<number>(0);
  const prevCompletedCountRef = useRef<number>(0);

  useEffect(() => {
    const target = uploadMetrics.overallPercent;
    if (displayPercent === target) return;

    const timer = window.setInterval(() => {
      setDisplayPercent((prev) => {
        if (prev === target) return prev;
        const diff = target - prev;
        // Ease-out stepping: smooth progress updates (~250-400ms transition)
        const step = diff > 0 ? Math.max(1, Math.ceil(diff * 0.28)) : Math.min(-1, Math.floor(diff * 0.28));
        const next = prev + step;
        if ((diff > 0 && next >= target) || (diff < 0 && next <= target)) {
          return target;
        }
        return next;
      });
    }, 24);

    return () => window.clearInterval(timer);
  }, [uploadMetrics.overallPercent, displayPercent]);

  // Haptic feedback on progress milestones (25%, 50%, 75%)
  useEffect(() => {
    const milestones = [25, 50, 75];
    for (const m of milestones) {
      if (displayPercent >= m && lastHapticMilestoneRef.current < m) {
        lastHapticMilestoneRef.current = m;
        Haptics.progressTick();
      }
    }
  }, [displayPercent]);

  // Haptic feedback when each document finishes processing into ready state
  useEffect(() => {
    if (uploadMetrics.completedCount > prevCompletedCountRef.current) {
      Haptics.documentReady();
    }
    prevCompletedCountRef.current = uploadMetrics.completedCount;
  }, [uploadMetrics.completedCount]);

  // Lock background page scroll while the floating upload sheet is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Track smooth transition: folder closing gently (600ms) -> Google Pay-style success checkmark + tactile vibration
  const [sheetPhase, setSheetPhase] = useState<
    'uploading' | 'closing' | 'success'
  >(allReadySuccess ? 'success' : 'uploading');

  useEffect(() => {
    if (isAnyUploadingOrProcessing || hasFailure) {
      setSheetPhase('uploading');
      return;
    }
    if (allReadySuccess) {
      setConfirmingCancel(false);
      setSheetPhase((prev) => (prev === 'success' ? 'success' : 'closing'));
      // 600ms corresponds to the 500-700ms folder closing animation guideline
      const timer = window.setTimeout(() => {
        setSheetPhase('success');
        Haptics.success();
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [isAnyUploadingOrProcessing, hasFailure, allReadySuccess]);

  const totalSizeBytes = sortedDocs.reduce((sum, d) => sum + d.sizeBytes, 0);
  const totalPages = readyDocs.reduce((sum, d) => sum + d.pageCount, 0);

  // Determine active file index (1-based) for "Uploading X of Y files..."
  const currentFileNumber = Math.min(
    Math.max(1, uploadMetrics.completedCount + 1),
    Math.max(1, uploadMetrics.totalCount)
  );

  const isProcessingStage =
    uploadMetrics.overallState === 'Processing' ||
    (displayPercent >= 88 && isAnyUploadingOrProcessing);

  // Status transitions:
  // - Preparing files...
  // - Uploading document...
  // - Uploading 2 of 5 files...
  // - Processing documents...
  // - Upload complete!
  const statusInfo = (() => {
    if (allReadySuccess && sheetPhase === 'success') {
      return {
        heading: 'Upload Complete!',
        subheading: 'Your documents have been uploaded successfully.',
        counter: `${uploadMetrics.totalCount} of ${uploadMetrics.totalCount} files ready`,
      };
    }
    if (hasFailure) {
      return {
        heading: 'Upload Needs Attention',
        subheading: 'One or more files could not be processed. Please retry or remove the affected file.',
        counter: `${uploadMetrics.completedCount} of ${uploadMetrics.totalCount} files completed`,
      };
    }
    if (displayPercent < 15 && uploadMetrics.completedCount === 0 && !isProcessingStage) {
      return {
        heading: 'Preparing files...',
        subheading: 'Please wait while we upload your documents securely.',
        counter: `Preparing 1 of ${uploadMetrics.totalCount} ${uploadMetrics.totalCount === 1 ? 'file' : 'files'}...`,
      };
    }
    if (isProcessingStage) {
      return {
        heading: 'Processing documents...',
        subheading: 'Please wait while we prepare your files for printing.',
        counter: `Processing ${currentFileNumber} of ${uploadMetrics.totalCount} ${
          uploadMetrics.totalCount === 1 ? 'file' : 'files'
        }...`,
      };
    }
    if (uploadMetrics.totalCount === 1) {
      return {
        heading: 'Uploading document...',
        subheading: 'Please wait while we upload your documents securely.',
        counter: 'Uploading 1 of 1 file...',
      };
    }
    return {
      heading: `Uploading ${currentFileNumber} of ${uploadMetrics.totalCount} files...`,
      subheading: 'Please wait while we upload your documents securely.',
      counter: `Uploading ${currentFileNumber} of ${uploadMetrics.totalCount} files...`,
    };
  })();

  // Actual selected files used for entering document icons
  const visibleEnteringDocs = sortedDocs.slice(0, 6);

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

  const handleMoreFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const rawFiles = Array.from(fileList);
    e.target.value = '';

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of rawFiles) {
      const check = validateSelectedFile(file.name, file.size);
      if (!check.valid) {
        if (check.error) errors.push(check.error);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      Haptics.error();
      setValidationError(errors.join(' '));
    } else {
      setValidationError(null);
    }

    if (validFiles.length > 0) {
      Haptics.selection();
      onAddMoreFiles(validFiles);
    }
  };

  const handleMoreLabelKeyDown = (e: React.KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      moreFileInputRef.current?.click();
    }
  };

  const handleRequestCancel = () => {
    Haptics.buttonPress();
    // Ask for confirmation if upload has already started
    if (uploadMetrics.overallPercent > 0 || isAnyUploadingOrProcessing) {
      setConfirmingCancel(true);
    } else {
      onCancelUpload();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        allReadySuccess
          ? 'Upload Complete'
          : hasFailure
          ? 'Document Upload Attention Needed'
          : statusInfo.heading
      }
      data-testid="floating-upload-sheet"
      data-sheet-state={
        allReadySuccess ? 'success' : hasFailure ? 'failed' : 'uploading'
      }
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Native HTML File Input for "Upload More Files" */}
      <input
        ref={moreFileInputRef}
        id="floating-upload-more-input"
        data-testid="upload-more-native-input"
        type="file"
        multiple
        accept={NATIVE_FILE_ACCEPT_ATTR}
        onChange={handleMoreFilesChange}
        className="sr-only"
      />

      {/* Subtle Dim Overlay Keeping Existing Website Visible Behind It */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/45 transition-opacity duration-300"
      />

      {/* Floating Bottom-Sheet Panel (~58–65% of Mobile Screen) */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-white rounded-t-[28px] shadow-[0_-14px_42px_rgba(15,23,18,0.22)] border-t border-black/[0.05] min-h-[58dvh] max-h-[84dvh] flex flex-col justify-between px-5 pt-3.5 pb-6 pb-safe overflow-y-auto animate-sheet-slide-up">
        {/* Subtle Bottom-Sheet Drag Handle Pill */}
        <div className="w-full flex justify-center mb-3 shrink-0" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-black/[0.12]" />
        </div>

        {/* Validation Error Alert (if user selects an invalid file via Upload More Files) */}
        {validationError && (
          <div
            role="alert"
            data-testid="sheet-validation-error"
            className="mb-3 px-3.5 py-2.5 rounded-xl bg-error-container/85 border border-error/25 text-on-error-container flex items-start justify-between gap-2 text-left animate-apple-card"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <span className="text-[12px] font-medium leading-snug">
                {validationError}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              aria-label="Dismiss validation error"
              className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* STATE A: UPLOADING / PROCESSING STATE */}
        {(isAnyUploadingOrProcessing || sheetPhase === 'closing') && (
          <div className="flex-1 flex flex-col items-center justify-between text-center my-auto py-1">
            {/* Top Centre Folder Upload Illustration with Actual Selected Documents Entering */}
            <div className="flex flex-col items-center w-full mt-2">
              <div
                className={`relative w-28 h-24 flex items-center justify-center mt-2 mb-3 select-none ${
                  sheetPhase === 'closing' ? 'animate-folder-close-away' : ''
                }`}
                aria-hidden="true"
              >
                {/* Subtle Green Highlight Glow During Uploading */}
                <div className="absolute w-20 h-20 rounded-full bg-[#389E48]/18 blur-md animate-folder-halo" />

                {/* Small Document Icons Moving Sequentially Into the Open Folder (400–600ms per item) */}
                <div className="absolute inset-x-0 top-0 h-14 flex items-center justify-center pointer-events-none z-10">
                  {visibleEnteringDocs.map((doc, idx) => {
                    const badge = getBadgeStyle(doc.name);
                    const shortLabel = getFileTypeShortLabel(doc.name);
                    const horizontalOffset =
                      visibleEnteringDocs.length === 1
                        ? 0
                        : (idx - (visibleEnteringDocs.length - 1) / 2) * 8;

                    return (
                      <div
                        key={doc.id}
                        style={{
                          left: `calc(50% - 14px + ${horizontalOffset}px)`,
                          animationDelay: `${idx * 450}ms`,
                        }}
                        className="absolute top-0.5 w-[28px] h-[35px] rounded-[5px] bg-white border border-black/15 shadow-xs flex flex-col items-center justify-between p-1 animate-doc-enter-folder"
                      >
                        <div className="w-full flex flex-col gap-0.5 mt-0.5">
                          <span className="w-3/4 h-[1.5px] rounded-full bg-[#1B4D2E]/40" />
                          <span className="w-full h-[1.5px] rounded-full bg-[#1B4D2E]/25" />
                        </div>
                        <span
                          style={{
                            backgroundColor: badge.bg,
                            borderColor: badge.border,
                            color: badge.text,
                          }}
                          className="w-full text-[6px] font-bold tracking-wider uppercase rounded-[2px] border py-[0.5px] leading-none text-center"
                        >
                          {shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Layered Green Folder Illustration */}
                <svg
                  className="w-20 h-20 relative z-20 overflow-visible mt-3"
                  viewBox="0 0 80 72"
                  fill="none"
                >
                  {/* Back Folder Tab */}
                  <path
                    d="M14 19C14 15.6863 16.6863 13 20 13H32C33.8 13 35.4 13.8 36.5 15.2L39.6 19H60C63.3137 19 66 21.6863 66 25V55C66 58.3137 63.3137 61 60 61H20C16.6863 61 14 58.3137 14 55V19Z"
                    fill="#276738"
                  />

                  {/* Peeking Document Sheet Layer Inside Folder */}
                  <rect
                    x="22"
                    y="15"
                    width="34"
                    height="24"
                    rx="3"
                    fill="#E3F2E6"
                    stroke="#B7D9BE"
                    strokeWidth="1"
                  />

                  {/* Bright Green Inner Folder Flap / Lid Opening Slowly and Naturally (700–900ms) */}
                  <path
                    d="M24 22C24 19.7909 25.7909 18 28 18H58C60.2091 18 62 19.7909 62 22V44H24V22Z"
                    fill="#68C73C"
                    className="animate-folder-lid-open"
                  />

                  {/* Rich Creator4 Lab Forest Green Front Folder Pocket */}
                  <path
                    d="M13 30C13 27.2386 15.2386 25 18 25H34.5C36.2 25 37.8 25.8 38.8 27.2L41.2 30.5H62C64.7614 30.5 67 32.7386 67 35.5L65.5 55.5C65.2 58.6 62.6 61 59.5 61H20.5C17.4 61 14.8 58.6 14.5 55.5L13 30Z"
                    fill="#1B4D2E"
                    className="animate-folder-pocket-open"
                  />
                </svg>
              </div>

              {/* Heading & Supporting Text */}
              <h2
                data-testid="upload-sheet-heading"
                className="text-[21px] font-bold text-[#141A16] tracking-tight leading-snug transition-all duration-200"
              >
                {statusInfo.heading}
              </h2>
              <p className="text-[13px] text-[#646D67] leading-relaxed mt-1 max-w-[270px]">
                {statusInfo.subheading}
              </p>

              {/* Active Document Filename Pill */}
              {uploadMetrics.activeDocumentName && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F7F4] border border-[#1B4D2E]/10 max-w-[280px]">
                  <Loader2 className="w-3.5 h-3.5 text-[#1B4D2E] animate-spin shrink-0" />
                  <span
                    data-testid="active-uploading-filename"
                    className="text-[11.5px] font-medium text-[#2A332D] truncate"
                  >
                    {uploadMetrics.activeDocumentName}
                  </span>
                </div>
              )}
            </div>

            {/* Middle Section: Upload Counter + Smooth Real-Time Percentage + Rounded Brand Progress Bar */}
            <div className="w-full my-5 text-left">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span
                  data-testid="uploading-counter-label"
                  className="text-[13px] font-medium text-[#5A635D] tabular-nums"
                >
                  {statusInfo.counter}
                </span>
                <span
                  data-testid="uploading-percent-label"
                  className="text-[13.5px] font-bold text-[#1B4D2E] tabular-nums transition-all"
                >
                  {displayPercent}%
                </span>
              </div>

              {/* Slim, Rounded Progress Track with Smooth 300ms ease-out transitions */}
              <div
                role="progressbar"
                aria-valuenow={displayPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Document upload progress"
                className="w-full h-2 rounded-full bg-[#E5ECE7] overflow-hidden relative"
              >
                <div
                  className="h-full rounded-full bg-[#1B4D2E] transition-[width] duration-300 ease-out relative overflow-hidden"
                  style={{
                    width: `${Math.max(4, displayPercent)}%`,
                  }}
                >
                  <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-progress-shimmer" />
                </div>
              </div>

              {/* Subtle Security Note Below Progress Bar */}
              <p className="text-[11.5px] italic text-[#7A847D] mt-2">
                We automatically delete your files after printing.
              </p>
            </div>

            {/* Bottom Section: Cancel Upload Button or Confirmation Prompt */}
            <div className="w-full">
              {!confirmingCancel ? (
                <button
                  type="button"
                  onClick={handleRequestCancel}
                  data-testid="cancel-upload-btn"
                  className="w-full min-h-[44px] rounded-xl bg-[#F5F7F5] hover:bg-[#ECEFEC] text-[#2B332E] text-[13.5px] font-semibold transition-colors active:scale-[0.99]"
                >
                  Cancel Upload
                </button>
              ) : (
                <div
                  role="alertdialog"
                  aria-label="Confirm cancel upload"
                  data-testid="cancel-upload-confirm-box"
                  className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.08] flex flex-col gap-2.5 animate-apple-card"
                >
                  <span className="text-[12.5px] font-semibold text-[#191C1A]">
                    Cancel the current upload?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        Haptics.buttonPress();
                        setConfirmingCancel(false);
                      }}
                      data-testid="keep-uploading-btn"
                      className="min-h-[38px] rounded-xl bg-white border border-black/15 text-[#191C1A] text-[12.5px] font-semibold active:scale-[0.98]"
                    >
                      Keep Uploading
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        Haptics.buttonPress();
                        onCancelUpload();
                      }}
                      data-testid="confirm-cancel-upload-btn"
                      className="min-h-[38px] rounded-xl bg-[#191C1A] text-white text-[12.5px] font-semibold active:scale-[0.98]"
                    >
                      Yes, Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATE B: FAILED DOCUMENT STATE (Never falsely marks ready) */}
        {hasFailure && (
          <div className="flex-1 flex flex-col justify-between text-center py-1 animate-apple-reveal">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-error-container/75 text-error flex items-center justify-center mb-3">
                <AlertCircle className="w-7 h-7" />
              </div>

              <h2
                data-testid="upload-sheet-heading"
                className="text-[20px] font-bold text-[#191C1A] tracking-tight"
              >
                Upload Needs Attention
              </h2>
              <p className="text-[12.5px] text-[#5B645E] mt-1 max-w-[270px]">
                One or more files could not be processed. Please retry or remove the affected file.
              </p>

              {/* List of Documents Showing Failed Filename, Clear Error, and Retry Option */}
              <div className="w-full mt-4 rounded-2xl bg-[#F8FAF8] border border-black/[0.07] divide-y divide-[#EAEFEA] text-left max-h-[200px] overflow-y-auto">
                {sortedDocs.map((doc) => {
                  const isDocFailed = doc.status === 'Failed';
                  return (
                    <div
                      key={doc.id}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileTypeIcon fileName={doc.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <span className="text-[12.5px] font-semibold text-[#191C1A] truncate block">
                            {doc.name}
                          </span>
                          <span
                            className={`text-[11px] block ${
                              isDocFailed
                                ? 'text-error font-medium'
                                : 'text-[#1B4D2E] font-medium'
                            }`}
                          >
                            {isDocFailed
                              ? doc.errorMessage || 'Upload failed'
                              : `${formatFileSize(doc.sizeBytes)} · Ready`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDocFailed && (
                          <button
                            type="button"
                            onClick={() => {
                              Haptics.buttonPress();
                              onRetryDocument(doc.id);
                            }}
                            data-testid={`retry-doc-${doc.id}`}
                            className="h-7 px-2.5 rounded-lg bg-[#FFF2F0] border border-error/25 text-error text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            Haptics.buttonPress();
                            onRemoveDocument(doc.id);
                          }}
                          aria-label={`Remove ${doc.name}`}
                          className="w-7 h-7 rounded-lg text-[#6B746E] hover:text-error flex items-center justify-center"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-full mt-4">
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  onCancelUpload();
                }}
                className="w-full min-h-[44px] rounded-xl bg-[#F5F7F5] hover:bg-[#ECEFEC] text-[#2B332E] text-[13.5px] font-semibold transition-colors"
              >
                Cancel Upload
              </button>
            </div>
          </div>
        )}

        {/* STATE C: UPLOAD COMPLETION & GOOGLE PAY-STYLE SUCCESS ANIMATION (500–700ms checkmark) */}
        {allReadySuccess && sheetPhase === 'success' && (
          <div className="flex-1 flex flex-col justify-between text-center py-1 animate-apple-reveal">
            <div className="flex flex-col items-center">
              {/* Google Pay-Style Animated Green Success Circle + Ripple + Stroke-Drawn Checkmark */}
              <div className="relative w-16 h-16 flex items-center justify-center mb-3 mt-1 select-none">
                <span
                  className="absolute inset-0 rounded-full bg-[#1B4D2E]/20 animate-gpay-ripple pointer-events-none"
                  aria-hidden="true"
                />
                <span
                  className="absolute -inset-1.5 rounded-full bg-[#EAF4EE] border border-[#1B4D2E]/10 pointer-events-none"
                  aria-hidden="true"
                />

                <div
                  data-testid="gpay-success-circle"
                  className="relative z-10 w-14 h-14 rounded-full bg-[#1B4D2E] shadow-[0_6px_18px_rgba(27,77,46,0.25)] flex items-center justify-center animate-gpay-circle"
                >
                  <svg
                    className="w-7 h-7 text-white overflow-visible"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5.5 12.5L10 17L18.5 7.5"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-gpay-check"
                    />
                  </svg>
                </div>
              </div>

              {/* Heading: Upload Complete! */}
              <h2
                data-testid="upload-sheet-heading"
                className="text-[21px] font-bold text-[#141A16] tracking-tight leading-snug"
              >
                Upload Complete!
              </h2>
              <p className="text-[13px] text-[#5B645E] leading-snug mt-1">
                Your documents have been uploaded successfully.
              </p>

              {/* Upload Summary Pill Row: Total Documents, Total File Size, Processing Status */}
              <div
                data-testid="upload-complete-metrics"
                className="w-full mt-3.5 p-3 rounded-2xl bg-[#F4F8F5] border border-[#1B4D2E]/12 grid grid-cols-3 gap-2 text-center"
              >
                <div className="flex flex-col">
                  <span className="text-[10.5px] font-medium text-[#5E6861] uppercase tracking-wider">
                    Documents
                  </span>
                  <span
                    data-testid="completed-doc-count"
                    className="text-[13px] font-bold text-[#191C1A] mt-0.5 tabular-nums"
                  >
                    {readyDocs.length}{' '}
                    {readyDocs.length === 1 ? 'file' : 'files'}
                  </span>
                </div>

                <div className="flex flex-col border-x border-[#1B4D2E]/10 px-1">
                  <span className="text-[10.5px] font-medium text-[#5E6861] uppercase tracking-wider">
                    Total Size
                  </span>
                  <span
                    data-testid="completed-total-size"
                    className="text-[13px] font-bold text-[#191C1A] mt-0.5 tabular-nums"
                  >
                    {formatFileSize(totalSizeBytes)}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10.5px] font-medium text-[#5E6861] uppercase tracking-wider">
                    Status
                  </span>
                  <span
                    data-testid="completed-processing-status"
                    className="text-[12.5px] font-bold text-[#1B4D2E] mt-0.5 inline-flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                    <span>Ready ({totalPages}p)</span>
                  </span>
                </div>
              </div>

              {/* Compact Scrollable Uploaded File List */}
              <div
                aria-label="Uploaded files list"
                className="w-full mt-3 rounded-2xl bg-white border border-black/[0.06] divide-y divide-[#EAEFEA] text-left max-h-[148px] overflow-y-auto"
              >
                {readyDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileTypeIcon fileName={doc.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[12.5px] font-semibold text-[#191C1A] truncate block">
                          {doc.name}
                        </span>
                        <span className="text-[11px] text-[#646D66] tabular-nums">
                          {formatFileSize(doc.sizeBytes)} · {doc.pageCount}{' '}
                          {doc.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                          <span className="text-[#1B4D2E] font-medium">
                            Ready
                          </span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        Haptics.buttonPress();
                        onRemoveDocument(doc.id);
                      }}
                      aria-label={`Remove ${doc.name}`}
                      className="w-7 h-7 rounded-lg text-[#7A837C] hover:text-error hover:bg-error-container/25 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmation Actions: Primary "Review Documents" + Secondary "Upload More Files" */}
            <div className="w-full mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  onReviewDocuments();
                }}
                data-testid="review-documents-btn"
                className="w-full min-h-[48px] rounded-xl bg-[#1B4D2E] hover:bg-primary text-white font-bold text-[15px] flex items-center justify-center shadow-[0_4px_12px_rgba(27,77,46,0.22)] transition-all duration-150 active:scale-[0.99]"
              >
                Review Documents
              </button>

              <label
                htmlFor="floating-upload-more-input"
                role="button"
                tabIndex={0}
                onKeyDown={handleMoreLabelKeyDown}
                onClick={() => Haptics.buttonPress()}
                data-testid="upload-more-files-btn"
                className="w-full min-h-[44px] rounded-xl border border-[#1B4D2E]/30 bg-white hover:bg-[#1B4D2E]/[0.04] text-[#1B4D2E] font-semibold text-[14px] flex items-center justify-center gap-1.5 cursor-pointer select-none transition-all duration-150 active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 stroke-[2.25] pointer-events-none" />
                <span className="pointer-events-none">Upload More Files</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
