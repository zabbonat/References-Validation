import { searchSemanticScholar, formatSemanticScholarAPA, generateSemanticScholarBibTeX } from './SemanticScholarService';
import { searchOpenAlex, formatOpenAlexAPA, generateOpenAlexBibTeX } from './OpenAlexService';

export interface CheckResult {
    exists: boolean;
    title?: string;
    authors?: string;
    year?: string;
    journal?: string;
    url?: string;
    doi?: string;
    score?: number; // CrossRef score

    // Formatted Output
    apa?: string;
    bibtex?: string;
    correctedApa?: string; // APA from fallback source if issues found
    correctedBibtex?: string; // BibTeX from fallback source

    // Validations
    matchConfidence: number; // 0-100
    titleMatchScore: number;
    authorMatchScore: number;
    journalMatchScore: number;
    issues: string[]; // e.g., "Authors Mismatch"

    source: 'CrossRef' | 'SemanticScholar' | 'OpenAlex' | 'NotFound';
    fallbackSource?: 'SemanticScholar' | 'OpenAlex'; // Source of correction
}

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

// ===== MINIMUM TITLE SIMILARITY TO ACCEPT A RESULT =====
// Below this threshold, the result is treated as "Not Found" rather than showing a different paper
const MIN_TITLE_SIMILARITY = 55;

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

const calculateSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    const clean1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
    const clean2 = str2.toLowerCase().replace(/[^\w\s]/g, '');
    if (clean1 === clean2) return 100;

    const distance = levenshteinDistance(clean1, clean2);
    const maxLength = Math.max(clean1.length, clean2.length);
    if (maxLength === 0) return 0;

    return Math.max(0, Math.round((1 - distance / maxLength) * 100));
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

