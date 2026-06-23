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

export const generateMLAFileContent = (results: CheckResult[]): string => {
    return results
        .filter(r => r.exists && r.mla)
        .map((r, i) => `[${i + 1}] ${r.mla}`)
        .join('\n\n');
};

export const generateISO690FileContent = (results: CheckResult[]): string => {
    return results
        .filter(r => r.exists && r.iso690)
        .map((r, i) => `[${i + 1}] ${r.iso690}`)
        .join('\n\n');
};

/**
 * Generate RIS format content (compatible with Zotero, Mendeley, EndNote)
 * RIS is a standard tag-value format for bibliographic references
 */
export const generateRISFileContent = (results: CheckResult[]): string => {
    return results
        .filter(r => r.exists && r.title)
        .map(r => {
            const lines: string[] = [];
            lines.push('TY  - JOUR');
            if (r.title) lines.push(`TI  - ${r.title}`);
            
            // Parse authors from the APA string or authors field
            if (r.authors) {
                // Split authors by common separators: ", and ", " & ", "; ", ", "
                const authorList = r.authors
                    .replace(/\s*&\s*/g, ', ')
                    .replace(/\s+and\s+/gi, ', ')
                    .split(/;\s*|,\s*(?=[A-Z])/)
                    .map(a => a.trim())
                    .filter(a => a.length > 1 && !/^et\s+al/i.test(a));
                for (const author of authorList) {
                    lines.push(`AU  - ${author}`);
                }
            }
            
            if (r.year) lines.push(`PY  - ${r.year}`);
            if (r.journal) lines.push(`JO  - ${r.journal}`);
            if (r.doi) lines.push(`DO  - ${r.doi}`);
            if (r.url) lines.push(`UR  - ${r.url}`);
            lines.push('ER  - ');
            return lines.join('\n');
        })
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

/**
 * Generate and download Excel report from validation results
 */
export const downloadExcelFile = async (results: { ref: string; result?: CheckResult }[], filename: string = 'validation_report.xlsx'): Promise<void> => {
    const XLSX = await import('xlsx');
    
    const data = results.map((item, idx) => {
        const r = item.result;
        if (!r) return {
            'No.': idx + 1,
            'Original Reference': item.ref,
            'Status': 'Loading/Error',
            'Found Title': '',
            'Found Authors': '',
            'Found Year': '',
            'Found Journal': '',
            'DOI': '',
            'Confidence (%)': '',
            'Issues': '',
            'Retracted': '',
            'Predatory': '',
            'Source': ''
        };

        const status = !r.exists ? 'Not Found' 
                     : r.matchConfidence > 80 ? 'Verified'
                     : r.matchConfidence > 50 ? 'Partial Match'
                     : 'Mismatch / Error';

        return {
            'No.': idx + 1,
            'Original Reference': item.ref,
            'Status': status,
            'Found Title': r.title || '',
            'Found Authors': r.authors || '',
            'Found Year': r.year || '',
            'Found Journal': r.journal || '',
            'DOI': r.doi || '',
            'Confidence (%)': r.exists ? r.matchConfidence : 0,
            'Issues': r.issues ? r.issues.join('; ') : '',
            'Retracted': r.retracted ? 'YES' : 'NO',
            'Predatory': r.predatory ? 'YES' : 'NO',
            'Source': r.source || ''
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    worksheet['!cols'] = [
        { wch: 5 },   // No.
        { wch: 50 },  // Original Ref
        { wch: 15 },  // Status
        { wch: 40 },  // Found Title
        { wch: 30 },  // Found Authors
        { wch: 10 },  // Found Year
        { wch: 20 },  // Found Journal
        { wch: 15 },  // DOI
        { wch: 15 },  // Confidence
        { wch: 40 },  // Issues
        { wch: 12 },  // Retracted
        { wch: 12 },  // Predatory
        { wch: 15 }   // Source
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Validation Report');
    XLSX.writeFile(workbook, filename);
};
