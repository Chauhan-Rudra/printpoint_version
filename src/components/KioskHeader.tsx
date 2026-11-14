import React, { useState } from 'react';
import {
  CaretDown,
  Question,
  CheckCircle,
  MapPin,
  Printer,
  ShieldCheck,
  X,
} from '@phosphor-icons/react';

import { Creator4Logo } from './Creator4Logo';
import { useKioskSession } from '../utils/kioskSession';

interface KioskHeaderProps {
  onGoHome?: () => void;
}

export const KioskHeader: React.FC<KioskHeaderProps> = ({ onGoHome }) => {
  const [showKioskInfo, setShowKioskInfo] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const { session } = useKioskSession();
  const station = session.activeStation;

  return (
    <>
      <header className="sticky top-0 w-full z-40 pt-safe bg-white border-b border-outline-variant/45">
        <div className="h-14 px-4 flex items-center justify-between mx-auto w-full max-w-4xl relative">
          {/* Left: Creator4 Lab Logo + Live Paired Kiosk Identification */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Creator4Logo
              size="sm"
              interactive
              onClick={() => {
                if (onGoHome) {
                  setShowKioskInfo(false);
                  setShowHelpModal(false);
                  onGoHome();
                } else {
                  setShowKioskInfo((prev) => !prev);
                }
              }}
            />

            <button
              type="button"
              onClick={() => {
                setShowKioskInfo((prev) => !prev);
                setShowHelpModal(false);
              }}
              aria-expanded={showKioskInfo}
              aria-label="Kiosk information"
              className="flex flex-col text-left min-w-0 min-h-[44px] justify-center group active:scale-[0.99] transition-transform duration-150"
            >
              <div className="flex items-center gap-1">
                <span className="text-[14px] font-bold text-on-surface tracking-tight truncate">
                  Print Point
                </span>
                <CaretDown
                  size={13}
                  weight="bold"
                  className={`text-on-surface-variant shrink-0 transition-transform duration-200 ${
                    showKioskInfo ? 'rotate-180 text-[#194F34]' : ''
                  }`}
                  aria-hidden="true"
                />
              </div>
              <span className="text-[11px] text-on-surface-variant leading-tight truncate tabular-nums">
                {station.name} · {session.connected ? station.status : 'Offline'}
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
              className="min-h-[44px] px-3 rounded-xl text-on-surface hover:bg-surface-container-low active:scale-95 transition-all duration-150 flex items-center gap-1.5 shrink-0"
            >
              <Question size={17} weight="regular" className="text-on-surface-variant" aria-hidden="true" />
              <span className="text-[13px] font-semibold text-on-surface">Help</span>
            </button>
          </div>

          {/* Kiosk Information Dropdown Popover */}
          {showKioskInfo && (
            <div
              role="region"
              aria-label="Kiosk Details"
              className="absolute left-4 right-4 max-w-md top-[60px] rounded-2xl bg-white border border-outline-variant/60 shadow-lg p-3.5 z-50 animate-view-enter"
            >
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-outline-variant/35">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      session.connected ? 'bg-[#194F34]' : 'bg-outline'
                    }`}
                  />
                  <span className="text-[12.5px] font-bold text-on-surface truncate">
                    Print Point {station.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKioskInfo(false)}
                  aria-label="Close kiosk details"
                  className="w-8 h-8 rounded-lg text-on-surface-variant flex items-center justify-center hover:bg-surface-container-low"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
              <div className="flex flex-col gap-2 text-[12px] text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <MapPin size={15} weight="duotone" className="text-[#194F34] shrink-0" />
                  <span>{station.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Printer size={15} weight="duotone" className="text-[#194F34] shrink-0" />
                  <span className="tabular-nums">
                    B&amp;W ₹{station.bwRateInr}/pg · Colour ₹{station.colourRateInr}/pg · Paper {station.paperTrayPercent}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} weight="duotone" className="text-[#194F34] shrink-0" />
                  <span>Files auto-delete after print completion</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Compact Help Modal */}
      {showHelpModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Printing Help"
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-start justify-center pt-16 px-4 animate-backdrop-fade"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-outline-variant/60 shadow-xl p-4 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-outline-variant/35">
              <h2 className="text-[15px] font-bold text-on-surface">
                How to print at {station.name}
              </h2>
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close help"
                className="w-8 h-8 rounded-lg text-on-surface-variant flex items-center justify-center hover:bg-surface-container-low"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <ol className="flex flex-col gap-2.5 text-[12.5px] text-on-surface-variant mb-4">
              <li className="flex items-start gap-2.5">
                <CheckCircle size={17} weight="fill" className="text-[#194F34] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">1. Add Documents:</strong> Select PDF, Word, Excel, PowerPoint, or images from your phone.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle size={17} weight="fill" className="text-[#194F34] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">2. Preview &amp; Configure:</strong> Review pages, remove blanks, choose B&amp;W or Colour, and 1 or 2-sided output.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle size={17} weight="fill" className="text-[#194F34] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-on-surface">3. Pay &amp; Collect:</strong> Pay from your wallet or UPI and collect your print from {station.name}.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#194F34] text-white font-semibold text-[13px] active:scale-[0.98] transition-transform"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
