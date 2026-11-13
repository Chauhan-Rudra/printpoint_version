/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  UserCircle as PhosphorUserCircle,
  Receipt as PhosphorReceipt,
  FolderSimple as PhosphorFolderSimple,
  MapPin as PhosphorMapPin,
  Wallet as PhosphorWallet,
  Lifebuoy as PhosphorLifebuoy,
  UserGear as PhosphorUserGear,
  Translate as PhosphorTranslate,
  Bell as PhosphorBell,
  ShieldCheck as PhosphorShieldCheck,
  SignOut as PhosphorSignOut,
  CaretRight as PhosphorCaretRight,
  Plus as PhosphorPlus,
  X as PhosphorX,
  Check as PhosphorCheck,
  Clock as PhosphorClock,
} from '@phosphor-icons/react';
import { useUserProfile } from '../utils/userProfile';
import { useKioskWallet, KioskWalletTransaction } from '../utils/kioskWallet';
import { formatInrCurrency } from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';
import { AddMoneyModal } from './AddMoneyModal';

interface AccountPageProps {
  onOpenOrders: () => void;
  onOpenBrowser: () => void;
  onOpenStationDetails: () => void;
  onOpenHelp: () => void;
}

export const AccountPage: React.FC<AccountPageProps> = ({
  onOpenOrders,
  onOpenBrowser,
  onOpenStationDetails,
  onOpenHelp,
}) => {
  const { profile, updateProfile, resetProfile } = useUserProfile();
  const { balance, getTransactions } = useKioskWallet();
  const transactions: KioskWalletTransaction[] = getTransactions();

  const [isAddMoneyOpen, setIsAddMoneyOpen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Form states for Edit Profile
  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEditProfile = () => {
    Haptics.buttonPress();
    setEditName(profile.name);
    setEditEmail(profile.email);
    setEditError(null);
    setShowEditProfile(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError('Name cannot be empty.');
      Haptics.error();
      return;
    }
    if (!editEmail.trim() || !editEmail.includes('@')) {
      setEditError('Please enter a valid email address.');
      Haptics.error();
      return;
    }
    Haptics.selection();
    updateProfile({ name: editName.trim(), email: editEmail.trim() });
    setShowEditProfile(false);
  };

  const handleToggleNotifications = () => {
    Haptics.selection();
    updateProfile({ notificationsEnabled: !profile.notificationsEnabled });
  };

  const handleSelectLanguage = (lang: 'English' | 'ગુજરાતી' | 'हिन्दी') => {
    Haptics.selection();
    updateProfile({ language: lang });
    setShowLanguageModal(false);
  };

  const handleSignOut = () => {
    Haptics.buttonPress();
    resetProfile();
    setShowSignOutConfirm(false);
  };

  return (
    <div className="w-full flex flex-col pt-3 pb-24 px-4 sm:px-5 animate-apple-reveal">
      {/* 1. Page Header */}
      <header className="mb-4 pt-1">
        <h1 className="text-[26px] sm:text-[28px] font-bold text-[#202722] tracking-tight leading-none">
          Account
        </h1>
      </header>

      {/* 2. User Profile & Wallet Card (Dark Forest-Green Card) */}
      <section aria-label="User Profile and Balance" className="mb-6">
        <div className="relative w-full rounded-3xl bg-[#194F34] text-white p-4.5 sm:p-5 shadow-xs border border-[#143F2A]">
          {/* Top Row: User Avatar & Contact Info */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#EAE5D9] text-[#194F34] flex items-center justify-center font-bold text-[18px] tracking-tight shrink-0 shadow-2xs border border-white/20 select-none">
              {profile.initials}
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-[17px] font-bold text-white tracking-tight leading-snug truncate">
                {profile.name}
              </h2>
              <p className="text-[12.5px] text-white/80 font-normal leading-tight truncate mt-0.5">
                {profile.email}
              </p>
            </div>
          </div>

          {/* Bottom Row: Soft-green Nested Wallet Container */}
          <div className="mt-4 rounded-2xl bg-[#0F3322]/80 border border-white/10 p-3 sm:p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/90 shrink-0">
                <PhosphorWallet size={18} weight="fill" aria-hidden="true" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-white/75 leading-none">
                  Balance
                </span>
                <span className="text-[20px] sm:text-[22px] font-black text-white tracking-tight leading-tight mt-1 tabular-nums">
                  {formatInrCurrency(balance)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                Haptics.buttonPress();
                setIsAddMoneyOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5F2E9] text-[#194F34] hover:bg-white active:scale-95 font-semibold text-[12.5px] shadow-2xs transition-all shrink-0 cursor-pointer"
            >
              <PhosphorPlus size={14} weight="bold" />
              <span>Add balance</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. Your Prints Section */}
      <section aria-label="Your Prints" className="mb-5">
        <h2 className="text-[13.5px] font-bold text-[#202722] tracking-tight mb-2 px-1">
          Your prints
        </h2>
        <div className="bg-white rounded-3xl border border-black/[0.04] shadow-[0_1px_8px_rgba(25,79,52,0.03)] overflow-hidden">
          {/* My Orders */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onOpenOrders();
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F4EA] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorClock size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  My Orders
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  View your print history and receipts.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>

          {/* Saved Files */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onOpenBrowser();
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F4EA] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorFolderSimple size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Saved Files
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Access your uploaded and saved documents.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>

          {/* Find Printers */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onOpenStationDetails();
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F4EA] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorMapPin size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Find Printers
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Find available Print Point kiosks.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>

          {/* Wallet */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowWalletModal(true);
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F4EA] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorWallet size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Wallet
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  View your balance and transactions.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>
        </div>
      </section>

      {/* 4. Support Section */}
      <section aria-label="Support" className="mb-5">
        <h2 className="text-[13.5px] font-bold text-[#202722] tracking-tight mb-2 px-1">
          Support
        </h2>
        <div className="bg-white rounded-3xl border border-black/[0.04] shadow-[0_1px_8px_rgba(25,79,52,0.03)] overflow-hidden">
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onOpenHelp();
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#F7F4EA] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorLifebuoy size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Help &amp; Support
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Get help, report issues and check FAQs.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>
        </div>
      </section>

      {/* 5. Account Settings Section (Preferences) */}
      <section aria-label="Account Preferences" className="mb-5">
        <h2 className="text-[13.5px] font-bold text-[#202722] tracking-tight mb-2 px-1">
          Preferences
        </h2>
        <div className="bg-white rounded-3xl border border-black/[0.04] shadow-[0_1px_8px_rgba(25,79,52,0.03)] overflow-hidden">
          {/* Edit Profile */}
          <button
            type="button"
            onClick={handleOpenEditProfile}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorUserGear size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Edit Profile
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Update name and profile details.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>

          {/* Language */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowLanguageModal(true);
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorTranslate size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Language
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  {profile.language} (English, ગુજરાતી, हिन्दी)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[#8B9890]">
              <span className="text-[12px] font-semibold text-[#194F34]">{profile.language}</span>
              <PhosphorCaretRight size={18} weight="bold" />
            </div>
          </button>

          {/* Notifications Toggle */}
          <div className="w-full p-3.5 flex items-center justify-between gap-3 border-b border-black/[0.05]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorBell size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Notifications
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Print completion alerts and receipts.
                </span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.notificationsEnabled}
              aria-label="Toggle print notifications"
              onClick={handleToggleNotifications}
              className={`w-11 h-6.5 rounded-full transition-colors relative cursor-pointer flex items-center p-0.5 ${
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
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAF8] active:bg-[#F0F5F2] transition-colors border-b border-black/[0.05] text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center shrink-0">
                <PhosphorShieldCheck size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#202722] leading-tight">
                  Privacy &amp; Security
                </span>
                <span className="text-[12px] text-[#64736A] leading-tight mt-0.5 truncate">
                  Account security and privacy information.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#8B9890] shrink-0" />
          </button>

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              setShowSignOutConfirm(true);
            }}
            className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-[#FFF5F5] active:bg-[#FFEBEB] transition-colors text-left cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0">
                <PhosphorSignOut size={20} weight="regular" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-[#DC2626] leading-tight">
                  Sign Out
                </span>
                <span className="text-[12px] text-[#991B1B] leading-tight mt-0.5 truncate">
                  Securely sign out of your session.
                </span>
              </div>
            </div>
            <PhosphorCaretRight size={18} weight="bold" className="text-[#DC2626]/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        </div>
      </section>

      {/* Version Tag */}
      <div className="text-center text-[11px] text-[#8B9890] mt-1 select-none">
        Print Point Mobile v2.4 · Station #04 Connected
      </div>

      {/* MODAL 1: Add Money Modal */}
      <AddMoneyModal
        isOpen={isAddMoneyOpen}
        onClose={() => setIsAddMoneyOpen(false)}
        currentBalance={balance}
      />

      {/* MODAL 2: Edit Profile Modal */}
      {showEditProfile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Profile"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowEditProfile(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#194F34]/15 shadow-xl p-5 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <PhosphorUserGear size={20} weight="bold" />
                </div>
                <h3 className="text-[16px] font-bold text-[#202722]">Edit Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="w-8 h-8 rounded-xl text-[#64736A] hover:bg-black/5 flex items-center justify-center"
              >
                <PhosphorX size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              <div>
                <label className="text-[12px] font-semibold text-[#202722] block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.12] focus:border-[#194F34] focus:ring-2 focus:ring-[#194F34]/15 text-[13.5px] outline-none transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-[#202722] block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.12] focus:border-[#194F34] focus:ring-2 focus:ring-[#194F34]/15 text-[13.5px] outline-none transition-all"
                />
              </div>

              {editError && (
                <div className="text-[12px] text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
                  {editError}
                </div>
              )}

              <div className="flex gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProfile(false)}
                  className="flex-1 h-11 rounded-xl border border-black/[0.12] text-[#202722] font-semibold text-[13px] hover:bg-black/5 active:scale-98 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-[#194F34] text-white font-semibold text-[13px] shadow-xs hover:bg-[#143F2A] active:scale-98 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Language Selection Modal */}
      {showLanguageModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select Language"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowLanguageModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#194F34]/15 shadow-xl p-5 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <PhosphorTranslate size={20} weight="bold" />
                </div>
                <h3 className="text-[16px] font-bold text-[#202722]">Select Language</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLanguageModal(false)}
                className="w-8 h-8 rounded-xl text-[#64736A] hover:bg-black/5 flex items-center justify-center"
              >
                <PhosphorX size={18} />
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
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#194F34] bg-[#EAF3ED]/60 text-[#194F34]'
                        : 'border-black/[0.08] hover:bg-[#F8FAF8] text-[#202722]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold">{lang}</span>
                      <span className="text-[11px] text-[#64736A]">
                        {lang === 'English' && 'Standard App Language'}
                        {lang === 'ગુજરાતી' && 'પ્રિન્ટ પોઇન્ટ ગુજરાતીમાં'}
                        {lang === 'हिन्दी' && 'प्रिंट पॉइंट हिंदी में'}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[#194F34] text-white flex items-center justify-center">
                        <PhosphorCheck size={14} weight="bold" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowLanguageModal(false)}
              className="w-full h-11 rounded-2xl bg-[#194F34] text-white font-semibold text-[13px] shadow-xs active:scale-98 transition-all mt-2"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: Wallet Details Modal */}
      {showWalletModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kiosk Wallet Details"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowWalletModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#194F34]/15 shadow-xl p-5 animate-apple-card max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <PhosphorWallet size={20} weight="bold" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#202722]">My Wallet Details</h3>
                  <span className="text-[11px] text-[#64736A]">Print Point Balance &amp; History</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletModal(false)}
                className="w-8 h-8 rounded-xl text-[#64736A] hover:bg-black/5 flex items-center justify-center"
              >
                <PhosphorX size={18} />
              </button>
            </div>

            {/* Current Balance Banner */}
            <div className="p-4 rounded-2xl bg-[#194F34] text-white mb-3 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11.5px] font-medium text-white/80">Available Kiosk Balance</span>
                <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">INSTANT</span>
              </div>
              <div className="text-[26px] font-black tracking-tight tabular-nums">
                {formatInrCurrency(balance)}
              </div>
              <p className="text-[11px] text-white/70 mt-1">
                Zero waiting time. Scan kiosk QR to release prints directly.
              </p>
            </div>

            {/* Quick Top-Up CTA */}
            <button
              type="button"
              onClick={() => {
                setShowWalletModal(false);
                setIsAddMoneyOpen(true);
              }}
              className="w-full h-11 rounded-2xl bg-[#EAF3ED] hover:bg-[#D7E9DD] text-[#194F34] font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all mb-3 cursor-pointer"
            >
              <PhosphorPlus size={16} weight="bold" />
              <span>Add Money to Wallet</span>
            </button>

            {/* Recent Transactions List */}
            <span className="text-[12px] font-bold text-[#202722] mb-1.5 block">Recent Transactions</span>
            <div className="flex flex-col gap-2 overflow-y-auto mb-4 pr-0.5 flex-1 max-h-48">
              {transactions.slice(0, 5).map((tx: KioskWalletTransaction) => (
                <div key={tx.id} className="p-2.5 rounded-xl bg-[#F8FAF8] border border-black/[0.04] flex items-center justify-between text-[12px]">
                  <div>
                    <span className="font-semibold text-[#202722] block">{tx.description}</span>
                    <span className="text-[10.5px] text-[#64736A]">
                      {new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className={`font-bold tabular-nums ${tx.type === 'credit' ? 'text-emerald-700' : 'text-[#202722]'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatInrCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowWalletModal(false)}
              className="w-full h-11 rounded-2xl bg-[#194F34] text-white font-semibold text-[13px] shadow-xs active:scale-98 transition-all shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL 5: Privacy & Security Modal */}
      {showPrivacyModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy and Security"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowPrivacyModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#194F34]/15 shadow-xl p-5 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EAF3ED] text-[#194F34] flex items-center justify-center">
                  <PhosphorShieldCheck size={20} weight="bold" />
                </div>
                <h3 className="text-[16px] font-bold text-[#202722]">Privacy &amp; Security</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="w-8 h-8 rounded-xl text-[#64736A] hover:bg-black/5 flex items-center justify-center"
              >
                <PhosphorX size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-[12.5px] text-[#64736A] mb-5">
              <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04]">
                <strong className="text-[#202722] block text-[13px] mb-0.5">Zero Cloud Storage</strong>
                Your documents are processed securely in your browser session and streamed directly to Kiosk #04.
              </div>
              <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04]">
                <strong className="text-[#202722] block text-[13px] mb-0.5">Automatic Purge</strong>
                Once your physical pages are printed in the kiosk tray, print spool data is immediately wiped from memory.
              </div>
              <div className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/[0.04]">
                <strong className="text-[#202722] block text-[13px] mb-0.5">Encrypted Pairing</strong>
                Device-to-kiosk pairing is authenticated via cryptographically verified session tokens.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPrivacyModal(false)}
              className="w-full h-11 rounded-2xl bg-[#194F34] text-white font-semibold text-[13px] shadow-xs active:scale-98 transition-all"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* MODAL 6: Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Sign Out"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-red-200 shadow-xl p-5 animate-apple-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <PhosphorSignOut size={22} weight="bold" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-[#202722]">Sign Out</h3>
                <span className="text-[12px] text-[#64736A]">Are you sure you want to exit?</span>
              </div>
            </div>

            <p className="text-[12.5px] text-[#64736A] mb-5">
              Signing out will reset your current device session. Your kiosk wallet balance is securely linked to your account.
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 h-11 rounded-xl border border-black/[0.12] text-[#202722] font-semibold text-[13px] hover:bg-black/5 active:scale-98 transition-all"
              >
                Stay Logged In
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] shadow-xs active:scale-98 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
