/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Wallet,
  Lifebuoy,
  UserGear,
  Translate,
  Bell,
  ShieldCheck,
  SignOut,
  CaretRight,
  Plus,
  X,
  Check,
  Clock,
  Receipt,
  CheckCircle,
  WarningCircle,
  ArrowCounterClockwise,
  SignIn,
  Printer,
  ArrowLeft,
  Info,
  PencilSimple,
  FileText,
  House,
  QrCode,
} from '@phosphor-icons/react';
import {
  clearUserProfile,
  fetchAndSyncBackendProfile,
  persistProfileToBackend,
  syncProfileFromFirebaseUser,
  useUserProfile,
} from '../utils/userProfile';
import {
  clearLocalWalletState,
  KioskWalletTransaction,
  syncWalletFromBackend,
  useKioskWallet,
} from '../utils/kioskWallet';
import { useKioskSession } from '../utils/kioskSession';
import {
  claimServerOrderRefund,
  clearLocalPrintOrders,
  PrintOrderRecord,
  syncOrdersFromBackend,
  useAppNotifications,
  useKioskOrders,
} from '../utils/kioskOrders';
import { signInWithGoogle, signOutFirebaseUser } from '../firebase';
import {
  formatInrCurrency,
  PRICE_INR_PER_PAGE_BW,
  PRICE_INR_PER_PAGE_COLOUR,
} from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';
import { AddMoneyModal } from './AddMoneyModal';
import { useTranslation } from '../utils/i18n';
import { PrintPointLogo } from './ui';

interface AccountPageProps {
  onOpenBrowser?: () => void;
  onBackToHome?: () => void;
  onOpenScanner?: () => void;
}

function getOrderPaymentBadge(order: PrintOrderRecord): {
  label: string;
  className: string;
} {
  const pStatus =
    order.paymentStatus ||
    (order.status === 'Refunded'
      ? 'refunded'
      : order.status === 'Failed'
      ? 'failed'
      : 'paid');
  if (pStatus === 'paid') {
    return {
      label: 'Paid',
      className: 'bg-[#EAF3ED] text-[#194F34] border border-[#B8D6C2]',
    };
  }
  if (pStatus === 'refunded') {
    return {
      label: 'Refunded',
      className: 'bg-[#EFF6FA] text-[#1E4E68] border border-[#CDE1EC]',
    };
  }
  if (pStatus === 'pending') {
    return {
      label: 'Payment Pending',
      className: 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
    };
  }
  return {
    label: 'Payment Failed',
    className: 'bg-[#FFF1F2] text-[#BA1A1A] border border-[#FECDD3]',
  };
}

function getOrderJobBadge(order: PrintOrderRecord): {
  label: string;
  className: string;
} {
  if (order.status === 'Queued') {
    return {
      label: 'Queued for Kiosk',
      className: 'bg-[#EFF6FA] text-[#1E4E68]',
    };
  }
  if (order.status === 'Claimed') {
    return {
      label: 'Claimed',
      className: 'bg-[#EFF6FA] text-[#1E4E68]',
    };
  }
  if (order.status === 'Printing') {
    return {
      label: 'Printing',
      className: 'bg-[#FFFBEB] text-[#92400E]',
    };
  }
  if (order.status === 'Printed') {
    return {
      label: 'Printed',
      className: 'bg-[#EAF3ED] text-[#194F34]',
    };
  }
  if (order.status === 'Refunded') {
    return {
      label: 'Refunded',
      className: 'bg-[#EFF6FA] text-[#1E4E68]',
    };
  }
  return {
    label: 'Failed',
    className: 'bg-[#FFF1F2] text-[#BA1A1A]',
  };
}

