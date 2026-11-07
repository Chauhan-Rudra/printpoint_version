import React, { useState } from 'react';
import {
  ArrowLeft,
  Search,
  Check,
  Clock,
  FileText,
  FileSpreadsheet,
  Download,
  ChevronRight,
  X,
  HardDriveUpload,
} from 'lucide-react';
import {
  FileBrowserCategory,
  VirtualFileItem,
  VirtualFolder,
} from '../types/kiosk';
import {
  VIRTUAL_FILES,
  VIRTUAL_FOLDERS,
  buildRealFileFromVirtualItem,
  filterVirtualFiles,
  formatFileSize,
  getFileTypeShortLabel,
} from '../utils/kioskLogic';
import { Haptics } from '../utils/haptics';
import { FileTypeIcon, FolderIllustration } from './FileTypeIcon';

interface FileBrowserStepProps {
  onBack: () => void;
  onConfirmFiles: (files: File[]) => void;
}

const CATEGORIES: {
  id: FileBrowserCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'pdfs', label: 'PDFs', icon: FileSpreadsheet },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export const FileBrowserStep: React.FC<FileBrowserStepProps> = ({
  onBack,
  onConfirmFiles,
}) => {
  const [activeCategory, setActiveCategory] =
    useState<FileBrowserCategory>('recent');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Ordered array of selected virtual file IDs to preserve selection order
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeFolder: VirtualFolder | undefined = VIRTUAL_FOLDERS.find(
    (f) => f.id === activeFolderId
  );

  const visibleFiles = filterVirtualFiles(
    VIRTUAL_FILES,
    activeCategory,
    activeFolderId,
    searchQuery
  );

  const handleToggleFile = (fileId: string) => {
    Haptics.progressTick();
    setSelectedIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleHeaderBack = () => {
    Haptics.buttonPress();
    if (activeFolderId) {
      setActiveFolderId(null);
      return;
    }
    onBack();
  };

  const handleAddSelectedDocuments = () => {
    if (selectedIds.length === 0) return;

    Haptics.selection();
    const orderedFiles: File[] = [];
    for (const id of selectedIds) {
      const item = VIRTUAL_FILES.find((f) => f.id === id);
      if (item) {
        orderedFiles.push(buildRealFileFromVirtualItem(item));
      }
    }

    if (orderedFiles.length > 0) {
      onConfirmFiles(orderedFiles);
    }
  };

  const handleNativeDeviceFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Haptics.selection();
      onConfirmFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const selectedCount = selectedIds.length;

  return (
    <div className="flex flex-col flex-1 w-full pb-24">
      <div className="flex flex-col flex-1 w-full animate-fade-in-up">
        {/* File Browser Header */}
        <header className="flex items-center justify-between gap-2 py-2 mb-3 border-b border-outline-variant/40">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleHeaderBack}
              aria-label={activeFolder ? 'Back to all folders' : 'Back'}
              className="w-9 h-9 rounded-xl bg-white border border-outline-variant/60 text-on-surface flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-150"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-[18px] font-bold text-on-surface tracking-tight leading-tight truncate">
                {activeFolder ? activeFolder.name : 'Select documents'}
              </h1>
              {activeFolder && (
                <span className="text-[11px] text-on-surface-variant leading-none mt-0.5">
                  Internal storage · {activeFolder.fileCount} files
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Native OS file input fallback for uploading custom local device files */}
            <label
              htmlFor="device-native-file-picker"
              title="Browse local device storage"
              className="h-9 px-2.5 rounded-xl bg-white border border-outline-variant/60 text-on-surface-variant hover:text-[#1B4D2E] hover:border-[#1B4D2E]/40 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all duration-150"
            >
              <input
                id="device-native-file-picker"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                onChange={handleNativeDeviceFiles}
                className="sr-only"
              />
              <HardDriveUpload className="w-3.5 h-3.5 text-[#1B4D2E]" aria-hidden="true" />
              <span>Device</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setSearchOpen((prev) => !prev);
                if (searchOpen) setSearchQuery('');
              }}
              aria-label={searchOpen ? 'Close search' : 'Search documents'}
              aria-expanded={searchOpen}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors duration-150 active:scale-95 ${
                searchOpen
                  ? 'bg-[#EAF2EC] border-[#1B4D2E]/30 text-[#1B4D2E]'
                  : 'bg-white border-outline-variant/60 text-on-surface-variant'
              }`}
            >
              {searchOpen ? (
                <X className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Search className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        {/* Expandable Search Bar */}
        {searchOpen && (
          <div className="mb-3 animate-fade-in-up">
            <div className="relative flex items-center">
              <Search
                className="w-4 h-4 text-on-surface-variant absolute left-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search file name (e.g. Assignment, Resume)..."
                aria-label="Search file name"
                className="w-full h-10 pl-9 pr-3.5 rounded-xl bg-white border border-outline-variant/70 focus:border-[#1B4D2E] focus:outline-none text-[13px] text-on-surface placeholder:text-on-surface-variant/70"
              />
            </div>
          </div>
        )}

        {/* Horizontal Browse Categories */}
        {!activeFolder && (
          <nav
            aria-label="Browse Categories"
            className="flex items-center justify-between gap-1.5 mb-3.5"
          >
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={isActive}
                  className={`h-9 px-2.5 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1 border whitespace-nowrap transition-all duration-150 active:scale-[0.97] ${
                    isActive
                      ? 'bg-[#1B4D2E] text-white border-[#1B4D2E] shadow-2xs'
                      : 'bg-white text-on-surface-variant border-outline-variant/60 hover:border-emerald-900/30'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-emerald-200' : 'text-on-surface-variant'
                    }`}
                  />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </nav>
        )}

      {/* Folders Section (Shown at root when not searching) */}
      {!activeFolder && searchQuery.trim().length === 0 && (
        <section aria-label="Folders" className="mb-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Folders
            </h2>
            <span className="text-[11px] text-on-surface-variant">
              Phone storage
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {VIRTUAL_FOLDERS.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderId(folder.id)}
                className="p-2 rounded-xl bg-white border border-outline-variant/50 hover:border-[#1B4D2E]/40 active:scale-[0.98] transition-all duration-200 flex items-center justify-between gap-2 text-left shadow-2xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderIllustration />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-on-surface truncate leading-tight">
                      {folder.name}
                    </span>
                    <span className="text-[11px] text-on-surface-variant mt-0.5">
                      {folder.fileCount} {folder.fileCount === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className="w-4 h-4 text-on-surface-variant/70 shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Active Folder Breadcrumb Bar */}
      {activeFolder && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-[#F3F6F3] border border-emerald-900/10 flex items-center justify-between animate-fade-in-up">
          <div className="flex items-center gap-2 min-w-0 text-[12px]">
            <button
              type="button"
              onClick={() => setActiveFolderId(null)}
              className="font-semibold text-[#1B4D2E] hover:underline"
            >
              Folders
            </button>
            <span className="text-on-surface-variant">/</span>
            <span className="font-bold text-on-surface truncate">
              {activeFolder.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveFolderId(null)}
            className="text-[11px] font-semibold text-[#1B4D2E] px-2 py-0.5 rounded-md bg-white border border-emerald-900/15"
          >
            All files
          </button>
        </div>
      )}

      {/* Realistic Document List */}
      <section aria-label="Document List" className="flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
            {activeFolder
              ? `${activeFolder.name} Files`
              : CATEGORIES.find((c) => c.id === activeCategory)?.label ||
                'Documents'}
          </h2>
          <span className="text-[11px] font-medium text-on-surface-variant">
            {visibleFiles.length} {visibleFiles.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {visibleFiles.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-outline-variant/50 text-center my-2">
            <p className="text-[13px] font-semibold text-on-surface mb-1">
              No matching documents found
            </p>
            <p className="text-[12px] text-on-surface-variant">
              Try a different category or clear your search filter.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-outline-variant/60 shadow-2xs divide-y divide-outline-variant/35 overflow-hidden">
            {visibleFiles.map((file: VirtualFileItem) => {
              const selectedIndex = selectedIds.indexOf(file.id);
              const isSelected = selectedIndex !== -1;
              const shortType = getFileTypeShortLabel(file.name);

              return (
                <button
                  key={file.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`Select ${file.name}`}
                  onClick={() => handleToggleFile(file.id)}
                  className={`w-full p-3.5 flex items-center justify-between gap-3 text-left transition-colors duration-200 active:scale-[0.995] ${
                    isSelected
                      ? 'bg-[#F2F7F4]'
                      : 'bg-white hover:bg-surface-container-low/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileTypeIcon
                      fileName={file.name}
                      formatKind={file.formatKind}
                    />

                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className={`text-[14px] font-semibold truncate leading-snug ${
                          isSelected ? 'text-[#133820]' : 'text-on-surface'
                        }`}
                      >
                        {file.name}
                      </span>

                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5 truncate">
                        <span className="font-semibold text-on-surface/80">
                          {shortType}
                        </span>
                        <span>·</span>
                        <span>{formatFileSize(file.sizeBytes)}</span>
                        <span>·</span>
                        <span className="truncate">{file.modifiedLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Selection Checkbox with Order Indicator */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && selectedCount > 1 && (
                      <span
                        aria-hidden="true"
                        className="text-[10px] font-bold text-[#1B4D2E] bg-[#E3EFE7] px-1.5 py-0.5 rounded-md tabular-nums"
                      >
                        #{selectedIndex + 1}
                      </span>
                    )}
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all duration-200 ${
                        isSelected
                          ? 'bg-[#1B4D2E] border-[#1B4D2E] text-white shadow-2xs'
                          : 'bg-white border-outline-variant text-transparent'
                      }`}
                    >
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 stroke-[2.6] animate-check-pop"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
      </div>

      {/* Sticky Bottom Multi-Document Selection Bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 pb-safe bg-white/95 backdrop-blur-md border-t border-outline-variant/50 px-4 py-3 transition-all duration-250 ${
          selectedCount > 0
            ? 'translate-y-0 opacity-100'
            : 'translate-y-1 opacity-95'
        }`}
      >
        <div className="max-w-md mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span
              data-testid="selected-documents-count"
              className="text-[13px] font-bold text-on-surface tabular-nums"
            >
              {selectedCount === 0
                ? 'No documents selected'
                : `${selectedCount} ${
                    selectedCount === 1 ? 'document' : 'documents'
                  } selected`}
            </span>
            <span className="text-[11px] text-on-surface-variant truncate">
              {selectedCount === 0
                ? 'Tap files above to select'
                : 'Selection order preserved'}
            </span>
          </div>

          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={handleAddSelectedDocuments}
            className="min-h-[46px] px-5 rounded-xl bg-[#1B4D2E] hover:bg-primary disabled:opacity-45 text-white font-semibold text-[14px] flex items-center justify-center shrink-0 shadow-xs active:scale-[0.98] transition-all duration-150"
          >
            Add Documents
          </button>
        </div>
      </div>
    </div>
  );
};
