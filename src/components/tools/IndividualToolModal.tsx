import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  UploadSimple,
  CheckCircle,
  Printer,
  DownloadSimple,
  ArrowsClockwise,
  Trash,
  ArrowUp,
  ArrowDown,
  Camera,
  WarningCircle,
  FileText,
  Play,
} from '@phosphor-icons/react';
import { Haptics } from '../../utils/haptics';
import { useKioskSession } from '../../utils/kioskSession';
import {
  mergePdfFiles,
  compressPdfFile,
  convertPdfToJpg,
  nUpPdfPages,
  rotatePdfPages,
  deletePdfPages,
  reorderPdfPages,
  cropPdfMargins,
  splitPdfPages,
  imagesToPdf,
  generatePassportPhotoPdf,
  generateIdCardPdf,
  validateToolFiles,
  formatCompressionSummary,
} from '../../utils/pdfToolHelpers';
import {
  detectBlankPagesInPdf,
  removePagesFromPdf,
} from '../../utils/blankPageDetector';

function formatToolFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getToolValidationMode(toolId: ToolId): 'pdf' | 'image' | 'image-or-pdf' {
  if (toolId === 'scan-to-pdf') return 'image-or-pdf';
  if (
    toolId === 'resize-image' ||
    toolId === 'image-enhancement' ||
    toolId === 'passport-photo' ||
    toolId === 'id-card-layout' ||
    toolId === 'image-to-pdf' ||
    toolId === 'image-crop' ||
    toolId === 'image-format-converter' ||
    toolId === 'multi-page-scan' ||
    toolId === 'scan-enhancement'
  ) {
    return 'image';
  }
  return 'pdf';
}

export type ToolId =
  | 'merge-pdf'
  | 'compress-pdf'
  | 'pdf-to-jpg'
  | 'pages-per-sheet'
  | 'rotate-pages'
  | 'delete-pages'
  | 'reorder-pages'
  | 'crop-pages'
  | 'split-pdf'
  | 'blank-page-removal'
  | 'resize-image'
  | 'image-enhancement'
  | 'passport-photo'
  | 'id-card-layout'
  | 'image-to-pdf'
  | 'image-crop'
  | 'image-format-converter'
  | 'scan-to-pdf'
  | 'multi-page-scan'
  | 'scan-enhancement';

interface IndividualToolModalProps {
  toolId: ToolId | null;
  onClose: () => void;
  onSendToPrint: (file: File) => void;
}

type ImageCropPreset = 'square' | 'landscape_4_3' | 'portrait_3_4' | 'trim_10';

