import { searchSemanticScholar, formatSemanticScholarAPA, generateSemanticScholarBibTeX, formatSemanticScholarMLA, formatSemanticScholarISO690 } from './SemanticScholarService';
import { searchOpenAlex, formatOpenAlexAPA, generateOpenAlexBibTeX, formatOpenAlexMLA, formatOpenAlexISO690 } from './OpenAlexService';
import { searchArxiv, resolveArxivById, formatArxivAPA, formatArxivMLA, formatArxivISO690, generateArxivBibTeX } from './ArxivService';
import { searchDblp, formatDblpAPA, formatDblpMLA, formatDblpISO690, generateDblpBibTeX } from './DblpService';

export interface CheckResult {
    exists: boolean;
    title?: string;
    authors?: string;
    year?: string;
    journal?: string;
    url?: string;
    doi?: string;
    score?: number; // CrossRef score
    retracted?: boolean; // Whether the paper has been retracted

    // Formatted Output
    apa?: string;
    mla?: string;
    iso690?: string;
    bibtex?: string;
    correctedApa?: string; // APA from fallback source if issues found
    correctedMla?: string;
    correctedIso690?: string;
    correctedBibtex?: string; // BibTeX from fallback source

    // Validations
    matchConfidence: number; // 0-100
    titleMatchScore: number;
    authorMatchScore: number;
    journalMatchScore: number;
    issues: string[]; // e.g., "Authors Mismatch"

    // Enrichment
    citations?: number;

    source: 'CrossRef' | 'SemanticScholar' | 'OpenAlex' | 'Arxiv' | 'DBLP' | 'NotFound';
    fallbackSource?: 'SemanticScholar' | 'OpenAlex' | 'Arxiv' | 'DBLP'; // Source of correction
}

// Rate limiting delay between batch requests (ms)
// Semantic Scholar: 100 req / 5 min = ~3 sec between requests to be safe
export const BATCH_REQUEST_DELAY = 1200;

// ===== PREPRINT VENUE DETECTION =====
const PREPRINT_VENUES = [
    'arxiv', 'biorxiv', 'medrxiv', 'chemrxiv', 'ssrn', 'preprints',
    'research square', 'osf preprints', 'techrxiv', 'eartharxiv',
    'engrxiv', 'socarxiv', 'psyarxiv', 'edarxiv', 'hal', 'repec',
    'nber working paper', 'working paper'
];

const isPreprint = (venue: string): boolean => {
    if (!venue) return false;
    const lower = venue.toLowerCase();
    return PREPRINT_VENUES.some(p => lower.includes(p));
};

/**
 * Clean a query string by removing LaTeX/BibTeX artifacts ({}, \textbf, etc.)
 * so that API queries work correctly
 */
const cleanQuery = (text: string): string => {
    return text
        .replace(/[{}]/g, '')                              // Remove curly braces: {Matthew} → Matthew
        .replace(/\\textbf|\\textit|\\emph|\\textrm/g, '') // Remove LaTeX formatting commands
        .replace(/\\&/g, '&')                              // LaTeX escaped ampersand
        .replace(/~/g, ' ')                                // LaTeX non-breaking space
        .replace(/\s{2,}/g, ' ')                           // Collapse multiple spaces
        .trim();
};

/**
 * Extract the likely title from a full plain-text reference string.
 * Strips author initials (e.g., "PC", "MS"), page numbers, volume/issue,
 * years, and other metadata that confuses API search.
 * 
 * Example:
 *   "Produção e uso setorial de tecnologia no Brasil PC Morceiro, MS Tessarin, JJM Guilhoto Economia Aplicada 26 (4), 517-55"
 *   → "Produção e uso setorial de tecnologia no Brasil"
 */
const extractLikelyTitle = (rawRef: string): string | null => {
    let ref = rawRef.trim();
    if (!ref || ref.length < 10) return null;

    // Remove page numbers: "517-55", "pp. 123-456", "p. 45"
    ref = ref.replace(/\b[Pp]{1,2}\.?\s*\d+[-–]\d+/g, '');
    ref = ref.replace(/\b\d{1,5}\s*[-–]\s*\d{1,5}\b/g, '');

    // Remove volume/issue: "26 (4)", "Vol. 12", "Issue 3", "vol 8, no. 2"
    ref = ref.replace(/\b[Vv]ol\.?\s*\d+/g, '');
    ref = ref.replace(/\b[Nn]o\.?\s*\d+/g, '');
    ref = ref.replace(/\b[Ii]ssue\s*\d+/g, '');
    ref = ref.replace(/\b\d{1,4}\s*\(\d{1,4}\)/g, '');

    // Remove years: "(2022)", "2022", but only 4-digit years
    ref = ref.replace(/\(?\b(19|20)\d{2}\b\)?/g, '');

    // Remove DOI patterns
    ref = ref.replace(/https?:\/\/doi\.org\/[^\s,]+/gi, '');
    ref = ref.replace(/\bdoi:\s*[^\s,]+/gi, '');

    // Remove standalone author initials (1-3 uppercase letters before a capitalized name)
    // e.g., "PC Morceiro" → remove "PC", "JJM Guilhoto" → remove "JJM"
    // This pattern: 1-3 uppercase letters followed by a space and a capitalized word
    ref = ref.replace(/\b[A-Z]{1,4}\s+(?=[A-Z][a-zà-ö])/g, '');

    // Remove common trailing metadata words often found after the title
    // Pattern: after removing initials, author last names are capitalized words
    // We try to detect the boundary by looking for sequences of:
    //   Capitalized-Word, Capitalized-Word (likely authors or journal)
    // Strategy: split on sentence boundaries (period/comma/semicolon followed by space)
    // and take the segment that looks most like a title
    const segments = ref.split(/[,;]|(?<=\.)\s+(?=[A-Z])/)
        .map(s => s.trim().replace(/^[.]+|[.]+$/g, '').trim())
        .filter(s => s.length > 5);

    if (segments.length > 1) {
        // Known journal/venue keywords — penalize segments containing these
        const venueKeywords = /\b(journal|proceedings|conference|transactions|advances|letters|review|annals|bulletin|workshop|symposium|arxiv)\b/i;
        // Author-like patterns: "and" connecting names, or comma-separated capitalized words
        const authorPattern = /\b(and)\b.*\b(and)\b|\b[A-Z][a-z]+\s+and\s+[A-Z][a-z]+/;

        const scored = segments.map(seg => {
            const words = seg.split(/\s+/);
            // Count how many words are lowercase (title-like) vs ALL CAPS / Capitalized (author-like)
            const lowercaseWords = words.filter(w => w.length > 2 && w[0] === w[0].toLowerCase()).length;
            const ratio = words.length > 0 ? lowercaseWords / words.length : 0;
            let score = seg.length * (0.5 + ratio);

            // Penalize segments that look like journal/venue names
            if (venueKeywords.test(seg)) score *= 0.3;
            // Penalize segments that look like author lists
            if (authorPattern.test(seg)) score *= 0.3;

            return { seg, score };
        });
        scored.sort((a, b) => b.score - a.score);
        ref = scored[0].seg;
    }

    // Final cleanup
    ref = ref
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,;.\s]+|[,;.\s]+$/g, '')
        .trim();

    // Only return if we got something meaningful (at least 10 chars and different from input)
    if (ref.length >= 10 && ref.length < rawRef.length * 0.95) {
        return ref;
    }
    return null;
};

// ===== MINIMUM TITLE SIMILARITY TO ACCEPT A RESULT =====
// Below this threshold, the result is treated as "Not Found" rather than showing a different paper
const MIN_TITLE_SIMILARITY = 70; // Minimum title similarity to consider a match

export const normalize = (str: string): string => str.toLowerCase().replace(/[^\w\s]/g, '').trim();

// Levenshtein distance for string similarity
const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

/**
 * Word-overlap (Jaccard) similarity — robust to word reordering.
 * "Produção e uso setorial de tecnologia no Brasil"
 * vs "Produção e uso de tecnologia setorial no Brasil"
 * → ~100% instead of ~75% with Levenshtein
 */
