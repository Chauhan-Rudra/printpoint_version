import React, { useState, useEffect } from 'react';
import {
  Minus,
  Plus,
  Check,
  ArrowLeft,
  FileText,
  Layers,
  Scissors,
} from 'lucide-react';
import {
  BlankPageItem,
  ColourOption,
  PrintDocumentSettings,
  SidesOption,
  UploadedPrintDocument,
} from '../types/kiosk';
import {
  calculateLivePrintEstimate,
  formatInrCurrency,
  PRICE_INR_PER_PAGE_BW,
  PRICE_INR_PER_PAGE_COLOUR,
} from '../utils/kioskLogic';
import { triggerHaptic } from '../utils/haptics';
import { LiveDocumentViewer } from './LiveDocumentViewer';
import { BlankPageDetectionSection } from './BlankPageDetectionSection';
import { ReviewBlankPagesModal } from './ReviewBlankPagesModal';
import { ConfirmRemovalModal } from './ConfirmRemovalModal';
import { FullScreenPdfEditor } from './tools/FullScreenPdfEditor';

interface PreferencesStepProps {
  documents: UploadedPrintDocument[];
  globalSettings: PrintDocumentSettings;
  previewBeforePrint: boolean;
  onTogglePreviewBeforePrint: () => void;
  onUpdateGlobalSettings: (next: Partial<PrintDocumentSettings>) => void;
  onUpdateBlankPages?: (
    docId: string,
    blankPages: number[],
    uncertainPages?: number[]
  ) => void;
  onRemoveBlankPages?: (docPagesMap: Record<string, number[]>) => Promise<void>;
  onRestoreOriginalPages?: () => void;
  onReplaceDocument?: (docId: string, newFile: File) => void;
  onBack: () => void;
  onContinueToPayment: () => void;
  isMobileView?: boolean;
}

