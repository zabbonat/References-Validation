/**
 * BibTeX Export Service
 * Handles generation and download of .bib files from batch results
 */

import type { CheckResult } from './SearchService';

/**
 * Generate a combined .bib file content from multiple check results
 * Only includes results that have valid bibtex
 */
export const generateBibFileContent = (results: CheckResult[]): string => {
    const bibtexEntries = results
        .filter(r => r.exists && r.bibtex)
        .map(r => r.bibtex)
        .join('\n\n');

    return bibtexEntries;
};

/**
 * Download content as a .bib file
 */
export const downloadBibFile = (content: string, filename: string = 'references.bib'): void => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
};

/**
 * Copy .bib content to clipboard
 */
export const copyBibToClipboard = async (content: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(content);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
};
