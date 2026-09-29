/**
 * Agreement checks applied to the record a search has selected, and
 * classification of entries that cannot be checked as references.
 *
 * The search picks the best candidate record for a cited reference. The checks
 * here ask whether that record is the work cited, on three dimensions that the
 * candidate scoring does not fully test: whether the cited title extends the
 * record's title with words of its own, whether the cited author list contains
 * names absent from the record, and whether the cited year is compatible with
 * the record's. Each check can only lower confidence, never raise it.
 */

import { foldText, dropSpacingAccents } from './TextNormalize';

// ---------------------------------------------------------------- tokens

interface Tok { t: string; orig: string; start: number; boundaryBefore: boolean }

const prep = (s: string): string => dropSpacingAccents(s).normalize('NFKD').replace(/\p{M}/gu, '');
const stripTags = (s: string): string => (s || '').replace(/<[^>]+>/g, ' ');

// sentence-level boundaries within a reference string
const isBoundary = (s: string): boolean => /^[.?!;,“”"()[\]]$/u.test(s);

const tokenize = (s: string): Tok[] => {
    const text = prep(s);
    const out: Tok[] = [];
    const re = /[\p{L}\p{N}]+|[.?!;,“”"()[\]]/gu;
    let pending = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (isBoundary(m[0])) { pending = true; continue; }
        out.push({ t: m[0].toLowerCase(), orig: m[0], start: m.index, boundaryBefore: pending });
        pending = false;
    }
    return out;
};

// first occurrence of the record title as a contiguous run of words
const findSpan = (cited: Tok[], rec: string[]): [number, number] | null => {
    if (rec.length < 3) return null; // too short to locate reliably
    outer: for (let i = 0; i + rec.length <= cited.length; i++) {
        for (let j = 0; j < rec.length; j++) if (cited[i + j].t !== rec[j]) continue outer;
        return [i, i + rec.length];
    }
    return null;
};

// ---------------------------------------------------------------- title

const STOP = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'over', 'under', 'via', 'using',
    'toward', 'towards', 'its', 'their', 'this', 'that', 'these', 'those', 'are', 'was',
    'were', 'has', 'have', 'how', 'what', 'why', 'when', 'who', 'can', 'not', 'all', 'any',
    'our', 'your', 'his', 'her', 'new', 'based', 'between', 'within', 'without', 'among',
    'upon', 'about', 'than', 'through', 'across', 'versus', 'per', 'one', 'two',
]);

// words that legitimately follow a title in a reference string
const TRAILING_OK = new Set([
    'dissertation', 'thesis', 'doctoral', 'phd', 'master', 'masters', 'preprint', 'online',
    'available', 'accessed', 'retrieved', 'edition', 'revised', 'reprint', 'report',
    'technical', 'working', 'paper', 'papers', 'extended', 'version', 'supplementary',
    'material', 'appendix', 'slides', 'poster', 'presentation', 'manuscript', 'submitted',
    'forthcoming', 'accepted', 'unpublished', 'draft', 'abstract', 'abstracts', 'arxiv',
    'corr', 'volume', 'vol', 'chapter', 'part', 'series', 'press', 'print', 'review',
    'keynote', 'tutorial', 'invited', 'talk', 'lecture', 'notes', 'dataset', 'code',
    'software', 'github', 'url', 'http', 'https', 'www', 'com', 'org', 'doi', 'pdf',
]);

// capitalised words that open a venue when the full stop after a title is lost
const VENUE_START = new Set([
    'proceedings', 'journal', 'transactions', 'conference', 'workshop', 'symposium',
    'arxiv', 'annals', 'bulletin', 'lecture', 'advances', 'ieee', 'acm',
]);

/**
 * Words the cited title adds after the record's title, up to the end of the
 * title segment. A real title followed by invented words ("XGBoost: A scalable
 * tree boosting system for high-frequency financial trading") contains the
 * record's title and passes any containment test; this finds the addition.
 */
