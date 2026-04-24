/**
 * Plain-Text Reference Parser
 * Parses common reference formats (APA, Vancouver, Chinese [J]/[M], numbered)
 * into structured metadata for batch validation.
 */

export interface ParsedPlainTextRef {
    raw: string;
    title?: string;
    authors?: string;
    journal?: string;
    year?: string;
    doi?: string;
    refNumber?: number; // e.g., [1], [23]
}

/**
 * Extract DOI from a reference string
 */
const extractDOI = (ref: string): string | undefined => {
    // Match DOI patterns: DOI:10.xxx/yyy or https://doi.org/10.xxx/yyy
    const doiPatterns = [
        /(?:DOI\s*[：:]\s*)(10\.\d{4,9}\/[^\s,;]+)/i,
        /(?:https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,;]+)/i,
        /\b(10\.\d{4,9}\/[^\s,;]+)/
    ];
    for (const pattern of doiPatterns) {
        const match = ref.match(pattern);
        if (match) return match[1].replace(/[.\s]+$/, ''); // trim trailing dots/spaces
    }
    return undefined;
};

/**
 * Extract year from a reference string
 */
const extractYear = (ref: string): string | undefined => {
    // Look for 4-digit years (1900-2099)
    const years = ref.match(/\b(19|20)\d{2}\b/g);
    if (years && years.length > 0) {
        // Return the first year found (usually publication year)
        return years[0];
    }
    return undefined;
};

/**
 * Extract reference number like [1], [23], (1), etc.
 */
const extractRefNumber = (ref: string): number | undefined => {
    const match = ref.match(/^\s*[\[(\s]*(\d{1,4})[\])\s]*[.\s]/);
    if (match) return parseInt(match[1]);
    return undefined;
};

/**
 * Parse a Chinese-style reference with [J], [M], [C], etc. markers
 * Format: [N]Authors. Title[J]. Journal, Year, Vol(Issue): Pages. DOI:...
 */
const parseChineseStyle = (ref: string): ParsedPlainTextRef | null => {
    // Detect Chinese-style markers
    if (!/\[\s*[JMCDRSZN]\s*\]/.test(ref)) return null;

    const result: ParsedPlainTextRef = { raw: ref };
    result.refNumber = extractRefNumber(ref);
    result.doi = extractDOI(ref);
    result.year = extractYear(ref);

    // Remove ref number prefix
    let cleaned = ref.replace(/^\s*[\[(\s]*\d{1,4}[\])\s]*[.\s]?/, '').trim();

    // Split on the type marker [J], [M], etc.
    const markerMatch = cleaned.match(/^(.*?)\[\s*[JMCDRSZN]\s*\]/);
    if (markerMatch) {
        const beforeMarker = markerMatch[1].trim();
        const afterMarker = cleaned.substring(markerMatch[0].length).trim();

        // Before marker: "Authors. Title" — split on the LAST period before the marker
        // The title is typically after the last author-related period
        const authorTitleSplit = beforeMarker.match(/^(.+?)\.\s*(.+?)\.?\s*$/);
        if (authorTitleSplit) {
            result.authors = authorTitleSplit[1].trim().replace(/\.$/, '');
            result.title = authorTitleSplit[2].trim().replace(/\.$/, '');
        } else {
            // Fallback: entire before-marker text is the title
            result.title = beforeMarker.replace(/\.$/, '');
        }

        // After marker: ".Journal, Year, Vol(Issue): Pages"
        if (afterMarker) {
            // Extract journal (first segment before comma or year)
            const journalMatch = afterMarker.match(/^\.?\s*([^,]+?)[\s,]*(?:\d{4}|$)/);
            if (journalMatch) {
                result.journal = journalMatch[1].trim().replace(/\.$/, '');
            }
        }
    }

    // Clean up title — remove trailing dots and markers
    if (result.title) {
        result.title = result.title
            .replace(/\[\s*[JMCDRSZN]\s*\]/g, '')
            .replace(/\.$/, '')
            .trim();
    }

    return result;
};

/**
 * Parse an APA-style reference
 * Format: Authors (Year). Title. Journal, Vol(Issue), Pages. DOI
 */
