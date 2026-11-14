import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  FileText,
  ArrowsIn,
  FileImage,
  Stack,
  ArrowClockwise,
  Trash,
  ArrowsDownUp,
  Crop,
  Scissors,
  FileMagnifyingGlass,
  FrameCorners,
  Sliders,
  UserCircleCheck,
  IdentificationCard,
  FilePlus,
  ArrowsClockwise,
  Camera,
  Copy,
  MagnifyingGlass,
  CaretRight,
  X,
} from '@phosphor-icons/react';
import { Creator4Logo } from '../Creator4Logo';
import { ToolId, IndividualToolModal } from './IndividualToolModal';
import { Haptics } from '../../utils/haptics';
import { useTranslation } from '../../utils/i18n';

interface ToolsDashboardProps {
  onBackToHome: () => void;
  onSendToPrint: (files: File[]) => void;
}

interface ToolDefinition {
  id: ToolId;
  name: string;
  category: 'pdf' | 'image' | 'scan';
  icon: React.FC<{ size?: number; weight?: 'regular' | 'bold' | 'duotone'; className?: string }>;
  desc: string;
}

const ALL_TOOLS: ToolDefinition[] = [
  // 1. PDF Tools
  {
    id: 'merge-pdf',
    name: 'Merge PDFs',
    category: 'pdf',
    icon: Stack,
    desc: 'Combine multiple PDF files into one document',
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    category: 'pdf',
    icon: Scissors,
    desc: 'Extract selected pages into a new PDF',
  },
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    category: 'pdf',
    icon: ArrowsIn,
    desc: 'Reduce file size while keeping text sharp',
  },
  {
    id: 'rotate-pages',
    name: 'Rotate Pages',
    category: 'pdf',
    icon: ArrowClockwise,
    desc: 'Rotate pages by 90°, 180°, or 270°',
  },
  {
    id: 'delete-pages',
    name: 'Remove Pages',
    category: 'pdf',
    icon: Trash,
    desc: 'Delete unwanted pages before printing',
  },
  {
    id: 'reorder-pages',
    name: 'Reorder Pages',
    category: 'pdf',
    icon: ArrowsDownUp,
    desc: 'Rearrange page sequence cleanly',
  },
  {
    id: 'pages-per-sheet',
    name: 'Pages / Sheet',
    category: 'pdf',
    icon: Copy,
    desc: 'Arrange 2 or 4 pages per sheet (N-Up)',
  },
  {
    id: 'crop-pages',
    name: 'Crop Pages',
    category: 'pdf',
    icon: Crop,
    desc: 'Trim outer page margins and whitespace',
  },
  {
    id: 'blank-page-removal',
    name: 'Blank Removal',
    category: 'pdf',
    icon: FileMagnifyingGlass,
    desc: 'Detect and strip empty pages automatically',
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    category: 'pdf',
    icon: FileImage,
    desc: 'Save each PDF page as a JPG image',
  },

  // 2. Image & Print Prep
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    category: 'image',
    icon: FilePlus,
    desc: 'Convert photos into a printable PDF',
  },
  {
    id: 'passport-photo',
    name: 'Passport Photo',
    category: 'image',
    icon: UserCircleCheck,
    desc: 'Tile 6 or 8 passport photos on A4',
  },
  {
    id: 'id-card-layout',
    name: 'ID Card Layout',
    category: 'image',
    icon: IdentificationCard,
    desc: 'Place front and back ID on one A4 page',
  },
  {
    id: 'resize-image',
    name: 'Resize Image',
    category: 'image',
    icon: FrameCorners,
    desc: 'Change pixel dimensions with aspect lock',
  },
  {
    id: 'image-crop',
    name: 'Crop Image',
    category: 'image',
    icon: Crop,
    desc: 'Trim photo framing and margins cleanly',
  },
  {
    id: 'image-enhancement',
    name: 'Enhance Photo',
    category: 'image',
    icon: Sliders,
    desc: 'Improve contrast, clarity, and tone',
  },
  {
    id: 'image-format-converter',
    name: 'Format Convert',
    category: 'image',
    icon: ArrowsClockwise,
    desc: 'Convert between JPG, PNG, and WebP',
  },

  // 3. Scan Tools
  {
    id: 'scan-to-pdf',
    name: 'Scan to PDF',
    category: 'scan',
    icon: Camera,
    desc: 'Capture a paper document into a PDF',
  },
  {
    id: 'multi-page-scan',
    name: 'Multi-Page Scan',
    category: 'scan',
    icon: Copy,
    desc: 'Snap multiple pages into one PDF',
  },
  {
    id: 'scan-enhancement',
    name: 'Scan Clean',
    category: 'scan',
    icon: Sliders,
    desc: 'High-contrast text cleanup filter',
  },
];

