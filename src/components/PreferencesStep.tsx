import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Leaf,
  Minus,
  Plus,
  Scissors,
  Stack,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  BlankPageItem,
  ColourOption,
  PrintDocumentSettings,
  SidesOption,
  UploadedPrintDocument,
} from '../types/kiosk';
import { formatInrCurrency } from '../utils/kioskLogic';
import { useKioskSession } from '../utils/kioskSession';
import {
  BackendPricingConfig,
  calculatePerDocumentPricing,
  fetchBackendPricingConfig,
  MAX_PRINT_COPIES,
  MIN_PRINT_COPIES,
  PerDocumentPricingBreakdown,
  verifyPricingAndSessionForPayment,
} from '../utils/pricingService';
import { Haptics, triggerHaptic } from '../utils/haptics';
import { FileTypeIcon } from './FileTypeIcon';
import { LiveDocumentViewer } from './LiveDocumentViewer';
import { BlankPageDetectionSection } from './BlankPageDetectionSection';
import { ReviewBlankPagesModal } from './ReviewBlankPagesModal';
import { ConfirmRemovalModal } from './ConfirmRemovalModal';
import { FullScreenPdfEditor } from './tools/FullScreenPdfEditor';
import { Button, ErrorState, LoadingState } from './ui';

interface PreferencesStepProps {
  documents: UploadedPrintDocument[];
  globalSettings: PrintDocumentSettings;
  previewBeforePrint: boolean;
  onTogglePreviewBeforePrint: () => void;
  onUpdateDocumentSettings: (
    docId: string,
    next: Partial<PrintDocumentSettings>
  ) => void;
  onUpdateBlankPages?: (
    docId: string,
    blankPages: number[],
    uncertainPages?: number[]
  ) => void;
  onRemoveBlankPages?: (docPagesMap: Record<string, number[]>) => Promise<void>;
  onRestoreOriginalPages?: () => void;
  onReplaceDocument?: (docId: string, newFile: File) => void;
  onReconnectKiosk?: () => void;
  onBack: () => void;
  onContinueToPayment: (verifiedBreakdown: PerDocumentPricingBreakdown) => void;
  isMobileView?: boolean;
}

