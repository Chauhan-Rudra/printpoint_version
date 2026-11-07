import React, { useRef, useState } from 'react';
import {
  Plus,
  Check,
  CheckCircle2,
  RotateCcw,
  Loader2,
  AlertCircle,
  Clock,
  X,
  ArrowLeft,
} from 'lucide-react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  computeOverallUploadMetrics,
  formatFileSize,
  getDocumentVisualState,
  NATIVE_FILE_ACCEPT_ATTR,
  validateSelectedFile,
} from '../utils/kioskLogic';
import { FileTypeIcon } from './FileTypeIcon';
import { UploadHeroStage } from './UploadHeroStage';
import { FloatingUploadPanel } from './FloatingUploadPanel';

interface DocumentsListStepProps {
  documents: UploadedPrintDocument[];
  previewBeforePrint: boolean;
  onTogglePreviewBeforePrint: () => void;
  onAddMoreFiles: (files: File[]) => void;
  onRemoveDocument: (docId: string) => void;
  onRetryDocument: (docId: string) => void;
  onBackToUpload: () => void;
  onContinueToSummary: () => void;
}

export const DocumentsListStep: React.FC<DocumentsListStepProps> = ({
  documents,
  previewBeforePrint,
  onTogglePreviewBeforePrint,
  onAddMoreFiles,
  onRemoveDocument,
  onRetryDocument,
  onBackToUpload,
  onContinueToSummary,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingDuplicates, setPendingDuplicates] = useState<File[]>([]);
  const [removingDocIds, setRemovingDocIds] = useState<Record<string, boolean>>({});

  const handleMoreInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const rawFiles = Array.from(fileList);
    e.target.value = '';

    // 1. Deduplicate identical files within the same selection batch
    const seenInBatch = new Set<string>();
    const uniqueBatchFiles: File[] = [];
    for (const file of rawFiles) {
      const batchKey = `${file.name}::${file.size}::${file.lastModified}`;
      if (!seenInBatch.has(batchKey)) {
        seenInBatch.add(batchKey);
        uniqueBatchFiles.push(file);
      }
    }

    // 2. Validate file format and file size
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of uniqueBatchFiles) {
      const check = validateSelectedFile(file.name, file.size);
      if (!check.valid) {
        if (check.error) errors.push(check.error);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      setValidationError(errors.join(' '));
    } else {
      setValidationError(null);
    }

    if (validFiles.length === 0) {
      return;
    }

    // 3. Check for duplicates against already-uploaded documents
    const existingKeys = new Set(
      documents.map((d) => `${d.name.toLowerCase()}::${d.sizeBytes}`)
    );

    const newUniqueFiles: File[] = [];
    const duplicateFiles: File[] = [];

    for (const file of validFiles) {
      const key = `${file.name.toLowerCase()}::${file.size}`;
      if (existingKeys.has(key)) {
        duplicateFiles.push(file);
      } else {
        newUniqueFiles.push(file);
      }
    }

    if (duplicateFiles.length > 0) {
      setPendingDuplicates(duplicateFiles);
    } else {
      setPendingDuplicates([]);
    }

    if (newUniqueFiles.length > 0) {
      onAddMoreFiles(newUniqueFiles);
    }
  };

  const handleConfirmAddDuplicates = () => {
    if (pendingDuplicates.length > 0) {
      const toAdd = [...pendingDuplicates];
      setPendingDuplicates([]);
      onAddMoreFiles(toAdd);
    }
  };

  const handleDismissDuplicates = () => {
    setPendingDuplicates([]);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleAnimatedRemove = (docId: string) => {
    if (removingDocIds[docId]) return;
    setRemovingDocIds((prev) => ({ ...prev, [docId]: true }));
    window.setTimeout(() => {
      onRemoveDocument(docId);
      setRemovingDocIds((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    }, 170);
  };

  const sortedDocs = [...documents].sort((a, b) => a.orderIndex - b.orderIndex);
  const readyDocs = sortedDocs.filter((d) => d.status === 'Ready');
  const isAnyProcessing = sortedDocs.some(
    (d) =>
      d.status === 'Waiting' ||
      d.status === 'Uploading...' ||
      d.status === 'Processing document...' ||
      d.status === 'Preparing preview...'
  );
  const canContinue = readyDocs.length > 0 && !isAnyProcessing;
  const totalReadyPages = readyDocs.reduce((sum, d) => sum + d.pageCount, 0);

  const uploadMetrics = computeOverallUploadMetrics(sortedDocs);

  return (
    <div className="flex flex-col flex-1 w-full pb-28">
      <div className="flex flex-col flex-1 w-full animate-apple-reveal">
        {/* Native HTML File Input for "+ Add More Files" */}
        <input
          ref={fileInputRef}
          id="add-more-documents-input"
          data-testid="add-more-native-input"
          type="file"
          multiple
          accept={NATIVE_FILE_ACCEPT_ATTR}
          onChange={handleMoreInputChange}
          className="sr-only"
        />

        {/* Subtle Back Navigation */}
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToUpload}
            className="inline-flex items-center gap-1 min-h-[28px] pr-2 text-[12px] font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
        </div>

        {/* Hero Animation Stage: Opening 2D Folder & Entering Documents -> Google Pay-Style Animated Checkmark */}
        <UploadHeroStage
          documents={sortedDocs}
          uploadMetrics={uploadMetrics}
          isAnyProcessing={isAnyProcessing}
          canContinue={canContinue}
          totalReadyPages={totalReadyPages}
        />

        {/* Clear Error Banner when an Unsupported or Invalid File is Selected */}
        {validationError && (
          <div
            role="alert"
            data-testid="file-validation-error"
            className="mb-2.5 px-3.5 py-2.5 rounded-xl bg-error-container/85 border border-error/20 text-on-error-container flex items-start justify-between gap-2.5 animate-apple-card"
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
              aria-label="Dismiss error"
              className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Duplicate File Confirmation Banner */}
        {pendingDuplicates.length > 0 && (
          <div
            role="status"
            data-testid="duplicate-file-prompt"
            className="mb-2.5 px-3.5 py-2.5 rounded-xl bg-[#EEF5F0] border border-[#1B4D2E]/20 text-on-surface flex flex-col gap-2 animate-apple-card"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-medium text-on-surface leading-snug">
                {pendingDuplicates.length === 1
                  ? `"${pendingDuplicates[0].name}" is already in your list.`
                  : `${pendingDuplicates.length} files are already in your list.`}{' '}
                Would you like to add {pendingDuplicates.length === 1 ? 'it' : 'them'} again?
              </span>
              <button
                type="button"
                onClick={handleDismissDuplicates}
                aria-label="Dismiss duplicate prompt"
                className="text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmAddDuplicates}
                className="h-7 px-3 rounded-lg bg-[#1B4D2E] text-white text-[11.5px] font-semibold active:scale-95 transition-transform"
              >
                Add Again
              </button>
              <button
                type="button"
                onClick={handleDismissDuplicates}
                className="h-7 px-3 rounded-lg bg-white border border-outline-variant/60 text-on-surface-variant text-[11.5px] font-medium"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Apple Files-Inspired Compact Document List Section */}
        <section aria-label="Selected Documents Area" className="flex flex-col gap-1.5">
          {/* List Header Row with Small Outlined "+ Add More Files" Action */}
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-[12px] font-semibold text-[#545D56] tracking-tight">
              Documents ({sortedDocs.length})
            </span>

            <label
              htmlFor="add-more-documents-input"
              role="button"
              tabIndex={0}
              onKeyDown={handleLabelKeyDown}
              className="h-7 px-2.5 rounded-lg border border-[#1B4D2E]/30 bg-white hover:bg-[#1B4D2E]/[0.05] text-[#1B4D2E] text-[11.5px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer select-none active:scale-[0.98] transition-all duration-150"
            >
              <Plus className="w-3 h-3 stroke-[2.25] pointer-events-none" aria-hidden="true" />
              <span className="pointer-events-none">Add More Files</span>
            </label>
          </div>

          {/* Apple Files Grouped Horizontal Rows with Subtle Hairline Separators */}
          <div
            aria-label="Selected Documents List"
            className="w-full rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-[#EAEFEA] overflow-hidden"
          >
            {sortedDocs.map((doc, idx) => {
              const visualState = getDocumentVisualState(doc.status);
              const isReady = visualState === 'Completed';
              const isFailed = visualState === 'Failed';
              const isWaiting = visualState === 'Waiting';
              const isUploading = visualState === 'Uploading';
              const isProcessing = visualState === 'Processing';
              const formattedSize = formatFileSize(doc.sizeBytes);
              const showPageCount = isReady || doc.progressPercent >= 80;
              const isRemoving = Boolean(removingDocIds[doc.id]);

              const statusLabel = (() => {
                if (isReady) return 'Ready to print';
                if (isFailed) return doc.errorMessage || 'Upload failed';
                if (isWaiting) return 'Waiting to upload';
                if (isProcessing) return 'Preparing document...';
                return `Uploading... ${doc.progressPercent}%`;
              })();

              return (
                <div
                  key={doc.id}
                  data-file-state={visualState}
                  style={
                    !isRemoving
                      ? { animationDelay: `${Math.min(idx * 45, 220)}ms` }
                      : undefined
                  }
                  className={`px-3 py-2 flex flex-col justify-center transition-colors duration-150 ${
                    isRemoving ? 'animate-apple-row-exit' : 'animate-apple-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    {/* Left: File-type icon + Filename & Metadata */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileTypeIcon fileName={doc.name} size="sm" />

                      <div className="flex flex-col min-w-0 flex-1">
                        <span
                          title={doc.name}
                          className="text-[13px] font-semibold text-[#191C1A] truncate leading-snug"
                        >
                          {doc.name}
                        </span>

                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-[#646D66] mt-0.5 leading-tight tabular-nums">
                          <span>{formattedSize}</span>

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
                              isReady
                                ? 'font-medium text-[#1B4D2E]'
                                : isFailed
                                ? 'font-medium text-error'
                                : isUploading || isProcessing
                                ? 'font-medium text-[#1B4D2E]'
                                : 'text-[#717971]'
                            }
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Small Status Indicator + Retry / Remove Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isReady && (
                        <span
                          className="w-5 h-5 rounded-full bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center animate-check-pop mr-0.5"
                          aria-label="Ready to print"
                        >
                          <Check className="w-3 h-3 stroke-[2.75]" />
                        </span>
                      )}

                      {(isUploading || isProcessing) && (
                        <span
                          className="w-5 h-5 flex items-center justify-center text-[#1B4D2E] mr-0.5"
                          aria-label={
                            isProcessing ? 'Preparing document' : 'Uploading'
                          }
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        </span>
                      )}

                      {isWaiting && (
                        <span
                          className="w-5 h-5 flex items-center justify-center text-[#858E87] mr-0.5"
                          aria-label="Waiting to upload"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => onRetryDocument(doc.id)}
                          aria-label={`Retry ${doc.name}`}
                          className="h-7 px-2 rounded-lg bg-[#FFF2F0] border border-error/25 text-error text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-transform mr-0.5"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAnimatedRemove(doc.id)}
                        aria-label={`Remove ${doc.name}`}
                        className="w-7 h-7 rounded-lg text-[#7A837C] hover:text-error hover:bg-error-container/25 flex items-center justify-center transition-colors active:scale-95"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Individual Upload Progress Bar ONLY for the actively uploading document */}
                  {isUploading && (
                    <div className="w-full h-1 rounded-full bg-[#E8EFEA] overflow-hidden mt-1.5">
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

        {/* Floating-Style Upload Activity Panel (Section 4) */}
        <FloatingUploadPanel
          uploadMetrics={uploadMetrics}
          isAnyProcessing={isAnyProcessing}
          canContinue={canContinue}
          totalReadyPages={totalReadyPages}
        />

        {/* Compact "Preview pages before you print" confirmation bar when all documents are ready */}
        {canContinue && (
          <div className="mt-3 animate-apple-reveal">
            <button
              type="button"
              role="switch"
              aria-checked={previewBeforePrint}
              onClick={onTogglePreviewBeforePrint}
              className={`w-full min-h-[40px] rounded-xl px-3.5 py-2 flex items-center justify-center gap-2 border transition-all duration-150 active:scale-[0.99] ${
                previewBeforePrint
                  ? 'bg-[#EAF3EC] border-[#1B4D2E]/15 text-[#133820]'
                  : 'bg-surface-container-low border-outline-variant/50 text-on-surface-variant'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  previewBeforePrint
                    ? 'bg-[#1B4D2E] text-white'
                    : 'bg-outline-variant/60 text-white'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              </span>
              <span className="text-[12.5px] font-semibold">
                Preview pages before you print
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Fixed Bottom Action Area: Disabled "Preparing documents..." during processing, Active "Continue" when ready */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pb-safe bg-white/95 backdrop-blur-md border-t border-black/[0.06] px-4 py-2.5">
        <div className="max-w-md mx-auto w-full">
          <button
            type="button"
            disabled={!canContinue}
            onClick={onContinueToSummary}
            data-testid="bottom-continue-button"
            className={`w-full min-h-[46px] rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all duration-200 ${
              canContinue
                ? 'bg-[#1B4D2E] hover:bg-primary text-white shadow-xs active:scale-[0.99]'
                : 'bg-[#E7ECE8] text-[#6B746E] cursor-not-allowed'
            }`}
          >
            {!canContinue && (
              <Loader2 className="w-4 h-4 text-[#6B746E] animate-spin" aria-hidden="true" />
            )}
            <span>{canContinue ? 'Continue' : 'Preparing documents...'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};



