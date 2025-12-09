// @ts-expect-error - The library lacks types, but we've vendored it
import bibtexParse from '../vendors/bibtexParse.js';

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
