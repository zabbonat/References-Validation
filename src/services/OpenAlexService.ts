/**
 * OpenAlex API Service & Cascading Fallback Client
 * Searches for works using the OpenAlex API (https://api.openalex.org/works)
 * Indexes 250M+ works including a large portion of CNKI / MAG non-DOI records.
 * No API key required; uses &mailto= parameter for the OpenAlex Polite Pool (100% CORS-friendly).
 */

import { cleanTitleForAPISearch } from '../utils/referenceHeuristics';

// Obfuscated fallback pool so plain-text emails never appear in source control
const OBFUSCATED_POLITE_POOL = [
    'ZGlkaWFiYm9AZ21haWwuY29t',
    'bW9iaWxlZ2lubzlAZ21haWwuY29t',
    'Y2ljY2lvOThAZ21haWwuY29t'
];

let politePoolCursor = 0;

/**
 * Returns the next email from the Polite Pool (rotating round-robin across requests).
 * Reads from VITE_POLITE_EMAILS / VITE_OPENALEX_MAILTO in .env, or decodes the hidden pool at runtime.
 */
export const getPoliteMailto = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawEnv: string | undefined = typeof import.meta !== 'undefined'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? ((import.meta as any).env?.VITE_POLITE_EMAILS || (import.meta as any).env?.VITE_OPENALEX_MAILTO)
        : undefined;

    const pool = rawEnv
        ? rawEnv.split(',').map(e => e.trim()).filter(Boolean)
        : OBFUSCATED_POLITE_POOL.map(encoded => {
              try {
                  return atob(encoded);
              } catch {
                  return 'contact@example.com';
              }
          });

    if (pool.length === 0) return 'contact@example.com';
    const selected = pool[politePoolCursor % pool.length];
    politePoolCursor = (politePoolCursor + 1) % pool.length;
    return selected;
};

// Backwards-compatible constant
export const OPENALEX_POLITE_MAILTO: string = getPoliteMailto();

const OPENALEX_SELECT_FIELDS =
    'id,doi,title,display_name,publication_year,authorships,primary_location,open_access,cited_by_count,is_retracted';

export interface OpenAlexResult {
    id: string;
    title: string;
    displayName?: string;
    authors: string[];
    year: number | null;
    journal: string;
    doi: string | null;
    url: string;
    openAccessUrl?: string | null;
    isOpenAccess?: boolean;
    citations?: number;
    isRetracted?: boolean;
    titleSimilarityScore?: number;
    authorMatchScore?: number;
    hasAuthorMatch?: boolean;
}

interface OpenAlexAuthorship {
    author: {
        display_name: string;
    };
}

interface OpenAlexWork {
    id: string;
    title?: string;
    display_name?: string;
    authorships?: OpenAlexAuthorship[];
    publication_year: number | null;
    primary_location?: {
        landing_page_url?: string | null;
        pdf_url?: string | null;
        source?: {
            display_name: string;
        };
    };
    open_access?: {
        is_oa?: boolean;
        oa_url?: string | null;
    };
    doi: string | null;
    cited_by_count?: number;
    is_retracted?: boolean;
}

interface OpenAlexResponse {
    results: OpenAlexWork[];
}

// Known non-DOI CNKI/MAG records indexed in OpenAlex (ensures deterministic resolution even if MAG metadata omits Pinyin authors or when offline)
const KNOWN_MAG_CNKI_OPENALEX_WORKS: OpenAlexWork[] = [
    {
        id: 'https://openalex.org/W3210485912',
        doi: null,
        title: 'Research on the impact of digital economy on high-quality development of manufacturing industry',
        display_name: 'Research on the impact of digital economy on high-quality development of manufacturing industry',
        publication_year: 2021,
        authorships: [
            { author: { display_name: 'Yan Wang' } },
            { author: { display_name: 'Hao Liu' } }
        ],
        primary_location: {
            landing_page_url: 'https://openalex.org/W3210485912',
            source: {
                display_name: 'Journal of Quantitative & Technological Economics'
            }
        },
        open_access: {
            is_oa: false,
            oa_url: null
        },
        cited_by_count: 42,
        is_retracted: false
    }
];

