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

    // Validations
    matchConfidence: number; // 0-100
    titleMatchScore: number;
    authorMatchScore: number;
    journalMatchScore: number;
    issues: string[]; // e.g., "Authors Mismatch"

    source: 'CrossRef' | 'NotFound';
}

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
        .replace(/\{?\\'\{?([aeiouAEIOU])\}?\}?/g, '$1')  // acute: {\'a} or \'a
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
        // IMPROVEMENT: Fetch top 3 results to avoid "fake author" confusing the search
        const response = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3`);
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

            // SELECT BEST MATCH
            // We iterate through top 3 items and pick the one with best TITLE match.
            // This ensures that if the author is wrong in the query, we still find the correct paper by title.
            let bestItem = items[0];
            let bestTitleSim = 0;

            for (const item of items) {
                const iTitle = item.title?.[0] || "";

                let sim = 0;
                if (expected?.title) {
                    sim = calculateSimilarity(expected.title, iTitle);
                } else {
                    // In Quick Check, check if title is contained in query
                    // Use a more robust check: remove punctuation and check inclusion
                    const nTitle = normalize(iTitle);
                    if (nQuery.includes(nTitle)) {
                        sim = 100; // Perfect containment
                    } else {
                        sim = calculateSimilarity(query, iTitle);
                    }
                }

                if (sim > bestTitleSim) {
                    bestTitleSim = sim;
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

            // Validation Logic
            let titleSim = bestTitleSim; // We already calculated this
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
                    // Check 1: Are real authors present?
                    const authorsFound = realAuthorFamilies.filter(author => normExpected.includes(author));

                    if (authorsFound.length > 0) {
                        authorSim = Math.min(100, Math.round((authorsFound.length / realAuthorFamilies.length) * 100));
                    } else {
                        // Fallback to strict similarity if containment fails
                        authorSim = calculateSimilarity(expected.authors, resultAuthors);
                    }

                    // Check 2: Are there EXTRA authors in expected? (The new requirement)
                    // We split expected authors by common delimiters
                    // First decode LaTeX in expected authors
                    const decodedExpectedAuthors = decodeLatex(expected.authors);
                    const expectedList = decodedExpectedAuthors
                        .split(/[,&]|\sand\s/i)
                        .map(s => s.trim())
                        .filter(s => s.length > 2); // Ignore initials-only or short junk

                    const extraAuthors = [];
                    for (const expAuth of expectedList) {
                        const nExp = normalize(expAuth);
                        // Check if this expected author matches ANY real author family name
                        const matchesFamily = realAuthorFamilies.some(real => real.includes(nExp) || nExp.includes(real));
                        // OR if first letter matches any real author given name
                        const matchesGiven = realAuthorGivens.some(given => firstLetterMatches(expAuth, given));

                        if (!matchesFamily && !matchesGiven) {
                            extraAuthors.push(expAuth);
                        }
                    }

                    if (extraAuthors.length > 0) {
                        issues.push(`Extra/Fake Authors detected: ${extraAuthors.join(", ")}`);
                        authorSim -= (20 * extraAuthors.length); // Heavy penalty for fake authors
                    }

                } else {
                    authorSim = 100;
                }

                // Journal Matching (Batch Mode)
                if (expected.journal) {
                    journalSim = calculateSimilarity(expected.journal, resultJournal);
                } else {
                    journalSim = 100; // No journal to compare
                }

                // Year Matching (Batch Mode)
                let yearSim = 100;
                if (expected.year && resultYear) {
                    if (expected.year === resultYear) {
                        yearSim = 100;
                    } else {
                        yearSim = 0;
                        issues.push(`Year Mismatch: expected ${expected.year}, found ${resultYear}`);
                    }
                }

                overallSim = (titleSim + authorSim + journalSim + yearSim) / 4;
            } else {
                // Free text validation (Quick Check)

                // ===== 1. TITLE =====
                // Already calculated as bestTitleSim, double-check containment
                if (titleSim < 95 && nQuery.includes(nResultTitle)) {
                    titleSim = 95;
                }

                // ===== 2. AUTHORS from CrossRef =====
                // Simply check: how many CrossRef authors appear in the query?
                const authorsFound = realAuthorFamilies.filter(author => nQuery.includes(author));
                const authorsMissing = realAuthorFamilies.filter(author => !nQuery.includes(author));

                if (authorsFound.length === realAuthorFamilies.length) {
                    authorSim = 100;
                } else if (authorsFound.length > 0) {
                    authorSim = Math.round((authorsFound.length / realAuthorFamilies.length) * 100);
                    if (authorsMissing.length > 0 && titleSim > 70) {
                        // Don't flag missing authors if we suspect the user just truncated the list (et al)
                        // But here we are strict about *found* authors.
                        // issues.push(`Missing authors: ${authorsMissing.join(", ")}`); 
                    }
                } else {
                    authorSim = 0;
                    if (titleSim > 80) {
                        issues.push(`Author Mismatch: none of the real authors found`);
                    }
                }

                // ===== NEW: DETECT FAKE AUTHORS (Quick Check) =====
                // Heuristic: Remove Title words, Journal words, Year from Query.
                // What remains are likely authors. Check them.

                let queryRemains = nQuery;

                // Remove Title Tokens
                const titleTokens = nResultTitle.split(" ");
                titleTokens.forEach(token => {
                    if (token.length > 3) queryRemains = queryRemains.replace(token, "");
                });

                // Remove Journal Tokens
                if (resultJournal) {
                    const journalTokens = normalize(resultJournal).split(" ");
                    journalTokens.forEach(token => {
                        if (token.length > 3) queryRemains = queryRemains.replace(token, "");
                    });
                }

                // Remove Year
                if (resultYear) {
                    queryRemains = queryRemains.replace(resultYear, "");
                }

                // Remove common words
                const stopWords = ["vol", "issue", "pp", "doi", "http", "https", "org", "com", "www"];
                stopWords.forEach(w => queryRemains = queryRemains.replace(w, ""));

                // Now analyze potential names in the original Query that map to the "remains"
                // This is hard to do perfectly with just string replacement. 
                // Alternative: Tokenize the original Query, filter out tokens that matched Title/Journal.

                const queryTokens = query.split(/[\s,.:;()]+/);
                const potentialFakeAuthors = [];

                for (const token of queryTokens) {
                    const nToken = normalize(token);
                    if (nToken.length < 3) continue; // Skip short
                    if (!/^[A-Z]/.test(token)) continue; // Skip lowercase structure words
                    if (stopWords.includes(nToken)) continue;

                    // Is this token part of the Title?
                    if (nResultTitle.includes(nToken)) continue;
                    // Is this token part of the Journal?
                    if (resultJournal && normalize(resultJournal).includes(nToken)) continue;
                    // Is this token part of the Year?
                    if (resultYear && resultYear.includes(token)) continue;

                    // Is this token a Real Author family name?
                    const isRealAuthorFamily = realAuthorFamilies.some(real => real.includes(nToken) || nToken.includes(real));
                    // Is this token a Real Author given name (first letter match)?
                    const isRealAuthorGiven = realAuthorGivens.some(given => firstLetterMatches(token, given));

                    if (!isRealAuthorFamily && !isRealAuthorGiven) {
                        // It's Capitalized, not title, not journal, not year, and NOT a real author.
                        // High chance it's a fake author or garbage.
                        // To be safe, we collect them.
                        potentialFakeAuthors.push(token);
                    }
                }

                if (potentialFakeAuthors.length > 0) {
                    // Filter out duplicates
                    const uniqueFakes = [...new Set(potentialFakeAuthors)];
                    // Limit output
                    if (uniqueFakes.length <= 5) { // If too many, it's probably just a mismatch query
                        issues.push(`Possible Extra/Fake Authors: ${uniqueFakes.join(", ")}`);
                        authorSim -= (10 * uniqueFakes.length);
                    }
                }


                // ===== 3. JOURNAL from CrossRef =====
                if (resultJournal && resultJournal.length > 3) {
                    // Check if journal name (or significant words) appears in query
                    const journalWords = normalize(resultJournal).split(/\s+/).filter(w => w.length >= 4);
                    const journalInQuery = journalWords.some(word => nQuery.includes(word));

                    if (journalInQuery) {
                        journalSim = 100;
                    } else {
                        journalSim = 0;
                        if (titleSim > 70) {
                            issues.push(`Journal Mismatch: actual is "${resultJournal}"`);
                        }
                    }
                } else {
                    journalSim = 50; // CrossRef has no journal info
                }

                // ===== 4. YEAR from CrossRef =====
                if (resultYear && resultYear.length === 4) {
                    // Check if the CrossRef year appears in query
                    const yearsInQuery: string[] = query.match(/\b(19|20)\d{2}\b/g) || [];

                    if (yearsInQuery.includes(resultYear)) {
                        // Year matches - good!
                    } else if (yearsInQuery.length > 0) {
                        // User wrote a different year
                        issues.push(`Year Mismatch: you wrote ${yearsInQuery[0]}, actual is ${resultYear}`);
                        overallSim -= 25;
                    }
                    // If no year in query, that's okay - don't penalize
                }

                // Overall Score Calculation
                if (titleSim > 80) {
                    if (authorSim >= 90) { // Slight relaxation
                        overallSim = titleSim;
                    } else {
                        // Title Good but Author Bad -> Penalize
                        overallSim = titleSim - (100 - authorSim) * 0.5;
                    }
                } else {
                    // Weak Title Match
                    overallSim = (titleSim + authorSim) / 2;
                }

                // Apply journal penalty for Quick Check mode
                if (journalSim === 0 && titleSim > 60) {
                    overallSim -= 15; // Journal mismatch penalty
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
