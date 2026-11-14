import {
  ColourOption,
  DocumentProcessingStatus,
  DocumentSummaryItem,
  FileBrowserCategory,
  FileFormatKind,
  MultiDocPrintSummary,
  PrintDocumentSettings,
  SidesOption,
  UploadedPrintDocument,
  UploadVisualState,
  VirtualFileItem,
  VirtualFolder,
} from '../types/kiosk';

export const PRICE_PER_PAGE_BW = 0.10;
export const PRICE_PER_PAGE_COLOUR = 0.30;

export const VIRTUAL_FOLDERS: VirtualFolder[] = [
  {
    id: 'downloads',
    name: 'Downloads',
    fileCount: 3,
    updatedLabel: 'Updated today',
  },
  {
    id: 'documents',
    name: 'Documents',
    fileCount: 3,
    updatedLabel: 'Updated yesterday',
  },
  {
    id: 'assignments',
    name: 'Assignments',
    fileCount: 2,
    updatedLabel: '2 days ago',
  },
  {
    id: 'projects',
    name: 'Projects',
    fileCount: 2,
    updatedLabel: 'Nov 1, 2026',
  },
];

export const VIRTUAL_FILES: VirtualFileItem[] = [
  {
    id: 'vf-assignment-01',
    name: 'Assignment_01.pdf',
    folderId: 'assignments',
    categoryTags: ['recent', 'pdfs', 'documents'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 1420000, // 1.4 MB
    modifiedLabel: 'Today, 10:24 AM',
    pageCount: 12,
  },
  {
    id: 'vf-project-report',
    name: 'Project_Report.pdf',
    folderId: 'projects',
    categoryTags: ['recent', 'pdfs', 'documents'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 2180000, // 2.1 MB
    modifiedLabel: 'Yesterday',
    pageCount: 8,
  },
  {
    id: 'vf-digital-comm',
    name: 'Digital_Communication.pdf',
    folderId: 'downloads',
    categoryTags: ['recent', 'pdfs', 'downloads'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 3450000, // 3.3 MB
    modifiedLabel: 'Nov 4, 2026',
    pageCount: 15,
  },
  {
    id: 'vf-resume',
    name: 'Resume.pdf',
    folderId: 'documents',
    categoryTags: ['recent', 'pdfs', 'documents'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 428000, // 418 KB
    modifiedLabel: 'Nov 2, 2026',
    pageCount: 2,
    blankPages: [2],
  },
  {
    id: 'vf-lecture-notes',
    name: 'Course_Outline_Notes.docx',
    folderId: 'documents',
    categoryTags: ['recent', 'documents'],
    formatKind: 'word',
    fileTypeLabel: 'Word Document',
    sizeBytes: 640000, // 625 KB
    modifiedLabel: 'Oct 30, 2026',
    pageCount: 6,
  },
  {
    id: 'vf-budget-sheet',
    name: 'Lab_Equipment_Schedule.xlsx',
    folderId: 'projects',
    categoryTags: ['recent', 'documents'],
    formatKind: 'excel',
    fileTypeLabel: 'Excel Spreadsheet',
    sizeBytes: 312000, // 305 KB
    modifiedLabel: 'Oct 28, 2026',
    pageCount: 3,
  },
  {
    id: 'vf-architecture-diagram',
    name: 'System_Diagram_A4.png',
    folderId: 'downloads',
    categoryTags: ['downloads'],
    formatKind: 'image',
    fileTypeLabel: 'PNG Image',
    sizeBytes: 890000, // 869 KB
    modifiedLabel: 'Oct 25, 2026',
    pageCount: 1,
  },
  {
    id: 'vf-lab-worksheet',
    name: 'Assignment_02_Lab_Sheet.pdf',
    folderId: 'assignments',
    categoryTags: ['pdfs', 'documents'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 980000, // 957 KB
    modifiedLabel: 'Oct 21, 2026',
    pageCount: 5,
  },
  {
    id: 'vf-invoice-receipt',
    name: 'Semester_Fee_Receipt.pdf',
    folderId: 'downloads',
    categoryTags: ['pdfs', 'downloads'],
    formatKind: 'pdf',
    fileTypeLabel: 'PDF Document',
    sizeBytes: 290000, // 283 KB
    modifiedLabel: 'Oct 18, 2026',
    pageCount: 1,
  },
  {
    id: 'vf-research-draft',
    name: 'Research_Proposal_Draft.docx',
    folderId: 'documents',
    categoryTags: ['documents'],
    formatKind: 'word',
    fileTypeLabel: 'Word Document',
    sizeBytes: 780000, // 762 KB
    modifiedLabel: 'Oct 14, 2026',
    pageCount: 9,
  },
];

export const SUPPORTED_FILE_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.txt',
  '.csv',
] as const;

export const NATIVE_FILE_ACCEPT_ATTR =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,text/plain,text/csv,application/csv';

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a selected file has a supported extension
 * (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, JPEG, PNG, TXT, CSV)
 * and a valid file size (> 0 bytes and <= 100 MB).
 */
export function validateSelectedFile(
  fileName: string,
  sizeBytes: number
): FileValidationResult {
  const trimmed = fileName.trim();
  const lower = trimmed.toLowerCase();
  const isSupportedExtension = SUPPORTED_FILE_EXTENSIONS.some((ext) =>
    lower.endsWith(ext)
  );

  if (!isSupportedExtension) {
    return {
      valid: false,
      error: `Unsupported file "${trimmed}". Allowed formats: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, JPEG, PNG, TXT, CSV.`,
    };
  }

  if (sizeBytes <= 0) {
    return {
      valid: false,
      error: `File "${trimmed}" is empty (0 bytes). Please select a valid document.`,
    };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${trimmed}" exceeds the 100 MB maximum size limit.`,
    };
  }

  return { valid: true };
}

export function getFileFingerprint(
  file: { name: string; size: number; lastModified?: number }
): string {
  const normalizedName = file.name.trim().toLowerCase();
  const mod = typeof file.lastModified === 'number' && file.lastModified > 0
    ? file.lastModified
    : 0;
  return `${normalizedName}::${file.size}::${mod}`;
}

export interface BatchFileValidationOutcome {
  validFiles: File[];
  errors: string[];
  duplicateFiles: string[];
}

/**
 * Validates incoming files against format/size rules and prevents duplicates
 * both within the newly selected batch and against already queued documents.
 */
export function validateAndDeduplicateFiles(
  incomingFiles: File[],
  existingDocuments: Pick<UploadedPrintDocument, 'name' | 'sizeBytes' | 'lastModified' | 'rawFile'>[] = []
): BatchFileValidationOutcome {
  const seenKeys = new Set<string>();
  for (const doc of existingDocuments) {
    const mod = doc.lastModified ?? doc.rawFile?.lastModified ?? 0;
    seenKeys.add(
      getFileFingerprint({
        name: doc.name,
        size: doc.sizeBytes,
        lastModified: mod,
      })
    );
  }

  const validFiles: File[] = [];
  const errors: string[] = [];
  const duplicateFiles: string[] = [];

  for (const file of incomingFiles) {
    const check = validateSelectedFile(file.name, file.size);
    if (!check.valid) {
      if (check.error) errors.push(check.error);
      continue;
    }

    const key = getFileFingerprint(file);
    if (seenKeys.has(key)) {
      duplicateFiles.push(file.name);
      errors.push(`"${file.name}" is already selected.`);
      continue;
    }

    seenKeys.add(key);
    validFiles.push(file);
  }

  return { validFiles, errors, duplicateFiles };
}

/**
 * Builds a unique deterministic session-scoped storage path for a kiosk upload.
 */
export function buildKioskStoragePath(
  stationId: string,
  sessionToken: string | undefined,
  docId: string,
  fileName: string
): string {
  const safeStation = stationId.replace(/[^a-zA-Z0-9_-]/g, '') || 'kiosk-default';
  const safeSession = (sessionToken || 'local-session').replace(/[^a-zA-Z0-9._-]/g, '');
  const safeFile = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
  return `kiosks/${safeStation}/sessions/${safeSession}/${docId}_${safeFile}`;
}

/**
 * Classifies a file name into one of our visual icon families:
 * pdf (red accent), word (blue accent), excel (green accent), presentation (amber/orange), image, or text.
 */
export function detectFileFormatKind(fileName: string): FileFormatKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(doc|docx|rtf|odt)$/i.test(lower)) return 'word';
  if (/\.(xls|xlsx|csv)$/i.test(lower)) return 'excel';
  if (/\.(ppt|pptx)$/i.test(lower)) return 'presentation';
  if (/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lower)) return 'image';
  return 'text';
}

