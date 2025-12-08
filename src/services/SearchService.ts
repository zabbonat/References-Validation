export interface CheckResult {
    exists: boolean;
    title?: string;
    url?: string;
    doi?: string;
    score?: number;
    source: 'CrossRef' | 'NotFound';
}

export const checkReference = async (query: string): Promise<CheckResult> => {
    try {
        const response = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=1`);
        if (!response.ok) {
            return { exists: false, source: 'NotFound' };
        }
        const data = await response.json();
        const items = data.message?.items || [];

        if (items.length > 0) {
            const item = items[0];
            // Simple heuristic to verify relevance could be added here
            return {
                exists: true,
                title: item.title?.[0],
                url: item.URL,
                doi: item.DOI,
                score: item.score,
                source: 'CrossRef'
            };
        }

        return { exists: false, source: 'NotFound' };
    } catch (error) {
        console.error("Search failed", error);
        return { exists: false, source: 'NotFound' };
    }
};
