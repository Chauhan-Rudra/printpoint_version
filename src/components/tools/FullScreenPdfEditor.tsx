import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  X,
  ArrowClockwise,
  ArrowCounterClockwise,
  Trash,
  ArrowLeft,
  ArrowRight,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowUUpLeft,
  ArrowUUpRight,
  CheckCircle,
  CaretLeft,
  CaretRight,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';
import { analyzePdfPage } from '../../utils/blankPageDetector';

interface FullScreenPdfEditorProps {
  isOpen: boolean;
  file?: File | null;
  onClose: () => void;
  onSaveAndPrint: (savedFile: File) => void;
}

interface EditorState {
  pageOrder: number[];
  rotations: Record<number, number>;
  cropMargins: number;
  deletedPages: number[];
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
  const [blankPages, setBlankPages] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<EditorState>({
    pageOrder: [],
    rotations: {},
    cropMargins: 0,
    deletedPages: [],
  });

  const [history, setHistory] = useState<EditorState[]>([]);
  const [redoStack, setRedoStack] = useState<EditorState[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    if (initialFile) {
      setCurrentFile(initialFile);
    }
  }, [initialFile]);

  useEffect(() => {
    if (!noticeMessage) return;
    const timer = window.setTimeout(() => setNoticeMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [noticeMessage]);

  useEffect(() => {
    if (!isOpen || !currentFile) return;

    let isMounted = true;
    currentFile
      .arrayBuffer()
      .then((buffer) => {
        pdfjsLib
          .getDocument({ data: new Uint8Array(buffer) })
          .promise.then((doc) => {
            if (!isMounted) return;
            setPdfDocProxy(doc);
            const count = doc.numPages;
            setTotalPages(count);
            setCurrentPage(1);

            const initialOrder = Array.from({ length: count }, (_, i) => i + 1);
            setEditorState({
              pageOrder: initialOrder,
              rotations: {},
              cropMargins: 0,
              deletedPages: [],
            });
            setHistory([]);
            setRedoStack([]);
            setNoticeMessage(null);

            const detectedBlanks: number[] = [];
            const checkPage = async (p: number) => {
              if (p > count || !isMounted) {
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
          })
          .catch(() => {
            if (isMounted) {
              setNoticeMessage('Unable to read this PDF document. Check that it is valid and unencrypted.');
            }
          });
      })
      .catch(() => {
        if (isMounted) {
          setNoticeMessage('Could not load the selected file.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentFile]);

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

      const pageRotation =
        (page.rotate + (editorState.rotations[targetOriginalPage] || 0)) % 360;
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });

      const containerWidth = Math.min(window.innerWidth - 32, 480);
      const calculatedScale = (containerWidth / baseViewport.width) * scale;

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
  }, [pdfDocProxy, currentPage, scale, editorState, totalPages]);

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
      setNoticeMessage('A document must have at least one remaining page.');
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
      setNoticeMessage('Cannot remove all pages. At least one page must remain.');
      return;
    }
    pushChange({
      ...editorState,
      deletedPages: nextDeleted,
    });
    setCurrentPage(1);
  };

  const handleSaveAndProceed = async () => {
    if (!currentFile) return;
    Haptics.success();
    setIsSaving(true);
    setNoticeMessage(null);

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
    } catch {
      setIsSaving(false);
      setNoticeMessage('Could not save PDF changes. Please check the file and try again.');
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
      aria-label="PDF Studio Editor"
      className="fixed inset-0 z-50 bg-[#0D1410] text-white flex flex-col animate-view-enter select-none"
    >
      {/* Top Header Bar */}
      <header className="h-14 px-3 border-b border-white/10 bg-[#131D17] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/90 active:scale-95 transition-transform"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[13.5px] font-bold text-white truncate max-w-[160px] sm:max-w-xs">
              {currentFile ? currentFile.name : 'PDF Editor'}
            </h2>
            <span className="text-[11px] text-white/65 tabular-nums">
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
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white/90 active:scale-95"
          >
            <ArrowUUpLeft size={16} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            aria-label="Redo"
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-white/90 active:scale-95"
          >
            <ArrowUUpRight size={16} weight="bold" aria-hidden="true" />
          </button>

          <div className="h-4 w-px bg-white/15 mx-1" />

          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.7, +(s - 0.15).toFixed(2)))}
            aria-label="Zoom out"
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/90 active:scale-95"
          >
            <MagnifyingGlassMinus size={16} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.0, +(s + 0.15).toFixed(2)))}
            aria-label="Zoom in"
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/90 active:scale-95"
          >
            <MagnifyingGlassPlus size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Inline Notice Banner */}
      {noticeMessage && (
        <div
          role="alert"
          className="px-4 py-2.5 bg-[#991B1B] text-white text-xs font-semibold flex items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <WarningCircle size={16} weight="fill" aria-hidden="true" />
            <span>{noticeMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            aria-label="Dismiss notice"
            className="p-1 rounded-md hover:bg-white/10"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* Main Stage: Live PDF Canvas Preview */}
      <main className="flex-1 overflow-auto flex flex-col items-center justify-center p-3 relative bg-[#090F0B]">
        {currentFile ? (
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-white">
            <canvas ref={mainCanvasRef} className="block transition-all" />

            {isCurrentPageBlank && (
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-amber-400 text-[#191C1A] font-bold text-[10.5px] shadow-md flex items-center gap-1">
                <WarningCircle size={13} weight="fill" aria-hidden="true" />
                <span>Blank Page</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-xs">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-[#A7E2B8] mb-3">
              <UploadSimple size={30} weight="duotone" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-bold text-white">Select a PDF to Edit</h3>
            <p className="text-xs text-white/65 mt-1 mb-4">
              Rotate, delete, reorder pages, and strip blank pages before printing.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-5 rounded-xl bg-[#194F34] hover:bg-[#1E5E3E] text-white font-semibold text-xs border border-white/15 active:scale-95 transition-all"
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
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/80 border border-white/15 text-xs text-white shadow-lg">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="w-8 h-8 flex items-center justify-center hover:text-[#A7E2B8] disabled:opacity-30"
              aria-label="Previous page"
            >
              <CaretLeft size={15} weight="bold" />
            </button>
            <span className="font-semibold text-[11.5px] px-1 tabular-nums">
              {currentPage} / {visiblePages.length}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(visiblePages.length, p + 1))}
              disabled={currentPage >= visiblePages.length}
              className="w-8 h-8 flex items-center justify-center hover:text-[#A7E2B8] disabled:opacity-30"
              aria-label="Next page"
            >
              <CaretRight size={15} weight="bold" />
            </button>
          </div>
        )}
      </main>

      {/* Page Thumbnails Ribbon */}
      {visiblePages.length > 0 && (
        <section
          aria-label="Page Thumbnails"
          className="h-16 px-3 bg-[#101913] border-t border-white/10 flex items-center gap-2 overflow-x-auto shrink-0"
        >
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
                    ? 'border-[#7DD39A] bg-[#194F34]/50 ring-2 ring-[#7DD39A]/30'
                    : 'border-white/15 bg-white/5 hover:border-white/30'
                }`}
              >
                <div
                  className="w-5 h-6 bg-white/20 rounded-xs flex items-center justify-center text-[10px] font-bold text-white/90 tabular-nums"
                  style={{ transform: `rotate(${rot}deg)` }}
                >
                  {pageNum}
                </div>
                {isBlank && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 -mt-1" />}
              </button>
            );
          })}
        </section>
      )}

      {/* Editing Toolbar */}
      <footer className="p-3 bg-[#131D17] border-t border-white/10 flex flex-col gap-2.5 shrink-0 pb-safe">
        <div className="max-w-lg w-full mx-auto flex flex-col gap-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => handleRotateCurrent(-90)}
              disabled={visiblePages.length === 0}
              className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
            >
              <ArrowCounterClockwise size={15} weight="bold" className="mb-0.5 text-[#A7E2B8]" />
              <span>Rotate -90°</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotateCurrent(90)}
              disabled={visiblePages.length === 0}
              className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
            >
              <ArrowClockwise size={15} weight="bold" className="mb-0.5 text-[#A7E2B8]" />
              <span>Rotate 90°</span>
            </button>

            <button
              type="button"
              onClick={() => handleMoveCurrent('left')}
              disabled={currentPage <= 1}
              className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
            >
              <ArrowLeft size={15} weight="bold" className="mb-0.5" />
              <span>Move Left</span>
            </button>

            <button
              type="button"
              onClick={() => handleMoveCurrent('right')}
              disabled={currentPage >= visiblePages.length}
              className="min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex flex-col items-center justify-center text-[10px] font-semibold text-white/90 active:scale-95 disabled:opacity-40"
            >
              <ArrowRight size={15} weight="bold" className="mb-0.5" />
              <span>Move Right</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteCurrent}
              disabled={visiblePages.length <= 1}
              className="min-h-[44px] rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 flex flex-col items-center justify-center text-[10px] font-semibold text-rose-200 active:scale-95 disabled:opacity-40"
            >
              <Trash size={15} weight="bold" className="mb-0.5 text-rose-300" />
              <span>Delete</span>
            </button>
          </div>

          {blankPages.length > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-950/45 border border-amber-500/30 text-amber-100 text-xs">
              <div className="flex items-center gap-1.5">
                <WarningCircle size={16} weight="fill" className="text-amber-400 shrink-0" />
                <span className="tabular-nums">{blankPages.length} blank page(s) detected</span>
              </div>
              <button
                type="button"
                onClick={handleRemoveAllBlanks}
                className="min-h-[34px] px-3 rounded-lg bg-amber-400 text-[#191C1A] font-bold text-[11px] active:scale-95"
              >
                Remove Blanks
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveAndProceed}
            disabled={!currentFile || isSaving}
            className="w-full min-h-[48px] rounded-xl bg-[#194F34] hover:bg-[#1E5E3E] text-white font-semibold text-sm border border-white/10 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <span>Saving changes...</span>
            ) : (
              <>
                <CheckCircle size={18} weight="bold" aria-hidden="true" />
                <span>Save &amp; Send to Print</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
};
