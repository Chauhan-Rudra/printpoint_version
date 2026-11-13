import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  Printer,
  FolderOpen,
  FolderUp,
  HelpCircle,
  AlertCircle,
  X,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Zap,
  Home,
  FileText,
  ChevronRight,
  Sparkles,
  Wrench,
  Menu,
  House,
  ReceiptText,
  QrCode,
  ScanQrCode,
  Folder,
  Clock,
} from 'lucide-react';
import {
  House as PhosphorHouse,
  FolderSimple as PhosphorFolderSimple,
  QrCode as PhosphorQrCode,
  Wrench as PhosphorWrench,
  UserCircle as PhosphorUserCircle,
} from '@phosphor-icons/react';
import {
  NATIVE_FILE_ACCEPT_ATTR,
  validateSelectedFile,
} from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';
import { Creator4Logo } from './Creator4Logo';
import { ScannerModal } from './ScannerModal';
import { AccountPage } from './AccountPage';
import { ToolsDashboard } from './tools/ToolsDashboard';
import { KioskWalletCard } from './KioskWalletCard';
import { HowToPrintSection } from './HowToPrintSection';

interface UploadHomeStepProps {
  onFilesSelected: (files: File[]) => void;
  onOpenBrowser?: () => void;
  onOpenTools?: () => void;
  isSheetOpen?: boolean;
}

