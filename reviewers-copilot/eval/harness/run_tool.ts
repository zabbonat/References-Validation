/**
 * Run the CheckIfExist verification engine outside the browser, on the same
 * code path the web interface uses, and record what a user would see.
 *
 *   npx tsx run_tool.ts --engine baseline|revised --mode paste|raw \
 *       --in refs.jsonl --out results.jsonl
 *
 * engine   baseline = src/services as on main (snapshot in ./baseline)
 *          revised  = src/services in the working tree
 * mode     paste = pasted bibliography: each line goes through the plain-text
 *                  parser, and parsed fields are passed as expected metadata,
 *                  exactly as App.tsx handleBatchCheck does
 *          raw   = reference string passed unparsed, as the PDF upload path
 *                  in BunchPdfView.tsx does
 *
 * Three things differ from a browser session and none of them touches the
 * engine's logic. DOMParser is supplied by xmldom. Requests the engine routes
 * through the codetabs CORS proxy go to arXiv directly, since Node has no CORS
 * and the proxy returns arXiv's response unchanged. Requests are made politely:
 * a mailto for Crossref and OpenAlex, one arXiv request every three seconds as
 * arXiv asks, and retries with backoff on 429 and 5xx so that results reflect
 * the engine rather than transient rate limiting. Every retry and every final
 * failure is logged per reference.
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DOMParser as XDOMParser } from '@xmldom/xmldom';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
    process.argv.slice(2).reduce<string[][]>((acc, a, i, all) => {
        if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
        return acc;
    }, [])
);
const ENGINE = args.engine ?? 'baseline';
const MODE = args.mode ?? 'paste';
const IN = args.in;
const OUT = args.out;
const DELAY = Number(args.delay ?? 1200); // BATCH_REQUEST_DELAY in the app
const MAILTO = 'diletta.abbonato@unito.it';

if (!IN || !OUT) throw new Error('need --in and --out');

const engineDir = ENGINE === 'baseline'
    ? path.join(here, 'baseline', 'services')
    : path.resolve(here, '..', '..', '..', 'src', 'services');

// ---------------------------------------------------------------- DOMParser
class ShimDOMParser {
    parseFromString(s: string, type: string) {
        let doc: any;
        try {
            doc = new XDOMParser({ onError: () => { } }).parseFromString(
                s, type === 'application/xml' ? 'text/xml' : type as any);
        } catch {
            doc = new XDOMParser().parseFromString('<parsererror/>', 'text/xml');
        }
        doc.querySelector = (sel: string) => doc.getElementsByTagName(sel)[0] ?? null;
        return doc;
    }
}
(globalThis as any).DOMParser = ShimDOMParser;

// ---------------------------------------------------------------- fetch
const realFetch = globalThis.fetch;
const PROXY = 'https://api.codetabs.com/v1/proxy?quest=';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let netLog: { host: string; status: number | string; retries: number }[] = [];

// one request at a time per rate-limited host, at the interval the host asks
// for: arXiv one every three seconds, Semantic Scholar 100 per five minutes
// (the figure quoted in SearchService.ts itself)
const GAP: Record<string, number> = { arxiv: 3100, semanticscholar: 1100 };
const last: Record<string, number> = {};
const queue: Record<string, Promise<void>> = {};
const throttle = (key: string) => {
    const turn = (queue[key] ?? Promise.resolve()).then(async () => {
        const wait = (last[key] ?? 0) + GAP[key] - Date.now();
        if (wait > 0) await sleep(wait);
        last[key] = Date.now();
    });
    queue[key] = turn.catch(() => { });
    return turn;
};

// Semantic Scholar's shared unauthenticated pool is frequently saturated. The
// web app does not retry it, so neither does the harness: one attempt, and a
// refusal leaves the source unavailable for that request, as for a browser
// user. Other sources are retried with backoff, which the app does not do,
// so that transient failures there do not masquerade as engine behaviour.
const MAX_TRIES: Record<string, number> = { semanticscholar: 1 };
const TIMEOUT_MS = 30000;

const liveFetch = async (url: string, init?: any) => {
    const host = new URL(url).host;
    const key = host.includes('arxiv.org') ? 'arxiv' : host.includes('semanticscholar') ? 'semanticscholar' : null;
    const tries = (key && MAX_TRIES[key]) || 4;
    let retries = 0;
    for (let k = 0; k < tries; k++) {
        if (key) await throttle(key);
        try {
            const r = await realFetch(url, {
                ...init,
                signal: AbortSignal.timeout(TIMEOUT_MS),
                headers: { ...(init?.headers || {}), 'User-Agent': `CheckIfExist-eval (mailto:${MAILTO})` },
            });
            if (r.status === 429 || r.status >= 500) {
                retries++;
                // an exhausted daily allowance (OpenAlex answers 429 with a
                // retry-after of many minutes) will not recover within the
                // backoff: the source is unavailable for this request
                const wait = Number(r.headers.get('retry-after'));
                if (r.status === 429 && wait > 60) break;
                if (k < tries - 1) await sleep(5000 * 2 ** k);
                continue;
            }
            return { status: r.status, body: await r.text(), ctype: r.headers.get('content-type') || '', retries };
        } catch {
            retries++;
            if (k < tries - 1) await sleep(2000 * 2 ** k);
        }
    }
    return { status: 599, body: '', ctype: '', retries };
};

// Every response, failures included, is cached by URL. A second run over the
// same references then sees exactly the responses the first run saw, so a
// before/after comparison measures the engine and not the network.
const CACHE = args.cache ? path.resolve(args.cache) : null;
let cacheHits = 0;

globalThis.fetch = (async (input: any, init?: any) => {
    let url: string = typeof input === 'string' ? input : input.url;
    if (url.startsWith(PROXY)) url = decodeURIComponent(url.slice(PROXY.length));
    if (/^https:\/\/api\.(crossref|openalex)\.org\//.test(url) && !url.includes('mailto=')) {
        url += (url.includes('?') ? '&' : '?') + 'mailto=' + MAILTO;
    }
    const host = new URL(url).host;
    let rec: { status: number; body: string; ctype: string; retries: number };
    const file = CACHE ? (() => {
        const h = createHash('sha1').update(url).digest('hex');
        return path.join(CACHE, h.slice(0, 2), h + '.json.gz');
    })() : null;
    if (file && existsSync(file)) {
        rec = { ...JSON.parse(gunzipSync(readFileSync(file)).toString('utf-8')), retries: 0 };
        cacheHits++;
    } else {
        // dblp.org stopped answering during the evaluation; its official mirror
        // serves the same API. The response is stored under the original URL,
        // so both versions of the engine see the same answer to the same request.
        const liveUrl = url.replace(/^https:\/\/dblp\.org\//, 'https://dblp.uni-trier.de/');
        rec = await liveFetch(liveUrl, init);
        if (file) {
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, gzipSync(JSON.stringify({ url, status: rec.status, body: rec.body, ctype: rec.ctype })));
        }
    }
    netLog.push({ host, status: rec.status === 599 ? 'failed' : rec.status, retries: rec.retries });
    const nullBody = rec.status === 204 || rec.status === 304;
    return new Response(nullBody ? null : rec.body, {
        status: rec.status, headers: rec.ctype ? { 'content-type': rec.ctype } : {},
    });
}) as typeof fetch;

// the engine logs to the console; keep the terminal readable
const quiet = () => { };
console.log = quiet;
console.warn = quiet;
console.error = quiet;
const say = (s: string) => process.stdout.write(s + '\n');

// ---------------------------------------------------------------- App.tsx
// verbatim from src/App.tsx
const cleanLatexInput = (text: string): string => {
    const latexCommands = [
        '\\vspace', '\\hspace', '\\newpage', '\\pagebreak', '\\clearpage',
        '\\noindent', '\\indent', '\\bigskip', '\\medskip', '\\smallskip',
        '\\vfill', '\\hfill', '\\linebreak', '\\newline', '\\par',
        '\\begin{', '\\end{', '\\setlength', '\\addtolength',
        '\\documentclass', '\\usepackage', '\\input', '\\include'
    ];
    return text.split('\n').filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        return !latexCommands.some(cmd => trimmed.startsWith(cmd));
    }).join('\n');
};

// CheckResultCard.tsx
const uiLabel = (r: any): string => {
    if (r.reason === 'merged_entries' || r.reason === 'not_a_reference') return 'Extraction problem';
    if (r.reason === 'web_resource') return 'Web resource';
    if (!r.exists) return 'Not Found';
    if (r.matchConfidence > 80) return 'Verified';
    if (r.matchConfidence > 50) return 'Partial Match';
    return 'Mismatch';
};

// ---------------------------------------------------------------- run
const { checkWithFallback } = await import(pathToFileURL(path.join(engineDir, 'SearchService.ts')).href);
const { parsePlainTextRef, parseGeneric } = await import(pathToFileURL(path.join(engineDir, 'PlainTextParser.ts')).href);

const items = readFileSync(IN, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const done = new Set<string>();
if (existsSync(OUT)) {
    for (const l of readFileSync(OUT, 'utf-8').split('\n').filter(Boolean)) done.add(JSON.parse(l).id);
}
const todo = items.filter(it => !done.has(it.id));
say(`${ENGINE}/${MODE}: ${items.length} references, ${done.size} already done, ${todo.length} to run`);

let n = 0;
for (const it of todo) {
    if (n > 0) await sleep(DELAY);
    n++;
    netLog = [];
    const t0 = Date.now();
    const text = cleanLatexInput(String(it.ref ?? '')).replace(/\s*\n\s*/g, ' ').trim();
    let res: any;
    let parsed: any = null;
    try {
        if (MODE === 'paste') {
            parsed = parsePlainTextRef(text);
            const hasStructured = parsed.title && parsed.title.length > 5;
            res = hasStructured
                ? await checkWithFallback(`${parsed.title} ${parsed.authors || ''}`, {
                    title: parsed.title, authors: parsed.authors,
                    journal: parsed.journal, year: parsed.year,
                }, parsed.raw)
                : await checkWithFallback(parsed.raw);
        } else if (MODE === 'bibtex') {
            // App.tsx handleBatchCheck, BibTeX branch: title and author as the
            // query, parsed fields as expected metadata, no raw text
            res = await checkWithFallback(`${it.title} ${it.author || ''}`, {
                title: it.title, authors: it.author, journal: it.journal, year: String(it.year ?? ''),
            });
        } else if (MODE === 'quick') {
            // App.tsx handleQuickCheck: one reference at a time, parseGeneric.
            // The revised App passes the pasted text through as originalQuery.
            parsed = parseGeneric(text);
            const sq = `${parsed.title || ''} ${parsed.authors || ''}`.trim() || text;
            res = await checkWithFallback(sq, {
                title: parsed.title, authors: parsed.authors,
                journal: parsed.journal, year: parsed.year,
            }, ENGINE === 'revised' ? text : undefined);
        } else {
            res = await checkWithFallback(text);
        }
    } catch (e: any) {
        res = { exists: false, matchConfidence: 0, issues: [`harness exception: ${e?.message}`], source: 'NotFound' };
    }
    const failed = netLog.filter(x => x.status === 'failed');
    appendFileSync(OUT, JSON.stringify({
        id: it.id, engine: ENGINE, mode: MODE, label: uiLabel(res),
        exists: res.exists, matchConfidence: res.matchConfidence,
        titleMatchScore: res.titleMatchScore, authorMatchScore: res.authorMatchScore,
        source: res.source, fallbackSource: res.fallbackSource,
        extractionIssue: res.extractionIssue ?? null,
        reason: res.reason ?? null,
        matchedTitle: res.title ?? null, matchedAuthors: res.authors ?? null,
        matchedYear: res.year ?? null, matchedVenue: res.journal ?? null, doi: res.doi ?? null,
        issues: res.issues ?? [],
        parsedTitle: parsed?.title ?? null, parsedYear: parsed?.year ?? null,
        requests: netLog.length,
        retries: netLog.reduce((s, x) => s + x.retries, 0),
        failedRequests: failed.map(x => x.host),
        elapsedMs: Date.now() - t0,
    }) + '\n');
    if (n % 10 === 0 || n === todo.length) say(`  ${n}/${todo.length}  (cache hits so far: ${cacheHits})`);
}
say('done');
