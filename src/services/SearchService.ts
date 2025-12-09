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

            if (expected?.title) {
                // Strict validation (Batch Mode)

                if (expected.authors) {
                    // Relaxed Author Check
                    // Logic Change: Check if the *Found Family Name* (CrossRef) is contained in the *Expected Author String* (User Input)
                    // This handles "First Last" vs "Last First" automatically.
                    const normExpected = normalize(expected.authors);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const firstFoundFamily = normalize(item.author?.[0]?.family || "");

                    if (firstFoundFamily && normExpected.includes(firstFoundFamily)) {
                        authorSim = 100;
                    } else {
                        // Fallback to strict similarity if containment fails (maybe typo?)
                        authorSim = calculateSimilarity(expected.authors, resultAuthors);
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

                // 1. Title Score is already bestTitleSim 
                // Double check containment just in case better match logic missed it
                if (titleSim < 95 && nQuery.includes(nResultTitle)) {
                    titleSim = 95;
                }

                // 2. Author Validation using CrossRef author list
                // Get all real author family names from CrossRef
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const realAuthorFamilies: string[] = (item.author || [])
                    .map((a: any) => normalize(a.family || ""))
                    .filter((name: string) => name.length > 2);

                // Check if at least one real author is in the query
                const anyRealAuthorInQuery = realAuthorFamilies.some(family =>
                    nQuery.includes(family)
                );

                // Find author section using CrossRef title position
                // Authors can be BEFORE title (e.g., "Smith (2020). Title...") 
                // OR AFTER title (e.g., "Title... M Guerzoni, L Riso...")
                const titleLower = resultTitle.toLowerCase();
                const titlePos = query.toLowerCase().indexOf(titleLower.substring(0, Math.min(30, titleLower.length)));

                let authorSection = '';
                if (titlePos > 10) {
                    // Title found after some text - authors are likely before title
                    authorSection = query.substring(0, titlePos);
                } else if (titlePos >= 0) {
                    // Title at start or near start - authors might be after title
                    // Look for text after title that contains author names
                    const afterTitle = query.substring(titlePos + resultTitle.length);
                    // Authors often come right after title, before journal
                    const journalPos = afterTitle.toLowerCase().indexOf('journal');
                    if (journalPos > 0) {
                        authorSection = afterTitle.substring(0, journalPos);
                    } else {
                        // Take first 100 chars after title as potential author area
                        authorSection = afterTitle.substring(0, 100);
                    }
                }

                // Extract capitalized names from author section
                const potentialNames = authorSection.match(/\b[A-Z][a-z]{2,}\b/g) || [];
                const normalizedPotentialNames = [...new Set(potentialNames.map(n => normalize(n)))];

                // Check for fake authors (names in author section that aren't real authors)
                const fakeAuthors: string[] = [];
                for (const potentialName of normalizedPotentialNames) {
                    if (potentialName.length < 4) continue;
                    // Skip common words
                    const skipWords = ['the', 'and', 'for', 'from', 'with', 'journal', 'review', 'economics', 'finance', 'american', 'north', 'international'];
                    if (skipWords.includes(potentialName)) continue;

                    // Check if this is a real author
                    const isRealAuthor = realAuthorFamilies.some(real =>
                        real.includes(potentialName) || potentialName.includes(real)
                    );

                    if (!isRealAuthor) {
                        fakeAuthors.push(potentialName);
                    }
                }

                // Determine author score
                if (anyRealAuthorInQuery && fakeAuthors.length === 0) {
                    authorSim = 100;
                } else if (anyRealAuthorInQuery && fakeAuthors.length > 0) {
                    authorSim = 30;
                    issues.push(`Fake Author: "${fakeAuthors.join(", ")}" not in paper. Real authors: ${realAuthorFamilies.join(", ")}`);
                } else {
                    authorSim = 0;
                    if (titleSim > 80 && query.length > 50) {
                        issues.push(`Author Mismatch: real authors are ${realAuthorFamilies.join(", ")}`);
                    }
                }

                // 3. Journal Presence Check (Quick Check Mode)
                // Check if the REAL journal appears in the query. If a different journal is mentioned, flag it.
                if (resultJournal && resultJournal.length > 3) {
                    const normalizedJournal = normalize(resultJournal);
                    // Extract key words from journal name (at least 4 chars to avoid false positives)
                    const journalWords = normalizedJournal.split(/\s+/).filter(w => w.length >= 4);

                    // Check if any significant journal word appears in query
                    const journalInQuery = journalWords.some(word => nQuery.includes(word));

                    if (journalInQuery) {
                        journalSim = 100;
                    } else {
                        // The real journal is NOT in the query
                        // Check if the query seems to contain a journal name (text after author section)
                        // Common patterns: ends with "Journal Name" or has period-separated sections

                        // Look for journal indicators OR any capitalized phrase that could be a journal
                        const journalIndicators = ['journal', 'proceedings', 'transactions', 'review', 'quarterly', 'annals', 'bulletin', 'policy', 'science', 'studies', 'research', 'nature', 'lancet', 'bmj', 'plos', 'frontiers'];
                        const hasJournalLikeTerm = journalIndicators.some(ind => nQuery.includes(ind));

                        if (hasJournalLikeTerm && titleSim > 70) {
                            // User mentioned something that looks like a journal but it doesn't match the real one
                            journalSim = 0;
                            issues.push(`Possible Journal Mismatch (actual: ${resultJournal})`);
                        } else {
                            // No journal explicitly mentioned, that's okay
                            journalSim = 50; // Neutral
                        }
                    }
                } else {
                    journalSim = 50; // No journal to compare
                }
                // 4. Year Check (Quick Check Mode)
                // Extract years from query and check if the real year matches
                if (resultYear && resultYear.length === 4) {
                    // Find all 4-digit numbers in query that look like years (1900-2099)
                    const yearMatches: string[] = query.match(/\b(19|20)\d{2}\b/g) || [];

                    if (yearMatches.length > 0) {
                        // Check if the real year is among the years mentioned
                        const realYearInQuery = yearMatches.includes(resultYear);

                        if (!realYearInQuery) {
                            // User mentioned a year but it doesn't match the real one
                            issues.push(`Year Mismatch: you wrote ${yearMatches[0]}, actual is ${resultYear}`);
                            overallSim -= 25; // Year mismatch penalty
                        }
                    }
                }

                // Overall Score Calculation
                if (titleSim > 80) {
                    if (authorSim === 100) {
                        overallSim = Math.min(100, titleSim + 5);
                    } else {
                        // Title Good but Author Bad -> Penalize
                        overallSim = titleSim - 40; // Drop from ~95 to ~55
                    }
                } else {
                    // Weak Title Match
                    overallSim = (titleSim + authorSim) / 2;
                }

                // Apply journal penalty for Quick Check mode
                if (journalSim === 0) {
                    overallSim -= 25; // Journal mismatch penalty
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