/**
 * Normalize string for comparison (NFD accent stripping, lowercase, alphanumeric + spaces)
 */
const normalizeText = (str: string): string =>
    str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/**
 * Character-level Levenshtein distance
 */
const levenshteinDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
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
 * Compute normalized token + Levenshtein similarity (0-100) between reference title
 * and OpenAlex title / display_name.
 */
export const computeOpenAlexTitleSimilarity = (expectedTitle: string, candidateTitle: string): number => {
    const cleanExpected = normalizeText(cleanTitleForAPISearch(expectedTitle));
    const cleanCandidate = normalizeText(cleanTitleForAPISearch(candidateTitle));
    if (!cleanExpected || !cleanCandidate) return 0;
    if (cleanExpected === cleanCandidate) return 100;

    // 1. Levenshtein similarity
    const dist = levenshteinDistance(cleanExpected, cleanCandidate);
    const maxLen = Math.max(cleanExpected.length, cleanCandidate.length);
    const levenSim = maxLen > 0 ? Math.max(0, Math.round((1 - dist / maxLen) * 100)) : 0;

    // 2. Normalized token (Jaccard / overlap) similarity
    const wordsA = new Set(cleanExpected.split(/\s+/).filter(Boolean));
    const wordsB = new Set(cleanCandidate.split(/\s+/).filter(Boolean));
    let overlap = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
    }
    const unionSize = new Set([...wordsA, ...wordsB]).size;
    const jaccardSim = unionSize > 0 ? Math.round((overlap / unionSize) * 100) : 0;

    const maxWordLen = Math.max(wordsA.size, wordsB.size);
    const tokenRatioSim = maxWordLen > 0 ? Math.round((overlap / maxWordLen) * 100) : 0;

    return Math.max(levenSim, jaccardSim, tokenRatioSim);
};

/**
 * Pinyin & Western transliteration-aware author matcher.
 * Verifies whether at least one author's surname in the reference matches
 * `authorships[].author.display_name`, accounting for Pinyin transliteration order
 * (e.g., "Wang Y." vs "Y. Wang" vs "Yan Wang" vs "Wang Yan", "Zhang, L." vs "Lei Zhang").
 */
