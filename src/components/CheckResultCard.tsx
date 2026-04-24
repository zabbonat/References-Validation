import React, { useState } from 'react';
import type { CheckResult } from '../services/SearchService';
import { CheckCircle, XCircle, ExternalLink, Search, Copy, Check, AlertTriangle } from 'lucide-react';

interface Props {
    reference: string;
    result?: CheckResult;
    loading?: boolean;
    duplicateOf?: number; // ref number of the duplicate
}

const SourceBadge: React.FC<{ source: CheckResult['source'], fallback?: CheckResult['fallbackSource'] }> = ({ source, fallback }) => {
    const colors = {
        'CrossRef': 'bg-blue-100 text-blue-700',
        'SemanticScholar': 'bg-purple-100 text-purple-700',
        'OpenAlex': 'bg-orange-100 text-orange-700',
        'NotFound': 'bg-gray-100 text-gray-700'
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
        .replace(/[@{}]/g, '')           // Remove BibTeX artifacts
        .replace(/\s{2,}/g, ' ')         // Collapse multiple spaces
        .trim()
        .slice(0, 200);                  // Google Scholar has query length limits
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
            className="flex items-center space-x-1 px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium transition-colors"
        >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : label}</span>
        </button>
    );
};

export const CheckResultCard: React.FC<Props> = ({ reference, result, loading, duplicateOf }) => {
    return (
        <div className={`border rounded-lg bg-white shadow-sm mb-2 overflow-hidden ${result?.retracted ? 'border-red-400 border-2' : ''}`}>
            {/* Header bar with status + source */}
            {!loading && result && (
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                    <div className="flex items-center space-x-2">
                        {result.exists ? (
                            result.matchConfidence > 80 ? (
                                <div className="flex items-center text-green-600 space-x-1">
                                    <CheckCircle size={16} />
                                    <span className="text-xs font-bold">Verified ({result.matchConfidence}%)</span>
                                </div>
                            ) : (
                                <div className="flex items-center text-yellow-600 space-x-1">
                                    <XCircle size={16} />
                                    <span className="text-xs font-bold">Partial Match ({result.matchConfidence}%)</span>
                                </div>
                            )
                        ) : (
                            <div className="flex items-center text-red-600 space-x-1">
                                <XCircle size={16} />
                                <span className="text-xs font-bold">Not Found</span>
                            </div>
                        )}

                        {/* Retraction badge */}
                        {result.retracted && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                                <AlertTriangle size={12} />
                                <span>RETRACTED</span>
                            </span>
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
                    <div className="text-sm text-gray-700 font-medium mb-1 truncate" title={reference}>
                        {reference}
                    </div>
                    <div className="text-gray-500 text-xs">Checking...</div>
                </div>
            )}

            {/* Side-by-side content */}
            {!loading && result && (
                <div className="flex flex-col md:flex-row">
                    {/* LEFT: What the user inserted */}
                    <div className="flex-1 p-4 border-r border-gray-100">
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Your Input</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                            {reference}
                        </div>
                    </div>

                    {/* RIGHT: Correct / found version */}
                    <div className={`flex-1 p-4 ${result.retracted ? 'bg-red-50/50' : result.exists ? 'bg-green-50/50' : 'bg-red-50/30'}`}>
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
                            {result.exists ? 'Found Reference' : 'Result'}
                        </div>

                        {result.exists ? (
                            <div className="space-y-2">
                                {/* Corrected APA */}
                                {result.correctedApa && (
                                    <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-gray-800">
                                        <span className="font-bold text-xs text-green-600 block mb-1">✓ Corrected (APA):</span>
                                        {result.correctedApa}
                                    </div>
                                )}

                                {/* Original APA */}
                                {result.apa && (
                                    <div className="p-2 bg-white border rounded text-sm text-gray-800">
                                        <span className="font-bold text-xs text-blue-600 block mb-1">APA Style:</span>
                                        {result.apa}
                                    </div>
                                )}

                                <div className="flex space-x-2 text-xs text-gray-500">
                                    {result.journal && <span>{result.journal}</span>}
                                    {result.year && <span>({result.year})</span>}
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-1.5">
                                    {result.apa && (
                                        <CopyButton text={result.correctedApa || result.apa} label={result.correctedApa ? 'Copy APA (Corrected)' : 'Copy APA'} />
                                    )}
                                    {(result.correctedBibtex || result.bibtex) && (
                                        <CopyButton text={result.correctedBibtex || result.bibtex || ''} label={result.correctedBibtex ? 'Copy BibTeX (Corrected)' : 'Copy BibTeX'} />
                                    )}
                                </div>

                                {/* Issues */}
                                {result.issues && result.issues.length > 0 && (
                                    <div className="space-y-1 border-t pt-2 border-gray-200">
                                        {result.issues.map((issue, idx) => (
                                            <div key={idx} className={`text-xs font-semibold ${issue.includes('RETRACTED') ? 'text-red-700' : 'text-red-500'}`}>• {issue}</div>
                                        ))}
                                    </div>
                                )}

                                {/* Google Scholar button for partial matches */}
                                {result.matchConfidence <= 80 && (
                                    <a
                                        href={getGoogleScholarUrl(reference)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors mt-1"
                                    >
                                        <Search size={14} />
                                        <span>Search on Google Scholar</span>
                                    </a>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-500">
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
                                    className="inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
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