export function getFileTypeShortLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.docx')) return 'DOCX';
  if (lower.endsWith('.doc')) return 'DOC';
  if (lower.endsWith('.xlsx')) return 'XLSX';
  if (lower.endsWith('.xls')) return 'XLS';
  if (lower.endsWith('.pptx')) return 'PPTX';
  if (lower.endsWith('.ppt')) return 'PPT';
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.png')) return 'PNG';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'JPG';
  if (lower.endsWith('.txt')) return 'TXT';
  return 'DOC';
}

/**
 * Filters virtual phone files by active folder, browse category, and search query.
 */
export function filterVirtualFiles(
  files: VirtualFileItem[],
  category: FileBrowserCategory,
  activeFolderId: string | null,
  searchQuery: string
): VirtualFileItem[] {
  const trimmedQuery = searchQuery.trim().toLowerCase();

  return files.filter((file) => {
    if (activeFolderId && file.folderId !== activeFolderId) {
      return false;
    }
    if (!activeFolderId && !file.categoryTags.includes(category)) {
      return false;
    }
    if (trimmedQuery.length > 0) {
      const matchesName = file.name.toLowerCase().includes(trimmedQuery);
      const matchesType = file.fileTypeLabel.toLowerCase().includes(trimmedQuery);
      return matchesName || matchesType;
    }
    return true;
  });
}

