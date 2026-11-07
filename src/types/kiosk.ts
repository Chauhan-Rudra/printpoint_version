export type WorkflowStep =
  | 'home'         // Screen 1: Ready to print? + Add your documents
  | 'file-browser' // Screen 1B: Realistic Mobile Document Selection & File Manager
  | 'loading'      // Screen 2: Preparing your documents (real-time upload & processing)
  | 'documents'    // Screen 3: Uploaded documents list
  | 'preferences'  // Screen 4: Customize your print
  | 'summary'      // Screen 5: Review your print
  | 'payment';     // Step 9: Payment & printing completion

export type ColourOption = 'bw' | 'colour';
export type SidesOption = '1-sided' | '2-sided';

export type DocumentProcessingStatus =
  | 'Waiting'
  | 'Uploading...'
  | 'Processing document...'
  | 'Preparing preview...'
  | 'Ready'
  | 'Failed';

export type UploadVisualState =
  | 'Waiting'
  | 'Uploading'
  | 'Processing'
  | 'Completed'
  | 'Failed';

export type FileBrowserCategory = 'recent' | 'documents' | 'pdfs' | 'downloads';

export type FileFormatKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'presentation'
  | 'image'
  | 'text';

export interface VirtualFolder {
  id: string;
  name: string;
  fileCount: number;
  updatedLabel: string;
}

export interface VirtualFileItem {
  id: string;
  name: string;
  folderId: string;
  categoryTags: FileBrowserCategory[];
  formatKind: FileFormatKind;
  fileTypeLabel: string;
  sizeBytes: number;
  modifiedLabel: string;
  pageCount: number;
  blankPages?: number[];
}

export interface BlankPageItem {
  documentId: string;
  documentName: string;
  pageNumber: number; // 1-based page number in document
  state?: 'BLANK' | 'NOT_BLANK' | 'NEEDS_REVIEW';
  confidence: 'high' | 'needs_review';
  reason: string;
}

export interface BlankDetectionState {
  isAnalyzing: boolean;
  progress: { current: number; total: number };
  detectedItems: BlankPageItem[];
  removedItems: BlankPageItem[];
  hasScanned: boolean;
  error?: string;
}

export interface PrintDocumentSettings {
  colourMode: ColourOption;
  sides: SidesOption;
  copies: number;
  removeBlankPages: boolean;
}

export interface UploadedPrintDocument {
  id: string;
  orderIndex: number;
  name: string;
  sizeBytes: number;
  pageCount: number;
  originalPageCount?: number;
  blankPages?: number[];
  removedBlankPages?: number[];
  uncertainPages?: number[];
  isAnalyzingBlanks?: boolean;
  progressPercent: number;
  status: DocumentProcessingStatus;
  errorMessage?: string;
  rawFile?: File;
  originalFile?: File;
  modifiedLabel?: string;
  settings: PrintDocumentSettings;
}

export interface DocumentSummaryItem {
  id: string;
  name: string;
  originalPages: number;
  copies: number;
  colourMode: ColourOption;
  sides: SidesOption;
  estimatedSheets: number;
  subtotalPrice: number;
}

export interface MultiDocPrintSummary {
  documentCount: number;
  totalOriginalPages: number;
  colourModeLabel: string;
  sidesModeLabel: string;
  copiesLabel: string;
  totalEstimatedSheets: number;
  totalPrice: number;
  items: DocumentSummaryItem[];
}

