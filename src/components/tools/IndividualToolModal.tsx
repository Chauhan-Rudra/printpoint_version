import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  Upload,
  ArrowRight,
  CheckCircle2,
  Printer,
  Download,
  RefreshCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCw,
  RotateCcw,
  Crop,
  Layers,
  FileText,
  Image as ImageIcon,
  Camera,
  AlertCircle,
  Scissors,
  Sparkles,
  Maximize2,
  Sliders,
  Check,
} from 'lucide-react';
import { Haptics } from '../../utils/haptics';
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
} from '../../utils/pdfToolHelpers';
import {
  detectBlankPagesInPdf,
  removePagesFromPdf,
} from '../../utils/blankPageDetector';

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
  | 'photo-printing'
  | 'scan-to-pdf'
  | 'multi-page-scan'
  | 'merge-documents'
  | 'document-preview'
  | 'scan-enhancement';

interface IndividualToolModalProps {
  toolId: ToolId | null;
  onClose: () => void;
  onSendToPrint: (file: File) => void;
}

export const IndividualToolModal: React.FC<IndividualToolModalProps> = ({
  toolId,
  onClose,
  onSendToPrint,
}) => {
  // Shared state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [jpgResults, setJpgResults] = useState<Array<{ pageNumber: number; dataUrl: string; blob: Blob }>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tool specific options
  const [compressLevel, setCompressLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [nUpMode, setNUpMode] = useState<2 | 4>(2);
  const [cropMarginPt, setCropMarginPt] = useState<number>(20);
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
  const [targetFormat, setTargetFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [enhancePreset, setEnhancePreset] = useState<'auto' | 'document' | 'bw' | 'vivid'>('document');
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  // PDF Page inspection
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pageThumbnails, setPageThumbnails] = useState<Record<number, string>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset state when opening a new tool
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
  }, [toolId]);

  // Load PDF metadata and thumbnails when primary file selected
  useEffect(() => {
    if (selectedFiles.length === 0) return;
    const primary = selectedFiles[0];
    if (!primary.name.toLowerCase().endsWith('.pdf')) return;

    let isMounted = true;
    primary.arrayBuffer().then((buffer) => {
      pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise.then(async (doc) => {
        if (!isMounted) return;
        setPdfPageCount(doc.numPages);
        setReorderedPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));

        // Generate quick low-res thumbnails for page tools
        const thumbs: Record<number, string> = {};
        for (let p = 1; p <= Math.min(doc.numPages, 16); p++) {
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
            thumbs[p] = canvas.toDataURL('image/jpeg', 0.7);
          } catch {
            // ignore thumbnail render error
          }
        }
        if (isMounted) setPageThumbnails(thumbs);
      });
    });

    // Run blank page analysis if blank removal tool
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

  // Camera cleanup
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
    } catch {
      setErrorMessage('Camera access was not granted or is unsupported.');
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

    // Apply document contrast enhancement
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

  // Tool execution logic
  const handleExecuteTool = async () => {
    if (!toolId) return;
    Haptics.buttonPress();
    setIsProcessing(true);
    setProgress(15);
    setErrorMessage(null);

    try {
      switch (toolId) {
        case 'merge-pdf':
        case 'merge-documents': {
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
          setResultFile(res.compressedFile);
          break;
        }

        case 'pdf-to-jpg': {
          if (!selectedFiles[0]) throw new Error('Please select a PDF file.');
          const jpgs = await convertPdfToJpg(selectedFiles[0], (pct) =>
            setProgress(pct)
          );
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
          if (splitSelectedPages.length === 0) throw new Error('Select pages to extract.');
          const split = await splitPdfPages(selectedFiles[0], splitSelectedPages);
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
          canvas.width = resizeWidth;
          canvas.height = resizeHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(imgBitmap, 0, 0, resizeWidth, resizeHeight);
          const blob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), selectedFiles[0].type || 'image/jpeg')
          );
          const resized = new File([blob], `resized_${selectedFiles[0].name}`, {
            type: selectedFiles[0].type || 'image/jpeg',
          });
          setResultFile(resized);
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
          const ext = targetFormat === 'image/png' ? 'png' : targetFormat === 'image/webp' ? 'webp' : 'jpg';
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

        case 'photo-printing': {
          if (!selectedFiles[0]) throw new Error('Please select a photo to format for printing.');
          const pdf = await imagesToPdf([selectedFiles[0]]);
          setResultFile(pdf);
          break;
        }
      }

      setIsProcessing(false);
      setProgress(100);
      Haptics.success();
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Operation failed. Please try again.');
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

  // Derive tool titles and metadata
  const toolMeta: Record<ToolId, { title: string; subtitle: string; accept: string; multi?: boolean }> = {
    'merge-pdf': { title: 'Merge PDF', subtitle: 'Combine multiple PDF documents into one', accept: 'application/pdf', multi: true },
    'compress-pdf': { title: 'Compress PDF', subtitle: 'Reduce PDF file size while keeping text sharp', accept: 'application/pdf' },
    'pdf-to-jpg': { title: 'PDF to JPG', subtitle: 'Extract every page as a high-quality JPG image', accept: 'application/pdf' },
    'pages-per-sheet': { title: 'Pages Per Sheet (N-Up)', subtitle: 'Print 2 or 4 pages on one sheet to save paper', accept: 'application/pdf' },
    'rotate-pages': { title: 'Rotate Pages', subtitle: 'Rotate individual pages by 90°, 180° or 270°', accept: 'application/pdf' },
    'delete-pages': { title: 'Delete Pages', subtitle: 'Select and remove unwanted pages', accept: 'application/pdf' },
    'reorder-pages': { title: 'Reorder Pages', subtitle: 'Rearrange page sequence before printing', accept: 'application/pdf' },
    'crop-pages': { title: 'Crop Pages', subtitle: 'Adjust page boundaries and margins', accept: 'application/pdf' },
    'split-pdf': { title: 'Split PDF', subtitle: 'Extract specific pages into a new document', accept: 'application/pdf' },
    'blank-page-removal': { title: 'Blank Page Removal', subtitle: 'Automatically detect and remove blank pages', accept: 'application/pdf' },
    'resize-image': { title: 'Resize Image', subtitle: 'Change pixel dimensions with aspect ratio lock', accept: 'image/*' },
    'image-enhancement': { title: 'Image Enhancement', subtitle: 'Improve sharpness, contrast and clarity', accept: 'image/*' },
    'passport-photo': { title: 'Passport Photo Maker', subtitle: 'Tile 6 or 8 passport photos on an A4 sheet', accept: 'image/*' },
    'id-card-layout': { title: 'ID Card Layout', subtitle: 'Arrange front & back ID on a single A4 page', accept: 'image/*' },
    'image-to-pdf': { title: 'Image to PDF', subtitle: 'Convert photos or scans into a clean PDF', accept: 'image/*', multi: true },
    'image-crop': { title: 'Image Crop', subtitle: 'Crop and trim photo margins', accept: 'image/*' },
    'image-format-converter': { title: 'Image Format Converter', subtitle: 'Convert JPG, PNG, WebP seamlessly', accept: 'image/*' },
    'photo-printing': { title: 'Photo Printing Prep', subtitle: 'Format photos for standard print sizes', accept: 'image/*' },
    'scan-to-pdf': { title: 'Scan to PDF', subtitle: 'Capture document with camera and save as PDF', accept: 'image/*,application/pdf' },
    'multi-page-scan': { title: 'Multiple Page Scan', subtitle: 'Snap several pages into one PDF document', accept: 'image/*' },
    'merge-documents': { title: 'Merge Documents', subtitle: 'Combine documents into one file', accept: 'application/pdf', multi: true },
    'document-preview': { title: 'Document Preview', subtitle: 'Inspect pages before printing', accept: 'application/pdf' },
    'scan-enhancement': { title: 'Scan Enhancement', subtitle: 'Make text readable with high-contrast filter', accept: 'image/*' },
  };

  const currentMeta = toolMeta[toolId];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={currentMeta.title}
      className="fixed inset-0 z-50 bg-[#F4F7F4] text-[#191C1A] flex flex-col animate-apple-reveal overflow-y-auto"
    >
      {/* Sticky Clean Header */}
      <header className="sticky top-0 z-20 px-4 h-14 bg-white/95 backdrop-blur-md border-b border-[#1B4D2E]/10 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tool"
            className="w-9 h-9 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] hover:bg-[#E2EFE7] flex items-center justify-center active:scale-95 transition-all"
          >
            <X className="w-5 h-5 stroke-[2.2]" />
          </button>
          <div className="flex flex-col min-w-0">
            <h2 className="text-[14px] font-bold text-[#191C1A] truncate">
              {currentMeta.title}
            </h2>
            <span className="text-[10px] text-[#545D56] truncate">
              {currentMeta.subtitle}
            </span>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] font-semibold text-[#1B4D2E] hover:underline px-2 py-1"
          >
            Change File
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col gap-4 pb-28">
        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Camera Stage for Scan Tools */}
        {(toolId === 'scan-to-pdf' || toolId === 'multi-page-scan') && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col items-center">
            {cameraActive ? (
              <div className="relative w-full aspect-3/4 rounded-2xl overflow-hidden bg-black mb-3">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-4 border-2 border-emerald-400 rounded-xl pointer-events-none opacity-80" />
                <button
                  type="button"
                  onClick={captureCameraFrame}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-lg active:scale-95 flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>Snap Page ({scannedPages.length})</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-14 h-14 rounded-2xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center mx-auto mb-3">
                  <Camera className="w-7 h-7 stroke-[1.8]" />
                </div>
                <h3 className="text-sm font-bold text-[#191C1A]">Use Device Camera</h3>
                <p className="text-xs text-[#545D56] mt-1 mb-4 max-w-xs">
                  Position your document under good lighting to capture sharp pages.
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl bg-[#1B4D2E] text-white font-semibold text-xs shadow-xs active:scale-95"
                  >
                    Start Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] font-semibold text-xs border border-[#1B4D2E]/20"
                  >
                    Choose Photo
                  </button>
                </div>
              </div>
            )}

            {/* Scanned Pages Strip */}
            {scannedPages.length > 0 && (
              <div className="w-full mt-3 pt-3 border-t border-[#1B4D2E]/10 flex flex-col gap-2">
                <span className="text-[11px] font-bold text-[#191C1A]">
                  Captured Pages ({scannedPages.length})
                </span>
                <div className="flex gap-2 overflow-x-auto py-1">
                  {scannedPages.map((src, idx) => (
                    <div key={idx} className="relative w-14 h-18 rounded-lg overflow-hidden border border-black/10 shrink-0">
                      <img src={src} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[9px] px-1 rounded-xs">
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={finishCameraScan}
                  disabled={isProcessing}
                  className="w-full h-11 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-xs active:scale-98 mt-1"
                >
                  Generate PDF ({scannedPages.length} pages)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ID Card Front & Back Dual File Picker */}
        {toolId === 'id-card-layout' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-white border border-[#1B4D2E]/15 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-[#191C1A] mb-1">Front Side</span>
              {idFrontFile ? (
                <div className="text-[11px] text-emerald-700 font-semibold truncate max-w-full">
                  ✓ {idFrontFile.name}
                </div>
              ) : (
                <label className="w-full h-20 rounded-xl border border-dashed border-[#1B4D2E]/30 bg-[#EDF5F0]/50 flex flex-col items-center justify-center cursor-pointer hover:bg-[#EDF5F0]">
                  <Upload className="w-4 h-4 text-[#1B4D2E] mb-1" />
                  <span className="text-[10px] font-semibold text-[#1B4D2E]">Add Front</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setIdFrontFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-white border border-[#1B4D2E]/15 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-[#191C1A] mb-1">Back Side (Optional)</span>
              {idBackFile ? (
                <div className="text-[11px] text-emerald-700 font-semibold truncate max-w-full">
                  ✓ {idBackFile.name}
                </div>
              ) : (
                <label className="w-full h-20 rounded-xl border border-dashed border-[#1B4D2E]/30 bg-[#EDF5F0]/50 flex flex-col items-center justify-center cursor-pointer hover:bg-[#EDF5F0]">
                  <Upload className="w-4 h-4 text-[#1B4D2E] mb-1" />
                  <span className="text-[10px] font-semibold text-[#1B4D2E]">Add Back</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setIdBackFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Generic File Selection Card */}
        {toolId !== 'scan-to-pdf' && toolId !== 'multi-page-scan' && toolId !== 'id-card-layout' && selectedFiles.length === 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-6 rounded-3xl bg-white border border-dashed border-[#1B4D2E]/30 hover:border-[#1B4D2E]/50 shadow-xs flex flex-col items-center justify-center text-center group active:scale-[0.99] transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Upload className="w-6 h-6 stroke-[2]" />
            </div>
            <h3 className="text-sm font-bold text-[#191C1A]">
              Select {currentMeta.multi ? 'Documents' : 'Document / Photo'}
            </h3>
            <p className="text-xs text-[#545D56] mt-1 max-w-xs">
              Tap to browse files from your phone to start {currentMeta.title.toLowerCase()}.
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
            if (e.target.files && e.target.files.length > 0) {
              const files = Array.from(e.target.files);
              setSelectedFiles(files);
              if (toolId === 'resize-image' && files[0]) {
                createImageBitmap(files[0]).then((bm) => {
                  setResizeWidth(bm.width);
                  setResizeHeight(bm.height);
                  setOriginalAspect(bm.width / bm.height);
                });
              }
            }
          }}
        />

        {/* Selected Files List for Multi-File Tools (Merge) */}
        {selectedFiles.length > 0 && currentMeta.multi && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <span className="text-xs font-bold text-[#191C1A]">
                Files to Merge ({selectedFiles.length})
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-[#1B4D2E]"
              >
                + Add More
              </button>
            </div>
            {selectedFiles.map((f, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-[#F8FAF8] border border-black/5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-md bg-[#EDF5F0] text-[#1B4D2E] font-bold text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-[#191C1A] truncate max-w-[170px]">
                    {f.name}
                  </span>
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
                    }}
                    className="p-1 hover:text-[#1B4D2E] disabled:opacity-20"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
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
                    }}
                    className="p-1 hover:text-[#1B4D2E] disabled:opacity-20"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
                    }}
                    className="p-1 text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected Single File Summary */}
        {selectedFiles.length === 1 && !currentMeta.multi && (
          <div className="p-3.5 rounded-2xl bg-white border border-[#1B4D2E]/15 shadow-2xs flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[#191C1A] truncate max-w-[200px]">
                  {selectedFiles[0].name}
                </span>
                <span className="text-[11px] text-[#545D56]">
                  {(selectedFiles[0].size / (1024 * 1024)).toFixed(2)} MB
                  {pdfPageCount > 0 ? ` · ${pdfPageCount} pages` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFiles([])}
              className="text-xs text-[#545D56] hover:text-rose-600"
            >
              Clear
            </button>
          </div>
        )}

        {/* Specific Tool Configurations */}

        {/* 1. Compress Options */}
        {toolId === 'compress-pdf' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Compression Strength</span>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setCompressLevel(lvl)}
                  className={`p-2.5 rounded-2xl border text-center transition-all ${
                    compressLevel === lvl
                      ? 'border-[#1B4D2E] bg-[#EDF5F0] font-bold text-[#1B4D2E]'
                      : 'border-black/10 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-xs capitalize">{lvl}</div>
                  <div className="text-[10px] opacity-75">
                    {lvl === 'low' ? 'Best Quality' : lvl === 'medium' ? 'Balanced' : 'Smallest'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. Pages Per Sheet (N-Up) Options */}
        {toolId === 'pages-per-sheet' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Layout Selection</span>
            <div className="grid grid-cols-2 gap-2">
              {[2, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setNUpMode(num as 2 | 4)}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    nUpMode === num
                      ? 'border-[#1B4D2E] bg-[#EDF5F0] font-bold text-[#1B4D2E]'
                      : 'border-black/10 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-sm font-bold">{num} Pages / Sheet</div>
                  <div className="text-[10px] text-[#545D56] mt-0.5">
                    {num === 2 ? 'Landscape Side-by-side' : 'Portrait 2x2 Grid'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. Rotate Pages Grid */}
        {toolId === 'rotate-pages' && pdfPageCount > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
              <span className="text-xs font-bold text-[#191C1A]">Tap to Rotate (90°)</span>
              <button
                type="button"
                onClick={() => {
                  const all: Record<number, number> = {};
                  for (let i = 1; i <= pdfPageCount; i++) {
                    all[i] = ((pageRotations[i] || 0) + 90) % 360;
                  }
                  setPageRotations(all);
                }}
                className="text-[11px] font-semibold text-[#1B4D2E]"
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
                    className="p-2 rounded-xl bg-[#F8FAF8] border border-black/10 flex flex-col items-center gap-1 hover:border-[#1B4D2E]"
                  >
                    <div
                      className="w-8 h-10 bg-white rounded-xs border shadow-2xs flex items-center justify-center text-[10px] font-bold text-[#1B4D2E] transition-transform"
                      style={{ transform: `rotate(${rot}deg)` }}
                    >
                      {p}
                    </div>
                    <span className="text-[10px] text-[#545D56]">{rot}°</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Delete Pages Grid */}
        {toolId === 'delete-pages' && pdfPageCount > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">
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
                        : 'border-black/10 bg-[#F8FAF8] text-[#191C1A]'
                    }`}
                  >
                    <div className="w-8 h-10 bg-white rounded-xs border flex items-center justify-center text-[11px] font-bold">
                      {isMarked ? <Trash2 className="w-4 h-4 text-rose-600" /> : p}
                    </div>
                    <span className="text-[10px]">{isMarked ? 'Delete' : `Page ${p}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Blank Page Removal Status */}
        {toolId === 'blank-page-removal' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Blank Page Detection</span>
            {detectedBlanks.length > 0 ? (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col gap-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Found {detectedBlanks.length} blank page(s): {detectedBlanks.join(', ')}</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Removing blank pages saves paper and reduces printing costs at Kiosk #04.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>No blank pages detected in this document.</span>
              </div>
            )}
          </div>
        )}

        {/* 6. Passport Photo Count */}
        {toolId === 'passport-photo' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Number of Photos on A4 Sheet</span>
            <div className="grid grid-cols-2 gap-2">
              {[6, 8].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPassportCount(c as 6 | 8)}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    passportCount === c
                      ? 'border-[#1B4D2E] bg-[#EDF5F0] font-bold text-[#1B4D2E]'
                      : 'border-black/10 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-sm font-bold">{c} Passport Photos</div>
                  <div className="text-[10px] text-[#545D56]">Standard 35 × 45 mm</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 7. Resize Image Inputs */}
        {toolId === 'resize-image' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <span className="text-xs font-bold text-[#191C1A]">Custom Pixel Dimensions</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[#545D56] font-semibold">Width (px)</label>
                <input
                  type="number"
                  value={resizeWidth}
                  onChange={(e) => {
                    const w = parseInt(e.target.value) || 0;
                    setResizeWidth(w);
                    if (keepAspect && originalAspect > 0) {
                      setResizeHeight(Math.round(w / originalAspect));
                    }
                  }}
                  className="w-full mt-1 p-2 rounded-xl border border-black/15 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#545D56] font-semibold">Height (px)</label>
                <input
                  type="number"
                  value={resizeHeight}
                  onChange={(e) => {
                    const h = parseInt(e.target.value) || 0;
                    setResizeHeight(h);
                    if (keepAspect && originalAspect > 0) {
                      setResizeWidth(Math.round(h * originalAspect));
                    }
                  }}
                  className="w-full mt-1 p-2 rounded-xl border border-black/15 text-xs font-bold"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[#545D56] cursor-pointer">
              <input
                type="checkbox"
                checked={keepAspect}
                onChange={(e) => setKeepAspect(e.target.checked)}
                className="rounded-xs text-[#1B4D2E]"
              />
              <span>Maintain Aspect Ratio</span>
            </label>
          </div>
        )}

        {/* 8. Image Format Converter */}
        {toolId === 'image-format-converter' && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
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
                  onClick={() => setTargetFormat(fmt.mime as any)}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    targetFormat === fmt.mime
                      ? 'border-[#1B4D2E] bg-[#EDF5F0] font-bold text-[#1B4D2E]'
                      : 'border-black/10 bg-white text-[#545D56]'
                  }`}
                >
                  <span className="text-xs font-bold">{fmt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 9. Image Enhancement Presets */}
        {(toolId === 'image-enhancement' || toolId === 'scan-enhancement') && selectedFiles.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
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
                  onClick={() => setEnhancePreset(p.id as any)}
                  className={`p-2.5 rounded-2xl border text-left transition-all ${
                    enhancePreset === p.id
                      ? 'border-[#1B4D2E] bg-[#EDF5F0] font-bold text-[#1B4D2E]'
                      : 'border-black/10 bg-white text-[#545D56]'
                  }`}
                >
                  <div className="text-xs font-bold">{p.name}</div>
                  <div className="text-[10px] text-[#545D56]">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Process Button */}
        {(selectedFiles.length > 0 || idFrontFile) && !resultFile && jpgResults.length === 0 && (
          <button
            type="button"
            onClick={handleExecuteTool}
            disabled={isProcessing}
            className="w-full h-12 rounded-2xl bg-[#1B4D2E] hover:bg-[#25633C] text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Processing {progress > 0 ? `${progress}%` : '...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run {currentMeta.title}</span>
              </>
            )}
          </button>
        )}

        {/* Result Action Stage */}
        {resultFile && (
          <div className="p-4 rounded-3xl bg-white border border-emerald-500/30 shadow-md flex flex-col gap-3 animate-apple-card">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>{currentMeta.title} Completed Successfully!</span>
            </div>
            <div className="text-xs text-[#545D56]">
              Output: <strong className="text-[#191C1A]">{resultFile.name}</strong> (
              {(resultFile.size / (1024 * 1024)).toFixed(2)} MB)
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleDownloadResult}
                className="h-11 rounded-xl bg-[#EDF5F0] hover:bg-[#E2EFE7] border border-[#1B4D2E]/20 text-[#1B4D2E] font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSendToPrint(resultFile);
                  onClose();
                }}
                className="h-11 rounded-xl bg-[#1B4D2E] hover:bg-[#25633C] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Send to Print</span>
              </button>
            </div>
          </div>
        )}

        {/* PDF to JPG Extracted Thumbnails Display */}
        {jpgResults.length > 0 && (
          <div className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#191C1A]">
                Extracted JPG Images ({jpgResults.length} pages)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {jpgResults.map((res) => (
                <div key={res.pageNumber} className="p-2 rounded-2xl bg-[#F8FAF8] border border-black/10 flex flex-col gap-1.5">
                  <img src={res.dataUrl} alt={`Page ${res.pageNumber}`} className="w-full aspect-3/4 object-contain rounded-lg bg-white border" />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#191C1A]">Page {res.pageNumber}</span>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleJpg(res)}
                      className="text-[#1B4D2E] font-bold hover:underline"
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
