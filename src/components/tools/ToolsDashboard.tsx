import React, { useState } from 'react';
import {
  FileText,
  Minimize2,
  FileImage,
  Layers,
  RotateCw,
  Trash2,
  ArrowUpDown,
  Crop,
  Split,
  FileCheck2,
  Scaling,
  Sparkles,
  UserCheck,
  CreditCard,
  FilePlus,
  RefreshCw,
  Printer,
  Camera,
  Copy,
  Eye,
  Sliders,
  Search,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  X,
  Wrench,
} from 'lucide-react';
import { Creator4Logo } from '../Creator4Logo';
import { ToolId, IndividualToolModal } from './IndividualToolModal';
import { FullScreenPdfEditor } from './FullScreenPdfEditor';
import { Haptics } from '../../utils/haptics';

interface ToolsDashboardProps {
  onBackToHome: () => void;
  onSendToPrint: (files: File[]) => void;
}

interface ToolDefinition {
  id: ToolId;
  name: string;
  category: 'pdf' | 'image' | 'scan';
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
  desc: string;
}

const ALL_TOOLS: ToolDefinition[] = [
  // 1. PDF Tools
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    category: 'pdf',
    icon: Layers,
    tag: 'Popular',
    desc: 'Combine multiple PDFs into one document',
  },
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    category: 'pdf',
    icon: Minimize2,
    tag: 'Save Size',
    desc: 'Reduce file size while keeping text sharp',
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    category: 'pdf',
    icon: FileImage,
    desc: 'Extract every page as a high-res image',
  },
  {
    id: 'pages-per-sheet',
    name: 'Pages / Sheet',
    category: 'pdf',
    icon: Copy,
    tag: 'Eco',
    desc: 'Print 2 or 4 pages per sheet (N-Up)',
  },
  {
    id: 'rotate-pages',
    name: 'Rotate Pages',
    category: 'pdf',
    icon: RotateCw,
    desc: 'Rotate pages by 90°, 180° or 270°',
  },
  {
    id: 'delete-pages',
    name: 'Delete Pages',
    category: 'pdf',
    icon: Trash2,
    desc: 'Remove unwanted pages cleanly',
  },
  {
    id: 'reorder-pages',
    name: 'Reorder Pages',
    category: 'pdf',
    icon: ArrowUpDown,
    desc: 'Rearrange page sequences visually',
  },
  {
    id: 'crop-pages',
    name: 'Crop Pages',
    category: 'pdf',
    icon: Crop,
    desc: 'Trim page margins and white borders',
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    category: 'pdf',
    icon: Split,
    desc: 'Extract specific pages into a new PDF',
  },
  {
    id: 'blank-page-removal',
    name: 'Blank Removal',
    category: 'pdf',
    icon: FileCheck2,
    tag: 'Smart',
    desc: 'Auto-detect and strip empty pages',
  },

  // 2. Image & Photo Tools
  {
    id: 'resize-image',
    name: 'Resize Image',
    category: 'image',
    icon: Scaling,
    desc: 'Adjust pixel dimensions with aspect lock',
  },
  {
    id: 'image-enhancement',
    name: 'Enhance Photo',
    category: 'image',
    icon: Sparkles,
    tag: 'AI Filter',
    desc: 'Improve contrast, clarity and sharpness',
  },
  {
    id: 'passport-photo',
    name: 'Passport Photo',
    category: 'image',
    icon: UserCheck,
    tag: 'Print Ready',
    desc: 'Tile 6 or 8 passport photos on A4 sheet',
  },
  {
    id: 'id-card-layout',
    name: 'ID Card Print',
    category: 'image',
    icon: CreditCard,
    desc: 'Front and back card on one page',
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    category: 'image',
    icon: FilePlus,
    tag: 'Essential',
    desc: 'Convert photos or scans into clean PDF',
  },
  {
    id: 'image-crop',
    name: 'Crop Image',
    category: 'image',
    icon: Crop,
    desc: 'Crop photo framing before printing',
  },
  {
    id: 'image-format-converter',
    name: 'Format Convert',
    category: 'image',
    icon: RefreshCw,
    desc: 'Convert JPG, PNG, and WebP',
  },
  {
    id: 'photo-printing',
    name: 'Photo Printing',
    category: 'image',
    icon: Printer,
    desc: 'Prepare photos for 4x6, 5x7 or A4 prints',
  },

  // 3. Scan & Document Tools
  {
    id: 'scan-to-pdf',
    name: 'Scan to PDF',
    category: 'scan',
    icon: Camera,
    tag: 'Camera',
    desc: 'Capture physical papers via camera into PDF',
  },
  {
    id: 'multi-page-scan',
    name: 'Multi-Page Scan',
    category: 'scan',
    icon: Copy,
    desc: 'Snap several pages into one document',
  },
  {
    id: 'merge-documents',
    name: 'Merge Docs',
    category: 'scan',
    icon: Layers,
    desc: 'Combine multiple document formats',
  },
  {
    id: 'document-preview',
    name: 'Doc Preview',
    category: 'scan',
    icon: Eye,
    desc: 'High-res page review before kiosk print',
  },
  {
    id: 'scan-enhancement',
    name: 'Scan Clean',
    category: 'scan',
    icon: Sliders,
    desc: 'High-contrast text filter for clear reading',
  },
];

