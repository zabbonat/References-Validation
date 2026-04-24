/**
 * Reference Export Service
 * Handles generation and download of .bib and APA files from batch results
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
 * Generate a combined APA citation list from multiple check results
 */
export const generateAPAFileContent = (results: CheckResult[]): string => {
    return results
        .filter(r => r.exists && r.apa)
        .map((r, i) => `[${i + 1}] ${r.apa}`)
        .join('\n\n');
};

/**
 * Download content as a file
 */
export const downloadFile = (content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8'): void => {
    const blob = new Blob([content], { type: mimeType });
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
 * Download content as a .bib file (convenience wrapper)
 */
export const downloadBibFile = (content: string, filename: string = 'references.bib'): void => {
    downloadFile(content, filename);
};

/**
 * Copy content to clipboard
 */
export const copyToClipboard = async (content: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(content);
        return true;
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
};

// Backward compatibility aliases
export const copyBibToClipboard = copyToClipboard;
