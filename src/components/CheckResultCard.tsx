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
                <div className="flex items-center mt-2 space-x-2">
                    {result.exists ? (
                        <div className="flex items-center text-green-600 space-x-1">
                            <CheckCircle size={16} />
                            <span className="text-xs font-bold">Verified</span>
                        </div>
                    ) : (
                        <div className="flex items-center text-red-600 space-x-1">
                            <XCircle size={16} />
                            <span className="text-xs font-bold">Not Found</span>
                        </div>
                    )}

                    {result.title && <div className="text-xs text-gray-500 italic truncate flex-1">{result.title}</div>}

                    {result.url && (
                        <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            <ExternalLink size={14} />
                        </a>
                    )}
                </div>
            )}
        </div>
    );
};
