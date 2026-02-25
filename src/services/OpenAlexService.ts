/**
 * OpenAlex API Service
 * Searches for works using the OpenAlex API
 * No API key required, but email in User-Agent gives access to "polite pool"
 */

export interface OpenAlexResult {
    id: string;
    title: string;
    authors: string[];
    year: number | null;
    journal: string;
    doi: string | null;
    url: string;
}

interface OpenAlexAuthorship {
    author: {
        display_name: string;
    };
}

interface OpenAlexWork {
    id: string;
    title: string;
    authorships: OpenAlexAuthorship[];
    publication_year: number | null;
    primary_location?: {
        source?: {
            display_name: string;
        };
    };
    doi: string | null;
}

interface OpenAlexResponse {
    results: OpenAlexWork[];
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
 * Search OpenAlex for a work by title
 * @param title - The work title to search for
 * @param expectedYear - Optional expected year to prefer the correct version
 * @returns The best matching work or null
 */
export const searchOpenAlex = async (title: string, expectedYear?: string): Promise<OpenAlexResult | null> => {
    try {
        const encodedTitle = encodeURIComponent(title);

        const response = await fetch(
            `https://api.openalex.org/works?filter=title.search:${encodedTitle}&per_page=5`,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CheckIfExist/1.0 (mailto:contact@example.com)'
                }
            }
        );

        if (!response.ok) {
            return null;
        }

        const data: OpenAlexResponse = await response.json();

        if (data.results && data.results.length > 0) {
            // Pick the best match by title similarity + year preference
            let bestWork = data.results[0];
            let bestScore = -1;

            for (const work of data.results) {
                let score = titleSimilarity(title, work.title);

                // Boost score if year matches expected
                if (expectedYear && work.publication_year) {
                    if (work.publication_year.toString() === expectedYear) {
                        score += 20;
                    } else if (Math.abs(work.publication_year - parseInt(expectedYear)) === 1) {
                        score += 5;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestWork = work;
                }
            }

            return {
                id: bestWork.id,
                title: bestWork.title,
                authors: bestWork.authorships.map(a => a.author.display_name),
                year: bestWork.publication_year,
                journal: bestWork.primary_location?.source?.display_name || '',
                doi: bestWork.doi,
                url: bestWork.doi || bestWork.id
            };
        }

        return null;
    } catch (error) {
        console.error('OpenAlex search failed:', error);
        return null;
    }
};

/**
 * Format an OpenAlex result to APA citation
 */
export const formatOpenAlexAPA = (work: OpenAlexResult): string => {
    const authors = work.authors.map((name, idx) => {
        const parts = name.split(' ');
        const lastName = parts.pop() || '';
        const initials = parts.map(p => p[0] + '.').join(' ');
        return idx === work.authors.length - 1 && work.authors.length > 1
            ? `& ${lastName}, ${initials}`
            : `${lastName}, ${initials}`;
    }).join(', ');

    const year = work.year || 'n.d.';

    let citation = `${authors} (${year}). ${work.title}.`;
    if (work.journal) {
        citation += ` ${work.journal}.`;
    }
    if (work.doi) {
        citation += ` ${work.doi}`;
    }
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