export const PreferencesStep: React.FC<PreferencesStepProps> = ({
  documents,
  onUpdateDocumentSettings,
  onUpdateBlankPages,
  onRemoveBlankPages,
  onRestoreOriginalPages,
  onReplaceDocument,
  onReconnectKiosk,
  onBack,
  onContinueToPayment,
  isMobileView,
}) => {
  const { session } = useKioskSession();

  const orderedDocs = useMemo(() => {
    const readyDocs = documents.filter((d) => d.status === 'Ready');
    const source = readyDocs.length > 0 ? readyDocs : documents;
    return [...source].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [documents]);

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const activeDocId = orderedDocs.some((d) => d.id === selectedDocId)
    ? selectedDocId
    : orderedDocs[0]?.id ?? '';
  const activeDoc =
    orderedDocs.find((d) => d.id === activeDocId) || orderedDocs[0];

  // Backend pricing configuration state
  const [pricingConfig, setPricingConfig] = useState<BackendPricingConfig | null>(
    null
  );
  const [pricingLoading, setPricingLoading] = useState<boolean>(true);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const loadPricingConfig = async () => {
    setPricingLoading(true);
    setPricingError(null);
    const result = await fetchBackendPricingConfig(session.activeStation);
    if (result.available) {
      setPricingConfig(result.config);
      setPricingError(null);
    } else {
      setPricingConfig(null);
      setPricingError(result.error);
    }
    setPricingLoading(false);
  };

  useEffect(() => {
    void loadPricingConfig();
  }, [
    session.activeStation.id,
    session.activeStation.bwRateInr,
    session.activeStation.colourRateInr,
  ]);

  // Blank page review & full editor state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isRemovingPages, setIsRemovingPages] = useState<boolean>(false);
  const [isPdfEditorOpen, setIsPdfEditorOpen] = useState<boolean>(false);
  const [viewerTargetPage, setViewerTargetPage] = useState<number | null>(null);
  const [viewerHighlightedPage, setViewerHighlightedPage] = useState<
    number | null
  >(null);

  // Payment submission & validation state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submitLockRef = useRef<boolean>(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    isSessionExpired?: boolean;
  } | null>(null);

  const detectedItems: BlankPageItem[] = useMemo(() => {
    const items: BlankPageItem[] = [];
    for (const doc of orderedDocs) {
      if (doc.blankPages && doc.blankPages.length > 0) {
        for (const p of doc.blankPages) {
          items.push({
            documentId: doc.id,
            documentName: doc.name,
            pageNumber: p,
            confidence: doc.uncertainPages?.includes(p)
              ? 'needs_review'
              : 'high',
            reason: doc.uncertainPages?.includes(p)
              ? 'Faint artifact / border margin detected'
              : 'Empty page content detected',
          });
        }
      }
    }
    return items;
  }, [orderedDocs]);

  const removedItems: BlankPageItem[] = useMemo(() => {
    const items: BlankPageItem[] = [];
    for (const doc of orderedDocs) {
      if (doc.removedBlankPages && doc.removedBlankPages.length > 0) {
        for (const p of doc.removedBlankPages) {
          items.push({
            documentId: doc.id,
            documentName: doc.name,
            pageNumber: p,
            confidence: 'high',
            reason: 'Excluded by user',
          });
        }
      }
    }
    return items;
  }, [orderedDocs]);

  const [selectedReviewIndices, setSelectedReviewIndices] = useState<number[]>(
    []
  );

  useEffect(() => {
    setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
  }, [detectedItems.length]);

  const pricingBreakdown = useMemo(() => {
    if (!pricingConfig) return null;
    return calculatePerDocumentPricing(orderedDocs, pricingConfig);
  }, [orderedDocs, pricingConfig]);

  const totalRawPages = useMemo(
    () => orderedDocs.reduce((sum, doc) => sum + Math.max(1, doc.pageCount), 0),
    [orderedDocs]
  );

  const minCopies = pricingConfig?.minCopies ?? MIN_PRINT_COPIES;
  const maxCopies = pricingConfig?.maxCopies ?? MAX_PRINT_COPIES;

  const activeSettings: PrintDocumentSettings = activeDoc?.settings ?? {
    colourMode: 'bw',
    sides: '1-sided',
    copies: 1,
    removeBlankPages: true,
  };

  const activePricingItem = pricingBreakdown?.items.find(
    (item) => item.id === activeDoc?.id
  );

  const handleColourChange = (colourMode: ColourOption) => {
    if (!activeDoc) return;
    if (colourMode === 'colour' && pricingConfig && !pricingConfig.supportsColour) {
      return;
    }
    triggerHaptic('selection');
    setSubmitError(null);
    onUpdateDocumentSettings(activeDoc.id, { colourMode });
  };

  const handleSidesChange = (sides: SidesOption) => {
    if (!activeDoc) return;
    if (sides === '2-sided' && pricingConfig && !pricingConfig.supportsDuplex) {
      return;
    }
    triggerHaptic('selection');
    setSubmitError(null);
    onUpdateDocumentSettings(activeDoc.id, { sides });
  };

  const handleCopiesDelta = (delta: number) => {
    if (!activeDoc) return;
    const nextCopies = Math.max(
      minCopies,
      Math.min(maxCopies, activeSettings.copies + delta)
    );
    if (nextCopies === activeSettings.copies) return;
    triggerHaptic('selection');
    setSubmitError(null);
    onUpdateDocumentSettings(activeDoc.id, { copies: nextCopies });
  };

  const handleToggleDocBlankRemoval = () => {
    if (!activeDoc) return;
    triggerHaptic('selection');
    setSubmitError(null);
    onUpdateDocumentSettings(activeDoc.id, {
      removeBlankPages: !(activeSettings.removeBlankPages ?? true),
    });
  };

  const handleOpenReview = () => {
    if (detectedItems.length > 0) {
      const first = detectedItems[0];
      setSelectedDocId(first.documentId);
      setViewerTargetPage(first.pageNumber);
      setViewerHighlightedPage(first.pageNumber);
    }
    setIsReviewModalOpen(true);
  };

  const handleJumpToPageFromReview = (docId: string, pageNumber: number) => {
    setSelectedDocId(docId);
    setViewerTargetPage(pageNumber);
    setViewerHighlightedPage(pageNumber);
  };

  const handleToggleReviewIndex = (index: number) => {
    setSelectedReviewIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSelectAllReview = (select: boolean) => {
    if (select) {
      setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
    } else {
      setSelectedReviewIndices([]);
    }
  };

  const handleProceedFromReviewToConfirm = () => {
    setIsReviewModalOpen(false);
    setIsConfirmModalOpen(true);
  };

  const handleDirectRequestRemoval = () => {
    setSelectedReviewIndices(detectedItems.map((_, idx) => idx));
    setIsConfirmModalOpen(true);
  };

  const handleExecuteRemoval = async () => {
    if (!onRemoveBlankPages) {
      setIsConfirmModalOpen(false);
      return;
    }

    setIsRemovingPages(true);
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
    } catch {
      // Keep clean UI without crash
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

  const canAttemptContinue =
    orderedDocs.length > 0 &&
    orderedDocs.every((d) => d.status === 'Ready') &&
    Boolean(pricingConfig) &&
    !pricingLoading &&
    !isSubmitting;

  const handleContinueClick = async () => {
    if (!canAttemptContinue || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    triggerHaptic('buttonPress');

    try {
      const result = await verifyPricingAndSessionForPayment(
        orderedDocs,
        pricingConfig,
        session
      );

      if (!result.ok) {
        Haptics.error();
        setSubmitError({
          message: result.error,
          isSessionExpired: result.reason === 'session-expired',
        });
        return;
      }

      onContinueToPayment(result.breakdown);
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isBw = activeSettings.colourMode === 'bw';
  const isColour = activeSettings.colourMode === 'colour';
  const isOneSided = activeSettings.sides === '1-sided';
  const isTwoSided = activeSettings.sides === '2-sided';
  const activeDocHasBlanks = (activeDoc?.blankPages?.length ?? 0) > 0;
  const activeIsPdf = Boolean(
    activeDoc &&
      (activeDoc.rawFile?.type === 'application/pdf' ||
        activeDoc.name.toLowerCase().endsWith('.pdf'))
  );

  return (
    <div
      data-testid="preview-and-print-screen"
      className="flex flex-col flex-1 w-full pb-28 animate-view-enter min-w-0"
    >
      {/* Top Action Row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            onBack();
          }}
          className="min-h-[40px] px-3.5 rounded-xl bg-white border border-[#D5DDD7] text-[13px] font-semibold text-[#191C1A] hover:bg-[#F8FAF8] active:scale-95 transition-all inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={15} weight="bold" className="text-[#194F34]" />
          <span>Back</span>
        </button>

        {activeIsPdf && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsPdfEditorOpen(true);
            }}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#EAF3ED] border border-[#194F34]/20 text-[12.5px] font-bold text-[#194F34] hover:bg-[#DFECE4] active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <Scissors size={15} weight="bold" />
            <span>Edit Pages</span>
          </button>
        )}
      </div>

      {/* Heading & Document/Page Totals */}
      <section className="mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-[#191C1A] tracking-[-0.02em] leading-tight">
              Print Settings
            </h1>
            <p className="text-[13px] text-[#545D56] leading-snug mt-1">
              Review your documents and choose how you want them printed.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#EAF3ED] border border-[#B8D6C2] text-[12px] font-bold text-[#194F34] tabular-nums shrink-0">
            <span>
              {orderedDocs.length}{' '}
              {orderedDocs.length === 1 ? 'Document' : 'Documents'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {totalRawPages} {totalRawPages === 1 ? 'Page' : 'Pages'}
            </span>
          </div>
        </div>
      </section>

      {(!session.connected || (typeof session.expiresAt === 'number' && Date.now() > session.expiresAt)) && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-3 text-[12.5px] text-[#93000A] flex items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2 min-w-0">
            <WarningCircle size={18} weight="fill" className="text-[#BA1A1A] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Kiosk session expired or not paired. Scan the kiosk QR code before payment.</span>
          </div>
          {onReconnectKiosk && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReconnectKiosk}
              className="shrink-0 bg-white border-[#FECDD3] text-[#93000A]"
            >
              Scan QR
            </Button>
          )}
        </div>
      )}

      {/* Ordered Document Selector (visible across all uploaded documents in original order) */}
      {orderedDocs.length > 0 && (
        <section aria-label="Uploaded documents" className="mb-4">
          <div className="flex items-center justify-between px-0.5 mb-2">
            <h2 className="text-[13px] font-bold text-[#191C1A]">
              Documents ({orderedDocs.length})
            </h2>
            {orderedDocs.length > 1 && (
              <span className="text-[11.5px] font-medium text-[#545D56]">
                Select a file to configure
              </span>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Uploaded documents in print order"
            className="flex flex-col gap-2"
          >
            {orderedDocs.map((doc, idx) => {
              const isSelected = doc.id === activeDoc?.id;
              const docItem = pricingBreakdown?.items.find((i) => i.id === doc.id);
              const s = doc.settings;

              return (
                <button
                  key={doc.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedDocId(doc.id);
                    setViewerHighlightedPage(null);
                    setViewerTargetPage(1);
                  }}
                  className={`w-full rounded-2xl border p-3 text-left transition-all flex items-center justify-between gap-3 min-w-0 ${
                    isSelected
                      ? 'bg-[#F2F8F4] border-2 border-[#194F34]'
                      : 'bg-white border-[#E2E7E1] hover:border-[#B8D6C2]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums ${
                        isSelected
                          ? 'bg-[#194F34] text-white'
                          : 'bg-[#EEF2EE] text-[#545D56]'
                      }`}
                    >
                      {idx + 1}
                    </span>

                    <FileTypeIcon fileName={doc.name} size="sm" />

                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-[#191C1A] truncate">
                        {doc.name}
                      </p>
                      <p className="text-[11.5px] text-[#545D56] tabular-nums truncate mt-0.5">
                        {doc.pageCount} {doc.pageCount === 1 ? 'pg' : 'pgs'} ·{' '}
                        {s.colourMode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                        {s.sides === '2-sided' ? 'Double-sided' : 'Single-sided'} ·{' '}
                        {s.copies}×
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[14px] font-bold text-[#194F34] tabular-nums block">
                      {docItem ? formatInrCurrency(docItem.subtotalInr) : '—'}
                    </span>
                    <span className="text-[10.5px] font-medium text-[#545D56] tabular-nums">
                      {docItem
                        ? `${docItem.totalSheets} ${
                            docItem.totalSheets === 1 ? 'sheet' : 'sheets'
                          }`
                        : ''}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Content Grid: Actual PDF.js Preview + Per-Document Settings & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start min-w-0">
        {/* Preview Focus */}
        <div className="lg:col-span-7 flex flex-col gap-3.5 min-w-0">
          {activeDoc && (
            <LiveDocumentViewer
              documents={orderedDocs}
              activeDocId={activeDocId}
              onSelectDocument={(id) => {
                setSelectedDocId(id);
                setViewerHighlightedPage(null);
              }}
              colourMode={activeSettings.colourMode}
              sides={activeSettings.sides}
              removeBlankPages={activeSettings.removeBlankPages ?? true}
              targetPage={viewerTargetPage}
              highlightedPage={viewerHighlightedPage}
              isMobileView={isMobileView}
              hideDocumentSelector={true}
              onUpdateBlankPages={onUpdateBlankPages}
            />
          )}

          <BlankPageDetectionSection
            isAnalyzing={orderedDocs.some((d) => d.isAnalyzingBlanks)}
            hasScanned={true}
            detectedItems={detectedItems}
            removedItems={removedItems}
            onReviewPages={handleOpenReview}
            onRequestRemoval={handleDirectRequestRemoval}
            onRestoreOriginal={handleRestore}
          />
        </div>

        {/* Settings + Summary Column */}
        <div className="lg:col-span-5 flex flex-col gap-4 min-w-0">
          {pricingLoading ? (
            <div className="rounded-2xl bg-white border border-[#E2E7E1] p-4">
              <LoadingState
                title="Loading kiosk print rates..."
                subtitle="Fetching configured prices for this station."
              />
            </div>
          ) : pricingError || !pricingConfig ? (
            <ErrorState
              variant="block"
              title="Pricing configuration unavailable"
              message={
                pricingError ||
                'Could not load print rates for this kiosk. Retry before continuing.'
              }
              onRetry={() => void loadPricingConfig()}
            />
          ) : (
            activeDoc && (
              <>
                {/* Selected Document Settings Header */}
                <div className="px-0.5">
                  <h2 className="text-[14px] font-bold text-[#191C1A] truncate">
                    Settings for {activeDoc.name}
                  </h2>
                  <p className="text-[12px] text-[#545D56] mt-0.5 tabular-nums">
                    Changes below apply only to this document (
                    {activeDoc.pageCount}{' '}
                    {activeDoc.pageCount === 1 ? 'page' : 'pages'}).
                  </p>
                </div>

                {/* Colour Mode */}
                <section aria-label="Colour Mode">
                  <h3 className="text-[12.5px] font-bold text-[#191C1A] mb-2 px-0.5">
                    Colour Mode
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleColourChange('bw')}
                      aria-pressed={isBw}
                      data-testid="colour-card-bw"
                      className={`min-h-[82px] p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between active:scale-[0.98] ${
                        isBw
                          ? 'bg-[#F2F8F4] border-2 border-[#194F34]'
                          : 'bg-white border border-[#DCE3DD] hover:border-[#B8D6C2]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div>
                          <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                            Black &amp; White
                          </span>
                          <span className="text-[11.5px] font-medium text-[#545D56] mt-1 block tabular-nums">
                            {formatInrCurrency(pricingConfig.bwPerPageInr)}/page
                          </span>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            isBw
                              ? 'bg-[#194F34] text-white'
                              : 'border border-[#C5CEC7] bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check size={11} weight="bold" />
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={!pricingConfig.supportsColour}
                      onClick={() => handleColourChange('colour')}
                      aria-pressed={isColour}
                      data-testid="colour-card-colour"
                      className={`min-h-[82px] p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${
                        isColour
                          ? 'bg-[#F2F8F4] border-2 border-[#194F34]'
                          : 'bg-white border border-[#DCE3DD] hover:border-[#B8D6C2]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div>
                          <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                            Colour
                          </span>
                          <span className="text-[11.5px] font-medium text-[#545D56] mt-1 block tabular-nums">
                            {pricingConfig.supportsColour
                              ? `${formatInrCurrency(pricingConfig.colourPerPageInr)}/page`
                              : 'Not supported'}
                          </span>
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            isColour
                              ? 'bg-[#194F34] text-white'
                              : 'border border-[#C5CEC7] bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check size={11} weight="bold" />
                        </span>
                      </div>
                    </button>
                  </div>
                </section>

                {/* Print Sides */}
                <section aria-label="Print Sides">
                  <h3 className="text-[12.5px] font-bold text-[#191C1A] mb-2 px-0.5">
                    Print Sides
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSidesChange('1-sided')}
                      aria-pressed={isOneSided}
                      data-testid="sides-card-1-sided"
                      className={`p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between min-h-[84px] active:scale-[0.98] ${
                        isOneSided
                          ? 'bg-[#F2F8F4] border-2 border-[#194F34]'
                          : 'bg-white border border-[#DCE3DD] hover:border-[#B8D6C2]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                          <FileText size={16} weight="duotone" aria-hidden="true" />
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            isOneSided
                              ? 'bg-[#194F34] text-white'
                              : 'border border-[#C5CEC7] bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check size={11} weight="bold" />
                        </span>
                      </div>
                      <div>
                        <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                          Single-sided
                        </span>
                        <span className="text-[11px] text-[#545D56] block mt-0.5 tabular-nums">
                          1 page per sheet
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={!pricingConfig.supportsDuplex}
                      onClick={() => handleSidesChange('2-sided')}
                      aria-pressed={isTwoSided}
                      data-testid="sides-card-2-sided"
                      className={`p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between min-h-[84px] active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${
                        isTwoSided
                          ? 'bg-[#F2F8F4] border-2 border-[#194F34]'
                          : 'bg-white border border-[#DCE3DD] hover:border-[#B8D6C2]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                          <Stack size={16} weight="duotone" aria-hidden="true" />
                        </div>
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            isTwoSided
                              ? 'bg-[#194F34] text-white'
                              : 'border border-[#C5CEC7] bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check size={11} weight="bold" />
                        </span>
                      </div>
                      <div>
                        <span className="text-[13.5px] font-bold text-[#191C1A] block leading-tight">
                          Double-sided
                        </span>
                        <span className="text-[11px] text-[#545D56] block mt-0.5 tabular-nums">
                          {pricingConfig.supportsDuplex
                            ? `${formatInrCurrency(
                                isColour
                                  ? pricingConfig.colourDuplexSheetInr
                                  : pricingConfig.bwDuplexSheetInr
                              )}/duplex sheet`
                            : 'Not supported'}
                        </span>
                      </div>
                    </button>
                  </div>
                </section>

                {/* Copies for selected document */}
                <section className="rounded-2xl bg-white border border-[#DCE3DD] p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[13.5px] font-bold text-[#191C1A] leading-tight">
                      Copies
                    </h3>
                    <span className="text-[11.5px] text-[#545D56] block mt-0.5 tabular-nums">
                      Limit {minCopies}–{maxCopies} copies for this file
                    </span>
                  </div>

                  <div className="h-11 px-1.5 rounded-xl bg-[#194F34] text-white flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopiesDelta(-1)}
                      disabled={activeSettings.copies <= minCopies}
                      aria-label={`Decrease copies for ${activeDoc.name}`}
                      data-testid="decrease-copies-btn"
                      className="w-9 h-9 rounded-lg text-white hover:bg-white/15 disabled:opacity-40 flex items-center justify-center transition-all active:scale-95"
                    >
                      <Minus size={15} weight="bold" />
                    </button>

                    <span
                      data-testid="copies-quantity"
                      className="min-w-[30px] text-center text-[15px] font-bold text-white tabular-nums"
                    >
                      {activeSettings.copies}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCopiesDelta(1)}
                      disabled={activeSettings.copies >= maxCopies}
                      aria-label={`Increase copies for ${activeDoc.name}`}
                      data-testid="increase-copies-btn"
                      className="w-9 h-9 rounded-lg text-white hover:bg-white/15 disabled:opacity-40 flex items-center justify-center transition-all active:scale-95"
                    >
                      <Plus size={15} weight="bold" />
                    </button>
                  </div>
                </section>

                {/* Optional Per-Doc Blank Page Skip Toggle when blanks detected */}
                {activeDocHasBlanks && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeSettings.removeBlankPages ?? true}
                    onClick={handleToggleDocBlankRemoval}
                    className={`w-full rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                      activeSettings.removeBlankPages ?? true
                        ? 'bg-[#EAF3ED] border-[#B8D6C2] text-[#194F34]'
                        : 'bg-white border-[#DCE3DD] text-[#545D56]'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold">
                      <Leaf size={15} weight="fill" aria-hidden="true" />
                      <span>
                        Skip {activeDoc.blankPages?.length} blank{' '}
                        {activeDoc.blankPages?.length === 1 ? 'page' : 'pages'} in this file
                      </span>
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        activeSettings.removeBlankPages ?? true
                          ? 'bg-[#194F34] text-white'
                          : 'border border-[#C5CEC7] bg-white text-transparent'
                      }`}
                    >
                      <Check size={11} weight="bold" />
                    </span>
                  </button>
                )}

                {/* Compact Print Summary + Per-Document Price Breakdown */}
                {pricingBreakdown && (
                  <section
                    aria-label="Print Summary"
                    data-testid="live-print-summary"
                    className="rounded-2xl bg-white border border-[#DCE3DD] p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[14px] font-bold text-[#191C1A]">
                        Print Summary
                      </h2>
                      <span className="text-[11px] font-semibold text-[#194F34] bg-[#EAF3ED] px-2 py-0.5 rounded-md">
                        {pricingConfig.source === 'backend-api'
                          ? 'Live Rates'
                          : `${session.activeStation.name} Rates`}
                      </span>
                    </div>

                    <div className="space-y-2 text-[12.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#545D56]">Documents &amp; pages</span>
                        <span
                          data-testid="live-summary-docs"
                          className="font-semibold text-[#191C1A] tabular-nums"
                        >
                          {pricingBreakdown.documentCount}{' '}
                          {pricingBreakdown.documentCount === 1 ? 'doc' : 'docs'} ·{' '}
                          <span data-testid="live-summary-pages">
                            {pricingBreakdown.totalPrintablePages}{' '}
                            {pricingBreakdown.totalPrintablePages === 1
                              ? 'page'
                              : 'pages'}
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#545D56]">Total copies &amp; sheets</span>
                        <span className="font-semibold text-[#191C1A] tabular-nums">
                          <span data-testid="live-summary-copies">
                            {pricingBreakdown.totalCopies}
                          </span>{' '}
                          {pricingBreakdown.totalCopies === 1 ? 'copy' : 'copies'} ·{' '}
                          {pricingBreakdown.totalSheets}{' '}
                          {pricingBreakdown.totalSheets === 1 ? 'sheet' : 'sheets'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#545D56]">Colour selections</span>
                        <span
                          data-testid="live-summary-mode"
                          className="font-semibold text-[#191C1A] tabular-nums text-right"
                        >
                          {pricingBreakdown.colourDocumentsCount > 0 &&
                          pricingBreakdown.bwDocumentsCount > 0
                            ? `${pricingBreakdown.colourDocumentsCount} Colour · ${pricingBreakdown.bwDocumentsCount} B&W`
                            : pricingBreakdown.colourDocumentsCount > 0
                              ? `Colour (${pricingBreakdown.colourDocumentsCount})`
                              : `Black & White (${pricingBreakdown.bwDocumentsCount})`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#545D56]">Print sides</span>
                        <span
                          data-testid="live-summary-sides"
                          className="font-semibold text-[#191C1A] tabular-nums text-right"
                        >
                          {pricingBreakdown.twoSidedDocumentsCount > 0 &&
                          pricingBreakdown.oneSidedDocumentsCount > 0
                            ? `${pricingBreakdown.oneSidedDocumentsCount} Single · ${pricingBreakdown.twoSidedDocumentsCount} Double`
                            : pricingBreakdown.twoSidedDocumentsCount > 0
                              ? `Double-sided (${pricingBreakdown.twoSidedDocumentsCount})`
                              : `Single-sided (${pricingBreakdown.oneSidedDocumentsCount})`}
                        </span>
                      </div>
                    </div>

                    {/* Per-document price breakdown */}
                    <div className="pt-2.5 border-t border-[#E6ECE7] space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#545D56] block">
                        Price Breakdown
                      </span>
                      {pricingBreakdown.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-2 text-[12px]"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#191C1A] truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-[#545D56] tabular-nums">
                              {item.printablePagesPerCopy}p × {item.copies} ·{' '}
                              {item.colourMode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                              {item.sides === '2-sided'
                                ? 'Double-sided'
                                : 'Single-sided'}{' '}
                              ({item.totalSheets}{' '}
                              {item.totalSheets === 1 ? 'sheet' : 'sheets'})
                            </p>
                          </div>
                          <span className="font-bold text-[#191C1A] tabular-nums shrink-0">
                            {formatInrCurrency(item.subtotalInr)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2.5 border-t border-[#E6ECE7] flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-bold text-[#191C1A]">
                        Total Estimated Price
                      </span>
                      <span
                        data-testid="live-summary-total"
                        className="text-[21px] font-bold text-[#194F34] tabular-nums tracking-tight"
                      >
                        {formatInrCurrency(pricingBreakdown.combinedTotalInr)}
                      </span>
                    </div>
                  </section>
                )}

                {activePricingItem && (
                  <p className="text-[11px] text-[#545D56] px-1 tabular-nums">
                    Selected file prints {activePricingItem.totalImpressions}{' '}
                    {activePricingItem.totalImpressions === 1
                      ? 'printed side'
                      : 'printed sides'}{' '}
                    across {activePricingItem.totalSheets}{' '}
                    {activePricingItem.totalSheets === 1
                      ? 'paper sheet'
                      : 'paper sheets'}
                    .
                  </p>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Inline Verification / Session Error Banner */}
      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-3 text-[12.5px] text-[#93000A] flex items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2 min-w-0">
            <WarningCircle
              size={18}
              weight="fill"
              className="text-[#BA1A1A] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="leading-snug">{submitError.message}</span>
          </div>
          {submitError.isSessionExpired && onReconnectKiosk && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onReconnectKiosk();
                setSubmitError(null);
              }}
              className="shrink-0 bg-white border-[#FECDD3] text-[#93000A]"
            >
              Reconnect
            </Button>
          )}
        </div>
      )}

      {/* Fixed Bottom Action Bar respecting safe area */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#DCE3DD] px-4 pt-3 pb-5 pb-safe">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-[#545D56] block leading-tight">
              Total payable
            </span>
            <span className="text-[18px] font-bold text-[#194F34] tabular-nums leading-tight block">
              {pricingBreakdown
                ? formatInrCurrency(pricingBreakdown.combinedTotalInr)
                : '—'}
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            disabled={!canAttemptContinue}
            loading={isSubmitting}
            onClick={() => void handleContinueClick()}
            data-testid="continue-to-payment-btn"
            rightIcon={<ArrowRight size={17} weight="bold" />}
            className="flex-1 max-w-[260px] min-h-[50px]"
          >
            Continue to Payment
          </Button>
        </div>
      </div>

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

      <ConfirmRemovalModal
        isOpen={isConfirmModalOpen}
        blankCount={selectedReviewIndices.length}
        documentCount={orderedDocs.length}
        isRemoving={isRemovingPages}
        onCancel={() => setIsConfirmModalOpen(false)}
        onConfirm={handleExecuteRemoval}
      />

      {isPdfEditorOpen &&
        activeDoc &&
        (activeDoc.rawFile || activeDoc.originalFile) && (
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