export const titleSurplus = (citedText: string, recordTitle: string): string[] => {
    const cited = tokenize(citedText);
    const rec = tokenize(stripTags(recordTitle)).map(x => x.t);
    const span = findSpan(cited, rec);
    if (!span) return [];
    const extra: string[] = [];
    for (let k = span[1]; k < cited.length; k++) {
        const tk = cited[k];
        if (tk.boundaryBefore) break;
        if (/^\p{N}/u.test(tk.t)) break;          // volume, year, pages
        if (tk.orig === 'In') break;                // "In Proceedings of ..."
        if (/^\p{Lu}/u.test(tk.orig) && VENUE_START.has(tk.t)) break;
        if (tk.t.length >= 3 && /^\p{L}+$/u.test(tk.t) && !STOP.has(tk.t) && !TRAILING_OK.has(tk.t)) {
            extra.push(tk.t);
        }
    }
    return extra;
};

/** Text preceding the record's title in the cited string: the author segment. */
export const segmentBeforeTitle = (citedText: string, recordTitle: string): string | null => {
    const cited = tokenize(citedText);
    const rec = tokenize(stripTags(recordTitle)).map(x => x.t);
    const span = findSpan(cited, rec);
    if (!span || span[0] === 0) return null;
    return prep(citedText).slice(0, cited[span[0]].start);
};

// ---------------------------------------------------------------- authors

const NAME_STOP = new Set([
    'and', 'et', 'al', 'others', 'eds', 'editor', 'editors', 'in', 'the', 'jr', 'sr', 'ii',
    'iii', 'iv', 'phd', 'team', 'collaboration', 'consortium', 'group', 'inc', 'ltd', 'llc',
    'corp', 'university', 'institute', 'anonymous', 'author', 'authors', 'contributors',
    'with', 'von', 'van', 'der', 'den', 'del', 'della', 'de', 'da', 'di', 'du', 'le', 'la',
    'dos', 'das', 'bin', 'ibn', 'available', 'online', 'accessed', 'retrieved', 'preprint',
    'arxiv', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
    'october', 'november', 'december',
]);

// Beyond this size a source may truncate the author list it returns, and a
// cited name missing from the record is no longer evidence of anything.
const MAX_RECORD_AUTHORS = 50;