const wordOverlapSimilarity = (str1: string, str2: string): number => {
    const words1 = str1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    const words2 = str2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let intersection = 0;
    for (const word of set1) {
        if (set2.has(word)) intersection++;
    }

    const union = new Set([...set1, ...set2]).size;
    if (union === 0) return 0;

    return Math.round((intersection / union) * 100);
};

const calculateSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    const clean1 = normalize(str1);
    const clean2 = normalize(str2);
    if (clean1 === clean2) return 100;

    // Levenshtein-based similarity (character-level, penalizes word reordering)
    const distance = levenshteinDistance(clean1, clean2);
    const maxLength = Math.max(clean1.length, clean2.length);
    const levenSim = maxLength === 0 ? 0 : Math.max(0, Math.round((1 - distance / maxLength) * 100));

    // Word-overlap similarity (word-level, robust to word reordering)
    const wordSim = wordOverlapSimilarity(str1, str2);

    // Use the best of both — handles both character typos AND word reordering
    return Math.max(levenSim, wordSim);
};

export const computeTitleSim = (expectedTitle: string, resultTitle: string): number => {
    if (!expectedTitle || !resultTitle) return 0;
    
    const cleanExpected = normalize(expectedTitle);
    const cleanResult = normalize(resultTitle);

    let sim = calculateSimilarity(cleanExpected, cleanResult);

    // If the expected title contains the result title (e.g. expected is a full citation)
    if (sim < 90 && cleanExpected.includes(cleanResult) && cleanResult.length > 20) {
        sim = 95;
    }

    return sim;
};

/**
 * Computes author similarity by checking if the family names of the result authors 
 * are present in the expected authors string or the original user query.
 */
export const computeAuthorSim = (expectedAuthorsStr: string, resultAuthors: string[]): number => {
    if (!expectedAuthorsStr || resultAuthors.length === 0) return 100;
    
    const nValidation = normalize(expectedAuthorsStr);
    let matchCount = 0;
    let validAuthors = 0;

    for (const a of resultAuthors) {
        // Extract the last word as a naive family name approximation for OpenAlex/SS strings
        // Filter out DBLP disambiguation digits (e.g. "0001", "0002")
        const parts = normalize(a).split(' ').filter(p => !/^\d+$/.test(p));
        if (parts.length === 0) continue;
        
        const family = parts[parts.length - 1];
        if (family.length > 1) { // > 1 to handle 2-letter last names like Ho, Wu, Li
            validAuthors++;
            if (nValidation.includes(family)) {
                matchCount++;
            }
        }
    }
    
    if (validAuthors === 0) return 100;
    return Math.round((matchCount / validAuthors) * 100);
};