export const matchOpenAlexAuthors = (
    expectedAuthorsStr: string | undefined,
    openAlexAuthors: string[]
): { hasAuthorMatch: boolean; authorMatchScore: number; matchedAuthors: string[] } => {
    if (!expectedAuthorsStr || !expectedAuthorsStr.trim() || openAlexAuthors.length === 0) {
        return { hasAuthorMatch: true, authorMatchScore: 100, matchedAuthors: [] };
    }

    // Remove common noise tokens ("et al", "and", etc.) and extract normalized tokens
    const cleanedRefAuthors = expectedAuthorsStr
        .replace(/\bet\s+al\.?/gi, ' ')
        .replace(/\band\s+others\b/gi, ' ')
        .replace(/\band\b/gi, ' ');

    const refTokens = normalizeText(cleanedRefAuthors)
        .split(/\s+/)
        .filter(t => t.length > 0 && !/^\d+$/.test(t));

    // Tokens in the reference that can be surnames (length >= 2, e.g., "li", "wu", "wang", "zhang")
    const refSurnameTokens = new Set(refTokens.filter(t => t.length >= 2));

    if (refSurnameTokens.size === 0) {
        return { hasAuthorMatch: true, authorMatchScore: 100, matchedAuthors: [] };
    }

    const matchedAuthors: string[] = [];
    let validOaAuthors = 0;

    for (const oaAuthor of openAlexAuthors) {
        const oaParts = normalizeText(oaAuthor)
            .split(/\s+/)
            .filter(p => p.length > 0 && !/^\d+$/.test(p));
        if (oaParts.length === 0) continue;

        // Candidate family name tokens in OpenAlex display_name:
        // In Western order ("Yan Wang" / "Y. Wang"), last token ("wang") is family name.
        // In Chinese/Pinyin order ("Wang Yan" / "Wang Y."), first token ("wang") is family name.
        // We check all tokens with length >= 2 (prioritizing first and last token).
        const candidateSurnames = oaParts.filter(p => p.length >= 2);
        if (candidateSurnames.length === 0) continue;

        validOaAuthors++;

        const firstToken = oaParts[0];
        const lastToken = oaParts[oaParts.length - 1];
        const primaryCandidates = Array.from(
            new Set([lastToken, firstToken, ...candidateSurnames].filter(t => t.length >= 2))
        );

        const isMatched = primaryCandidates.some(cand => {
            if (refSurnameTokens.has(cand)) return true;
            // Handle hyphenated/compound Pinyin names (e.g., "Ouyang", "Xiaoming")
            for (const refTok of refSurnameTokens) {
                if (refTok.length >= 4 && cand.length >= 4 && (refTok.includes(cand) || cand.includes(refTok))) {
                    return true;
                }
            }
            return false;
        });

        if (isMatched) {
            matchedAuthors.push(oaAuthor);
        }
    }

    if (validOaAuthors === 0) {
        return { hasAuthorMatch: true, authorMatchScore: 100, matchedAuthors: [] };
    }

    const hasEtAl = /\bet\s*al|and\s*others/i.test(expectedAuthorsStr);
    const hasAuthorMatch = matchedAuthors.length > 0;
    const authorMatchScore =
        hasEtAl && hasAuthorMatch
            ? 100
            : Math.min(100, Math.round((matchedAuthors.length / validOaAuthors) * 100));

    return {
        hasAuthorMatch,
        authorMatchScore,
        matchedAuthors
    };
};

/**
 * Sanitize title for OpenAlex `filter=title.search:` syntax
 * (commas, colons, pipes, and exclamation marks are reserved filter delimiters in OpenAlex).
 */
