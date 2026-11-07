import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  ColourOption,
  SidesOption,
  UploadedPrintDocument,
} from '../types/kiosk';
import { detectFileFormatKind } from '../utils/kioskLogic';
import { triggerHaptic } from '../utils/haptics';
import { analyzePdfPage } from '../utils/blankPageDetector';
import { FileTypeIcon } from './FileTypeIcon';

// Configure PDF.js worker in browser environment
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
  onUpdateBlankPages?: (
    docId: string,
    blankPages: number[],
    uncertainPages?: number[]
  ) => void;
}

const ZOOM_LEVELS = [0.85, 1, 1.15, 1.3] as const;

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scaleFactor: number;
  isBw: boolean;
  isDuplexCompact?: boolean;
  sideBadgeLabel?: string;
  isBlankPage?: boolean;
  removeBlankPages?: boolean;
  isHighlighted?: boolean;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  scaleFactor,
  isBw,
  isDuplexCompact = false,
  sideBadgeLabel,
  isBlankPage = false,
  removeBlankPages = true,
  isHighlighted = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    setIsRendering(true);

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
        // Target base width for single A4 vs duplex compact
        const baseWidth = isDuplexCompact ? 144 : 220;
        const computedScale = (baseWidth / baseViewport.width) * scaleFactor;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        const viewport = page.getViewport({ scale: computedScale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = renderTask;

        renderTask.promise
          .then(() => {
            if (!isCancelled) setIsRendering(false);
          })
          .catch((err) => {
            if (err?.name !== 'RenderingCancelledException' && !isCancelled) {
              setIsRendering(false);
            }
          });
      })
      .catch(() => {
        if (!isCancelled) setIsRendering(false);
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
  }, [pdfDoc, pageNumber, scaleFactor, isDuplexCompact]);

  return (
    <div
      data-testid={`pdf-page-sheet-${pageNumber}`}
      data-colour-preview={isBw ? 'bw' : 'colour'}
      className={`relative bg-white rounded-lg border overflow-hidden flex flex-col items-center justify-center transition-all duration-200 select-none ${
        isHighlighted
          ? 'ring-2 ring-[#1B4D2E] shadow-[0_0_20px_rgba(27,77,46,0.35)] border-[#1B4D2E]'
          : 'border-black/[0.08] shadow-[0_8px_24px_rgba(25,28,26,0.09)]'
      } ${isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'} ${
        isDuplexCompact ? 'w-[144px]' : 'w-[220px]'
      }`}
    >
      {/* Review Highlight Badge */}
      {isHighlighted && (
        <div className="absolute top-1.5 z-30 pointer-events-none">
          <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1B4D2E] text-white shadow-xs">
            Reviewing Blank Page
          </span>
        </div>
      )}

      {/* Optional Side Badge for Duplex Pairing */}
      {sideBadgeLabel && (
        <div className="absolute top-1.5 right-1.5 z-20">
          <span className="text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/95 text-[#1B4D2E] shadow-2xs border border-[#1B4D2E]/20">
            {sideBadgeLabel}
          </span>
        </div>
      )}

      {/* Blank Page Status Banner */}
      {isBlankPage && (
        <div className="absolute top-1.5 left-1.5 z-20">
          <span
            className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-2xs border ${
              removeBlankPages
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}
          >
            {removeBlankPages ? 'Blank · Skipped' : 'Blank Page'}
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isRendering && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-2xs flex flex-col items-center justify-center gap-1.5">
          <div className="w-5 h-5 rounded-full border-2 border-[#1B4D2E]/20 border-t-[#1B4D2E] animate-spin" />
          <span className="text-[8.5px] font-medium text-[#47524B]">
            Rendering p.{pageNumber}
          </span>
        </div>
      )}

      {/* Blank Page Diagonal Pattern Watermark when skipped */}
      {isBlankPage && removeBlankPages && !isRendering && (
        <div className="absolute inset-0 z-10 bg-black/[0.02] flex flex-col items-center justify-center pointer-events-none p-3 text-center">
          <div className="rounded-md bg-white/90 border border-dashed border-emerald-400 px-2 py-1 shadow-2xs">
            <span className="text-[8px] font-semibold text-emerald-800">
              Blank Page Excluded from Print
            </span>
          </div>
        </div>
      )}

      {/* Actual PDF.js Canvas */}
      <canvas
        ref={canvasRef}
        className="block rounded-lg max-w-full h-auto object-contain"
      />
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
  onUpdateBlankPages,
}) => {
  const activeDoc =
    documents.find((d) => d.id === activeDocId) || documents[0] || null;

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomIdx, setZoomIdx] = useState<number>(1); // Index 1 => 100%
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Navigate to targetPage if specified from Review Pages
  useEffect(() => {
    if (typeof targetPage === 'number' && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
  }, [targetPage]);

  // Non-PDF fallback previews
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [plainTextSnippet, setPlainTextSnippet] = useState<string | null>(null);

  const [pageTransitionDir, setPageTransitionDir] = useState<
    'next' | 'prev' | null
  >(null);
  const touchStartXRef = useRef<number | null>(null);

  // Reset to page 1 whenever active document changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeDoc?.id]);

  // Load actual PDF via PDF.js or prepare image/text fallback
  useEffect(() => {
    if (!activeDoc) {
      setPdfDoc(null);
      setImageObjectUrl(null);
      setPlainTextSnippet(null);
      return;
    }

    const file = activeDoc.rawFile;
    const kind = detectFileFormatKind(activeDoc.name);

    if (kind === 'image' && file) {
      const url = URL.createObjectURL(file);
      setImageObjectUrl(url);
      setPdfDoc(null);
      setPlainTextSnippet(null);
      setPdfNumPages(1);
      return () => URL.revokeObjectURL(url);
    }

    if (kind === 'text' && file) {
      setImageObjectUrl(null);
      setPdfDoc(null);
      setPdfNumPages(1);
      file
        .text()
        .then((txt) => setPlainTextSnippet(txt.slice(0, 1500)))
        .catch(() => setPlainTextSnippet(null));
      return;
    }

    // PDF loading
    let isCancelled = false;
    setIsLoadingPdf(true);
    setLoadError(null);
    setImageObjectUrl(null);
    setPlainTextSnippet(null);

    const loadFromBuffer = async (buffer: ArrayBuffer) => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
        });
        const doc = await loadingTask.promise;
        if (isCancelled) return;
        setPdfDoc(doc);
        setPdfNumPages(doc.numPages);
        setIsLoadingPdf(false);

        // Asynchronously scan for blank pages using the Multi-Layer Detection Engine
        (async () => {
          const foundBlanks: number[] = [];
          const uncertainPages: number[] = [];
          for (let p = 1; p <= doc.numPages; p++) {
            try {
              const page = await doc.getPage(p);
              const result = await analyzePdfPage(page, p);
              if (result.state === 'BLANK') {
                foundBlanks.push(p);
              } else if (result.state === 'NEEDS_REVIEW') {
                uncertainPages.push(p);
              }
            } catch {
              // ignore individual page inspection errors
            }
          }
          if (onUpdateBlankPages && activeDoc) {
            onUpdateBlankPages(activeDoc.id, foundBlanks, uncertainPages);
          }
        })();
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : 'Could not parse PDF';
        setLoadError(msg);
        setIsLoadingPdf(false);
      }
    };

    if (file) {
      file
        .arrayBuffer()
        .then(loadFromBuffer)
        .catch((err) => {
          if (!isCancelled) {
            setLoadError('Failed to read file from storage.');
            setIsLoadingPdf(false);
          }
        });
    } else {
      setIsLoadingPdf(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [activeDoc?.id, activeDoc?.rawFile, activeDoc?.name]);

  const totalPages = Math.max(
    1,
    pdfDoc ? pdfNumPages : activeDoc?.pageCount ?? 1
  );

  // Clamp current page if total pages decreases
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!activeDoc) return null;

  const isBw = colourMode === 'bw';
  const stepSize = sides === '2-sided' ? 2 : 1;

  const handlePrevPage = () => {
    if (currentPage <= 1) return;
    triggerHaptic('selection');
    setPageTransitionDir('prev');
    setCurrentPage((prev) => Math.max(1, prev - stepSize));
    window.setTimeout(() => setPageTransitionDir(null), 200);
  };

  const handleNextPage = () => {
    if (currentPage + stepSize > totalPages && currentPage >= totalPages) return;
    triggerHaptic('selection');
    setPageTransitionDir('next');
    setCurrentPage((prev) => Math.min(totalPages, prev + stepSize));
    window.setTimeout(() => setPageTransitionDir(null), 200);
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
    setZoomIdx(1); // Reset to 100%
  };

  const handlePointerStart = (clientX: number) => {
    touchStartXRef.current = clientX;
  };

  const handlePointerEnd = (clientX: number) => {
    if (touchStartXRef.current === null) return;
    const deltaX = clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) {
      handleNextPage();
    } else {
      handlePrevPage();
    }
  };

  const zoomScale = ZOOM_LEVELS[zoomIdx];
  const zoomPercent = Math.round(zoomScale * 100);

  // 2-Sided Duplex Pairing: Front (odd) and Back (even)
  const frontPageNum =
    sides === '2-sided'
      ? currentPage % 2 === 0
        ? Math.max(1, currentPage - 1)
        : currentPage
      : currentPage;
  const backPageNum =
    sides === '2-sided' && frontPageNum + 1 <= totalPages
      ? frontPageNum + 1
      : null;

  const canGoPrev = frontPageNum > 1;
  const canGoNext =
    sides === '2-sided'
      ? (backPageNum ?? frontPageNum) < totalPages
      : currentPage < totalPages;

  return (
    <div
      data-testid="pdf-live-viewer"
      className="w-full rounded-2xl bg-[#F2F5F3] border border-black/[0.06] p-3 flex flex-col gap-2.5 shadow-2xs"
    >
      {/* Multi-Document Selector Strip */}
      {documents.length > 1 && (
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
                className={`h-8.5 px-3 rounded-xl border text-[11.5px] font-semibold flex items-center gap-2 shrink-0 max-w-[210px] transition-all duration-150 active:scale-[0.98] ${
                  isSelected
                    ? 'bg-white border-[#1B4D2E]/40 text-[#191C1A] shadow-xs'
                    : 'bg-white/60 border-black/[0.04] text-[#545D56] hover:bg-white hover:text-[#191C1A]'
                }`}
              >
                <div className="scale-75 origin-left -mr-1 shrink-0">
                  <FileTypeIcon fileName={doc.name} size="sm" />
                </div>
                <span className="truncate">{doc.name}</span>
                <span className="text-[10px] text-[#1B4D2E] font-bold tabular-nums shrink-0 bg-[#EAF3EC] px-1.5 py-0.5 rounded-md">
                  {doc.pageCount}p
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Real-Time PDF Viewport */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Document Page Viewer"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') handlePrevPage();
          if (e.key === 'ArrowRight') handleNextPage();
        }}
        onTouchStart={(e) => handlePointerStart(e.touches[0].clientX)}
        onTouchEnd={(e) =>
          e.changedTouches[0] && handlePointerEnd(e.changedTouches[0].clientX)
        }
        onMouseDown={(e) => handlePointerStart(e.clientX)}
        onMouseUp={(e) => handlePointerEnd(e.clientX)}
        className="relative w-full min-h-[300px] rounded-xl bg-[#EAEFEC]/80 border border-black/[0.04] flex flex-col items-center justify-between overflow-x-auto overflow-y-hidden pt-2.5 pb-3 px-3 gap-2.5 outline-none focus:ring-1 focus:ring-[#1B4D2E]/30"
      >
        {/* Top Status Bar inside Viewport */}
        <div className="w-full flex items-center justify-between gap-2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#37403A] bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-black/[0.06] shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                colourMode === 'colour'
                  ? 'bg-gradient-to-tr from-[#1B4D2E] via-emerald-500 to-amber-400'
                  : 'bg-neutral-800'
              }`}
            />
            <span>{colourMode === 'colour' ? 'Colour Print' : 'B&W Laser'}</span>
            <span className="text-[#8B968E]">·</span>
            <span>{sides === '2-sided' ? '2-Sided Duplex' : '1-Sided Single'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {zoomPercent !== 100 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="pointer-events-auto text-[10.5px] font-bold text-[#1B4D2E] bg-white/95 hover:bg-white px-2 py-1 rounded-lg border border-black/[0.06] shadow-2xs tabular-nums flex items-center gap-1 active:scale-95 transition-all"
                title="Reset zoom to 100%"
              >
                <span>{zoomPercent}%</span>
                <Maximize2 className="w-2.5 h-2.5 text-[#1B4D2E]/70" />
              </button>
            )}
          </div>
        </div>

        {/* Viewport Content Area */}
        <div className="my-auto flex items-center justify-center py-1">
          {isLoadingPdf ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="w-7 h-7 rounded-full border-2 border-[#1B4D2E]/25 border-t-[#1B4D2E] animate-spin" />
              <span className="text-[12px] font-medium text-[#47524B]">
                Loading PDF pages...
              </span>
            </div>
          ) : loadError ? (
            <div className="max-w-[280px] p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-center flex flex-col items-center gap-1.5">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <span className="text-[11px] font-semibold">
                Unable to render full PDF preview
              </span>
              <span className="text-[9.5px] text-amber-700 leading-tight">
                Your file is ready for printing. Settings will apply at the kiosk.
              </span>
            </div>
          ) : imageObjectUrl ? (
            /* Uploaded Image Rendering */
            <div
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
              }}
              className={`rounded-lg border border-black/[0.08] bg-white shadow-[0_8px_24px_rgba(25,28,26,0.09)] p-2 max-w-[240px] max-h-[320px] transition-all duration-200 ${
                isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'
              }`}
            >
              <img
                src={imageObjectUrl}
                alt={activeDoc.name}
                referrerPolicy="no-referrer"
                className="max-h-[290px] w-auto object-contain rounded"
              />
            </div>
          ) : plainTextSnippet ? (
            /* Uploaded Plain Text Rendering */
            <div
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
              }}
              className={`w-[220px] aspect-[1/1.414] rounded-lg border border-black/[0.08] bg-white shadow-[0_8px_24px_rgba(25,28,26,0.09)] p-3.5 flex flex-col justify-between overflow-hidden text-left transition-all duration-200 ${
                isBw ? 'grayscale contrast-[1.06]' : 'grayscale-0'
              }`}
            >
              <div className="flex items-center gap-1.5 border-b border-[#E5EAE6] pb-1.5">
                <FileText className="w-3.5 h-3.5 text-[#1B4D2E]" />
                <span className="text-[9px] font-bold text-[#191C1A] truncate">
                  {activeDoc.name}
                </span>
              </div>
              <pre className="text-[8px] font-mono text-[#37403A] whitespace-pre-wrap leading-relaxed overflow-hidden my-1 flex-1">
                {plainTextSnippet}
              </pre>
              <div className="pt-1 border-t border-[#E5EAE6] text-[7.5px] text-[#6A736C]">
                Page 1 of 1
              </div>
            </div>
          ) : pdfDoc ? (
            /* Real PDF Canvas Stage (Single page or 2-sided duplex) */
            <div
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
              }}
              className={`flex items-center justify-center gap-3 transition-all duration-200 ease-out ${
                pageTransitionDir === 'next'
                  ? 'translate-x-1 opacity-95'
                  : pageTransitionDir === 'prev'
                  ? '-translate-x-1 opacity-95'
                  : 'translate-x-0 opacity-100'
              }`}
            >
              {sides === '1-sided' ? (
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={frontPageNum}
                  scaleFactor={1}
                  isBw={isBw}
                  isBlankPage={activeDoc.blankPages?.includes(frontPageNum)}
                  removeBlankPages={removeBlankPages}
                  isHighlighted={highlightedPage === frontPageNum}
                />
              ) : (
                <div
                  data-testid="duplex-spread-view"
                  className="flex items-center justify-center gap-2.5"
                >
                  <PdfPageCanvas
                    pdfDoc={pdfDoc}
                    pageNumber={frontPageNum}
                    scaleFactor={1}
                    isBw={isBw}
                    isDuplexCompact
                    sideBadgeLabel="Front"
                    isBlankPage={activeDoc.blankPages?.includes(frontPageNum)}
                    removeBlankPages={removeBlankPages}
                    isHighlighted={highlightedPage === frontPageNum}
                  />
                  {backPageNum ? (
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={backPageNum}
                      scaleFactor={1}
                      isBw={isBw}
                      isDuplexCompact
                      sideBadgeLabel="Back"
                      isBlankPage={activeDoc.blankPages?.includes(backPageNum)}
                      removeBlankPages={removeBlankPages}
                      isHighlighted={highlightedPage === backPageNum}
                    />
                  ) : (
                    /* Blank Back Sheet Placeholder for Odd-page Duplex */
                    <div className="w-[144px] aspect-[1/1.414] rounded-lg bg-white/70 border border-dashed border-[#B7C4BB] flex flex-col items-center justify-center p-3 text-center select-none shadow-2xs">
                      <span className="text-[7.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#EAF3EC] text-[#1B4D2E] mb-1">
                        Back Side
                      </span>
                      <span className="text-[9.5px] font-medium text-[#646D66]">
                        Blank Back Page
                      </span>
                      <span className="text-[8px] text-[#8C988F] mt-1">
                        (Odd page sheet)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Viewport Hint */}
        <div className="text-[9.5px] text-[#6A736C] font-medium select-none pointer-events-none">
          Swipe or use arrows to turn pages
        </div>
      </div>

      {/* Bottom PDF Navigation & Zoom Bar */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        {/* Page Nav */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={!canGoPrev}
            aria-label="Previous page"
            className="w-8.5 h-8.5 rounded-xl bg-white border border-black/[0.08] text-[#191C1A] disabled:opacity-30 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95 shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span
            data-testid="pdf-page-counter"
            className="px-2 text-[12px] font-semibold text-[#191C1A] tabular-nums whitespace-nowrap"
          >
            {(() => {
              const isFrontBlank = activeDoc?.blankPages?.includes(frontPageNum);
              const isBackBlank = backPageNum
                ? activeDoc?.blankPages?.includes(backPageNum)
                : false;
              if (sides === '2-sided' && backPageNum) {
                const base = `Pages ${frontPageNum}–${backPageNum} of ${totalPages}`;
                if (removeBlankPages && (isFrontBlank || isBackBlank)) {
                  return `${base} · Blank Skipped`;
                }
                return base;
              }
              const base = `Page ${frontPageNum} of ${totalPages}`;
              if (removeBlankPages && isFrontBlank) {
                return `${base} · Blank (Skipped)`;
              }
              if (!removeBlankPages && isFrontBlank) {
                return `${base} · Blank Page`;
              }
              return base;
            })()}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={!canGoNext}
            aria-label="Next page"
            className="w-8.5 h-8.5 rounded-xl bg-white border border-black/[0.08] text-[#191C1A] disabled:opacity-30 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95 shadow-2xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomIdx <= 0}
            aria-label="Zoom out"
            className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] text-[#191C1A] disabled:opacity-30 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95 shadow-2xs"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
            aria-label="Zoom in"
            className="w-8 h-8 rounded-xl bg-white border border-black/[0.08] text-[#191C1A] disabled:opacity-30 hover:bg-[#F7FAF8] flex items-center justify-center transition-all active:scale-95 shadow-2xs"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