/**
 * Generates a compliant, multi-page binary PDF containing real PDF vector content,
 * text headings, diagrams, and tables readable by PDF.js (pdfjs-dist).
 * Supports generating genuine blank pages (empty stream).
 */
export function createValidPdfBinary(
  title: string,
  pages: number,
  blankPageList?: number[]
): Uint8Array {
  const objects: Array<{ num: number; content: string }> = [];
  function addObject(content: string): number {
    const num = objects.length + 1;
    objects.push({ num, content });
    return num;
  }

  const font1Num = 3;
  const font2Num = 4;

  // 1: Catalog
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages (placeholder, updated below)
  addObject('');
  // 3: Normal Font (Helvetica)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  // 4: Bold Font (Helvetica-Bold)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageNums: number[] = [];
  const safePages = Math.max(1, pages);
  const cleanTitle = title
    .replace(/\.[^/.]+$/, '')
    .replace(/[_\-]+/g, ' ')
    .trim();

  // Only designate blank pages if explicitly provided in blankPageList
  const resolvedBlanks = blankPageList !== undefined ? blankPageList : [];

  for (let i = 1; i <= safePages; i++) {
    const isBlank = resolvedBlanks.includes(i);

    let stream = '';
    if (isBlank) {
      stream = 'q Q';
    } else {
      const bar1 = 30 + ((i * 13) % 65);
      const bar2 = 45 + ((i * 9) % 55);
      const bar3 = 60 + ((i * 17) % 40);
      const bar4 = 25 + ((i * 21) % 70);
      const bar5 = 75 + ((i * 11) % 35);

      stream = [
        'q',
        // Top header banner in Creator4 brand green (#1B4D2E)
        '0.106 0.302 0.180 rg',
        '36 772 523 34 re f',
        'BT /F2 13 Tf 1 1 1 rg 48 784 Td (Creator4 Lab Kiosk - ' + cleanTitle + ') Tj ET',
        // Section Heading
        'BT /F2 12 Tf 0.106 0.302 0.180 rg 48 738 Td (SECTION 0' + i + ': Document Specification & Analysis) Tj ET',
        'BT /F1 9.5 Tf 0.3 0.3 0.3 rg 48 720 Td (High-resolution laser print preview with calibrated margin alignment) Tj ET',
        '0.85 0.88 0.86 RG 1.5 w 48 708 m 540 708 l S',
        // Body Paragraphs
        'BT /F1 9 Tf 0.2 0.2 0.2 rg 48 682 Td (This document has been verified for autonomous kiosk printing at Station #04.) Tj ET',
        'BT /F1 9 Tf 0.2 0.2 0.2 rg 48 666 Td (All vector diagrams, tabular benchmarks, and fonts are preserved at 1200 DPI output.) Tj ET',
        'BT /F1 9 Tf 0.2 0.2 0.2 rg 48 650 Td (Duplex sheet pairing and colour mode adjustments are dynamically calculated in real time.) Tj ET',
        // Key Metrics Box
        '0.96 0.98 0.96 rg 0.85 0.90 0.86 RG 1 w 48 576 492 52 re b',
        'BT /F2 8.5 Tf 0.106 0.302 0.180 rg 60 610 Td (MODULE REF) Tj 160 0 Td (COMPLIANCE RATE) Tj 170 0 Td (PRINT QUALITY) Tj ET',
        'BT /F2 12 Tf 0.106 0.302 0.180 rg 60 590 Td (M-10' + i + ') Tj ET',
        'BT /F2 12 Tf 0.145 0.388 0.922 rg 220 590 Td (' + (96 + (i % 4)) + '.4%) Tj ET',
        'BT /F2 12 Tf 0.851 0.467 0.024 rg 390 590 Td (Verified A4) Tj ET',
        // Vector Bar Chart
        'BT /F2 9.5 Tf 0.2 0.2 0.2 rg 48 546 Td (Figure ' + i + '.1 - Multi-Channel Allocation Performance) Tj ET',
        '0.106 0.302 0.180 rg 60 450 36 ' + bar1 + ' re f',
        '0.145 0.388 0.922 rg 120 450 36 ' + bar2 + ' re f',
        '0.063 0.725 0.506 rg 180 450 36 ' + bar3 + ' re f',
        '0.851 0.467 0.024 rg 240 450 36 ' + bar4 + ' re f',
        '0.486 0.227 0.929 rg 300 450 36 ' + bar5 + ' re f',
        '0.75 0.75 0.75 RG 1 w 48 450 320 0 re S',
        // Table Header and Rows
        '0.92 0.95 0.93 rg 48 396 492 20 re f',
        '0.85 0.88 0.86 RG 1 w 48 356 492 60 re S',
        'BT /F2 8.5 Tf 0.1 0.1 0.1 rg 58 402 Td (Parameter Item) Tj 200 0 Td (Specification Details) Tj 150 0 Td (Status) Tj ET',
        'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 58 382 Td (Page ' + i + ' Primary Target) Tj 200 0 Td (Calibrated Laser Margin: 12.7mm) Tj 150 0 Td (Passed) Tj ET',
        'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 58 364 Td (Encoding Standard) Tj 200 0 Td (PDF/X Standard PostScript Font) Tj 150 0 Td (Ready) Tj ET',
        // Bottom Footer Rule & Text
        '0.85 0.88 0.86 RG 1 w 48 48 m 540 48 l S',
        'BT /F1 8 Tf 0.4 0.4 0.4 rg 48 36 Td (Creator4 Lab Autonomous Print System) Tj 380 0 Td (Page ' + i + ' of ' + safePages + ') Tj ET',
        'Q',
      ].join('\n');
    }

    const encoder = new TextEncoder();
    const streamBytes = encoder.encode(stream);
    const streamObjNum = addObject(
      '<< /Length ' + streamBytes.length + ' >>\nstream\n' + stream + '\nendstream'
    );

    const pageObjNum = addObject(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ' +
        font1Num +
        ' 0 R /F2 ' +
        font2Num +
        ' 0 R >> >> /Contents ' +
        streamObjNum +
        ' 0 R >>'
    );
    pageNums.push(pageObjNum);
  }

  // Update object 2 (Pages tree)
  objects[1].content =
    '<< /Type /Pages /Kids [' +
    pageNums.map((n) => n + ' 0 R').join(' ') +
    '] /Count ' +
    safePages +
    ' >>';

  let pdfText = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj.num + ' 0 obj\n' + obj.content + '\nendobj\n';
  }
  const xrefOffset = pdfText.length;
  pdfText += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdfText += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdfText +=
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xrefOffset +
    '\n%%EOF';

  return new TextEncoder().encode(pdfText);
}

