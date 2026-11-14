import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Eye,
  FileMagnifyingGlass,
  FileText,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { UploadedPrintDocument } from '../types/kiosk';
import { Haptics } from '../utils/haptics';
import { analyzePdfPage } from '../utils/blankPageDetector';
import { ensureEditablePdfDocument } from '../utils/documentConversion';
import {
  BottomSheet,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingSpinner,
  LoadingState,
  StatusIndicator,
} from './ui';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface MobilePdfEditorProps {
  documents: UploadedPrintDocument[];
  onSaveAndContinue: (updatedDocuments: UploadedPrintDocument[]) => void;
  onBack: () => void;
}

interface FlaggedBlankPage {
  pageNumber: number;
  state: 'BLANK' | 'NEEDS_REVIEW';
  reason: string;
}

interface DocEditState {
  status: 'converting' | 'loading' | 'ready' | 'conversion-required' | 'error';
  errorMessage?: string;
  conversionNote?: string;
  conversionKind?: UploadedPrintDocument['conversionStatus'];
  pdfFile?: File;
  totalOriginalPages: number;
  pageOrder: number[];
  rotations: Record<number, number>;
  deletedPages: number[];
  keptFlaggedPages: number[];
  flaggedPages: FlaggedBlankPage[];
  isScanningBlanks: boolean;
  scanProgress: { current: number; total: number };
}

function describePdfLoadError(err: unknown): string {
  const errObj = err as { name?: string; message?: string } | null;
  const name = errObj?.name || '';
  const message = (errObj?.message || '').toLowerCase();

  if (name === 'PasswordException' || message.includes('password')) {
    return 'This PDF is password-protected. Please upload an unlocked copy before editing.';
  }
  if (
    name === 'InvalidPDFException' ||
    name === 'FormatError' ||
    message.includes('invalid pdf')
  ) {
    return 'This PDF file appears corrupted or unsupported and cannot be rendered.';
  }
  return 'Could not open this PDF document. Please verify the file and try again.';
}

