/**
 * DBLP API Service
 * Searches for publications using the DBLP API (JSON)
 * No API key required. Covers CS conferences, journals, and workshops.
 * Used as a FALLBACK source alongside arXiv.
 */

export interface DblpResult {
    key: string;         // DBLP internal key
    title: string;
    authors: string[];
    year: number | null;
    venue: string;
    type: string;        // e.g., "Conference and Workshop Papers", "Journal Articles"
    doi: string | null;
    url: string;         // DBLP record URL
    eeUrl: string;       // Electronic edition URL (publisher/DOI link)
}

/**
 * Simple title similarity for best-match selection
 */
const titleSimilarity = (a: string, b: string): number => {
    const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const ca = clean(a);
    const cb = clean(b);
    if (ca === cb) return 100;
    const wordsA = new Set(ca.split(/\s+/));
    const wordsB = new Set(cb.split(/\s+/));
    let overlap = 0;
    for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
    const maxLen = Math.max(wordsA.size, wordsB.size);
    return maxLen > 0 ? Math.round((overlap / maxLen) * 100) : 0;
};

/**
 * Extract DOI from a DBLP "ee" (electronic edition) URL
 * e.g., "https://doi.org/10.1145/12345" → "10.1145/12345"
 */
const extractDoiFromEe = (ee: string | string[] | undefined): string | null => {
    if (!ee) return null;
    const urls = Array.isArray(ee) ? ee : [ee];
    for (const url of urls) {
        const match = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s,;]+)/i);
        if (match) return match[1];
    }
    return null;
};

/**
 * Normalize DBLP author format.
 * DBLP authors can be either strings or objects with a "text" field.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeAuthors = (authorData: any): string[] => {
    if (!authorData) return [];
    const authors = Array.isArray(authorData) ? authorData : [authorData];
    return authors.map((a: unknown) => {
        if (typeof a === 'string') return a;
        if (typeof a === 'object' && a !== null && 'text' in a) return (a as { text: string }).text;
        return String(a);
    }).filter((name: string) => name.length > 0);
};

/**
 * Search DBLP for a paper by title.
 * @param title - The paper title to search for
 * @param expectedYear - Optional expected year to prefer the correct version
 * @returns The best matching paper or null
 */
export const searchDblp = async (title: string, expectedYear?: string): Promise<DblpResult | null> => {
    try {
        const encodedQuery = encodeURIComponent(title);
        const apiUrl = `https://dblp.org/search/publ/api?q=${encodedQuery}&format=json&h=5`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
            console.warn(`DBLP API returned ${response.status}`);
            return null;
        }

        const data = await response.json();
        const hits = data?.result?.hits?.hit;

        if (!hits || !Array.isArray(hits) || hits.length === 0) {
            return null;
        }

        // Pick the best match by title similarity + year preference
        let bestHit = hits[0];
        let bestScore = -1;

        for (const hit of hits) {
            const info = hit.info;
            if (!info?.title) continue;

            // DBLP titles sometimes end with a trailing period — strip it
            const hitTitle = info.title.replace(/\.\s*$/, '');
            let score = titleSimilarity(title, hitTitle);

            // Boost score if year matches expected
            const hitYear = info.year ? parseInt(info.year) : null;
            if (expectedYear && hitYear) {
                if (hitYear.toString() === expectedYear) {
                    score += 20;
                } else if (Math.abs(hitYear - parseInt(expectedYear)) === 1) {
                    score += 5;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestHit = hit;
            }
        }

        const info = bestHit.info;
        if (!info?.title) return null;

        const hitTitle = info.title.replace(/\.\s*$/, '');
        const authors = normalizeAuthors(info.authors?.author);
        const year = info.year ? parseInt(info.year) : null;
        const doi = extractDoiFromEe(info.ee);

        // Get the best URL — prefer DOI, then ee, then DBLP record
        const eeUrl = Array.isArray(info.ee) ? info.ee[0] : (info.ee || '');

        return {
            key: info.key || bestHit['@id'] || '',
            title: hitTitle,
            authors,
            year,
            venue: info.venue || '',
            type: info.type || '',
            doi,
            url: info.url || `https://dblp.org/rec/${info.key || ''}`,
            eeUrl: eeUrl || ''
        };
    } catch (error) {
        console.error('DBLP search failed:', error);
        return null;
    }
};

