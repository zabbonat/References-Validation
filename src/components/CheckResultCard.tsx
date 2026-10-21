import React, { useState } from 'react';
import { DOMESTIC_TRANSLATED_TOOLTIP, type CheckResult } from '../services/SearchService';
import { CheckCircle, XCircle, ExternalLink, Search, Copy, Check, AlertTriangle, Edit2 } from 'lucide-react';

interface Props {
    reference: string;
    rawRef?: string;
    result?: CheckResult;
    loading?: boolean;
    duplicateOf?: number; // ref number of the duplicate
    onUpdateResult?: (updated: CheckResult) => void;
}

const SourceBadge: React.FC<{ source: CheckResult['source']; fallback?: CheckResult['fallbackSource']; resolutionState?: CheckResult['resolutionState'] }> = ({
    source,
    fallback,
    resolutionState
}) => {
    const colors: Record<string, string> = {
        'CrossRef': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
        'SemanticScholar': 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
        'OpenAlex': 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
        'Arxiv': 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
        'DBLP': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300',
        'NotFound':
            resolutionState === 'WARNING_DOMESTIC_TRANSLATED'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300/90'
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {resolutionState === 'WARNING_DOMESTIC_TRANSLATED' && (
                <span
                    className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 cursor-help"
                    title={DOMESTIC_TRANSLATED_TOOLTIP}
                >
                    WARNING_DOMESTIC_TRANSLATED
                </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[source] || colors.NotFound}`}>
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
    const cleaned = reference
        .replace(/https?:\/\/[^\s]+/gi, '')              // Remove URLs
        .replace(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi, '') // Remove bare DOIs
        .replace(/doi:\s*/gi, '')                        // Remove dangling "doi:" text
        .replace(/[@{}]/g, '')                           // Remove BibTeX artifacts
        .replace(/\s{2,}/g, ' ')                         // Collapse multiple spaces
        .trim()
        .slice(0, 200);                                  // Google Scholar has query length limits
    return `https://scholar.google.com/scholar?q=${encodeURIComponent(cleaned)}`;
};

/**
 * Build a Baidu Xueshu (Academic) search URL for verifying domestic Chinese references (CNKI/Wanfang/VIP).
 * Extracts the clean article title so Baidu Scholar matches the bilingual CNKI record directly.
 */
const getBaiduScholarUrl = (reference: string): string => {
    let titleCandidate = reference;

    // 1. If raw BibTeX, extract title={...}
    const bibTitleMatch = reference.match(/title\s*=\s*[{"]([^}"]+)[}"]/i);
    if (bibTitleMatch) {
        titleCandidate = bibTitleMatch[1];
    } else {
        // 2. If GB/T 7714 marker [J], [M], [D], etc. is present, title is right before it
        const gbtSplit = reference.split(/\[\s*(?:J|M|D|C|R|S|P|N|Z|EB\/OL)\s*\]/i);
        if (gbtSplit.length > 1 && gbtSplit[0].trim().length > 8) {
            const beforeGbt = gbtSplit[0].trim();
            const afterYear = beforeGbt.replace(/^.*?\(\d{4}[a-z]?\)\.\s*/i, '');
            if (afterYear !== beforeGbt && afterYear.trim().length > 8) {
                titleCandidate = afterYear.trim();
            } else {
                const parts = beforeGbt.split(/\.\s+/);
                titleCandidate = parts[parts.length - 1].trim();
            }
        }
    }

    const cleaned = titleCandidate
        .replace(/\[\s*(?:J|M|D|C|R|S|P|N|Z|EB\/OL)\s*\]/gi, '')
        .replace(/\[(in\s+)?chinese\]|\((in\s+)?chinese\)/gi, '')
        .replace(/https?:\/\/[^\s]+/gi, '')
        .replace(/[@{}]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 160);
    return `https://xueshu.baidu.com/s?wd=${encodeURIComponent(cleaned)}`;
};

/**
 * Small copy button component with feedback
 */
const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
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
            className="flex items-center space-x-1 px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs font-medium transition-colors"
        >
            {copied ? <Check size={12} className="text-green-600 dark:text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : label}</span>
        </button>
    );
};

export const CheckResultCard: React.FC<Props> = ({ reference, rawRef, result, loading, duplicateOf, onUpdateResult }) => {
    const [activeTab, setActiveTab] = useState<'apa'|'mla'|'iso690'|'bibtex'>('apa');
    const [isEditing, setIsEditing] = useState(false);

    const isDomesticWarning =
        !result?.exists &&
        (result?.resolutionState === 'WARNING_DOMESTIC_TRANSLATED' ||
            result?.domesticFlags?.isSuspectedChineseOrDomestic);

    const cardBorderClass = result?.retracted
        ? 'border-red-400 border-2 dark:border-rose-500/40'
        : result?.predatory
        ? 'border-orange-400 border-2 dark:border-orange-500/40'
        : isDomesticWarning
        ? 'border-amber-400 border-2 dark:border-amber-500/40'
        : 'border-slate-200 dark:border-slate-700/60';

    return (
        <div className={`border rounded-lg bg-white dark:bg-slate-800/80 shadow-sm mb-2 overflow-hidden ${cardBorderClass}`}>
            {/* Header bar with status + source */}
            {!loading && result && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 dark:bg-[#0B1120] border-b dark:border-slate-700/50">
                    <div className="flex flex-wrap items-center gap-2">
                        {result.exists ? (
                            result.matchConfidence > 80 ? (
                                <div className="flex items-center text-green-600 dark:text-emerald-400 space-x-1">
                                    <CheckCircle size={16} />
                                    <span className="text-xs font-bold">Verified ({result.matchConfidence}%)</span>
                                </div>
                            ) : result.matchConfidence > 50 ? (
                                <div className="flex items-center text-yellow-600 dark:text-amber-400 space-x-1">
                                    <AlertTriangle size={16} />
                                    <span className="text-xs font-bold">Partial Match ({result.matchConfidence}%)</span>
                                </div>
                            ) : (
                                <div className="flex items-center text-orange-600 dark:text-amber-400 space-x-1">
                                    <AlertTriangle size={16} />
                                    <span className="text-xs font-bold">Mismatch / Error</span>
                                </div>
                            )
                        ) : isDomesticWarning ? (
                            <div
                                className="flex items-center text-amber-600 dark:text-amber-400 space-x-1.5 cursor-help"
                                title={result.resolutionTooltip || DOMESTIC_TRANSLATED_TOOLTIP}
                            >
                                <AlertTriangle size={16} />
                                <span className="text-xs font-bold">
                                    Warning: Domestic / Translated Source
                                </span>
                            </div>
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

                    <SourceBadge
                        source={result.source}
                        fallback={result.fallbackSource}
                        resolutionState={result.resolutionState}
                    />
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
                    <div className="flex-1 p-4 border-r border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-xs font-semibold text-slate-400 uppercase">Your Input</div>
                            {(!result.exists || result.matchConfidence <= 80) && (
                                <CopyButton text={rawRef || reference} label="Copy Original Text" />
                            )}
                        </div>
                        <div className="text-sm text-slate-700 dark:text-slate-300/90 whitespace-pre-wrap break-words leading-relaxed font-mono">
                            {rawRef || reference}
                        </div>
                    </div>

                    {/* RIGHT: Correct / found version */}
                    <div
                        className={`flex-1 p-4 ${
                            result.retracted
                                ? 'bg-red-50/50 dark:bg-rose-500/5'
                                : result.exists
                                ? 'bg-green-50/50 dark:bg-emerald-500/5'
                                : isDomesticWarning
                                ? 'bg-amber-50/60 dark:bg-amber-500/10'
                                : 'bg-red-50/30 dark:bg-rose-500/5'
                        }`}
                    >
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">
                            {result.exists ? 'Found Reference' : isDomesticWarning ? 'Domestic / Translated Reference Notice' : 'Result'}
                        </div>

                        {result.exists ? (
                            <div className="space-y-2 flex flex-col h-full">
                                {result.retracted && (
                                    <div className="p-3 mb-2 bg-red-600 text-white font-bold rounded-md flex items-center space-x-2 shadow-sm border border-red-700">
                                        <AlertTriangle size={20} className="animate-pulse" />
                                        <span className="text-sm uppercase tracking-wider">Warning: This Article Has Been Retracted</span>
                                    </div>
                                )}
                                {result.predatory && (
                                    <div className="p-3 mb-2 bg-orange-600 text-white font-bold rounded-md flex items-center space-x-2 shadow-sm border border-orange-700">
                                        <AlertTriangle size={20} />
                                        <span className="text-sm uppercase tracking-wider">Warning: This source is from a known predatory journal</span>
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
                                            readOnly={!isEditing}
                                            className={`w-full p-2.5 text-sm rounded-lg outline-none resize-y transition-colors font-mono pr-8 ${
                                                isEditing 
                                                ? 'bg-white dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 border-2 border-blue-400 dark:border-blue-500/50 focus:ring-2 focus:ring-blue-500' 
                                                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-default'
                                            }`}
                                            placeholder={isEditing ? `Edit ${activeTab.toUpperCase()} format manually...` : ''}
                                        />
                                        <button
                                            onClick={() => setIsEditing(!isEditing)}
                                            className={`absolute top-2 right-2 p-1.5 rounded-md transition-colors ${
                                                isEditing 
                                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' 
                                                : 'bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300'
                                            }`}
                                            title={isEditing ? 'Finish Editing' : 'Edit Citation'}
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
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
                                {result.predatory && (
                                    <div className="p-3 mb-2 bg-orange-600 text-white font-bold rounded-md flex items-center space-x-2 shadow-sm border border-orange-700">
                                        <AlertTriangle size={20} />
                                        <span className="text-sm uppercase tracking-wider">Warning: This source is from a known predatory journal</span>
                                    </div>
                                )}

                                {isDomesticWarning ? (
                                    <div
                                        className="p-3 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-600/50 rounded-lg text-amber-900 dark:text-amber-200 space-y-1.5"
                                        title={result.resolutionTooltip || DOMESTIC_TRANSLATED_TOOLTIP}
                                    >
                                        <div className="flex items-start space-x-2">
                                            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                                            <p className="text-xs font-semibold leading-relaxed">
                                                {result.resolutionTooltip || DOMESTIC_TRANSLATED_TOOLTIP}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-600 dark:text-slate-300/90">
                                        No matching reference found in CrossRef, Semantic Scholar, OpenAlex, DBLP, or arXiv.
                                    </p>
                                )}

                                {/* Search fallbacks */}
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href={getGoogleScholarUrl(reference)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 text-xs font-medium rounded-lg transition-colors"
                                    >
                                        <Search size={14} />
                                        <span>Search on Google Scholar</span>
                                    </a>
                                    {isDomesticWarning && (
                                        <a
                                            href={getBaiduScholarUrl(reference)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center space-x-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30 text-xs font-medium rounded-lg transition-colors"
                                            title="Search Chinese domestic databases (CNKI / Wanfang / Baidu Xueshu)"
                                        >
                                            <Search size={14} />
                                            <span>Check CNKI / Baidu Scholar</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