const PdfPageCanvas: React.FC<{
  pdfProxy: pdfjsLib.PDFDocumentProxy;
  originalPageNumber: number;
  rotation: number;
  availableWidth: number;
  maxHeight: number;
  zoomScale: number;
}> = ({
  pdfProxy,
  originalPageNumber,
  rotation,
  availableWidth,
  maxHeight,
  zoomScale,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pageKey = `${originalPageNumber}:${rotation}`;
  const [renderedPageKey, setRenderedPageKey] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const isInitialPageLoading = renderedPageKey !== pageKey;

  useEffect(() => {
    let isCancelled = false;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignore cancellation
      }
      renderTaskRef.current = null;
    }

    setRenderError(null);

    pdfProxy
      .getPage(originalPageNumber)
      .then((page) => {
        if (isCancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const totalRotation = (page.rotate + (rotation || 0)) % 360;
        const unscaledVp = page.getViewport({ scale: 1, rotation: totalRotation });

        const fitScale = Math.min(
          Math.max(200, availableWidth) / Math.max(1, unscaledVp.width),
          Math.max(240, maxHeight) / Math.max(1, unscaledVp.height)
        );
        const cssScale = fitScale * zoomScale;
        const cssViewport = page.getViewport({
          scale: cssScale,
          rotation: totalRotation,
        });

        const cssWidth = Math.max(1, Math.floor(cssViewport.width));
        const cssHeight = Math.max(1, Math.floor(cssViewport.height));

        // Cap backing store dimensions for mobile GPU/memory safety while preserving sharpness
        const deviceDpr = Math.min(window.devicePixelRatio || 1, 2);
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

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          setRenderError('Canvas context unavailable on this device.');
          setRenderedPageKey(pageKey);
          return;
        }

        ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: cssViewport,
        });
        renderTaskRef.current = renderTask;

        renderTask.promise
          .then(() => {
            if (!isCancelled) {
              setRenderedPageKey(pageKey);
            }
          })
          .catch((err: unknown) => {
            const errName = (err as { name?: string })?.name;
            if (!isCancelled && errName !== 'RenderingCancelledException') {
              setRenderError('Failed to render this PDF page.');
              setRenderedPageKey(pageKey);
            }
          });
      })
      .catch(() => {
        if (!isCancelled) {
          setRenderError('Unable to load this page from the PDF.');
          setRenderedPageKey(pageKey);
        }
      });

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfProxy, originalPageNumber, rotation, availableWidth, maxHeight, zoomScale, pageKey]);

  if (renderError) {
    return (
      <div className="p-6 max-w-xs">
        <ErrorState variant="block" title="Page render failed" message={renderError} />
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-lg shadow-[0_2px_12px_rgba(25,28,26,0.12)] border border-[#D5DDD7] overflow-hidden shrink-0">
      <canvas ref={canvasRef} className="block" />
      {isInitialPageLoading && (
        <div
          aria-live="polite"
          className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-2"
        >
          <LoadingSpinner size={24} label="Rendering page" />
          <span className="text-[12px] font-medium text-[#545D56]">
            Rendering page...
          </span>
        </div>
      )}
    </div>
  );
};

const FlaggedPageThumbnail: React.FC<{
  pdfProxy?: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  rotation: number;
}> = ({ pdfProxy, pageNumber, rotation }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!pdfProxy || !canvasRef.current) return;
    let cancelled = false;
    let activeTask: pdfjsLib.RenderTask | null = null;

    pdfProxy
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;
        const totalRot = (page.rotate + (rotation || 0)) % 360;
        const baseVp = page.getViewport({ scale: 1, rotation: totalRot });
        const scale = 64 / Math.max(1, baseVp.width);
        const vp = page.getViewport({ scale, rotation: totalRot });

        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        activeTask = page.render({ canvasContext: ctx, viewport: vp });
        activeTask.promise.catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (activeTask) {
        try {
          activeTask.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [pdfProxy, pageNumber, rotation]);

  return (
    <div className="w-12 h-16 rounded-lg bg-[#F8FAF6] border border-[#D5DDD7] overflow-hidden flex items-center justify-center shrink-0">
      {pdfProxy ? (
        <canvas ref={canvasRef} className="max-w-full max-h-full block" />
      ) : (
        <FileText size={18} className="text-[#545D56]" aria-hidden="true" />
      )}
    </div>
  );
};

export const MobilePdfEditor: React.FC<MobilePdfEditorProps> = ({
  documents,
  onSaveAndContinue,
  onBack,
}) => {
  const [activeDocId, setActiveDocId] = useState<string>(documents[0]?.id || '');
  const [editStates, setEditStates] = useState<Record<string, DocEditState>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  const [pendingRemovePage, setPendingRemovePage] = useState<number | null>(null);
  const [showBlankSheet, setShowBlankSheet] = useState<boolean>(false);
  const [editorWarning, setEditorWarning] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  const isSubmittingRef = useRef<boolean>(false);
  const pdfProxiesRef = useRef<Record<string, pdfjsLib.PDFDocumentProxy>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? Math.max(240, window.innerWidth - 32) : 340,
    height: typeof window !== 'undefined' ? Math.max(260, window.innerHeight - 310) : 400,
  });

  // Measure actual preview stage container safely across 360px - 430px viewports
  useEffect(() => {
    const updateStageSize = () => {
      if (stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setStageDims({
            width: Math.max(220, Math.floor(rect.width - 24)),
            height: Math.max(220, Math.floor(rect.height - 24)),
          });
          return;
        }
      }
      setStageDims({
        width: Math.max(220, Math.min(window.innerWidth - 32, 560)),
        height: Math.max(220, window.innerHeight - 310),
      });
    };

    updateStageSize();
    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, []);

  // Cleanup all PDF.js proxies on unmount
  useEffect(() => {
    const proxiesMap = pdfProxiesRef.current;
    return () => {
      Object.values(proxiesMap).forEach((proxy) => {
        try {
          void proxy.destroy();
        } catch {
          // Ignore cleanup errors
        }
      });
    };
  }, []);

  // Load / convert documents independently and run sequential blank-page scan
  useEffect(() => {
    let isMounted = true;

    const initializeDocument = async (doc: UploadedPrintDocument) => {
      const initialCount = Math.max(1, doc.originalPageCount ?? doc.pageCount ?? 1);
      const initialOrder = Array.from({ length: initialCount }, (_, i) => i + 1);
      const savedRotations = { ...(doc.pageRotations || {}) };
      const savedDeleted = [...(doc.removedPages || [])].filter(
        (p) => p >= 1 && p <= initialCount
      );
      const savedKept = [...(doc.keptBlankPages || [])].filter(
        (p) => p >= 1 && p <= initialCount
      );

      setEditStates((prev) => {
        if (prev[doc.id]) return prev;
        return {
          ...prev,
          [doc.id]: {
            status: 'converting',
            totalOriginalPages: initialCount,
            pageOrder: initialOrder,
            rotations: savedRotations,
            deletedPages: savedDeleted,
            keptFlaggedPages: savedKept,
            flaggedPages: [],
            isScanningBlanks: false,
            scanProgress: { current: 0, total: initialCount },
          },
        };
      });

      const conversion = await ensureEditablePdfDocument(doc);
      if (!isMounted) return;

      if (conversion.status === 'conversion-required') {
        setEditStates((prev) => ({
          ...prev,
          [doc.id]: {
            ...(prev[doc.id] || {
              totalOriginalPages: doc.pageCount,
              pageOrder: initialOrder,
              rotations: savedRotations,
              deletedPages: savedDeleted,
              keptFlaggedPages: savedKept,
              flaggedPages: [],
              isScanningBlanks: false,
              scanProgress: { current: 0, total: doc.pageCount },
            }),
            status: 'conversion-required',
            conversionKind: 'conversion-required',
            errorMessage: conversion.error,
          },
        }));
        return;
      }

      if (conversion.status === 'failed' || !conversion.pdfFile) {
        setEditStates((prev) => ({
          ...prev,
          [doc.id]: {
            ...(prev[doc.id] || {
              totalOriginalPages: doc.pageCount,
              pageOrder: initialOrder,
              rotations: savedRotations,
              deletedPages: savedDeleted,
              keptFlaggedPages: savedKept,
              flaggedPages: [],
              isScanningBlanks: false,
              scanProgress: { current: 0, total: doc.pageCount },
            }),
            status: 'error',
            conversionKind: 'failed',
            errorMessage: conversion.error || 'Could not load document for editing.',
          },
        }));
        return;
      }

      const pdfFile = conversion.pdfFile;
      const conversionNote =
        conversion.status === 'converted' ? 'Converted to PDF' : undefined;

      setEditStates((prev) => ({
        ...prev,
        [doc.id]: {
          ...prev[doc.id],
          status: 'loading',
          conversionKind: conversion.status,
          conversionNote,
          pdfFile,
        },
      }));

      try {
        const buffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer),
          useWorkerFetch: false,
          isEvalSupported: false,
        });
        const pdfProxy = await loadingTask.promise;

        if (!isMounted) {
          void pdfProxy.destroy();
          return;
        }

        pdfProxiesRef.current[doc.id] = pdfProxy;
        const actualCount = pdfProxy.numPages;
        const validOrder = Array.from({ length: actualCount }, (_, i) => i + 1);

        setEditStates((prev) => {
          const cur = prev[doc.id];
          return {
            ...prev,
            [doc.id]: {
              ...cur,
              status: 'ready',
              errorMessage: undefined,
              conversionKind: conversion.status,
              conversionNote,
              pdfFile,
              totalOriginalPages: actualCount,
              pageOrder: validOrder,
              deletedPages: (cur?.deletedPages || []).filter(
                (p) => p >= 1 && p <= actualCount
              ),
              keptFlaggedPages: (cur?.keptFlaggedPages || []).filter(
                (p) => p >= 1 && p <= actualCount
              ),
              isScanningBlanks: true,
              scanProgress: { current: 0, total: actualCount },
            },
          };
        });

        // Sequential blank-page scan yielding between pages for mobile responsiveness
        const flagged: FlaggedBlankPage[] = [];
        for (let p = 1; p <= actualCount; p++) {
          if (!isMounted) return;
          try {
            const page = await pdfProxy.getPage(p);
            const result = await analyzePdfPage(page, p);
            if (result.state === 'BLANK' || result.state === 'NEEDS_REVIEW') {
              flagged.push({
                pageNumber: p,
                state: result.state,
                reason: result.reason,
              });
            }
          } catch {
            // Never auto-flag on inspection failure
          }

          if (!isMounted) return;
          setEditStates((prev) => {
            const cur = prev[doc.id];
            if (!cur) return prev;
            return {
              ...prev,
              [doc.id]: {
                ...cur,
                flaggedPages: [...flagged],
                scanProgress: { current: p, total: actualCount },
              },
            };
          });

          await new Promise<void>((r) => window.setTimeout(r, 0));
        }

        if (!isMounted) return;
        setEditStates((prev) => {
          const cur = prev[doc.id];
          if (!cur) return prev;
          return {
            ...prev,
            [doc.id]: {
              ...cur,
              isScanningBlanks: false,
            },
          };
        });
      } catch (err) {
        if (!isMounted) return;
        setEditStates((prev) => ({
          ...prev,
          [doc.id]: {
            ...(prev[doc.id] || {
              totalOriginalPages: doc.pageCount,
              pageOrder: initialOrder,
              rotations: {},
              deletedPages: [],
              keptFlaggedPages: [],
              flaggedPages: [],
              isScanningBlanks: false,
              scanProgress: { current: 0, total: doc.pageCount },
            }),
            status: 'error',
            errorMessage: describePdfLoadError(err),
            isScanningBlanks: false,
          },
        }));
      }
    };

    for (const doc of documents) {
      if (!editStates[doc.id]) {
        void initializeDocument(doc);
      }
    }

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  useEffect(() => {
    if (!documents.some((d) => d.id === activeDocId) && documents[0]) {
      setActiveDocId(documents[0].id);
      setCurrentPage(1);
      setZoomScale(1.0);
    }
  }, [documents, activeDocId]);

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];
  const activeState = activeDoc ? editStates[activeDoc.id] : undefined;
  const activePdfProxy = activeDoc ? pdfProxiesRef.current[activeDoc.id] : undefined;

  const visiblePages = useMemo(() => {
    if (!activeState) return [];
    return activeState.pageOrder.filter(
      (p) => !activeState.deletedPages.includes(p)
    );
  }, [activeState]);

  const activeOriginalPage = visiblePages[currentPage - 1];

  const totalRemainingPagesAllDocs = useMemo(() => {
    return documents.reduce((sum, doc) => {
      const st = editStates[doc.id];
      if (!st) return sum + Math.max(1, doc.pageCount);
      return sum + Math.max(0, st.pageOrder.length - st.deletedPages.length);
    }, 0);
  }, [documents, editStates]);

  const unreviewedFlaggedPages = useMemo(() => {
    if (!activeState) return [];
    return activeState.flaggedPages.filter(
      (item) =>
        !activeState.deletedPages.includes(item.pageNumber) &&
        !activeState.keptFlaggedPages.includes(item.pageNumber)
    );
  }, [activeState]);

  const activePageFlag = useMemo(() => {
    if (!activeOriginalPage) return undefined;
    return unreviewedFlaggedPages.find(
      (item) => item.pageNumber === activeOriginalPage
    );
  }, [unreviewedFlaggedPages, activeOriginalPage]);

  const isAnyDocumentPreparing = useMemo(() => {
    return documents.some((doc) => {
      const st = editStates[doc.id];
      return !st || st.status === 'converting' || st.status === 'loading';
    });
  }, [documents, editStates]);

  const hasDocumentErrors = useMemo(() => {
    return documents.some((doc) => {
      const st = editStates[doc.id];
      return st && (st.status === 'error' || st.status === 'conversion-required');
    });
  }, [documents, editStates]);

  const currentRotation =
    activeOriginalPage && activeState
      ? activeState.rotations[activeOriginalPage] || 0
      : 0;

  const canEditActivePage =
    Boolean(activeDoc) &&
    activeState?.status === 'ready' &&
    Boolean(activePdfProxy) &&
    Boolean(activeOriginalPage);

  const canContinue =
    documents.length > 0 &&
    !isAnyDocumentPreparing &&
    !hasDocumentErrors &&
    !isCompiling;

  const handleSelectDocument = (docId: string) => {
    if (docId === activeDocId) return;
    Haptics.buttonPress();
    setActiveDocId(docId);
    setCurrentPage(1);
    setZoomScale(1.0);
    setEditorWarning(null);
  };

  const handleGoToPage = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage > visiblePages.length || nextPage === currentPage) {
        return;
      }
      Haptics.selection();
      setCurrentPage(nextPage);
    },
    [visiblePages.length, currentPage]
  );

  const handleZoomDelta = (delta: number) => {
    Haptics.buttonPress();
    setZoomScale((prev) => {
      const next = Number((prev + delta).toFixed(2));
      return Math.min(2.4, Math.max(0.7, next));
    });
  };

  const handleRotateCurrentPage = () => {
    if (!activeDoc || !activeOriginalPage || !canEditActivePage) return;
    Haptics.buttonPress();
    setEditorWarning(null);

    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      const curRot = cur.rotations[activeOriginalPage] || 0;
      const nextRot = (curRot + 90) % 360;
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
  };

  const handleRequestRemovePage = (origPageNum: number) => {
    if (!activeDoc || !activeState) return;
    if (visiblePages.length <= 1) {
      Haptics.error();
      setEditorWarning('At least one page must remain in the document.');
      return;
    }
    Haptics.buttonPress();
    setEditorWarning(null);
    setPendingRemovePage(origPageNum);
  };

  const handleConfirmRemovePage = () => {
    if (!activeDoc || pendingRemovePage === null) {
      setPendingRemovePage(null);
      return;
    }
    if (visiblePages.length <= 1) {
      setPendingRemovePage(null);
      setEditorWarning('At least one page must remain in the document.');
      return;
    }

    const pageToDelete = pendingRemovePage;
    const deletedDisplayIndex = visiblePages.indexOf(pageToDelete) + 1;
    const nextTotal = visiblePages.length - 1;

    Haptics.selection();
    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      const nextDeleted = Array.from(new Set([...cur.deletedPages, pageToDelete]));
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          deletedPages: nextDeleted,
        },
      };
    });

    setPendingRemovePage(null);
    if (deletedDisplayIndex > 0) {
      setCurrentPage((prev) => Math.max(1, Math.min(prev, nextTotal)));
    }
  };

  const handleKeepFlaggedPage = (origPageNum: number) => {
    if (!activeDoc) return;
    Haptics.selection();
    setEditStates((prev) => {
      const cur = prev[activeDoc.id];
      if (!cur) return prev;
      return {
        ...prev,
        [activeDoc.id]: {
          ...cur,
          keptFlaggedPages: Array.from(
            new Set([...cur.keptFlaggedPages, origPageNum])
          ),
        },
      };
    });
  };

  const handleInspectFlaggedPage = (origPageNum: number) => {
    const idx = visiblePages.indexOf(origPageNum);
    if (idx !== -1) {
      setCurrentPage(idx + 1);
    }
    setShowBlankSheet(false);
    Haptics.selection();
  };

  const handleContinueToPrintSettings = async () => {
    if (!canContinue || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsCompiling(true);
    setEditorWarning(null);
    Haptics.selection();

    try {
      const updatedDocs: UploadedPrintDocument[] = [];

      for (const doc of documents) {
        const st = editStates[doc.id];
        const preservedOriginal = doc.originalFile || doc.rawFile;

        if (!st || st.status !== 'ready' || !st.pdfFile) {
          updatedDocs.push({
            ...doc,
            originalFile: preservedOriginal,
            conversionStatus: st?.conversionKind ?? doc.conversionStatus,
            conversionError: st?.errorMessage ?? doc.conversionError,
          });
          continue;
        }

        const visible = st.pageOrder.filter(
          (p) => !st.deletedPages.includes(p)
        );
        const hasRotations = Object.values(st.rotations).some((r) => r !== 0);
        const hasDeletions = st.deletedPages.length > 0;

        let processedPdfFile = st.pdfFile;

        if (hasRotations || hasDeletions) {
          const srcBytes = await st.pdfFile.arrayBuffer();
          const sourcePdf = await PDFDocument.load(srcBytes, {
            ignoreEncryption: true,
          });
          const outPdf = await PDFDocument.create();

          const indices = visible.map((p) => p - 1);
          const copied = await outPdf.copyPages(sourcePdf, indices);

          copied.forEach((page, idx) => {
            const origPageNum = visible[idx];
            const addRot = st.rotations[origPageNum] || 0;
            if (addRot !== 0) {
              const baseAngle = page.getRotation().angle;
              page.setRotation(degrees((baseAngle + addRot) % 360));
            }
            outPdf.addPage(page);
          });

          const outBytes = await outPdf.save();
          processedPdfFile = new File(
            [outBytes as unknown as BlobPart],
            st.pdfFile.name,
            { type: 'application/pdf' }
          );
        }

        // Map surviving blank/uncertain page numbers to new 1-based post-deletion positions
        const newIndexByOrigPage = new Map<number, number>();
        visible.forEach((origPageNum, idx) => {
          newIndexByOrigPage.set(origPageNum, idx + 1);
        });

        const remainingBlanks = st.flaggedPages
          .filter(
            (f) =>
              f.state === 'BLANK' &&
              newIndexByOrigPage.has(f.pageNumber) &&
              !st.keptFlaggedPages.includes(f.pageNumber)
          )
          .map((f) => newIndexByOrigPage.get(f.pageNumber)!);

        const remainingUncertain = st.flaggedPages
          .filter(
            (f) =>
              f.state === 'NEEDS_REVIEW' &&
              newIndexByOrigPage.has(f.pageNumber) &&
              !st.keptFlaggedPages.includes(f.pageNumber)
          )
          .map((f) => newIndexByOrigPage.get(f.pageNumber)!);

        const removedBlanks = st.flaggedPages
          .filter((f) => st.deletedPages.includes(f.pageNumber))
          .map((f) => f.pageNumber);

        updatedDocs.push({
          ...doc,
          rawFile: processedPdfFile,
          originalFile: preservedOriginal,
          convertedPdfFile:
            st.conversionKind === 'converted'
              ? st.pdfFile
              : doc.convertedPdfFile,
          conversionStatus: st.conversionKind,
          pageCount: visible.length,
          originalPageCount: st.totalOriginalPages,
          pageRotations: { ...st.rotations },
          removedPages: [...st.deletedPages],
          keptBlankPages: [...st.keptFlaggedPages],
          blankPages: remainingBlanks,
          uncertainPages: remainingUncertain,
          removedBlankPages: removedBlanks,
        });
      }

      Haptics.success();
      onSaveAndContinue(updatedDocs);
    } catch {
      Haptics.error();
      setEditorWarning(
        'Could not apply PDF edits. Please check that documents are unencrypted and try again.'
      );
    } finally {
      isSubmittingRef.current = false;
      setIsCompiling(false);
    }
  };

  return (
    <div
      data-testid="mobile-pdf-editor"
      className="fixed inset-0 z-40 bg-[#F8FAF6] text-[#191C1A] flex flex-col antialiased overflow-hidden"
    >
      {/* 1. Compact Header */}
      <header className="pt-safe bg-white border-b border-[#E4EAE5] shrink-0">
        <div className="px-3.5 py-2.5 flex items-center gap-2.5">
          <IconButton
            variant="tinted"
            size="md"
            aria-label="Back to files"
            icon={<ArrowLeft size={18} weight="bold" />}
            onClick={onBack}
          />

          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] sm:text-[17px] font-bold text-[#191C1A] tracking-[-0.015em] leading-tight truncate">
              Review Your Documents
            </h1>
            <p className="text-[12px] text-[#545D56] mt-0.5 tabular-nums truncate">
              {documents.length} {documents.length === 1 ? 'file' : 'files'} ·{' '}
              {totalRemainingPagesAllDocs}{' '}
              {totalRemainingPagesAllDocs === 1 ? 'page' : 'pages'}
            </p>
          </div>
        </div>

        {/* Multi-Document Switcher (only shown when > 1 file) */}
        {documents.length > 1 && (
          <nav
            aria-label="Uploaded documents"
            className="px-3.5 pb-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none"
          >
            {documents.map((doc) => {
              const isSelected = doc.id === activeDoc?.id;
              const st = editStates[doc.id];
              const docPages = st
                ? Math.max(0, st.pageOrder.length - st.deletedPages.length)
                : doc.pageCount;

              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleSelectDocument(doc.id)}
                  className={`min-h-[38px] px-3 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 shrink-0 border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#194F34] border-[#194F34] text-white'
                      : 'bg-[#F8FAF6] border-[#D5DDD7] text-[#191C1A] hover:border-[#194F34]/40'
                  }`}
                >
                  <FileText size={14} weight="bold" className="shrink-0" aria-hidden="true" />
                  <span className="truncate max-w-[130px]">{doc.name}</span>
                  <span
                    className={`text-[11px] font-bold tabular-nums ${
                      isSelected ? 'text-white/85' : 'text-[#545D56]'
                    }`}
                  >
                    {docPages}p
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Active Document Name Row */}
        {activeDoc && (
          <div className="px-3.5 py-2 bg-[#F8FAF6] border-t border-[#E4EAE5]/70 flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <FileText
                size={14}
                weight="fill"
                className="text-[#194F34] shrink-0"
                aria-hidden="true"
              />
              <span
                data-testid="active-document-name"
                className="text-[12.5px] font-semibold text-[#191C1A] truncate"
                title={activeDoc.name}
              >
                {activeDoc.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-[11.5px] font-medium text-[#545D56] tabular-nums">
              {activeState?.conversionNote && (
                <span className="text-[#194F34] font-semibold">
                  {activeState.conversionNote}
                </span>
              )}
              {currentRotation !== 0 && (
                <span className="text-[#194F34] font-semibold">
                  Rotated {currentRotation}°
                </span>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Inline Warning Banner */}
      {editorWarning && (
        <div className="px-3.5 pt-2 shrink-0">
          <ErrorState
            variant="banner"
            message={editorWarning}
            onDismiss={() => setEditorWarning(null)}
          />
        </div>
      )}

      {/* 2. Real Single-Page PDF Preview Stage */}
      <main
        ref={stageRef}
        aria-label="PDF document preview"
        className="flex-1 min-h-0 overflow-auto bg-[#ECEFE9] px-3 py-3 flex flex-col items-center"
      >
        {/* Flagged Blank / Review Page Prompt */}
        {activePageFlag && canEditActivePage && (
          <div
            role="status"
            className="w-full max-w-[460px] mb-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 flex items-center justify-between gap-2 shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <WarningCircle
                size={16}
                weight="fill"
                className="text-[#D97706] shrink-0"
                aria-hidden="true"
              />
              <span className="text-[12px] font-semibold text-[#92400E] truncate">
                {activePageFlag.state === 'BLANK'
                  ? 'Likely blank page detected'
                  : 'Faint mark — inspect before printing'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleKeepFlaggedPage(activePageFlag.pageNumber)}
                className="min-h-[32px] px-2.5 rounded-lg bg-white border border-[#FDE68A] text-[11.5px] font-semibold text-[#191C1A] cursor-pointer"
              >
                Keep Page
              </button>
              <button
                type="button"
                onClick={() => handleRequestRemovePage(activePageFlag.pageNumber)}
                className="min-h-[32px] px-2.5 rounded-lg bg-[#BA1A1A] text-white text-[11.5px] font-semibold cursor-pointer"
              >
                Remove Page
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 w-full flex items-center justify-center min-h-0">
          {!activeDoc || !activeState || activeState.status === 'converting' || activeState.status === 'loading' ? (
            <LoadingState
              title={
                activeState?.status === 'converting'
                  ? 'Converting document to PDF...'
                  : 'Loading document preview...'
              }
              subtitle="Preparing real page layout for review."
            />
          ) : activeState.status === 'conversion-required' || activeState.status === 'error' ? (
            <div className="w-full max-w-sm">
              <ErrorState
                variant="block"
                title={
                  activeState.status === 'conversion-required'
                    ? 'Preview requires PDF conversion'
                    : 'Unable to preview PDF'
                }
                message={
                  activeState.errorMessage ||
                  'This document cannot be displayed in the PDF editor.'
                }
              />
            </div>
          ) : activePdfProxy && activeOriginalPage ? (
            <div className="max-w-full overflow-auto flex items-center justify-center p-1">
              <PdfPageCanvas
                pdfProxy={activePdfProxy}
                originalPageNumber={activeOriginalPage}
                rotation={currentRotation}
                availableWidth={stageDims.width}
                maxHeight={stageDims.height - (activePageFlag ? 52 : 0)}
                zoomScale={zoomScale}
              />
            </div>
          ) : (
            <EmptyState
              title="No pages available"
              description="This document has no remaining pages."
            />
          )}
        </div>
      </main>

      {/* 3. Page Navigation & Zoom Bar */}
      {canEditActivePage && visiblePages.length > 0 && (
        <div className="bg-white border-t border-[#E4EAE5] px-3 py-1.5 shrink-0">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                icon={<CaretLeft size={18} weight="bold" />}
                onClick={() => handleGoToPage(currentPage - 1)}
              />
              <span
                data-testid="pdf-page-counter"
                className="text-[12.5px] font-semibold text-[#191C1A] tabular-nums px-1 whitespace-nowrap"
              >
                Page {currentPage} of {visiblePages.length}
              </span>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Next page"
                disabled={currentPage >= visiblePages.length}
                icon={<CaretRight size={18} weight="bold" />}
                onClick={() => handleGoToPage(currentPage + 1)}
              />
            </div>

            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Zoom out"
                disabled={zoomScale <= 0.7}
                icon={<MagnifyingGlassMinus size={18} weight="bold" />}
                onClick={() => handleZoomDelta(-0.2)}
              />
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  setZoomScale(1.0);
                }}
                aria-label="Reset zoom to 100%"
                className="min-w-[44px] min-h-[36px] text-[12px] font-semibold text-[#545D56] tabular-nums text-center cursor-pointer"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Zoom in"
                disabled={zoomScale >= 2.4}
                icon={<MagnifyingGlassPlus size={18} weight="bold" />}
                onClick={() => handleZoomDelta(0.2)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Compact 3-Tool Editing Toolbar (Rotate, Remove Page, Blank Page Review) */}
      <section
        aria-label="PDF editing tools"
        className="bg-white border-t border-[#E4EAE5] px-3 py-2 shrink-0"
      >
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!canEditActivePage}
            onClick={handleRotateCurrentPage}
            className="min-h-[52px] px-2 py-1.5 rounded-xl bg-[#F8FAF6] hover:bg-[#EAF3ED] border border-[#E4EAE5] flex flex-col items-center justify-center gap-1 text-[#191C1A] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowClockwise
              size={18}
              weight="bold"
              className="text-[#194F34]"
              aria-hidden="true"
            />
            <span className="text-[11.5px] font-semibold leading-none tabular-nums">
              {currentRotation !== 0 ? `Rotate (${currentRotation}°)` : 'Rotate'}
            </span>
          </button>

          <button
            type="button"
            disabled={!canEditActivePage || visiblePages.length <= 1}
            onClick={() => {
              if (activeOriginalPage) {
                handleRequestRemovePage(activeOriginalPage);
              }
            }}
            className="min-h-[52px] px-2 py-1.5 rounded-xl bg-[#F8FAF6] hover:bg-[#FFF1F2] border border-[#E4EAE5] flex flex-col items-center justify-center gap-1 text-[#191C1A] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Trash
              size={18}
              weight="bold"
              className="text-[#BA1A1A]"
              aria-hidden="true"
            />
            <span className="text-[11.5px] font-semibold text-[#93000A] leading-none">
              Remove Page
            </span>
          </button>

          <button
            type="button"
            disabled={!activeState || activeState.status !== 'ready'}
            onClick={() => {
              Haptics.buttonPress();
              setShowBlankSheet(true);
            }}
            className="relative min-h-[52px] px-2 py-1.5 rounded-xl bg-[#F8FAF6] hover:bg-[#EAF3ED] border border-[#E4EAE5] flex flex-col items-center justify-center gap-1 text-[#191C1A] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <div className="relative">
              <FileMagnifyingGlass
                size={18}
                weight="bold"
                className="text-[#194F34]"
                aria-hidden="true"
              />
              {unreviewedFlaggedPages.length > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#D97706] border-2 border-[#F8FAF6]"
                />
              )}
            </div>
            <span className="text-[11.5px] font-semibold leading-none tabular-nums">
              {activeState?.isScanningBlanks
                ? `Scanning (${activeState.scanProgress.current}/${activeState.scanProgress.total})`
                : unreviewedFlaggedPages.length > 0
                  ? `Blank Review (${unreviewedFlaggedPages.length})`
                  : 'Blank Review'}
            </span>
          </button>
        </div>
      </section>

      {/* 5. Prominent Continue Footer */}
      <footer className="bg-white border-t border-[#E4EAE5] px-4 py-3 pb-safe shrink-0">
        <div className="max-w-lg mx-auto">
          {hasDocumentErrors && (
            <p className="text-[11.5px] font-medium text-[#BA1A1A] text-center mb-2">
              One or more files cannot be previewed. Go back and remove invalid files before continuing.
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isCompiling}
            disabled={!canContinue}
            onClick={handleContinueToPrintSettings}
            rightIcon={<ArrowRight size={17} weight="bold" aria-hidden="true" />}
            data-testid="editor-continue-button"
          >
            Continue to Print Settings
          </Button>
        </div>
      </footer>

      {/* Confirm Page Removal Dialog */}
      <ConfirmDialog
        isOpen={pendingRemovePage !== null}
        title={
          pendingRemovePage !== null
            ? `Remove Page ${visiblePages.indexOf(pendingRemovePage) + 1}?`
            : 'Remove Page?'
        }
        description="This page will be excluded from the processed print document. Your original uploaded file remains unchanged."
        confirmLabel="Remove Page"
        cancelLabel="Keep Page"
        destructive={true}
        onConfirm={handleConfirmRemovePage}
        onCancel={() => setPendingRemovePage(null)}
      />

      {/* Blank Page Review Bottom Sheet */}
      <BottomSheet
        isOpen={showBlankSheet}
        onClose={() => setShowBlankSheet(false)}
        title="Blank Page Review"
        subtitle={
          activeDoc
            ? `${activeDoc.name} · Detection is advisory; please verify before removing`
            : undefined
        }
        footer={
          <Button
            variant="outline"
            size="md"
            fullWidth
            onClick={() => setShowBlankSheet(false)}
          >
            Done
          </Button>
        }
      >
        {activeState?.isScanningBlanks && (
          <div className="mb-3 p-3 rounded-xl bg-[#EAF3ED] border border-[#194F34]/15 flex items-center gap-2.5 text-[12.5px] font-medium text-[#194F34]">
            <LoadingSpinner size={16} label="Scanning pages" />
            <span className="tabular-nums">
              Checking page {activeState.scanProgress.current} of{' '}
              {activeState.scanProgress.total}...
            </span>
          </div>
        )}

        {unreviewedFlaggedPages.length === 0 ? (
          <div className="py-6 px-4 text-center flex flex-col items-center gap-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
              <CheckCircle size={24} weight="fill" aria-hidden="true" />
            </div>
            <h3 className="text-[15px] font-bold text-[#191C1A]">
              No blank pages flagged
            </h3>
            <p className="text-[13px] text-[#545D56] max-w-xs leading-relaxed">
              {activeState?.isScanningBlanks
                ? 'Still analyzing remaining pages for empty content.'
                : 'Every remaining page contains readable text, graphics, or has been marked to keep.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {unreviewedFlaggedPages.map((item) => {
              const displayIdx = visiblePages.indexOf(item.pageNumber) + 1;
              const rot = activeState?.rotations[item.pageNumber] || 0;
              const isOnlyRemaining = visiblePages.length <= 1;

              return (
                <div
                  key={item.pageNumber}
                  className="p-3 rounded-xl bg-white border border-[#D5DDD7] flex flex-col gap-2.5"
                >
                  <div className="flex items-start gap-3">
                    <FlaggedPageThumbnail
                      pdfProxy={activePdfProxy}
                      pageNumber={item.pageNumber}
                      rotation={rot}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-bold text-[#191C1A] tabular-nums">
                          Page {displayIdx > 0 ? displayIdx : item.pageNumber}
                        </span>
                        <StatusIndicator
                          tone={item.state === 'BLANK' ? 'warning' : 'neutral'}
                          label={
                            item.state === 'BLANK'
                              ? 'Potentially blank'
                              : 'Faint content'
                          }
                          size="sm"
                        />
                      </div>
                      <p className="text-[12px] text-[#545D56] mt-1 leading-snug">
                        {item.reason}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-[#E4EAE5]">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Eye size={14} weight="bold" aria-hidden="true" />}
                      onClick={() => handleInspectFlaggedPage(item.pageNumber)}
                    >
                      Inspect
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleKeepFlaggedPage(item.pageNumber)}
                    >
                      Keep Page
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isOnlyRemaining}
                      onClick={() => handleRequestRemovePage(item.pageNumber)}
                    >
                      Remove Page
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};