// ===== CITATION FORMATTERS =====

/**
 * Format a DBLP result to APA citation
 */
export const formatDblpAPA = (paper: DblpResult): string => {
    const authors = paper.authors.map((name, idx) => {
        const parts = name.split(' ');
        const lastName = parts.pop() || '';
        const initials = parts.map(p => p[0] + '.').join(' ');
        return idx === paper.authors.length - 1 && paper.authors.length > 1
            ? `& ${lastName}, ${initials}`
            : `${lastName}, ${initials}`;
    }).join(', ');

    const year = paper.year || 'n.d.';
    const doi = paper.doi ? `https://doi.org/${paper.doi}` : '';

    let citation = `${authors} (${year}). ${paper.title}.`;
    if (paper.venue) {
        citation += ` ${paper.venue}.`;
    }
    if (doi) {
        citation += ` ${doi}`;
    } else if (paper.eeUrl) {
        citation += ` ${paper.eeUrl}`;
    }
    return citation;
};

/**
 * Format a DBLP result to MLA citation
 */
export const formatDblpMLA = (paper: DblpResult): string => {
    let authorsStr = '';
    const authors = paper.authors;
    if (authors.length === 1) {
        authorsStr = authors[0];
    } else if (authors.length === 2) {
        authorsStr = `${authors[0]} and ${authors[1]}`;
    } else if (authors.length > 2) {
        authorsStr = `${authors[0]}, et al`;
    }

    if (authorsStr && !authorsStr.endsWith('.')) authorsStr += '.';

    const year = paper.year || 'n.d.';
    const doi = paper.doi ? `https://doi.org/${paper.doi}` : (paper.eeUrl || '');

    let citation = authorsStr ? `${authorsStr} ` : '';
    citation += `"${paper.title}."`;
    if (paper.venue) citation += ` ${paper.venue},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}.`;

    return citation;
};

/**
 * Format a DBLP result to ISO 690 citation
 */
export const formatDblpISO690 = (paper: DblpResult): string => {
    const authors = paper.authors.map(a => a.toUpperCase()).join('; ');
    const year = paper.year || 'n.d.';
    const doi = paper.doi ? `https://doi.org/${paper.doi}` : (paper.eeUrl || '');

    let citation = authors ? `${authors}. ` : '';
    citation += `${paper.title}.`;
    if (paper.venue) citation += ` ${paper.venue},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}`;

    return citation;
};

/**
 * Generate BibTeX from a DBLP result
 */
export const generateDblpBibTeX = (paper: DblpResult): string => {
    const authors = paper.authors.join(' and ');
    const year = paper.year || 'n.d.';
    const firstAuthor = paper.authors[0]?.split(' ').pop() || 'Unknown';
    const cleanTitle = paper.title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const id = `${firstAuthor}${year}${cleanTitle}`;

    // Use appropriate BibTeX type based on DBLP type
    const isConference = paper.type.toLowerCase().includes('conference') || paper.type.toLowerCase().includes('workshop');
    const bibType = isConference ? 'inproceedings' : 'article';
    const venueField = isConference ? 'booktitle' : 'journal';

    let bib = `@${bibType}{${id},
  title={${paper.title}},
  author={${authors}},
  year={${year}}`;

    if (paper.venue) bib += `,\n  ${venueField}={${paper.venue}}`;
    if (paper.doi) bib += `,\n  doi={${paper.doi}}`;

    bib += `\n}`;
    return bib;
};
