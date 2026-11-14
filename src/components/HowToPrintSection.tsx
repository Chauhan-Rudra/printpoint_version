import React from 'react';
import { motion } from 'motion/react';
import { QrCode, Printer } from '@phosphor-icons/react';
import { Haptics } from '../utils/haptics';
import { pressableTap } from '../design-system/motion';

interface HowToPrintSectionProps {
  onScanClick: () => void;
  onUploadClick: () => void;
  onPrintInfoClick: () => void;
}

const FolderUploadGlyph: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M3.5 6.8C3.5 5.69543 4.39543 4.8 5.5 4.8H9.25C9.82 4.8 10.36 5.06 10.72 5.51L11.88 6.95H18.5C19.6046 6.95 20.5 7.84543 20.5 8.95V17.2C20.5 18.3046 19.6046 19.2 18.5 19.2H5.5C4.39543 19.2 3.5 18.3046 3.5 17.2V6.8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 15.6V10.6M12 10.6L9.75 12.85M12 10.6L14.25 12.85"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HowToPrintSection: React.FC<HowToPrintSectionProps> = ({
  onScanClick,
  onUploadClick,
  onPrintInfoClick,
}) => {
  const steps = [
    {
      stepLabel: 'STEP 01',
      title: 'Scan QR',
      description: 'Scan the QR code displayed on the kiosk.',
      renderIcon: () => <QrCode size={20} weight="regular" aria-hidden="true" />,
      action: onScanClick,
    },
    {
      stepLabel: 'STEP 02',
      title: 'Upload Files',
      description: 'Select documents from your phone.',
      renderIcon: () => <FolderUploadGlyph />,
      action: onUploadClick,
    },
    {
      stepLabel: 'STEP 03',
      title: 'Collect Prints',
      description: 'Collect your prints from the kiosk.',
      renderIcon: () => <Printer size={20} weight="regular" aria-hidden="true" />,
      action: onPrintInfoClick,
    },
  ];

  return (
    <section aria-label="How to Print" className="w-full">
      <div className="rounded-2xl bg-white border border-[#D5DDD7] shadow-[0_1px_2px_rgba(25,79,52,0.04)] p-4 sm:p-5">
        <div className="mb-3.5">
          <h2 className="pp-text-section-heading">How to Print</h2>
        </div>

        <ol className="flex flex-col">
          {steps.map((item, index) => {
            const isLast = index === steps.length - 1;
            return (
              <li key={item.stepLabel} className="relative">
                <motion.button
                  type="button"
                  whileTap={pressableTap.whileTap}
                  transition={pressableTap.transition}
                  onClick={() => {
                    Haptics.buttonPress();
                    item.action();
                  }}
                  className="w-full text-left flex items-stretch gap-3.5 py-2 px-2 -mx-2 rounded-xl hover:bg-[#F4F8F5] transition-colors duration-150 cursor-pointer group"
                >
                  {/* Icon Container + Subtle Connecting Indicator */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] border border-[#194F34]/12 text-[#194F34] flex items-center justify-center shrink-0 transition-colors group-hover:bg-[#DDECE2]">
                      {item.renderIcon()}
                    </div>
                    {!isLast && (
                      <div
                        aria-hidden="true"
                        className="w-px flex-1 min-h-[14px] bg-[#D5DDD7] mt-1.5"
                      />
                    )}
                  </div>

                  {/* Step Label, Title & Fully Visible Description */}
                  <div className={`flex-1 min-w-0 ${isLast ? 'pb-0.5' : 'pb-3'}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[11px] font-bold tracking-[0.04em] text-[#194F34] tabular-nums">
                        {item.stepLabel}
                      </span>
                      <span className="text-[14px] font-bold text-[#191C1A] leading-snug">
                        {item.title}
                      </span>
                    </div>
                    <p className="text-[13px] text-[#545D56] leading-relaxed mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </motion.button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