/**
 * Inspects binary bytes of a PDF file to detect any blank pages (e.g., empty stream
 * or minimal length stream with no drawing commands).
 */
export function detectBlankPagesFromBuffer(
  fileName: string,
  bytes: Uint8Array
): number[] {
  const blankPages: number[] = [];
  const lower = fileName.toLowerCase();

  // Single-page image or simple text files have no blank page removal needed
  if (/\.(png|jpg|jpeg|webp|gif|bmp|txt|csv|log)$/i.test(lower)) {
    return [];
  }

  let content = '';
  const maxScanBytes = Math.min(bytes.length, 2 * 1024 * 1024);
  const chunkSize = 8192;
  for (let i = 0; i < maxScanBytes; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, maxScanBytes));
    content += String.fromCharCode(...slice);
  }

  // Parse all indirect objects
  const objRegex = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  const objects = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(content)) !== null) {
    objects.set(Number.parseInt(m[1], 10), m[2]);
  }

  // Collect page objects either via /Kids in /Type /Pages or by finding /Type /Page objects
  const pageObjNums: number[] = [];
  for (const [, body] of objects.entries()) {
    if (/\/Type\s*\/Pages\b/i.test(body) && !/\/Type\s*\/Page\b(?!s)/i.test(body)) {
      const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
      if (kidsMatch) {
        const kidRefs = kidsMatch[1].match(/(\d+)\s+0\s+R/g);
        if (kidRefs) {
          for (const ref of kidRefs) {
            const num = Number.parseInt(ref.split(/\s+/)[0], 10);
            if (num && !pageObjNums.includes(num)) {
              pageObjNums.push(num);
            }
          }
        }
      }
    }
  }

  // Fallback: if /Kids was not found or flat, collect all objects with /Type /Page
  if (pageObjNums.length === 0) {
    for (const [id, body] of objects.entries()) {
      if (/\/Type\s*\/Page\b(?!s)/i.test(body)) {
        pageObjNums.push(id);
      }
    }
  }

  for (let idx = 0; idx < pageObjNums.length; idx++) {
    const pageNum = idx + 1;
    const pageObjId = pageObjNums[idx];
    const pageBody = objects.get(pageObjId);
    if (!pageBody) continue;

    // Check /Contents reference
    const contentsMatch = pageBody.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (!contentsMatch) {
      // A page object with no /Contents at all is completely empty
      if (!/\/Thumb\b/.test(pageBody) && !/\/Annots\b/.test(pageBody)) {
        blankPages.push(pageNum);
      }
      continue;
    }

    const streamObjId = Number.parseInt(contentsMatch[1], 10);
    const streamBody = objects.get(streamObjId);
    if (!streamBody) continue;

    // Extract stream content between "stream" and "endstream"
    const streamStartIdx = streamBody.indexOf('stream');
    const streamEndIdx = streamBody.lastIndexOf('endstream');
    if (streamStartIdx !== -1 && streamEndIdx > streamStartIdx) {
      let rawStream = streamBody.slice(streamStartIdx + 6, streamEndIdx);
      if (rawStream.startsWith('\r\n')) rawStream = rawStream.slice(2);
      else if (rawStream.startsWith('\n')) rawStream = rawStream.slice(1);
      if (rawStream.endsWith('\r\n')) rawStream = rawStream.slice(0, -2);
      else if (rawStream.endsWith('\n')) rawStream = rawStream.slice(0, -1);

      const trimmed = rawStream.trim();
      const hasText = /\b(Tj|TJ|BT|ET)\b/.test(trimmed);
      const hasDrawings = /\b(re|f|F|S|s|B|b|Do|BI|sh)\b/.test(trimmed);
      const isCompletelyEmpty =
        trimmed.length === 0 || trimmed === 'q Q' || trimmed === 'q\nQ' || trimmed === 'q\r\nQ';

      if (isCompletelyEmpty && !hasText && !hasDrawings) {
        blankPages.push(pageNum);
      }
    }
  }

  return blankPages;
}