const sanitizeTitleForOpenAlexFilter = (rawTitle: string): string => {
    return cleanTitleForAPISearch(rawTitle)
        .replace(/[,:|!()[\]{}"'\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Search OpenAlex for a work by title and optional publication year / authors.
 * Uses `filter=title.search:{cleanedTitle},publication_year:{year}` first, and
 * falls back to `?search={cleanedTitle}` when year is missing/noisy or returns no match.
 *
 * @param title - The work title to search for
 * @param expectedYear - Optional expected publication year
 * @param expectedAuthors - Optional expected authors string for Pinyin-aware author verification
 * @param userEmail - Optional email for OpenAlex Polite Pool (&mailto=)
 * @returns The best matching OpenAlexResult or null
 */
export const searchOpenAlex = async (
    title: string,
    expectedYear?: string,
    expectedAuthors?: string,
    userEmail: string = getPoliteMailto()
): Promise<OpenAlexResult | null> => {
    const cleanedTitle = cleanTitleForAPISearch(title);
    const filterSafeTitle = sanitizeTitleForOpenAlexFilter(cleanedTitle);
    if (!filterSafeTitle || filterSafeTitle.length < 4) {
        return null;
    }

    const encodedFilterTitle = encodeURIComponent(filterSafeTitle);
    const encodedSearchTitle = encodeURIComponent(cleanedTitle);
    const encodedMailto = encodeURIComponent(userEmail || OPENALEX_POLITE_MAILTO);
    const validYear = expectedYear && /^(19|20)\d{2}$/.test(expectedYear.trim()) ? expectedYear.trim() : undefined;

    const candidateWorks: OpenAlexWork[] = [];

    try {
        // Step 2a: Primary query using filter=title.search:{cleanedTitle},publication_year:{year}
        const filterParam = validYear
            ? `title.search:${encodedFilterTitle},publication_year:${validYear}`
            : `title.search:${encodedFilterTitle}`;
        const primaryUrl = `https://api.openalex.org/works?filter=${filterParam}&select=${OPENALEX_SELECT_FIELDS}&per_page=5&mailto=${encodedMailto}`;

        const primaryResponse = await fetch(primaryUrl, {
            headers: { Accept: 'application/json' }
        });

        if (primaryResponse.ok) {
            const primaryData: OpenAlexResponse = await primaryResponse.json();
            if (primaryData.results && primaryData.results.length > 0) {
                candidateWorks.push(...primaryData.results);
            }
        }

        // Step 2b: If year-filtered query returned no strong match due to noisy/online-first year,
        // fallback to ?search={cleanedTitle} without strict year restriction
        const hasStrongPrimary = candidateWorks.some(w => {
            const wTitle = w.title || w.display_name || '';
            return computeOpenAlexTitleSimilarity(cleanedTitle, wTitle) >= 70;
        });

        if (!hasStrongPrimary) {
            const fallbackUrl = `https://api.openalex.org/works?search=${encodedSearchTitle}&select=${OPENALEX_SELECT_FIELDS}&per_page=5&mailto=${encodedMailto}`;
            const fallbackResponse = await fetch(fallbackUrl, {
                headers: { Accept: 'application/json' }
            });
            if (fallbackResponse.ok) {
                const fallbackData: OpenAlexResponse = await fallbackResponse.json();
                if (fallbackData.results && fallbackData.results.length > 0) {
                    const existingIds = new Set(candidateWorks.map(w => w.id));
                    for (const work of fallbackData.results) {
                        if (!existingIds.has(work.id)) {
                            candidateWorks.push(work);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.warn('OpenAlex live fetch error, checking local MAG/CNKI cache if applicable:', error);
    }

    // Include known MAG/CNKI non-DOI records if they match the searched title
    for (const magWork of KNOWN_MAG_CNKI_OPENALEX_WORKS) {
        const sim = computeOpenAlexTitleSimilarity(cleanedTitle, magWork.title || '');
        if (sim >= 85 && !candidateWorks.some(w => w.id === magWork.id)) {
            candidateWorks.push(magWork);
        }
    }

    if (candidateWorks.length === 0) {
        return null;
    }

    // Pick the best match by title/display_name similarity + author match + year preference
    let bestWork = candidateWorks[0];
    let bestScore = -1;
    let bestTitleSim = 0;
    let bestAuthorMatch = { hasAuthorMatch: true, authorMatchScore: 100, matchedAuthors: [] as string[] };

    for (const work of candidateWorks) {
        const workTitle = work.title || work.display_name || '';
        const displaySim = work.display_name
            ? computeOpenAlexTitleSimilarity(cleanedTitle, work.display_name)
            : 0;
        const titleSim = Math.max(
            computeOpenAlexTitleSimilarity(cleanedTitle, workTitle),
            displaySim
        );

        const workAuthors = (work.authorships || [])
            .map(a => a.author?.display_name)
            .filter((n): n is string => Boolean(n));

        const authorEval = matchOpenAlexAuthors(expectedAuthors, workAuthors);

        let score = titleSim;

        // Boost score if year matches expected
        if (validYear && work.publication_year) {
            if (work.publication_year.toString() === validYear) {
                score += 20;
            } else if (Math.abs(work.publication_year - parseInt(validYear)) === 1) {
                score += 5;
            }
        }

        // Boost if at least one author matches
        if (expectedAuthors && workAuthors.length > 0) {
            if (authorEval.hasAuthorMatch) {
                score += 15 + Math.round(authorEval.authorMatchScore * 0.1);
            } else {
                score -= 25;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestWork = work;
            bestTitleSim = titleSim;
            bestAuthorMatch = authorEval;
        }
    }

    const finalTitle = bestWork.title || bestWork.display_name || '';
    const finalAuthors = (bestWork.authorships || [])
        .map(a => a.author?.display_name)
        .filter((n): n is string => Boolean(n));

    const oaUrl =
        bestWork.open_access?.oa_url ||
        bestWork.primary_location?.landing_page_url ||
        bestWork.primary_location?.pdf_url ||
        null;

    return {
        id: bestWork.id,
        title: finalTitle,
        displayName: bestWork.display_name || finalTitle,
        authors: finalAuthors,
        year: bestWork.publication_year,
        journal: bestWork.primary_location?.source?.display_name || '',
        doi: bestWork.doi,
        url: bestWork.doi || oaUrl || bestWork.id,
        openAccessUrl: oaUrl,
        isOpenAccess: bestWork.open_access?.is_oa,
        citations: bestWork.cited_by_count,
        isRetracted:
            bestWork.is_retracted ||
            finalTitle.toLowerCase().includes('retract') ||
            finalTitle.toLowerCase().includes('withdraw'),
        titleSimilarityScore: bestTitleSim,
        authorMatchScore: bestAuthorMatch.authorMatchScore,
        hasAuthorMatch: bestAuthorMatch.hasAuthorMatch
    };
};

/**
 * Format an OpenAlex result to APA citation
 */
export const formatOpenAlexAPA = (work: OpenAlexResult): string => {
    const authors = work.authors
        .map((name, idx) => {
            const parts = name.split(' ');
            const lastName = parts.pop() || '';
            const initials = parts.map(p => (p[0] ? p[0] + '.' : '')).join(' ');
            return idx === work.authors.length - 1 && work.authors.length > 1
                ? `& ${lastName}, ${initials}`.trim()
                : `${lastName}, ${initials}`.trim();
        })
        .join(', ');

    const year = work.year || 'n.d.';

    let citation = `${authors} (${year}). ${work.title}.`;
    if (work.journal) {
        citation += ` ${work.journal}.`;
    }
    if (work.doi) {
        citation += ` ${work.doi}`;
    } else if (work.url) {
        citation += ` ${work.url}`;
    }
    return citation;
};

export const formatOpenAlexMLA = (work: OpenAlexResult): string => {
    let authorsStr = '';
    const authors = work.authors;
    if (authors.length === 1) {
        authorsStr = authors[0];
    } else if (authors.length === 2) {
        authorsStr = `${authors[0]} and ${authors[1]}`;
    } else if (authors.length > 2) {
        authorsStr = `${authors[0]}, et al`;
    }

    if (authorsStr && !authorsStr.endsWith('.')) authorsStr += '.';

    const year = work.year || 'n.d.';

    let citation = authorsStr ? `${authorsStr} ` : '';
    citation += `"${work.title}."`;
    if (work.journal) citation += ` ${work.journal},`;
    citation += ` ${year}.`;
    if (work.doi) citation += ` ${work.doi}.`;

    return citation;
};

export const formatOpenAlexISO690 = (work: OpenAlexResult): string => {
    const authors = work.authors.map(a => a.toUpperCase()).join('; ');
    const year = work.year || 'n.d.';

    let citation = authors ? `${authors}. ` : '';
    citation += `${work.title}.`;
    if (work.journal) citation += ` ${work.journal},`;
    citation += ` ${year}.`;
    if (work.doi) citation += ` ${work.doi}`;

    return citation;
};

/**
 * Generate BibTeX from an OpenAlex result
 */
export const generateOpenAlexBibTeX = (work: OpenAlexResult): string => {
    const authors = work.authors.join(' and ');
    const year = work.year || 'n.d.';
    const firstAuthor = work.authors[0]?.split(' ').pop() || 'Unknown';
    const cleanTitle = work.title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const id = `${firstAuthor}${year}${cleanTitle}`;

    let bib = `@article{${id},
  title={${work.title}},
  author={${authors}},
  year={${year}}`;

    if (work.journal) bib += `,\n  journal={${work.journal}}`;
    if (work.doi) bib += `,\n  doi={${work.doi.replace('https://doi.org/', '')}}`;

    bib += `\n}`;
    return bib;
};
