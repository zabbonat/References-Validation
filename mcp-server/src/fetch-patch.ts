/**
 * Fetch Patch for Node.js
 * 
 * The ArxivService uses a CORS proxy (api.codetabs.com) because browsers
 * block cross-origin requests to arXiv. In Node.js this proxy is unnecessary
 * and adds latency + a point of failure.
 * 
 * This module wraps globalThis.fetch to intercept proxy URLs and call
 * the target API directly.
 */

const originalFetch = globalThis.fetch;

const PROXY_PATTERNS = [
    /^https?:\/\/api\.codetabs\.com\/v1\/proxy\?quest=/,
    /^https?:\/\/api\.allorigins\.win\/raw\?url=/,
    /^https?:\/\/corsproxy\.io\/\?/,
];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Strip CORS proxy prefix and decode the actual URL
    for (const pattern of PROXY_PATTERNS) {
        if (pattern.test(url)) {
            const proxyMatch = url.match(pattern);
            if (proxyMatch) {
                const encodedTarget = url.substring(proxyMatch[0].length);
                url = decodeURIComponent(encodedTarget);
                break;
            }
        }
    }

    return originalFetch(url, init);
};

export {};
