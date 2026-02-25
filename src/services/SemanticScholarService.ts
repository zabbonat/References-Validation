/**
 * Semantic Scholar API Service
 * Searches for papers using the Semantic Scholar Academic Graph API
 * Rate limit: 100 requests per 5 minutes without API key
 */

export interface SemanticScholarResult {
    paperId: string;
    title: string;
    authors: string[];
    year: number | null;
    venue: string;
    externalIds?: {
        DOI?: string;
    };
    url: string;
}

interface SemanticScholarPaper {
    paperId: string;
    title: string;
    authors: { name: string }[];
    year: number | null;
    venue: string;
    externalIds?: {
        DOI?: string;
    };
    url: string;
}

interface SemanticScholarResponse {
    total: number;
    data: SemanticScholarPaper[];
}

/**
 * Simple title similarity for best-match selection
 */
const titleSimilarity = (a: string, b: string): number => {
    const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const ca = clean(a);
    const cb = clean(b);
    if (ca === cb) return 100;
    // Word overlap ratio
    const wordsA = new Set(ca.split(/\s+/));
    const wordsB = new Set(cb.split(/\s+/));
    let overlap = 0;
    for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
    const maxLen = Math.max(wordsA.size, wordsB.size);
    return maxLen > 0 ? Math.round((overlap / maxLen) * 100) : 0;
};

/**
 * Search Semantic Scholar for a paper by title
 * @param title - The paper title to search for
 * @param expectedYear - Optional expected year to prefer the correct version (preprint vs published)
 * @returns The best matching paper or null
 */
export const searchSemanticScholar = async (title: string, expectedYear?: string): Promise<SemanticScholarResult | null> => {
    try {
        const encodedQuery = encodeURIComponent(title);
        const fields = 'paperId,title,authors,year,venue,externalIds,url';

        const response = await fetch(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=5&fields=${fields}`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            if (response.status === 429) {
                console.warn('Semantic Scholar rate limit reached');
            }
            return null;
        }

        const data: SemanticScholarResponse = await response.json();

        if (data.data && data.data.length > 0) {
            // Pick the best match by title similarity + year preference
            let bestPaper = data.data[0];
            let bestScore = -1;

            for (const paper of data.data) {
                let score = titleSimilarity(title, paper.title);

                // Boost score if year matches expected
                if (expectedYear && paper.year) {
                    if (paper.year.toString() === expectedYear) {
                        score += 20; // Strong boost for exact year match
                    } else if (Math.abs(paper.year - parseInt(expectedYear)) === 1) {
                        score += 5; // Small boost for ±1 year (preprint/published)
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestPaper = paper;
                }
            }

            return {
                paperId: bestPaper.paperId,
                title: bestPaper.title,
                authors: bestPaper.authors.map(a => a.name),
                year: bestPaper.year,
                venue: bestPaper.venue || '',
                externalIds: bestPaper.externalIds,
                url: bestPaper.url || `https://www.semanticscholar.org/paper/${bestPaper.paperId}`
            };
        }

        return null;
    } catch (error) {
        console.error('Semantic Scholar search failed:', error);
        return null;
    }
};

/**
 * Format a Semantic Scholar result to APA citation
 */
export const formatSemanticScholarAPA = (paper: SemanticScholarResult): string => {
    const authors = paper.authors.map((name, idx) => {
        const parts = name.split(' ');
        const lastName = parts.pop() || '';
        const initials = parts.map(p => p[0] + '.').join(' ');
        return idx === paper.authors.length - 1 && paper.authors.length > 1
            ? `& ${lastName}, ${initials}`
            : `${lastName}, ${initials}`;
    }).join(', ');

    const year = paper.year || 'n.d.';
    const doi = paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : '';

    let citation = `${authors} (${year}). ${paper.title}.`;
    if (paper.venue) {
        citation += ` ${paper.venue}.`;
    }
    if (doi) {
        citation += ` ${doi}`;
    }
    return citation;
};

/**
 * Generate BibTeX from a Semantic Scholar result
 */
export const generateSemanticScholarBibTeX = (paper: SemanticScholarResult): string => {
    const authors = paper.authors.join(' and ');
    const year = paper.year || 'n.d.';
    const firstAuthor = paper.authors[0]?.split(' ').pop() || 'Unknown';
    const cleanTitle = paper.title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const id = `${firstAuthor}${year}${cleanTitle}`;

    let bib = `@article{${id},
  title={${paper.title}},
  author={${authors}},
  year={${year}}`;

    if (paper.venue) bib += `,\n  journal={${paper.venue}}`;
    if (paper.externalIds?.DOI) bib += `,\n  doi={${paper.externalIds.DOI}}`;

    bib += `\n}`;
    return bib;
};