const parseAPAStyle = (ref: string): ParsedPlainTextRef | null => {
    const result: ParsedPlainTextRef = { raw: ref };
    result.refNumber = extractRefNumber(ref);
    result.doi = extractDOI(ref);
    result.year = extractYear(ref);

    // Remove ref number prefix
    let cleaned = ref.replace(/^\s*[\[(\s]*\d{1,4}[\])\s]*[.\s]?/, '').trim();

    // Try APA pattern: Authors (Year). Title. Journal...
    const apaMatch = cleaned.match(
        /^(.+?)\s*\((\d{4})\)\.\s*(.+?)\.\s*(.+?)(?:\.\s*(?:https?:\/\/|doi:).*)?$/i
    );

    if (apaMatch) {
        result.authors = apaMatch[1].trim().replace(/\.$/, '');
        result.year = apaMatch[2];
        result.title = apaMatch[3].trim();
        
        // The 4th group is journal + vol/issue/pages
        const journalPart = apaMatch[4];
        // Extract just journal name (before volume/issue numbers)
        const journalName = journalPart.match(/^([^,\d]+)/);
        if (journalName) {
            result.journal = journalName[1].trim().replace(/\.$/, '');
        }
        return result;
    }

    return null;
};

/**
 * Parse a Vancouver/numbered style reference
 * Format: N. Authors. Title. Journal. Year;Vol(Issue):Pages.
 */
const parseVancouverStyle = (ref: string): ParsedPlainTextRef | null => {
    const result: ParsedPlainTextRef = { raw: ref };
    result.refNumber = extractRefNumber(ref);
    result.doi = extractDOI(ref);
    result.year = extractYear(ref);

    // Remove ref number prefix
    let cleaned = ref.replace(/^\s*\d{1,4}\.\s*/, '').trim();

    // Split on periods to find segments
    const segments = cleaned.split(/\.\s+/).filter(s => s.length > 3);
    
    if (segments.length >= 3) {
        result.authors = segments[0].trim();
        result.title = segments[1].trim();
        // Journal is typically the 3rd segment
        const journalSeg = segments[2];
        const journalName = journalSeg.match(/^([^;,\d]+)/);
        if (journalName) {
            result.journal = journalName[1].trim();
        }
        return result;
    }

    return null;
};

/**
 * Generic fallback parser — tries to extract at least title and year
 */
const parseGeneric = (ref: string): ParsedPlainTextRef => {
    const result: ParsedPlainTextRef = { raw: ref };
    result.refNumber = extractRefNumber(ref);
    result.doi = extractDOI(ref);
    result.year = extractYear(ref);

    // Remove ref number prefix, DOI, URLs
    let cleaned = ref
        .replace(/^\s*[\[(\s]*\d{1,4}[\])\s]*[.\s]?/, '')
        .replace(/(?:DOI\s*[：:]\s*)10\.\d{4,9}\/[^\s,;]+/gi, '')
        .replace(/https?:\/\/[^\s,]+/gi, '')
        .trim();

    // Try to extract title (longest sentence-like segment)
    const segments = cleaned.split(/[.]\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10);
    
    if (segments.length >= 2) {
        // First segment is likely authors, second is title
        result.authors = segments[0].replace(/\.$/, '');
        result.title = segments[1].replace(/\.$/, '');
    } else if (segments.length === 1) {
        result.title = segments[0].replace(/\.$/, '');
    }

    return result;
};

/**
 * Parse a single plain-text reference, trying multiple format parsers
 */
export const parsePlainTextRef = (ref: string): ParsedPlainTextRef => {
    // Try parsers in order of specificity
    return parseChineseStyle(ref) 
        || parseAPAStyle(ref)
        || parseVancouverStyle(ref)
        || parseGeneric(ref);
};

/**
 * Parse multiple plain-text references (one per line)
 * Returns parsed refs with detected metadata
 */
export const parsePlainTextRefs = (text: string): ParsedPlainTextRef[] => {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10) // Skip empty/short lines
        .map(parsePlainTextRef);
};

/**
 * Detect duplicate references in a batch
 * Returns an array of duplicate groups: [[idx1, idx2], [idx3, idx4]]
 */
export const detectDuplicates = (refs: ParsedPlainTextRef[]): Map<number, number[]> => {
    const duplicates = new Map<number, number[]>();
    
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

    for (let i = 0; i < refs.length; i++) {
        const titleI = normalize(refs[i].title || refs[i].raw);
        
        for (let j = i + 1; j < refs.length; j++) {
            const titleJ = normalize(refs[j].title || refs[j].raw);
            
            // Check near-exact similarity
            if (titleI === titleJ || 
                (titleI.length > 20 && titleJ.length > 20 && 
                 (titleI.includes(titleJ) || titleJ.includes(titleI)))) {
                
                if (!duplicates.has(i)) {
                    duplicates.set(i, []);
                }
                duplicates.get(i)!.push(j);
            }
        }
    }

    return duplicates;
};