export const checkReference = async (query: string, expected?: ExpectedMetadata): Promise<CheckResult> => {
    try {
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
            const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
            const nQuery = normalize(query);

            // ===== SELECT BEST MATCH =====
            // Use combined score: title + year + journal to prefer the version matching user's metadata
            let bestItem = items[0];
            let bestCombinedScore = -1;

            for (const item of items) {
                const iTitle: string = item.title?.[0] || "";
                const iYear: string = item.published?.['date-parts']?.[0]?.[0]?.toString() || "";
                const iJournal: string = item['container-title']?.[0] || "";

                let titleScore = 0;
                if (expected?.title) {
                    titleScore = calculateSimilarity(expected.title, iTitle);
                } else {
                    const nTitle = normalize(iTitle);
                    if (nQuery.includes(nTitle)) {
                        titleScore = 100;
                    } else {
                        titleScore = calculateSimilarity(query, iTitle);
                    }
                }

                // Combined score starts with title
                let combinedScore = titleScore * 3; // Title is most important

                // Year bonus (when expected metadata is provided)
                if (expected?.year && iYear) {
                    if (expected.year === iYear) {
                        combinedScore += 40; // Strong boost for exact year match
                    } else if (Math.abs(parseInt(expected.year) - parseInt(iYear)) === 1) {
                        combinedScore += 10; // Small boost for ±1 year
                    }
                } else if (!expected?.title) {
                    // Quick Check: check if year from query matches
                    const yearsInQuery: string[] = Array.from(query.match(/\b(19|20)\d{2}\b/g) || []);
                    if (yearsInQuery.length > 0 && iYear && yearsInQuery.indexOf(iYear) >= 0) {
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
            const resultYear = item.published?.['date-parts']?.[0]?.[0]?.toString() || "";
            const resultJournal = item['container-title']?.[0] || "";

            // ===== TITLE SIMILARITY CHECK =====
            let titleSim = 0;
            if (expected?.title) {
                titleSim = calculateSimilarity(expected.title, resultTitle);
            } else {
                const nTitle = normalize(resultTitle);
                if (nQuery.includes(nTitle)) {
                    titleSim = 100;
                } else {
                    titleSim = calculateSimilarity(query, resultTitle);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const realAuthorFamilies: string[] = (item.author || [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((a: any) => normalize(a.family || ""))
                .filter((name: string) => name.length > 2);

            // Fetch Real Author Given Names for first-letter matching
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

                    if (authorsFound.length > 0) {
                        authorSim = Math.min(100, Math.round((authorsFound.length / realAuthorFamilies.length) * 100));
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
                            extraAuthors.push(expAuth);
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
                    journalSim = calculateSimilarity(expected.journal, resultJournal);

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

                // ===== YEAR MATCHING (Batch Mode) — PREPRINT AWARE =====
                let yearSim = 100;
                if (expected.year && resultYear) {
                    if (expected.year === resultYear) {
                        yearSim = 100;
                    } else {
                        const yearDiff = Math.abs(parseInt(expected.year) - parseInt(resultYear));
                        const eitherIsPreprint = isPreprint(expected.journal || '') || isPreprint(resultJournal);

                        if (yearDiff <= 2 && eitherIsPreprint) {
                            // Preprint→published year difference (1-2 years is normal)
                            yearSim = 85;
                            issues.push(`Year differs by ${yearDiff} year(s): expected ${expected.year}, found ${resultYear} (likely preprint/published version)`);
                        } else if (yearDiff === 1 && titleSim > 80) {
                            // Even without preprint label, ±1 year with high title match is likely a version difference
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

                // ===== 1. TITLE =====
                if (titleSim < 95 && nQuery.includes(nResultTitle)) {
                    titleSim = 95;
                }

                // ===== 2. AUTHORS from CrossRef =====
                const authorsFound = realAuthorFamilies.filter(author => nQuery.includes(author));
                const authorsMissing = realAuthorFamilies.filter(author => !nQuery.includes(author));

                if (authorsFound.length === realAuthorFamilies.length) {
                    authorSim = 100;
                } else if (authorsFound.length > 0) {
                    authorSim = Math.round((authorsFound.length / realAuthorFamilies.length) * 100);
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
                const queryTokens = query.split(/[\s,.:;()]+/);
                const potentialFakeAuthors = [];
                const stopWords = ["vol", "issue", "pp", "doi", "http", "https", "org", "com", "www"];

                for (const token of queryTokens) {
                    const nToken = normalize(token);
                    if (nToken.length < 3) continue;
                    if (!/^[A-Z]/.test(token)) continue;
                    if (stopWords.includes(nToken)) continue;

                    if (nResultTitle.includes(nToken)) continue;
                    if (resultJournal && normalize(resultJournal).includes(nToken)) continue;
                    if (resultYear && resultYear.includes(token)) continue;

                    const isRealAuthorFamily = realAuthorFamilies.some(real => real.includes(nToken) || nToken.includes(real));
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

                // ===== 3. JOURNAL from CrossRef — PREPRINT AWARE =====
                if (resultJournal && resultJournal.length > 3) {
                    const journalWords = normalize(resultJournal).split(/\s+/).filter(w => w.length >= 4);
                    const journalInQuery = journalWords.some(word => nQuery.includes(word));

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
                    const yearsInQuery: string[] = query.match(/\b(19|20)\d{2}\b/g) || [];

                    if (yearsInQuery.includes(resultYear)) {
                        // Year matches - good!
                    } else if (yearsInQuery.length > 0) {
                        const yearDiff = Math.abs(parseInt(yearsInQuery[0]) - parseInt(resultYear));
                        const resultIsPreprint = isPreprint(resultJournal);

                        if (yearDiff <= 2 && resultIsPreprint) {
                            // Preprint version difference
                            issues.push(`Note: year ${yearsInQuery[0]} vs ${resultYear} (preprint/published version difference)`);
                            overallSim -= 5; // Very mild penalty
                        } else if (yearDiff === 1 && titleSim > 80) {
                            // Likely version difference even without explicit preprint label
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

            return {
                exists: true,
                title: resultTitle,
                authors: resultAuthors,
                year: resultYear,
                journal: resultJournal,
                url: item.URL,
                doi: item.DOI,
                score: item.score,
                apa: formatAPA(item),
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
 * Helper to normalize author names for comparison
 */
const normalizeAuthorName = (name: string): string => {
    return name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
};

/**
 * Compare authors between sources - returns true if authors match well
 */
const authorsMatch = (source1Authors: string[], source2Authors: string[]): boolean => {
    if (source1Authors.length === 0 || source2Authors.length === 0) return false;

    const norm1 = source1Authors.map(normalizeAuthorName);
    const norm2 = source2Authors.map(normalizeAuthorName);

    // Check if at least 50% of authors from source1 are in source2
    let matches = 0;
    for (const author of norm1) {
        const lastName = author.split(' ').pop() || author;
        if (norm2.some(a2 => a2.includes(lastName) || lastName.includes(a2.split(' ').pop() || ''))) {
            matches++;
        }
    }

    return matches >= Math.ceil(source1Authors.length / 2);
};

/**
 * Check reference with fallback to Semantic Scholar and OpenAlex
 * If CrossRef finds issues, verify with other sources
 * If they confirm correct data, provide corrected APA/BibTeX
 */
export const checkWithFallback = async (query: string, expected?: ExpectedMetadata): Promise<CheckResult> => {
    // First, try CrossRef
    const crossRefResult = await checkReference(query, expected);

    // If not found or low confidence, try fallback sources
    if (!crossRefResult.exists || crossRefResult.matchConfidence < 70 || crossRefResult.issues.length > 0) {
        const title = expected?.title || query;
        const expectedYear = expected?.year;

        // Try Semantic Scholar (pass expectedYear for version-aware selection)
        const ssResult = await searchSemanticScholar(title, expectedYear);

        if (ssResult) {
            const ssAuthors = ssResult.authors;
            const ssTitleSim = calculateSimilarity(title, ssResult.title);

            // If CrossRef wasn't found, use Semantic Scholar as primary
            // BUT only if the title similarity is high enough
            if (!crossRefResult.exists) {
                if (ssTitleSim < MIN_TITLE_SIMILARITY) {
                    // Title doesn't match well enough — don't show a wrong paper
                    // Continue to try OpenAlex
                } else {
                    return {
                        exists: true,
                        title: ssResult.title,
                        authors: ssAuthors.join(', '),
                        year: ssResult.year?.toString() || '',
                        journal: ssResult.venue,
                        url: ssResult.url,
                        doi: ssResult.externalIds?.DOI,
                        apa: formatSemanticScholarAPA(ssResult),
                        bibtex: generateSemanticScholarBibTeX(ssResult),
                        source: 'SemanticScholar',
                        matchConfidence: Math.min(95, ssTitleSim + 10),
                        titleMatchScore: ssTitleSim,
                        authorMatchScore: 100,
                        journalMatchScore: ssResult.venue ? 90 : 50,
                        issues: []
                    };
                }
            }

            // CrossRef found but has issues - check if Semantic Scholar confirms different authors
            if (crossRefResult.exists && expected?.authors) {
                const expectedAuthorList = expected.authors.split(/[,&]|and/i).map(a => a.trim());

                if (!authorsMatch(expectedAuthorList, ssAuthors) && authorsMatch((crossRefResult.authors || '').split(', '), ssAuthors)) {
                    crossRefResult.correctedApa = formatSemanticScholarAPA(ssResult);
                    crossRefResult.correctedBibtex = generateSemanticScholarBibTeX(ssResult);
                    crossRefResult.fallbackSource = 'SemanticScholar';
                    return crossRefResult;
                }
            }

            // CrossRef found but has version mismatch — check if SS has the right version
            if (crossRefResult.exists && crossRefResult.issues.some(i => i.toLowerCase().includes('year') || i.toLowerCase().includes('version') || i.toLowerCase().includes('preprint'))) {
                // If SS has matching year/journal, offer as corrected version
                if (expectedYear && ssResult.year?.toString() === expectedYear) {
                    crossRefResult.correctedApa = formatSemanticScholarAPA(ssResult);
                    crossRefResult.correctedBibtex = generateSemanticScholarBibTeX(ssResult);
                    crossRefResult.fallbackSource = 'SemanticScholar';
                    // Boost confidence since another source confirms it
                    crossRefResult.matchConfidence = Math.min(100, crossRefResult.matchConfidence + 15);
                    return crossRefResult;
                }
            }
        }

        // Try OpenAlex (pass expectedYear for version-aware selection)
        const oaResult = await searchOpenAlex(title, expectedYear);

        if (oaResult) {
            const oaAuthors = oaResult.authors;
            const oaTitleSim = calculateSimilarity(title, oaResult.title);

            // If still not found via CrossRef (and SS didn't match), use OpenAlex
            if (!crossRefResult.exists) {
                if (oaTitleSim < MIN_TITLE_SIMILARITY) {
                    // Title doesn't match — return Not Found
                    return {
                        exists: false,
                        source: 'NotFound',
                        matchConfidence: 0,
                        titleMatchScore: Math.max(crossRefResult.titleMatchScore, oaTitleSim),
                        authorMatchScore: 0,
                        journalMatchScore: 0,
                        issues: ['Title not found in any source (CrossRef, Semantic Scholar, OpenAlex)']
                    };
                }

                return {
                    exists: true,
                    title: oaResult.title,
                    authors: oaAuthors.join(', '),
                    year: oaResult.year?.toString() || '',
                    journal: oaResult.journal,
                    url: oaResult.url,
                    doi: oaResult.doi || undefined,
                    apa: formatOpenAlexAPA(oaResult),
                    bibtex: generateOpenAlexBibTeX(oaResult),
                    source: 'OpenAlex',
                    matchConfidence: Math.min(90, oaTitleSim + 5),
                    titleMatchScore: oaTitleSim,
                    authorMatchScore: 100,
                    journalMatchScore: oaResult.journal ? 85 : 50,
                    issues: []
                };
            }

            // CrossRef found but has issues - check if OpenAlex confirms different authors
            if (expected?.authors) {
                const expectedAuthorList = expected.authors.split(/[,&]|and/i).map(a => a.trim());

                if (!authorsMatch(expectedAuthorList, oaAuthors) && authorsMatch((crossRefResult.authors || '').split(', '), oaAuthors)) {
                    crossRefResult.correctedApa = formatOpenAlexAPA(oaResult);
                    crossRefResult.correctedBibtex = generateOpenAlexBibTeX(oaResult);
                    crossRefResult.fallbackSource = 'OpenAlex';
                    return crossRefResult;
                }
            }

            // CrossRef has version mismatch — check if OA has the right version
            if (crossRefResult.issues.some(i => i.toLowerCase().includes('year') || i.toLowerCase().includes('version') || i.toLowerCase().includes('preprint'))) {
                if (expectedYear && oaResult.year?.toString() === expectedYear) {
                    crossRefResult.correctedApa = formatOpenAlexAPA(oaResult);
                    crossRefResult.correctedBibtex = generateOpenAlexBibTeX(oaResult);
                    crossRefResult.fallbackSource = 'OpenAlex';
                    crossRefResult.matchConfidence = Math.min(100, crossRefResult.matchConfidence + 15);
                    return crossRefResult;
                }
            }
        }

        // If nothing found at all (CrossRef also returned NotFound)
        if (!crossRefResult.exists) {
            return {
                exists: false,
                source: 'NotFound',
                matchConfidence: 0,
                titleMatchScore: 0,
                authorMatchScore: 0,
                journalMatchScore: 0,
                issues: ['Title not found in any source (CrossRef, Semantic Scholar, OpenAlex)']
            };
        }
    }

    return crossRefResult;
};
