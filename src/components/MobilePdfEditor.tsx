import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, degrees } from 'pdf-lib';
import Sortable from 'sortablejs';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Trash2,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  FileText,
  Sliders,
  Check,
  AlertCircle,
  CheckCircle2,
  GripVertical,
  Undo2,
  CircleHelp,
  ZoomIn,
  ZoomOut,
  Crop,
  Maximize2,
} from 'lucide-react';
import { UploadedPrintDocument } from '../types/kiosk';
import { Haptics } from '../utils/haptics';
import { analyzePdfPage } from '../utils/blankPageDetector';
import { NATIVE_FILE_ACCEPT_ATTR } from '../utils/kioskLogic';

// Ensure PDF.js worker is initialized safely
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface MobilePdfEditorProps {
  documents: UploadedPrintDocument[];
  onSaveAndContinue: (updatedDocuments: UploadedPrintDocument[]) => void;
  onAddMoreFiles: (files: File[]) => void;
  onRemoveDocument: (docId: string) => void;
  onBack: () => void;
}

interface DocEditState {
  pageOrder: number[]; // 1-based original page numbers
  rotations: Record<number, number>; // pageNumber -> additional degrees (0, 90, 180, 270)
  deletedPages: number[]; // 1-based original page numbers
  cropMargins: number; // pt margin
  detectedBlanks: number[]; // 1-based original page numbers
  isAnalyzingBlanks: boolean;
}

// Dedicated Single Page Canvas component that renders crisp, full-page, complete PDF page
const PdfPageCanvas: React.FC<{
  pdfProxy: pdfjsLib.PDFDocumentProxy;
  originalPageNumber: number;
  rotation: number;
  targetWidth: number;
  maxHeight?: number;
}> = ({ pdfProxy, originalPageNumber, rotation, targetWidth, maxHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore cancellation
      }
      renderTaskRef.current = null;
    }

    pdfProxy.getPage(originalPageNumber).then((page) => {
      if (isCancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const totalRotation = (page.rotate + (rotation || 0)) % 360;

      // Base unscaled viewport
      const unscaledVp = page.getViewport({ scale: 1, rotation: totalRotation });

      // Calculate width & scale so it fits nicely
      const displayWidth = Math.max(260, Math.min(targetWidth, 420));
      let scale = displayWidth / unscaledVp.width;

      // Ensure it also fits vertically within max available stage height
      if (maxHeight && unscaledVp.height * scale > maxHeight) {
        scale = maxHeight / unscaledVp.height;
      }

      const viewport = page.getViewport({ scale, rotation: totalRotation });

      // Hi-DPI scaling for sharp, readable mobile rendering
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      });
      renderTaskRef.current = renderTask;
      renderTask.promise.catch(() => {});
    });

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfProxy, originalPageNumber, rotation, targetWidth, maxHeight]);

  return (
    <div className="w-full bg-white relative flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="block max-w-full shadow-2xs" />
    </div>
  );
};