/**
 * Constructs a real binary File object from a VirtualFileItem so that FileReader
 * progress events and detectActualPageCount operate on genuine binary data.
 */
export function buildRealFileFromVirtualItem(item: VirtualFileItem): File {
  const pages = Math.max(1, item.pageCount);
  let fullBuffer: Uint8Array;

  if (item.formatKind === 'pdf') {
    fullBuffer = createValidPdfBinary(item.name, pages, item.blankPages || []);
  } else {
    // Generate text or generic binary buffer
    const textSample = `Creator4 Lab Kiosk Document: ${item.name}\nPages: ${pages}\nSize: ${item.sizeBytes} bytes\nFormat: ${item.fileTypeLabel}\n`;
    const textBytes = new TextEncoder().encode(textSample);
    const targetByteLength = Math.max(textBytes.length, Math.min(item.sizeBytes, 64000));
    fullBuffer = new Uint8Array(targetByteLength);
    fullBuffer.set(textBytes, 0);
  }

  const file = new File([fullBuffer.buffer as ArrayBuffer], item.name, {
    type:
      item.formatKind === 'pdf'
        ? 'application/pdf'
        : item.formatKind === 'image'
        ? 'image/png'
        : 'application/octet-stream',
  });

  // Preserve displayed size metadata on a non-enumerable symbol/property if needed
  Object.defineProperty(file, 'virtualSizeBytes', {
    value: item.sizeBytes,
    writable: false,
  });
  Object.defineProperty(file, 'virtualModifiedLabel', {
    value: item.modifiedLabel,
    writable: false,
  });

  return file;
}

/**
 * Maps internal DocumentProcessingStatus to the 5 visual progress bar states:
 * Waiting, Uploading, Processing, Completed, Failed.
 */
export function getDocumentVisualState(
  status: DocumentProcessingStatus
): UploadVisualState {
  switch (status) {
    case 'Waiting':
      return 'Waiting';
    case 'Uploading...':
      return 'Uploading';
    case 'Processing document...':
    case 'Preparing preview...':
      return 'Processing';
    case 'Ready':
      return 'Completed';
    case 'Failed':
      return 'Failed';
  }
}

export interface OverallUploadMetrics {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  overallPercent: number;
  overallState: UploadVisualState;
  headlineStatus: string;
  activeDocumentName: string;
}

/**
 * Computes real-time overall upload metrics across all queued documents.
 */
export function computeOverallUploadMetrics(
  documents: UploadedPrintDocument[]
): OverallUploadMetrics {
  const totalCount = documents.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      completedCount: 0,
      failedCount: 0,
      overallPercent: 0,
      overallState: 'Waiting',
      headlineStatus: 'Waiting for documents...',
      activeDocumentName: '',
    };
  }

  const completedCount = documents.filter((d) => d.status === 'Ready').length;
  const failedCount = documents.filter((d) => d.status === 'Failed').length;
  const overallPercent = Math.round(
    documents.reduce((sum, doc) => sum + doc.progressPercent, 0) / totalCount
  );

  // Determine the currently active document
  const activeUploadingDoc = documents.find(
    (d) =>
      d.status === 'Uploading...' ||
      d.status === 'Processing document...' ||
      d.status === 'Preparing preview...'
  );
  const waitingDoc = documents.find((d) => d.status === 'Waiting');
  const failedDoc = documents.find((d) => d.status === 'Failed');
  const lastDoc = documents[documents.length - 1];

  const activeDoc =
    activeUploadingDoc || failedDoc || waitingDoc || lastDoc;

  let overallState: UploadVisualState = 'Uploading';
  let headlineStatus = 'Uploading documents...';

  if (failedCount > 0 && !activeUploadingDoc) {
    overallState = 'Failed';
    headlineStatus = 'Upload interrupted';
  } else if (completedCount === totalCount) {
    overallState = 'Completed';
    headlineStatus = 'All documents uploaded';
  } else if (
    activeUploadingDoc &&
    (activeUploadingDoc.status === 'Processing document...' ||
      activeUploadingDoc.status === 'Preparing preview...')
  ) {
    overallState = 'Processing';
    headlineStatus = 'Processing documents...';
  } else if (overallPercent === 0 || (!activeUploadingDoc && waitingDoc)) {
    overallState = 'Waiting';
    headlineStatus = 'Waiting to upload...';
  }

  return {
    totalCount,
    completedCount,
    failedCount,
    overallPercent,
    overallState,
    headlineStatus,
    activeDocumentName: activeDoc ? activeDoc.name : '',
  };
}

