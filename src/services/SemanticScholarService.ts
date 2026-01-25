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
 * Search Semantic Scholar for a paper by title
 * @param title - The paper title to search for
 * @returns The best matching paper or null
 */
export const searchSemanticScholar = async (title: string): Promise<SemanticScholarResult | null> => {
    try {
        const encodedQuery = encodeURIComponent(title);
        const fields = 'paperId,title,authors,year,venue,externalIds,url';

        const response = await fetch(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=3&fields=${fields}`,
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
            const paper = data.data[0];
            return {
                paperId: paper.paperId,
                title: paper.title,
                authors: paper.authors.map(a => a.name),
                year: paper.year,
                venue: paper.venue || '',
                externalIds: paper.externalIds,
                url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`
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
