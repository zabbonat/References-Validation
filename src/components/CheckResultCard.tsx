import React from 'react';
import type { CheckResult } from '../services/SearchService';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';

interface Props {
    reference: string;
    result?: CheckResult;
    loading?: boolean;
}

export const CheckResultCard: React.FC<Props> = ({ reference, result, loading }) => {
    return (
        <div className="p-4 border rounded-lg bg-white shadow-sm mb-2">
            <div className="text-sm text-gray-700 font-medium mb-1 truncate" title={reference}>
                {reference}
            </div>

            {loading && <div className="text-gray-500 text-xs">Checking...</div>}

            {!loading && result && (
                <div className="flex flex-col space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                        {result.exists ? (
                            <div className="flex items-center space-x-1">
                                {result.matchConfidence > 80 ? (
                                    <div className="flex items-center text-green-600 space-x-1">
                                        <CheckCircle size={16} />
                                        <span className="text-xs font-bold">Verified ({result.matchConfidence}%)</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center text-yellow-600 space-x-1">
                                        <XCircle size={16} />
                                        <span className="text-xs font-bold">Partial Match ({result.matchConfidence}%)</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center text-red-600 space-x-1">
                                <XCircle size={16} />
                                <span className="text-xs font-bold">Not Found</span>
                            </div>
                        )}

                        {result.url && (
                            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                <ExternalLink size={14} />
                            </a>
                        )}
                    </div>

                    {result.exists && (
                        <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                            <div className="font-semibold text-gray-800 mb-1">Found Reference:</div>

                            {/* APA Style Display */}
                            {result.apa && (
                                <div className="mb-2 p-2 bg-white border rounded text-gray-800">
                                    <span className="font-bold text-xs text-blue-600 block mb-1">APA Style:</span>
                                    {result.apa}
                                </div>
                            )}

                            <div className="flex space-x-2 text-gray-500 mb-2">
                                {result.journal && <span>{result.journal}</span>}
                                {result.year && <span>({result.year})</span>}
                            </div>

                            {/* BibTeX Copy */}
                            {result.bibtex && (
                                <div className="mt-2">
                                    <button
                                        onClick={() => navigator.clipboard.writeText(result.bibtex || '')}
                                        className="flex items-center space-x-1 px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium transition-colors"
                                    >
                                        <span>Copy BibTeX</span>
                                    </button>
                                </div>
                            )}

                            {result.issues && result.issues.length > 0 && (
                                <div className="space-y-1 mt-2 border-t pt-1 border-gray-200">
                                    {result.issues.map((issue, idx) => (
                                        <div key={idx} className="text-red-500 font-semibold">• {issue}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