/**
 * Inspects actual binary file contents to determine exact page count for PDFs,
 * text documents, or images.
 */
export function detectActualPageCount(fileName: string, bytes: Uint8Array): number {
  const lower = fileName.toLowerCase();

  // Single-page image formats
  if (/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lower)) {
    return 1;
  }

  // Decode Latin1 string from byte buffer to inspect PDF dictionary markers or text lines
  let content = '';
  const maxScanBytes = Math.min(bytes.length, 2 * 1024 * 1024); // Scan up to 2MB for speed
  const chunkSize = 8192;
  for (let i = 0; i < maxScanBytes; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, maxScanBytes));
    content += String.fromCharCode(...slice);
  }

  // Check if file is a PDF by header or extension
  if (lower.endsWith('.pdf') || content.startsWith('%PDF-')) {
    // 1. Count explicit "/Type /Page" leaf objects (not "/Type /Pages")
    const pageMatches = content.match(/\/Type\s*\/Page\b(?!s)/g);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    // 2. Fallback to "/Count N" in the PDF Pages tree root
    const countMatches = [...content.matchAll(/\/Count\s+(\d+)/g)];
    if (countMatches.length > 0) {
      const counts = countMatches
        .map((m) => Number.parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n) && n > 0 && n < 5000);
      if (counts.length > 0) {
        return Math.max(...counts);
      }
    }
  }

  // Plain text / markdown files: count actual lines (45 lines per printed page)
  if (/\.(txt|md|csv|log)$/i.test(lower)) {
    const lineCount = content.split(/\r\n|\r|\n/).length;
    return Math.max(1, Math.ceil(lineCount / 45));
  }

  // Office documents (.doc, .docx) or PDFs with compressed cross-reference streams
  if (bytes.length > 0) {
    return Math.max(1, Math.ceil(bytes.length / 48000));
  }

  return 1;
}

/**
 * Calculates physical sheet count for a single document given its page count,
 * 1-sided vs 2-sided selection, and number of copies.
 */
export function calculateDocumentSheets(
  pageCount: number,
  sides: SidesOption,
  copies: number
): number {
  const safePages = Math.max(1, pageCount);
  const safeCopies = Math.max(1, copies);
  const sheetsPerCopy = sides === '2-sided' ? Math.ceil(safePages / 2) : safePages;
  return sheetsPerCopy * safeCopies;
}

/**
 * Calculates price for a single document based on pages, colour mode, and copies.
 */
export function calculateDocumentPrice(
  pageCount: number,
  colourMode: ColourOption,
  copies: number
): number {
  const safePages = Math.max(1, pageCount);
  const safeCopies = Math.max(1, copies);
  const rate = colourMode === 'colour' ? PRICE_PER_PAGE_COLOUR : PRICE_PER_PAGE_BW;
  return Number((safePages * safeCopies * rate).toFixed(2));
}

/**
 * Computes the complete Screen 5 Print Summary across all ready documents.
 */
export function calculateMultiDocPrintSummary(
  documents: UploadedPrintDocument[]
): MultiDocPrintSummary {
  const readyDocs = documents
    .filter((d) => d.status === 'Ready')
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (readyDocs.length === 0) {
    return {
      documentCount: 0,
      totalOriginalPages: 0,
      colourModeLabel: 'Black & White',
      sidesModeLabel: '1-Sided',
      copiesLabel: '1 copy',
      totalEstimatedSheets: 0,
      totalPrice: 0,
      items: [],
    };
  }

  let totalOriginalPages = 0;
  let totalEstimatedSheets = 0;
  let totalPrice = 0;

  const colourModes = new Set<ColourOption>();
  const sidesModes = new Set<SidesOption>();
  const copiesValues = new Set<number>();

  const items: DocumentSummaryItem[] = readyDocs.map((doc) => {
    const { colourMode, sides, copies } = doc.settings;
    colourModes.add(colourMode);
    sidesModes.add(sides);
    copiesValues.add(copies);

    const rawPages = doc.pageCount;
    const blankCount = doc.blankPages?.length ?? 0;
    const effectivePages = doc.settings.removeBlankPages
      ? Math.max(1, rawPages - blankCount)
      : rawPages;

    const estimatedSheets = calculateDocumentSheets(effectivePages, sides, copies);
    const subtotalPrice = calculateDocumentPrice(effectivePages, colourMode, copies);

    totalOriginalPages += rawPages;
    totalEstimatedSheets += estimatedSheets;
    totalPrice += subtotalPrice;

    return {
      id: doc.id,
      name: doc.name,
      originalPages: rawPages,
      copies,
      colourMode,
      sides,
      estimatedSheets,
      subtotalPrice,
    };
  });

  const colourModeLabel =
    colourModes.size === 1
      ? colourModes.has('colour')
        ? 'Colour'
        : 'Black & White'
      : 'Mixed (Per-document)';

  const sidesModeLabel =
    sidesModes.size === 1
      ? sidesModes.has('2-sided')
        ? '2-Sided'
        : '1-Sided'
      : 'Mixed (Per-document)';

  const singleCopyVal = copiesValues.values().next().value ?? 1;
  const copiesLabel =
    copiesValues.size === 1
      ? `${singleCopyVal} ${singleCopyVal === 1 ? 'copy' : 'copies'}`
      : 'Custom per document';

  return {
    documentCount: readyDocs.length,
    totalOriginalPages,
    colourModeLabel,
    sidesModeLabel,
    copiesLabel,
    totalEstimatedSheets,
    totalPrice: Number(totalPrice.toFixed(2)),
    items,
  };
}

