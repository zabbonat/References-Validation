/**
 * PDF/DOCX Text Extraction & Reference Section Detection Service
 * 
 * Extracts text from uploaded PDF/DOCX files, finds the References section,
 * and returns individual reference strings ready for batch checking.
 */

// ===== REFERENCE SECTION HEADINGS =====
// Matches headings in multiple languages and formats
const REFERENCE_HEADINGS = [
  // English
  'references', 'bibliography', 'literature', 'works cited', 'cited literature',
  'literature cited', 'citations', 'reference list', 'works referenced',
  // Italian
  'riferimenti', 'riferimenti bibliografici', 'bibliografia',
  // Spanish
  'bibliografía', 'referencias', 'referencias bibliográficas',
  // Portuguese
  'referências', 'referências bibliográficas',
  // French
  'bibliographie', 'références', 'références bibliographiques',
  // German
  'literaturverzeichnis', 'literatur', 'quellenverzeichnis', 'quellen',
  // Chinese/Japanese (romanized for regex)
  'cankao wenxian', // 参考文献
];

// Build a regex that matches any of these headings as a line heading
// Handles: "References", "REFERENCES", "8. References", "VIII. References", "References:", etc.
const buildHeadingRegex = (): RegExp => {
  const headingAlts = REFERENCE_HEADINGS.join('|');
  // Match optional numbering (1., VIII., etc.) + heading + optional punctuation and trailing page numbers
  return new RegExp(
    `^\\s*(?:[0-9IVXLC]+[.\\s)]+)?\\s*(${headingAlts})\\s*[:\\s\\d.\\-]*$`,
    'im'
  );
};

const HEADING_REGEX = buildHeadingRegex();

// Headings that signal the END of the references section
const END_SECTION_HEADINGS = [
  'appendix', 'appendices', 'supplementary', 'supplementary material',
  'supplementary materials', 'supporting information',
  'acknowledgment', 'acknowledgments', 'acknowledgement', 'acknowledgements',
  'about the author', 'about the authors', 'author contributions',
  'author biography', 'biographies', 'vita', 'curriculum vitae',
  'conflict of interest', 'conflicts of interest', 'declaration',
  'funding', 'data availability', 'ethics statement',
  'annexe', 'annexes', 'anhang', 'ringraziamenti', 'agradecimientos',
];

const buildEndSectionRegex = (): RegExp => {
  const alts = END_SECTION_HEADINGS.join('|');
  return new RegExp(
    `^\\s*(?:[0-9IVXLC]+[.\\s)]+)?\\s*(${alts})\\s*[:\\s]*$`,
    'im'
  );
};

const END_SECTION_REGEX = buildEndSectionRegex();

/**
 * Extract text from a PDF file using pdf.js
 * Only extracts text from the last N pages (default: 50) where references typically are
 */
export const extractTextFromPdf = async (file: File, lastNPages: number = 50): Promise<string> => {
  // Dynamic import of pdf.js
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker source - use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const totalPages = pdf.numPages;
  const startPage = Math.max(1, totalPages - lastNPages + 1);
  
  const pageTexts: string[] = [];
  
  for (let i = startPage; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Extract text items and preserve line breaks
    const pageText = textContent.items
      .map((item: any) => {
        if ('str' in item) {
          // If the item signals an end-of-line, append a newline, otherwise a space
          return item.str + (item.hasEOL ? '\n' : ' ');
        }
        return '';
      })
      .join('');
    
    pageTexts.push(pageText);
  }
  
  return pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
};

/**
 * Extract text from a DOCX file using mammoth
 */
export const extractTextFromDocx = async (file: File): Promise<string> => {
  // @ts-ignore
  const mammoth = await import('mammoth/mammoth.browser');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

/**
 * Find the References section in extracted text
 * Returns the text of just the references section, or null if not found
 */
export const findReferencesSection = (text: string): { found: boolean; sectionText: string; headingMatch: string } => {
  // Remove page break markers for section detection
  const cleanText = text.replace(/---\s*PAGE BREAK\s*---/g, '\n');
  
  // Find ALL occurrences of reference headings, take the LAST one
  // (papers often mention "References" in the introduction/body too)
  const lines = cleanText.split('\n');
  let lastHeadingIdx = -1;
  let lastHeadingMatch = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (HEADING_REGEX.test(line)) {
      lastHeadingIdx = i;
      lastHeadingMatch = line;
    }
  }
  
  if (lastHeadingIdx === -1) {
    // No heading found — return all text as fallback
    // (user will see a warning and can review)
    return {
      found: false,
      sectionText: cleanText,
      headingMatch: ''
    };
  }
  
  // Take everything after the heading
  const afterHeading = lines.slice(lastHeadingIdx + 1);
  
  // Find where the references section ends (next major heading)
  let endIdx = afterHeading.length;
  for (let i = 0; i < afterHeading.length; i++) {
    const line = afterHeading[i].trim();
    if (END_SECTION_REGEX.test(line)) {
      endIdx = i;
      break;
    }
  }
  
  const sectionLines = afterHeading.slice(0, endIdx);
  
  return {
    found: true,
    sectionText: sectionLines.join('\n'),
    headingMatch: lastHeadingMatch
  };
};