export const AccountPage: React.FC<AccountPageProps> = ({
  onBackToHome,
  onOpenScanner,
}) => {
  const { t } = useTranslation();
  const { profile, updateProfile } = useUserProfile();
  const { balance, getTransactions } = useKioskWallet();
  const { session, stations, disconnect } = useKioskSession();
  const { orders } = useKioskOrders();
  const { notifications, unreadCount, markAllRead, clearAll } = useAppNotifications();

  const transactions: KioskWalletTransaction[] = getTransactions();
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  const isAuthenticated = Boolean(profile.authenticated);

  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showStationsModal, setShowStationsModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [refundSuccessBanner, setRefundSuccessBanner] = useState<string | null>(null);
  const [refundErrorBanner, setRefundErrorBanner] = useState<string | null>(null);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);

  // Edit profile form state
  const [editName, setEditName] = useState(profile.name);
  const [editPhone, setEditPhone] = useState(profile.phone);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Google Auth sign-in state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const selectedOrder = useMemo(
    () => sortedOrders.find((o) => o.id === selectedOrderId) || null,
    [sortedOrders, selectedOrderId]
  );

  const handleOpenEditProfile = () => {
    Haptics.buttonPress();
    setEditName(profile.name);
    setEditPhone(profile.phone || '');
    setEditError(null);
    setEditSuccess(null);
    setShowEditProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);

    const trimmedName = editName.trim();
    const trimmedPhone = editPhone.trim();

    if (trimmedName.length < 2) {
      setEditError('Please enter your full name (at least 2 characters).');
      Haptics.error();
      return;
    }

    if (trimmedPhone && !/^[+\d\s()-]{7,18}$/.test(trimmedPhone)) {
      setEditError('Please enter a valid mobile number.');
      Haptics.error();
      return;
    }

    setEditSaving(true);
    try {
      await persistProfileToBackend({
        name: trimmedName,
        phone: trimmedPhone,
      });
      Haptics.success();
      setEditSuccess('Profile details saved.');
      window.setTimeout(() => {
        setEditSaving(false);
        setShowEditProfile(false);
        setEditSuccess(null);
      }, 450);
    } catch {
      setEditSaving(false);
      setEditError('Could not save profile changes. Please try again.');
      Haptics.error();
    }
  };

  const handleToggleNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.selection();
    updateProfile({ notificationsEnabled: !profile.notificationsEnabled });
  };

  const handleSelectLanguage = (lang: 'English' | 'ગુજરાતી' | 'हिन्दी') => {
    Haptics.selection();
    updateProfile({ language: lang });
    setShowLanguageModal(false);
  };

  const handleConfirmSignOut = async () => {
    Haptics.buttonPress();
    try {
      await signOutFirebaseUser();
    } catch {
      // ignore Firebase signOut errors and clear local session anyway
    }
    disconnect();
    clearLocalWalletState();
    clearLocalPrintOrders();
    clearUserProfile();
    setShowSignOutConfirm(false);
    setSignInError(null);
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    Haptics.buttonPress();
    setSignInError(null);
    setIsSigningIn(true);
    try {
      const user = await signInWithGoogle();
      syncProfileFromFirebaseUser(user);
      await Promise.all([
        fetchAndSyncBackendProfile(),
        syncWalletFromBackend(),
        syncOrdersFromBackend(),
      ]);
      Haptics.success();
    } catch (err) {
      Haptics.error();
      const message =
        err instanceof Error
          ? err.message
          : 'Google sign-in failed. Please allow popups and try again.';
      setSignInError(message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleClaimRefund = async (orderId: string, orderNumber: string, amount: number) => {
    if (refundingOrderId) return;
    setRefundErrorBanner(null);
    setRefundSuccessBanner(null);
    setRefundingOrderId(orderId);
    try {
      const res = await claimServerOrderRefund(orderId);
      if (res.success) {
        Haptics.success();
        setRefundSuccessBanner(
          `${formatInrCurrency(amount)} refunded to your wallet for order ${orderNumber}.`
        );
        window.setTimeout(() => setRefundSuccessBanner(null), 4500);
      } else {
        Haptics.error();
        setRefundErrorBanner(res.error || 'Could not process refund right now.');
      }
    } finally {
      setRefundingOrderId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-md mx-auto flex flex-col pt-5 pb-28 px-4 animate-view-enter overflow-x-hidden">
        <div className="rounded-2xl bg-white border border-[#E2E7E1] p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <PrintPointLogo
              size="md"
              interactive={Boolean(onBackToHome)}
              onClick={onBackToHome}
            />
            <div className="min-w-0">
              <h1 className="text-[18px] font-bold text-[#191C1A] leading-tight">
                Sign in to Print Point
              </h1>
              <p className="text-[12px] text-[#545D56] mt-0.5 leading-snug">
                Authenticate with your Google account to sync your wallet, uploaded documents, and kiosk print orders.
              </p>
            </div>
          </div>

          {signInError && (
            <div className="text-[12px] text-[#BA1A1A] bg-[#FFF1F2] p-3 rounded-xl border border-[#FECDD3] font-medium flex items-start gap-2">
              <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
              <span>{signInError}</span>
            </div>
          )}

          <button
            type="button"
            disabled={isSigningIn}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[48px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] disabled:opacity-60 text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:cursor-wait"
          >
            <SignIn size={18} weight="bold" aria-hidden="true" />
            <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>

          {onBackToHome && (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={onBackToHome}
              className="w-full min-h-[44px] rounded-xl bg-white border border-[#E2E7E1] text-[#191C1A] font-semibold text-[13px] flex items-center justify-center gap-1.5 hover:bg-[#F3F4F0] transition-colors cursor-pointer"
            >
              <House size={16} weight="regular" aria-hidden="true" />
              <span>Return to Home</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md md:max-w-2xl mx-auto flex flex-col pt-3 pb-28 pb-safe px-4 animate-view-enter overflow-x-hidden">
      {/* 1. Page Header */}
      <header className="mb-4 pt-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBackToHome && (
            <PrintPointLogo
              size="sm"
              interactive
              onClick={onBackToHome}
              className="shrink-0"
            />
          )}
          <h1 className="pp-text-page-heading truncate">{t.accountTitle}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            Haptics.buttonPress();
            setShowStationsModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#EAF3ED] text-[#194F34] text-[11.5px] font-semibold shrink-0 cursor-pointer active:scale-95 transition-transform"
        >
          <MapPin size={13} weight="fill" aria-hidden="true" />
          <span className="tabular-nums truncate max-w-[120px]">
            {session.connected ? session.activeStation.name : 'No Kiosk'}
          </span>
        </button>
      </header>

      {/* 2. Compact Profile Section */}
      <section aria-label="User Profile" className="mb-4">
        <div className="w-full rounded-2xl bg-white border border-[#E2E7E1] p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {profile.avatarUrl && !avatarLoadError ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                onError={() => setAvatarLoadError(true)}
                className="w-12 h-12 rounded-full object-cover border border-[#E2E7E1] shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#194F34] text-white flex items-center justify-center font-bold text-[16px] tracking-tight shrink-0 select-none">
                {profile.initials}
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <h2 className="text-[16px] font-bold text-[#191C1A] tracking-tight leading-snug truncate">
                {profile.name}
              </h2>
              <p className="text-[12.5px] text-[#545D56] leading-tight truncate mt-0.5">
                {profile.email}
              </p>
              {profile.phone && (
                <p className="text-[11.5px] text-[#626E65] leading-tight truncate mt-0.5 tabular-nums">
                  {profile.phone}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenEditProfile}
            className="min-h-[40px] px-3 rounded-xl bg-[#EAF3ED] hover:bg-[#DDECE2] text-[#194F34] text-[12px] font-semibold shrink-0 inline-flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <PencilSimple size={14} weight="bold" aria-hidden="true" />
            <span>Edit Profile</span>
          </button>
        </div>
      </section>

      {/* 3. Wallet & Orders Group */}
      <section aria-label="Orders and Wallet" className="mb-5">
        <h2 className="text-[11.5px] font-bold text-[#545D56] uppercase tracking-wider mb-2 px-1">
          Orders &amp; Wallet
        </h2>
        <div className="bg-white rounded-2xl border border-[#E2E7E1] divide-y divide-[#E2E7E1] overflow-hidden">
          {/* Wallet & Transactions */}
          <div className="p-3.5 flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => {
                Haptics.buttonPress();
                setShowWalletModal(true);
              }}
              className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Wallet size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  Wallet &amp; Transactions
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate tabular-nums">
                  Balance <strong className="text-[#194F34]">{formatInrCurrency(balance)}</strong>{' '}
                  · {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
            </button>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  setIsAddMoneyOpen(true);
                }}
                className="min-h-[36px] px-2.5 rounded-lg bg-[#194F34] hover:bg-[#143F2A] text-white text-[11.5px] font-semibold inline-flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <Plus size={12} weight="bold" aria-hidden="true" />
                <span>{t.addMoney}</span>
              </button>
              <button
                type="button"
                aria-label="Open wallet transactions"
                onClick={() => {
                  Haptics.buttonPress();
                  setShowWalletModal(true);
                }}
                className="w-8 h-9 flex items-center justify-center text-[#626E65] hover:text-[#191C1A] cursor-pointer"
              >
                <CaretRight size={17} weight="bold" />
              </button>
            </div>
          </div>

          {/* My Orders */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setSelectedOrderId(null);
              setShowOrdersModal(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/40 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Receipt size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  {t.myOrders}
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate tabular-nums">
                  {sortedOrders.length === 0
                    ? 'No print orders recorded yet'
                    : `${sortedOrders.length} ${
                        sortedOrders.length === 1 ? 'order' : 'orders'
                      } · Latest ${sortedOrders[0].orderNumber}`}
                </span>
              </div>
            </div>
            <CaretRight size={17} weight="bold" className="text-[#626E65] shrink-0" />
          </button>

          {/* Kiosk Station */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowStationsModal(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/40 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Printer size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  Paired Kiosk Station
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate">
                  {session.connected
                    ? `${session.activeStation.name} · ${session.activeStation.status}`
                    : 'Not paired · Select or scan a kiosk'}
                </span>
              </div>
            </div>
            <CaretRight size={17} weight="bold" className="text-[#626E65] shrink-0" />
          </button>
        </div>
      </section>

      {/* 4. Preferences Group */}
      <section aria-label="Preferences" className="mb-5">
        <h2 className="text-[11.5px] font-bold text-[#545D56] uppercase tracking-wider mb-2 px-1">
          Preferences
        </h2>
        <div className="bg-white rounded-2xl border border-[#E2E7E1] divide-y divide-[#E2E7E1] overflow-hidden">
          {/* Language */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowLanguageModal(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/40 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Translate size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  {t.language}
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate">
                  English, ગુજરાતી, हिन्दी
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[#626E65] shrink-0">
              <span className="text-[12.5px] font-semibold text-[#194F34]">
                {profile.language}
              </span>
              <CaretRight size={17} weight="bold" />
            </div>
          </button>

          {/* In-App Notifications */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              Haptics.buttonPress();
              setShowNotificationsModal(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowNotificationsModal(true);
              }
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Bell size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                    {t.notifications}
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#194F34] text-white text-[10px] font-bold tabular-nums leading-none">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate">
                  In-app print &amp; refund alerts ({profile.notificationsEnabled ? 'On' : 'Off'})
                </span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.notificationsEnabled}
              aria-label="Toggle in-app print notifications"
              onClick={handleToggleNotifications}
              className={`w-11 h-6.5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 shrink-0 ${
                profile.notificationsEnabled ? 'bg-[#194F34]' : 'bg-[#D1D9D4]'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                  profile.notificationsEnabled ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Privacy & Security */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowPrivacyModal(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/40 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <ShieldCheck size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  Privacy &amp; Security
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate">
                  On-device processing &amp; kiosk pairing
                </span>
              </div>
            </div>
            <CaretRight size={17} weight="bold" className="text-[#626E65] shrink-0" />
          </button>
        </div>
      </section>

      {/* 5. Support & Session Group */}
      <section aria-label="Support and Session">
        <h2 className="text-[11.5px] font-bold text-[#545D56] uppercase tracking-wider mb-2 px-1">
          Support &amp; Session
        </h2>
        <div className="bg-white rounded-2xl border border-[#E2E7E1] divide-y divide-[#E2E7E1] overflow-hidden">
          {/* Help & Support */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowHelpModal(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/40 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <Lifebuoy size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#191C1A] leading-tight">
                  {t.helpSupport}
                </span>
                <span className="text-[12px] text-[#545D56] leading-tight mt-0.5 truncate">
                  Print rates, FAQs, and refund rules
                </span>
              </div>
            </div>
            <CaretRight size={17} weight="bold" className="text-[#626E65] shrink-0" />
          </button>

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowSignOutConfirm(true);
            }}
            className="w-full min-h-[60px] p-3.5 flex items-center justify-between gap-3 hover:bg-[#FFF1F2]/70 active:bg-[#FFF1F2] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FFF1F2] text-[#BA1A1A] flex items-center justify-center shrink-0">
                <SignOut size={20} weight="regular" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#BA1A1A] leading-tight">
                  {t.signOut}
                </span>
                <span className="text-[12px] text-[#BA1A1A]/80 leading-tight mt-0.5 truncate">
                  End your session while keeping orders &amp; wallet
                </span>
              </div>
            </div>
            <CaretRight size={17} weight="bold" className="text-[#BA1A1A] shrink-0" />
          </button>
        </div>
      </section>

      {/* Add Money Modal */}
      <AddMoneyModal
        isOpen={isAddMoneyOpen}
        onClose={() => setIsAddMoneyOpen(false)}
        currentBalance={balance}
      />

      {/* MODAL: My Orders (List + Order Detail) */}
      {showOrdersModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="My Orders"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowOrdersModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {selectedOrder ? (
                  <button
                    type="button"
                    onClick={() => setSelectedOrderId(null)}
                    aria-label="Back to orders list"
                    className="w-9 h-9 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] text-[#194F34] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <ArrowLeft size={16} weight="bold" />
                  </button>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                    <Receipt size={18} weight="bold" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-[#191C1A] truncate">
                    {selectedOrder ? `Order ${selectedOrder.orderNumber}` : t.myOrders}
                  </h3>
                  <span className="text-[11px] text-[#545D56] block truncate">
                    {selectedOrder
                      ? `${selectedOrder.kioskName} · ${new Date(
                          selectedOrder.createdAt
                        ).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Newest orders shown first'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOrdersModal(false)}
                aria-label="Close orders"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {refundSuccessBanner && (
              <div className="mb-3 p-3 rounded-xl bg-[#EAF3ED] border border-[#B8D6C2] text-[12px] font-semibold text-[#194F34] flex items-center gap-2">
                <CheckCircle size={16} weight="fill" className="shrink-0" />
                <span>{refundSuccessBanner}</span>
              </div>
            )}

            {refundErrorBanner && (
              <div className="mb-3 p-3 rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[12px] font-semibold text-[#BA1A1A] flex items-center gap-2">
                <WarningCircle size={16} weight="fill" className="shrink-0" />
                <span>{refundErrorBanner}</span>
              </div>
            )}

            {selectedOrder ? (
              <div className="flex flex-col gap-3 overflow-y-auto mb-4 flex-1 pr-0.5">
                {selectedOrder.releaseCode &&
                  (selectedOrder.status === 'Queued' ||
                    selectedOrder.status === 'Claimed' ||
                    selectedOrder.status === 'Printing') && (
                    <div className="p-3.5 rounded-xl bg-[#EAF3ED] border border-[#B8D6C2] flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#194F34] block">
                          Kiosk Release PIN
                        </span>
                        <span className="text-[11.5px] text-[#545D56] block mt-0.5">
                          Enter this 4-digit PIN on {selectedOrder.kioskName}
                        </span>
                      </div>
                      <span className="text-[22px] font-extrabold font-mono tracking-[0.18em] text-[#194F34] tabular-nums bg-white px-3 py-1 rounded-lg border border-[#B8D6C2]">
                        {selectedOrder.releaseCode}
                      </span>
                    </div>
                  )}

                <div className="p-3.5 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] flex flex-col gap-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E2E7E1]">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        getOrderPaymentBadge(selectedOrder).className
                      }`}
                    >
                      {getOrderPaymentBadge(selectedOrder).label}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        getOrderJobBadge(selectedOrder).className
                      }`}
                    >
                      Print: {getOrderJobBadge(selectedOrder).label}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#545D56]">Order ID</span>
                    <span className="font-bold text-[#191C1A] tabular-nums">
                      {selectedOrder.orderNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#545D56]">Kiosk Station</span>
                    <span className="font-semibold text-[#191C1A]">
                      {selectedOrder.kioskName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#545D56]">Documents · Pages</span>
                    <span className="font-semibold text-[#191C1A] tabular-nums">
                      {selectedOrder.documentCount} files · {selectedOrder.totalPages} pages (
                      {selectedOrder.totalSheets} sheets)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#545D56]">Settings</span>
                    <span className="font-semibold text-[#191C1A]">
                      {selectedOrder.colourLabel} · {selectedOrder.sidesLabel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#545D56]">Payment Method</span>
                    <span className="font-semibold text-[#191C1A]">
                      {selectedOrder.paymentMethod}
                    </span>
                  </div>
                  {selectedOrder.paymentReferenceId && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#545D56]">Payment Ref</span>
                      <span className="font-mono text-[11px] font-semibold text-[#191C1A] truncate max-w-[180px]">
                        {selectedOrder.paymentReferenceId}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-[#E2E7E1] font-bold">
                    <span className="text-[#191C1A]">Total Amount</span>
                    <span className="text-[#194F34] text-[15px] tabular-nums">
                      {formatInrCurrency(selectedOrder.amountInr)}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11.5px] font-bold text-[#545D56] uppercase tracking-wider block mb-1.5">
                    Documents Printed
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {selectedOrder.items.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="p-2.5 rounded-xl bg-white border border-[#E2E7E1] flex items-center justify-between gap-2 text-[12px]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={16} weight="duotone" className="text-[#194F34] shrink-0" />
                          <span className="font-semibold text-[#191C1A] truncate">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#545D56] tabular-nums shrink-0">
                          {item.pages}p · {item.copies}× ·{' '}
                          {item.colourMode === 'colour' ? 'Colour' : 'B&W'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrder.status === 'Failed' && (
                  <button
                    type="button"
                    disabled={refundingOrderId === selectedOrder.id}
                    onClick={() =>
                      handleClaimRefund(
                        selectedOrder.id,
                        selectedOrder.orderNumber,
                        selectedOrder.amountInr
                      )
                    }
                    className="w-full min-h-[44px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] disabled:opacity-55 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowCounterClockwise
                      size={14}
                      weight="bold"
                      className={refundingOrderId === selectedOrder.id ? 'animate-spin' : ''}
                    />
                    <span>
                      {refundingOrderId === selectedOrder.id
                        ? 'Processing Refund...'
                        : `Claim ${formatInrCurrency(selectedOrder.amountInr)} Wallet Refund`}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 overflow-y-auto mb-4 pr-0.5 flex-1">
                {sortedOrders.length === 0 ? (
                  <div className="py-10 text-center">
                    <Receipt size={30} weight="duotone" className="text-[#626E65] mx-auto mb-2" />
                    <p className="text-[13px] font-bold text-[#191C1A]">No print orders yet</p>
                    <p className="text-[12px] text-[#545D56] mt-1 max-w-[240px] mx-auto">
                      Once you pay for and release a print job at a kiosk, your receipt appears here.
                    </p>
                  </div>
                ) : (
                  sortedOrders.map((order) => {
                    const payBadge = getOrderPaymentBadge(order);
                    const jobBadge = getOrderJobBadge(order);
                    const showPin =
                      Boolean(order.releaseCode) &&
                      (order.status === 'Queued' ||
                        order.status === 'Claimed' ||
                        order.status === 'Printing');
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          Haptics.buttonPress();
                          setSelectedOrderId(order.id);
                        }}
                        className="w-full p-3.5 rounded-xl bg-[#F8FAF6] hover:bg-[#F3F4F0] border border-[#E2E7E1] flex flex-col gap-2 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-bold text-[#194F34] tabular-nums">
                            {order.orderNumber} · {order.kioskName}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${payBadge.className}`}
                            >
                              {payBadge.label}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${jobBadge.className}`}
                            >
                              {jobBadge.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-bold text-[#191C1A] truncate">
                            {order.items.map((item) => item.name).join(', ')}
                          </div>
                          {showPin && (
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#EAF3ED] text-[#194F34] border border-[#B8D6C2] shrink-0 tabular-nums">
                              PIN {order.releaseCode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11.5px] text-[#545D56] pt-1.5 border-t border-[#E2E7E1] tabular-nums">
                          <span>
                            {new Date(order.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            · {order.documentCount} {order.documentCount === 1 ? 'doc' : 'docs'} ·{' '}
                            {order.totalPages}p
                          </span>
                          <span className="font-bold text-[#191C1A]">
                            {formatInrCurrency(order.amountInr)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (selectedOrder) {
                  setSelectedOrderId(null);
                } else {
                  setShowOrdersModal(false);
                }
              }}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-[13px] active:scale-98 shrink-0 cursor-pointer"
            >
              {selectedOrder ? 'Back to All Orders' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Wallet Details & Transaction History */}
      {showWalletModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Print Point Wallet Details"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowWalletModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <Wallet size={18} weight="bold" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#191C1A]">{t.walletTitle}</h3>
                  <span className="text-[11px] text-[#545D56]">
                    Top-ups &amp; printing payment ledger
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletModal(false)}
                aria-label="Close wallet details"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#194F34] text-white mb-3">
              <span className="text-[11.5px] font-medium text-white/80 block">
                Available Balance
              </span>
              <div className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">
                {formatInrCurrency(balance)}
              </div>
              <p className="text-[11px] text-white/75 mt-1">
                Used only with confirmation when paying for print jobs.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setShowWalletModal(false);
                  setIsAddMoneyOpen(true);
                }}
                className="min-h-[42px] rounded-xl bg-[#EAF3ED] hover:bg-[#DDECE2] text-[#194F34] font-bold text-[12.5px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                <span>{t.addMoney}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWalletModal(false);
                  setSelectedOrderId(null);
                  setShowOrdersModal(true);
                }}
                className="min-h-[42px] rounded-xl bg-[#F8FAF6] hover:bg-[#F0F3EE] border border-[#E2E7E1] text-[#191C1A] font-semibold text-[12.5px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Receipt size={14} weight="bold" className="text-[#194F34]" aria-hidden="true" />
                <span>Print Orders</span>
              </button>
            </div>

            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-bold text-[#191C1A]">
                Wallet Transactions
              </span>
              <span className="text-[11px] text-[#545D56] tabular-nums">
                {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto mb-4 pr-0.5 flex-1 max-h-60">
              {transactions.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#545D56]">
                  No wallet transactions recorded yet.
                </div>
              ) : (
                transactions.slice(0, 20).map((tx: KioskWalletTransaction) => {
                  const txStatus = tx.status || 'completed';
                  const categoryLabel =
                    tx.type === 'credit'
                      ? tx.paymentMethod === 'Instant Refund'
                        ? 'Refund'
                        : 'Top-Up'
                      : 'Print Payment';
                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1] flex flex-col gap-1.5 text-[12px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                tx.type === 'credit'
                                  ? 'bg-[#EAF3ED] text-[#194F34]'
                                  : 'bg-[#E7E9E5] text-[#191C1A]'
                              }`}
                            >
                              {categoryLabel}
                            </span>
                            <span
                              className={`text-[10px] font-semibold capitalize px-1.5 py-0.5 rounded ${
                                txStatus === 'completed'
                                  ? 'bg-white border border-[#E2E7E1] text-[#194F34]'
                                  : txStatus === 'pending'
                                  ? 'bg-[#FFFBEB] text-[#92400E]'
                                  : 'bg-[#FFF1F2] text-[#BA1A1A]'
                              }`}
                            >
                              {txStatus}
                            </span>
                          </div>
                          <span className="font-semibold text-[#191C1A] block truncate mt-1">
                            {tx.description}
                          </span>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span
                            className={`font-bold block ${
                              tx.type === 'credit' ? 'text-[#194F34]' : 'text-[#191C1A]'
                            }`}
                          >
                            {tx.type === 'credit' ? '+' : '-'}
                            {formatInrCurrency(tx.amount)}
                          </span>
                          <span className="text-[10.5px] text-[#545D56]">
                            Bal {formatInrCurrency(tx.balanceAfter)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#545D56] pt-1 border-t border-[#E2E7E1]/70 tabular-nums">
                        <span className="truncate">
                          {new Date(tx.timestamp).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
                        </span>
                        {tx.referenceId && (
                          <span className="font-mono text-[10px] truncate max-w-[120px]">
                            Ref: {tx.referenceId}
                          </span>
                        )}
                      </div>

                      {tx.orderNumber && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              Haptics.buttonPress();
                              setShowWalletModal(false);
                              setSelectedOrderId(tx.orderId || null);
                              setShowOrdersModal(true);
                            }}
                            className="text-[11px] font-bold text-[#194F34] hover:underline cursor-pointer"
                          >
                            View Order #{tx.orderNumber} →
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowWalletModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] active:scale-98 shrink-0 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Notifications Inbox */}
      {showNotificationsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowNotificationsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <Bell size={18} weight="bold" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#191C1A]">{t.notifications}</h3>
                  <span className="text-[11px] text-[#545D56] tabular-nums">
                    {unreadCount} unread · Alerts {profile.notificationsEnabled ? 'enabled' : 'muted'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                aria-label="Close notifications"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {notifications.length > 0 && (
              <div className="flex items-center justify-end gap-3 mb-2 text-xs font-semibold">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRead()}
                    className="text-[#194F34] hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearAll()}
                  className="text-[#545D56] hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 overflow-y-auto mb-4 flex-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <Bell size={28} weight="duotone" className="text-[#626E65] mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#191C1A]">All caught up</p>
                  <p className="text-[11.5px] text-[#545D56] mt-1">
                    Print status updates, wallet credits, and refund alerts appear here.
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-left ${
                      n.read
                        ? 'bg-[#F8FAF6] border-[#E2E7E1]'
                        : 'bg-[#EAF3ED]/55 border-[#194F34]/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-bold text-[#191C1A]">{n.title}</span>
                      <span className="text-[10.5px] text-[#545D56] tabular-nums shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#545D56] mt-0.5 leading-snug">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowNotificationsModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] active:scale-98 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Paired Kiosk Stations */}
      {showStationsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Available Print Point Kiosks"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowStationsModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <Printer size={18} weight="bold" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#191C1A]">Print Point Stations</h3>
                  <span className="text-[11px] text-[#545D56]">
                    Switch kiosk or inspect live paper status
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStationsModal(false)}
                aria-label="Close stations"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 mb-4">
              {stations.map((st) => {
                const isActive = session.connected && st.id === session.activeStation.id;
                return (
                  <div
                    key={st.id}
                    className={`w-full p-3.5 rounded-xl border text-left ${
                      isActive
                        ? 'border-[#194F34] bg-[#EAF3ED]/60'
                        : 'border-[#E2E7E1] bg-[#F8FAF6]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-bold text-[#191C1A]">{st.name}</span>
                      <span
                        className={`text-[11px] font-bold tabular-nums ${
                          isActive || st.status === 'Ready' ? 'text-[#194F34]' : 'text-[#92400E]'
                        }`}
                      >
                        {isActive ? 'Connected via QR' : st.distanceLabel} · {st.paperTrayPercent}% tray
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#545D56] mt-0.5">{st.location}</p>
                    <p className="text-[11px] text-[#545D56] mt-1 tabular-nums">
                      B&amp;W {formatInrCurrency(st.bwRateInr)}/pg · Colour{' '}
                      {formatInrCurrency(st.colourRateInr)}/pg · Duplex
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              {onOpenScanner && (
                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    setShowStationsModal(false);
                    onOpenScanner();
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-[#194F34] hover:bg-[#143F2A] text-white font-semibold text-[13px] inline-flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <QrCode size={16} weight="bold" aria-hidden="true" />
                  <span>{session.connected ? 'Pair Different Kiosk via QR' : 'Scan Kiosk QR'}</span>
                </button>
              )}

              {session.connected && (
                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    disconnect();
                  }}
                  className="w-full min-h-[40px] rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] font-semibold text-[12.5px] cursor-pointer"
                >
                  Disconnect Paired Kiosk
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowStationsModal(false)}
                className="w-full min-h-[42px] rounded-xl border border-[#E2E7E1] text-[#191C1A] font-semibold text-[13px] hover:bg-black/5 active:scale-98 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Profile (Supported Fields Only) */}
      {showEditProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Profile"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => !editSaving && setShowEditProfile(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <UserGear size={18} weight="bold" aria-hidden="true" />
                </div>
                <h3 className="text-[15.5px] font-bold text-[#191C1A]">Edit Profile</h3>
              </div>
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setShowEditProfile(false)}
                aria-label="Close edit profile"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              <div>
                <label className="text-[12px] font-semibold text-[#191C1A] block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  disabled={editSaving}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E7E1] focus:border-[#194F34] focus:outline-none text-[13.5px] bg-[#F8FAF6] focus:bg-white"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-[#191C1A] block mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={editPhone}
                  disabled={editSaving}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E7E1] focus:border-[#194F34] focus:outline-none text-[13.5px] tabular-nums bg-[#F8FAF6] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-[#545D56] block mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  readOnly
                  disabled
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E2E7E1] bg-[#F3F4F0] text-[#545D56] text-[13px] cursor-not-allowed"
                />
                <span className="text-[11px] text-[#626E65] block mt-1">
                  Email changes require verified authentication backend support.
                </span>
              </div>

              {editError && (
                <div className="text-[12px] text-[#BA1A1A] bg-[#FFF1F2] p-2.5 rounded-xl border border-[#FECDD3] font-medium">
                  {editError}
                </div>
              )}

              {editSuccess && (
                <div className="text-[12px] text-[#194F34] bg-[#EAF3ED] p-2.5 rounded-xl border border-[#B8D6C2] font-semibold flex items-center gap-1.5">
                  <CheckCircle size={15} weight="fill" />
                  <span>{editSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 mt-1">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => setShowEditProfile(false)}
                  className="min-h-[44px] rounded-xl border border-[#E2E7E1] text-[#191C1A] font-semibold text-[13px] hover:bg-black/5 active:scale-98 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] hover:bg-[#143F2A] active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Language Selection (Supported Languages Only) */}
      {showLanguageModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select Language"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowLanguageModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <Translate size={18} weight="bold" aria-hidden="true" />
                </div>
                <h3 className="text-[15.5px] font-bold text-[#191C1A]">Select Language</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLanguageModal(false)}
                aria-label="Close language modal"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-2 my-2">
              {(['English', 'ગુજરાતી', 'हिन्दी'] as const).map((lang) => {
                const isSelected = profile.language === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleSelectLanguage(lang)}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#194F34] bg-[#EAF3ED]/70 text-[#194F34]'
                        : 'border-[#E2E7E1] hover:bg-[#F8FAF6] text-[#191C1A]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold">{lang}</span>
                      <span className="text-[11px] text-[#545D56]">
                        {lang === 'English' && 'Standard Interface'}
                        {lang === 'ગુજરાતી' && 'Gujarati · પ્રિન્ટ પોઇન્ટ ગુજરાતીમાં'}
                        {lang === 'हिन्दी' && 'Hindi · प्रिंट पॉइंट हिंदी में'}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[#194F34] text-white flex items-center justify-center">
                        <Check size={14} weight="bold" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Help & Support (Only Existing Info, No Fabricated Contacts) */}
      {showHelpModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Help and Support"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <Lifebuoy size={18} weight="bold" aria-hidden="true" />
                </div>
                <h3 className="text-[15.5px] font-bold text-[#191C1A]">{t.helpSupport}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close help modal"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-[12px] text-[#545D56] mb-4">
              <div className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1]">
                <strong className="text-[#191C1A] block text-[12.5px] mb-0.5 tabular-nums">
                  Standard Print Rates
                </strong>
                Black &amp; White: {formatInrCurrency(PRICE_INR_PER_PAGE_BW)}/page · Colour:{' '}
                {formatInrCurrency(PRICE_INR_PER_PAGE_COLOUR)}/page. Double-sided reduces paper sheets.
              </div>
              <div className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1]">
                <strong className="text-[#191C1A] block text-[12.5px] mb-0.5">
                  Failed Job Refunds
                </strong>
                If a paper jam interrupts printing, claim an instant wallet refund directly from My Orders.
              </div>
              <div className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1]">
                <strong className="text-[#191C1A] block text-[12.5px] mb-0.5">
                  Supported Formats
                </strong>
                PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint, JPG/PNG, TXT, and CSV up to 100 MB.
              </div>
              <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] flex items-start gap-2">
                <Info size={15} weight="fill" className="shrink-0 mt-0.5 text-[#D97706]" />
                <span>
                  Direct support email, phone, and ticketing channels are not configured in this build.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] active:scale-98 cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Privacy & Security */}
      {showPrivacyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy and Security"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowPrivacyModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-[#E2E7E1] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E7E1] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <ShieldCheck size={18} weight="bold" aria-hidden="true" />
                </div>
                <h3 className="text-[15.5px] font-bold text-[#191C1A]">Privacy &amp; Security</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                aria-label="Close privacy modal"
                className="w-9 h-9 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center cursor-pointer"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-[12px] text-[#545D56] mb-4">
              <div className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1]">
                <strong className="text-[#191C1A] block text-[12.5px] mb-0.5">
                  On-Device Document Editing
                </strong>
                PDF page editing and blank-page detection run locally in your browser before print release.
              </div>
              <div className="p-3 rounded-xl bg-[#F8FAF6] border border-[#E2E7E1]">
                <strong className="text-[#191C1A] block text-[12.5px] mb-0.5">
                  Kiosk Session Control
                </strong>
                {session.connected
                  ? `Currently paired with ${session.activeStation.name}. You can disconnect anytime.`
                  : 'No kiosk is currently paired with this browser.'}
              </div>
              {session.connected && (
                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    disconnect();
                  }}
                  className="w-full min-h-[40px] rounded-xl bg-[#FFF1F2] border border-[#FECDD3] text-[#BA1A1A] text-xs font-semibold cursor-pointer"
                >
                  Disconnect Paired Kiosk ({session.activeStation.name})
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowPrivacyModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] active:scale-98 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Sign Out Confirmation */}
      {showSignOutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Sign Out"
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 animate-backdrop-fade"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white border border-[#FECDD3] shadow-xl p-5 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFF1F2] text-[#BA1A1A] flex items-center justify-center shrink-0">
                <SignOut size={20} weight="bold" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-[15.5px] font-bold text-[#191C1A]">{t.signOut}</h3>
                <span className="text-[12px] text-[#545D56]">End your current session?</span>
              </div>
            </div>

            <p className="text-[12.5px] text-[#545D56] mb-5 leading-relaxed">
              Your active kiosk pairing and Firebase session on this device will end. Your orders and wallet ledger stay safely synced to your account for your next sign-in.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="min-h-[44px] rounded-xl border border-[#E2E7E1] text-[#191C1A] font-semibold text-[13px] hover:bg-black/5 active:scale-98 cursor-pointer"
              >
                Stay Signed In
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSignOut()}
                className="min-h-[44px] rounded-xl bg-[#BA1A1A] hover:bg-[#93000A] text-white font-semibold text-[13px] active:scale-98 cursor-pointer"
              >
                {t.signOut}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
