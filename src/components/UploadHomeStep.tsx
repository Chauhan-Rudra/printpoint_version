import React, { useRef, useState } from 'react';
import { Plus, AlertCircle, X } from 'lucide-react';
import {
  NATIVE_FILE_ACCEPT_ATTR,
  validateSelectedFile,
} from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';

interface UploadHomeStepProps {
  onFilesSelected: (files: File[]) => void;
  isSheetOpen?: boolean;
}

export const UploadHomeStep: React.FC<UploadHomeStepProps> = ({
  onFilesSelected,
  isSheetOpen = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isFolderTapped, setIsFolderTapped] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const rawFiles = Array.from(fileList);
    // Reset input value immediately so selecting the same file again triggers onChange
    e.target.value = '';

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

    // 2. Validate file format and file size before accepting
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

    // 3. Tactile feedback & proceed to upload sheet
    Haptics.selection();
    onFilesSelected(validFiles);
  };

  const handleLabelPointerDown = () => {
    setIsFolderTapped(true);
    setTimeout(() => {
      setIsFolderTapped(false);
    }, 220);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLLabelElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      <div className="flex flex-col flex-1 w-full animate-apple-reveal">
        {/* Real, Accessible Native HTML File Input connected directly to Add Your Files */}
        <input
          ref={fileInputRef}
          id="qr-document-upload"
          data-testid="native-file-input"
          type="file"
          multiple
          accept={NATIVE_FILE_ACCEPT_ATTR}
          onChange={handleInputChange}
          className="sr-only"
        />

        {/* Clear Error Banner when an Unsupported or Invalid File is Selected */}
        {validationError && (
          <div
            role="alert"
            data-testid="file-validation-error"
            className="mb-3 px-3.5 py-3 rounded-2xl bg-error-container/85 border border-error/25 text-on-error-container flex items-start justify-between gap-2.5 animate-apple-card"
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
              className="w-6 h-6 rounded-lg hover:bg-black/5 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Full-Screen Add Files Section (No Continue Button; opens floating upload sheet on selection) */}
        <section
          aria-label="Document Upload Area"
          className="flex-1 flex flex-col justify-center"
        >
          <label
            htmlFor="qr-document-upload"
            role="button"
            tabIndex={0}
            onPointerDown={handleLabelPointerDown}
            onKeyDown={handleLabelKeyDown}
            className={`group w-full flex-1 min-h-[calc(100dvh-96px)] rounded-3xl bg-white hover:bg-[#FAFDFB] border border-emerald-950/[0.08] shadow-2xs p-6 flex flex-col items-center ${
              isSheetOpen ? 'justify-start pt-8' : 'justify-center'
            } text-center cursor-pointer select-none active:scale-[0.99] transition-all duration-300 ease-out ${
              isFolderTapped
                ? 'scale-[0.98] opacity-90 border-[#1B4D2E]/30 bg-[#F5FAF7]'
                : 'hover:border-[#1B4D2E]/20'
            }`}
          >
            {/* Animated Folder Container with Soft Ambient Ring */}
            <div className="relative flex items-center justify-center mb-5 pointer-events-none">
              {/* Subtle ambient halo pulse behind the folder */}
              <span
                aria-hidden="true"
                className={`absolute -inset-2.5 rounded-[24px] bg-[#DCECE1]/65 pointer-events-none transition-transform duration-200 ${
                  isFolderTapped
                    ? 'scale-125 opacity-0'
                    : isSheetOpen
                    ? 'opacity-40'
                    : 'animate-folder-halo group-hover:scale-110'
                }`}
              />

              {/* Medium-sized modern folder illustration with soft brand background & + overlay */}
              <div
                className={`relative w-[76px] h-[76px] rounded-2xl bg-[#EAF2EC] border border-[#CFE0D4] flex items-center justify-center transition-all duration-200 ease-out ${
                  isFolderTapped
                    ? 'scale-110 -translate-y-1 bg-[#E1EFE5] border-[#1B4D2E]/35'
                    : isSheetOpen
                    ? ''
                    : 'animate-folder-float group-hover:scale-105 group-active:scale-95'
                }`}
                aria-hidden="true"
              >
                <svg className="w-10 h-10 overflow-visible" viewBox="0 0 36 36" fill="none">
                  {/* Back Folder Tab */}
                  <path
                    d="M5 10.5C5 8.567 6.567 7 8.5 7H14.4C15.32 7 16.2 7.4 16.8 8.1L18.7 10.3H27.5C29.433 10.3 31 11.867 31 13.8V25.5C31 27.433 29.433 29 27.5 29H8.5C6.567 29 5 27.433 5 25.5V10.5Z"
                    fill="#89BD95"
                    fillOpacity="0.45"
                    stroke="#1B4D2E"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />

                  {/* Subtle Paper Sheet Peeking Out with Smooth Slide Animation */}
                  <g
                    className={`transition-transform duration-200 ease-out ${
                      isFolderTapped
                        ? '-translate-y-1.5'
                        : isSheetOpen
                        ? ''
                        : 'animate-folder-sheet group-hover:-translate-y-1'
                    }`}
                  >
                    <rect
                      x="9.5"
                      y="9.6"
                      width="17"
                      height="7.5"
                      rx="1.6"
                      fill="#FFFFFF"
                      stroke="#1B4D2E"
                      strokeWidth="1.35"
                    />
                    <line
                      x1="12.5"
                      y1="12.1"
                      x2="21.5"
                      y2="12.1"
                      stroke="#89BD95"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </g>

                  {/* Front Folder Pocket with Gentle Breathing Motion */}
                  <path
                    className={isSheetOpen ? '' : 'animate-folder-pocket'}
                    d="M5 15.2C5 13.7088 6.20883 12.5 7.7 12.5H28.3C29.7912 12.5 31 13.7088 31 15.2V25.5C31 27.433 29.433 29 27.5 29H8.5C6.567 29 5 27.433 5 25.5V15.2Z"
                    fill="#F7FAF8"
                    stroke="#1B4D2E"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                </svg>

                {/* Small Plus (+) Symbol Overlay on Folder Icon */}
                <span
                  className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[#1B4D2E] text-white border-2 border-white flex items-center justify-center shadow-2xs transition-transform duration-200 ease-out ${
                    isFolderTapped
                      ? 'scale-115 rotate-90'
                      : isSheetOpen
                      ? ''
                      : 'animate-plus-badge group-hover:scale-110 group-hover:rotate-90'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
                </span>
              </div>
            </div>

            {/* Heading: Add Your Files */}
            <span className="text-[18px] font-bold text-on-surface tracking-tight pointer-events-none">
              Add Your Files
            </span>

            {/* Supporting text: Choose documents from your phone. */}
            <span className="text-[13px] text-on-surface-variant leading-snug mt-1.5 max-w-[210px] pointer-events-none">
              Choose documents from your phone.
            </span>
          </label>
        </section>
      </div>
    </div>
  );
};
