import React from 'react';
import { detectFileFormatKind } from '../utils/kioskLogic';
import { FileFormatKind } from '../types/kiosk';

interface FileTypeIconProps {
  fileName: string;
  formatKind?: FileFormatKind;
  size?: 'sm' | 'md';
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  fileName,
  formatKind,
  size = 'md',
}) => {
  const kind = formatKind ?? detectFileFormatKind(fileName);
  const boxClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-lg'
      : 'w-10 h-10 rounded-xl';

  if (kind === 'pdf') {
    return (
      <div
        className={`${boxClasses} bg-[#FDF3F2] border border-[#F2D0CC] text-[#B43426] flex flex-col items-center justify-center shrink-0 select-none`}
        aria-hidden="true"
      >
        <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
          <path
            d="M5.5 2.5H11.8L15.5 6.2V16C15.5 16.8284 14.8284 17.5 14 17.5H5.5C4.67157 17.5 4 16.8284 4 16V4C4 3.17157 4.67157 2.5 5.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 2.5V6.5H15.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.8 11.5H12.8M6.8 14H10.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
          PDF
        </span>
      </div>
    );
  }

  if (kind === 'word') {
    return (
      <div
        className={`${boxClasses} bg-[#F2F6FC] border border-[#CEDFF4] text-[#245696] flex flex-col items-center justify-center shrink-0 select-none`}
        aria-hidden="true"
      >
        <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
          <path
            d="M5.5 2.5H11.8L15.5 6.2V16C15.5 16.8284 14.8284 17.5 14 17.5H5.5C4.67157 17.5 4 16.8284 4 16V4C4 3.17157 4.67157 2.5 5.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M6.8 9.2H12.8M6.8 11.8H12.8M6.8 14.4H10.2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
          DOC
        </span>
      </div>
    );
  }

  if (kind === 'excel') {
    const isCsv = fileName.toLowerCase().endsWith('.csv');
    return (
      <div
        className={`${boxClasses} bg-[#F0F7F3] border border-[#C6E2D1] text-[#1C643F] flex flex-col items-center justify-center shrink-0 select-none`}
        aria-hidden="true"
      >
        <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
          <rect
            x="4"
            y="3"
            width="12"
            height="14"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M4 7.5H16M4 12H16M9.5 7.5V17"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
          {isCsv ? 'CSV' : 'XLS'}
        </span>
      </div>
    );
  }

  if (kind === 'presentation') {
    return (
      <div
        className={`${boxClasses} bg-[#FDF6EF] border border-[#F0D5BC] text-[#B85418] flex flex-col items-center justify-center shrink-0 select-none`}
        aria-hidden="true"
      >
        <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
          <rect
            x="3.5"
            y="4"
            width="13"
            height="10"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M7 16.5L10 14L13 16.5M7 8.5H13M7 11H10.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
          PPT
        </span>
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <div
        className={`${boxClasses} bg-[#F3F6F3] border border-[#D4E1D7] text-[#2C5940] flex flex-col items-center justify-center shrink-0 select-none`}
        aria-hidden="true"
      >
        <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
          <rect
            x="3.5"
            y="3.5"
            width="13"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
          <path
            d="M4.5 14.5L8.2 10.8C8.6 10.4 9.2 10.4 9.6 10.8L12 13.2L13.5 11.7C13.9 11.3 14.5 11.3 14.9 11.7L16 12.8"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
          IMG
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${boxClasses} bg-[#F3F6F3] border border-emerald-900/12 text-[#1B4D2E] flex flex-col items-center justify-center shrink-0 select-none`}
      aria-hidden="true"
    >
      <svg className="w-4 h-4 mb-0.5" viewBox="0 0 20 20" fill="none">
        <path
          d="M5.5 2.5H11.8L15.5 6.2V16C15.5 16.8284 14.8284 17.5 14 17.5H5.5C4.67157 17.5 4 16.8284 4 16V4C4 3.17157 4.67157 2.5 5.5 2.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M7 10.5H13M7 13.5H11"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[8px] font-bold tracking-wider leading-none uppercase">
        TXT
      </span>
    </div>
  );
};

export const FolderIllustration: React.FC = () => {
  return (
    <div
      className="w-9 h-9 rounded-xl bg-[#EAF2EC] border border-[#CFE0D4] flex items-center justify-center shrink-0 select-none transition-transform duration-200 ease-out group-hover:scale-105"
      aria-hidden="true"
    >
      <svg className="w-5 h-5 overflow-visible" viewBox="0 0 24 24" fill="none">
        {/* Back Folder Tab */}
        <path
          d="M3 6.8C3 5.58497 3.98497 4.6 5.2 4.6H9.3C9.88 4.6 10.43 4.86 10.8 5.3L12.1 6.85H18.8C20.015 6.85 21 7.83497 21 9.05V17.2C21 18.415 20.015 19.4 18.8 19.4H5.2C3.98497 19.4 3 18.415 3 17.2V6.8Z"
          fill="#89BD95"
          fillOpacity="0.38"
          stroke="#1B4D2E"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Peeking Document Sheet */}
        <rect
          x="6.2"
          y="6.4"
          width="11.6"
          height="4.5"
          rx="1"
          fill="#FFFFFF"
          stroke="#1B4D2E"
          strokeWidth="1.1"
          className="animate-folder-sheet"
        />
        {/* Front Folder Pocket */}
        <path
          d="M3 9.6C3 8.71634 3.71634 8 4.6 8H19.4C20.2837 8 21 8.71634 21 9.6V17.2C21 18.415 20.015 19.4 18.8 19.4H5.2C3.98497 19.4 3 18.415 3 17.2V9.6Z"
          fill="#FFFFFF"
          fillOpacity="0.88"
          stroke="#1B4D2E"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="animate-folder-pocket"
        />
      </svg>
    </div>
  );
};

