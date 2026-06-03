/**
 * arXiv API Service
 * Searches for papers using the arXiv public API (Atom XML)
 * No API key required. Rate limit: reasonable usage expected.
 * 
 * This service is used as a FALLBACK — only queried when CrossRef,
 * Semantic Scholar, and OpenAlex all fail to find a match.
 */

export interface ArxivResult {
    id: string;          // arXiv ID (e.g., "2301.12345")
    title: string;
    authors: string[];
    year: number | null;
    category: string;    // Primary category (e.g., "cs.CL")
    doi: string | null;
    url: string;         // abs link
    pdfUrl: string;      // pdf link
}

/**
 * Simple title similarity for best-match selection (same logic as SS/OA services)
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
 * Parse the Atom XML response from arXiv API
 */
const parseArxivResponse = (xml: string): ArxivResult[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        console.error('arXiv XML parse error:', parseError.textContent);
        return [];
    }

    const ns = 'http://www.w3.org/2005/Atom';
    const entries = doc.getElementsByTagNameNS(ns, 'entry');
    const results: ArxivResult[] = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        // Title — arXiv titles often have newlines/extra spaces
        const titleEl = entry.getElementsByTagNameNS(ns, 'title')[0];
        const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!title) continue;

        // ID (e.g., "http://arxiv.org/abs/2301.12345v1")
        const idEl = entry.getElementsByTagNameNS(ns, 'id')[0];
        const fullId = idEl?.textContent?.trim() || '';
        // Extract the arXiv ID from the URL
        const arxivIdMatch = fullId.match(/abs\/(.+?)(?:v\d+)?$/);
        const arxivId = arxivIdMatch ? arxivIdMatch[1] : fullId;

        // Authors
        const authorEls = entry.getElementsByTagNameNS(ns, 'author');
        const authors: string[] = [];
        for (let j = 0; j < authorEls.length; j++) {
            const nameEl = authorEls[j].getElementsByTagNameNS(ns, 'name')[0];
            if (nameEl?.textContent) {
                authors.push(nameEl.textContent.trim());
            }
        }

        // Published date → year
        const publishedEl = entry.getElementsByTagNameNS(ns, 'published')[0];
        const publishedDate = publishedEl?.textContent?.trim() || '';
        const yearMatch = publishedDate.match(/^(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;

        // Primary category
        const categoryEl = entry.getElementsByTagNameNS('http://arxiv.org/schemas/atom', 'primary_category');
        const category = categoryEl.length > 0
            ? (categoryEl[0].getAttribute('term') || '')
            : '';

        // DOI (arXiv sometimes includes it via arxiv:doi)
        const doiEl = entry.getElementsByTagNameNS('http://arxiv.org/schemas/atom', 'doi');
        const doi = doiEl.length > 0 ? (doiEl[0].textContent?.trim() || null) : null;

        // Links
        const linkEls = entry.getElementsByTagNameNS(ns, 'link');
        let absUrl = `https://arxiv.org/abs/${arxivId}`;
        let pdfUrl = `https://arxiv.org/pdf/${arxivId}`;
        for (let j = 0; j < linkEls.length; j++) {
            const rel = linkEls[j].getAttribute('rel') || '';
            const href = linkEls[j].getAttribute('href') || '';
            const type = linkEls[j].getAttribute('type') || '';
            if (rel === 'alternate' && href) {
                absUrl = href;
            }
            if (type === 'application/pdf' && href) {
                pdfUrl = href;
            }
        }

        results.push({
            id: arxivId,
            title,
            authors,
            year,
            category,
            doi,
            url: absUrl,
            pdfUrl
        });
    }

    return results;
};

/**
 * Search arXiv for a paper by title.
 * @param title - The paper title to search for
 * @param expectedYear - Optional expected year to prefer the correct version
 * @returns The best matching paper or null
 */
