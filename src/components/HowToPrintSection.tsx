import React from 'react';
import { ScanQrCode, FolderUp, Printer, ChevronRight } from 'lucide-react';
import { Haptics } from '../utils/haptics';

interface HowToPrintSectionProps {
  onScanClick: () => void;
  onUploadClick: () => void;
  onPrintInfoClick: () => void;
}

export const HowToPrintSection: React.FC<HowToPrintSectionProps> = ({
  onScanClick,
  onUploadClick,
  onPrintInfoClick,
}) => {
  const steps = [
    {
      step: '1',
      title: 'Scan the QR code',
      description: 'Point your camera at the kiosk screen.',
      icon: ScanQrCode,
      action: onScanClick,
      actionHint: 'Scan now',
    },
    {
      step: '2',
      title: 'Choose your files',
      description: 'Select documents or photos from your phone.',
      icon: FolderUp,
      action: onUploadClick,
      actionHint: 'Upload',
    },
    {
      step: '3',
      title: 'Collect your prints',
      description: 'Pick up your printed pages at the kiosk tray.',
      icon: Printer,
      action: onPrintInfoClick,
      actionHint: 'Kiosk info',
    },
  ];

  return (
    <section aria-label="How to Print Guide" className="mb-4 w-full">
      <div className="rounded-2xl bg-white border border-[#1B4D2E]/12 shadow-2xs p-3.5 sm:p-4">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <div>
            <h2 className="text-[14.5px] font-bold text-[#191C1A] tracking-tight">
              How to Print
            </h2>
            <p className="text-[11.5px] text-[#545D56] mt-0.5">
              Three simple steps to print your documents
            </p>
          </div>
          <span className="text-[10.5px] font-bold text-[#1B4D2E] bg-[#EDF5F0] border border-[#1B4D2E]/15 px-2.5 py-0.5 rounded-full">
            3 Steps
          </span>
        </div>

        {/* Connected Steps Timeline */}
        <div className="relative flex flex-col gap-1.5 mt-2">
          {/* Vertical Connecting Guide Line */}
          <div
            aria-hidden="true"
            className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-[#1B4D2E]/15 z-0"
          />

          {steps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                role="button"
                tabIndex={0}
                onClick={() => {
                  Haptics.buttonPress();
                  item.action();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    Haptics.buttonPress();
                    item.action();
                  }
                }}
                className="group relative z-10 flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAF8] active:scale-[0.99] transition-all cursor-pointer select-none min-h-[48px]"
              >
                {/* Step Number Badge */}
                <div className="w-8.5 h-8.5 rounded-full bg-[#1B4D2E] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs border-2 border-white ring-1 ring-[#1B4D2E]/20">
                  {item.step}
                </div>

                {/* Step Icon */}
                <div className="w-9 h-9 rounded-xl bg-[#EDF5F0] border border-[#1B4D2E]/15 text-[#1B4D2E] flex items-center justify-center shrink-0 group-hover:bg-[#E2EFE7] group-hover:scale-105 transition-all">
                  <Icon className="w-4.5 h-4.5 stroke-[2.2]" aria-hidden="true" />
                </div>

                {/* Step Text Information */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-bold text-[#191C1A] group-hover:text-[#1B4D2E] transition-colors truncate">
                    {item.title}
                  </h3>
                  <p className="text-[11.5px] text-[#545D56] truncate mt-0.5">
                    {item.description}
                  </p>
                </div>

                {/* Action Arrow & Hint */}
                <div className="flex items-center gap-1 text-[#707B72] group-hover:text-[#1B4D2E] shrink-0 text-xs font-semibold transition-colors">
                  <span className="hidden sm:inline text-[11px] text-[#1B4D2E]/75">
                    {item.actionHint}
                  </span>
                  <ChevronRight className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
