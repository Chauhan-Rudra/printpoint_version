import React, { useState } from 'react';
import {
  ChevronDown,
  HelpCircle,
  CheckCircle2,
  MapPin,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Creator4Logo } from './Creator4Logo';

export const KioskHeader: React.FC = () => {
  const [showKioskInfo, setShowKioskInfo] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <header className="sticky top-0 w-full z-40 pt-safe bg-white border-b border-outline-variant/35 shadow-2xs">
        <div className="h-14 px-4 flex items-center justify-between mx-auto w-full max-w-md relative">
          {/* Left: Creator4 Lab Logo + Kiosk Identification with Dropdown Indicator */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Creator4Logo
              size="sm"
              interactive
              onClick={() => setShowKioskInfo((prev) => !prev)}
            />

            <button
              type="button"
              onClick={() => {
                setShowKioskInfo((prev) => !prev);
                setShowHelpModal(false);
              }}
              aria-expanded={showKioskInfo}
              aria-label="Kiosk information"
              className="flex flex-col text-left min-w-0 group active:scale-[0.99] transition-transform duration-150"
            >
              <div className="flex items-center gap-1">
                <span className="text-[14px] font-bold text-on-surface tracking-tight truncate">
                  Print Point
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-on-surface-variant shrink-0 transition-transform duration-200 ${
                    showKioskInfo ? 'rotate-180 text-[#1B4D2E]' : ''
                  }`}
                  aria-hidden="true"
                />
              </div>
              <span className="text-[11px] text-on-surface-variant leading-tight truncate">
                Kiosk #04 · Ready to print
              </span>
            </button>
          </div>

          {/* Right: Help Option */}
          <div className="flex items-center gap-1.5 shrink-0">

            <button
              type="button"
              onClick={() => {
                setShowHelpModal((prev) => !prev);
                setShowKioskInfo(false);
              }}
              aria-expanded={showHelpModal}
              aria-label="Help"
              className="h-9 px-2.5 rounded-xl text-on-surface hover:bg-surface-container-low active:scale-95 transition-all duration-150 flex items-center gap-1.5 shrink-0"
            >
              <HelpCircle className="w-4 h-4 text-on-surface-variant" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-on-surface">Help</span>
            </button>
          </div>

          {/* Kiosk Information Dropdown Popover */}
          {showKioskInfo && (
            <div
              role="region"
              aria-label="Kiosk Details"
              className="absolute left-4 right-4 top-[60px] rounded-2xl bg-white border border-outline-variant/60 shadow-lg p-3.5 z-50 animate-fade-in-up"
            >
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-outline-variant/30">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span className="text-[12px] font-bold text-on-surface">
                    Creator4 Lab Self-Service Kiosk #04
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKioskInfo(false)}
                  aria-label="Close kiosk details"
                  className="w-6 h-6 rounded-lg text-on-surface-variant flex items-center justify-center hover:bg-surface-container-low"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 text-[12px] text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-[#1B4D2E] shrink-0" />
                  <span>Main Innovation Hub · Ground Floor</span>
                </div>
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 text-[#1B4D2E] shrink-0" />
                  <span>A4 Laser Duplex · B&amp;W and Full Colour Ready</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#1B4D2E] shrink-0" />
                  <span>Auto-delete enabled after print completion</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Compact Help Popover / Sheet */}
      {showHelpModal && (
        <div
          role="dialog"
          aria-label="Printing Help"
          className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px] flex items-start justify-center pt-16 px-4"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-outline-variant/60 shadow-xl p-4 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-outline-variant/30">
              <h2 className="text-[15px] font-bold text-on-surface">
                How to print at this kiosk
              </h2>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close help"
                className="w-7 h-7 rounded-lg text-on-surface-variant flex items-center justify-center hover:bg-surface-container-low"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="flex flex-col gap-2.5 text-[12.5px] text-on-surface-variant mb-3">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">1. Add Files:</strong> Tap the large Add Files card to select one or more PDF, DOCX, JPG, or PNG files from your phone.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">2. Set Options:</strong> Choose number of copies, Black &amp; White or Colour, and 1-Sided or 2-Sided printing.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B4D2E] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">3. Continue &amp; Print:</strong> Tap Continue to review your page count and release your print job at Kiosk #04.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full h-10 rounded-xl bg-[#1B4D2E] text-white font-semibold text-[13px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