export const ToolsDashboard: React.FC<ToolsDashboardProps> = ({
  onBackToHome,
  onSendToPrint,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showAllPdfTools, setShowAllPdfTools] = useState(false);

  const pdfTools = ALL_TOOLS.filter((t) => t.category === 'pdf');
  const imageTools = ALL_TOOLS.filter((t) => t.category === 'image');
  const scanTools = ALL_TOOLS.filter((t) => t.category === 'scan');

  const filteredTools = searchQuery.trim()
    ? ALL_TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.desc.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const handleToolClick = (id: ToolId) => {
    Haptics.buttonPress();
    setActiveToolId(id);
  };

  const renderToolButton = (tool: ToolDefinition) => {
    const IconComponent = tool.icon;
    return (
      <button
        key={tool.id}
        type="button"
        onClick={() => handleToolClick(tool.id)}
        className="group relative flex flex-col items-center text-center p-2 rounded-2xl hover:bg-[#F2F6F3] active:scale-95 transition-all"
      >
        {/* Soft Green Icon Container */}
        <div className="w-12 h-12 rounded-2xl bg-[#EDF5F0] border border-[#1B4D2E]/10 group-hover:border-[#1B4D2E]/25 text-[#1B4D2E] flex items-center justify-center mb-1.5 shadow-2xs group-hover:scale-105 transition-all">
          <IconComponent className="w-5 h-5 stroke-[2]" />
        </div>
        <span className="text-[11px] font-semibold text-[#191C1A] leading-tight line-clamp-2 max-w-[70px]">
          {tool.name}
        </span>
        {tool.tag && (
          <span className="mt-0.5 text-[8.5px] font-bold text-[#1B4D2E] bg-[#EDF5F0] px-1.5 py-0.2 rounded-full border border-[#1B4D2E]/15">
            {tool.tag}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col flex-1 w-full bg-[#F8FAF8] text-[#191C1A] pb-24">
      {/* 1. Header Section */}
      <header className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[#1B4D2E]/10 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Creator4Logo
            className="w-10 h-10 shrink-0"
            interactive
            onClick={onBackToHome}
          />
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-[#191C1A] leading-tight">
              Tools
            </h1>
            <p className="text-[11.5px] text-[#545D56] leading-tight">
              PDFs, photos and documents, all in one place.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            Haptics.buttonPress();
            onBackToHome();
          }}
          className="text-xs font-semibold text-[#1B4D2E] bg-[#EDF5F0] px-3 py-1.5 rounded-xl border border-[#1B4D2E]/15 active:scale-95"
        >
          Home
        </button>
      </header>

      {/* Main Container */}
      <main className="p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#707B72] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools (merge, compress, passport...)"
            className="w-full h-11 pl-10 pr-9 rounded-2xl bg-white border border-[#1B4D2E]/15 shadow-2xs text-xs text-[#191C1A] placeholder-[#707B72] focus:outline-hidden focus:border-[#1B4D2E]/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707B72] p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search Results Filter (if user is searching) */}
        {filteredTools ? (
          <section className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs">
            <h2 className="text-xs font-bold text-[#191C1A] mb-3">
              Matching Tools ({filteredTools.length})
            </h2>
            {filteredTools.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {filteredTools.map(renderToolButton)}
              </div>
            ) : (
              <p className="text-xs text-[#545D56] text-center py-4">
                No tools matched &ldquo;{searchQuery}&rdquo;. Try &ldquo;pdf&rdquo;, &ldquo;image&rdquo;, or &ldquo;scan&rdquo;.
              </p>
            )}
          </section>
        ) : (
          <>
            {/* Featured Hero Banner: Full-Screen PDF Editor */}
            <section
              aria-label="Full-Screen PDF Editor"
              className="p-4 rounded-3xl bg-gradient-to-br from-[#1B4D2E] via-[#225736] to-[#143B22] text-white shadow-md shadow-[#1B4D2E]/15 flex items-center justify-between gap-3 relative overflow-hidden"
            >
              <div className="flex flex-col gap-1 z-10 max-w-[220px]">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-bold text-emerald-200 w-fit backdrop-blur-xs">
                  <Sparkles className="w-3 h-3" />
                  <span>Pro PDF Studio</span>
                </div>
                <h2 className="text-sm font-bold leading-tight">
                  Full-Screen PDF Editor
                </h2>
                <p className="text-[11px] text-white/80 leading-normal">
                  Rotate, delete, reorder, crop margins &amp; strip blank pages in live preview.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  Haptics.buttonPress();
                  setIsEditorOpen(true);
                }}
                className="z-10 px-3.5 py-2 rounded-xl bg-white text-[#1B4D2E] font-bold text-xs shadow-md active:scale-95 transition-all shrink-0 flex items-center gap-1"
              >
                <span>Open</span>
                <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>

              <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none" />
            </section>

            {/* Section 1: PDF Tools Card with "See All" */}
            <section className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-black/[0.05]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <h2 className="text-xs font-bold text-[#191C1A]">PDF Tools</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    Haptics.buttonPress();
                    setShowAllPdfTools(true);
                  }}
                  className="text-[11px] font-bold text-[#1B4D2E] hover:underline"
                >
                  See All ({pdfTools.length})
                </button>
              </div>

              {/* 4-Column Grid for Mobile */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {pdfTools.slice(0, 8).map(renderToolButton)}
              </div>
            </section>

            {/* Section 2: Image & Photo Tools Card */}
            <section className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-black/[0.05]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <FileImage className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <h2 className="text-xs font-bold text-[#191C1A]">
                    Image &amp; Photo Tools
                  </h2>
                </div>
                <span className="text-[10px] text-[#545D56] font-medium">
                  {imageTools.length} Utilities
                </span>
              </div>

              {/* 4-Column Grid */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {imageTools.map(renderToolButton)}
              </div>
            </section>

            {/* Section 3: Scan & Document Tools Card */}
            <section className="p-4 rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xs">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-black/[0.05]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5 stroke-[2.2]" />
                  </div>
                  <h2 className="text-xs font-bold text-[#191C1A]">
                    Scan &amp; Document Tools
                  </h2>
                </div>
                <span className="text-[10px] text-[#545D56] font-medium">
                  Live Camera
                </span>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                {scanTools.map(renderToolButton)}
              </div>
            </section>
          </>
        )}
      </main>

      {/* See All PDF Tools Modal Dialog */}
      {showAllPdfTools && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-apple-reveal"
          onClick={() => setShowAllPdfTools(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white border border-[#1B4D2E]/15 shadow-xl p-5 animate-apple-card max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center">
                  <FileText className="w-4 h-4 stroke-[2.2]" />
                </div>
                <h3 className="text-sm font-bold text-[#191C1A]">All PDF Utilities</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAllPdfTools(false)}
                className="w-8 h-8 rounded-xl text-[#545D56] hover:bg-black/5 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 overflow-y-auto py-2">
              {pdfTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setShowAllPdfTools(false);
                    handleToolClick(tool.id);
                  }}
                  className="p-3 rounded-2xl bg-[#F8FAF8] border border-black/5 hover:border-[#1B4D2E]/30 flex flex-col items-center text-center active:scale-95 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EDF5F0] text-[#1B4D2E] flex items-center justify-center mb-1">
                    <tool.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-[#191C1A] leading-tight">
                    {tool.name}
                  </span>
                  <span className="text-[9px] text-[#545D56] mt-0.5 line-clamp-1">
                    {tool.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Individual Focused Tool Modal */}
      <IndividualToolModal
        toolId={activeToolId}
        onClose={() => setActiveToolId(null)}
        onSendToPrint={(file) => {
          onSendToPrint([file]);
        }}
      />

      {/* Full-Screen PDF Editor */}
      <FullScreenPdfEditor
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaveAndPrint={(file) => {
          setIsEditorOpen(false);
          onSendToPrint([file]);
        }}
      />
    </div>
  );
};