export const UploadHomeStep: React.FC<UploadHomeStepProps> = ({
  onFilesSelected,
  onOpenBrowser,
  onOpenTools,
  isSheetOpen = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'files' | 'scan' | 'tools' | 'account'>('home');

  const processFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const rawFiles = Array.from(fileList);

    // 1. Deduplicate identical files within the same selection batch while preserving order
    const seenInBatch = new Set<string>();
    const uniqueBatchFiles: File[] = [];
    for (const file of rawFiles) {
      const batchKey = `${file.name}::${file.size}::${file.lastModified}`;
      if (!seenInBatch.has(batchKey)) {
        seenInBatch.add(batchKey);
        uniqueBatchFiles.push(file);
      }
    }

    // 2. Validate file format and file size
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of uniqueBatchFiles) {
      const check = validateSelectedFile(file.name, file.size);
      if (!check.valid) {
        if (check.error) errors.push(check.error);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      Haptics.error();
      setValidationError(errors.join(' '));
    } else {
      setValidationError(null);
    }

    if (validFiles.length === 0) {
      return;
    }

    // 3. Tactile feedback & trigger upload sheet
    Haptics.selection();
    onFilesSelected(validFiles);
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    e.target.value = '';
  };

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    e.target.value = '';
  };

  const handleTriggerUpload = () => {
    Haptics.buttonPress();
    fileInputRef.current?.click();
  };

  const handleTriggerScan = () => {
    Haptics.buttonPress();
    setActiveTab('scan');
    setShowScannerModal(true);
  };

  const handleTriggerBrowser = () => {
    Haptics.buttonPress();
    setActiveTab('files');
    if (onOpenBrowser) {
      onOpenBrowser();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleTriggerOrders = () => {
    Haptics.buttonPress();
    setShowOrdersModal(true);
  };

  const handleTriggerTools = () => {
    Haptics.buttonPress();
    setActiveTab('tools');
    if (onOpenTools) {
      onOpenTools();
    }
  };

  const handleTriggerAccount = () => {
    Haptics.buttonPress();
    setActiveTab('account');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleScrollToTop = () => {
    Haptics.buttonPress();
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col flex-1 w-full bg-[#F8FAF8] text-[#191C1A]">
      {/* Hidden Accessible File Inputs */}
      <input
        ref={fileInputRef}
        id="qr-document-upload"
        data-testid="native-file-input"
        type="file"
        multiple
        accept={NATIVE_FILE_ACCEPT_ATTR}
        onChange={handleNativeInputChange}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        ref={cameraInputRef}
        id="camera-document-upload"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleCameraInputChange}
        className="sr-only"
        tabIndex={-1}
      />

      {activeTab === 'tools' ? (
        <ToolsDashboard
          onBackToHome={() => {
            setActiveTab('home');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          onSendToPrint={(files) => onFilesSelected(files)}
        />
      ) : activeTab === 'account' ? (
        <AccountPage
          onOpenOrders={() => setShowOrdersModal(true)}
          onOpenBrowser={() => handleTriggerBrowser()}
          onOpenStationDetails={() => setShowKioskModal(true)}
          onOpenHelp={() => setShowHelpModal(true)}
        />
      ) : (
        <>
          {/* 1. Header Section */}
          <header className="sticky top-0 z-40 w-full pt-safe bg-white/95 backdrop-blur-md border-b border-black/[0.05] transition-all">
        <div className="h-16 px-4 flex items-center justify-between max-w-md mx-auto w-full">
          {/* Left: Brand Logo + Brand Name */}
          <div className="flex items-center gap-3 min-w-0">
            <Creator4Logo
              size="md"
              interactive
              onClick={() => {
                Haptics.selection();
                setShowKioskModal(true);
              }}
            />

            <button
              type="button"
              onClick={() => {
                Haptics.selection();
                setShowKioskModal(true);
              }}
              className="flex items-center gap-2 text-left min-w-0 group"
              title="View Station details"
            >
              <h1 className="text-[17px] font-black text-[#191C1A] tracking-tight leading-none group-hover:text-[#1B4D2E] transition-colors truncate">
                Print <span className="text-[#1B4D2E]">Point</span>
              </h1>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            </button>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                Haptics.buttonPress();
                setShowHelpModal(true);
              }}
              aria-label="Help and instructions"
              className="w-9 h-9 rounded-xl text-[#545D56] hover:text-[#1B4D2E] hover:bg-[#1B4D2E]/5 active:scale-95 transition-all flex items-center justify-center border border-transparent hover:border-[#1B4D2E]/15"
            >
              <HelpCircle className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Home Screen Content */}
      <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-28 animate-apple-reveal">
        {/* Validation Error Banner */}
        {validationError && (
          <div
            role="alert"
            data-testid="file-validation-error"
            className="mb-4 px-3.5 py-3 rounded-2xl bg-error-container/90 border border-error/25 text-on-error-container flex items-start justify-between gap-2.5 animate-apple-card shadow-2xs"
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <span className="text-[12px] font-semibold leading-snug">
                {validationError}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setValidationError(null)}
              aria-label="Dismiss error"
              className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0 text-on-error-container"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 1. Kiosk Wallet Card */}
        <KioskWalletCard />

        {/* 2. Add Documents Card (Primary Action) */}
        <section aria-label="Add Documents" className="mb-3">
          <div
            onClick={handleTriggerUpload}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTriggerUpload();
              }
            }}
            className="group w-full rounded-2xl bg-white border border-[#1B4D2E]/15 hover:border-[#1B4D2E]/30 shadow-2xs p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer select-none active:scale-[0.99] transition-all duration-150"
          >
            {/* Clean Folder-Upload SVG Icon Container */}
            <div className="w-12 h-12 rounded-2xl bg-[#EDF5F0] border border-[#1B4D2E]/15 text-[#1B4D2E] flex items-center justify-center mb-2 group-hover:bg-[#E2EFE7] transition-colors">
              <FolderUp className="w-6 h-6 stroke-[2.2]" aria-hidden="true" />
            </div>

            {/* Heading */}
            <h2 className="text-[17px] font-bold text-[#191C1A] tracking-tight leading-tight">
              Ready to print?
            </h2>

            {/* Description */}
            <p className="text-[12.5px] text-[#545D56] leading-snug mt-1 max-w-[260px]">
              Upload documents from your phone.
            </p>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerUpload();
              }}
              className="mt-3.5 w-full max-w-[240px] h-11 rounded-xl bg-[#1B4D2E] hover:bg-[#153D24] text-white font-semibold text-[13.5px] flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98] transition-all"
            >
              <FolderUp className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
              <span>Add Documents</span>
            </button>

            {/* Supported file types footnote */}
            <span className="text-[11px] text-[#707B72] font-normal mt-2">
              PDF, Word, Excel, or images up to 50 MB
            </span>
          </div>
        </section>

        {/* 3. How to Print (3-step guide) */}
        <HowToPrintSection
          onScanClick={handleTriggerScan}
          onUploadClick={handleTriggerUpload}
          onPrintInfoClick={() => {
            Haptics.buttonPress();
            setShowKioskModal(true);
          }}
        />

        {/* 4. Compact Printer / Station Information Card */}
        <section aria-label="Printer Status" className="mb-2">
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowKioskModal(true);
            }}
            className="w-full p-3.5 rounded-2xl bg-white border border-[#1B4D2E]/10 shadow-2xs hover:border-[#1B4D2E]/25 active:scale-[0.99] transition-all flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EDF5F0] border border-[#1B4D2E]/15 text-[#1B4D2E] flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span className="text-[13px] font-bold text-[#191C1A] truncate">
                    Kiosk #04 · Ready to print
                  </span>
                </div>
                <span className="text-[11.5px] text-[#545D56] truncate mt-0.5">
                  Main Innovation Hub · Ground Floor · A4 Duplex
                </span>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-[#707B72] shrink-0" aria-hidden="true" />
          </button>
        </section>
      </div>
        </>
      )}

      {/* 5. Apple-Inspired Premium Mobile Bottom Navigation Bar (Home, Files, Scan, Tools, Account) */}
      <nav
        aria-label="Main Navigation"
        className="fixed bottom-0 left-0 right-0 z-30 pb-safe bg-white border-t border-[#E8EDE9] shadow-[0_-2px_12px_rgba(25,79,52,0.03)]"
      >
        <div className="max-w-md mx-auto h-[68px] px-1.5 sm:px-2 grid grid-cols-5 items-center">
          {/* 1. Home Tab */}
          <button
            type="button"
            onClick={handleScrollToTop}
            aria-current={activeTab === 'home' ? 'page' : undefined}
            className="group flex flex-col items-center justify-center gap-1 h-full py-1.5 rounded-xl transition-transform duration-150 active:scale-95 motion-reduce:transition-none select-none"
          >
            <div
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 motion-reduce:transition-none ${
                activeTab === 'home'
                  ? 'bg-[#EAF3ED] text-[#194F34]'
                  : 'text-[#64736A] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/40'
              }`}
            >
              <PhosphorHouse
                size={24}
                weight={activeTab === 'home' ? 'fill' : 'regular'}
                className={`transition-transform duration-200 motion-reduce:transition-none ${
                  activeTab === 'home' ? 'scale-[1.04]' : 'scale-100'
                }`}
                aria-hidden="true"
              />
            </div>
            <span
              className={`text-[12px] tracking-tight leading-none transition-colors duration-200 motion-reduce:transition-none ${
                activeTab === 'home'
                  ? 'font-semibold text-[#194F34]'
                  : 'font-medium text-[#64736A] group-hover:text-[#194F34]'
              }`}
            >
              Home
            </span>
          </button>

          {/* 2. Files Tab */}
          <button
            type="button"
            onClick={handleTriggerBrowser}
            aria-current={activeTab === 'files' ? 'page' : undefined}
            className="group flex flex-col items-center justify-center gap-1 h-full py-1.5 rounded-xl transition-transform duration-150 active:scale-95 motion-reduce:transition-none select-none"
          >
            <div
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 motion-reduce:transition-none ${
                activeTab === 'files'
                  ? 'bg-[#EAF3ED] text-[#194F34]'
                  : 'text-[#64736A] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/40'
              }`}
            >
              <PhosphorFolderSimple
                size={24}
                weight={activeTab === 'files' ? 'fill' : 'regular'}
                className={`transition-transform duration-200 motion-reduce:transition-none ${
                  activeTab === 'files' ? 'scale-[1.04]' : 'scale-100'
                }`}
                aria-hidden="true"
              />
            </div>
            <span
              className={`text-[12px] tracking-tight leading-none transition-colors duration-200 motion-reduce:transition-none ${
                activeTab === 'files'
                  ? 'font-semibold text-[#194F34]'
                  : 'font-medium text-[#64736A] group-hover:text-[#194F34]'
              }`}
            >
              Files
            </span>
          </button>

          {/* 3. Scan Tab (Exact Middle Position, Phosphor QrCode) */}
          <button
            type="button"
            onClick={handleTriggerScan}
            aria-label="Scan QR Code"
            aria-current={activeTab === 'scan' ? 'page' : undefined}
            className="group flex flex-col items-center justify-center gap-1 h-full py-1.5 rounded-xl transition-transform duration-150 active:scale-95 motion-reduce:transition-none select-none"
          >
            <div
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 motion-reduce:transition-none ${
                activeTab === 'scan'
                  ? 'bg-[#EAF3ED] text-[#194F34]'
                  : 'text-[#64736A] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/40'
              }`}
            >
              <PhosphorQrCode
                size={24}
                weight={activeTab === 'scan' ? 'fill' : 'regular'}
                className={`transition-transform duration-200 motion-reduce:transition-none ${
                  activeTab === 'scan' ? 'scale-[1.04]' : 'scale-100'
                }`}
                aria-hidden="true"
              />
            </div>
            <span
              className={`text-[12px] tracking-tight leading-none transition-colors duration-200 motion-reduce:transition-none ${
                activeTab === 'scan'
                  ? 'font-semibold text-[#194F34]'
                  : 'font-medium text-[#64736A] group-hover:text-[#194F34]'
              }`}
            >
              Scan
            </span>
          </button>

          {/* 4. Tools Tab */}
          <button
            type="button"
            onClick={handleTriggerTools}
            aria-current={activeTab === 'tools' ? 'page' : undefined}
            className="group flex flex-col items-center justify-center gap-1 h-full py-1.5 rounded-xl transition-transform duration-150 active:scale-95 motion-reduce:transition-none select-none"
          >
            <div
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 motion-reduce:transition-none ${
                activeTab === 'tools'
                  ? 'bg-[#EAF3ED] text-[#194F34]'
                  : 'text-[#64736A] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/40'
              }`}
            >
              <PhosphorWrench
                size={24}
                weight={activeTab === 'tools' ? 'fill' : 'regular'}
                className={`transition-transform duration-200 motion-reduce:transition-none ${
                  activeTab === 'tools' ? 'scale-[1.04]' : 'scale-100'
                }`}
                aria-hidden="true"
              />
            </div>
            <span
              className={`text-[12px] tracking-tight leading-none transition-colors duration-200 motion-reduce:transition-none ${
                activeTab === 'tools'
                  ? 'font-semibold text-[#194F34]'
                  : 'font-medium text-[#64736A] group-hover:text-[#194F34]'
              }`}
            >
              Tools
            </span>
          </button>

          {/* 5. Account Tab */}
          <button
            type="button"
            onClick={handleTriggerAccount}
            aria-label="Account and Session"
            aria-current={activeTab === 'account' ? 'page' : undefined}
            className="group flex flex-col items-center justify-center gap-1 h-full py-1.5 rounded-xl transition-transform duration-150 active:scale-95 motion-reduce:transition-none select-none"
          >
            <div
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 motion-reduce:transition-none ${
                activeTab === 'account'
                  ? 'bg-[#EAF3ED] text-[#194F34]'
                  : 'text-[#64736A] group-hover:text-[#194F34] group-hover:bg-[#EAF3ED]/40'
              }`}
            >
              <PhosphorUserCircle
                size={24}
                weight={activeTab === 'account' ? 'fill' : 'regular'}
                className={`transition-transform duration-200 motion-reduce:transition-none ${
                  activeTab === 'account' ? 'scale-[1.04]' : 'scale-100'
                }`}
                aria-hidden="true"
              />
            </div>
            <span
              className={`text-[12px] tracking-tight leading-none transition-colors duration-200 motion-reduce:transition-none ${
                activeTab === 'account'
                  ? 'font-semibold text-[#194F34]'
                  : 'font-medium text-[#64736A] group-hover:text-[#194F34]'
              }`}
            >
              Account
            </span>
          </button>
        </div>
      </nav>

      {/* Smart QR & Document Scanner UI Modal */}
      <ScannerModal
        isOpen={showScannerModal}
        onClose={() => {
          setShowScannerModal(false);
          setActiveTab('home');
        }}
        onUploadFromGallery={() => {
          fileInputRef.current?.click();
        }}
        onCaptureDocument={() => {
          cameraInputRef.current?.click();
        }}
        onKioskConnected={(_kioskName) => {
          setShowScannerModal(false);
          setActiveTab('home');
          handleTriggerUpload();
        }}
      />

      {/* Help Modal Dialog */}
      {showHelpModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Printing Help"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
            onClick={() => setShowHelpModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <h2 className="text-[16px] font-bold text-[#191C1A]">
                    How to print at Creator4 Lab
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  aria-label="Close help"
                  className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ol className="flex flex-col gap-3 text-[12.5px] text-[#545D56] mb-5">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#191C1A]">1. Add Documents:</strong> Tap Start Printing or Upload to select PDF, Word, Excel, or images from your phone.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#191C1A]">2. Review &amp; Options:</strong> Preview pages, remove detected blank pages with one tap, and customize copies or color mode.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#191C1A]">3. Instant Print:</strong> Pay securely and release your print job directly at Kiosk #04.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="w-full h-11 rounded-2xl bg-[#1B4D2E] text-white font-semibold text-[13.5px] shadow-xs active:scale-[0.98] transition-all"
              >
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Orders & Print History Modal Dialog */}
      {showOrdersModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Print Orders and History"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
            onClick={() => {
              setShowOrdersModal(false);
              setActiveTab('home');
            }}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card max-h-[88vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <ReceiptText className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold text-[#191C1A]">
                      Print Orders &amp; Receipts
                    </h2>
                    <span className="text-[11px] text-[#545D56]">
                      Creator4 Lab Kiosk #04
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOrdersModal(false);
                    setActiveTab('home');
                  }}
                  aria-label="Close orders"
                  className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Connected Kiosk Banner */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#F0F6F2] border border-[#1B4D2E]/15 mb-3 text-[11.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span className="font-semibold text-[#1B4D2E]">Kiosk #04 Connected</span>
                </div>
                <span className="text-[#545D56]">Session Active</span>
              </div>

              {/* Orders List */}
              <div className="flex flex-col gap-2.5 overflow-y-auto mb-4 pr-0.5">
                {/* Order 1 */}
                <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.06] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1B4D2E]">
                      Order #C4-8921
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Printed
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-[#191C1A] truncate">
                    Lab_Manual_Final.pdf
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-[#545D56] pt-1 border-t border-black/[0.04]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#707B72]" />
                      <span>Today, 10:24 AM</span>
                    </div>
                    <span className="font-bold text-[#191C1A]">₹24.00 (12 pgs)</span>
                  </div>
                </div>

                {/* Order 2 */}
                <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.06] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1B4D2E]">
                      Order #C4-8845
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Printed
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-[#191C1A] truncate">
                    Project_Report_Cover.pdf
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-[#545D56] pt-1 border-t border-black/[0.04]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#707B72]" />
                      <span>Yesterday, 3:15 PM</span>
                    </div>
                    <span className="font-bold text-[#191C1A]">₹40.00 (Colour)</span>
                  </div>
                </div>

                {/* Eco Savings Badge */}
                <div className="p-2.5 rounded-xl bg-[#EDF5F0] border border-[#1B4D2E]/15 flex items-center gap-2 text-[11px] text-[#1B4D2E]">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong>Eco savings:</strong> 0 blank pages billed · Saved 4 sheets via auto duplex.
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setShowOrdersModal(false);
                    setActiveTab('home');
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[#F2F7F4] text-[#1B4D2E] font-semibold text-[13px] active:scale-[0.98] transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOrdersModal(false);
                    setActiveTab('home');
                    handleTriggerUpload();
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[#1B4D2E] text-white font-semibold text-[13px] shadow-xs active:scale-[0.98] transition-all"
                >
                  New Print
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Tools Modal Sheet (Section 7 Destination: Tools) */}
      {showToolsModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Print Tools"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
            onClick={() => {
              setShowToolsModal(false);
              setActiveTab('home');
            }}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <Wrench className="w-4 h-4 stroke-[2.2]" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold text-[#191C1A]">
                      Print Tools &amp; Diagnostics
                    </h2>
                    <span className="text-[11px] text-[#545D56]">
                      Creator4 Lab Smart Utilities
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowToolsModal(false);
                    setActiveTab('home');
                  }}
                  aria-label="Close tools"
                  className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5 text-[12.5px] text-[#545D56] mb-5">
                <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04] flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#191C1A] block">
                      Multi-Layer Blank Page Detection
                    </span>
                    <span className="text-[11.5px] text-[#545D56] mt-0.5 block leading-snug">
                      Combines PDF.js text layer inspection, canvas pixel density analysis, and visual graphics verification to prevent false detection of written text.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04] flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#191C1A] block">
                      Paper Saver Optimizer
                    </span>
                    <span className="text-[11.5px] text-[#545D56] mt-0.5 block leading-snug">
                      Automatic exclusion of blank pages and 2-sided duplex printing reduces paper waste by up to 50%.
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04] flex items-start gap-2.5">
                  <Printer className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#191C1A] block">
                      Hardware Specs: Kiosk #04
                    </span>
                    <span className="text-[11.5px] text-[#545D56] mt-0.5 block leading-snug">
                      High-resolution 1200 DPI laser engine, auto-duplexing unit, supporting A4 standard stock up to 100gsm.
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowToolsModal(false);
                  setActiveTab('home');
                }}
                className="w-full h-11 rounded-2xl bg-[#1B4D2E] text-white font-semibold text-[13.5px] shadow-xs active:scale-[0.98] transition-all"
              >
                Close Tools
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Menu Modal Drawer (Section 7 Destination: Menu) */}
      {showMenuModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
            onClick={() => setShowMenuModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
                <div className="flex items-center gap-2.5">
                  <Creator4Logo size="sm" interactive={false} />
                  <div>
                    <h2 className="text-[15px] font-bold text-[#191C1A]">
                      Creator4 Lab Menu
                    </h2>
                    <span className="text-[11px] text-[#545D56]">
                      Preferences &amp; Navigation
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMenuModal(false)}
                  aria-label="Close menu"
                  className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Menu Actions */}
              <div className="flex flex-col gap-1.5 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuModal(false);
                    setShowHelpModal(true);
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#F8FAF8] text-left text-[13px] font-semibold text-[#191C1A] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-[#1B4D2E]" />
                    <span>How to Print Guide</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#707B72]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuModal(false);
                    setShowKioskModal(true);
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#F8FAF8] text-left text-[13px] font-semibold text-[#191C1A] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-[#1B4D2E]" />
                    <span>Station #04 Details</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#707B72]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuModal(false);
                    setShowOrdersModal(true);
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#F8FAF8] text-left text-[13px] font-semibold text-[#191C1A] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <ReceiptText className="w-4 h-4 text-[#1B4D2E]" />
                    <span>Print Orders &amp; Receipts</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#707B72]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowMenuModal(false);
                    handleTriggerBrowser();
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-[#F8FAF8] text-left text-[13px] font-semibold text-[#191C1A] flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderOpen className="w-4 h-4 text-[#1B4D2E]" />
                    <span>Document Browser</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#707B72]" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="w-full h-11 rounded-2xl bg-[#1B4D2E] text-white font-semibold text-[13.5px] shadow-xs active:scale-[0.98] transition-all"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Kiosk Information Modal Dialog */}
      {showKioskModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kiosk Details"
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
            onClick={() => setShowKioskModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
                <div className="flex items-center gap-2.5">
                  <Creator4Logo size="sm" interactive={false} />
                  <div>
                    <h2 className="text-[15px] font-bold text-[#191C1A]">
                      Creator4 Lab Kiosk #04
                    </h2>
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                      Online &amp; Ready
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKioskModal(false)}
                  aria-label="Close kiosk details"
                  className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5 text-[12.5px] text-[#545D56] mb-5">
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F8FAF8] border border-black/[0.04]">
                  <MapPin className="w-4 h-4 text-[#1B4D2E] shrink-0" />
                  <span>Main Innovation Hub · Ground Floor</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F8FAF8] border border-black/[0.04]">
                  <Printer className="w-4 h-4 text-[#1B4D2E] shrink-0" />
                  <span>A4 Laser Duplex · B&amp;W (₹2.00) &amp; Colour (₹10.00)</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F8FAF8] border border-black/[0.04]">
                  <Zap className="w-4 h-4 text-[#1B4D2E] shrink-0" />
                  <span>High-speed instant queue processing</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F8FAF8] border border-black/[0.04]">
                  <ShieldCheck className="w-4 h-4 text-[#1B4D2E] shrink-0" />
                  <span>Files automatically deleted after printing</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKioskModal(false)}
                  className="flex-1 h-11 rounded-2xl bg-[#F2F7F4] text-[#1B4D2E] font-semibold text-[13px] active:scale-[0.98] transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowKioskModal(false);
                    handleTriggerUpload();
                  }}
                  className="flex-1 h-11 rounded-2xl bg-[#1B4D2E] text-white font-semibold text-[13px] shadow-xs active:scale-[0.98] transition-all"
                >
                  Start Printing
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