export const IndividualToolModal: React.FC<IndividualToolModalProps> = ({
  toolId,
  onClose,
  onSendToPrint,
}) => {
  const { session } = useKioskSession();

  // Shared state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [jpgResults, setJpgResults] = useState<
    Array<{ pageNumber: number; dataUrl: string; blob: Blob }>
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tool specific options
  const [compressLevel, setCompressLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [nUpMode, setNUpMode] = useState<2 | 4>(2);
  const [cropMarginPt, setCropMarginPt] = useState<number>(20);
  const [imageCropPreset, setImageCropPreset] = useState<ImageCropPreset>('square');
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [pagesToDelete, setPagesToDelete] = useState<number[]>([]);
  const [reorderedPages, setReorderedPages] = useState<number[]>([]);
  const [splitSelectedPages, setSplitSelectedPages] = useState<number[]>([]);
  const [detectedBlanks, setDetectedBlanks] = useState<number[]>([]);
  const [passportCount, setPassportCount] = useState<6 | 8>(8);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [resizeWidth, setResizeWidth] = useState<number>(800);
  const [resizeHeight, setResizeHeight] = useState<number>(600);
  const [keepAspect, setKeepAspect] = useState<boolean>(true);
  const [originalAspect, setOriginalAspect] = useState<number>(1);
  const [targetFormat, setTargetFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>(
    'image/jpeg'
  );
  const [enhancePreset, setEnhancePreset] = useState<'auto' | 'document' | 'bw' | 'vivid'>(
    'document'
  );
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // PDF Page inspection & result preview
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    newSize: number;
  } | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [resultPageCount, setResultPageCount] = useState<number | null>(null);
  const [isRenderingResultPreview, setIsRenderingResultPreview] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filePickModeRef = useRef<'replace' | 'append'>('replace');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSelectedFiles([]);
    setIsProcessing(false);
    setProgress(0);
    setResultFile(null);
    setJpgResults([]);
    setErrorMessage(null);
    setPageRotations({});
    setPagesToDelete([]);
    setReorderedPages([]);
    setSplitSelectedPages([]);
    setDetectedBlanks([]);
    setIdFrontFile(null);
    setIdBackFile(null);
    setScannedPages([]);
    setPdfPageCount(0);
    setPageThumbnails({});
    setCompressionStats(null);
    setResultPreviewUrl(null);
    setResultPageCount(null);
    setIsRenderingResultPreview(false);
    setCropMarginPt(20);
    setImageCropPreset('square');
  }, [toolId]);

  useEffect(() => {
    if (!resultFile) {
      setResultPreviewUrl(null);
      setResultPageCount(null);
      setIsRenderingResultPreview(false);
      return;
    }

    let isCancelled = false;
    let objectUrlToRevoke: string | null = null;
    const isPdf =
      resultFile.type === 'application/pdf' ||
      resultFile.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      setIsRenderingResultPreview(true);
      resultFile
        .arrayBuffer()
        .then((buffer) => pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise)
        .then(async (doc) => {
          if (isCancelled) return;
          setResultPageCount(doc.numPages);
          const page = await doc.getPage(1);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.8, 640 / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            if (!isCancelled) {
              setResultPreviewUrl(canvas.toDataURL('image/jpeg', 0.88));
            }
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setResultPreviewUrl(null);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsRenderingResultPreview(false);
          }
        });
    } else if (resultFile.type.startsWith('image/')) {
      objectUrlToRevoke = URL.createObjectURL(resultFile);
      setResultPreviewUrl(objectUrlToRevoke);
      setResultPageCount(null);
      setIsRenderingResultPreview(false);
    } else {
      setResultPreviewUrl(null);
      setResultPageCount(null);
      setIsRenderingResultPreview(false);
    }

    return () => {
      isCancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [resultFile]);

  useEffect(() => {
    if (selectedFiles.length === 0) return;
    const primary = selectedFiles[0];
    if (!primary.name.toLowerCase().endsWith('.pdf')) return;

    let isMounted = true;
    primary.arrayBuffer().then((buffer) => {
      pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise.then(async (doc) => {
        if (!isMounted) return;
        setPdfPageCount(doc.numPages);
        const order = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        setReorderedPages(order);

        const thumbs: Record<number, string> = {};
        for (let p = 1; p <= Math.min(doc.numPages, 24); p++) {
          try {
            const page = await doc.getPage(p);
            const vp = page.getViewport({ scale: 0.25 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, vp.width, vp.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            thumbs[p] = canvas.toDataURL('image/jpeg', 0.72);
          } catch {
            // ignore thumbnail render error
          }
        }
        if (isMounted) setPageThumbnails(thumbs);
      });
    });

    if (toolId === 'blank-page-removal') {
      detectBlankPagesInPdf(primary, 'blank-tool-doc').then((res) => {
        if (isMounted) {
          setDetectedBlanks(res.blankPages);
          setPagesToDelete(res.blankPages);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [selectedFiles, toolId]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Camera access was not granted. You can upload an image instead.');
    }
  };

  const captureCameraFrame = () => {
    if (!videoRef.current) return;
    Haptics.buttonPress();
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const frameData = canvas.toDataURL('image/jpeg', 0.92);
    setScannedPages((prev) => [...prev, frameData]);
  };

  const finishCameraScan = async () => {
    if (scannedPages.length === 0) return;
    setIsProcessing(true);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);

    try {
      const files: File[] = [];
      for (let i = 0; i < scannedPages.length; i++) {
        const blob = await fetch(scannedPages[i]).then((r) => r.blob());
        files.push(new File([blob], `scan_page_${i + 1}.jpg`, { type: 'image/jpeg' }));
      }
      const pdf = await imagesToPdf(files);
      setResultFile(pdf);
      setIsProcessing(false);
      Haptics.success();
    } catch {
      setIsProcessing(false);
      setErrorMessage('Could not create PDF from captured scans.');
    }
  };

  const moveReorderedPage = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= reorderedPages.length) return;
    Haptics.buttonPress();
    const next = [...reorderedPages];
    const tmp = next[targetIdx];
    next[targetIdx] = next[index];
    next[index] = tmp;
    setReorderedPages(next);
  };

  const handleExecuteTool = async () => {
    if (!toolId) return;
    Haptics.buttonPress();
    setIsProcessing(true);
    setProgress(15);
    setErrorMessage(null);

    try {
      switch (toolId) {
        case 'merge-pdf': {
          if (selectedFiles.length < 2) {
            throw new Error('Please select at least 2 PDF documents to merge.');
          }
          const merged = await mergePdfFiles(selectedFiles);
          setResultFile(merged);
          break;
        }

        case 'compress-pdf': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const res = await compressPdfFile(selectedFiles[0], compressLevel, (pct) =>
            setProgress(pct)
          );
          setCompressionStats({
            originalSize: res.originalSize,
            newSize: res.newSize,
          });
          setResultFile(res.compressedFile);
          break;
        }

        case 'pdf-to-jpg': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const jpgs = await convertPdfToJpg(selectedFiles[0], (pct) => setProgress(pct));
          setJpgResults(jpgs);
          break;
        }

        case 'pages-per-sheet': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const nup = await nUpPdfPages(selectedFiles[0], nUpMode);
          setResultFile(nup);
          break;
        }

        case 'rotate-pages': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const rotated = await rotatePdfPages(selectedFiles[0], pageRotations);
          setResultFile(rotated);
          break;
        }

        case 'delete-pages': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          if (pagesToDelete.length === 0) throw new Error('Select at least one page to delete.');
          const deleted = await deletePdfPages(selectedFiles[0], pagesToDelete);
          setResultFile(deleted);
          break;
        }

        case 'reorder-pages': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const reordered = await reorderPdfPages(selectedFiles[0], reorderedPages);
          setResultFile(reordered);
          break;
        }

        case 'crop-pages': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const cropped = await cropPdfMargins(selectedFiles[0], cropMarginPt);
          setResultFile(cropped);
          break;
        }

        case 'split-pdf': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          if (splitSelectedPages.length === 0) {
            throw new Error('Select at least one page to extract.');
          }
          const sortedPages = [...splitSelectedPages].sort((a, b) => a - b);
          const split = await splitPdfPages(selectedFiles[0], sortedPages);
          setResultFile(split);
          break;
        }

        case 'blank-page-removal': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const bytes = await selectedFiles[0].arrayBuffer();
          const cleanedBytes = await removePagesFromPdf(bytes, pagesToDelete);
          const cleaned = new File(
            [cleanedBytes as unknown as BlobPart],
            selectedFiles[0].name.replace(/\.pdf$/i, '_no_blanks.pdf'),
            { type: 'application/pdf' }
          );
          setResultFile(cleaned);
          break;
        }

        case 'passport-photo': {
          if (!selectedFiles[0]) throw new Error('Please select or capture a photo.');
          const sheet = await generatePassportPhotoPdf(selectedFiles[0], passportCount);
          setResultFile(sheet);
          break;
        }

        case 'id-card-layout': {
          if (!idFrontFile) throw new Error('Please select the front side of the ID card.');
          const idPdf = await generateIdCardPdf(idFrontFile, idBackFile || undefined);
          setResultFile(idPdf);
          break;
        }

        case 'image-to-pdf': {
          if (selectedFiles.length === 0) throw new Error('Please select at least one image.');
          const pdf = await imagesToPdf(selectedFiles);
          setResultFile(pdf);
          break;
        }

        case 'resize-image': {
          if (!selectedFiles[0]) throw new Error('Please select an image to resize.');
          const imgBitmap = await createImageBitmap(selectedFiles[0]);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(16, resizeWidth);
          canvas.height = Math.max(16, resizeHeight);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imgBitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), selectedFiles[0].type || 'image/jpeg', 0.92)
          );
          const resized = new File([blob], `resized_${selectedFiles[0].name}`, {
            type: selectedFiles[0].type || 'image/jpeg',
          });
          setResultFile(resized);
          break;
        }

        case 'image-crop': {
          if (!selectedFiles[0]) throw new Error('Please select an image to crop.');
          const imgBitmap = await createImageBitmap(selectedFiles[0]);
          const srcW = imgBitmap.width;
          const srcH = imgBitmap.height;

          let cropX = 0;
          let cropY = 0;
          let cropW = srcW;
          let cropH = srcH;

          if (imageCropPreset === 'trim_10') {
            cropX = Math.round(srcW * 0.1);
            cropY = Math.round(srcH * 0.1);
            cropW = Math.round(srcW * 0.8);
            cropH = Math.round(srcH * 0.8);
          } else {
            const targetRatio =
              imageCropPreset === 'square'
                ? 1
                : imageCropPreset === 'landscape_4_3'
                ? 4 / 3
                : 3 / 4;
            const currentRatio = srcW / srcH;
            if (currentRatio > targetRatio) {
              cropW = Math.round(srcH * targetRatio);
              cropX = Math.round((srcW - cropW) / 2);
            } else {
              cropH = Math.round(srcW / targetRatio);
              cropY = Math.round((srcH - cropH) / 2);
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(16, cropW);
          canvas.height = Math.max(16, cropH);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imgBitmap, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
          const mime = selectedFiles[0].type || 'image/jpeg';
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), mime, 0.94)
          );
          const cropped = new File([blob], `cropped_${selectedFiles[0].name}`, { type: mime });
          setResultFile(cropped);
          break;
        }

        case 'image-enhancement':
        case 'scan-enhancement': {
          if (!selectedFiles[0]) throw new Error('Please select an image to enhance.');
          const imgBitmap = await createImageBitmap(selectedFiles[0]);
          const canvas = document.createElement('canvas');
          canvas.width = imgBitmap.width;
          canvas.height = imgBitmap.height;
          const ctx = canvas.getContext('2d')!;

          if (enhancePreset === 'bw' || enhancePreset === 'document') {
            ctx.filter = 'grayscale(100%) contrast(160%) brightness(105%)';
          } else if (enhancePreset === 'vivid') {
            ctx.filter = 'saturate(140%) contrast(115%) brightness(102%)';
          } else {
            ctx.filter = 'contrast(120%) brightness(105%)';
          }

          ctx.drawImage(imgBitmap, 0, 0);
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.95)
          );
          const enhanced = new File([blob], `enhanced_${selectedFiles[0].name}`, {
            type: 'image/jpeg',
          });
          setResultFile(enhanced);
          break;
        }

        case 'image-format-converter': {
          if (!selectedFiles[0]) throw new Error('Please select an image to convert.');
          const imgBitmap = await createImageBitmap(selectedFiles[0]);
          const canvas = document.createElement('canvas');
          canvas.width = imgBitmap.width;
          canvas.height = imgBitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imgBitmap, 0, 0);
          const ext =
            targetFormat === 'image/png' ? 'png' : targetFormat === 'image/webp' ? 'webp' : 'jpg';
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), targetFormat, 0.92)
          );
          const converted = new File(
            [blob],
            selectedFiles[0].name.replace(/\.[^.]+$/, `.${ext}`),
            { type: targetFormat }
          );
          setResultFile(converted);
          break;
        }

        case 'scan-to-pdf':
        case 'multi-page-scan': {
          if (selectedFiles.length === 0) {
            throw new Error('Capture pages with camera or select photos first.');
          }
          const pdf = await imagesToPdf(selectedFiles);
          setResultFile(pdf);
          break;
        }
      }

      setIsProcessing(false);
      setProgress(100);
      Haptics.success();
    } catch (err: unknown) {
      setIsProcessing(false);
      setErrorMessage(
        err instanceof Error ? err.message : 'Operation failed. Please try again.'
      );
      Haptics.error();
    }
  };

  const handleDownloadResult = () => {
    if (!resultFile) return;
    Haptics.buttonPress();
    const url = URL.createObjectURL(resultFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = resultFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingleJpg = (res: { pageNumber: number; dataUrl: string }) => {
    const a = document.createElement('a');
    a.href = res.dataUrl;
    a.download = `page_${res.pageNumber}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!toolId) return null;

  const toolMeta: Record<
    ToolId,
    { title: string; subtitle: string; accept: string; multi?: boolean }
  > = {
    'merge-pdf': {
      title: 'Merge PDF',
      subtitle: 'Combine multiple PDF documents into one',
      accept: 'application/pdf',
      multi: true,
    },
    'compress-pdf': {
      title: 'Compress PDF',
      subtitle: 'Reduce PDF file size while keeping text sharp',
      accept: 'application/pdf',
    },
    'pdf-to-jpg': {
      title: 'PDF to JPG',
      subtitle: 'Extract every page as a high-quality JPG image',
      accept: 'application/pdf',
    },
    'pages-per-sheet': {
      title: 'Pages Per Sheet (N-Up)',
      subtitle: 'Print 2 or 4 pages on one sheet to save paper',
      accept: 'application/pdf',
    },
    'rotate-pages': {
      title: 'Rotate Pages',
      subtitle: 'Rotate individual pages by 90°, 180° or 270°',
      accept: 'application/pdf',
    },
    'delete-pages': {
      title: 'Remove Pages',
      subtitle: 'Select and delete unwanted pages cleanly',
      accept: 'application/pdf',
    },
    'reorder-pages': {
      title: 'Reorder Pages',
      subtitle: 'Rearrange page sequence before printing',
      accept: 'application/pdf',
    },
    'crop-pages': {
      title: 'Crop Pages',
      subtitle: 'Adjust page boundaries and margins',
      accept: 'application/pdf',
    },
    'split-pdf': {
      title: 'Split PDF',
      subtitle: 'Extract specific pages into a new document',
      accept: 'application/pdf',
    },
    'blank-page-removal': {
      title: 'Blank Page Removal',
      subtitle: 'Automatically detect and remove blank pages',
      accept: 'application/pdf',
    },
    'resize-image': {
      title: 'Resize Image',
      subtitle: 'Change pixel dimensions with aspect ratio lock',
      accept: 'image/*',
    },
    'image-enhancement': {
      title: 'Image Enhancement',
      subtitle: 'Improve sharpness, contrast and clarity',
      accept: 'image/*',
    },
    'passport-photo': {
      title: 'Passport Photo Maker',
      subtitle: 'Tile 6 or 8 passport photos on an A4 sheet',
      accept: 'image/*',
    },
    'id-card-layout': {
      title: 'ID Card Layout',
      subtitle: 'Arrange front & back ID on a single A4 page',
      accept: 'image/*',
    },
    'image-to-pdf': {
      title: 'Image to PDF',
      subtitle: 'Convert photos or scans into a clean PDF',
      accept: 'image/*',
      multi: true,
    },
    'image-crop': {
      title: 'Crop Image',
      subtitle: 'Crop and trim photo framing before printing',
      accept: 'image/*',
    },
    'image-format-converter': {
      title: 'Image Format Converter',
      subtitle: 'Convert JPG, PNG, WebP seamlessly',
      accept: 'image/*',
    },
    'scan-to-pdf': {
      title: 'Scan to PDF',
      subtitle: 'Capture document with camera and save as PDF',
      accept: 'image/*,application/pdf',
    },
    'multi-page-scan': {
      title: 'Multiple Page Scan',
      subtitle: 'Snap several pages into one PDF document',
      accept: 'image/*',
      multi: true,
    },
    'scan-enhancement': {
      title: 'Scan Enhancement',
      subtitle: 'Make text readable with high-contrast filter',
      accept: 'image/*',
    },
  };

  const currentMeta = toolMeta[toolId];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={currentMeta.title}
      className="fixed inset-0 z-50 bg-[#F8FAF6] text-[#191C1A] flex flex-col animate-view-enter overflow-y-auto"
    >
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 px-4 bg-white/95 border-b border-outline-variant/40">
        <div className="max-w-lg mx-auto h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tool"
              className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] hover:bg-[#DDECE2] flex items-center justify-center active:scale-95 transition-all shrink-0"
            >
              <X size={18} weight="bold" aria-hidden="true" />
            </button>
            <div className="flex flex-col min-w-0">
              <h2 className="text-[14.5px] font-bold text-[#191C1A] truncate">
                {currentMeta.title}
              </h2>
              <span className="text-[11px] text-[#545D56] truncate">
                {currentMeta.subtitle}
              </span>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                filePickModeRef.current = 'replace';
                fileInputRef.current?.click();
              }}
              className="text-[12px] font-semibold text-[#194F34] hover:underline px-2.5 py-2 shrink-0"
            >
              {currentMeta.multi ? 'Replace Files' : 'Change File'}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col gap-4 pb-28">
        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#FFF1F2] border border-[#BA1A1A]/20 text-[#BA1A1A] text-xs font-medium flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <WarningCircle size={16} weight="fill" className="text-[#BA1A1A] shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error"
              className="p-1 text-[#BA1A1A]"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        )}

        {/* Camera Stage for Scan Tools */}
        {(toolId === 'scan-to-pdf' || toolId === 'multi-page-scan') && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col items-center">
            {cameraActive ? (
              <div className="relative w-full aspect-3/4 rounded-xl overflow-hidden bg-black mb-3">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-4 border-2 border-[#7DD39A] rounded-xl pointer-events-none opacity-80" />
                <button
                  type="button"
                  onClick={captureCameraFrame}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 min-h-[44px] px-4 rounded-xl bg-[#194F34] text-white font-bold text-xs shadow-lg active:scale-95 flex items-center gap-1.5"
                >
                  <Camera size={16} weight="bold" />
                  <span className="tabular-nums">Snap Page ({scannedPages.length})</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-5">
                <div className="w-14 h-14 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center mx-auto mb-3">
                  <Camera size={26} weight="regular" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-[#191C1A]">Use Device Camera</h3>
                <p className="text-xs text-[#545D56] mt-1 mb-4 max-w-xs">
                  Hold camera steady above your document to capture clean printable pages.
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="min-h-[44px] px-4 rounded-xl bg-[#194F34] text-white font-semibold text-xs active:scale-95"
                  >
                    Start Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] px-4 rounded-xl bg-[#EAF3ED] text-[#194F34] font-semibold text-xs border border-[#194F34]/15"
                  >
                    Choose Photo
                  </button>
                </div>
              </div>
            )}

            {scannedPages.length > 0 && (
              <div className="w-full mt-3 pt-3 border-t border-outline-variant/40 flex flex-col gap-2">
                <span className="text-[11.5px] font-bold text-[#191C1A] tabular-nums">
                  Captured Pages ({scannedPages.length})
                </span>
                <div className="flex gap-2 overflow-x-auto py-1">
                  {scannedPages.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative w-14 h-18 rounded-lg overflow-hidden border border-black/10 shrink-0"
                    >
                      <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/75 text-white text-[9px] px-1 rounded-xs tabular-nums">
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={finishCameraScan}
                  disabled={isProcessing}
                  className="w-full min-h-[46px] rounded-xl bg-[#194F34] text-white font-semibold text-xs active:scale-98 mt-1"
                >
                  Generate PDF ({scannedPages.length} pages)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ID Card Front & Back Dual Picker */}
        {toolId === 'id-card-layout' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-outline-variant/60 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-[#191C1A] mb-2">Front Side</span>
              {idFrontFile ? (
                <div className="text-[11.5px] text-[#194F34] font-semibold truncate max-w-full">
                  {idFrontFile.name}
                </div>
              ) : (
                <label className="w-full h-24 rounded-xl border border-dashed border-[#194F34]/30 bg-[#EAF3ED]/40 flex flex-col items-center justify-center cursor-pointer hover:bg-[#EAF3ED]">
                  <UploadSimple size={18} weight="bold" className="text-[#194F34] mb-1" />
                  <span className="text-[11px] font-semibold text-[#194F34]">Add Front</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const picked = e.target.files ? Array.from(e.target.files) : [];
                      e.target.value = '';
                      if (picked.length === 0) return;
                      const { validFiles, errors } = validateToolFiles(picked, 'image');
                      if (errors.length > 0) {
                        setErrorMessage(errors[0]);
                        return;
                      }
                      if (validFiles[0]) {
                        setIdFrontFile(validFiles[0]);
                        setErrorMessage(null);
                        setResultFile(null);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-outline-variant/60 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-[#191C1A] mb-2">Back Side (Optional)</span>
              {idBackFile ? (
                <div className="text-[11.5px] text-[#194F34] font-semibold truncate max-w-full">
                  {idBackFile.name}
                </div>
              ) : (
                <label className="w-full h-24 rounded-xl border border-dashed border-[#194F34]/30 bg-[#EAF3ED]/40 flex flex-col items-center justify-center cursor-pointer hover:bg-[#EAF3ED]">
                  <UploadSimple size={18} weight="bold" className="text-[#194F34] mb-1" />
                  <span className="text-[11px] font-semibold text-[#194F34]">Add Back</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const picked = e.target.files ? Array.from(e.target.files) : [];
                      e.target.value = '';
                      if (picked.length === 0) return;
                      const { validFiles, errors } = validateToolFiles(picked, 'image');
                      if (errors.length > 0) {
                        setErrorMessage(errors[0]);
                        return;
                      }
                      if (validFiles[0]) {
                        setIdBackFile(validFiles[0]);
                        setErrorMessage(null);
                        setResultFile(null);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Generic File Selection Card */}
        {toolId !== 'scan-to-pdf' &&
          toolId !== 'multi-page-scan' &&
          toolId !== 'id-card-layout' &&
          selectedFiles.length === 0 && (
            <button
              type="button"
              onClick={() => {
                filePickModeRef.current = 'replace';
                fileInputRef.current?.click();
              }}
              className="p-6 rounded-2xl bg-white border border-dashed border-[#194F34]/30 hover:border-[#194F34]/50 flex flex-col items-center justify-center text-center group active:scale-[0.99] transition-all"
            >
              <div className="w-13 h-13 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center mb-3">
                <UploadSimple size={24} weight="bold" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-bold text-[#191C1A]">
                Select {currentMeta.multi ? 'Documents' : 'Document / Photo'}
              </h3>
              <p className="text-xs text-[#545D56] mt-1 max-w-xs">
                {toolId === 'merge-pdf'
                  ? 'Choose 2 or more PDF files from your device to combine into one.'
                  : `Tap to browse files from your device to run ${currentMeta.title.toLowerCase()}.`}
              </p>
            </button>
          )}

        <input
          ref={fileInputRef}
          type="file"
          accept={currentMeta.accept}
          multiple={currentMeta.multi}
          className="sr-only"
          onChange={(e) => {
            const rawFiles = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            if (rawFiles.length === 0) return;

            const { validFiles, errors } = validateToolFiles(
              rawFiles,
              getToolValidationMode(toolId)
            );

            if (errors.length > 0) {
              setErrorMessage(errors[0]);
              Haptics.error();
            } else {
              setErrorMessage(null);
            }

            if (validFiles.length === 0) return;

            const isAppend = filePickModeRef.current === 'append' && Boolean(currentMeta.multi);
            filePickModeRef.current = 'replace';

            setSelectedFiles((prev) => (isAppend ? [...prev, ...validFiles] : validFiles));
            setResultFile(null);
            setJpgResults([]);
            setCompressionStats(null);

            if (toolId === 'resize-image' && validFiles[0]) {
              createImageBitmap(validFiles[0]).then((bm) => {
                setResizeWidth(bm.width);
                setResizeHeight(bm.height);
                setOriginalAspect(bm.width / bm.height);
              });
            }
          }}
        />

        {/* Selected Files List for Multi-File Tools */}
        {selectedFiles.length > 0 && currentMeta.multi && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
              <span className="text-xs font-bold text-[#191C1A] tabular-nums">
                Selected Files ({selectedFiles.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  filePickModeRef.current = 'append';
                  fileInputRef.current?.click();
                }}
                className="text-[12px] font-semibold text-[#194F34] hover:underline"
              >
                + Add More
              </button>
            </div>
            {selectedFiles.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAF6] border border-outline-variant/35 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-[#EAF3ED] text-[#194F34] font-bold text-[11px] flex items-center justify-center shrink-0 tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-[#191C1A] truncate max-w-[170px]">
                      {f.name}
                    </div>
                    <div className="text-[10.5px] text-[#545D56] tabular-nums">
                      {formatToolFileSize(f.size)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => {
                      const next = [...selectedFiles];
                      const temp = next[idx - 1];
                      next[idx - 1] = next[idx];
                      next[idx] = temp;
                      setSelectedFiles(next);
                      setResultFile(null);
                    }}
                    aria-label="Move up"
                    className="w-8 h-8 flex items-center justify-center hover:text-[#194F34] disabled:opacity-25"
                  >
                    <ArrowUp size={14} weight="bold" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === selectedFiles.length - 1}
                    onClick={() => {
                      const next = [...selectedFiles];
                      const temp = next[idx + 1];
                      next[idx + 1] = next[idx];
                      next[idx] = temp;
                      setSelectedFiles(next);
                      setResultFile(null);
                    }}
                    aria-label="Move down"
                    className="w-8 h-8 flex items-center justify-center hover:text-[#194F34] disabled:opacity-25"
                  >
                    <ArrowDown size={14} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
                      setResultFile(null);
                    }}
                    aria-label="Remove file"
                    className="w-8 h-8 flex items-center justify-center text-[#BA1A1A] hover:opacity-80"
                  >
                    <Trash size={14} weight="bold" />
                  </button>
                </div>
              </div>
            ))}
            {toolId === 'merge-pdf' && selectedFiles.length < 2 && (
              <p className="text-[11.5px] text-[#545D56] pt-1">
                Tap <strong>+ Add More</strong> to select at least 2 PDF files to merge.
              </p>
            )}
          </div>
        )}

        {/* Selected Single File Summary */}
        {selectedFiles.length === 1 && !currentMeta.multi && (
          <div className="p-3.5 rounded-2xl bg-white border border-outline-variant/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <FileText size={18} weight="bold" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12.5px] font-bold text-[#191C1A] truncate max-w-[200px]">
                  {selectedFiles[0].name}
                </span>
                <span className="text-[11px] text-[#545D56] tabular-nums">
                  {formatToolFileSize(selectedFiles[0].size)}
                  {pdfPageCount > 0 ? ` · ${pdfPageCount} pages` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setResultFile(null);
                setCompressionStats(null);
              }}
              className="text-xs font-semibold text-[#545D56] hover:text-[#BA1A1A] px-2 py-1"
            >
              Clear
            </button>
          </div>
        )}

        {/* 1. Compress Options */}
        {toolId === 'compress-pdf' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Compression Strength</span>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setCompressLevel(lvl)}
                  className={`min-h-[54px] p-2.5 rounded-xl border text-center transition-all ${
                    compressLevel === lvl
                      ? 'border-[#194F34] bg-[#EAF3ED] font-bold text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-xs capitalize">{lvl}</div>
                  <div className="text-[10px] opacity-80">
                    {lvl === 'low' ? 'Best Quality' : lvl === 'medium' ? 'Balanced' : 'Smallest'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. Pages Per Sheet (N-Up) */}
        {toolId === 'pages-per-sheet' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Layout Selection</span>
            <div className="grid grid-cols-2 gap-2">
              {[2, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setNUpMode(num as 2 | 4)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    nUpMode === num
                      ? 'border-[#194F34] bg-[#EAF3ED] font-bold text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-sm font-bold tabular-nums">{num} Pages / Sheet</div>
                  <div className="text-[10.5px] text-[#545D56] mt-0.5">
                    {num === 2 ? 'Landscape 2-up' : 'Portrait 2×2 grid'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. Rotate Pages Grid */}
        {toolId === 'rotate-pages' && pdfPageCount > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
              <span className="text-xs font-bold text-[#191C1A]">Tap Page to Rotate (+90°)</span>
              <button
                type="button"
                onClick={() => {
                  const all: Record<number, number> = {};
                  for (let i = 1; i <= pdfPageCount; i++) {
                    all[i] = ((pageRotations[i] || 0) + 90) % 360;
                  }
                  setPageRotations(all);
                }}
                className="text-[11.5px] font-semibold text-[#194F34]"
              >
                Rotate All +90°
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((p) => {
                const rot = pageRotations[p] || 0;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      Haptics.buttonPress();
                      setPageRotations((prev) => ({
                        ...prev,
                        [p]: ((prev[p] || 0) + 90) % 360,
                      }));
                    }}
                    className="p-2 rounded-xl bg-[#F8FAF6] border border-outline-variant/50 flex flex-col items-center gap-1 hover:border-[#194F34]"
                  >
                    <div
                      className="w-8 h-10 bg-white rounded-xs border flex items-center justify-center text-[10px] font-bold text-[#194F34] transition-transform tabular-nums overflow-hidden"
                      style={{ transform: `rotate(${rot}deg)` }}
                    >
                      {pageThumbnails[p] ? (
                        <img src={pageThumbnails[p]} alt={`Page ${p}`} className="w-full h-full object-contain" />
                      ) : (
                        p
                      )}
                    </div>
                    <span className="text-[10px] text-[#545D56] tabular-nums">{rot}°</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Delete Pages Grid */}
        {toolId === 'delete-pages' && pdfPageCount > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A] tabular-nums">
              Tap Pages to Remove ({pagesToDelete.length} selected)
            </span>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((p) => {
                const isMarked = pagesToDelete.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      Haptics.buttonPress();
                      setPagesToDelete((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                      );
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                      isMarked
                        ? 'border-rose-400 bg-rose-50 text-rose-700'
                        : 'border-outline-variant/50 bg-[#F8FAF6] text-[#191C1A]'
                    }`}
                  >
                    <div className="w-8 h-10 bg-white rounded-xs border flex items-center justify-center text-[11px] font-bold tabular-nums">
                      {isMarked ? <Trash size={14} weight="bold" className="text-rose-600" /> : p}
                    </div>
                    <span className="text-[10px] tabular-nums">{isMarked ? 'Delete' : `Page ${p}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Split PDF Selection Grid */}
        {toolId === 'split-pdf' && pdfPageCount > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-outline-variant/40">
              <span className="text-xs font-bold text-[#191C1A] tabular-nums">
                Select Pages to Extract ({splitSelectedPages.length})
              </span>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#194F34]">
                <button
                  type="button"
                  onClick={() =>
                    setSplitSelectedPages(
                      Array.from({ length: pdfPageCount }, (_, i) => i + 1).filter((p) => p % 2 === 1)
                    )
                  }
                  className="hover:underline"
                >
                  Odd
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSplitSelectedPages(
                      Array.from({ length: pdfPageCount }, (_, i) => i + 1).filter((p) => p % 2 === 0)
                    )
                  }
                  className="hover:underline"
                >
                  Even
                </button>
                <button
                  type="button"
                  onClick={() => setSplitSelectedPages([])}
                  className="text-[#545D56] hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: pdfPageCount }, (_, i) => i + 1).map((p) => {
                const isSelected = splitSelectedPages.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      Haptics.buttonPress();
                      setSplitSelectedPages((prev) =>
                        prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                      );
                    }}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                      isSelected
                        ? 'border-[#194F34] bg-[#EAF3ED] text-[#194F34]'
                        : 'border-outline-variant/50 bg-[#F8FAF6] text-[#191C1A]'
                    }`}
                  >
                    <div className="w-8 h-10 bg-white rounded-xs border flex items-center justify-center text-[11px] font-bold tabular-nums overflow-hidden">
                      {pageThumbnails[p] ? (
                        <img src={pageThumbnails[p]} alt={`Page ${p}`} className="w-full h-full object-contain" />
                      ) : (
                        p
                      )}
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums">Page {p}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. Reorder Pages Controls */}
        {toolId === 'reorder-pages' && reorderedPages.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
              <span className="text-xs font-bold text-[#191C1A]">
                Arrange Print Sequence
              </span>
              <button
                type="button"
                onClick={() =>
                  setReorderedPages(Array.from({ length: pdfPageCount }, (_, i) => i + 1))
                }
                className="text-[11px] font-semibold text-[#194F34]"
              >
                Reset Order
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
              {reorderedPages.map((origP, idx) => (
                <div
                  key={origP}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#F8FAF6] border border-outline-variant/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-[#EAF3ED] text-[#194F34] text-[11px] font-bold flex items-center justify-center tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-[#191C1A] tabular-nums">
                      Original Page {origP}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveReorderedPage(idx, -1)}
                      aria-label={`Move page ${origP} up`}
                      className="w-9 h-9 rounded-lg bg-white border border-outline-variant/45 flex items-center justify-center text-[#191C1A] disabled:opacity-30"
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === reorderedPages.length - 1}
                      onClick={() => moveReorderedPage(idx, 1)}
                      aria-label={`Move page ${origP} down`}
                      className="w-9 h-9 rounded-lg bg-white border border-outline-variant/45 flex items-center justify-center text-[#191C1A] disabled:opacity-30"
                    >
                      <ArrowDown size={14} weight="bold" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Crop PDF Margin Presets */}
        {toolId === 'crop-pages' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Margin Trim Amount</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { pt: 10, label: 'Subtle (10 pt)', desc: 'Trim scanner borders' },
                { pt: 20, label: 'Standard (20 pt)', desc: 'Balanced edge trim' },
                { pt: 35, label: 'Medium (35 pt)', desc: 'Tighter content frame' },
                { pt: 50, label: 'Deep (50 pt)', desc: 'Remove wide margins' },
              ].map((opt) => (
                <button
                  key={opt.pt}
                  type="button"
                  onClick={() => setCropMarginPt(opt.pt)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    cropMarginPt === opt.pt
                      ? 'border-[#194F34] bg-[#EAF3ED] text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10.5px] opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 8. Blank Page Removal Status */}
        {toolId === 'blank-page-removal' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Blank Page Detection</span>
            {detectedBlanks.length > 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <WarningCircle size={16} weight="fill" className="text-amber-600" />
                  <span className="tabular-nums">
                    Found {detectedBlanks.length} blank page(s): {detectedBlanks.join(', ')}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Removing blank pages avoids unnecessary billing at {session.activeStation.name}.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#EAF3ED] border border-[#194F34]/15 text-xs text-[#194F34] flex items-center gap-2 font-medium">
                <CheckCircle size={16} weight="fill" className="text-[#194F34]" />
                <span>No blank pages detected in this document.</span>
              </div>
            )}
          </div>
        )}

        {/* 9. Passport Photo Count */}
        {toolId === 'passport-photo' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Number of Photos on A4 Sheet</span>
            <div className="grid grid-cols-2 gap-2">
              {[6, 8].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPassportCount(c as 6 | 8)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    passportCount === c
                      ? 'border-[#194F34] bg-[#EAF3ED] font-bold text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-sm font-bold tabular-nums">{c} Passport Photos</div>
                  <div className="text-[10.5px] text-[#545D56]">Standard 35 × 45 mm</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 10. Image Crop Presets */}
        {toolId === 'image-crop' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Crop Aspect Ratio</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'square', label: '1:1 Square', desc: 'Centered square frame' },
                { id: 'landscape_4_3', label: '4:3 Landscape', desc: 'Standard photo framing' },
                { id: 'portrait_3_4', label: '3:4 Portrait', desc: 'Vertical ID & document' },
                { id: 'trim_10', label: 'Trim 10% Edges', desc: 'Remove outer borders' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setImageCropPreset(opt.id as ImageCropPreset)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    imageCropPreset === opt.id
                      ? 'border-[#194F34] bg-[#EAF3ED] text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10.5px] opacity-80">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 11. Resize Image Inputs */}
        {toolId === 'resize-image' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Custom Pixel Dimensions</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#545D56] font-semibold">Width (px)</label>
                <input
                  type="number"
                  value={resizeWidth}
                  onChange={(e) => {
                    const w = parseInt(e.target.value, 10) || 0;
                    setResizeWidth(w);
                    if (keepAspect && originalAspect > 0) {
                      setResizeHeight(Math.round(w / originalAspect));
                    }
                  }}
                  className="w-full mt-1 h-10 px-2.5 rounded-xl border border-outline-variant/70 text-xs font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#545D56] font-semibold">Height (px)</label>
                <input
                  type="number"
                  value={resizeHeight}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10) || 0;
                    setResizeHeight(h);
                    if (keepAspect && originalAspect > 0) {
                      setResizeWidth(Math.round(h * originalAspect));
                    }
                  }}
                  className="w-full mt-1 h-10 px-2.5 rounded-xl border border-outline-variant/70 text-xs font-bold tabular-nums"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#545D56] cursor-pointer">
              <input
                type="checkbox"
                checked={keepAspect}
                onChange={(e) => setKeepAspect(e.target.checked)}
                className="rounded-xs text-[#194F34]"
              />
              <span>Maintain Aspect Ratio</span>
            </label>
          </div>
        )}

        {/* 12. Image Format Converter */}
        {toolId === 'image-format-converter' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Target Output Format</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'JPG', mime: 'image/jpeg' },
                { label: 'PNG', mime: 'image/png' },
                { label: 'WebP', mime: 'image/webp' },
              ].map((fmt) => (
                <button
                  key={fmt.mime}
                  type="button"
                  onClick={() => setTargetFormat(fmt.mime as 'image/jpeg' | 'image/png' | 'image/webp')}
                  className={`min-h-[44px] p-3 rounded-xl border text-center transition-all ${
                    targetFormat === fmt.mime
                      ? 'border-[#194F34] bg-[#EAF3ED] font-bold text-[#194F34]'
                      : 'border-outline-variant/55 bg-white text-[#545D56]'
                  }`}
                >
                  <span className="text-xs font-bold">{fmt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 13. Image Enhancement Presets */}
        {(toolId === 'image-enhancement' || toolId === 'scan-enhancement') &&
          selectedFiles.length > 0 && (
            <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3">
              <span className="text-xs font-bold text-[#191C1A]">Enhancement Filter</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'document', name: 'Document Clean', desc: 'High contrast text' },
                  { id: 'bw', name: 'B&W Scan', desc: 'Clean black & white' },
                  { id: 'auto', name: 'Auto Clarity', desc: 'Balanced sharpening' },
                  { id: 'vivid', name: 'Vivid Photo', desc: 'Richer saturation' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEnhancePreset(p.id as 'auto' | 'document' | 'bw' | 'vivid')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      enhancePreset === p.id
                        ? 'border-[#194F34] bg-[#EAF3ED] font-bold text-[#194F34]'
                        : 'border-outline-variant/55 bg-white text-[#545D56]'
                    }`}
                  >
                    <div className="text-xs font-bold">{p.name}</div>
                    <div className="text-[10.5px] text-[#545D56]">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* Process Button */}
        {(selectedFiles.length > 0 || idFrontFile) &&
          !resultFile &&
          jpgResults.length === 0 && (
            <button
              type="button"
              onClick={handleExecuteTool}
              disabled={isProcessing}
              className="w-full min-h-[48px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <ArrowsClockwise size={17} weight="bold" className="animate-spin" />
                  <span className="tabular-nums">
                    Processing {progress > 0 ? `${progress}%` : '...'}
                  </span>
                </>
              ) : (
                <>
                  <Play size={16} weight="fill" aria-hidden="true" />
                  <span>Run {currentMeta.title}</span>
                </>
              )}
            </button>
          )}

        {/* Result Action Stage */}
        {resultFile && (
          <div className="p-4 rounded-2xl bg-white border border-[#194F34]/25 flex flex-col gap-3 animate-view-enter">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#194F34] font-bold text-xs">
                <CheckCircle size={18} weight="fill" aria-hidden="true" />
                <span>{currentMeta.title} Ready</span>
              </div>
              {resultPageCount !== null && (
                <span className="px-2 py-0.5 rounded-md bg-[#EAF3ED] text-[#194F34] text-[11px] font-semibold tabular-nums">
                  {resultPageCount} {resultPageCount === 1 ? 'page' : 'pages'}
                </span>
              )}
            </div>

            {/* Resulting Document / Image Preview */}
            {(isRenderingResultPreview || resultPreviewUrl) && (
              <div className="rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] p-2.5 flex flex-col items-center justify-center">
                {isRenderingResultPreview ? (
                  <div className="py-8 flex items-center gap-2 text-xs text-[#545D56]">
                    <ArrowsClockwise size={15} weight="bold" className="animate-spin text-[#194F34]" />
                    <span>Rendering preview...</span>
                  </div>
                ) : resultPreviewUrl ? (
                  <img
                    src={resultPreviewUrl}
                    alt={`Preview of ${resultFile.name}`}
                    className="max-h-60 w-auto rounded-lg border border-[#E2E7E1] bg-white object-contain"
                  />
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-1 text-xs text-[#545D56] tabular-nums">
              <div className="truncate">
                File: <strong className="text-[#191C1A]">{resultFile.name}</strong> (
                {formatToolFileSize(resultFile.size)})
              </div>
              {compressionStats && (
                <div className="text-[11.5px] font-semibold text-[#194F34]">
                  {formatCompressionSummary(
                    compressionStats.originalSize,
                    compressionStats.newSize
                  ).summaryText}
                </div>
              )}
              {session.activeStation && (
                <div className="text-[11px] text-[#545D56]">
                  Paired kiosk: <strong className="text-[#191C1A]">{session.activeStation.name}</strong>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadResult}
                className="min-h-[46px] rounded-xl bg-[#EAF3ED] hover:bg-[#DDECE2] border border-[#194F34]/15 text-[#194F34] font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSendToPrint(resultFile);
                  onClose();
                }}
                className="min-h-[46px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Printer size={16} weight="bold" aria-hidden="true" />
                <span>Add to Print Queue</span>
              </button>
            </div>
          </div>
        )}

        {/* PDF to JPG Extracted Thumbnails Display */}
        {jpgResults.length > 0 && (
          <div className="p-4 rounded-2xl bg-white border border-outline-variant/60 flex flex-col gap-3 animate-view-enter">
            <span className="text-xs font-bold text-[#191C1A] tabular-nums">
              Extracted JPG Images ({jpgResults.length} pages)
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {jpgResults.map((res) => (
                <div
                  key={res.pageNumber}
                  className="p-2 rounded-xl bg-[#F8FAF6] border border-outline-variant/45 flex flex-col gap-1.5"
                >
                  <img
                    src={res.dataUrl}
                    alt={`Page ${res.pageNumber}`}
                    className="w-full aspect-3/4 object-contain rounded-lg bg-white border"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#191C1A] tabular-nums">
                      Page {res.pageNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleJpg(res)}
                      className="text-[#194F34] font-bold hover:underline px-2 py-1"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>,
    document.body
  );
};
