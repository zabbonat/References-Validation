import React, { useState, useMemo } from 'react';
import type { CheckResult } from '../services/SearchService';
import { generateBibFileContent, generateAPAFileContent, downloadBibFile, downloadFile, copyToClipboard } from '../services/BibExportService';
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Search, Copy, Check, FileText, ArrowLeft, Download, Printer } from 'lucide-react';

interface ReportItem {
    ref: string;
    result?: CheckResult;
    duplicateOf?: number;
}

interface ReportViewProps {
    items: ReportItem[];
    onBack: () => void;
}

/**
 * Build a Google Scholar search URL from a reference string
 */
const getGoogleScholarUrl = (reference: string): string => {
    const cleaned = reference
        .replace(/[@{}]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 200);
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(cleaned)}`;
};

/**
 * Small copy button with feedback
 */
const CopyBtn: React.FC<{ text: string; label: string; className?: string }> = ({ text, label, className = '' }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    return (
        <button
            onClick={handleCopy}
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${className}`}
        >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : label}</span>
        </button>
    );
};

/**
 * Status icon + label
 */
const StatusBadge: React.FC<{ result: CheckResult }> = ({ result }) => {
    if (result.retracted) {
        return (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                <AlertTriangle size={12} />
                <span>RETRACTED</span>
            </span>
        );
    }
    if (!result.exists) {
        return (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                <XCircle size={12} />
                <span>Not Found</span>
            </span>
        );
    }
    if (result.matchConfidence > 80) {
        return (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                <CheckCircle size={12} />
                <span>Verified ({result.matchConfidence}%)</span>
            </span>
        );
    }
    return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
            <AlertTriangle size={12} />
            <span>Partial Match ({result.matchConfidence}%)</span>
        </span>
    );
};

