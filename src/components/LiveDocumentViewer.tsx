import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  FileText,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  ColourOption,
  SidesOption,
  UploadedPrintDocument,
} from '../types/kiosk';
import { detectFileFormatKind } from '../utils/kioskLogic';
import { triggerHaptic } from '../utils/haptics';
import { analyzePdfPage } from '../utils/blankPageDetector';
import { FileTypeIcon } from './FileTypeIcon';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface LiveDocumentViewerProps {
  documents: UploadedPrintDocument[];
  activeDocId: string;
  onSelectDocument: (docId: string) => void;
  colourMode: ColourOption;
  sides: SidesOption;
  removeBlankPages?: boolean;
  targetPage?: number | null;
  highlightedPage?: number | null;
  isMobileView?: boolean;
  hideDocumentSelector?: boolean;
  onUpdateBlankPages?: (
    docId: string,
    blankPages: number[],
    uncertainPages?: number[]
  ) => void;
}

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 1.75] as const;

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scaleFactor: number;
  isBw: boolean;
  sideBadgeLabel?: string;
  isBlankPage?: boolean;
  removeBlankPages?: boolean;
  isHighlighted?: boolean;
  baseWidth: number;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  scaleFactor,
  isBw,
  sideBadgeLabel,
  isBlankPage = false,
  removeBlankPages = true,
  isHighlighted = false,
  baseWidth,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsRendering(true);
    setRenderError(null);

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignore task cancellation error
      }
      renderTaskRef.current = null;
    }

    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (isCancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale =
          (Math.max(200, baseWidth) / Math.max(1, baseViewport.width)) *
          scaleFactor;
        const cssViewport = page.getViewport({ scale: cssScale });

        const cssWidth = Math.max(1, Math.floor(cssViewport.width));
        const cssHeight = Math.max(1, Math.floor(cssViewport.height));

        const deviceDpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const maxCanvasDim = 1600;
        const dimLimitScale = Math.min(
          1,
          maxCanvasDim / Math.max(1, cssWidth * deviceDpr),
          maxCanvasDim / Math.max(1, cssHeight * deviceDpr)
        );
        const effectiveDpr = deviceDpr * dimLimitScale;

        canvas.width = Math.max(1, Math.floor(cssWidth * effectiveDpr));
        canvas.height = Math.max(1, Math.floor(cssHeight * effectiveDpr));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const renderViewport = page.getViewport({
          scale: cssScale * effectiveDpr,
        });

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          setIsRendering(false);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });
        renderTaskRef.current = renderTask;

        renderTask.promise
          .then(() => {
            if (!isCancelled) setIsRendering(false);
          })
          .catch((err) => {
            if (err?.name !== 'RenderingCancelledException' && !isCancelled) {
              setRenderError('Could not render this page preview.');
              setIsRendering(false);
            }
          });
      })
      .catch(() => {
        if (!isCancelled) {
          setRenderError('Could not load this page from the PDF.');
          setIsRendering(false);
        }
      });

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore task cancellation
        }
      }
    };
  }, [pdfDoc, pageNumber, scaleFactor, baseWidth]);

  return (
    <div
      data-testid={`pdf-page-sheet-${pageNumber}`}
      data-colour-preview={isBw ? 'bw' : 'colour'}
      className={`relative inline-flex flex-col items-center justify-center bg-white rounded-lg border overflow-hidden transition-shadow duration-200 select-none ${
        isHighlighted
          ? 'ring-2 ring-[#194F34] shadow-[0_0_20px_rgba(25,79,52,0.28)] border-[#194F34]'
          : 'border-[#D5DDD7] shadow-[0_6px_18px_rgba(25,28,26,0.08)]'
      } ${isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'}`}
    >
      {isHighlighted && (
        <div className="absolute top-1.5 z-30 pointer-events-none">
          <span className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#194F34] text-white shadow-xs">
            Reviewing Blank Page
          </span>
        </div>
      )}

      {sideBadgeLabel && (
        <div className="absolute top-1.5 right-1.5 z-20 pointer-events-none">
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/95 text-[#194F34] border border-[#194F34]/20 shadow-2xs">
            {sideBadgeLabel}
          </span>
        </div>
      )}

      {isBlankPage && (
        <div className="absolute top-1.5 left-1.5 z-20 pointer-events-none">
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shadow-2xs ${
              removeBlankPages
                ? 'bg-[#EAF3ED] text-[#194F34] border-[#B8D6C2]'
                : 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]'
            }`}
          >
            {removeBlankPages ? 'Blank · Skipped' : 'Blank Page'}
          </span>
        </div>
      )}

      {isRendering && (
        <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-2xs flex flex-col items-center justify-center gap-1.5">
          <div className="w-5 h-5 rounded-full border-2 border-[#194F34]/20 border-t-[#194F34] animate-spin" />
          <span className="text-[11px] font-medium text-[#545D56]">
            Rendering page {pageNumber}...
          </span>
        </div>
      )}

      {isBlankPage && removeBlankPages && !isRendering && (
        <div className="absolute inset-0 z-10 bg-black/[0.02] flex flex-col items-center justify-center pointer-events-none p-3 text-center">
          <div className="rounded-lg bg-white/95 border border-dashed border-[#194F34]/40 px-2.5 py-1 shadow-2xs">
            <span className="text-[10.5px] font-semibold text-[#194F34]">
              Blank page excluded from print
            </span>
          </div>
        </div>
      )}

      {renderError ? (
        <div className="p-6 text-center text-[12px] text-[#93000A]">
          {renderError}
        </div>
      ) : (
        <canvas ref={canvasRef} className="block rounded-lg" />
      )}
    </div>
  );
};

export const LiveDocumentViewer: React.FC<LiveDocumentViewerProps> = ({
  documents,
  activeDocId,
  onSelectDocument,
  colourMode,
  sides,
  removeBlankPages = true,
  targetPage,
  highlightedPage,
  hideDocumentSelector = false,
  onUpdateBlankPages,
}) => {
  const activeDoc =
    documents.find((d) => d.id === activeDocId) || documents[0] || null;

  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState<number>(300);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomIdx, setZoomIdx] = useState<number>(1); // 1 => 100%
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [plainTextSnippet, setPlainTextSnippet] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;
    const measure = () => {
      const inner = Math.max(220, el.clientWidth - 28);
      setStageWidth(Math.min(inner, 380));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof targetPage === 'number' && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  useEffect(() => {
    setCurrentPage(1);
    setZoomIdx(1);
  }, [activeDoc?.id]);

  // Load processed PDF via PDF.js (falls back to raw image/text only if not converted to PDF)
  useEffect(() => {
    if (!activeDoc) {
      setPdfDoc(null);
      setImageObjectUrl(null);
      setPlainTextSnippet(null);
      return;
    }

    const file =
      activeDoc.rawFile || activeDoc.convertedPdfFile || activeDoc.originalFile;
    if (!file) {
      setPdfDoc(null);
      setImageObjectUrl(null);
      setPlainTextSnippet(null);
      setIsLoadingPdf(false);
      setLoadError('Document file reference is missing from this session.');
      return;
    }

    const isPdfFile =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const kind = detectFileFormatKind(file.name);

    if (!isPdfFile && kind === 'image') {
      const url = URL.createObjectURL(file);
      setImageObjectUrl(url);
      setPdfDoc(null);
      setPlainTextSnippet(null);
      setPdfNumPages(1);
      setIsLoadingPdf(false);
      setLoadError(null);
      return () => URL.revokeObjectURL(url);
    }

    if (!isPdfFile && kind === 'text') {
      setImageObjectUrl(null);
      setPdfDoc(null);
      setPdfNumPages(1);
      setIsLoadingPdf(false);
      setLoadError(null);
      file
        .text()
        .then((txt) => setPlainTextSnippet(txt.slice(0, 1500)))
        .catch(() => setPlainTextSnippet(null));
      return;
    }

    let isCancelled = false;
    let loadedProxy: pdfjsLib.PDFDocumentProxy | null = null;
    setIsLoadingPdf(true);
    setLoadError(null);
    setImageObjectUrl(null);
    setPlainTextSnippet(null);

    file
      .arrayBuffer()
      .then(async (buffer) => {
        if (isCancelled) return;
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          useWorkerFetch: false,
          isEvalSupported: false,
        });
        const proxy = await loadingTask.promise;
        if (isCancelled) {
          try {
            await proxy.cleanup();
            await proxy.destroy();
          } catch {
            // Ignore cleanup failure
          }
          return;
        }
        loadedProxy = proxy;
        setPdfDoc(proxy);
        setPdfNumPages(proxy.numPages);
        setIsLoadingPdf(false);

        // Only scan blanks if document has not yet been analyzed
        if (onUpdateBlankPages && activeDoc.blankPages === undefined) {
          const foundBlanks: number[] = [];
          const uncertainPages: number[] = [];
          for (let p = 1; p <= proxy.numPages; p++) {
            if (isCancelled) break;
            try {
              const page = await proxy.getPage(p);
              const result = await analyzePdfPage(page, p);
              if (result.state === 'BLANK') foundBlanks.push(p);
              else if (result.state === 'NEEDS_REVIEW') uncertainPages.push(p);
            } catch {
              // Ignore per-page errors
            }
          }
          if (!isCancelled) {
            onUpdateBlankPages(activeDoc.id, foundBlanks, uncertainPages);
          }
        }
      })
      .catch((err: unknown) => {
        if (isCancelled) return;
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to open this PDF document.';
        setLoadError(msg);
        setPdfDoc(null);
        setIsLoadingPdf(false);
      });

    return () => {
      isCancelled = true;
      if (loadedProxy) {
        try {
          void loadedProxy.cleanup();
          void loadedProxy.destroy();
        } catch {
          // Ignore cleanup failure
        }
      }
    };
  }, [
    activeDoc?.id,
    activeDoc?.rawFile,
    activeDoc?.convertedPdfFile,
    activeDoc?.originalFile,
  ]);

  const totalPages = Math.max(
    1,
    pdfDoc ? pdfNumPages : activeDoc?.pageCount ?? 1
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!activeDoc) return null;

  const isBw = colourMode === 'bw';
  const zoomScale = ZOOM_LEVELS[zoomIdx];
  const zoomPercent = Math.round(zoomScale * 100);

  const handlePrevPage = () => {
    if (currentPage <= 1) return;
    triggerHaptic('selection');
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    if (currentPage >= totalPages) return;
    triggerHaptic('selection');
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const handleZoomOut = () => {
    triggerHaptic('selection');
    setZoomIdx((prev) => Math.max(0, prev - 1));
  };

  const handleZoomIn = () => {
    triggerHaptic('selection');
    setZoomIdx((prev) => Math.min(ZOOM_LEVELS.length - 1, prev + 1));
  };

  const handleResetZoom = () => {
    triggerHaptic('selection');
    setZoomIdx(1);
  };

  const handlePointerStart = (clientX: number) => {
    touchStartXRef.current = clientX;
  };

  const handlePointerEnd = (clientX: number) => {
    if (touchStartXRef.current === null) return;
    const deltaX = clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 48 || zoomScale > 1.05) return;
    if (deltaX < 0) handleNextPage();
    else handlePrevPage();
  };

  const sheetNumber =
    sides === '2-sided' ? Math.ceil(currentPage / 2) : currentPage;
  const sideBadgeLabel =
    sides === '2-sided'
      ? `Sheet ${sheetNumber} · ${currentPage % 2 === 1 ? 'Front' : 'Back'}`
      : undefined;

  return (
    <div
      data-testid="pdf-live-viewer"
      className="w-full rounded-2xl bg-[#F2F5F3] border border-[#DCE3DD] p-3 flex flex-col gap-2.5 min-w-0"
    >
      {!hideDocumentSelector && documents.length > 1 && (
        <div
          role="tablist"
          aria-label="Uploaded Documents Selector"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        >
          {documents.map((doc) => {
            const isSelected = doc.id === activeDoc.id;
            return (
              <button
                key={doc.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  triggerHaptic('selection');
                  onSelectDocument(doc.id);
                }}
                className={`h-9 px-3 rounded-xl border text-[11.5px] font-semibold flex items-center gap-2 shrink-0 max-w-[210px] transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'bg-white border-[#194F34] text-[#191C1A]'
                    : 'bg-white/70 border-[#D5DDD7] text-[#545D56] hover:bg-white'
                }`}
              >
                <div className="scale-75 origin-left -mr-1 shrink-0">
                  <FileTypeIcon fileName={doc.name} size="sm" />
                </div>
                <span className="truncate">{doc.name}</span>
                <span className="text-[10.5px] text-[#194F34] font-bold tabular-nums shrink-0 bg-[#EAF3ED] px-1.5 py-0.5 rounded-md">
                  {doc.pageCount}p
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Real-Time PDF Viewport (One readable page at a time) */}
      <div
        ref={viewportContainerRef}
        tabIndex={0}
        role="region"
        aria-label={`Document preview for ${activeDoc.name}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') handlePrevPage();
          if (e.key === 'ArrowRight') handleNextPage();
        }}
        onTouchStart={(e) => handlePointerStart(e.touches[0].clientX)}
        onTouchEnd={(e) =>
          e.changedTouches[0] && handlePointerEnd(e.changedTouches[0].clientX)
        }
        className="relative w-full min-h-[280px] rounded-xl bg-[#EAEFEC] border border-[#DCE3DD] flex flex-col items-center justify-between overflow-hidden pt-2.5 pb-3 px-2.5 gap-2.5 outline-none focus:ring-1 focus:ring-[#194F34]/30"
      >
        <div className="w-full flex items-center justify-between gap-2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#191C1A] bg-white/95 px-2.5 py-1 rounded-lg border border-[#D5DDD7] truncate">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                colourMode === 'colour'
                  ? 'bg-gradient-to-tr from-[#194F34] via-emerald-500 to-amber-400'
                  : 'bg-[#191C1A]'
              }`}
            />
            <span>{colourMode === 'colour' ? 'Colour' : 'B&W'}</span>
            <span className="text-[#8B968E]" aria-hidden="true">
              ·
            </span>
            <span>{sides === '2-sided' ? 'Double-sided' : 'Single-sided'}</span>
          </div>

          {zoomPercent !== 100 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="pointer-events-auto text-[11px] font-bold text-[#194F34] bg-white/95 hover:bg-white px-2.5 py-1 rounded-lg border border-[#D5DDD7] tabular-nums flex items-center gap-1 active:scale-95 transition-all shrink-0"
              title="Reset zoom to 100%"
            >
              <span>{zoomPercent}%</span>
              <ArrowsOutSimple size={11} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Scrollable inner stage so zoomed pages never cause outer page overflow */}
        <div className="w-full overflow-x-auto flex items-center justify-center py-1 min-h-[220px]">
          {isLoadingPdf ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="w-7 h-7 rounded-full border-2 border-[#194F34]/25 border-t-[#194F34] animate-spin" />
              <span className="text-[12px] font-medium text-[#545D56]">
                Loading PDF preview...
              </span>
            </div>
          ) : loadError ? (
            <div className="max-w-[290px] p-3.5 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#93000A] text-center flex flex-col items-center gap-1.5">
              <WarningCircle size={20} weight="fill" className="text-[#BA1A1A]" />
              <span className="text-[12px] font-semibold">
                Unable to render PDF preview
              </span>
              <span className="text-[11px] leading-snug">{loadError}</span>
            </div>
          ) : imageObjectUrl ? (
            <div
              className={`rounded-lg border border-[#D5DDD7] bg-white p-2 shadow-sm ${
                isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'
              }`}
              style={{ width: `${Math.round(stageWidth * zoomScale)}px` }}
            >
              <img
                src={imageObjectUrl}
                alt={activeDoc.name}
                referrerPolicy="no-referrer"
                className="w-full h-auto object-contain rounded"
              />
            </div>
          ) : plainTextSnippet ? (
            <div
              style={{ width: `${Math.round(stageWidth * zoomScale)}px` }}
              className={`aspect-[1/1.414] rounded-lg border border-[#D5DDD7] bg-white p-3.5 flex flex-col justify-between overflow-hidden text-left ${
                isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'
              }`}
            >
              <div className="flex items-center gap-1.5 border-b border-[#E5EAE6] pb-1.5">
                <FileText size={14} weight="duotone" className="text-[#194F34]" />
                <span className="text-[10px] font-bold text-[#191C1A] truncate">
                  {activeDoc.name}
                </span>
              </div>
              <pre className="text-[9px] font-mono text-[#37403A] whitespace-pre-wrap leading-relaxed overflow-hidden my-1 flex-1">
                {plainTextSnippet}
              </pre>
              <div className="pt-1 border-t border-[#E5EAE6] text-[8.5px] text-[#6A736C]">
                Page 1 of 1
              </div>
            </div>
          ) : pdfDoc ? (
            <PdfPageCanvas
              pdfDoc={pdfDoc}
              pageNumber={currentPage}
              scaleFactor={zoomScale}
              isBw={isBw}
              baseWidth={stageWidth}
              sideBadgeLabel={sideBadgeLabel}
              isBlankPage={activeDoc.blankPages?.includes(currentPage)}
              removeBlankPages={removeBlankPages}
              isHighlighted={highlightedPage === currentPage}
            />
          ) : null}
        </div>
      </div>

      {/* Bottom PDF Navigation & Zoom Controls */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="w-10 h-10 rounded-xl bg-white border border-[#D5DDD7] text-[#191C1A] disabled:opacity-35 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95"
          >
            <CaretLeft size={16} weight="bold" />
          </button>

          <span
            data-testid="pdf-page-counter"
            className="px-1.5 text-[12.5px] font-semibold text-[#191C1A] tabular-nums whitespace-nowrap"
          >
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="w-10 h-10 rounded-xl bg-white border border-[#D5DDD7] text-[#191C1A] disabled:opacity-35 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomIdx <= 0}
            aria-label="Zoom out"
            className="w-10 h-10 rounded-xl bg-white border border-[#D5DDD7] text-[#191C1A] disabled:opacity-35 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95"
          >
            <MagnifyingGlassMinus size={16} weight="bold" />
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset zoom"
            className="min-w-[44px] h-10 px-1.5 rounded-xl bg-white border border-[#D5DDD7] text-[12px] font-bold text-[#191C1A] tabular-nums flex items-center justify-center"
          >
            {zoomPercent}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
            aria-label="Zoom in"
            className="w-10 h-10 rounded-xl bg-white border border-[#D5DDD7] text-[#191C1A] disabled:opacity-35 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95"
          >
            <MagnifyingGlassPlus size={16} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
};