/**
 * Clean extracted reference text from PDF artifacts
 * - Remove page numbers, headers/footers
 * - Join broken lines within a single reference
 * - Remove empty lines between parts of the same reference
 */
export const cleanExtractedText = (text: string): string => {
  let cleaned = text
    // Remove standalone page numbers
    .replace(/^\s*\d{1,4}\s*$/gm, '')
    // Remove common header/footer patterns
    .replace(/^\s*(Downloaded from|Copyright ©|All rights reserved|Published by|doi:|DOI:).+$/gim, '')
    // Remove URLs that are standalone (not part of a reference)
    .replace(/^\s*https?:\/\/\S+\s*$/gm, '')
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return cleaned;
};

/**
 * Split reference section text into individual references
 * Handles numbered ([1], 1., (1)) and unnumbered (APA paragraph) styles
 */
export const splitIntoReferences = (sectionText: string): string[] => {
  const cleaned = cleanExtractedText(sectionText);
  if (!cleaned) return [];
  
  const lines = cleaned.split('\n');
  const refs: string[] = [];
  
  // Detect if references are numbered
  const numberedPattern = /^\s*[\[(]?\d{1,4}[\].)]\s*/;
  const hasNumbering = lines.filter(l => numberedPattern.test(l)).length >= 2;
  
  if (hasNumbering) {
    // Numbered references: split on number markers
    let currentRef = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (numberedPattern.test(trimmed)) {
        // New reference starts
        if (currentRef.trim()) {
          refs.push(currentRef.trim());
        }
        currentRef = trimmed;
      } else {
        // Continuation of current reference
        currentRef += ' ' + trimmed;
      }
    }
    if (currentRef.trim()) {
      refs.push(currentRef.trim());
    }
  } else {
    // Unnumbered (APA/paragraph style): split on blank lines or detect
    // references by looking for year patterns at line starts
    let currentRef = '';
    let prevLineEmpty = true;
    
    // Pattern: Capital letter, up to 250 characters, then (YYYY) or (YYYYa)
    const apaStartPattern = /^[A-Z\u00C0-\u024F].{0,250}?\(\d{4}[a-z]?\)/;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        // Blank line — might separate references
        if (currentRef.trim()) {
          refs.push(currentRef.trim());
          currentRef = '';
        }
        prevLineEmpty = true;
        continue;
      }
      
      // Heuristic 1: After a blank line, starting with a capital letter
      const looksLikeNewRefAfterBlank = prevLineEmpty && /^[A-Z\u00C0-\u024F]/.test(trimmed);
      
      // Heuristic 2: Line starts with typical APA author+year pattern AND previous line ended with punctuation
      const endsWithPunctuation = /[.\d)\]>]$/.test(currentRef.trim());
      const looksLikeNewRefPattern = endsWithPunctuation && apaStartPattern.test(trimmed);
      
      if ((looksLikeNewRefAfterBlank || looksLikeNewRefPattern) && currentRef.trim()) {
        refs.push(currentRef.trim());
        currentRef = trimmed;
      } else {
        currentRef += (currentRef ? ' ' : '') + trimmed;
      }
      
      prevLineEmpty = false;
    }
    if (currentRef.trim()) {
      refs.push(currentRef.trim());
    }
  }
  
  // Filter out very short strings (likely noise) and very long ones (likely paragraphs, not refs)
  return refs.filter(r => r.length > 15 && r.length < 2000);
};

/**
 * Determine if a file is a supported type
 */
export const getSupportedFileType = (file: File): 'pdf' | 'docx' | null => {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  return null;
};

/**
 * Full pipeline: extract text → find references → split into individual refs
 */
export const extractReferencesFromFile = async (file: File): Promise<{
  totalPages?: number;
  extractedText: string;
  referencesFound: boolean;
  headingMatch: string;
  references: string[];
  error?: string;
}> => {
  try {
    const fileType = getSupportedFileType(file);
    if (!fileType) {
      return {
        extractedText: '',
        referencesFound: false,
        headingMatch: '',
        references: [],
        error: `Unsupported file type: ${file.name}. Use PDF or DOCX.`
      };
    }
    
    // Step 1: Extract text
    let rawText: string;
    if (fileType === 'pdf') {
      rawText = await extractTextFromPdf(file, 50);
    } else {
      rawText = await extractTextFromDocx(file);
    }
    
    if (!rawText || rawText.trim().length < 50) {
      return {
        extractedText: rawText || '',
        referencesFound: false,
        headingMatch: '',
        references: [],
        error: 'Could not extract text from file. It may be a scanned/image-based PDF.'
      };
    }
    
    // Step 2: Find references section
    const { found, sectionText, headingMatch } = findReferencesSection(rawText);
    
    // Step 3: Split into individual references
    const references = splitIntoReferences(sectionText);
    
    return {
      extractedText: rawText,
      referencesFound: found,
      headingMatch,
      references
    };
  } catch (error) {
    console.error(`Error processing ${file.name}:`, error);
    return {
      extractedText: '',
      referencesFound: false,
      headingMatch: '',
      references: [],
      error: `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};