export const searchArxiv = async (title: string, expectedYear?: string): Promise<ArxivResult | null> => {
    try {
        // Use ti: prefix to search specifically in titles
        // Also do an all: search for better recall with messy queries
        const encodedQuery = encodeURIComponent(title);
        // Use Cloudflare worker to bypass CORS
        const PROXY_URL = 'https://zabbonat-proxy.didiabbo.workers.dev/?url=';
        const apiUrl = `https://export.arxiv.org/api/query?search_query=ti:${encodedQuery}&max_results=5&sortBy=relevance&sortOrder=descending`;
        
        const response = await fetch(PROXY_URL + encodeURIComponent(apiUrl));

        if (!response.ok) {
            console.warn(`arXiv API returned ${response.status}`);
            return null;
        }

        const xmlText = await response.text();
        const papers = parseArxivResponse(xmlText);

        if (papers.length === 0) {
            return null;
        }

        // Pick the best match by title similarity + year preference
        let bestPaper = papers[0];
        let bestScore = -1;

        for (const paper of papers) {
            let score = titleSimilarity(title, paper.title);

            // Boost score if year matches expected
            if (expectedYear && paper.year) {
                if (paper.year.toString() === expectedYear) {
                    score += 20; // Strong boost for exact year match
                } else if (Math.abs(paper.year - parseInt(expectedYear)) === 1) {
                    score += 5; // Small boost for ±1 year
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestPaper = paper;
            }
        }

        return bestPaper;
    } catch (error) {
        console.error('arXiv search failed:', error);
        return null;
    }
};

/**
 * Resolve a paper directly by arXiv ID (e.g., "2301.12345").
 * Uses the id_list parameter for exact, instant lookup.
 * @param arxivId - The arXiv ID to resolve
 * @returns The paper or null
 */
export const resolveArxivById = async (arxivId: string): Promise<ArxivResult | null> => {
    try {
        const cleanId = arxivId.replace(/^arXiv:/i, '').replace(/v\d+$/, '').trim();
        const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}&max_results=1`;

        const response = await fetch(apiUrl);
        if (!response.ok) return null;

        const xmlText = await response.text();
        const papers = parseArxivResponse(xmlText);

        return papers.length > 0 ? papers[0] : null;
    } catch (error) {
        console.error('arXiv ID resolution failed:', error);
        return null;
    }
};

// ===== CITATION FORMATTERS =====

/**
 * Format an arXiv result to APA citation
 */
export const formatArxivAPA = (paper: ArxivResult): string => {
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
    citation += ` arXiv preprint arXiv:${paper.id}.`;
    if (doi) {
        citation += ` ${doi}`;
    } else {
        citation += ` ${paper.url}`;
    }
    return citation;
};

/**
 * Format an arXiv result to MLA citation
 */
export const formatArxivMLA = (paper: ArxivResult): string => {
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
    const doi = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;

    let citation = authorsStr ? `${authorsStr} ` : '';
    citation += `"${paper.title}."`;
    citation += ` arXiv preprint arXiv:${paper.id},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}.`;

    return citation;
};

/**
 * Format an arXiv result to ISO 690 citation
 */
export const formatArxivISO690 = (paper: ArxivResult): string => {
    const authors = paper.authors.map(a => a.toUpperCase()).join('; ');
    const year = paper.year || 'n.d.';
    const doi = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;

    let citation = authors ? `${authors}. ` : '';
    citation += `${paper.title}.`;
    citation += ` arXiv preprint arXiv:${paper.id},`;
    citation += ` ${year}.`;
    if (doi) citation += ` ${doi}`;

    return citation;
};

/**
 * Generate BibTeX from an arXiv result
 */
export const generateArxivBibTeX = (paper: ArxivResult): string => {
    const authors = paper.authors.join(' and ');
    const year = paper.year || 'n.d.';
    const firstAuthor = paper.authors[0]?.split(' ').pop() || 'Unknown';
    const cleanTitle = paper.title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    const id = `${firstAuthor}${year}${cleanTitle}`;

    let bib = `@misc{${id},
  title={${paper.title}},
  author={${authors}},
  year={${year}},
  eprint={${paper.id}},
  archivePrefix={arXiv}`;

    if (paper.category) bib += `,\n  primaryClass={${paper.category}}`;
    if (paper.doi) bib += `,\n  doi={${paper.doi}}`;

    bib += `\n}`;
    return bib;
};
