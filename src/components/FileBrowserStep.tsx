import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Printer,
  Trash,
} from '@phosphor-icons/react';
import { UploadedPrintDocument } from '../types/kiosk';
import {
  formatFileSize,
  getFileTypeShortLabel,
  NATIVE_FILE_ACCEPT_ATTR,
} from '../utils/kioskLogic';
import { useKioskSession } from '../utils/kioskSession';
import { Haptics } from '../utils/haptics';
import { FileTypeIcon } from './FileTypeIcon';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeading,
  ProgressBar,
  SecondaryText,
  SectionHeading,
  StatusIndicator,
  SurfaceCard,
  PP_EASE,
  pageTransitionVariants,
} from './ui';

export interface FileBrowserStepProps {
  documents: UploadedPrintDocument[];
  onAddFiles: (
    files: File[]
  ) =>
    | { addedCount: number; errors: string[] }
    | Promise<{ addedCount: number; errors: string[] }>;
  onRemoveDocument: (docId: string) => void;
  onRetryDocument: (docId: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  embeddedInTab?: boolean;
}

export const FileBrowserStep: React.FC<FileBrowserStepProps> = ({
  documents,
  onAddFiles,
  onRemoveDocument,
  onRetryDocument,
  onContinue,
  onBack,
  embeddedInTab = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const isPickingRef = useRef<boolean>(false);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isContinuing, setIsContinuing] = useState<boolean>(false);
  const [isAddingBatch, setIsAddingBatch] = useState<boolean>(false);

  const { session } = useKioskSession();

  const sortedDocs = [...documents].sort((a, b) => a.orderIndex - b.orderIndex);
  const readyDocs = sortedDocs.filter((d) => d.status === 'Ready');
  const failedDocs = sortedDocs.filter((d) => d.status === 'Failed');
  const isAnyProcessing = sortedDocs.some(
    (d) =>
      d.status === 'Waiting' ||
      d.status === 'Uploading...' ||
      d.status === 'Processing document...' ||
      d.status === 'Preparing preview...'
  );

  const totalSizeBytes = sortedDocs.reduce((sum, doc) => sum + doc.sizeBytes, 0);
  const totalReadyPages = readyDocs.reduce((sum, doc) => sum + doc.pageCount, 0);

  const canContinue =
    sortedDocs.length > 0 &&
    readyDocs.length > 0 &&
    !isAnyProcessing &&
    failedDocs.length === 0 &&
    !isContinuing;

  const handleOpenPicker = () => {
    if (isPickingRef.current || isContinuing) return;
    Haptics.buttonPress();
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const selectedFiles = Array.from(fileList);
    e.target.value = '';

    if (isPickingRef.current) return;
    isPickingRef.current = true;
    setIsAddingBatch(true);

    try {
      const result = await onAddFiles(selectedFiles);
      if (result.errors.length > 0) {
        Haptics.error();
        setValidationErrors(result.errors);
      } else {
        setValidationErrors([]);
      }
      if (result.addedCount > 0) {
        Haptics.selection();
      }
    } catch {
      Haptics.error();
      setValidationErrors(['Could not add one or more selected files. Please try again.']);
    } finally {
      isPickingRef.current = false;
      setIsAddingBatch(false);
    }
  };

  const handleRemove = (docId: string) => {
    Haptics.selection();
    onRemoveDocument(docId);
  };

  const handleRetry = (docId: string) => {
    Haptics.buttonPress();
    onRetryDocument(docId);
  };

  const handleContinueClick = () => {
    if (!canContinue || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsContinuing(true);
    Haptics.selection();

    try {
      onContinue();
    } finally {
      window.setTimeout(() => {
        isSubmittingRef.current = false;
        setIsContinuing(false);
      }, 300);
    }
  };

  const renderStatusControl = (doc: UploadedPrintDocument) => {
    if (doc.status === 'Ready') {
      return (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <StatusIndicator tone="success" label="Ready" size="sm" />
          <span className="text-[11.5px] font-medium text-[#545D56] tabular-nums">
            {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
          </span>
        </div>
      );
    }

    if (doc.status === 'Failed') {
      return (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <StatusIndicator tone="error" label="Failed" size="sm" />
            <button
              type="button"
              onClick={() => handleRetry(doc.id)}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[#FFF1F2] border border-[#FECDD3] text-[12px] font-semibold text-[#93000A] hover:bg-[#FFE4E6] active:scale-[0.97] transition-all cursor-pointer"
            >
              <ArrowClockwise size={13} weight="bold" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
          {doc.errorMessage && (
            <p className="text-[12px] text-[#93000A] leading-snug">
              {doc.errorMessage}
            </p>
          )}
        </div>
      );
    }

    if (doc.status === 'Waiting') {
      return (
        <div className="mt-2 flex items-center gap-2">
          <StatusIndicator tone="neutral" label="Waiting" size="sm" />
        </div>
      );
    }

    const uploadedLabel =
      typeof doc.uploadedBytes === 'number' && doc.sizeBytes > 0
        ? `${formatFileSize(doc.uploadedBytes)} / ${formatFileSize(doc.sizeBytes)}`
        : `${doc.progressPercent}%`;

    const stageLabel =
      doc.status === 'Processing document...' || doc.status === 'Preparing preview...'
        ? 'Processing...'
        : `Uploading · ${uploadedLabel}`;

    return (
      <div className="mt-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[11.5px]">
          <span className="font-semibold text-[#194F34] truncate">{stageLabel}</span>
          <span className="font-bold text-[#194F34] tabular-nums shrink-0">
            {doc.progressPercent}%
          </span>
        </div>
        <ProgressBar value={doc.progressPercent} size="sm" tone="brand" />
      </div>
    );
  };

  const validationBannerMessage =
    validationErrors.length === 1
      ? validationErrors[0]
      : validationErrors.length > 1
        ? `${validationErrors[0]} (+${validationErrors.length - 1} more)`
        : '';

  return (
    <motion.div
      variants={pageTransitionVariants}
      initial="initial"
      animate="animate"
      className={`flex flex-col flex-1 w-full ${
        embeddedInTab ? 'pb-44' : 'pb-28'
      }`}
    >
      {/* Hidden Real Native Multiple File Input */}
      <input
        ref={fileInputRef}
        id="files-page-native-picker"
        data-testid="files-page-native-input"
        type="file"
        multiple
        accept={NATIVE_FILE_ACCEPT_ATTR}
        onChange={handleFileInputChange}
        className="sr-only"
        tabIndex={-1}
      />

      {/* Top Header */}
      <header className="pt-2 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {!embeddedInTab && onBack && (
              <IconButton
                variant="surface"
                size="md"
                aria-label="Go back"
                icon={<ArrowLeft size={18} weight="bold" />}
                onClick={onBack}
              />
            )}
            <div className="min-w-0">
              <PageHeading>Add Your Files</PageHeading>
              <SecondaryText className="mt-1">
                Select the documents you want to print.
              </SecondaryText>
            </div>
          </div>

          {session.connected && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EAF3ED] border border-[#194F34]/12 text-[12px] font-semibold text-[#194F34] shrink-0">
              <Printer size={14} weight="bold" aria-hidden="true" />
              <span>{session.activeStation.name}</span>
            </div>
          )}
        </div>

        {session.connected && (
          <div className="sm:hidden mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#545D56]">
            <Printer size={14} weight="regular" className="text-[#194F34] shrink-0" aria-hidden="true" />
            <span>
              Kiosk: <strong className="font-semibold text-[#191C1A]">{session.activeStation.name}</strong>
            </span>
          </div>
        )}
      </header>

      {/* Primary File Picker Action */}
      <section aria-label="Choose files" className="mb-6">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={isAddingBatch}
          onClick={handleOpenPicker}
          className="group min-h-[54px] text-[15px] shadow-[0_2px_8px_rgba(25,79,52,0.16)]"
          leftIcon={
            <motion.span
              className="inline-flex items-center justify-center"
              whileHover={{ y: -1.5, scale: 1.05 }}
              transition={{ duration: 0.16, ease: PP_EASE.standard }}
            >
              <FolderOpen size={20} weight="fill" aria-hidden="true" />
            </motion.span>
          }
        >
          Choose Files
        </Button>

        <p className="mt-2.5 text-center text-[12px] text-[#545D56] leading-relaxed px-1">
          Supports PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, JPEG, PNG, TXT and CSV · Max 100 MB per file
        </p>
      </section>

      {/* Validation & Duplicate Feedback */}
      {validationBannerMessage && (
        <div className="mb-5" data-testid="files-validation-error">
          <ErrorState
            variant="banner"
            message={validationBannerMessage}
            onDismiss={() => setValidationErrors([])}
          />
        </div>
      )}

      {/* Selected Files List */}
      <section aria-label="Selected files" className="flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-2.5 px-0.5">
          <SectionHeading>Selected Files</SectionHeading>
          {sortedDocs.length > 0 && (
            <span className="text-[12px] font-medium text-[#545D56] tabular-nums">
              {sortedDocs.length} {sortedDocs.length === 1 ? 'file' : 'files'} ·{' '}
              {formatFileSize(totalSizeBytes)}
            </span>
          )}
        </div>

        {sortedDocs.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={24} weight="duotone" aria-hidden="true" />}
            title="No files selected yet"
            description="Tap Choose Files above to add documents from your phone storage or cloud drive."
          />
        ) : (
          <SurfaceCard padding="none" className="overflow-hidden divide-y divide-[#E4EAE5]">
            <AnimatePresence initial={false}>
              {sortedDocs.map((doc) => {
                const fileExtLabel = getFileTypeShortLabel(doc.name);
                return (
                  <motion.div
                    key={doc.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.18, ease: PP_EASE.standard }}
                    data-testid={`selected-file-row-${doc.id}`}
                    className="p-3.5 sm:p-4 flex items-start gap-3 bg-white"
                  >
                    <div className="pt-0.5 shrink-0">
                      <FileTypeIcon fileName={doc.name} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-[14px] font-semibold text-[#191C1A] truncate leading-snug"
                            title={doc.name}
                          >
                            {doc.name}
                          </p>
                          <p className="text-[12px] text-[#545D56] mt-0.5 tabular-nums truncate">
                            {fileExtLabel} · {formatFileSize(doc.sizeBytes)}
                          </p>
                        </div>

                        <IconButton
                          variant="ghost"
                          size="md"
                          aria-label={`Remove ${doc.name}`}
                          icon={<Trash size={17} weight="regular" />}
                          onClick={() => handleRemove(doc.id)}
                          className="-mr-1.5 -mt-1.5 text-[#545D56] hover:text-[#BA1A1A] hover:bg-[#FFF1F2]"
                        />
                      </div>

                      {renderStatusControl(doc)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </SurfaceCard>
        )}
      </section>

      {/* Prominent Bottom Continue Action */}
      <div
        className={`fixed left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E4EAE5] px-4 py-3 ${
          embeddedInTab
            ? 'bottom-[calc(66px+env(safe-area-inset-bottom,0px))]'
            : 'bottom-0 pb-safe'
        }`}
      >
        <div className="max-w-md md:max-w-3xl lg:max-w-4xl mx-auto w-full flex flex-col gap-2">
          {sortedDocs.length > 0 && (
            <div className="flex items-center justify-between gap-2 text-[12px] px-0.5 tabular-nums">
              {failedDocs.length > 0 ? (
                <span className="font-semibold text-[#BA1A1A]">
                  {failedDocs.length}{' '}
                  {failedDocs.length === 1 ? 'file needs attention' : 'files need attention'} — retry or remove to continue
                </span>
              ) : isAnyProcessing ? (
                <span className="font-semibold text-[#194F34]">
                  Reading and preparing your files...
                </span>
              ) : (
                <span className="font-semibold text-[#194F34]">
                  {readyDocs.length} {readyDocs.length === 1 ? 'file' : 'files'} ready ·{' '}
                  {totalReadyPages} {totalReadyPages === 1 ? 'page' : 'pages'}
                </span>
              )}
              <span className="text-[#545D56] font-medium shrink-0">
                {formatFileSize(totalSizeBytes)}
              </span>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isAnyProcessing || isContinuing}
            disabled={!canContinue}
            onClick={handleContinueClick}
            rightIcon={<ArrowRight size={17} weight="bold" aria-hidden="true" />}
            data-testid="files-continue-button"
          >
            Continue
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
