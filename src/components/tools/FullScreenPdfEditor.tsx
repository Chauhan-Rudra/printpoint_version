import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  X,
  RotateCw,
  RotateCcw,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  CheckCircle2,
  Printer,
  ChevronLeft,
  ChevronRight,
  Upload,
  Crop,
  Layers,
  Sparkles,
  Eye,
  AlertCircle,
  Scissors,
} from 'lucide-react';
import { Haptics } from '../../utils/haptics';
import { analyzePdfPage } from '../../utils/blankPageDetector';

interface FullScreenPdfEditorProps {
  isOpen: boolean;
  file?: File | null;
  onClose: () => void;
  onSaveAndPrint: (savedFile: File) => void;
}

interface EditorState {
  pageOrder: number[]; // 1-based page numbers
  rotations: Record<number, number>; // pageNumber -> additional degrees (0, 90, 180, 270)
  cropMargins: number; // uniform pt margin
  deletedPages: number[]; // 1-based
}

export const FullScreenPdfEditor: React.FC<FullScreenPdfEditorProps> = ({
  isOpen,
  file: initialFile,
  onClose,
  onSaveAndPrint,
}) => {
  const [currentFile, setCurrentFile] = useState<File | null>(initialFile || null);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [fitMode, setFitMode] = useState<'width' | 'screen'>('width');
  const [blankPages, setBlankPages] = useState<number[]>([]);
  const [isDetectingBlanks, setIsDetectingBlanks] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Editor modifications state
  const [editorState, setEditorState] = useState<EditorState>({
    pageOrder: [],
    rotations: {},
    cropMargins: 0,
    deletedPages: [],
  });

  // Undo / Redo Stacks
  const [history, setHistory] = useState<EditorState[]>([]);
  const [redoStack, setRedoStack] = useState<EditorState[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Sync prop changes
  useEffect(() => {
    if (initialFile) {
      setCurrentFile(initialFile);
    }
  }, [initialFile]);

  // Load PDF into PDF.js proxy whenever currentFile changes
  useEffect(() => {
    if (!isOpen || !currentFile) return;

    let isMounted = true;
    currentFile.arrayBuffer().then((buffer) => {
      pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise.then((doc) => {
        if (!isMounted) return;
        setPdfDocProxy(doc);
        const count = doc.numPages;
        setTotalPages(count);
        setCurrentPage(1);

        const initialOrder = Array.from({ length: count }, (_, i) => i + 1);
        const initialEditor: EditorState = {
          pageOrder: initialOrder,
          rotations: {},
          cropMargins: 0,
          deletedPages: [],
        };
        setEditorState(initialEditor);
        setHistory([]);
        setRedoStack([]);

        // Run multi-layer blank page detection in background
        setIsDetectingBlanks(true);
        const detectedBlanks: number[] = [];
        const checkPage = async (p: number) => {
          if (p > count || !isMounted) {
            setIsDetectingBlanks(false);
            setBlankPages(detectedBlanks);
            return;
          }
          try {
            const pageObj = await doc.getPage(p);
            const res = await analyzePdfPage(pageObj, p);
            if (res.isBlank) detectedBlanks.push(p);
          } catch {
            // ignore page analysis error
          }
          checkPage(p + 1);
        };
        checkPage(1);
      });
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentFile]);

  // Push new state to history stack for Undo support
  const pushChange = (newState: EditorState) => {
    setHistory((prev) => [...prev, editorState]);
    setRedoStack([]);
    setEditorState(newState);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    Haptics.buttonPress();
    const previous = history[history.length - 1];
    setRedoStack((prev) => [editorState, ...prev]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setEditorState(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    Haptics.buttonPress();
    const next = redoStack[0];
    setRedoStack((prev) => prev.slice(1));
    setHistory((prev) => [...prev, editorState]);
    setEditorState(next);
  };

  // Render current active page onto main canvas
  useEffect(() => {
    if (!pdfDocProxy || !mainCanvasRef.current || totalPages === 0) return;

    const visiblePages = editorState.pageOrder.filter(
      (p) => !editorState.deletedPages.includes(p)
    );
    if (visiblePages.length === 0) return;

    const targetOriginalPage = visiblePages[currentPage - 1] || visiblePages[0];
    if (!targetOriginalPage) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    pdfDocProxy.getPage(targetOriginalPage).then((page) => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return;

      const pageRotation = (page.rotate + (editorState.rotations[targetOriginalPage] || 0)) % 360;
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });

      // Compute responsive scale for mobile fit
      const containerWidth = Math.min(window.innerWidth - 32, 380);
      let calculatedScale = (containerWidth / baseViewport.width) * scale;
      if (fitMode === 'screen') {
        const containerHeight = window.innerHeight * 0.48;
        calculatedScale = Math.min(
          calculatedScale,
          (containerHeight / baseViewport.height) * scale
        );
      }

      const viewport = page.getViewport({ scale: calculatedScale, rotation: pageRotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, viewport.width, viewport.height);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        task.promise.catch(() => {});
      }
    });
  }, [pdfDocProxy, currentPage, scale, fitMode, editorState, totalPages]);

  // Actions
  const handleRotateCurrent = (deg: 90 | -90) => {
    Haptics.buttonPress();
    const visiblePages = editorState.pageOrder.filter(
      (p) => !editorState.deletedPages.includes(p)
    );
    const activeOrigPage = visiblePages[currentPage - 1];
    if (!activeOrigPage) return;

    const currentDeg = editorState.rotations[activeOrigPage] || 0;
    const nextDeg = (currentDeg + (deg === 90 ? 90 : 270)) % 360;

    pushChange({
      ...editorState,
      rotations: {
        ...editorState.rotations,
        [activeOrigPage]: nextDeg,
      },
    });
  };

  const handleDeleteCurrent = () => {
    Haptics.buttonPress();
    const visiblePages = editorState.pageOrder.filter(
      (p) => !editorState.deletedPages.includes(p)
    );
    if (visiblePages.length <= 1) {
      alert('A document must have at least one remaining page.');
      return;
    }
    const activeOrigPage = visiblePages[currentPage - 1];
    if (!activeOrigPage) return;

    const nextDeleted = [...editorState.deletedPages, activeOrigPage];
    pushChange({
      ...editorState,
      deletedPages: nextDeleted,
    });

    if (currentPage > visiblePages.length - 1) {
      setCurrentPage(Math.max(1, visiblePages.length - 1));
    }
  };

  const handleMoveCurrent = (direction: 'left' | 'right') => {
    Haptics.buttonPress();
    const visiblePages = editorState.pageOrder.filter(
      (p) => !editorState.deletedPages.includes(p)
    );
    const fromIndex = currentPage - 1;
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;

    if (toIndex < 0 || toIndex >= visiblePages.length) return;

    // Swap original pages in the visible list
    const newOrder = [...editorState.pageOrder];
    const origA = visiblePages[fromIndex];
    const origB = visiblePages[toIndex];
    const posA = newOrder.indexOf(origA);
    const posB = newOrder.indexOf(origB);

    newOrder[posA] = origB;
    newOrder[posB] = origA;

    pushChange({
      ...editorState,
      pageOrder: newOrder,
    });
    setCurrentPage(toIndex + 1);
  };

  const handleRemoveAllBlanks = () => {
    Haptics.selection();
    if (blankPages.length === 0) return;
    const nextDeleted = Array.from(new Set([...editorState.deletedPages, ...blankPages]));
    const remainingCount = totalPages - nextDeleted.length;
    if (remainingCount <= 0) {
      alert('Cannot remove all pages.');
      return;
    }
    pushChange({
      ...editorState,
      deletedPages: nextDeleted,
    });
    setCurrentPage(1);
  };

  // Compile and save modifications using pdf-lib
  const handleSaveAndProceed = async () => {
    if (!currentFile) return;
    Haptics.success();
    setIsSaving(true);

    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const outputDoc = await PDFDocument.create();

      const visiblePages = editorState.pageOrder.filter(
        (p) => !editorState.deletedPages.includes(p)
      );

      const zeroBasedIndices = visiblePages.map((p) => p - 1);
      const copiedPages = await outputDoc.copyPages(sourceDoc, zeroBasedIndices);

      copiedPages.forEach((page, idx) => {
        const originalPageNum = visiblePages[idx];
        const addRot = editorState.rotations[originalPageNum] || 0;
        if (addRot !== 0) {
          const baseAngle = page.getRotation().angle;
          page.setRotation(degrees((baseAngle + addRot) % 360));
        }

        // Apply crop margin if set
        if (editorState.cropMargins > 0) {
          const { width, height } = page.getSize();
          const m = editorState.cropMargins;
          if (width > m * 2 && height > m * 2) {
            page.setCropBox(m, m, width - m * 2, height - m * 2);
          }
        }

        outputDoc.addPage(page);
      });

      const modifiedBytes = await outputDoc.save();
      const savedFile = new File(
        [modifiedBytes as unknown as BlobPart],
        currentFile.name.replace(/\.pdf$/i, '_edited.pdf'),
        { type: 'application/pdf' }
      );

      setIsSaving(false);
      onSaveAndPrint(savedFile);
    } catch (err) {
      setIsSaving(false);
      console.error('Failed to save edited PDF:', err);
      alert('Could not save PDF changes. Please try again.');
    }
  };

  if (!isOpen) return null;

  const visiblePages = editorState.pageOrder.filter(
    (p) => !editorState.deletedPages.includes(p)
  );
  const activeOrigPage = visiblePages[currentPage - 1];
  const isCurrentPageBlank = activeOrigPage ? blankPages.includes(activeOrigPage) : false;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-Screen PDF Editor"
      className="fixed inset-0 z-50 bg-[#0A110D] text-white flex flex-col animate-apple-reveal select-none"
    >
      {/* Top Header Bar */}
      <header className="h-14 px-3 border-b border-white/10 bg-[#0E1712] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/90 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex flex-col min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-[160px] sm:max-w-xs">
              {currentFile ? currentFile.name : 'PDF Editor'}
            </h2>
            <span className="text-[10px] text-white/60">
              Page {visiblePages.length > 0 ? currentPage : 0} of {visiblePages.length}
            </span>
          </div>
        </div>

        {/* Undo / Redo & Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            aria-label="Undo"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white/90 active:scale-95"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            aria-label="Redo"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white/90 active:scale-95"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-white/15 mx-1" />

          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.7, +(s - 0.15).toFixed(2)))}
            aria-label="Zoom out"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/90 active:scale-95"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.0, +(s + 0.15).toFixed(2)))}
            aria-label="Zoom in"
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/90 active:scale-95"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Stage: Live PDF Canvas Preview */}
      <main className="flex-1 overflow-auto flex flex-col items-center justify-center p-3 relative bg-[#070C09]">
        {currentFile ? (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-white">
            <canvas ref={mainCanvasRef} className="block transition-all" />

            {/* Blank Page Detected Watermark Indicator */}
            {isCurrentPageBlank && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-amber-500/90 text-slate-950 font-bold text-[10px] shadow-md flex items-center gap-1 backdrop-blur-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Detected Blank</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-xs">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-emerald-400 mb-3">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-white">Select a PDF to Edit</h3>
            <p className="text-xs text-white/60 mt-1 mb-4">
              Rotate, delete, reorder pages, remove blank pages, and prepare your print.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md"
            >
              Choose PDF File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setCurrentFile(e.target.files[0]);
                }
              }}
            />
          </div>
        )}

        {/* Floating Page Navigation Pill */}
        {visiblePages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs text-white shadow-lg">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 hover:text-emerald-400 disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-[11px] px-1">
              {currentPage} / {visiblePages.length}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(visiblePages.length, p + 1))}
              disabled={currentPage >= visiblePages.length}
              className="p-1 hover:text-emerald-400 disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* Page Thumbnails Ribbon */}
      {visiblePages.length > 0 && (
        <section aria-label="Page Thumbnails" className="h-16 px-3 bg-[#0D1610] border-t border-white/10 flex items-center gap-2 overflow-x-auto shrink-0">
          {visiblePages.map((origP, idx) => {
            const pageNum = idx + 1;
            const isSelected = pageNum === currentPage;
            const isBlank = blankPages.includes(origP);
            const rot = editorState.rotations[origP] || 0;

            return (
              <button
                key={`${origP}-${idx}`}
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  setCurrentPage(pageNum);
                }}
                className={`relative shrink-0 w-10 h-12 rounded-md border flex flex-col items-center justify-between p-1 transition-all ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-950/60 ring-2 ring-emerald-400/30'
                    : 'border-white/15 bg-white/5 hover:border-white/30'
                }`}
              >
                <div
                  className="w-5 h-6 bg-white/20 rounded-xs flex items-center justify-center text-[9px] font-bold text-white/90"
                  style={{ transform: `rotate(${rot}deg)` }}
                >
                  {pageNum}
                </div>
                {isBlank && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 -mt-1" />
                )}
              </button>
            );
          })}
        </section>
      )}

      {/* Editing Toolbar */}
      <footer className="p-3 bg-[#0E1712] border-t border-white/10 flex flex-col gap-2.5 shrink-0">
        {/* Quick Page Manipulation Tools */}
        <div className="grid grid-cols-5 gap-1.5">
          <button
            type="button"
            onClick={() => handleRotateCurrent(-90)}
            disabled={visiblePages.length === 0}
            className="h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5 mb-0.5 text-emerald-400" />
            <span>Rotate -90°</span>
          </button>

          <button
            type="button"
            onClick={() => handleRotateCurrent(90)}
            disabled={visiblePages.length === 0}
            className="h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
          >
            <RotateCw className="w-3.5 h-3.5 mb-0.5 text-emerald-400" />
            <span>Rotate 90°</span>
          </button>

          <button
            type="button"
            onClick={() => handleMoveCurrent('left')}
            disabled={currentPage <= 1}
            className="h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5 mb-0.5" />
            <span>Move Left</span>
          </button>

          <button
            type="button"
            onClick={() => handleMoveCurrent('right')}
            disabled={currentPage >= visiblePages.length}
            className="h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
          >
            <ArrowRight className="w-3.5 h-3.5 mb-0.5" />
            <span>Move Right</span>
          </button>

          <button
            type="button"
            onClick={handleDeleteCurrent}
            disabled={visiblePages.length <= 1}
            className="h-10 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 flex flex-col items-center justify-center text-[10px] font-semibold text-rose-300 active:scale-95 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5 mb-0.5 text-rose-400" />
            <span>Delete Page</span>
          </button>
        </div>

        {/* Blank Page Detector Action (if blanks detected) */}
        {blankPages.length > 0 && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{blankPages.length} blank page(s) detected</span>
            </div>
            <button
              type="button"
              onClick={handleRemoveAllBlanks}
              className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-900 font-bold text-[11px] shadow-xs active:scale-95"
            >
              Remove All Blanks
            </button>
          </div>
        )}

        {/* Primary Save Changes & Continue to Print Button */}
        <button
          type="button"
          onClick={handleSaveAndProceed}
          disabled={!currentFile || isSaving}
          className="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-[#1B4D2E] hover:from-emerald-500 hover:to-[#225e39] text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <span>Saving changes...</span>
          ) : (
            <>
              <CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />
              <span>Save Changes &amp; Continue to Print</span>
            </>
          )}
        </button>
      </footer>
    </div>,
    document.body
  );
};