export const ReportView: React.FC<ReportViewProps> = ({ items, onBack }) => {
    const [copyAllSuccess, setCopyAllSuccess] = useState(false);

    const results = useMemo(() => items.filter(i => i.result), [items]);
    const stats = useMemo(() => {
        const verified = results.filter(r => r.result!.exists && r.result!.matchConfidence > 80).length;
        const partial = results.filter(r => r.result!.exists && r.result!.matchConfidence <= 80).length;
        const notFound = results.filter(r => !r.result!.exists).length;
        const withIssues = results.filter(r => r.result!.issues.length > 0).length;
        const retracted = results.filter(r => r.result!.retracted).length;
        return { verified, partial, notFound, withIssues, retracted, total: results.length };
    }, [results]);

    const handleCopyAllBib = async () => {
        const allResults = items.map(i => i.result).filter((r): r is CheckResult => !!r);
        const bibContent = generateBibFileContent(allResults);
        const success = await copyToClipboard(bibContent);
        if (success) {
            setCopyAllSuccess(true);
            setTimeout(() => setCopyAllSuccess(false), 2000);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
            {/* Header — hidden when printing */}
            <header className="bg-white border-b px-4 py-3 shadow-sm sticky top-0 z-10 print:hidden">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <FileText className="text-indigo-600" size={20} />
                        <h1 className="font-bold text-lg text-gray-800">Validation Report</h1>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleCopyAllBib}
                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                        >
                            {copyAllSuccess ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copyAllSuccess ? 'Copied!' : 'Copy All .bib'}</span>
                        </button>
                        <button
                            onClick={() => {
                                const allResults = items.map(i => i.result).filter((r): r is CheckResult => !!r);
                                downloadBibFile(generateBibFileContent(allResults), 'report_references.bib');
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                        >
                            <Download size={14} />
                            <span>Download .bib</span>
                        </button>
                        <button
                            onClick={() => {
                                const allResults = items.map(i => i.result).filter((r): r is CheckResult => !!r);
                                downloadFile(generateAPAFileContent(allResults), 'report_references_APA.txt');
                            }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                        >
                            <Download size={14} />
                            <span>Download APA</span>
                        </button>
                        <button
                            onClick={handlePrint}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-1.5 text-sm"
                        >
                            <Printer size={14} />
                            <span>Print</span>
                        </button>
                        <button
                            onClick={onBack}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors flex items-center space-x-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>Back</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 overflow-auto">
                <div className="max-w-5xl mx-auto">
                    {/* Report Title (visible when printing) */}
                    <div className="hidden print:block text-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">Reference Validation Report</h1>
                        <p className="text-sm text-gray-500 mt-1">Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
                        <h2 className="text-sm font-bold text-gray-500 uppercase mb-3">Summary</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
                                <div className="text-xs text-gray-500 font-medium">Total</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-green-700">{stats.verified}</div>
                                <div className="text-xs text-green-600 font-medium">Verified</div>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-yellow-700">{stats.partial}</div>
                                <div className="text-xs text-yellow-600 font-medium">Partial</div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-red-700">{stats.notFound}</div>
                                <div className="text-xs text-red-600 font-medium">Not Found</div>
                            </div>
                            <div className="bg-orange-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-orange-700">{stats.withIssues}</div>
                                <div className="text-xs text-orange-600 font-medium">With Issues</div>
                            </div>
                        </div>
                        {stats.retracted > 0 && (
                            <div className="mt-3 px-3 py-2 bg-red-100 border border-red-300 rounded-lg flex items-center space-x-2">
                                <AlertTriangle size={16} className="text-red-700" />
                                <span className="text-sm font-bold text-red-700">⚠ {stats.retracted} retracted paper(s) detected!</span>
                            </div>
                        )}
                    </div>

                    {/* All References — no filter */}
                    <div className="space-y-3">
                        {items.map((item, idx) => {
                            const result = item.result;
                            if (!result) return null;

                            const isVerified = result.exists && result.matchConfidence > 80;
                            const isPartial = result.exists && result.matchConfidence <= 80;
                            const isNotFound = !result.exists;

                            return (
                                <div
                                    key={idx}
                                    className={`bg-white rounded-xl shadow-sm border overflow-hidden print:break-inside-avoid ${
                                        result.retracted ? 'border-red-400 border-2' : ''
                                    }`}
                                >
                                    {/* Reference header */}
                                    <div className={`px-4 py-2.5 flex items-center justify-between ${
                                        isVerified ? 'bg-green-50 border-b border-green-100' :
                                        isPartial ? 'bg-yellow-50 border-b border-yellow-100' :
                                        'bg-red-50 border-b border-red-100'
                                    }`}>
                                        <div className="flex items-center space-x-3">
                                            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">#{idx + 1}</span>
                                            <StatusBadge result={result} />
                                            {item.duplicateOf !== undefined && (
                                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
                                                    ⚠ Duplicate of #{item.duplicateOf}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            {result.source !== 'NotFound' && (
                                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                                                    {result.source}
                                                    {result.fallbackSource ? ` + ${result.fallbackSource}` : ''}
                                                </span>
                                            )}
                                            {result.url && (
                                                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 print:hidden">
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-3">
                                        {/* User's input */}
                                        <div>
                                            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Your Input</div>
                                            <div className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed bg-gray-50 rounded-lg px-3 py-2">
                                                {item.ref}
                                            </div>
                                        </div>

                                        {/* Found result */}
                                        {result.exists && (
                                            <div>
                                                <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Found Reference</div>
                                                {/* Corrected APA */}
                                                {result.correctedApa && (
                                                    <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-gray-800 mb-2">
                                                        <span className="font-bold text-xs text-green-600 block mb-1">✓ Corrected (APA):</span>
                                                        {result.correctedApa}
                                                    </div>
                                                )}
                                                {/* Original APA */}
                                                {result.apa && (
                                                    <div className="p-2.5 bg-white border rounded-lg text-sm text-gray-800">
                                                        <span className="font-bold text-xs text-blue-600 block mb-1">APA Style:</span>
                                                        {result.apa}
                                                    </div>
                                                )}
                                                {/* Metadata row */}
                                                <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                                                    {result.journal && <span className="bg-gray-100 px-2 py-0.5 rounded">{result.journal}</span>}
                                                    {result.year && <span className="bg-gray-100 px-2 py-0.5 rounded">{result.year}</span>}
                                                    {result.doi && <span className="bg-gray-100 px-2 py-0.5 rounded">DOI: {result.doi}</span>}
                                                </div>
                                            </div>
                                        )}

                                        {/* Issues */}
                                        {result.issues && result.issues.length > 0 && (
                                            <div className="space-y-1 border-t pt-2 border-gray-200">
                                                {result.issues.map((issue, i) => (
                                                    <div key={i} className={`text-xs font-semibold ${issue.includes('RETRACTED') ? 'text-red-700' : 'text-orange-600'}`}>
                                                        • {issue}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex flex-wrap gap-2 print:hidden">
                                            {/* Copy BibTeX */}
                                            {(result.correctedBibtex || result.bibtex) && (
                                                <CopyBtn
                                                    text={result.correctedBibtex || result.bibtex || ''}
                                                    label={result.correctedBibtex ? 'Copy BibTeX (Corrected)' : 'Copy BibTeX'}
                                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                />
                                            )}
                                            {/* Copy APA */}
                                            {result.apa && (
                                                <CopyBtn
                                                    text={result.correctedApa || result.apa}
                                                    label={result.correctedApa ? 'Copy APA (Corrected)' : 'Copy APA'}
                                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                />
                                            )}
                                            {/* Google Scholar — for not found or partial matches */}
                                            {(isNotFound || isPartial) && (
                                                <a
                                                    href={getGoogleScholarUrl(item.ref)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
                                                >
                                                    <Search size={12} />
                                                    <span>Search on Google Scholar</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="text-center text-xs text-gray-400 mt-8 mb-4">
                        Generated by CheckIfExist — Reference Validation Tool
                    </div>
                </div>
            </main>
        </div>
    );
};
