// @ts-expect-error No types available for this library
import bibtexParse from 'bibtex-parse-js';

export interface ParsedReference {
    entryTags: {
        title?: string;
        author?: string;
        year?: string;
        journal?: string;
        doi?: string;
        [key: string]: string | undefined;
    };
    entryType: string;
    citationKey: string;
}

export const parseBibTex = (bibtex: string): ParsedReference[] => {
    try {
        // The library exports toJSON function, but sometimes it is the default export object
        // Adjust based on actual import behavior if needed.
        const parsed = bibtexParse.toJSON(bibtex);
        return parsed as ParsedReference[];
    } catch (e) {
        console.error("BibTex parsing failed", e);
        return [];
    }
};
