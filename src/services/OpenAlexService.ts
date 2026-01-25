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
 * Search OpenAlex for a work by title
 * @param title - The work title to search for
 * @returns The best matching work or null
 */
export const searchOpenAlex = async (title: string): Promise<OpenAlexResult | null> => {
    try {
        const encodedTitle = encodeURIComponent(title);

        const response = await fetch(
            `https://api.openalex.org/works?filter=title.search:${encodedTitle}&per_page=3`,
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
            const work = data.results[0];
            return {
                id: work.id,
                title: work.title,
                authors: work.authorships.map(a => a.author.display_name),
                year: work.publication_year,
                journal: work.primary_location?.source?.display_name || '',
                doi: work.doi,
                url: work.doi || work.id
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
