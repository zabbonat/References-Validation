import React, { useState } from 'react';
import type { CheckResult } from '../services/SearchService';
import { CheckCircle, XCircle, ExternalLink, Search, Copy, Check, AlertTriangle, Edit2 } from 'lucide-react';

interface Props {
    reference: string;
    result?: CheckResult;
    loading?: boolean;
    duplicateOf?: number; // ref number of the duplicate
    onUpdateResult?: (updated: CheckResult) => void;
}

const SourceBadge: React.FC<{ source: CheckResult['source'], fallback?: CheckResult['fallbackSource'] }> = ({ source, fallback }) => {
    const colors = {
        'CrossRef': 'bg-blue-100 text-blue-700',
        'SemanticScholar': 'bg-purple-100 text-purple-700',
        'OpenAlex': 'bg-orange-100 text-orange-700',
        'NotFound': 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300/90'
    };

    return (
        <div className="flex items-center space-x-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[source]}`}>
                {source}
            </span>
            {fallback && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[fallback]}`}>
                    + {fallback}
                </span>
            )}
        </div>
    );
};

/**
 * Build a Google Scholar search URL from a reference string
 */
const getGoogleScholarUrl = (reference: string): string => {
    // Clean up the reference for a better search query
    const cleaned = reference
        .replace(/https?:\/\/[^\s]+/ig, '')              // Remove URLs
        .replace(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/ig, '') // Remove bare DOIs
        .replace(/doi:\s*/ig, '')                        // Remove dangling "doi:" text
        .replace(/[@{}]/g, '')                           // Remove BibTeX artifacts
        .replace(/\s{2,}/g, ' ')                         // Collapse multiple spaces
        .trim()
        .slice(0, 200);                                  // Google Scholar has query length limits
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(cleaned)}`;
};

/**
 * Small copy button component with feedback
 */
const CopyButton: React.FC<{ text: string, label: string }> = ({ text, label }) => {
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
            className="flex items-center space-x-1 px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-xs font-medium transition-colors"
        >
            {copied ? <Check size={12} className="text-green-600 dark:text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : label}</span>
        </button>
    );
};

export const CheckResultCard: React.FC<Props> = ({ reference, result, loading, duplicateOf, onUpdateResult }) => {
    const [activeTab, setActiveTab] = useState<'apa'|'mla'|'iso690'|'bibtex'>('apa');

    return (
        <div className={`border rounded-lg bg-white dark:bg-slate-800/80 shadow-sm mb-2 overflow-hidden ${result?.retracted ? 'border-red-400 border-2 dark:border-rose-500/30' : ''}`}>
            {/* Header bar with status + source */}
            {!loading && result && (
                <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#0B1120] border-b dark:border-slate-700/50">
                    <div className="flex items-center space-x-2">
                        {result.exists ? (
                            result.matchConfidence > 80 ? (
                                <div className="flex items-center text-green-600 dark:text-emerald-400 space-x-1">
                                    <CheckCircle size={16} />
                                    <span className="text-xs font-bold">Verified ({result.matchConfidence}%)</span>
                                </div>
                            ) : result.matchConfidence > 50 ? (
                                <div className="flex items-center text-yellow-600 dark:text-amber-400 space-x-1">
                                    <XCircle size={16} />
                                    <span className="text-xs font-bold">Partial Match ({result.matchConfidence}%)</span>
                                </div>
                            ) : (
                                <div className="flex items-center text-orange-600 dark:text-amber-400 space-x-1">
                                    <AlertTriangle size={16} />
                                    <span className="text-xs font-bold">Mismatch / Error</span>
                                </div>
                            )
                        ) : (
                            <div className="flex items-center text-red-600 dark:text-rose-400 space-x-1">
                                <XCircle size={16} />
                                <span className="text-xs font-bold">Not Found</span>
                            </div>
                        )}

                        {/* Duplicate badge */}
                        {duplicateOf !== undefined && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">
                                ⚠ Duplicate of #{duplicateOf}
                            </span>
                        )}

                        {result.url && (
                            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                <ExternalLink size={14} />
                            </a>
                        )}
                    </div>

                    <SourceBadge source={result.source} fallback={result.fallbackSource} />
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="px-4 py-3">
                    <div className="text-sm text-slate-700 dark:text-slate-300/90 font-medium mb-1 truncate" title={reference}>
                        {reference}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400 text-xs">Checking...</div>
                </div>
            )}

            {/* Side-by-side content */}
            {!loading && result && (
                <div className="flex flex-col md:flex-row">
                    {/* LEFT: What the user inserted */}
                    <div className="flex-1 p-4 border-r border-slate-100">
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Your Input</div>
                        <div className="text-sm text-slate-700 dark:text-slate-300/90 whitespace-pre-wrap break-words leading-relaxed">
                            {reference}
                        </div>
                    </div>

                    {/* RIGHT: Correct / found version */}
                    <div className={`flex-1 p-4 ${result.retracted ? 'bg-red-50/50 dark:bg-rose-500/5' : result.exists ? 'bg-green-50/50 dark:bg-emerald-500/5' : 'bg-red-50/30 dark:bg-rose-500/5'}`}>
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">
                            {result.exists ? 'Found Reference' : 'Result'}
                        </div>

                        {result.exists ? (
                            <div className="space-y-2 flex flex-col h-full">
                                {result.retracted && (
                                    <div className="p-3 mb-2 bg-red-600 text-white font-bold rounded-md flex items-center space-x-2 shadow-sm border border-red-700">
                                        <AlertTriangle size={20} className="animate-pulse" />
                                        <span className="text-sm uppercase tracking-wider">Warning: This Article Has Been Retracted</span>
                                    </div>
                                )}
                                {/* Editable format tabs */}
                                <div className="mt-3">
                                    <div className="flex border-b border-slate-200 dark:border-slate-700/50 mb-2">
                                        {(['apa', 'mla', 'iso690', 'bibtex'] as const).map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveTab(tab)}
                                                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                                            >
                                                {tab === 'iso690' ? 'ISO 690' : tab.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <textarea
                                            value={
                                                activeTab === 'apa' ? (result.correctedApa || result.apa || '') :
                                                activeTab === 'mla' ? (result.correctedMla || result.mla || '') :
                                                activeTab === 'iso690' ? (result.correctedIso690 || result.iso690 || '') :
                                                (result.correctedBibtex || result.bibtex || '')
                                            }
                                            onChange={(e) => {
                                                if (!onUpdateResult) return;
                                                const val = e.target.value;
                                                const updated = { ...result };
                                                if (activeTab === 'apa') updated.correctedApa = val;
                                                else if (activeTab === 'mla') updated.correctedMla = val;
                                                else if (activeTab === 'iso690') updated.correctedIso690 = val;
                                                else if (activeTab === 'bibtex') updated.correctedBibtex = val;
                                                onUpdateResult(updated);
                                            }}
                                            rows={4}
                                            className="w-full p-2.5 text-sm bg-white dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y transition-colors font-mono"
                                            placeholder={`Edit ${activeTab.toUpperCase()} format manually...`}
                                        />
                                        <Edit2 size={12} className="absolute top-2 right-2 text-slate-400 pointer-events-none opacity-50" />
                                    </div>
                                </div>

                                <div className="flex space-x-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    {result.journal && <span>{result.journal}</span>}
                                    {result.year && <span>({result.year})</span>}
                                    {result.citations !== undefined && (
                                        <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                                            {result.citations} Citations
                                        </span>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {result.apa && (
                                        <CopyButton text={result.correctedApa || result.apa} label={result.correctedApa ? 'Copy APA (Corrected)' : 'Copy APA'} />
                                    )}
                                    {result.mla && (
                                        <CopyButton text={result.correctedMla || result.mla} label={result.correctedMla ? 'Copy MLA (Corrected)' : 'Copy MLA'} />
                                    )}
                                    {result.iso690 && (
                                        <CopyButton text={result.correctedIso690 || result.iso690} label={result.correctedIso690 ? 'Copy ISO 690 (Corrected)' : 'Copy ISO 690'} />
                                    )}
                                    {(result.correctedBibtex || result.bibtex) && (
                                        <CopyButton text={result.correctedBibtex || result.bibtex || ''} label={result.correctedBibtex ? 'Copy BibTeX (Corrected)' : 'Copy BibTeX'} />
                                    )}
                                </div>

                                {/* Issues */}
                                {result.issues && result.issues.length > 0 && (
                                    <div className="space-y-1 border-t dark:border-slate-700/50 pt-2 border-slate-200">
                                        {result.issues.map((issue, idx) => (
                                            <div key={idx} className={`text-xs font-semibold ${issue.includes('RETRACTED') ? 'text-red-700 dark:text-rose-400' : 'text-red-500 dark:text-rose-400'}`}>• {issue}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Google Scholar button for partial matches */}
                                {result.matchConfidence <= 80 && (
                                    <a
                                        href={getGoogleScholarUrl(reference)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 text-xs font-medium rounded-lg transition-colors mt-1"
                                    >
                                        <Search size={14} />
                                        <span>{result.matchConfidence <= 50 ? 'Search on Google Scholar (without DOI)' : 'Search on Google Scholar'}</span>
                                    </a>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    No matching reference found in CrossRef, Semantic Scholar, or OpenAlex.
                                </p>

                                {result.issues && result.issues.length > 0 && (
                                    <div className="space-y-1">
                                        {result.issues.map((issue, idx) => (
                                            <div key={idx} className="text-xs text-red-500 font-semibold">• {issue}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Google Scholar fallback */}
                                <a
                                    href={getGoogleScholarUrl(reference)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 text-xs font-medium rounded-lg transition-colors"
                                >
                                    <Search size={14} />
                                    <span>Search on Google Scholar</span>
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