export const ToolsDashboard: React.FC<ToolsDashboardProps> = ({
  onBackToHome,
  onSendToPrint,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);

  const pdfTools = ALL_TOOLS.filter((tool) => tool.category === 'pdf');
  const imageTools = ALL_TOOLS.filter((tool) => tool.category === 'image');
  const scanTools = ALL_TOOLS.filter((tool) => tool.category === 'scan');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTools = normalizedQuery
    ? ALL_TOOLS.filter(
        (tool) =>
          tool.name.toLowerCase().includes(normalizedQuery) ||
          tool.desc.toLowerCase().includes(normalizedQuery)
      )
    : null;

  const handleToolClick = (id: ToolId) => {
    Haptics.buttonPress();
    setActiveToolId(id);
  };

  const renderToolRow = (tool: ToolDefinition) => {
    const IconComponent = tool.icon;
    return (
      <button
        key={tool.id}
        type="button"
        onClick={() => handleToolClick(tool.id)}
        className="w-full min-h-[62px] px-3.5 py-2.5 flex items-center gap-3 text-left hover:bg-[#F8FAF6] active:bg-[#EAF3ED]/60 active:scale-[0.99] transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-[#EAF3ED] border border-[#194F34]/10 text-[#194F34] flex items-center justify-center shrink-0 transition-colors group-hover:border-[#194F34]/25">
          <IconComponent size={20} weight="regular" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-[#191C1A] leading-tight truncate">
            {tool.name}
          </div>
          <div className="text-[12px] text-[#545D56] leading-snug truncate mt-0.5">
            {tool.desc}
          </div>
        </div>
        <CaretRight
          size={15}
          weight="bold"
          className="text-[#545D56]/60 group-hover:text-[#194F34] group-hover:translate-x-0.5 transition-all shrink-0"
          aria-hidden="true"
        />
      </button>
    );
  };

  const renderSection = (
    title: string,
    IconHeader: React.FC<{ size?: number; weight?: 'regular' | 'bold'; className?: string }>,
    tools: ToolDefinition[]
  ) => (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <IconHeader size={15} weight="bold" className="text-[#194F34]" aria-hidden="true" />
          <h2 className="text-[12.5px] font-bold text-[#191C1A] tracking-tight">{title}</h2>
        </div>
        <span className="text-[11px] font-medium text-[#545D56] tabular-nums">
          {tools.length} tools
        </span>
      </div>
      <div className="rounded-2xl bg-white border border-[#E2E7E1] divide-y divide-[#E2E7E1]/70 overflow-hidden">
        {tools.map(renderToolRow)}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col flex-1 w-full bg-[#F8FAF6] text-[#191C1A] pb-24">
      {/* Header */}
      <header className="px-4 pt-safe bg-white/95 border-b border-[#E2E7E1] sticky top-0 z-10 backdrop-blur-xs">
        <div className="max-w-lg mx-auto h-14 flex items-center justify-between gap-3">
          <Creator4Logo
            size="sm"
            interactive
            onClick={onBackToHome}
            className="shrink-0"
          />
          <button
            type="button"
            onClick={() => {
              Haptics.buttonPress();
              onBackToHome();
            }}
            className="min-h-[38px] px-3.5 rounded-xl text-[12px] font-semibold text-[#194F34] bg-[#EAF3ED] border border-[#194F34]/15 active:scale-95 transition-transform shrink-0"
          >
            {t.navHome}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 pt-4 pb-6 flex flex-col gap-5 max-w-lg mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-1"
        >
          <h1 className="text-[20px] font-bold text-[#191C1A] tracking-tight leading-tight">
            {t.toolsTitle}
          </h1>
          <p className="text-[13px] text-[#545D56] leading-snug">
            Useful tools to prepare your documents for printing.
          </p>
        </motion.div>

        {/* Search Input */}
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="text-[#545D56] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search document tools..."
            aria-label="Search document tools"
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-white border border-[#E2E7E1] text-[13px] text-[#191C1A] placeholder-[#6B756D] focus:outline-none focus:border-[#194F34] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#545D56] hover:text-[#191C1A]"
            >
              <X size={15} weight="bold" />
            </button>
          )}
        </div>

        {/* Filtered Results or Grouped Tool Sections */}
        {filteredTools ? (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            aria-label="Search results"
            className="flex flex-col gap-2"
          >
            <span className="text-[12px] font-bold text-[#191C1A] px-1 tabular-nums">
              Matching Tools ({filteredTools.length})
            </span>
            {filteredTools.length > 0 ? (
              <div className="rounded-2xl bg-white border border-[#E2E7E1] divide-y divide-[#E2E7E1]/70 overflow-hidden">
                {filteredTools.map(renderToolRow)}
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-[#E2E7E1] py-8 px-4 text-center">
                <p className="text-[13px] font-semibold text-[#191C1A]">
                  No tools matched &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-[12px] text-[#545D56] mt-1">
                  Try &ldquo;merge&rdquo;, &ldquo;split&rdquo;, &ldquo;compress&rdquo;, or &ldquo;passport&rdquo;.
                </p>
              </div>
            )}
          </motion.section>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-5"
          >
            {renderSection('PDF Tools', FileText, pdfTools)}
            {renderSection('Image & Print Prep', FileImage, imageTools)}
            {renderSection('Scan Tools', Camera, scanTools)}
          </motion.div>
        )}
      </main>

      {/* Focused Tool Modal */}
      <IndividualToolModal
        toolId={activeToolId}
        onClose={() => setActiveToolId(null)}
        onSendToPrint={(file) => {
          onSendToPrint([file]);
        }}
      />
    </div>
  );
};