/** Number of authors a cited author segment names, before any "et al.". */
export const citedAuthorCount = (citedAuthors: string | null | undefined): number => {
    if (!citedAuthors) return 0;
    const head = prep(citedAuthors).split(/\bet\s+al\b/i)[0];
    return head.split(/,|;|&|\band\b/).filter(part =>
        (part.match(/\p{Lu}[\p{L}'’-]{2,}/gu) || []).some(w => !NAME_STOP.has(foldText(w)))
    ).length;
};

// Hyphens and dashes of any kind, the soft hyphen and apostrophes join the
// parts of a name: sources write "Cortés-Ciriano" with U+2010 as often as with
// the ASCII hyphen.
const NAME_JOINER = /[\p{Pd}\u00ad'’]/u;

/**
 * Agreement between the cited author segment and the record's authors.
 * foreign: capitalised name tokens that match no author of the record. Given
 * names that the record abbreviates to initials are accepted when their
 * initials match and a record surname follows them. Each part of a compound
 * surname counts as a surname.
 * matched: cited name tokens found in the record.
 * A record name in which letters were lost to an encoding error ("Koml\uFFFDs",
 * as some Crossref records have it) matches any letters in their place.
 */
export const authorAgreement = (citedAuthors: string | null | undefined, recordAuthors: string[] | undefined): { foreign: string[]; matched: number; citedCount: number } => {
    const none = { foreign: [], matched: 0, citedCount: citedAuthorCount(citedAuthors) };
    if (!citedAuthors || !recordAuthors || recordAuthors.length === 0) return none;
    if (recordAuthors.length >= MAX_RECORD_AUTHORS) return none;
    const recTok = new Set<string>();
    const recFamilies = new Set<string>();
    const recInitials = new Set<string>();
    const damaged: RegExp[] = [];
    const partsOf = (w: string) => w.split(NAME_JOINER).map(foldText).filter(Boolean);
    for (const a of recordAuthors) {
        const words = stripTags(a).split(/\s+/).filter(w => foldText(w));
        if (words.length === 0) continue;
        const family = words[words.length - 1];
        for (const p of [...partsOf(family), foldText(family)]) { recTok.add(p); recFamilies.add(p); }
        // "W.L." and "J.-P." abbreviate two given names each
        for (const w of words.slice(0, -1)) {
            for (const p of w.split('.').flatMap(partsOf)) { recTok.add(p); recInitials.add(p[0]); }
        }
        for (const w of words) {
            if (!w.includes('\uFFFD')) continue;
            const around = w.split(/\uFFFD+/).map(foldText);
            damaged.push(new RegExp('^' + around.join('\\p{L}{1,2}') + '$', 'u'));
        }
    }
    const text = prep(citedAuthors);
    const found: string[] = [];
    const re = /\p{Lu}[\p{L}\p{Pd}\u00ad'’]+/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) found.push(...partsOf(m[0]));
    // a given name the record abbreviates: its initial is a record initial, and
    // a record surname follows it, directly or after one or two further given
    // names ("Wai Lok Woo" against "W.L. Woo")
    const abbreviated = (i: number, depth: number): boolean => {
        const next = found[i + 1];
        if (!next || !recInitials.has(found[i][0])) return false;
        return recFamilies.has(next) || (depth < 2 && abbreviated(i + 1, depth + 1));
    };
    const foreign: string[] = [];
    let matched = 0;
    for (let i = 0; i < found.length; i++) {
        const f = found[i];
        if (f.length < 3 || NAME_STOP.has(f)) continue;
        if (recTok.has(f) || damaged.some(r => r.test(f))) { matched++; continue; }
        if (abbreviated(i, 0)) continue;
        foreign.push(f);
    }
    return { foreign: [...new Set(foreign)], matched, citedCount: none.citedCount };
};

export const foreignAuthorNames = (citedAuthors: string | null | undefined, recordAuthors: string[] | undefined): string[] =>
    authorAgreement(citedAuthors, recordAuthors).foreign;

// ---------------------------------------------------------------- year

/** Four-digit years in a reference, ignoring arXiv identifiers and DOIs. */
export const citedYears = (text: string): number[] => {
    const clean = (text || '')
        .replace(/10\.\d{4,9}\/\S+/g, ' ')
        .replace(/\b\d{4}\.\d{4,5}(v\d+)?\b/g, ' ');
    return Array.from(clean.matchAll(/\b(19\d{2}|20\d{2})\b/g), m => parseInt(m[1], 10));
};

/** Smallest gap between any cited year and the record's year, or null. */
export const yearGap = (text: string, recordYear: string | number | undefined): number | null => {
    const ry = parseInt(String(recordYear ?? ''), 10);
    const ys = citedYears(text);
    if (!ry || ys.length === 0) return null;
    return Math.min(...ys.map(y => Math.abs(y - ry)));
};

// ---------------------------------------------------------------- entry type

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
const AUTHOR_RE = /\p{Lu}[\p{L}'’-]+,\s*\p{Lu}\.|\p{Lu}\.\s*\p{Lu}[\p{L}'’-]+|\bet\s+al\b/u;

/**
 * An entry that cannot be checked as a single reference: several references
 * the segmenter did not split, or text that is not a reference at all.
 */
export const classifyEntry = (text: string): 'merged_entries' | 'not_a_reference' | null => {
    const years = new Set(citedYears(text));
    // a DOI given both as "doi:" and as a doi.org link is one DOI
    const linked = (text.match(/doi\.org\/10\.\d{4,9}\//gi) || []).length;
    const dois = Math.max(linked, (text.match(/10\.\d{4,9}\//g) || []).length - linked);
    const etal = (text.match(/\bet\s+al\b/gi) || []).length;
    if (years.size >= 3 || dois >= 2 || etal >= 3) return 'merged_entries';
    if (years.size === 0 && dois === 0 && !URL_RE.test(text) && !AUTHOR_RE.test(text)) return 'not_a_reference';
    return null;
};

export const hasWebLink = (text: string): boolean => URL_RE.test(text);

// ---------------------------------------------------------------- title-less

// Title text is a stretch of at least four words between punctuation marks.
// Author lists break at commas and initials, and the physics and astronomy
// styles that omit the title have no such stretch. Case is not used: many
// titles are cited in title case.
export const hasTitleText = (text: string): boolean =>
    prep(text).replace(/\bet\s+al\b/gi, ' ')
        .split(/[.,;:()[\]"“”]/u)
        .some(seg => seg.split(/\s+/).filter(w => /^\p{L}{2,}$/u.test(w)).length >= 4);

/**
 * Agreement on first author, volume, first page or article number, and year,
 * for references in styles that give no title. When the string does carry
 * title text, the record's title must also appear in it, so that a real
 * volume and page cannot lend support to an invented title.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const metadataAgreement = (text: string, item: any): boolean => {
    if (!item) return false;
    const spaced = (s: string) => foldText(s.replace(/[\p{Pd}\u00ad]/gu, ' '));
    const folded = ' ' + spaced(text) + ' ';
    const has = (v: string | undefined) => !!v && folded.includes(' ' + spaced(String(v)) + ' ');
    const first = item.author?.[0]?.family;
    const volume = item.volume;
    const page = (item.page || '').split(/[-–]/)[0] || item['article-number'];
    const ry = item.issued?.['date-parts']?.[0]?.[0] || item.published?.['date-parts']?.[0]?.[0];
    const gap = yearGap(text, ry);
    if (!(has(first) && has(volume) && has(page) && gap !== null && gap <= 1)) return false;
    if (!hasTitleText(text)) return true;
    const rec = foldText(stripTags(item.title?.[0] || '')).split(/\s+/).filter(w => w.length >= 3);
    if (rec.length === 0) return false;
    return rec.filter(w => folded.includes(' ' + w + ' ')).length / rec.length >= 0.6;
};

// ---------------------------------------------------------------- repositories

/**
 * Software and data repositories cited by URL. Bibliographic databases do not
 * index them, but their hosts expose public APIs that confirm existence.
 */
export const checkRepository = async (text: string): Promise<{ url: string; name: string; description: string } | null> => {
    const squeezed = text.replace(/(github\.com|huggingface\.co)\/\s+/gi, '$1/').replace(/\/\s+/g, '/');
    const gh = squeezed.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?=[\s,;)]|$|\/)/i);
    if (gh) {
        try {
            const r = await fetch(`https://api.github.com/repos/${gh[1]}/${gh[2]}`);
            if (r.ok) {
                const j = await r.json();
                return { url: j.html_url, name: j.full_name, description: j.description || '' };
            }
        } catch { /* unreachable host: not confirmed */ }
    }
    const hf = squeezed.match(/huggingface\.co\/(?:(datasets|spaces)\/)?([\w.-]+)\/([\w.-]+)/i);
    if (hf) {
        const kind = hf[1] ? hf[1] : 'models';
        try {
            const r = await fetch(`https://huggingface.co/api/${kind}/${hf[2]}/${hf[3]}`);
            if (r.ok) {
                const j = await r.json();
                return { url: `https://huggingface.co/${hf[1] ? hf[1] + '/' : ''}${hf[2]}/${hf[3]}`, name: j.id || `${hf[2]}/${hf[3]}`, description: '' };
            }
        } catch { /* not confirmed */ }
    }
    return null;
};
