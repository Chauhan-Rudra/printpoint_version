import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  House,
  FolderSimple,
  QrCode,
  Wrench,
  UserCircle,
  Wallet,
  Plus,
  Printer,
  Receipt,
  X,
  MapPin,
  ShieldCheck,
  Lightning,
} from '@phosphor-icons/react';
import {
  NATIVE_FILE_ACCEPT_ATTR,
  validateSelectedFile,
  formatInrCurrency,
} from '../utils/kioskLogic';
import { UploadedPrintDocument } from '../types/kiosk';
import { Haptics } from '../utils/haptics';
import { useKioskWallet, formatWalletBalanceInr } from '../utils/kioskWallet';
import { useKioskSession } from '../utils/kioskSession';
import { useUserProfile } from '../utils/userProfile';
import { useKioskOrders, PrintOrderRecord } from '../utils/kioskOrders';
import { BOTTOM_NAV_ITEMS, BottomNavTab } from '../utils/navigationConfig';
import { useTranslation } from '../utils/i18n';
import { ScannerModal } from './ScannerModal';
import { AccountPage } from './AccountPage';
import { AddMoneyModal } from './AddMoneyModal';
import { ToolsDashboard } from './tools/ToolsDashboard';
import { FileBrowserStep } from './FileBrowserStep';
import { HowToPrintSection } from './HowToPrintSection';
import {
  PrintPointLogo,
  Button,
  SurfaceCard,
  SectionHeader,
  NavItem,
  Divider,
  BottomNav,
  BottomSheet,
  StatusIndicator,
  EmptyState,
  ErrorState,
  FinancialValue,
  DocumentMetaText,
  pageTransitionVariants,
  pressableTap,
  PP_EASE,
} from './ui';

interface UploadHomeStepProps {
  onFilesSelected: (files: File[]) => void;
  activeTab: 'home' | 'files' | 'tools' | 'account';
  onTabChange: (tab: 'home' | 'files' | 'tools' | 'account') => void;
  documents?: UploadedPrintDocument[];
  onAddFilesToFilesTab?: (
    files: File[]
  ) =>
    | { addedCount: number; errors: string[] }
    | Promise<{ addedCount: number; errors: string[] }>;
  onRemoveDocument?: (docId: string) => void;
  onRetryDocument?: (docId: string) => void;
  onContinueFromFiles?: () => void;
  isScannerOpen?: boolean;
  onScannerOpenChange?: (open: boolean) => void;
  isSheetOpen?: boolean;
}

const FolderUploadIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M3 6.8C3 5.58497 3.98497 4.6 5.2 4.6H9.2C9.78 4.6 10.33 4.86 10.7 5.3L11.95 6.85H18.8C20.015 6.85 21 7.83497 21 9.05V17.2C21 18.415 20.015 19.4 18.8 19.4H5.2C3.98497 19.4 3 18.415 3 17.2V6.8Z"
      fill="#194F34"
      fillOpacity="0.1"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path
      d="M12 15.8V10.4M12 10.4L9.5 12.9M12 10.4L14.5 12.9"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const formatOrderDate = (timestamp: number): string => {
  try {
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recent';
  }
};