export const MobilePdfEditor: React.FC<MobilePdfEditorProps> = ({
  documents,
  onSaveAndContinue,
  onAddMoreFiles,
  onRemoveDocument,
  onBack,
}) => {
  // Active document selection
  const [activeDocId, setActiveDocId] = useState<string>(
    documents[0]?.id || ''
  );

  // Per-document modification state map
  const [editStates, setEditStates] = useState<Record<string, DocEditState>>({});
  // History stack for Undo
  const [undoStack, setUndoStack] = useState<Record<string, DocEditState>[]>([]);

  // Active page within the active document (1-based index among visible pages)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | 'none'>('none');

  // Multi-select mode for thumbnails
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  // Modals & Sheets
  const [showBlankSheet, setShowBlankSheet] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showReorderModal, setShowReorderModal] = useState<boolean>(false);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  // Viewport dimensions for responsive canvas sizing
  const [viewportDims, setViewportDims] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? Math.min(window.innerWidth - 28, 430) : 360,
    height: typeof window !== 'undefined' ? window.innerHeight : 700,
  });

  // Touch gesture tracking for swipe & pinch-to-zoom
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1.0);

  // Thumbnail refs for auto-scrolling
  const thumbnailRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // PDF.js cached proxy instances per document
  const pdfProxiesRef = useRef<Record<string, pdfjsLib.PDFDocumentProxy>>({});
  const [, setDocProxiesLoaded] = useState<Record<string, number>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, Record<number, string>>>({});

  const reorderContainerRef = useRef<HTMLDivElement | null>(null);
  const sortableInstanceRef = useRef<Sortable | null>(null);
  const addFileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep viewportDims responsive
  useEffect(() => {
    const handleResize = () => {
      setViewportDims({
        width: Math.min(window.innerWidth - 28, 430),
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Active document object
  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];
  const activeState = activeDoc ? editStates[activeDoc.id] : undefined;

  // Initialize edit states and load PDF.js proxies for uploaded documents
  useEffect(() => {
    let isMounted = true;

    documents.forEach((doc) => {
      if (!doc.rawFile) return;

      // Initialize edit state if not yet present
      setEditStates((prev) => {
        if (prev[doc.id]) return prev;
        const initialOrder = Array.from(
          { length: doc.pageCount || 1 },
          (_, i) => i + 1
        );
        return {
          ...prev,
          [doc.id]: {
            pageOrder: initialOrder,
            rotations: {},
            deletedPages: [],
            cropMargins: 0,
            detectedBlanks: doc.blankPages || [],
            isAnalyzingBlanks: true,
          },
        };
      });

      // Load PDF.js proxy if not already loaded
      if (!pdfProxiesRef.current[doc.id]) {
        doc.rawFile.arrayBuffer().then((buffer) => {
          pdfjsLib
            .getDocument({ data: new Uint8Array(buffer) })
            .promise.then(async (pdfProxy) => {
              if (!isMounted) return;
              pdfProxiesRef.current[doc.id] = pdfProxy;
              const actualCount = pdfProxy.numPages;

              setDocProxiesLoaded((prev) => ({
                ...prev,
                [doc.id]: actualCount,
              }));

              // Sync initial page order with actual page count
              setEditStates((prev) => {
                const existing = prev[doc.id];
                if (!existing) return prev;
                return {
                  ...prev,
                  [doc.id]: {
                    ...existing,
                    pageOrder: Array.from({ length: actualCount }, (_, i) => i + 1),
                  },
                };
              });

              // Generate low-resolution thumbnails progressively for thumbnail carousel & reorder
              const docThumbs: Record<number, string> = {};
              for (let p = 1; p <= actualCount; p++) {
                try {
                  const page = await pdfProxy.getPage(p);
                  const vp = page.getViewport({ scale: 0.28 });
                  const thumbCanvas = document.createElement('canvas');
                  thumbCanvas.width = vp.width;
                  thumbCanvas.height = vp.height;
                  const ctx = thumbCanvas.getContext('2d')!;
                  ctx.fillStyle = '#FFFFFF';
                  ctx.fillRect(0, 0, vp.width, vp.height);
                  await page.render({ canvasContext: ctx, viewport: vp }).promise;
                  docThumbs[p] = thumbCanvas.toDataURL('image/jpeg', 0.8);
                } catch {
                  // ignore thumbnail render error
                }
              }

              if (isMounted) {
                setThumbnails((prev) => ({
                  ...prev,
                  [doc.id]: docThumbs,
                }));
              }

              // Run background blank page detection
              const blanks: number[] = [];
              for (let p = 1; p <= actualCount; p++) {
                try {
                  const page = await pdfProxy.getPage(p);
                  const analysis = await analyzePdfPage(page, p);
                  if (analysis.isBlank) blanks.push(p);
                } catch {
                  // ignore analysis error
                }
              }

              if (isMounted) {
                setEditStates((prev) => {
                  const existing = prev[doc.id];
                  if (!existing) return prev;
                  return {
                    ...prev,
                    [doc.id]: {
                      ...existing,
                      detectedBlanks: blanks,
                      isAnalyzingBlanks: false,
                    },
                  };
                });
              }
            })
            .catch(() => {});
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [documents]);

  // Ensure activeDocId is valid if documents change
  useEffect(() => {
    if (!documents.some((d) => d.id === activeDocId) && documents[0]) {
      setActiveDocId(documents[0].id);
      setCurrentPage(1);
      setZoomScale(1.0);
    }
  }, [documents, activeDocId]);

  // Compute visible pages for active document
  const visiblePages = useMemo(() => {
    if (!activeState) return [];
    return activeState.pageOrder.filter(
      (p) => !activeState.deletedPages.includes(p)
    );
  }, [activeState]);

  // The single active original page to display
  const activeOriginalPage = visiblePages[currentPage - 1];

  // Helper to push to undo stack before making modifications
  const pushUndoState = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-20), editStates]);
  }, [editStates]);

  // Navigate to specific page with smooth transition
  const goToPage = useCallback((targetIndex: number, direction?: 'left' | 'right') => {
    if (targetIndex < 1 || targetIndex > visiblePages.length || targetIndex === currentPage) return;
    Haptics.selection();
    const dir = direction || (targetIndex > currentPage ? 'left' : 'right');
    setSlideDirection(dir);
    setCurrentPage(targetIndex);
    setZoomScale(1.0); // Reset zoom on page change to fit to width

    const timer = setTimeout(() => {
      setSlideDirection('none');
    }, 200);
    return () => clearTimeout(timer);
  }, [visiblePages.length, currentPage]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    const el = thumbnailRefs.current[currentPage];
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentPage]);

  // Keyboard left/right arrow navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showReorderModal || showDeleteConfirm || showBlankSheet || showCropModal || showHelpModal) return;
      if (e.key === 'ArrowLeft') {
        if (currentPage > 1) goToPage(currentPage - 1, 'right');
      } else if (e.key === 'ArrowRight') {
        if (currentPage < visiblePages.length) goToPage(currentPage + 1, 'left');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, visiblePages.length, goToPage, showReorderModal, showDeleteConfirm, showBlankSheet, showCropModal, showHelpModal]);

  // Touch Swipe & Pinch Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      initialPinchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      // Pinch to zoom start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistanceRef.current = dist;
      initialZoomRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialPinchDistanceRef.current;
      const nextZoom = Math.min(2.5, Math.max(0.7, +(initialZoomRef.current * factor).toFixed(2)));
      setZoomScale(nextZoom);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      initialPinchDistanceRef.current = null;
    }

    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (zoomScale > 1.05) {
      // When zoomed in, allow panning
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Horizontal swipe threshold: 45px and dominant over vertical movement
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && currentPage < visiblePages.length) {
        // Swiped left -> next page
        goToPage(currentPage + 1, 'left');
      } else if (deltaX > 0 && currentPage > 1) {
        // Swiped right -> previous page
        goToPage(currentPage - 1, 'right');
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Double tap to toggle zoom
  const handleDoubleTap = () => {
    Haptics.buttonPress();
    setZoomScale((prev) => (prev > 1.05 ? 1.0 : 1.6));
  };

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    Haptics.buttonPress();
    setUndoStack((prev) => {
      const next = [...prev];
      const previousState = next.pop();
      if (previousState) {
        setEditStates(previousState);
      }
      return next;
    });
  }, [undoStack]);

  // Initialize SortableJS in the Reorder Modal
  useEffect(() => {
    if (!showReorderModal || !reorderContainerRef.current || !activeDoc) return;

    if (sortableInstanceRef.current) {
      sortableInstanceRef.current.destroy();
      sortableInstanceRef.current = null;
    }

    sortableInstanceRef.current = new Sortable(reorderContainerRef.current, {
      animation: 200,
      ghostClass: 'opacity-40',
      handle: '.reorder-handle',
      touchStartThreshold: 3,
      onEnd: (evt) => {
        if (
          evt.oldIndex === undefined ||
          evt.newIndex === undefined ||
          evt.oldIndex === evt.newIndex ||
          !activeDoc
        ) {
          return;
        }

        pushUndoState();
        Haptics.selection();
        const fromIdx = evt.oldIndex;
        const toIdx = evt.newIndex;

        const newVisible = [...visiblePages];
        const [movedItem] = newVisible.splice(fromIdx, 1);
        newVisible.splice(toIdx, 0, movedItem);

        setEditStates((prev) => {
          const current = prev[activeDoc.id];
          if (!current) return prev;

          return {
            ...prev,
            [activeDoc.id]: {
              ...current,
              pageOrder: newVisible,
            },
          };
        });

        setCurrentPage(toIdx + 1);
      },
    });

    return () => {
      if (sortableInstanceRef.current) {
        sortableInstanceRef.current.destroy();
        sortableInstanceRef.current = null;
      }
    };
  }, [showReorderModal, activeDoc, visiblePages, pushUndoState]);

  // 1. Tool: Rotate Active Page by 90° Clockwise
  const handleRotateActivePage = useCallback((delta = 90) => {
    if (!activeDoc || !activeOriginalPage) return;
    pushUndoState();
    Haptics.buttonPress();

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      const currentRot = cur.rotations[activeOriginalPage] || 0;
      const nextRot = (currentRot + delta) % 360;

      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          rotations: {
            ...cur.rotations,
            [activeOriginalPage]: nextRot,
          },
        },
      };
    });
  }, [activeDoc, activeOriginalPage, pushUndoState]);

  // 2. Tool: Delete Active Page
  const handleDeleteCurrentPage = useCallback(() => {
    if (!activeDoc || !activeOriginalPage) return;
    if (visiblePages.length <= 1) {
      alert('Cannot delete all pages. At least one page must remain.');
      return;
    }

    pushUndoState();
    Haptics.buttonPress();

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          deletedPages: [...cur.deletedPages, activeOriginalPage],
        },
      };
    });

    setShowDeleteConfirm(false);
    setCurrentPage((prev) => Math.max(1, Math.min(prev, visiblePages.length - 1)));
  }, [activeDoc, activeOriginalPage, visiblePages.length, pushUndoState]);

  // Multi-Select: Toggle single page in selection
  const toggleSelectPage = (pageNum: number) => {
    Haptics.selection();
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  // Multi-Select: Delete Selected Pages
  const handleDeleteSelected = () => {
    if (!activeDoc || selectedPages.size === 0) return;
    if (visiblePages.length - selectedPages.size <= 0) {
      alert('Cannot delete all pages. At least one page must remain.');
      return;
    }
    pushUndoState();
    Haptics.buttonPress();

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          deletedPages: Array.from(new Set([...cur.deletedPages, ...Array.from(selectedPages)])),
        },
      };
    });

    setSelectedPages(new Set());
    setIsSelectMode(false);
    setCurrentPage(1);
  };

  // Multi-Select: Rotate Selected Pages
  const handleRotateSelected = (delta = 90) => {
    if (!activeDoc || selectedPages.size === 0) return;
    pushUndoState();
    Haptics.buttonPress();

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      const nextRotations = { ...cur.rotations };
      selectedPages.forEach((p) => {
        const curRot = nextRotations[p] || 0;
        nextRotations[p] = (curRot + delta) % 360;
      });

      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          rotations: nextRotations,
        },
      };
    });
  };

  // 4. Tool: Crop / Margins Preset
  const handleApplyCrop = (marginPt: number) => {
    if (!activeDoc) return;
    pushUndoState();
    Haptics.buttonPress();

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          cropMargins: marginPt,
        },
      };
    });
    setShowCropModal(false);
  };

  // 5. Tool: Remove All Blank Pages from Active Document
  const handleRemoveAllBlanks = useCallback(() => {
    if (!activeDoc || !activeState || activeState.detectedBlanks.length === 0) return;
    const blanks = activeState.detectedBlanks;
    if (visiblePages.length - blanks.length <= 0) {
      alert('Cannot delete all pages.');
      return;
    }

    pushUndoState();
    Haptics.success();
    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          deletedPages: Array.from(new Set([...cur.deletedPages, ...blanks])),
        },
      };
    });

    setShowBlankSheet(false);
    setCurrentPage(1);
  }, [activeDoc, activeState, visiblePages.length, pushUndoState]);

  // 6. Tool: Fit to Width (Reset zoom)
  const handleFitWidth = () => {
    Haptics.buttonPress();
    setZoomScale(1.0);
  };

  // Compile all modified documents with pdf-lib and continue to Preview & Print
  const handleContinueToPreview = async () => {
    Haptics.success();
    setIsCompiling(true);

    try {
      const updatedDocs: UploadedPrintDocument[] = [];

      for (const doc of documents) {
        const state = editStates[doc.id];
        if (!state || !doc.rawFile) {
          updatedDocs.push(doc);
          continue;
        }

        const visible = state.pageOrder.filter(
          (p) => !state.deletedPages.includes(p)
        );

        const hasRotations = Object.values(state.rotations).some((r) => r !== 0);
        const hasDeletions = state.deletedPages.length > 0;
        const hasReorder = state.pageOrder.some((p, i) => p !== i + 1);
        const hasCrop = state.cropMargins > 0;

        // If no edits occurred, retain original document
        if (!hasRotations && !hasDeletions && !hasReorder && !hasCrop) {
          updatedDocs.push(doc);
          continue;
        }

        // Apply modifications using pdf-lib
        const arrayBuffer = await doc.rawFile.arrayBuffer();
        const sourceDoc = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: true,
        });
        const outputDoc = await PDFDocument.create();

        const zeroBasedIndices = visible.map((p) => p - 1);
        const copiedPages = await outputDoc.copyPages(sourceDoc, zeroBasedIndices);

        copiedPages.forEach((page, idx) => {
          const originalPageNum = visible[idx];
          const addRot = state.rotations[originalPageNum] || 0;
          if (addRot !== 0) {
            const baseAngle = page.getRotation().angle;
            page.setRotation(degrees((baseAngle + addRot) % 360));
          }

          if (state.cropMargins > 0) {
            const { width, height } = page.getSize();
            const m = state.cropMargins;
            if (width > m * 2 && height > m * 2) {
              page.setCropBox(m, m, width - m * 2, height - m * 2);
            }
          }

          outputDoc.addPage(page);
        });

        const modifiedBytes = await outputDoc.save();
        const modifiedFile = new File(
          [modifiedBytes as unknown as BlobPart],
          doc.name,
          { type: 'application/pdf' }
        );

        updatedDocs.push({
          ...doc,
          rawFile: modifiedFile,
          originalFile: doc.originalFile || doc.rawFile,
          pageCount: visible.length,
          originalPageCount: doc.originalPageCount ?? doc.pageCount,
          blankPages: state.detectedBlanks.filter((p) => visible.includes(p)),
          removedBlankPages: state.detectedBlanks.filter((p) =>
            state.deletedPages.includes(p)
          ),
        });
      }

      setIsCompiling(false);
      onSaveAndContinue(updatedDocs);
    } catch (err) {
      setIsCompiling(false);
      console.error('Failed to compile edited PDF:', err);
      alert('Could not save PDF modifications. Please try again.');
    }
  };

  const activePdfProxy = activeDoc ? pdfProxiesRef.current[activeDoc.id] : null;
  const isCurrentPageBlank =
    activeOriginalPage && activeState
      ? activeState.detectedBlanks.includes(activeOriginalPage)
      : false;
  const currentRotation =
    activeOriginalPage && activeState
      ? activeState.rotations[activeOriginalPage] || 0
      : 0;

  // Max preview height for single page viewport (mobile friendly)
  const maxStageHeight = Math.max(300, viewportDims.height - 310);

  return (
    <div
      data-testid="mobile-pdf-editor"
      className="fixed inset-0 z-40 bg-[#F4F7F4] text-[#191C1A] flex flex-col antialiased select-none"
    >
      {/* Hidden File Input for Adding Additional Documents */}
      <input
        ref={addFileInputRef}
        type="file"
        multiple
        accept={NATIVE_FILE_ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddMoreFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {/* 1. Header with Back Button, Document Title, Auto-saved Badge, Undo & Help Buttons */}
      <header className="h-14 px-3.5 bg-white border-b border-[#1B4D2E]/10 flex items-center justify-between shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onBack();
            }}
            aria-label="Back to home"
            className="w-9 h-9 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] hover:bg-[#E2EFE7] active:scale-95 transition-all flex items-center justify-center shrink-0"
          >
            <ArrowLeft className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>

          <div className="flex flex-col min-w-0">
            <h1 className="text-sm font-bold text-[#191C1A] truncate max-w-[190px] sm:max-w-[260px]">
              {activeDoc?.name || 'Document Editor'}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#545D56]">
              <span>
                Page {visiblePages.length > 0 ? currentPage : 0} of {visiblePages.length}
              </span>
              <span className="w-1 h-1 rounded-full bg-black/20" />
              <span className="text-[#1B4D2E] font-semibold flex items-center gap-0.5">
                <Check className="w-3 h-3 stroke-[2.8]" /> Auto-saved
              </span>
            </div>
          </div>
        </div>

        {/* Top-right: Undo and Help icon buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            aria-label="Undo"
            title="Undo last change"
            className="w-8 h-8 rounded-lg hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none text-[#545D56] flex items-center justify-center active:scale-95 transition-all"
          >
            <Undo2 className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>

          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowHelpModal(true);
            }}
            aria-label="Help"
            title="Editor tips"
            className="w-8 h-8 rounded-lg hover:bg-black/5 text-[#545D56] flex items-center justify-center active:scale-95 transition-all"
          >
            <CircleHelp className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>
        </div>
      </header>

      {/* 2. Document Tabs Bar (Active doc pill + Add PDF button) */}
      <section
        aria-label="Document Tabs"
        className="px-3.5 py-1.5 bg-[#F8FAF8] border-b border-[#1B4D2E]/10 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none"
      >
        {documents.map((doc) => {
          const isSelected = doc.id === activeDocId;
          const state = editStates[doc.id];
          const count = state
            ? state.pageOrder.length - state.deletedPages.length
            : doc.pageCount;

          return (
            <div
              key={doc.id}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                isSelected
                  ? 'bg-[#1B4D2E] text-white shadow-xs'
                  : 'bg-white border border-[#1B4D2E]/20 text-[#545D56] hover:text-[#191C1A]'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  setActiveDocId(doc.id);
                  setCurrentPage(1);
                  setZoomScale(1.0);
                }}
                className="flex items-center gap-1.5 max-w-[150px] truncate"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{doc.name}</span>
                <span
                  className={`text-[10px] px-1 rounded-sm font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-black/5 text-[#545D56]'
                  }`}
                >
                  {count}p
                </span>
              </button>

              {documents.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    Haptics.buttonPress();
                    if (confirm(`Remove ${doc.name} from this print session?`)) {
                      onRemoveDocument(doc.id);
                    }
                  }}
                  className={`p-0.5 rounded-full hover:bg-black/10 ${
                    isSelected ? 'text-white/80 hover:text-white' : 'text-[#707B72]'
                  }`}
                  aria-label={`Remove ${doc.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            Haptics.buttonPress();
            addFileInputRef.current?.click();
          }}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-dashed border-[#1B4D2E]/35 bg-white text-xs font-semibold text-[#1B4D2E] hover:bg-[#EDF5F0] shrink-0 active:scale-95"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
          <span>Add PDF</span>
        </button>
      </section>

      {/* 3. Single-Page PDF Document Preview with Centered Floating Navigation Pill */}
      <main
        tabIndex={0}
        aria-label="Single-Page PDF Document Preview"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-hidden p-2 sm:p-3 flex flex-col items-center justify-center relative bg-[#EBEFEA] focus:outline-none select-none"
      >
        {/* Single Complete PDF Page Display */}
        {activeDoc && activePdfProxy && activeOriginalPage ? (
          <article
            key={`${activeDoc.id}-p-${activeOriginalPage}`}
            onDoubleClick={handleDoubleTap}
            className={`w-full max-w-[420px] bg-white rounded-lg shadow-md border border-black/10 overflow-hidden relative my-auto transition-transform duration-200 ${
              slideDirection === 'left'
                ? 'translate-x-1 opacity-90'
                : slideDirection === 'right'
                ? '-translate-x-1 opacity-90'
                : 'translate-x-0 opacity-100'
            }`}
            style={{
              transform: `scale(${zoomScale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Blank Page Notification Badge on page */}
            {isCurrentPageBlank && (
              <div className="absolute top-2 right-2 z-10 flex items-center gap-1 text-amber-800 font-bold bg-amber-50/95 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] shadow-sm backdrop-blur-xs">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                <span>Blank Page</span>
              </div>
            )}

            {/* Complete Full-Page PDF Canvas */}
            <PdfPageCanvas
              pdfProxy={activePdfProxy}
              originalPageNumber={activeOriginalPage}
              rotation={currentRotation}
              targetWidth={viewportDims.width}
              maxHeight={maxStageHeight}
            />
          </article>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#545D56] gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5 text-[#1B4D2E]" />
            </div>
            <p className="text-xs font-semibold">Loading document preview...</p>
          </div>
        )}

        {/* Centered Floating Navigation Pill: < 1 / 2 > | [-] [+] */}
        {visiblePages.length > 0 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-[#272B28]/90 text-white backdrop-blur-md shadow-xl border border-white/10">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1, 'right')}
              disabled={currentPage <= 1}
              aria-label="Previous Page"
              className="p-1 hover:text-white/80 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <span className="text-xs font-bold tracking-wide select-none min-w-[36px] text-center">
              {currentPage} / {visiblePages.length}
            </span>

            <button
              type="button"
              onClick={() => goToPage(currentPage + 1, 'left')}
              disabled={currentPage >= visiblePages.length}
              aria-label="Next Page"
              className="p-1 hover:text-white/80 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>

            <div className="w-px h-3.5 bg-white/20" />

            <button
              type="button"
              onClick={() => {
                Haptics.buttonPress();
                setZoomScale((z) => Math.max(0.7, +(z - 0.2).toFixed(2)));
              }}
              aria-label="Zoom out"
              className="p-1 hover:text-white/80 active:scale-90 transition-all"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                Haptics.buttonPress();
                setZoomScale((z) => Math.min(2.5, +(z + 0.2).toFixed(2)));
              }}
              aria-label="Zoom in"
              className="p-1 hover:text-white/80 active:scale-90 transition-all"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* Multi-Select Action Banner (appears when in select mode) */}
      {isSelectMode && (
        <div className="px-3.5 py-1.5 bg-[#EDF5F0] border-t border-[#1B4D2E]/15 flex items-center justify-between text-xs shrink-0 z-10">
          <span className="font-bold text-[#1B4D2E]">
            {selectedPages.size} of {visiblePages.length} selected
          </span>
          <div className="flex items-center gap-2 font-bold text-xs">
            <button
              type="button"
              onClick={() => {
                if (selectedPages.size === visiblePages.length) {
                  setSelectedPages(new Set());
                } else {
                  setSelectedPages(new Set(visiblePages));
                }
              }}
              className="text-[#1B4D2E] hover:underline"
            >
              {selectedPages.size === visiblePages.length ? 'Deselect All' : 'Select All'}
            </button>
            {selectedPages.size > 0 && (
              <>
                <span className="text-black/20">|</span>
                <button
                  type="button"
                  onClick={() => handleRotateSelected(90)}
                  className="text-[#1B4D2E] hover:underline"
                >
                  Rotate
                </button>
                <span className="text-black/20">|</span>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="text-rose-600 hover:underline"
                >
                  Delete ({selectedPages.size})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. Page Thumbnails Strip with 'Select' Button */}
      {visiblePages.length > 0 && (
        <section
          aria-label="Page Thumbnails"
          className="px-3 py-2 bg-white border-t border-[#1B4D2E]/10 flex items-center gap-2 shrink-0 z-10"
        >
          <div className="flex-1 flex items-center gap-2.5 overflow-x-auto scrollbar-none py-1">
            {visiblePages.map((origP, idx) => {
              const pageNum = idx + 1;
              const isSelected = pageNum === currentPage;
              const isBlank = activeState?.detectedBlanks.includes(origP);
              const isMultiSelected = selectedPages.has(origP);
              const thumbUrl = activeDoc ? thumbnails[activeDoc.id]?.[origP] : undefined;
              const rot = activeState?.rotations[origP] || 0;

              return (
                <button
                  key={origP}
                  ref={(el) => {
                    thumbnailRefs.current[pageNum] = el;
                  }}
                  type="button"
                  onClick={() => {
                    if (isSelectMode) {
                      toggleSelectPage(origP);
                    } else {
                      goToPage(pageNum);
                    }
                  }}
                  className={`relative w-12 h-16 sm:w-13 sm:h-17 rounded-lg overflow-hidden shrink-0 border-2 transition-all flex flex-col items-center justify-center bg-white ${
                    isSelectMode && isMultiSelected
                      ? 'border-[#1B4D2E] ring-2 ring-[#1B4D2E]/25 shadow-xs'
                      : isSelected
                      ? 'border-[#1B4D2E] ring-2 ring-[#1B4D2E]/20 shadow-xs'
                      : 'border-black/10 hover:border-[#1B4D2E]/40'
                  }`}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`Page ${pageNum}`}
                      className="w-full h-full object-contain p-0.5"
                      style={{ transform: `rotate(${rot}deg)` }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F8FAF8] text-[#545D56]">
                      <FileText className="w-3.5 h-3.5 text-[#1B4D2E]/60 mb-0.5" />
                      <span className="text-[10px] font-bold">{pageNum}</span>
                    </div>
                  )}

                  {/* Page Number Badge */}
                  <span
                    className={`absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[9px] font-bold shadow-2xs ${
                      isSelected || isMultiSelected
                        ? 'bg-[#1B4D2E] text-white'
                        : 'bg-black/60 text-white'
                    }`}
                  >
                    {pageNum}
                  </span>

                  {/* Blank Page Warning Dot */}
                  {isBlank && (
                    <span
                      title="Blank page detected"
                      className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white shadow-2xs"
                    />
                  )}

                  {/* Multi-Select Checkbox in Corner */}
                  {isSelectMode && (
                    <div
                      className={`absolute top-1 left-1 w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-bold ${
                        isMultiSelected
                          ? 'bg-[#1B4D2E] text-white'
                          : 'bg-white border border-black/30'
                      }`}
                    >
                      {isMultiSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Select Button */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setIsSelectMode(!isSelectMode);
              if (isSelectMode) setSelectedPages(new Set());
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 active:scale-95 transition-all ${
              isSelectMode
                ? 'bg-[#1B4D2E] text-white shadow-xs'
                : 'bg-[#F4F7F4] hover:bg-[#EDF5F0] border border-black/10 text-[#191C1A]'
            }`}
          >
            {isSelectMode ? 'Done' : 'Select'}
          </button>
        </section>
      )}

      {/* 5. Essential 6-Tool Mobile Editing Toolbar */}
      <section
        aria-label="Editing Tools"
        className="px-2 py-2 bg-white border-t border-[#1B4D2E]/10 shrink-0 shadow-xs z-10"
      >
        <div className="grid grid-cols-6 gap-1 text-center">
          {/* Tool 1: Rotate */}
          <button
            type="button"
            onClick={() => handleRotateActivePage(90)}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-[#191C1A] hover:bg-[#EDF5F0] active:scale-95 transition-all"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] flex items-center justify-center mb-1 text-[#1B4D2E] shadow-2xs">
              <RotateCw className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <span className="text-[11px] font-semibold text-[#191C1A] leading-tight">
              Rotate
            </span>
          </button>

          {/* Tool 2: Delete */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={visiblePages.length <= 1}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-rose-700 hover:bg-rose-50 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center mb-1 text-rose-600 shadow-2xs">
              <Trash2 className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <span className="text-[11px] font-semibold text-rose-600 leading-tight">
              Delete
            </span>
          </button>

          {/* Tool 3: Reorder */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowReorderModal(true);
            }}
            disabled={visiblePages.length <= 1}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-[#191C1A] hover:bg-[#EDF5F0] active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] flex items-center justify-center mb-1 text-[#1B4D2E] shadow-2xs">
              <Sliders className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <span className="text-[11px] font-semibold text-[#191C1A] leading-tight">
              Reorder
            </span>
          </button>

          {/* Tool 4: Crop */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowCropModal(true);
            }}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-[#191C1A] hover:bg-[#EDF5F0] active:scale-95 transition-all"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] flex items-center justify-center mb-1 text-[#1B4D2E] shadow-2xs">
              <Crop className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <span className="text-[11px] font-semibold text-[#191C1A] leading-tight">
              Crop
            </span>
          </button>

          {/* Tool 5: Blanks */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowBlankSheet(true);
            }}
            className="relative flex flex-col items-center justify-center py-1 rounded-xl text-[#191C1A] hover:bg-[#EDF5F0] active:scale-95 transition-all"
          >
            <div className="relative w-9 h-9 rounded-xl bg-[#EDF5F0] flex items-center justify-center mb-1 text-[#1B4D2E] shadow-2xs">
              <FileCheck2 className="w-4.5 h-4.5 stroke-[2.2]" />
              {activeState?.detectedBlanks && activeState.detectedBlanks.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-semibold text-[#191C1A] leading-tight">
              Blanks
            </span>
          </button>

          {/* Tool 6: Fit W */}
          <button
            type="button"
            onClick={handleFitWidth}
            className="flex flex-col items-center justify-center py-1 rounded-xl text-[#191C1A] hover:bg-[#EDF5F0] active:scale-95 transition-all"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] flex items-center justify-center mb-1 text-[#1B4D2E] shadow-2xs">
              <Maximize2 className="w-4.5 h-4.5 stroke-[2.2]" />
            </div>
            <span className="text-[11px] font-semibold text-[#191C1A] leading-tight">
              Fit W
            </span>
          </button>
        </div>
      </section>

      {/* 6. Prominent Bottom Action: Continue to Preview & Print */}
      <footer className="p-3 bg-white border-t border-[#1B4D2E]/10 pb-safe shrink-0 shadow-md z-10">
        <button
          type="button"
          onClick={handleContinueToPreview}
          disabled={isCompiling || visiblePages.length === 0}
          className="w-full h-12 rounded-2xl bg-[#1B4D2E] hover:bg-[#143B22] text-white font-bold text-sm shadow-md shadow-[#1B4D2E]/25 flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {isCompiling ? (
            <span>Applying changes &amp; preparing preview...</span>
          ) : (
            <>
              <span>Continue to Preview &amp; Print</span>
              <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
            </>
          )}
        </button>
      </footer>

      {/* Reorder Modal Sheet */}
      {showReorderModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center animate-apple-reveal"
          onClick={() => setShowReorderModal(false)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] rounded-t-3xl bg-white border-t border-[#1B4D2E]/15 shadow-2xl p-4 flex flex-col gap-3 pb-safe animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div>
                <h3 className="text-sm font-bold text-[#191C1A]">Reorder Pages</h3>
                <p className="text-xs text-[#545D56]">
                  Drag and drop page cards to reorder your document
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReorderModal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-[#1B4D2E] text-white text-xs font-bold active:scale-95"
              >
                Done
              </button>
            </div>

            <div
              ref={reorderContainerRef}
              className="grid grid-cols-3 gap-2.5 overflow-y-auto max-h-[55vh] p-1 scrollbar-none"
            >
              {visiblePages.map((origP, idx) => {
                const pageNum = idx + 1;
                const rot = activeState?.rotations[origP] || 0;
                const thumbUrl = activeDoc
                  ? thumbnails[activeDoc.id]?.[origP]
                  : undefined;

                return (
                  <div
                    key={origP}
                    data-id={origP}
                    className="reorder-handle flex flex-col items-center p-2 rounded-2xl bg-[#F8FAF8] border border-black/10 cursor-grab active:cursor-grabbing select-none hover:border-[#1B4D2E]/40"
                  >
                    <div className="relative w-full aspect-[3/4] bg-white rounded-lg shadow-2xs overflow-hidden border border-black/5 flex items-center justify-center">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={`Page ${pageNum}`}
                          className="w-full h-full object-contain"
                          style={{ transform: `rotate(${rot}deg)` }}
                        />
                      ) : (
                        <span className="text-xs font-bold text-[#1B4D2E]">
                          {pageNum}
                        </span>
                      )}
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-[#1B4D2E] text-white text-[9.5px] font-bold">
                        {pageNum}
                      </span>
                      <div className="absolute top-1 right-1 p-0.5 rounded-md bg-black/40 text-white">
                        <GripVertical className="w-3 h-3" />
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-[#545D56] mt-1.5">
                      Page {pageNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Page Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white border border-rose-200 shadow-xl p-5 text-center flex flex-col gap-3 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 stroke-[2.2]" />
            </div>
            <h3 className="text-sm font-bold text-[#191C1A]">
              Delete Page {currentPage}?
            </h3>
            <p className="text-xs text-[#545D56]">
              This will remove page {currentPage} from your print job. You can review all pages before continuing.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-10 rounded-xl bg-white border border-black/15 text-xs font-semibold text-[#545D56] active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCurrentPage}
                className="h-10 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-xs active:scale-95"
              >
                Delete Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Margins Modal Sheet */}
      {showCropModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center animate-apple-reveal"
          onClick={() => setShowCropModal(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white border-t border-[#1B4D2E]/15 shadow-2xl p-5 flex flex-col gap-3.5 animate-apple-card pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <Crop className="w-5 h-5 text-[#1B4D2E]" />
                <h3 className="text-sm font-bold text-[#191C1A]">Crop &amp; Margins</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCropModal(false)}
                className="w-7 h-7 rounded-full bg-black/5 text-[#545D56] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#545D56]">
              Trim document margins to remove edge scanner lines and maximize printable content.
            </p>

            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { label: 'Original (No Crop)', margin: 0, desc: 'Keep full borders' },
                { label: 'Subtle Trim (5mm)', margin: 14, desc: 'Trim edge artifacts' },
                { label: 'Standard Trim (10mm)', margin: 28, desc: 'Even whitespace' },
                { label: 'Deep Trim (15mm)', margin: 42, desc: 'Maximize content' },
              ].map((opt) => {
                const isCurrent = (activeState?.cropMargins || 0) === opt.margin;
                return (
                  <button
                    key={opt.margin}
                    type="button"
                    onClick={() => handleApplyCrop(opt.margin)}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'border-[#1B4D2E] bg-[#EDF5F0] text-[#1B4D2E] shadow-xs'
                        : 'border-black/10 bg-white hover:border-[#1B4D2E]/30 text-[#191C1A]'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[11px] text-[#545D56] mt-0.5">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Help Guide Modal */}
      {showHelpModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-2xl p-5 flex flex-col gap-3.5 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <CircleHelp className="w-5 h-5 text-[#1B4D2E]" />
                <h3 className="text-sm font-bold text-[#191C1A]">Editor Guide</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-7 h-7 rounded-full bg-black/5 text-[#545D56] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#545D56]">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center shrink-0 font-bold text-[11px]">
                  1
                </div>
                <div>
                  <span className="font-bold text-[#191C1A] block">Page Navigation</span>
                  <span>Tap any thumbnail in the bar below, use the floating &lt; / &gt; pill, or swipe horizontally.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center shrink-0 font-bold text-[11px]">
                  2
                </div>
                <div>
                  <span className="font-bold text-[#191C1A] block">Zoom Controls</span>
                  <span>Use the floating pill's [-] and [+] or pinch to zoom. Tap 'Fit W' in the toolbar to restore full width.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center shrink-0 font-bold text-[11px]">
                  3
                </div>
                <div>
                  <span className="font-bold text-[#191C1A] block">6-Tool Bar</span>
                  <span>Rotate, delete unwanted pages, reorder sequence, crop whitespace, and detect blank pages to save print costs.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center shrink-0 font-bold text-[11px]">
                  4
                </div>
                <div>
                  <span className="font-bold text-[#191C1A] block">Multi-Select &amp; Undo</span>
                  <span>Tap 'Select' on the thumbnail strip to batch delete or rotate multiple pages. Tap the top-right Undo icon to revert changes.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full h-10 rounded-xl bg-[#1B4D2E] text-white font-bold text-xs shadow-xs active:scale-95 mt-1"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Blank Page Detection Review Sheet */}
      {showBlankSheet && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center animate-apple-reveal"
          onClick={() => setShowBlankSheet(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white border-t border-[#1B4D2E]/15 shadow-2xl p-5 flex flex-col gap-3.5 animate-apple-card pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4.5 h-4.5 text-[#1B4D2E]" />
                <h3 className="text-sm font-bold text-[#191C1A]">
                  Blank Page Removal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBlankSheet(false)}
                className="w-7 h-7 rounded-full bg-black/5 text-[#545D56] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeState?.detectedBlanks && activeState.detectedBlanks.length > 0 ? (
              <>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col gap-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>
                      {activeState.detectedBlanks.length} blank page(s) found in {activeDoc?.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Pages: {activeState.detectedBlanks.join(', ')}. Removing them saves paper and reduces print cost.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBlankSheet(false)}
                    className="h-11 rounded-xl bg-white border border-black/15 text-[#545D56] font-semibold text-xs active:scale-95"
                  >
                    Keep All Pages
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveAllBlanks}
                    className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-xs active:scale-95"
                  >
                    Remove {activeState.detectedBlanks.length} Blanks
                  </button>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <p className="text-xs font-bold text-emerald-900">
                  No blank pages detected!
                </p>
                <p className="text-[11px] text-emerald-700">
                  Every page in this document contains text, images or graphics.
                </p>
                <button
                  type="button"
                  onClick={() => setShowBlankSheet(false)}
                  className="mt-1 px-4 py-2 rounded-xl bg-[#1B4D2E] text-white text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