/**
 * Applies global settings to all documents in the list.
 */
export function applyGlobalSettingsToDocs(
  documents: UploadedPrintDocument[],
  globalSettings: PrintDocumentSettings
): UploadedPrintDocument[] {
  return documents.map((doc) => ({
    ...doc,
    settings: { ...globalSettings },
  }));
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export const PRICE_INR_PER_PAGE_BW = 1;
export const PRICE_INR_PER_PAGE_COLOUR = 3;

export interface LivePrintEstimate {
  documentCount: number;
  totalOriginalPages: number;
  totalBlankPagesCount: number;
  totalPrintedPages: number;
  totalSheets: number;
  copies: number;
  colourModeLabel: 'Black & White' | 'Colour';
  sidesModeLabel: '1-Sided' | '2-Sided';
  pricePerPageBw: number;
  pricePerPageColour: number;
  estimatedTotalInr: number;
  removedBlankPagesSavedInr: number;
  removedBlankPagesSavedSheets: number;
  removeBlankPages: boolean;
}

/**
 * Calculates live print estimate in INR (₹) that dynamically updates when
 * Colour Mode (B&W vs Colour), Print Sides (1-Sided vs 2-Sided), Copies,
 * or Remove Blank Pages change.
 */
export function calculateLivePrintEstimate(
  documents: UploadedPrintDocument[],
  settings: PrintDocumentSettings
): LivePrintEstimate {
  const readyDocs = documents.filter((d) => d.status === 'Ready');
  const activeDocs = readyDocs.length > 0 ? readyDocs : documents;
  const documentCount = activeDocs.length;
  const totalOriginalPages = activeDocs.reduce(
    (sum, doc) => sum + Math.max(1, doc.pageCount),
    0
  );
  const totalBlankPagesCount = activeDocs.reduce(
    (sum, doc) => sum + (doc.blankPages?.length ?? 0),
    0
  );

  const safeCopies = Math.max(1, settings.copies);
  const shouldRemoveBlankPages = settings.removeBlankPages ?? true;

  let totalSheets = 0;
  let perCopyCostInr = 0;
  let totalPrintedPages = 0;

  // Baseline metrics without blank pages removed to calculate monetary & paper savings
  let baselineSheets = 0;
  let baselineCostInr = 0;

  const singlePageRate =
    settings.colourMode === 'colour'
      ? PRICE_INR_PER_PAGE_COLOUR
      : PRICE_INR_PER_PAGE_BW;

  // Duplex (2-sided) saves physical sheets and applies a paper-saving duplex rate per sheet
  const duplexFullSheetRate = settings.colourMode === 'colour' ? 5 : 1.5;

  for (const doc of activeDocs) {
    const rawPages = Math.max(1, doc.pageCount);
    const blanks = doc.blankPages?.length ?? 0;
    const effectivePages = shouldRemoveBlankPages
      ? Math.max(1, rawPages - blanks)
      : rawPages;

    totalPrintedPages += effectivePages * safeCopies;

    const sheetsForDoc = calculateDocumentSheets(effectivePages, settings.sides, safeCopies);
    totalSheets += sheetsForDoc;

    if (settings.sides === '1-sided') {
      perCopyCostInr += effectivePages * singlePageRate;
    } else {
      const fullDuplexSheets = Math.floor(effectivePages / 2);
      const remainderSinglePage = effectivePages % 2;
      perCopyCostInr +=
        fullDuplexSheets * duplexFullSheetRate +
        remainderSinglePage * singlePageRate;
    }

    // Baseline calculation
    const baseSheets = calculateDocumentSheets(rawPages, settings.sides, safeCopies);
    baselineSheets += baseSheets;
    if (settings.sides === '1-sided') {
      baselineCostInr += rawPages * singlePageRate;
    } else {
      const fullDuplex = Math.floor(rawPages / 2);
      const remainder = rawPages % 2;
      baselineCostInr +=
        fullDuplex * duplexFullSheetRate + remainder * singlePageRate;
    }
  }

  const estimatedTotalInr = Number((perCopyCostInr * safeCopies).toFixed(2));
  const baselineTotalInr = Number((baselineCostInr * safeCopies).toFixed(2));

  const removedBlankPagesSavedInr = shouldRemoveBlankPages
    ? Math.max(0, baselineTotalInr - estimatedTotalInr)
    : 0;
  const removedBlankPagesSavedSheets = shouldRemoveBlankPages
    ? Math.max(0, baselineSheets - totalSheets)
    : 0;

  return {
    documentCount,
    totalOriginalPages,
    totalBlankPagesCount,
    totalPrintedPages,
    totalSheets,
    copies: safeCopies,
    colourModeLabel:
      settings.colourMode === 'colour' ? 'Colour' : 'Black & White',
    sidesModeLabel: settings.sides === '2-sided' ? '2-Sided' : '1-Sided',
    pricePerPageBw: PRICE_INR_PER_PAGE_BW,
    pricePerPageColour: PRICE_INR_PER_PAGE_COLOUR,
    estimatedTotalInr,
    removedBlankPagesSavedInr,
    removedBlankPagesSavedSheets,
    removeBlankPages: shouldRemoveBlankPages,
  };
}

export function formatInrCurrency(amount: number): string {
  if (Number.isInteger(amount)) {
    return `₹${amount}`;
  }
  return `₹${amount.toFixed(2)}`;
}

export interface RenderedPageSpec {
  pageNumber: number;
  totalPages: number;
  documentTitle: string;
  sectionKicker: string;
  sectionHeading: string;
  paragraphs: string[];
  keyMetrics: Array<{ label: string; value: string; accent: string }>;
  chartBars: number[];
  tableRows: Array<{ col1: string; col2: string; col3: string }>;
}

/**
 * Generates deterministic, content-aware page layout data from an uploaded document's
 * filename, extracted binary text strings, and specific page number (1..totalPages).
 */
export function buildDocumentPageContent(
  fileName: string,
  pageNumber: number,
  totalPages: number,
  extractedLines: string[] = []
): RenderedPageSpec {
  const cleanTitle = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const sectionThemes = [
    'Executive Summary & Objectives',
    'System Architecture & Methodology',
    'Experimental Data & Analysis',
    'Implementation & Field Results',
    'Performance Benchmarks & Metrics',
    'Resource Allocation & Schedule',
    'Technical Specifications & Appendix',
  ];

  const themeIdx = (pageNumber - 1) % sectionThemes.length;
  const sectionHeading =
    extractedLines[0] && pageNumber === 1
      ? extractedLines[0]
      : `${pageNumber}. ${sectionThemes[themeIdx]}`;

  const defaultParagraphs = [
    `Document "${cleanTitle}" — Page ${pageNumber} of ${totalPages}. Prepared for high-resolution A4 laser output with calibrated margin alignment.`,
    `Section ${pageNumber}.1 outlines the core parameters, structural diagrams, and verification criteria established for this module.`,
    `All figures, tables, and visual callouts on Page ${pageNumber} dynamically reflect the active colour and duplex printing configuration.`,
  ];

  const usableExtracted = extractedLines
    .slice((pageNumber - 1) * 3, pageNumber * 3)
    .filter((line) => line.length > 8);

  const paragraphs =
    usableExtracted.length > 0
      ? [...usableExtracted, ...defaultParagraphs].slice(0, 3)
      : defaultParagraphs;

  const seed =
    cleanTitle.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    pageNumber * 17;

  const chartBars = [
    42 + (seed % 45),
    58 + ((seed * 3) % 35),
    35 + ((seed * 7) % 55),
    64 + ((seed * 5) % 30),
    48 + ((seed * 11) % 44),
  ];

  return {
    pageNumber,
    totalPages,
    documentTitle: cleanTitle || fileName,
    sectionKicker: `SECTION 0${pageNumber} · ${getFileTypeShortLabel(fileName)} DOCUMENT`,
    sectionHeading,
    paragraphs,
    keyMetrics: [
      {
        label: 'Module Index',
        value: `M-${100 + pageNumber * 4}`,
        accent: '#1B4D2E',
      },
      {
        label: 'Accuracy',
        value: `${94 + (pageNumber % 6)}.2%`,
        accent: '#2563EB',
      },
      {
        label: 'Status',
        value: 'Verified',
        accent: '#D97706',
      },
    ],
    chartBars,
    tableRows: [
      {
        col1: `Item ${pageNumber}.1`,
        col2: 'Primary Specification',
        col3: `${12 + pageNumber * 3} units`,
      },
      {
        col1: `Item ${pageNumber}.2`,
        col2: 'Validation Threshold',
        col3: `${85 + (pageNumber % 12)}%`,
      },
    ],
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}