export const UploadHomeStep: React.FC<UploadHomeStepProps> = ({
  onFilesSelected,
  activeTab,
  onTabChange,
  documents = [],
  onAddFilesToFilesTab,
  onRemoveDocument,
  onRetryDocument,
  onContinueFromFiles,
  isScannerOpen,
  onScannerOpenChange,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [showKioskModal, setShowKioskModal] = useState(false);
  const [localScannerOpen, setLocalScannerOpen] = useState(false);
  const [showRecentPrintsSheet, setShowRecentPrintsSheet] = useState(false);
  const [isHeaderAddMoneyOpen, setIsHeaderAddMoneyOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const showScannerModal = isScannerOpen !== undefined ? isScannerOpen : localScannerOpen;
  const setScannerModalOpen = (open: boolean) => {
    if (onScannerOpenChange) {
      onScannerOpenChange(open);
    } else {
      setLocalScannerOpen(open);
    }
  };

  const { balance } = useKioskWallet();
  const { session, stations } = useKioskSession();
  const { profile } = useUserProfile();
  const { orders } = useKioskOrders();

  const isAuthenticated = Boolean(profile.authenticated);
  const hasProfileImage = Boolean(profile.avatarUrl && profile.avatarUrl !== failedAvatarUrl);
  const activeStation = session.activeStation;

  const recentPrintSummary = useMemo(() => {
    if (orders.length === 0) return 'No print history yet';
    const latest = orders[0];
    return `${latest.orderNumber} · ${formatInrCurrency(latest.amountInr)} · ${latest.status}`;
  }, [orders]);

  const processFileList = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const rawFiles = Array.from(fileList);
    const seenInBatch = new Set<string>();
    const uniqueBatchFiles: File[] = [];
    for (const file of rawFiles) {
      const batchKey = `${file.name}::${file.size}::${file.lastModified}`;
      if (!seenInBatch.has(batchKey)) {
        seenInBatch.add(batchKey);
        uniqueBatchFiles.push(file);
      }
    }

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

    if (validFiles.length === 0) return;

    Haptics.selection();
    onFilesSelected(validFiles);
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(e.target.files);
    e.target.value = '';
  };

  const handleTriggerUpload = () => {
    Haptics.buttonPress();
    fileInputRef.current?.click();
  };

  const handleTriggerScan = () => {
    Haptics.buttonPress();
    setScannerModalOpen(true);
  };

  const handleNavClick = (id: BottomNavTab) => {
    Haptics.buttonPress();
    if (id === 'scan') {
      setScannerModalOpen(true);
      return;
    }
    setScannerModalOpen(false);
    onTabChange(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const navLabelForTab = (id: BottomNavTab, fallback: string) => {
    switch (id) {
      case 'home':
        return t.navHome;
      case 'files':
        return t.navFiles;
      case 'scan':
        return t.navScan;
      case 'tools':
        return t.navTools;
      case 'account':
        return t.navAccount;
      default:
        return fallback;
    }
  };

  const bottomNavItems = useMemo(
    () =>
      BOTTOM_NAV_ITEMS.map((item) => ({
        id: item.id,
        label: navLabelForTab(item.id, item.label),
        ariaLabel: item.ariaLabel,
        isPrimary: item.isPrimary,
        renderIcon: (isActive: boolean) => {
          const weight = isActive ? 'fill' : 'regular';
          const iconSize = item.isPrimary ? 21 : 22;
          switch (item.iconName) {
            case 'House':
              return <House size={iconSize} weight={weight} aria-hidden="true" />;
            case 'FolderSimple':
              return <FolderSimple size={iconSize} weight={weight} aria-hidden="true" />;
            case 'QrCode':
              return <QrCode size={iconSize} weight={weight} aria-hidden="true" />;
            case 'Wrench':
              return <Wrench size={iconSize} weight={weight} aria-hidden="true" />;
            case 'UserCircle':
              return <UserCircle size={iconSize} weight={weight} aria-hidden="true" />;
            default:
              return <House size={iconSize} weight={weight} aria-hidden="true" />;
          }
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const renderOrderStatusTone = (status: PrintOrderRecord['status']) => {
    if (status === 'Printed') return 'success' as const;
    if (
      status === 'Refunded' ||
      status === 'Queued' ||
      status === 'Claimed' ||
      status === 'Printing'
    ) {
      return 'info' as const;
    }
    return 'error' as const;
  };

  return (
    <div className="flex flex-col flex-1 w-full bg-[#F8FAF6] text-[#191C1A] overflow-x-hidden">
      {/* Hidden Accessible Native File Input */}
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

      <div className="flex flex-col flex-1 w-full pb-safe">
        {activeTab === 'tools' ? (
          <div className="flex flex-col flex-1 w-full pb-4">
            <ToolsDashboard
              onBackToHome={() => {
                onTabChange('home');
                window.scrollTo({ top: 0, behavior: 'instant' });
              }}
              onSendToPrint={(files) => onFilesSelected(files)}
            />
          </div>
        ) : activeTab === 'account' ? (
          <AccountPage
            onOpenBrowser={() => onTabChange('files')}
            onOpenScanner={handleTriggerScan}
            onBackToHome={() => {
              onTabChange('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        ) : activeTab === 'files' ? (
          <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto px-4 pt-3 flex-1 flex flex-col">
            <FileBrowserStep
              embeddedInTab={true}
              documents={documents}
              onAddFiles={
                onAddFilesToFilesTab ??
                (async (files) => {
                  onFilesSelected(files);
                  return { addedCount: files.length, errors: [] };
                })
              }
              onRemoveDocument={onRemoveDocument ?? (() => {})}
              onRetryDocument={onRetryDocument ?? (() => {})}
              onContinue={onContinueFromFiles ?? (() => {})}
              onBack={() => onTabChange('home')}
            />
          </div>
        ) : (
        <>
          {/* 1. Compact Header: Print Point Logo (Left) + Wallet Balance & Add Money + Profile (Right) */}
          <header className="sticky top-0 z-30 w-full pt-safe bg-white border-b border-[#E4EAE5]">
            <div className="h-16 px-4 flex items-center justify-between gap-2 max-w-4xl mx-auto w-full">
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                aria-label="Print Point Home"
                className="inline-flex items-center gap-2.5 text-left min-w-0 shrink-0 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <PrintPointLogo size="md" interactive={false} className="shrink-0" />
                <span className="text-[16px] sm:text-[17px] font-bold text-[#191C1A] tracking-tight leading-none whitespace-nowrap">
                  Print <span className="text-[#194F34]">Point</span>
                </span>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                {/* Compact Wallet Balance Container + Circular Add Money (+) Button */}
                <div className="h-10 rounded-full bg-[#EAF3ED] border border-[#194F34]/15 pl-3 pr-1 flex items-center gap-2 shrink-0">
                  <motion.button
                    type="button"
                    whileTap={pressableTap.whileTap}
                    onClick={() => {
                      Haptics.buttonPress();
                      setIsHeaderAddMoneyOpen(true);
                    }}
                    aria-label={`Wallet balance ${formatWalletBalanceInr(balance)}. Tap to add money`}
                    className="inline-flex items-center gap-1.5 h-full cursor-pointer"
                  >
                    <Wallet size={16} weight="fill" className="text-[#194F34] shrink-0" aria-hidden="true" />
                    <span
                      data-testid="header-wallet-balance"
                      className="text-[13.5px] font-bold tracking-tight text-[#191C1A] tabular-nums leading-none whitespace-nowrap"
                    >
                      {formatWalletBalanceInr(balance)}
                    </span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      Haptics.buttonPress();
                      setIsHeaderAddMoneyOpen(true);
                    }}
                    aria-label="Add Money to Wallet"
                    className="w-8 h-8 rounded-full bg-[#194F34] text-white flex items-center justify-center hover:bg-[#143F2A] transition-colors shrink-0 cursor-pointer"
                  >
                    <Plus size={15} weight="bold" aria-hidden="true" />
                  </motion.button>
                </div>

                {/* Circular Profile Image / Initials / Sign In */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handleNavClick('account')}
                  aria-label={
                    isAuthenticated && profile.name
                      ? `Open account for ${profile.name}`
                      : 'Sign in to Print Point Account'
                  }
                  className="w-10 h-10 rounded-full overflow-hidden border border-[#194F34]/20 bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {isAuthenticated && hasProfileImage ? (
                    <img
                      src={profile.avatarUrl}
                      alt={`${profile.name} profile`}
                      className="w-full h-full object-cover"
                      onError={() => setFailedAvatarUrl(profile.avatarUrl ?? null)}
                    />
                  ) : (
                    <span
                      data-testid="header-profile-initials"
                      className="text-[12.5px] font-bold tracking-tight text-[#194F34] select-none leading-none"
                    >
                      {isAuthenticated ? profile.initials : 'Sign In'}
                    </span>
                  )}
                </motion.button>
              </div>
            </div>
          </header>

          {/* Main Home Screen Content */}
          <motion.main
            variants={pageTransitionVariants}
            initial="initial"
            animate="animate"
            className="flex-1 w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto px-4 pt-4 pb-28"
          >
            {validationError && (
              <div className="mb-4" data-testid="file-validation-error">
                <ErrorState
                  variant="banner"
                  message={validationError}
                  onDismiss={() => setValidationError(null)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* Left / Primary Column */}
              <div className="md:col-span-7 flex flex-col gap-4">
                {/* 2. Main Printing Action Card */}
                <motion.section
                  aria-label="Ready to print?"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: PP_EASE.standard }}
                >
                  <SurfaceCard
                    padding="lg"
                    className="shadow-[0_1px_3px_rgba(25,79,52,0.05)]"
                  >
                    <div className="flex flex-col items-start">
                      <motion.div
                        animate={{ y: [0, -2, 0] }}
                        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-12 h-12 rounded-2xl bg-[#EAF3ED] border border-[#194F34]/12 text-[#194F34] flex items-center justify-center mb-3.5"
                      >
                        <FolderUploadIcon />
                      </motion.div>

                      <h1 className="text-[20px] font-bold text-[#191C1A] tracking-[-0.02em] leading-snug">
                        Ready to print?
                      </h1>
                      <p className="text-[13.5px] text-[#545D56] leading-relaxed mt-1 max-w-sm">
                        Upload your documents and print at your nearest kiosk.
                      </p>

                      <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        onClick={handleTriggerUpload}
                        leftIcon={<FolderSimple size={18} weight="bold" aria-hidden="true" />}
                        className="mt-4"
                      >
                        Start Printing
                      </Button>
                    </div>

                    {/* Subtle Connected Kiosk Action Row */}
                    <Divider className="mt-4 mb-3" />
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          Haptics.buttonPress();
                          setShowKioskModal(true);
                        }}
                        className="inline-flex items-center gap-2 min-w-0 py-1 text-left cursor-pointer group"
                      >
                        <Printer size={16} weight="regular" className="text-[#194F34] shrink-0" aria-hidden="true" />
                        <span className="text-[12.5px] font-semibold text-[#191C1A] group-hover:text-[#194F34] truncate transition-colors tabular-nums">
                          {session.connected
                            ? `${activeStation.name} · ${activeStation.status}`
                            : 'No kiosk paired · Tap Scan QR'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleTriggerScan}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 -mr-1.5 rounded-lg text-[12.5px] font-semibold text-[#194F34] hover:bg-[#EAF3ED] active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <QrCode size={15} weight="bold" aria-hidden="true" />
                        <span>Scan QR</span>
                      </button>
                    </div>
                  </SurfaceCard>
                </motion.section>

                {/* 4. Relevant Quick Actions */}
                <motion.section
                  aria-label="Quick Actions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: 0.05, ease: PP_EASE.standard }}
                  className="flex flex-col gap-2.5"
                >
                  <SectionHeader title="Quick Actions" className="px-0.5" />

                  <SurfaceCard
                    padding="none"
                    className="overflow-hidden shadow-[0_1px_2px_rgba(25,79,52,0.04)]"
                  >
                    <NavItem
                      label="My Recent Prints"
                      description={recentPrintSummary}
                      icon={<Receipt size={18} weight="regular" aria-hidden="true" />}
                      badgeText={orders.length > 0 ? `${orders.length}` : undefined}
                      onClick={() => setShowRecentPrintsSheet(true)}
                    />
                    <Divider />
                    <NavItem
                      label="Saved Documents"
                      description="Browse files ready on your library"
                      icon={<FolderSimple size={18} weight="regular" aria-hidden="true" />}
                      onClick={() => handleNavClick('files')}
                    />
                    <Divider />
                    <NavItem
                      label="PDF Tools"
                      description="Merge, split, compress, and scan utilities"
                      icon={<Wrench size={18} weight="regular" aria-hidden="true" />}
                      onClick={() => handleNavClick('tools')}
                    />
                  </SurfaceCard>
                </motion.section>
              </div>

              {/* Right / Secondary Column: 3-Step Printing Guide */}
              <motion.div
                className="md:col-span-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.08, ease: PP_EASE.standard }}
              >
                <HowToPrintSection
                  onScanClick={handleTriggerScan}
                  onUploadClick={handleTriggerUpload}
                  onPrintInfoClick={() => setShowKioskModal(true)}
                />
              </motion.div>
            </div>
          </motion.main>
        </>
      )}
      </div>

      {/* Persistent Mobile Bottom Navigation Bar: HOME | FILES | SCAN | TOOLS | ACCOUNT */}
      <BottomNav
        items={bottomNavItems}
        activeId={showScannerModal ? 'scan' : activeTab}
        onSelect={(id) => handleNavClick(id as BottomNavTab)}
      />

      {/* QR Kiosk Scanner Modal */}
      <ScannerModal
        isOpen={showScannerModal}
        onClose={() => setScannerModalOpen(false)}
        onKioskConnected={() => {
          setScannerModalOpen(false);
          onTabChange('home');
        }}
      />

      {/* Header Quick Add Money Modal */}
      <AddMoneyModal
        isOpen={isHeaderAddMoneyOpen}
        onClose={() => setIsHeaderAddMoneyOpen(false)}
        currentBalance={balance}
      />

      {/* My Recent Prints Bottom Sheet (uses real useKioskOrders data) */}
      <BottomSheet
        isOpen={showRecentPrintsSheet}
        onClose={() => setShowRecentPrintsSheet(false)}
        title="My Recent Prints"
        subtitle={
          orders.length > 0
            ? `${orders.length} recorded print ${orders.length === 1 ? 'job' : 'jobs'}`
            : undefined
        }
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setShowRecentPrintsSheet(false);
                handleNavClick('account');
              }}
            >
              Open Account
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setShowRecentPrintsSheet(false);
                handleTriggerUpload();
              }}
            >
              Start Printing
            </Button>
          </div>
        }
      >
        {orders.length === 0 ? (
          <EmptyState
            icon={<Receipt size={22} weight="duotone" aria-hidden="true" />}
            title="No recent prints"
            description="Your completed and active kiosk print jobs will appear here."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {orders.slice(0, 6).map((order) => {
              const primaryDocName =
                order.items[0]?.name || `${order.documentCount} document(s)`;
              const docTitle =
                order.documentCount > 1
                  ? `${primaryDocName} +${order.documentCount - 1} more`
                  : primaryDocName;

              return (
                <SurfaceCard key={order.id} padding="sm" className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13.5px] font-bold text-[#191C1A] truncate">
                          {docTitle}
                        </span>
                      </div>
                      <DocumentMetaText
                        parts={[
                          order.orderNumber,
                          order.kioskName,
                          `${order.totalSheets} ${order.totalSheets === 1 ? 'sheet' : 'sheets'}`,
                          formatOrderDate(order.createdAt),
                        ]}
                        className="mt-0.5"
                      />
                    </div>

                    <FinancialValue className="text-[14.5px] shrink-0">
                      {formatInrCurrency(order.amountInr)}
                    </FinancialValue>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#E4EAE5]">
                    <span className="text-[11.5px] text-[#545D56] truncate tabular-nums">
                      {order.releaseCode &&
                      (order.status === 'Queued' ||
                        order.status === 'Claimed' ||
                        order.status === 'Printing')
                        ? `PIN ${order.releaseCode} · `
                        : ''}
                      {order.colourLabel} · {order.sidesLabel} · {order.paymentMethod}
                    </span>
                    <StatusIndicator
                      tone={renderOrderStatusTone(order.status)}
                      label={order.status}
                    />
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </BottomSheet>

      {/* Kiosk Station & Switcher Modal */}
      {showKioskModal &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kiosk Station Details"
            className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
            onClick={() => setShowKioskModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white border border-[#D5DDD7] shadow-xl p-5 animate-view-enter"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] mb-3">
                <div className="flex items-center gap-2.5">
                  <PrintPointLogo size="sm" interactive={false} />
                  <div>
                    <h2 className="text-[15px] font-bold text-[#191C1A]">
                      {activeStation.name}
                    </h2>
                    <span className="text-[11.5px] text-[#194F34] font-semibold tabular-nums">
                      {activeStation.status} · {activeStation.paperTrayPercent}% paper tray
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKioskModal(false)}
                  aria-label="Close kiosk details"
                  className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <div className="flex flex-col gap-2 text-[12px] text-[#545D56] mb-4">
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF6] border border-[#E4EAE5]">
                  <MapPin size={16} weight="bold" className="text-[#194F34] shrink-0" />
                  <span>{activeStation.location}</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF6] border border-[#E4EAE5] tabular-nums">
                  <Printer size={16} weight="bold" className="text-[#194F34] shrink-0" />
                  <span>
                    A4 Duplex · B&amp;W {formatInrCurrency(activeStation.bwRateInr)}/pg · Colour{' '}
                    {formatInrCurrency(activeStation.colourRateInr)}/pg
                  </span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF6] border border-[#E4EAE5]">
                  <Lightning size={16} weight="bold" className="text-[#194F34] shrink-0" />
                  <span>Instant encrypted queue release</span>
                </div>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAF6] border border-[#E4EAE5]">
                  <ShieldCheck size={16} weight="bold" className="text-[#194F34] shrink-0" />
                  <span>Files auto-purged once printing completes</span>
                </div>
              </div>

              {/* Station Status Overview (QR required to pair) */}
              <div className="mb-4">
                <span className="text-[11px] font-bold text-[#545D56] uppercase tracking-wider block mb-1.5">
                  Nearby Stations (Scan QR on Kiosk to Pair)
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {stations.map((st) => {
                    const selected = session.connected && st.id === activeStation.id;
                    return (
                      <div
                        key={st.id}
                        className={`min-h-[38px] px-2 py-1.5 rounded-xl border text-center text-[11.5px] font-bold flex flex-col items-center justify-center ${
                          selected
                            ? 'bg-[#194F34] border-[#194F34] text-white'
                            : 'bg-[#F8FAF6] border-[#D5DDD7] text-[#545D56]'
                        }`}
                      >
                        <span>{st.name}</span>
                        <span className={`text-[9.5px] font-medium ${selected ? 'text-white/85' : 'text-[#626E65]'}`}>
                          {selected ? 'Paired' : `${st.paperTrayPercent}% tray`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setShowKioskModal(false);
                    setScannerModalOpen(true);
                  }}
                >
                  Scan QR
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setShowKioskModal(false);
                    handleTriggerUpload();
                  }}
                >
                  Start Printing
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
