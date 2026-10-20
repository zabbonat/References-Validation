/**
 * Pre-Processing & Heuristic Pattern Detector for Chinese / Domestic Non-DOI References
 * Detects GB/T 7714 bibliographic standard markers, explicit translation tags,
 * CJK characters, and typical Chinese university journal naming conventions
 * commonly exported from CNKI, Wanfang, or VIP databases.
 */

export interface DomesticSourceFlags {
    isSuspectedChineseOrDomestic: boolean;
    detectedMarkers: string[]; // e.g., ["GB/T-7714 [J]", "Explicit [in Chinese] tag"]
    hasChineseMarkers: boolean;
    hasGBT7714Markers: boolean;
    hasCJKCharacters: boolean;
    isTypicalChineseUniversityJournal: boolean;
}

export interface HeuristicMetadataInput {
    title?: string;
    authors?: string;
    journal?: string;
    year?: string;
}

// Explicit language tags: [in Chinese], (in Chinese), [Chinese], (Chinese)
export const CHINESE_LANGUAGE_TAG_REGEX = /\[(in\s+)?chinese\]|\((in\s+)?chinese\)/i;

// Chinese national bibliographic standard GB/T 7714 document type identifiers
export const GBT7714_MARKER_REGEX = /\[(J|M|D|C|R|S|P|N|Z|EB\/OL)\]/i;

// Unicode CJK Unified Ideographs
export const CJK_CHAR_REGEX = /[\u4e00-\u9fa5]/;

// Typical Chinese university journal naming patterns frequently translated from CNKI without DOIs
export const CHINESE_UNIVERSITY_JOURNAL_REGEX =
    /Journal of .* University \((Social Sciences?|Natural Sciences?|Philosophy and Social Sciences?|Medical|Engineering|Science and Technology|Humanities and Social Sciences?|Agriculture and Life Sciences?) Edition\)/i;

/**
 * Analyzes a raw reference string and optional parsed metadata to detect
 * Chinese/domestic bibliographic patterns (GB/T 7714, CNKI/Wanfang translations, etc.).
 */
export const detectDomesticReferenceHeuristics = (
    rawRef: string,
    metadata?: HeuristicMetadataInput
): DomesticSourceFlags => {
    const combinedText = [
        rawRef || '',
        metadata?.title || '',
        metadata?.journal || '',
        metadata?.authors || ''
    ]
        .filter(Boolean)
        .join(' ');

    const detectedMarkers: string[] = [];

    // 1. Check for GB/T 7714 document type identifiers: [J], [M], [D], [C], [R], [S], [P], [N], [EB/OL]
    const gbtMatches = Array.from(
        combinedText.matchAll(/\[\s*(J|M|D|C|R|S|P|N|Z|EB\/OL)\s*\]/gi)
    );
    const hasGBT7714Markers = gbtMatches.length > 0;
    if (hasGBT7714Markers) {
        const uniqueCodes = Array.from(new Set(gbtMatches.map(m => m[1].toUpperCase())));
        for (const code of uniqueCodes) {
            detectedMarkers.push(`GB/T-7714 [${code}]`);
        }
    }

    // 2. Check for explicit language tags: [in Chinese], (in Chinese), [Chinese], (Chinese)
    const chineseTagMatch = combinedText.match(CHINESE_LANGUAGE_TAG_REGEX);
    const hasChineseMarkers = Boolean(chineseTagMatch);
    if (hasChineseMarkers && chineseTagMatch) {
        detectedMarkers.push(`Explicit ${chineseTagMatch[0]} tag`);
    }

    // 3. Check for Unicode CJK unified ideographs
    const hasCJKCharacters = CJK_CHAR_REGEX.test(combinedText);
    if (hasCJKCharacters) {
        detectedMarkers.push('CJK ideographs detected');
    }

    // 4. Check for typical Chinese university journal naming patterns
    const journalMatch = combinedText.match(CHINESE_UNIVERSITY_JOURNAL_REGEX);
    const isTypicalChineseUniversityJournal = Boolean(journalMatch);
    if (isTypicalChineseUniversityJournal && journalMatch) {
        detectedMarkers.push(`Chinese university journal pattern (${journalMatch[0]})`);
    }

    const isSuspectedChineseOrDomestic =
        hasChineseMarkers ||
        hasGBT7714Markers ||
        hasCJKCharacters ||
        isTypicalChineseUniversityJournal;

    return {
        isSuspectedChineseOrDomestic,
        detectedMarkers,
        hasChineseMarkers,
        hasGBT7714Markers,
        hasCJKCharacters,
        isTypicalChineseUniversityJournal
    };
};

// Alias for convenience
export const analyzeReferenceHeuristics = detectDomesticReferenceHeuristics;

/**
 * Strips GB/T 7714 markers (e.g., [J], [M], [EB/OL]) and explicit language tags
 * (e.g., [in Chinese], (in Chinese)) from a title or reference fragment so that
 * CrossRef and OpenAlex title queries are not polluted by format tags.
 */
export const cleanTitleForAPISearch = (title: string): string => {
    if (!title) return '';
    return title
        .replace(/\[\s*(?:J|M|D|C|R|S|P|N|Z|EB\/OL)\s*\]/gi, '')
        .replace(CHINESE_LANGUAGE_TAG_REGEX, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s.,;:]+|[\s.,;:]+$/g, '')
        .trim();
};