// Decode common LaTeX special characters in BibTeX
const decodeLatex = (text: string): string => {
    return text
        .replace(/\{?\\'?\{?([aeiouAEIOU])\}?\}?/g, '$1')  // acute: {\'a} or \'a
        .replace(/\{?\\`\{?([aeiouAEIOU])\}?\}?/g, '$1')  // grave
        .replace(/\{?\\\^\{?([aeiouAEIOU])\}?\}?/g, '$1') // circumflex
        .replace(/\{?\\"\{?([aeiouAEIOU])\}?\}?/g, '$1') // umlaut
        .replace(/\{?\\v\{?([a-zA-Z])\}?\}?/g, '$1')      // caron: {\v{r}}
        .replace(/\{?\\~\{?([nN])\}?\}?/g, '$1')          // tilde
        .replace(/\{?\\c\{?([cC])\}?\}?/g, '$1')          // cedilla
        .replace(/[{}]/g, '')                              // remove remaining braces
        .trim();
};

// Check if first letter matches (for given names)
const firstLetterMatches = (name1: string, name2: string): boolean => {
    const clean1 = decodeLatex(name1).replace(/[^a-zA-Z]/g, '');
    const clean2 = decodeLatex(name2).replace(/[^a-zA-Z]/g, '');
    if (!clean1 || !clean2) return false;
    return clean1[0].toLowerCase() === clean2[0].toLowerCase();
};

interface ExpectedMetadata {
    title?: string;
    authors?: string;
    journal?: string;
    year?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatAPA = (item: any): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authors = (item.author || []).map((a: any) => `${a.family}, ${a.given ? a.given[0] + '.' : ''}`).join(', ');
    const year = item.published?.['date-parts']?.[0]?.[0] || 'n.d.';
    const title = item.title?.[0] || 'Untitled';
    const journal = item['container-title']?.[0] || '';
    const doi = item.DOI ? `https://doi.org/${item.DOI}` : item.URL || '';

    let citation = `${authors} (${year}). ${title}.`;
    if (journal) {
        citation += ` ${journal}.`;
    }
    if (doi) {
        citation += ` ${doi}`;
    }
    return citation;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatMLA = (item: any): string => {
    let authorsStr = '';
    const authors = item.author || [];
    if (authors.length === 1) {
        authorsStr = `${authors[0].family}, ${authors[0].given || ''}`.trim();
    } else if (authors.length === 2) {
        authorsStr = `${authors[0].family}, ${authors[0].given || ''}, and ${authors[1].given || ''} ${authors[1].family}`.trim();
    } else if (authors.length > 2) {
        authorsStr = `${authors[0].family}, ${authors[0].given || ''}, et al`.trim();
    }
    
    if (authorsStr && !authorsStr.endsWith('.')) authorsStr += '.';
    
    const title = item.title?.[0] || 'Untitled';
    const journal = item['container-title']?.[0] || '';
    const year = item.published?.['date-parts']?.[0]?.[0] || 'n.d.';
    const doi = item.DOI ? `https://doi.org/${item.DOI}` : item.URL || '';
    
    let citation = authorsStr ? `${authorsStr} ` : '';
    citation += `"${title}."`;
    if (journal) citation += ` ${journal},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}.`;
    
    return citation;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatISO690 = (item: any): string => {
    const authors = (item.author || []).map((a: any) => {
        const family = (a.family || '').toUpperCase();
        const given = a.given ? `, ${a.given}` : '';
        return `${family}${given}`;
    }).join('; ');
    
    const year = item.published?.['date-parts']?.[0]?.[0] || 'n.d.';
    const title = item.title?.[0] || 'Untitled';
    const journal = item['container-title']?.[0] || '';
    const doi = item.DOI ? `https://doi.org/${item.DOI}` : item.URL || '';
    
    let citation = authors ? `${authors}. ` : '';
    citation += `${title}.`;
    if (journal) citation += ` ${journal},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}`;
    
    return citation;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateBibTeX = (item: any): string => {
    // Safety check for authors: handle missing given names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authors = (item.author || []).map((a: any) => `${a.family}${a.given ? ', ' + a.given : ''}`).join(' and ');
    const year = item.published?.['date-parts']?.[0]?.[0] || 'n.d.';
    const title = item.title?.[0] || 'Untitled';
    const journal = item['container-title']?.[0] || '';
    const doi = item.DOI || '';

    // Generate simple ID
    const firstAuthor = item.author?.[0]?.family || 'Unknown';
    // Remove all non-alphanumeric chars from title for the ID
    const cleanTitle = title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const id = `${firstAuthor}${year}${cleanTitle}`;

    // Construct valid BibTeX
    let bib = `@article{${id},
  title={${title}},
  author={${authors}},
  year={${year}}`;

    if (journal) bib += `,\n  journal={${journal}}`;
    if (doi) bib += `,\n  doi={${doi}}`;

    bib += `\n}`;
    return bib;
};

export const checkReference = async (rawQuery: string, expected?: ExpectedMetadata, originalQuery?: string): Promise<CheckResult> => {
    try {
        // Clean LaTeX/BibTeX artifacts from query
        const query = cleanQuery(rawQuery);
        // Use originalQuery for validation (checking if authors/journal/year appear in the text)
        // This is important when retrying with extracted title — we still want to validate against the full text
        const validationQuery = originalQuery ? cleanQuery(originalQuery) : query;

        // Also clean expected metadata if present
        const cleanedExpected = expected ? {
            ...expected,
            title: expected.title ? cleanQuery(expected.title) : expected.title,
            authors: expected.authors ? cleanQuery(expected.authors) : expected.authors,
            journal: expected.journal ? cleanQuery(expected.journal) : expected.journal,
        } : expected;
        expected = cleanedExpected;

        // Fetch top 5 results for better version matching
        const response = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5`);
        if (!response.ok) {
            return {
                exists: false,
                source: 'NotFound',
                matchConfidence: 0,
                titleMatchScore: 0,
                authorMatchScore: 0,
                journalMatchScore: 0,
                issues: []
            };
        }
        const data = await response.json();
        const items = data.message?.items || [];

        if (items.length > 0) {
            // Helper to clean strings for comparison
            const nQuery = normalize(query);

            // Helper: extract ALL years from a CrossRef item (published, published-print, published-online, issued, created)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getAllYears = (item: any): string[] => {
                const years = new Set<string>();
                const dateFields = ['published', 'published-print', 'published-online', 'issued', 'created'];
                for (const field of dateFields) {
                    const year = item[field]?.['date-parts']?.[0]?.[0];
                    if (year) years.add(year.toString());
                }
                return [...years];
            };

            // Helper: get the primary displayed year (prefer published-print > published > issued)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const getPrimaryYear = (item: any): string => {
                return item['published-print']?.['date-parts']?.[0]?.[0]?.toString()
                    || item.published?.['date-parts']?.[0]?.[0]?.toString()
                    || item.issued?.['date-parts']?.[0]?.[0]?.toString()
                    || '';
            };

            // ===== SELECT BEST MATCH =====
            // Use combined score: title + year + journal to prefer the version matching user's metadata
            let bestItem = items[0];
            let bestCombinedScore = -1;

            for (const item of items) {
                const iTitle: string = item.title?.[0] || "";
                const iYears = getAllYears(item);
                const iPrimaryYear = getPrimaryYear(item);
                const iJournal: string = item['container-title']?.[0] || "";

                let titleScore = 0;
                if (expected?.title) {
                    titleScore = calculateSimilarity(expected.title, iTitle);
                } else {
                    const nTitle = normalize(iTitle);
                    if (nTitle && (nQuery.includes(nTitle) || nTitle.includes(nQuery))) {
                        titleScore = 100;
                    } else {
                        // Try word-overlap: check BOTH directions to prevent false positives.
                        // e.g., result title "Advances in Neural Information Processing Systems"
                        // would falsely match because those words appear in the query's journal field.
                        const titleWords = nTitle.split(/\s+/).filter(w => w.length >= 3);
                        const queryWords = nQuery.split(/\s+/).filter(w => w.length >= 3);
                        const matchingTitleWords = titleWords.filter(w => nQuery.includes(w));
                        const wordOverlap = titleWords.length > 0 ? matchingTitleWords.length / titleWords.length : 0;

                        // Bidirectional check: what fraction of query words does the title cover?
                        const matchingQueryWords = queryWords.filter(w => nTitle.includes(w));
                        const reverseOverlap = queryWords.length > 0 ? matchingQueryWords.length / queryWords.length : 0;
                        
                        if (wordOverlap >= 0.8 && reverseOverlap >= 0.4) {
                            // Title covers enough of the query — likely correct
                            titleScore = Math.round(85 + wordOverlap * 15); // 85-100 range
                        } else {
                            titleScore = calculateSimilarity(query, iTitle);
                        }
                    }
                }

                // Combined score starts with title
                let combinedScore = titleScore * 3; // Title is most important

                // Year bonus (when expected metadata is provided)
                if (expected?.year) {
                    if (iYears.includes(expected.year)) {
                        combinedScore += 40; // Strong boost: any date field matches
                    } else if (iPrimaryYear && Math.abs(parseInt(expected.year) - parseInt(iPrimaryYear)) <= 1) {
                        combinedScore += 10; // Small boost for ±1 year
                    }
                } else if (!expected?.title) {
                    // Quick Check: check if year from query matches any date field
                    const yearsInQuery: string[] = Array.from(query.match(/\b(19|20)\d{2}\b/g) || []);
                    if (yearsInQuery.length > 0 && iYears.some(y => yearsInQuery.includes(y))) {
                        combinedScore += 30;
                    }
                }

                // Journal bonus
                if (expected?.journal && iJournal) {
                    const jSim = calculateSimilarity(expected.journal, iJournal);
                    combinedScore += Math.round(jSim * 0.2);
                }

                if (combinedScore > bestCombinedScore) {
                    bestCombinedScore = combinedScore;
                    bestItem = item;
                }
            }

            // Use the Best Item found
            const item = bestItem;
            const resultTitle = item.title?.[0] || "";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resultAuthors = (item.author || []).map((a: any) => a.family).join(", ");
            const resultYear = getPrimaryYear(item);
            const resultAllYears = getAllYears(item);
            const resultJournal = item['container-title']?.[0] || "";

            // ===== TITLE SIMILARITY CHECK =====
            let titleSim = 0;
            if (expected?.title) {
                titleSim = calculateSimilarity(expected.title, resultTitle);
            } else {
                const nTitle = normalize(resultTitle);
                if (nQuery.includes(nTitle) || nTitle.includes(nQuery)) {
                    titleSim = 100;
                } else {
                    // Try word-overlap: check BOTH directions to prevent false positives
                    const titleWords = nTitle.split(/\s+/).filter(w => w.length >= 3);
                    const queryWords = nQuery.split(/\s+/).filter(w => w.length >= 3);
                    const matchingTitleWords = titleWords.filter(w => nQuery.includes(w));
                    const wordOverlap = titleWords.length > 0 ? matchingTitleWords.length / titleWords.length : 0;

                    // Bidirectional check: result title must cover enough of the query
                    const matchingQueryWords = queryWords.filter(w => nTitle.includes(w));
                    const reverseOverlap = queryWords.length > 0 ? matchingQueryWords.length / queryWords.length : 0;
                    
                    if (wordOverlap >= 0.8 && reverseOverlap >= 0.4) {
                        titleSim = Math.round(85 + wordOverlap * 15); // 85-100 range
                    } else {
                        titleSim = calculateSimilarity(query, resultTitle);
                    }
                }
            }

            // ===== STRICT TITLE THRESHOLD =====
            // If the best match title is too different, return "Not Found" instead of a wrong paper
            if (titleSim < MIN_TITLE_SIMILARITY) {
                return {
                    exists: false,
                    source: 'NotFound',
                    matchConfidence: 0,
                    titleMatchScore: titleSim,
                    authorMatchScore: 0,
                    journalMatchScore: 0,
                    issues: ['Title not found — no sufficiently similar result in CrossRef']
                };
            }

            // Validation Logic
            let authorSim = 0;
            let journalSim = 0;
            let overallSim = 0;
            const issues: string[] = [];

            const nResultTitle = normalize(resultTitle);

            // Fetch Real Authors for comparison (Cleaned)
             
            const realAuthorFamilies: string[] = (item.author || [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((a: any) => normalize(a.family || ""))
                .filter((name: string) => name.length > 2);

            // Fetch Real Author Given Names for first-letter matching
             
            const realAuthorGivens: string[] = (item.author || [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((a: any) => (a.given || "").trim())
                .filter((name: string) => name.length > 0);

            if (expected?.title) {
                // strict validation (Batch Mode)

                if (expected.authors) {
                    // Strict Author Check
                    const normExpected = normalize(expected.authors);

                    // Check 1: Are real authors present?
                    const authorsFound = realAuthorFamilies.filter(author => normExpected.includes(author));
                    const hasEtAlBatch = /\bet\s+al\.?|and\s+others\b/i.test(expected.authors);

                    if (authorsFound.length > 0) {
                        if (hasEtAlBatch) {
                            authorSim = 100;
                        } else {
                            authorSim = Math.min(100, Math.round((authorsFound.length / realAuthorFamilies.length) * 100));
                        }
                    } else {
                        // Fallback to strict similarity if containment fails
                        authorSim = calculateSimilarity(expected.authors, resultAuthors);
                    }

                    // Check 2: Are there EXTRA authors in expected?
                    const decodedExpectedAuthors = decodeLatex(expected.authors);
                    const expectedList = decodedExpectedAuthors
                        .split(/[,&]|\sand\s/i)
                        .map(s => s.trim())
                        .filter(s => s.length > 2);

                    const extraAuthors = [];
                    for (const expAuth of expectedList) {
                        const nExp = normalize(expAuth);
                        const matchesFamily = realAuthorFamilies.some(real => real.includes(nExp) || nExp.includes(real));
                        const matchesGiven = realAuthorGivens.some(given => firstLetterMatches(expAuth, given));

                        if (!matchesFamily && !matchesGiven) {
                            // Don't flag "et al" or "others" as a fake author
                            if (!expAuth.toLowerCase().includes('et al') && !expAuth.toLowerCase().includes('others') && !expAuth.toLowerCase().includes('al.')) {
                                extraAuthors.push(expAuth);
                            }
                        }
                    }

                    if (extraAuthors.length > 0) {
                        issues.push(`Extra/Fake Authors detected: ${extraAuthors.join(", ")}`);
                        authorSim -= (20 * extraAuthors.length);
                    }

                } else {
                    authorSim = 100;
                }

                // ===== JOURNAL MATCHING (Batch Mode) — PREPRINT AWARE =====
                if (expected.journal) {
                    // Clean the expected journal: strip // prefix, publisher names, page ranges
                    const publisherNames = /\b(springer|elsevier|wiley|routledge|sage|cambridge|oxford|harvard|princeton|edward\s+elgar|mcgraw.hill|pearson|academic\s+press|lexington\s+books?|university\s+press|palgrave|macmillan|taylor\s+&?\s*francis|ieee|acm)\b/gi;
                    const cleanExpectedJournal = expected.journal
                        .replace(/^\/\/\s*/, '')              // Remove // prefix (Chinese book chapter)
                        .replace(/\.\s*$/, '')                 // Remove trailing dot
                        .replace(publisherNames, '')           // Remove publisher names
                        .replace(/publishing/gi, '')            // Remove "Publishing"
                        .replace(/\b\d{1,5}\s*[-–]\s*\d{1,5}\b/g, '') // Remove page ranges
                        .replace(/[:,]\s*$/, '')               // Remove trailing colon/comma
                        .replace(/\s{2,}/g, ' ')               // Collapse spaces
                        .trim();

                    journalSim = calculateSimilarity(cleanExpectedJournal, resultJournal);

                    // Containment check: if the shorter name is inside the longer one, it's a match
                    // e.g., "Open Innovation" inside "Open innovation: Researching a new paradigm"
                    const nExpJ = normalize(cleanExpectedJournal);
                    const nResJ = normalize(resultJournal);
                    if (journalSim < 90 && (nExpJ.includes(nResJ) || nResJ.includes(nExpJ))) {
                        journalSim = 95;
                    }
                    // Preprint-aware: if one is preprint and the other is a real journal, be lenient
                    if (journalSim < 50) {
                        const expectedIsPreprint = isPreprint(expected.journal);
                        const resultIsPreprint = isPreprint(resultJournal);

                        if (expectedIsPreprint !== resultIsPreprint && titleSim > 70) {
                            // One is preprint, the other is published — this is a version difference, not a real mismatch
                            issues.push(`Version difference: "${expected.journal}" vs "${resultJournal}" (preprint/published)`);
                            journalSim = 70; // Mild — not a hard mismatch
                        }
                    }
                } else {
                    journalSim = 100; // No journal to compare
                }

                // ===== YEAR MATCHING (Batch Mode) — MULTI-DATE AWARE =====
                let yearSim = 100;
                if (expected.year && resultYear) {
                    // Check if the expected year matches ANY of the CrossRef date fields
                    if (expected.year === resultYear || resultAllYears.includes(expected.year)) {
                        yearSim = 100; // Exact match with any date field
                    } else {
                        const yearDiff = Math.abs(parseInt(expected.year) - parseInt(resultYear));
                        const eitherIsPreprint = isPreprint(expected.journal || '') || isPreprint(resultJournal);

                        if (yearDiff <= 2 && eitherIsPreprint) {
                            yearSim = 85;
                            issues.push(`Year differs by ${yearDiff} year(s): expected ${expected.year}, found ${resultYear} (likely preprint/published version)`);
                        } else if (yearDiff <= 2 && titleSim > 80) {
                            // Even without preprint label, ±2 year with high title match is likely online-first vs print
                            yearSim = 85;
                            issues.push(`Note: expected ${expected.year}, CrossRef shows ${resultYear} (likely online-first vs print date)`);
                        } else if (yearDiff === 1 && titleSim > 70) {
                            yearSim = 75;
                            issues.push(`Year differs by 1: expected ${expected.year}, found ${resultYear} (possible version difference)`);
                        } else {
                            yearSim = 0;
                            issues.push(`Year Mismatch: expected ${expected.year}, found ${resultYear}`);
                        }
                    }
                }

                overallSim = (titleSim + authorSim + journalSim + yearSim) / 4;
            } else {
                // Free text validation (Quick Check)
                // Use the full original text for validation (handles retry with extracted title)
                const nValidation = normalize(validationQuery);
                const hasEtAl = /\bet\s+al\.?/i.test(validationQuery);

                // ===== 1. TITLE =====
                if (titleSim < 95 && nValidation.includes(nResultTitle)) {
                    titleSim = 95;
                }

                // ===== 2. AUTHORS from CrossRef =====
                const authorsFound = realAuthorFamilies.filter(author => nValidation.includes(author));
                const authorsMissing = realAuthorFamilies.filter(author => !nValidation.includes(author));

                if (authorsFound.length === realAuthorFamilies.length) {
                    authorSim = 100;
                } else if (authorsFound.length > 0) {
                    if (hasEtAl) {
                        // If they used et al., and found at least one author (likely the first), don't penalize
                        authorSim = 100;
                    } else {
                        authorSim = Math.round((authorsFound.length / realAuthorFamilies.length) * 100);
                    }
                    if (authorsMissing.length > 0 && titleSim > 70) {
                        // Don't flag missing authors if user just truncated (et al)
                    }
                } else {
                    authorSim = 0;
                    if (titleSim > 80) {
                        issues.push(`Author Mismatch: none of the real authors found`);
                    }
                }

                // ===== DETECT FAKE AUTHORS (Quick Check) =====
                // Pre-clean the validation query: remove reference markers, DOI, pages, volume/issue, years
                const cleanedValidation = validationQuery
                    .replace(/\[\s*[JMCDRSZN]\s*\]/g, '')          // Chinese-style ref markers: [J], [M], [C], etc.
                    .replace(/\/\/[^.]+/g, '')                      // Book series after // (e.g. //Handbook of...)
                    .replace(/DOI\s*[:：]\s*[^\s,]+/gi, '')          // DOI:10.xxx/yyy
                    .replace(/https?:\/\/[^\s,]+/gi, '')             // URLs
                    .replace(/\b[Pp]{1,2}\.?\s*\d+[-–]\d+/g, '')   // pp. 123-456
                    .replace(/\b\d{1,5}\s*[-–]\s*\d{1,5}\b/g, '')  // Page ranges: 517-55
                    .replace(/\b\d{1,4}\s*\(\d{1,4}\)/g, '')       // Volume(Issue): 26(4)
                    .replace(/\b[Vv]ol\.?\s*\d+/g, '')              // Vol. 12
                    .replace(/\b[Nn]o\.?\s*\d+/g, '')               // No. 3
                    .replace(/\(?\b(19|20)\d{2}\b\)?/g, '')         // Years: (2022), 2022
                    .replace(/\bet\s+al\.?/gi, '')                  // et al.
                    .replace(/\s{2,}/g, ' ')                        // Collapse spaces
                    .trim();

                const queryTokens = cleanedValidation.split(/[\s,.:;()]+/);
                const potentialFakeAuthors = [];
                const stopWords = new Set([
                    // Generic metadata
                    "vol", "issue", "doi", "http", "https", "org", "com", "www",
                    "pages", "page", "chapter", "edition", "eds", "editor", "editors",
                    "proceedings", "conference", "symposium", "workshop", "series",
                    "isbn", "issn", "abstract", "available", "accessed", "online", "retrieved",
                    // Publishers
                    "publishing", "publisher", "publishers", "press", "books",
                    "springer", "elsevier", "wiley", "routledge", "mcgraw", "pearson",
                    "academic", "lexington", "edward", "elgar", "sage", "informa",
                    "palgrave", "macmillan", "kluwer", "emerald", "ieee", "acm",
                    "taylor", "francis", "dekker", "plenum", "pergamon", "addison",
                    // University presses and locations
                    "cambridge", "oxford", "harvard", "princeton", "stanford", "chicago",
                    "columbia", "yale", "university", "institute", "school",
                    "dordrecht", "netherlands", "london", "york", "berlin", "heidelberg",
                    // Common reference words
                    "translated", "revised", "reprint", "forthcoming",
                    "review", "journal", "annals", "bulletin", "quarterly",
                    "international", "national", "american", "european", "british",
                    // Common short title words that get capitalized at start
                    "from", "with", "than", "into", "upon", "about", "between",
                    "through", "toward", "towards", "across", "beyond"
                ]);

                // Also gather the CrossRef publisher name for comparison
                const resultPublisher = normalize(item.publisher || '');
                // Get all container-title variants (book series, etc.)
                const allContainerTitles = (item['container-title'] || []).map((t: string) => normalize(t)).join(' ');

                for (const token of queryTokens) {
                    const nToken = normalize(token);
                    if (nToken.length < 4) continue;                           // Skip short tokens (initials, "et", "al")
                    if (!/^[A-Z]/.test(token)) continue;                        // Only check capitalized tokens
                    if (/^\d+$/.test(token)) continue;                         // Skip pure numbers
                    if (stopWords.has(nToken)) continue;                        // Skip known non-author words

                    // Check against result title
                    if (nResultTitle.includes(nToken)) continue;
                    // Check against result journal
                    if (resultJournal && normalize(resultJournal).includes(nToken)) continue;
                    // Check against result year
                    if (resultYear && resultYear.includes(token)) continue;
                    // Check against publisher
                    if (resultPublisher && resultPublisher.includes(nToken)) continue;
                    // Check against all container titles (book series, etc.)
                    if (allContainerTitles && allContainerTitles.includes(nToken)) continue;

                    // Check if it's a real author (family name) — also check substrings for compound names
                    // e.g. "Silva" should match "da Silva Meireles"
                    const isRealAuthorFamily = realAuthorFamilies.some(real => 
                        real.includes(nToken) || nToken.includes(real) || 
                        // Also check individual words of multi-word family names
                        real.split(/\s+/).some(part => part === nToken || nToken === part)
                    );
                    const isRealAuthorGiven = realAuthorGivens.some(given => firstLetterMatches(token, given));

                    if (!isRealAuthorFamily && !isRealAuthorGiven) {
                        potentialFakeAuthors.push(token);
                    }
                }

                if (potentialFakeAuthors.length > 0) {
                    const uniqueFakes = [...new Set(potentialFakeAuthors)];
                    if (uniqueFakes.length <= 5) {
                        issues.push(`Possible Extra/Fake Authors: ${uniqueFakes.join(", ")}`);
                        authorSim -= (10 * uniqueFakes.length);
                    }
                }

                // ===== CHECK "et al." USAGE =====
                if (hasEtAl) {
                    issues.push(`Note: You used 'et al.', please verify if your citation style allows it`);
                }

                // ===== 3. JOURNAL from CrossRef — PREPRINT AWARE =====
                if (resultJournal && resultJournal.length > 3) {
                    const journalWords = normalize(resultJournal).split(/\s+/).filter(w => w.length >= 4);
                    const journalInQuery = journalWords.some(word => nValidation.includes(word));

                    if (journalInQuery) {
                        journalSim = 100;
                    } else if (isPreprint(resultJournal)) {
                        // CrossRef returned a preprint venue — the user might have the published version
                        journalSim = 60;
                        if (titleSim > 70) {
                            issues.push(`Note: CrossRef returned preprint venue "${resultJournal}"`);
                        }
                    } else {
                        journalSim = 0;
                        if (titleSim > 70) {
                            issues.push(`Journal Mismatch: actual is "${resultJournal}"`);
                        }
                    }
                } else {
                    journalSim = 50; // CrossRef has no journal info
                }

                // ===== 4. YEAR from CrossRef — PREPRINT AWARE =====
                if (resultYear && resultYear.length === 4) {
                    const yearsInQuery: string[] = validationQuery.match(/\b(19|20)\d{2}\b/g) || [];

                    // Check if ANY date field matches the user's year
                    if (yearsInQuery.includes(resultYear) || yearsInQuery.some(y => resultAllYears.includes(y))) {
                        // Year matches one of the CrossRef date fields - good!
                    } else if (yearsInQuery.length > 0) {
                        const yearDiff = Math.abs(parseInt(yearsInQuery[0]) - parseInt(resultYear));
                        const resultIsPreprint = isPreprint(resultJournal);

                        if (yearDiff <= 2 && resultIsPreprint) {
                            issues.push(`Note: year ${yearsInQuery[0]} vs ${resultYear} (preprint/published version difference)`);
                            overallSim -= 5;
                        } else if (yearDiff <= 2 && titleSim > 80) {
                            // Online-first vs print, common 1-2 year gap
                            issues.push(`Note: year ${yearsInQuery[0]} vs ${resultYear} (likely online-first vs print date)`);
                            overallSim -= 5;
                        } else if (yearDiff === 1 && titleSim > 70) {
                            issues.push(`Year differs by 1: you wrote ${yearsInQuery[0]}, actual is ${resultYear} (possible version difference)`);
                            overallSim -= 10;
                        } else {
                            issues.push(`Year Mismatch: you wrote ${yearsInQuery[0]}, actual is ${resultYear}`);
                            overallSim -= 25;
                        }
                    }
                }

                // Overall Score Calculation
                if (titleSim > 80) {
                    if (authorSim >= 90) {
                        overallSim = titleSim;
                    } else {
                        overallSim = titleSim - (100 - authorSim) * 0.5;
                    }
                } else {
                    overallSim = (titleSim + authorSim) / 2;
                }

                // Apply journal penalty for Quick Check mode
                if (journalSim === 0 && titleSim > 60) {
                    overallSim -= 15;
                }

                // Floor at 0
                overallSim = Math.max(0, overallSim);
            }

            let confidence = overallSim;

            // Heuristics for issues
            if (titleSim < 70) {
                issues.push("Title mismatch");
                confidence -= 20;
            }

            // Batch mode specific mismatch
            if (expected?.authors && authorSim < 50) {
                issues.push("Authors mismatch");
                confidence -= 20;
            }

            // Journal mismatch (Batch mode)
            if (expected?.journal && journalSim < 70) {
                if (journalSim < 40) {
                    issues.push(`Journal mismatch: "${expected.journal}" vs "${resultJournal}"`);
                    confidence -= 20;
                } else {
                    issues.push(`Journal differs: "${expected.journal}" vs "${resultJournal}"`);
                    confidence -= 10;
                }
            }


            if (confidence > 100) confidence = 100;
            if (confidence < 0) confidence = 0;

            // ===== REJECT LOW-CONFIDENCE RESULTS =====
            // If too many things don't match, this is probably the wrong paper entirely
            // (e.g., a book review instead of the book, a different paper with similar title)
            // However, if title and authors match very well, it's the right paper with wrong metadata!
            const isDefiniteMatch = titleSim > 85 && authorSim > 80;

            if (isDefiniteMatch && confidence <= 80) {
                // It's the same paper, but with metadata differences (e.g., preprint vs published version).
                // Ensure it falls into the "Partial Match" category (>50) rather than "Mismatch" (<50)
                confidence = Math.max(65, confidence);
            }
            
            if (!isDefiniteMatch && (confidence < 40 || issues.length >= 3)) {
                return {
                    exists: false,
                    source: 'NotFound',
                    matchConfidence: 0,
                    titleMatchScore: titleSim,
                    authorMatchScore: authorSim,
                    journalMatchScore: journalSim,
                    issues: ['Result rejected — too many mismatches (likely wrong paper found)']
                };
            }

            const isRetracted = nResultTitle.includes('retract') || nResultTitle.includes('withdraw') || 
                (item['update-to'] && Array.isArray(item['update-to']) && item['update-to'].some((u: any) => u.type === 'retraction'));
            
            if (isRetracted && !issues.some(i => i.includes('RETRACTED'))) {
                issues.push('🚨 WARNING: This article has been RETRACTED or WITHDRAWN.');
            }

            return {
                exists: true,
                title: resultTitle,
                authors: resultAuthors,
                year: resultYear,
                journal: resultJournal,
                url: item.URL,
                doi: item.DOI,
                score: item.score,
                citations: item['is-referenced-by-count'] || 0,
                retracted: isRetracted,
                apa: formatAPA(item),
                mla: formatMLA(item),
                iso690: formatISO690(item),
                bibtex: generateBibTeX(item),
                source: 'CrossRef',
                matchConfidence: confidence,
                titleMatchScore: titleSim,
                authorMatchScore: authorSim,
                journalMatchScore: journalSim,
                issues: issues
            };
        }

        return {
            exists: false,
            source: 'NotFound',
            matchConfidence: 0,
            titleMatchScore: 0,
            authorMatchScore: 0,
            journalMatchScore: 0,
            issues: []
        };
    } catch (error) {
        console.error("Search failed", error);
        return {
            exists: false,
            source: 'NotFound',
            matchConfidence: 0,
            titleMatchScore: 0,
            authorMatchScore: 0,
            journalMatchScore: 0,
            issues: []
        };
    }
};

/**
 * Score a candidate result from any source. Higher = better.
 * Considers title similarity, year match, and journal match.
 */
const scoreCandidateResult = (titleSim: number, authorSim: number, resultYear: string | undefined, resultJournal: string | undefined, expectedYear?: string, expectedJournal?: string): number => {
    let score = (titleSim * 2 + authorSim) / 3; // Weight title heavily, but authors still matter

    if (expectedYear && resultYear) {
        if (resultYear === expectedYear) {
            score += 40;
        } else if (Math.abs(parseInt(expectedYear) - parseInt(resultYear)) <= 1) {
            score += 15;
        } else if (Math.abs(parseInt(expectedYear) - parseInt(resultYear)) <= 2) {
            score += 5;
        }
    }

    if (expectedJournal && resultJournal) {
        const jSim = calculateSimilarity(expectedJournal, resultJournal);
        score += Math.round(jSim * 0.3);
    }

    return score;
};

/**
 * Try to resolve a DOI directly via CrossRef for exact match.
 * Returns a CheckResult with 100% confidence if found.
 */
const resolveByDOI = async (doi: string, expected?: ExpectedMetadata, query?: string): Promise<CheckResult | null> => {
    try {
        const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
        const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`);
        if (!response.ok) return null;
        const data = await response.json();
        const item = data.message;
        if (!item) return null;

        const resultTitle = item.title?.[0] || '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultAuthors = (item.author || []).map((a: any) => a.family).join(', ');
        const resultYear = item['published-print']?.['date-parts']?.[0]?.[0]?.toString()
            || item.published?.['date-parts']?.[0]?.[0]?.toString()
            || item.issued?.['date-parts']?.[0]?.[0]?.toString()
            || '';
        const resultJournal = item['container-title']?.[0] || '';

        // Check for retraction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isRetracted = Boolean(item['update-to']?.some?.((u: any) => u.type === 'retraction') ||
            item['relation']?.['is-retracted-by']?.length > 0);

        const issues: string[] = [];
        if (isRetracted) {
            issues.push('⚠️ This paper has been RETRACTED');
        }

        // Validate if the DOI actually matches the user's query text
        const titleSim = computeTitleSim(expected?.title || query || '', resultTitle);
        let matchConfidence = 100;
        
        if (titleSim < 70) {
            matchConfidence = 50; // High penalty, likely wrong DOI for this reference
            issues.push(`⚠️ Title mismatch with DOI metadata. Found: "${resultTitle}"`);
        } else if (titleSim < 85) {
            matchConfidence = 80; // Partial match, slight difference
            issues.push(`Note: Title from DOI slightly differs from input.`);
        }

        return {
            exists: true,
            title: resultTitle,
            authors: resultAuthors,
            year: resultYear,
            journal: resultJournal,
            url: item.URL,
            doi: item.DOI,
            score: 100,
            retracted: isRetracted,
            apa: formatAPA(item),
            bibtex: generateBibTeX(item),
            source: 'CrossRef',
            matchConfidence: matchConfidence,
            titleMatchScore: titleSim,
            authorMatchScore: 100, // Hardcoded for simplicity as DOI guarantees author if title matches
            journalMatchScore: 100,
            issues
        };
    } catch {
        return null;
    }
};

/**
 * Extract DOI from a query string
 */
const extractDOI = (text: string): string | null => {
    const patterns = [
        /(?:DOI\s*[：:]\s*)(10\.\d{4,9}\/[^\s,;]+)/i,
        /(?:https?:\/\/doi\.org\/)(10\.\d{4,9}\/[^\s,;]+)/i,
        /\b(10\.\d{4,9}\/[^\s,;]+)/
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].replace(/[.\s]+$/, '');
    }
    return null;
};

/**
 * Extract arXiv ID from a query string.
 * Matches: arXiv:2301.12345, arxiv.org/abs/2301.12345, 10.48550/arXiv.2301.12345
 */
const extractArxivId = (text: string): string | null => {
    const patterns = [
        /\barXiv[:\s]+([\d.]+(?:v\d+)?)/i,                          // arXiv:2301.12345 or arXiv: 2301.12345
        /arxiv\.org\/(?:abs|pdf)\/([\d.]+(?:v\d+)?)/i,              // arxiv.org/abs/2301.12345
        /10\.48550\/arXiv\.([\d.]+(?:v\d+)?)/i,                     // 10.48550/arXiv.2301.12345
        /\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/                             // Bare ID: 2301.12345
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].replace(/v\d+$/, ''); // Strip version suffix
    }
    return null;
};

/**
 * Check reference against ALL sources simultaneously (CrossRef, Semantic Scholar, OpenAlex, arXiv, DBLP).
 * If a DOI or arXiv ID is present, resolves directly for 100% accuracy.
 * Picks the best result across all sources using a unified scoring function.
 */
export const checkWithFallback = async (query: string, expected?: ExpectedMetadata, originalQuery?: string): Promise<CheckResult> => {
    // ===== DOI DIRECT LOOKUP =====
    // If the query or expected metadata contains a DOI, try direct resolution first
    const queryDOI = extractDOI(originalQuery || query);
    let invalidDoiIssue = '';

    if (queryDOI) {
        // Check if this is an arXiv DOI (10.48550/arXiv.XXXX) — resolve via arXiv directly
        const arxivFromDoi = queryDOI.match(/10\.48550\/arXiv\.([\d.]+)/i);
        if (arxivFromDoi) {
            const arxivDirectResult = await resolveArxivById(arxivFromDoi[1]);
            if (arxivDirectResult) {
                return {
                    exists: true,
                    title: arxivDirectResult.title,
                    authors: arxivDirectResult.authors.join(', '),
                    year: arxivDirectResult.year?.toString() || '',
                    journal: arxivDirectResult.category ? `arXiv [${arxivDirectResult.category}]` : 'arXiv preprint',
                    url: arxivDirectResult.url,
                    doi: queryDOI,
                    apa: formatArxivAPA(arxivDirectResult),
                    mla: formatArxivMLA(arxivDirectResult),
                    iso690: formatArxivISO690(arxivDirectResult),
                    bibtex: generateArxivBibTeX(arxivDirectResult),
                    source: 'Arxiv',
                    matchConfidence: 100,
                    titleMatchScore: 100,
                    authorMatchScore: 100,
                    journalMatchScore: 100,
                    issues: []
                };
            }
        }

        const doiResult = await resolveByDOI(queryDOI, expected, originalQuery || query);
        if (doiResult) {
            return doiResult;
        } else {
            invalidDoiIssue = `⚠️ The provided DOI (${queryDOI}) is invalid or points to an unrelated article.`;
        }
    }

    // ===== ARXIV ID DIRECT LOOKUP =====
    // If the query contains an arXiv ID (e.g., arXiv:2301.12345), resolve it directly
    const arxivId = extractArxivId(originalQuery || query);
    if (arxivId && !queryDOI) { // Skip if we already tried via DOI
        const arxivDirectResult = await resolveArxivById(arxivId);
        if (arxivDirectResult) {
            const titleSim = expected?.title ? computeTitleSim(expected.title, arxivDirectResult.title) : 90;
            if (titleSim >= MIN_TITLE_SIMILARITY || !expected?.title) {
                return {
                    exists: true,
                    title: arxivDirectResult.title,
                    authors: arxivDirectResult.authors.join(', '),
                    year: arxivDirectResult.year?.toString() || '',
                    journal: arxivDirectResult.category ? `arXiv [${arxivDirectResult.category}]` : 'arXiv preprint',
                    url: arxivDirectResult.url,
                    doi: arxivDirectResult.doi || undefined,
                    apa: formatArxivAPA(arxivDirectResult),
                    mla: formatArxivMLA(arxivDirectResult),
                    iso690: formatArxivISO690(arxivDirectResult),
                    bibtex: generateArxivBibTeX(arxivDirectResult),
                    source: 'Arxiv',
                    matchConfidence: Math.min(100, titleSim + 5),
                    titleMatchScore: titleSim,
                    authorMatchScore: 100,
                    journalMatchScore: 100,
                    issues: []
                };
            }
        }
    }

    const title = expected?.title || extractLikelyTitle(query) || query;

    // Extract expected year from query if not explicitly provided
    const extractSource = originalQuery || query;
    const extractedYears = !expected?.year ? Array.from(extractSource.match(/\b(19|20)\d{2}\b/g) || []) : [];
    const expectedYear = expected?.year || (extractedYears.length > 0 ? String(extractedYears[0]) : undefined);
    const expectedJournal = expected?.journal;

    // ===== FUTURE YEAR VALIDATION =====
    const currentYear = new Date().getFullYear();
    const futureYearIssues: string[] = [];
    if (expectedYear && parseInt(expectedYear) > currentYear + 1) {
        futureYearIssues.push(`⚠️ Year ${expectedYear} is in the future — verify this is correct`);
    }

    // Determine search title for fallback sources (clean it up for better API results)
    const fallbackSearchTitle = expected?.title || extractLikelyTitle(query) || query;
    
    // For DBLP and ArXiv, appending the first author's last name massively improves precision
    // and prevents them from returning newer unrelated papers with the same title.
    let precisionSearchTitle = fallbackSearchTitle;
    if (expected?.authors) {
        const firstAuthor = expected.authors.split(/,| and /)[0].trim().split(/\s+/).pop();
        if (firstAuthor && firstAuthor.length > 1) { // > 1 handles 2-letter names like "Ho", "Li", "Wu"
            precisionSearchTitle = `${fallbackSearchTitle} ${firstAuthor}`;
        }
    }

    // ===== FIRE ALL REQUESTS IN PARALLEL =====
    // Start all 5 requests immediately, but only WAIT for arXiv/DBLP if primary sources fail.
    // This ensures zero extra latency when papers are found in CrossRef/SS/OpenAlex.
    // When no expected metadata is available (Quick Check), use the clean extracted title
    // for CrossRef too — prevents matching on journal/author names in the raw query.
    const crossRefQuery = expected ? query : fallbackSearchTitle;
    const crossRefPromise = checkReference(crossRefQuery, expected, originalQuery || (expected ? undefined : query));
    const ssPromise = searchSemanticScholar(fallbackSearchTitle, expectedYear).catch(() => null);
    const oaPromise = searchOpenAlex(fallbackSearchTitle, expectedYear).catch(() => null);
    const arxivPromise = searchArxiv(precisionSearchTitle, expectedYear).catch(() => null);
    const dblpPromise = searchDblp(precisionSearchTitle, expectedYear).catch(() => null);

    // Await only the 3 primary sources first
    const [crossRefResult, ssResult, oaResult] = await Promise.all([crossRefPromise, ssPromise, oaPromise]);

    // ===== BUILD CANDIDATE LIST =====
    interface Candidate {
        source: 'CrossRef' | 'SemanticScholar' | 'OpenAlex' | 'Arxiv' | 'DBLP';
        result: CheckResult;
        score: number;
        titleSim: number;
    }

    const candidates: Candidate[] = [];

    // --- CrossRef candidate ---
    if (crossRefResult.exists) {
        candidates.push({
            source: 'CrossRef',
            result: crossRefResult,
            score: scoreCandidateResult(
                crossRefResult.titleMatchScore,
                crossRefResult.authorMatchScore,
                crossRefResult.year,
                crossRefResult.journal,
                expectedYear,
                expectedJournal
            ),
            titleSim: crossRefResult.titleMatchScore
        });
    }

    // --- Semantic Scholar candidate ---
    if (ssResult) {
        const ssTitleSim = computeTitleSim(title, ssResult.title);
        const ssAuthorSim = computeAuthorSim(expected?.authors || query, ssResult.authors);

        if (ssTitleSim >= MIN_TITLE_SIMILARITY) {
            const ssScore = scoreCandidateResult(
                ssTitleSim,
                ssAuthorSim,
                ssResult.year?.toString(),
                ssResult.venue,
                expectedYear,
                expectedJournal
            );

            // Calculate overall confidence based on multiple fields, penalize if authors are completely wrong
            const confidence = (ssTitleSim * 2 + ssAuthorSim) / 3;

            candidates.push({
                source: 'SemanticScholar',
                result: {
                    exists: true,
                    title: ssResult.title,
                    authors: ssResult.authors.join(', '),
                    year: ssResult.year?.toString() || '',
                    journal: ssResult.venue,
                    url: ssResult.url,
                    doi: ssResult.externalIds?.DOI,
                    citations: ssResult.citationCount,
                    retracted: ssResult.isRetracted,
                    apa: formatSemanticScholarAPA(ssResult),
                    mla: formatSemanticScholarMLA(ssResult),
                    iso690: formatSemanticScholarISO690(ssResult),
                    bibtex: generateSemanticScholarBibTeX(ssResult),
                    source: 'SemanticScholar',
                    matchConfidence: Math.min(95, confidence),
                    titleMatchScore: ssTitleSim,
                    authorMatchScore: ssAuthorSim,
                    journalMatchScore: ssResult.venue ? 90 : 50,
                    issues: ssAuthorSim < 50 ? [`Author Mismatch in Semantic Scholar fallback`] : []
                },
                score: ssScore,
                titleSim: ssTitleSim
            });
        }
    }

    // --- OpenAlex candidate ---
    if (oaResult) {
        const oaTitleSim = computeTitleSim(title, oaResult.title);
        const oaAuthorSim = computeAuthorSim(expected?.authors || query, oaResult.authors);

        if (oaTitleSim >= MIN_TITLE_SIMILARITY) {
            const oaScore = scoreCandidateResult(
                oaTitleSim,
                oaAuthorSim,
                oaResult.year?.toString(),
                oaResult.journal,
                expectedYear,
                expectedJournal
            );
            
            const confidence = (oaTitleSim * 2 + oaAuthorSim) / 3;

            candidates.push({
                source: 'OpenAlex',
                result: {
                    exists: true,
                    title: oaResult.title,
                    authors: oaResult.authors.join(', '),
                    year: oaResult.year?.toString() || '',
                    journal: oaResult.journal,
                    url: oaResult.url,
                    doi: oaResult.doi || undefined,
                    citations: oaResult.citations,
                    retracted: oaResult.isRetracted,
                    apa: formatOpenAlexAPA(oaResult),
                    mla: formatOpenAlexMLA(oaResult),
                    iso690: formatOpenAlexISO690(oaResult),
                    bibtex: generateOpenAlexBibTeX(oaResult),
                    source: 'OpenAlex',
                    matchConfidence: Math.min(90, confidence),
                    titleMatchScore: oaTitleSim,
                    authorMatchScore: oaAuthorSim,
                    journalMatchScore: oaResult.journal ? 85 : 50,
                    issues: oaAuthorSim < 50 ? [`Author Mismatch in OpenAlex fallback`] : []
                },
                score: oaScore,
                titleSim: oaTitleSim
            });
        }
    }

    // ===== PICK THE BEST CANDIDATE =====
    let primaryBest: Candidate | null = null;
    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        primaryBest = candidates[0];
        
        // If the best primary match is very confident, return it immediately without waiting for fallbacks
        if (primaryBest.result.authorMatchScore >= 70 && primaryBest.titleSim >= 85) {
            if (primaryBest.source === 'CrossRef') {
                const otherBest = candidates.find(c => c.source !== 'CrossRef');
                if (otherBest && otherBest.score > primaryBest.score) {
                    const winner = otherBest.result;
                    winner.issues = [`Better match found in ${otherBest.source} (CrossRef confidence was ${primaryBest.result.matchConfidence}%)`];
                    return winner;
                }
                if (futureYearIssues.length > 0) crossRefResult.issues = [...crossRefResult.issues, ...futureYearIssues];
                if (invalidDoiIssue) crossRefResult.issues.push(invalidDoiIssue);
                return crossRefResult;
            }

            const winner = primaryBest.result;
            if (crossRefResult.exists) {
                winner.issues = [`Better match found in ${primaryBest.source} (CrossRef confidence was ${crossRefResult.matchConfidence}%)`];
            }
            if (futureYearIssues.length > 0) winner.issues = [...winner.issues, ...futureYearIssues];
            if (invalidDoiIssue) winner.issues.push(invalidDoiIssue);
            return winner;
        }
    }

    // ===== FALLBACK: AWAIT ARXIV + DBLP (requests already in-flight since earlier) =====
    // We arrive here if either no primary source found a match, OR the best primary match had a poor author score
    const [arxivResult, dblpResult] = await Promise.all([arxivPromise, dblpPromise]);
    const fallbackCandidates: Candidate[] = [];

    // --- arXiv candidate ---
    if (arxivResult) {
        const arxivTitleSim = computeTitleSim(title, arxivResult.title);
        const arxivAuthorSim = computeAuthorSim(expected?.authors || query, arxivResult.authors);

        if (arxivTitleSim >= MIN_TITLE_SIMILARITY) {
            const arxivScore = scoreCandidateResult(arxivTitleSim, arxivAuthorSim, arxivResult.year?.toString(), arxivResult.category, expectedYear, expectedJournal);
            const confidence = (arxivTitleSim * 2 + arxivAuthorSim) / 3;
            fallbackCandidates.push({
                source: 'Arxiv',
                result: {
                    exists: true,
                    title: arxivResult.title,
                    authors: arxivResult.authors.join(', '),
                    year: arxivResult.year?.toString() || '',
                    journal: arxivResult.category ? `arXiv [${arxivResult.category}]` : 'arXiv preprint',
                    url: arxivResult.url,
                    doi: arxivResult.doi || undefined,
                    apa: formatArxivAPA(arxivResult),
                    mla: formatArxivMLA(arxivResult),
                    iso690: formatArxivISO690(arxivResult),
                    bibtex: generateArxivBibTeX(arxivResult),
                    source: 'Arxiv',
                    matchConfidence: Math.min(90, confidence),
                    titleMatchScore: arxivTitleSim,
                    authorMatchScore: arxivAuthorSim,
                    journalMatchScore: arxivResult.category ? 80 : 50,
                    issues: [
                        'Found in arXiv (not indexed in CrossRef, Semantic Scholar, or OpenAlex)',
                        ...(arxivAuthorSim < 50 ? ['Author Mismatch in arXiv fallback'] : []),
                        ...futureYearIssues
                    ]
                },
                score: arxivScore,
                titleSim: arxivTitleSim
            });
        }
    }

    // --- DBLP candidate ---
    if (dblpResult) {
        const dblpTitleSim = computeTitleSim(title, dblpResult.title);
        const dblpAuthorSim = computeAuthorSim(expected?.authors || query, dblpResult.authors);

        if (dblpTitleSim >= MIN_TITLE_SIMILARITY) {
            const dblpScore = scoreCandidateResult(dblpTitleSim, dblpAuthorSim, dblpResult.year?.toString(), dblpResult.venue, expectedYear, expectedJournal);
            const confidence = (dblpTitleSim * 2 + dblpAuthorSim) / 3;
            fallbackCandidates.push({
                source: 'DBLP',
                result: {
                    exists: true,
                    title: dblpResult.title,
                    authors: dblpResult.authors.join(', '),
                    year: dblpResult.year?.toString() || '',
                    journal: dblpResult.venue,
                    url: dblpResult.eeUrl || dblpResult.url,
                    doi: dblpResult.doi || undefined,
                    apa: formatDblpAPA(dblpResult),
                    mla: formatDblpMLA(dblpResult),
                    iso690: formatDblpISO690(dblpResult),
                    bibtex: generateDblpBibTeX(dblpResult),
                    source: 'DBLP',
                    matchConfidence: Math.min(90, confidence),
                    titleMatchScore: dblpTitleSim,
                    authorMatchScore: dblpAuthorSim,
                    journalMatchScore: dblpResult.venue ? 85 : 50,
                    issues: [
                        'Found in DBLP (not indexed in CrossRef, Semantic Scholar, or OpenAlex)',
                        ...(dblpAuthorSim < 50 ? ['Author Mismatch in DBLP fallback'] : []),
                        ...futureYearIssues
                    ]
                },
                score: dblpScore,
                titleSim: dblpTitleSim
            });
        }
    }

    // Merge fallback candidates into main pool and re-sort to find the absolute best
    candidates.push(...fallbackCandidates);
    
    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];

        if (best.source === 'CrossRef') {
            const otherBest = candidates.find(c => c.source !== 'CrossRef');
            if (otherBest && otherBest.score > best.score) {
                const winner = otherBest.result;
                winner.issues = [`Better match found in ${otherBest.source} (CrossRef confidence was ${best.result.matchConfidence}%)`];
                return winner;
            }
            if (futureYearIssues.length > 0) crossRefResult.issues = [...crossRefResult.issues, ...futureYearIssues];
            if (invalidDoiIssue) crossRefResult.issues.push(invalidDoiIssue);
            return crossRefResult;
        }

        const winner = best.result;
        if (crossRefResult.exists) {
            winner.issues = [`Better match found in ${best.source} (CrossRef confidence was ${crossRefResult.matchConfidence}%)`];
        }
        if (futureYearIssues.length > 0) winner.issues = [...winner.issues, ...futureYearIssues];
        if (invalidDoiIssue) winner.issues.push(invalidDoiIssue);
        
        // If the best match is still terrible, return NotFound
        if (winner.titleMatchScore < MIN_TITLE_SIMILARITY) {
            return {
                exists: false,
                source: 'NotFound',
                matchConfidence: 0,
                titleMatchScore: 0,
                authorMatchScore: 0,
                journalMatchScore: 0,
                issues: ['Title not found in any source (CrossRef, Semantic Scholar, OpenAlex, DBLP, arXiv)']
            };
        }
        return winner;
    }

    // If nothing found in candidates, proceed to retry logic
    // ===== NO CANDIDATES FOUND — RETRY WITH EXTRACTED TITLE =====
    if (!expected?.title) {
        const extractedTitle = extractLikelyTitle(query);
        if (extractedTitle && extractedTitle !== query) {
            console.log(`[Retry] All sources failed, retrying with extracted title: "${extractedTitle}"`);
            const retryResult = await checkWithFallback(extractedTitle, expected, query);
            if (retryResult.exists) {
                if (invalidDoiIssue && !retryResult.issues.includes(invalidDoiIssue)) {
                    retryResult.issues.push(invalidDoiIssue);
                }
                return retryResult;
            }
        }
    }

    if (queryDOI) {
        return {
            exists: true, // Force warning instead of NotFound
            title: expected?.title || extractLikelyTitle(query) || "Unknown Title",
            authors: expected?.authors || "",
            year: expectedYear || "",
            journal: expectedJournal || "",
            url: `https://doi.org/${queryDOI}`,
            doi: queryDOI,
            score: 0,
            source: 'NotFound',
            matchConfidence: 0, // This will make it a Partial Match (Warning)
            titleMatchScore: 0,
            authorMatchScore: 0,
            journalMatchScore: 0,
            issues: [invalidDoiIssue]
        };
    }

    return {
        exists: false,
        source: 'NotFound',
        matchConfidence: 0,
        titleMatchScore: 0,
        authorMatchScore: 0,
        journalMatchScore: 0,
        issues: ['Title not found in any source (CrossRef, Semantic Scholar, OpenAlex, DBLP, arXiv)']
    };
};