export const PreferencesStep: React.FC<PreferencesStepProps> = ({
  documents,
  globalSettings,
  previewBeforePrint,
  onTogglePreviewBeforePrint,
  onUpdateGlobalSettings,
  onUpdateBlankPages,
  onRemoveBlankPages,
  onRestoreOriginalPages,
  onReplaceDocument,
  onBack,
  onContinueToPayment,
  isMobileView,
}) => {
  const readyDocs = documents
    .filter((d) => d.status === 'Ready')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const activeDocs = readyDocs.length > 0 ? readyDocs : documents;
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const activeDocId =
    activeDocs.some((d) => d.id === selectedDocId)
      ? selectedDocId
      : activeDocs[0]?.id ?? '';

  const activeDoc = activeDocs.find((d) => d.id === activeDocId) || activeDocs[0];

  // State for Review & Confirmation Modals
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isRemovingPages, setIsRemovingPages] = useState<boolean>(false);
  const [isPdfEditorOpen, setIsPdfEditorOpen] = useState<boolean>(false);

  // Viewer navigation targets from Review flow
  const [viewerTargetPage, setViewerTargetPage] = useState<number | null>(null);
  const [viewerHighlightedPage, setViewerHighlightedPage] = useState<
    number | null
  >(null);

  // Build active detected blank items across all ready documents
  const detectedItems: BlankPageItem[] = [];
  for (const doc of activeDocs) {
    if (doc.blankPages && doc.blankPages.length > 0) {
      for (const p of doc.blankPages) {
        detectedItems.push({
          documentId: doc.id,
          documentName: doc.name,
          pageNumber: p,
          confidence: doc.uncertainPages?.includes(p) ? 'needs_review' : 'high',
          reason: doc.uncertainPages?.includes(p)
            ? 'Faint artifact / border margin detected'
            : 'Empty page content detected',
        });
      }
    }
  }

  // Build removed blank items (for restore support)
  const removedItems: BlankPageItem[] = [];
  for (const doc of activeDocs) {
    if (doc.removedBlankPages && doc.removedBlankPages.length > 0) {
      for (const p of doc.removedBlankPages) {
        removedItems.push({
          documentId: doc.id,
          documentName: doc.name,
          pageNumber: p,
          confidence: 'high',
          reason: 'Excluded by user',
        });
      }
    }
  }

  // Selected indices in detectedItems for removal (default: all checked)
  const [selectedReviewIndices, setSelectedReviewIndices] = useState<number[]>(
    []
  );

  useEffect(() => {
    // Keep review indices in sync with current detected items count
    setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
  }, [detectedItems.length]);

  const liveEstimate = calculateLivePrintEstimate(activeDocs, globalSettings);

  const handleColourChange = (colourMode: ColourOption) => {
    onUpdateGlobalSettings({ colourMode });
  };

  const handleSidesChange = (sides: SidesOption) => {
    onUpdateGlobalSettings({ sides });
  };

  const handleCopiesDelta = (delta: number) => {
    const nextCopies = Math.max(1, Math.min(99, globalSettings.copies + delta));
    onUpdateGlobalSettings({ copies: nextCopies });
  };

  // Open Review Dialog and navigate viewer to the first blank page
  const handleOpenReview = () => {
    if (detectedItems.length > 0) {
      const first = detectedItems[0];
      setSelectedDocId(first.documentId);
      setViewerTargetPage(first.pageNumber);
      setViewerHighlightedPage(first.pageNumber);
    }
    setIsReviewModalOpen(true);
  };

  const handleJumpToPageFromReview = (
    docId: string,
    pageNumber: number
  ) => {
    setSelectedDocId(docId);
    setViewerTargetPage(pageNumber);
    setViewerHighlightedPage(pageNumber);
  };

  const handleToggleReviewIndex = (index: number) => {
    setSelectedReviewIndices((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  const handleSelectAllReview = (select: boolean) => {
    if (select) {
      setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
    } else {
      setSelectedReviewIndices([]);
    }
  };

  // Proceed from Review Modal to Confirmation Modal
  const handleProceedFromReviewToConfirm = () => {
    setIsReviewModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  // Directly request removal from main detection card
  const handleDirectRequestRemoval = () => {
    setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
    setIsConfirmModalOpen(true);
  };

  // Execute PDF Page Removal via pdf-lib
  const handleExecuteRemoval = async () => {
    if (!onRemoveBlankPages) {
      setIsConfirmModalOpen(false);
      return;
    }

    setIsRemovingPages(true);

    // Group chosen pages to remove by documentId
    const pagesMap: Record<string, number[]> = {};
    for (const idx of selectedReviewIndices) {
      const item = detectedItems[idx];
      if (item) {
        if (!pagesMap[item.documentId]) {
          pagesMap[item.documentId] = [];
        }
        if (!pagesMap[item.documentId].includes(item.pageNumber)) {
          pagesMap[item.documentId].push(item.pageNumber);
        }
      }
    }

    try {
      await onRemoveBlankPages(pagesMap);
      triggerHaptic('success');
      setViewerHighlightedPage(null);
    } catch (err) {
      console.error('Error removing blank pages:', err);
    } finally {
      setIsRemovingPages(false);
      setIsConfirmModalOpen(false);
    }
  };

  const handleRestore = () => {
    if (onRestoreOriginalPages) {
      onRestoreOriginalPages();
      triggerHaptic('selection');
      setViewerHighlightedPage(null);
    }
  };

  const isBw = globalSettings.colourMode === 'bw';
  const isColour = globalSettings.colourMode === 'colour';
  const isOneSided = globalSettings.sides === '1-sided';
  const isTwoSided = globalSettings.sides === '2-sided';

  return (
    <div
      data-testid="preview-and-print-screen"
      className="flex flex-col flex-1 w-full pb-6 animate-apple-reveal"
    >
      {/* Top Back Navigation with Bar Type Cover */}
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            onBack();
          }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-black/[0.08] text-[12px] font-semibold text-[#141A16] shadow-2xs hover:bg-[#F8FAF8] hover:border-black/15 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#1B4D2E]" />
          <span>Back</span>
        </button>

        {activeDoc && activeDoc.name.toLowerCase().endsWith('.pdf') && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsPdfEditorOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#EDF5F0] border border-[#1B4D2E]/25 text-[12px] font-bold text-[#1B4D2E] shadow-2xs hover:bg-[#E2EFE7] active:scale-95 transition-all"
          >
            <Scissors className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Edit Document</span>
          </button>
        )}
      </div>

      {/* 1. Screen Heading & Supporting Text */}
      <section className="mb-3">
        <h1 className="text-[21px] font-bold text-[#141A16] tracking-tight leading-tight">
          Preview &amp; Print
        </h1>
        <p className="text-[12.5px] text-[#5B645E] leading-snug mt-0.5">
          Review your documents and customise your print settings.
        </p>
      </section>

      {/* 1. PDF Live Preview – Main Section */}
      {previewBeforePrint && (
        <div className="animate-apple-card">
          <LiveDocumentViewer
            documents={activeDocs}
            activeDocId={activeDocId}
            onSelectDocument={(id) => {
              setSelectedDocId(id);
              setViewerHighlightedPage(null);
            }}
            colourMode={globalSettings.colourMode}
            sides={globalSettings.sides}
            removeBlankPages={globalSettings.removeBlankPages ?? true}
            targetPage={viewerTargetPage}
            highlightedPage={viewerHighlightedPage}
            isMobileView={isMobileView}
            onUpdateBlankPages={onUpdateBlankPages}
          />
        </div>
      )}

      {/* Divider 1: Between PDF Live Preview and Blank Page Detection & Removal */}
      {previewBeforePrint && (
        <div
          data-testid="divider-preview-to-blank-detection"
          className="my-3.5 border-t border-[#E3E8E4]"
          role="separator"
        />
      )}

      {/* 2. Blank Page Detection & Removal (Immediately ABOVE "Preview pages before you print") */}
      <BlankPageDetectionSection
        isAnalyzing={activeDocs.some((d) => d.isAnalyzingBlanks)}
        hasScanned={true}
        detectedItems={detectedItems}
        removedItems={removedItems}
        onReviewPages={handleOpenReview}
        onRequestRemoval={handleDirectRequestRemoval}
        onRestoreOriginal={handleRestore}
      />

      {/* Divider 2: Between Blank Page Detection and Preview Pages Before You Print */}
      <div
        data-testid="divider-blank-detection-to-preview-toggle"
        className="my-3.5 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 3. Preview pages before you print */}
      <div>
        <button
          type="button"
          role="switch"
          aria-checked={previewBeforePrint}
          data-testid="preview-pages-toggle"
          onClick={onTogglePreviewBeforePrint}
          className={`w-full min-h-[38px] px-3.5 py-2 rounded-xl border flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.99] ${
            previewBeforePrint
              ? 'bg-[#EAF3EC] border-[#1B4D2E]/15 text-[#173F26]'
              : 'bg-white border-black/[0.08] text-[#5B645E]'
          }`}
        >
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              previewBeforePrint
                ? 'bg-[#2E7D47] text-white'
                : 'bg-black/15 text-white'
            }`}
          >
            <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight">
            Preview pages before you print
          </span>
        </button>
      </div>

      {/* Divider 3: Between Preview Pages Before You Print and Number of Copies */}
      <div
        data-testid="divider-preview-toggle-to-copies"
        className="my-3.5 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 4. Number of Copies */}
      <section className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-bold text-[#191C1A] leading-tight">
            Number of Copies
          </h2>
        </div>

        <div className="h-9 px-1 rounded-xl bg-[#1B4D2E] text-white flex items-center gap-1 shadow-[0_2px_6px_rgba(27,77,46,0.18)]">
          <button
            type="button"
            onClick={() => handleCopiesDelta(-1)}
            disabled={globalSettings.copies <= 1}
            aria-label="Decrease number of copies"
            data-testid="decrease-copies-btn"
            className="w-7 h-7 rounded-lg text-white hover:bg-white/15 disabled:opacity-40 flex items-center justify-center transition-all active:scale-95"
          >
            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          <span
            data-testid="copies-quantity"
            className="min-w-[26px] text-center text-[13.5px] font-bold text-white tabular-nums"
          >
            {globalSettings.copies}
          </span>

          <button
            type="button"
            onClick={() => handleCopiesDelta(1)}
            aria-label="Increase number of copies"
            data-testid="increase-copies-btn"
            className="w-7 h-7 rounded-lg text-white hover:bg-white/15 flex items-center justify-center transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </section>

      {/* Divider 4: Between Number of Copies and Colour Mode */}
      <div
        data-testid="divider-copies-to-colour"
        className="my-3.5 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 5. Colour Mode Selection */}
      <section>
        <h2 className="text-[13.5px] font-bold text-[#191C1A] mb-2.5 leading-tight">
          Colour Mode
        </h2>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Card 1: Black & White */}
          <button
            type="button"
            onClick={() => handleColourChange('bw')}
            aria-pressed={isBw}
            data-testid="colour-card-bw"
            className={`relative h-[108px] p-3 rounded-2xl text-left overflow-hidden transition-all duration-150 flex flex-col justify-between active:scale-[0.98] ${
              isBw
                ? 'bg-[#F2F8F4] border-2 border-[#1B4D2E] shadow-[0_4px_14px_rgba(27,77,46,0.08)]'
                : 'bg-white border border-black/[0.08] hover:border-black/15'
            }`}
          >
            <div className="flex items-start justify-between gap-1.5 z-10">
              <div>
                <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                  Black &amp; White
                </span>
                <span className="text-[11.5px] font-medium text-[#5B645E] mt-0.5 block">
                  ₹{PRICE_INR_PER_PAGE_BW}/page
                </span>
              </div>

              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isBw
                    ? 'bg-[#1B4D2E] text-white shadow-2xs'
                    : 'border border-black/20 bg-white text-transparent'
                }`}
                aria-hidden="true"
              >
                <Check className="w-3 h-3 stroke-[2.75]" />
              </span>
            </div>

            <div
              className="pointer-events-none absolute -bottom-2.5 right-2.5 w-16 h-12"
              aria-hidden="true"
            >
              <span className="absolute bottom-2 left-3 w-8 h-8 rounded-full bg-[#9AA09C]/80" />
              <span className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-[#4A4F4C]/90" />
              <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#141715]" />
            </div>
          </button>

          {/* Card 2: Colour */}
          <button
            type="button"
            onClick={() => handleColourChange('colour')}
            aria-pressed={isColour}
            data-testid="colour-card-colour"
            className={`relative h-[108px] p-3 rounded-2xl text-left overflow-hidden transition-all duration-150 flex flex-col justify-between active:scale-[0.98] ${
              isColour
                ? 'bg-[#F2F8F4] border-2 border-[#1B4D2E] shadow-[0_4px_14px_rgba(27,77,46,0.08)]'
                : 'bg-white border border-black/[0.08] hover:border-black/15'
            }`}
          >
            <div className="flex items-start justify-between gap-1.5 z-10">
              <div>
                <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                  Colour
                </span>
                <span className="text-[11.5px] font-medium text-[#5B645E] mt-0.5 block">
                  ₹{PRICE_INR_PER_PAGE_COLOUR}/page
                </span>
              </div>

              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isColour
                    ? 'bg-[#1B4D2E] text-white shadow-2xs'
                    : 'border border-black/20 bg-white text-transparent'
                }`}
                aria-hidden="true"
              >
                <Check className="w-3 h-3 stroke-[2.75]" />
              </span>
            </div>

            <div
              className="pointer-events-none absolute -bottom-2.5 right-2.5 w-16 h-12"
              aria-hidden="true"
            >
              <span className="absolute bottom-2 left-3 w-8 h-8 rounded-full bg-[#5B8DEF]/85" />
              <span className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-[#A3166B]/90" />
              <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#7CB518]/90" />
            </div>
          </button>
        </div>
      </section>

      {/* Divider 5: Between Colour Mode and Print Sides */}
      <div
        data-testid="divider-colour-to-sides"
        className="my-3.5 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 6. Print Sides Selection */}
      <section>
        <h2 className="text-[13.5px] font-bold text-[#191C1A] mb-2.5 leading-tight">
          Print Sides
        </h2>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Option 1: 1-Sided */}
          <button
            type="button"
            onClick={() => handleSidesChange('1-sided')}
            aria-pressed={isOneSided}
            data-testid="sides-card-1-sided"
            className={`p-3 rounded-2xl text-left transition-all duration-150 flex flex-col justify-between min-h-[78px] active:scale-[0.98] ${
              isOneSided
                ? 'bg-[#F2F8F4] border-2 border-[#1B4D2E] shadow-[0_4px_14px_rgba(27,77,46,0.08)]'
                : 'bg-white border border-black/[0.08] hover:border-black/15'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" aria-hidden="true" />
              </div>

              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isOneSided
                    ? 'bg-[#1B4D2E] text-white'
                    : 'border border-black/20 bg-white text-transparent'
                }`}
                aria-hidden="true"
              >
                <Check className="w-3 h-3 stroke-[2.75]" />
              </span>
            </div>

            <div>
              <span className="text-[13px] font-bold text-[#191C1A] block leading-tight">
                1-Sided
              </span>
              <span className="text-[11px] text-[#5B645E] leading-snug block mt-0.5">
                Print on one side
              </span>
            </div>
          </button>

          {/* Option 2: 2-Sided */}
          <button
            type="button"
            onClick={() => handleSidesChange('2-sided')}
            aria-pressed={isTwoSided}
            data-testid="sides-card-2-sided"
            className={`p-3 rounded-2xl text-left transition-all duration-150 flex flex-col justify-between min-h-[78px] active:scale-[0.98] ${
              isTwoSided
                ? 'bg-[#F2F8F4] border-2 border-[#1B4D2E] shadow-[0_4px_14px_rgba(27,77,46,0.08)]'
                : 'bg-white border border-black/[0.08] hover:border-black/15'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-[#EAF3EC] text-[#1B4D2E] flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" aria-hidden="true" />
              </div>

              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isTwoSided
                    ? 'bg-[#1B4D2E] text-white'
                    : 'border border-black/20 bg-white text-transparent'
                }`}
                aria-hidden="true"
              >
                <Check className="w-3 h-3 stroke-[2.75]" />
              </span>
            </div>

            <div>
              <span className="text-[13px] font-bold text-[#191C1A] block leading-tight">
                2-Sided
              </span>
              <span className="text-[11px] text-[#5B645E] leading-snug block mt-0.5">
                Print front and back
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* Divider 6: Between Print Sides and Print Summary */}
      <div
        data-testid="divider-sides-to-summary"
        className="my-3.5 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 7. Live Print Summary */}
      <section
        aria-label="Live Print Summary"
        data-testid="live-print-summary"
        className="rounded-2xl bg-white border border-black/[0.06] p-4 shadow-2xs"
      >
        <div className="space-y-2.5 text-[12.5px]">
          <div className="flex items-center justify-between">
            <span className="text-[#5B645E]">Documents</span>
            <span
              data-testid="live-summary-docs"
              className="font-semibold text-[#191C1A] tabular-nums"
            >
              {liveEstimate.documentCount}{' '}
              {liveEstimate.documentCount === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#5B645E]">Total pages</span>
            <span
              data-testid="live-summary-pages"
              className="font-semibold text-[#191C1A] tabular-nums"
            >
              {liveEstimate.totalPrintedPages / Math.max(1, globalSettings.copies)}{' '}
              {liveEstimate.totalPrintedPages === 1 ? 'page' : 'pages'}
              {removedItems.length > 0 && (
                <span className="text-[10.5px] text-[#2E7D47] ml-1.5 font-bold">
                  ({removedItems.length} blank removed)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#5B645E]">Print options</span>
            <span className="font-semibold text-[#141A16]">
              <span data-testid="live-summary-mode">
                {liveEstimate.colourModeLabel}
              </span>
              <span className="text-[#9BA59D] mx-1.5">·</span>
              <span data-testid="live-summary-sides">
                {liveEstimate.sidesModeLabel}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#5B645E]">Copies &amp; paper</span>
            <span className="font-semibold text-[#141A16] tabular-nums">
              <span data-testid="live-summary-copies">{liveEstimate.copies}</span>{' '}
              {liveEstimate.copies === 1 ? 'copy' : 'copies'}
              <span className="text-[#9BA59D] mx-1.5">·</span>
              <span>
                {liveEstimate.totalSheets}{' '}
                {liveEstimate.totalSheets === 1 ? 'sheet' : 'sheets'}
              </span>
            </span>
          </div>

          {removedItems.length > 0 && (
            <div className="flex items-center justify-between text-[#1B4D2E] bg-[#EAF3EC] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold mt-1">
              <span>🌱 Paper Saver active</span>
              <span>
                {removedItems.length} blank{' '}
                {removedItems.length === 1 ? 'page' : 'pages'} excluded
              </span>
            </div>
          )}
        </div>

        <div className="my-3 border-t border-[#EAEFEA]" />

        <div className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-bold text-[#191C1A]">
            Estimated total
          </span>
          <span
            data-testid="live-summary-total"
            className="text-[20px] font-bold text-[#1B4D2E] tabular-nums tracking-tight"
          >
            {formatInrCurrency(liveEstimate.estimatedTotalInr)}
          </span>
        </div>
      </section>

      {/* Divider 7: Blank space and subtle divider below total cost section */}
      <div
        data-testid="divider-summary-to-payment"
        className="my-4 border-t border-[#E3E8E4]"
        role="separator"
      />

      {/* 8. Continue to Payment Option – Positioned directly below Total Cost with clean spacing */}
      <div className="w-full">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('buttonPress');
            onContinueToPayment();
          }}
          data-testid="continue-to-payment-btn"
          className="w-full min-h-[48px] rounded-xl bg-[#1B4D2E] hover:bg-[#153D24] text-white font-bold text-[15px] flex items-center justify-center shadow-[0_4px_12px_rgba(27,77,46,0.22)] transition-all duration-150 active:scale-[0.99]"
        >
          Continue to Payment
        </button>
      </div>

      {/* Interactive Review Modal */}
      <ReviewBlankPagesModal
        isOpen={isReviewModalOpen}
        detectedItems={detectedItems}
        selectedIndices={selectedReviewIndices}
        onToggleIndex={handleToggleReviewIndex}
        onSelectAll={handleSelectAllReview}
        onJumpToPage={handleJumpToPageFromReview}
        onProceedToRemove={handleProceedFromReviewToConfirm}
        onClose={() => setIsReviewModalOpen(false)}
      />

      {/* Explicit Confirmation Modal */}
      <ConfirmRemovalModal
        isOpen={isConfirmModalOpen}
        blankCount={selectedReviewIndices.length}
        documentCount={activeDocs.length}
        isRemoving={isRemovingPages}
        onCancel={() => setIsConfirmModalOpen(false)}
        onConfirm={handleExecuteRemoval}
      />

      {/* Full-Screen PDF Editor */}
      {isPdfEditorOpen && activeDoc && (activeDoc.rawFile || activeDoc.originalFile) && (
        <FullScreenPdfEditor
          isOpen={isPdfEditorOpen}
          file={activeDoc.rawFile || activeDoc.originalFile}
          onClose={() => setIsPdfEditorOpen(false)}
          onSaveAndPrint={(editedFile) => {
            setIsPdfEditorOpen(false);
            if (onReplaceDocument) {
              onReplaceDocument(activeDoc.id, editedFile);
            }
          }}
        />
      )}
    </div>
  );
};
