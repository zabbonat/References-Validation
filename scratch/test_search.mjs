// Test parseGeneric with the user's format
const ref = "Denoising diffusion probabilistic models. Ho, Jonathan and Jain, Ajay and Abbeel, Pieter. Advances in neural information processing systems. (2020)";

// Simulate parseGeneric
const cleaned = ref
    .replace(/^\s*[[\(\s]*\d{1,4}[\]\)\s]*[.\s]?/, '')
    .replace(/(?:DOI\s*[：:]\s*)10\.\d{4,9}\/[^\s,;]+/gi, '')
    .replace(/https?:\/\/[^\s,]+/gi, '')
    .replace(/\(?\b(19|20)\d{2}\b\)?/g, '')
    .trim();

const segments = cleaned.split(/[.]\s+/)
    .map(s => s.trim().replace(/\.$/, '').trim())
    .filter(s => s.length > 5);

console.log("Segments:", segments);

const authorPattern = /\b(and)\b.*(?:,|\band\b)/i;
const venueKeywords = /\b(journal|proceedings|conference|transactions|advances|letters|review|annals|bulletin|workshop|symposium|arxiv|ieee|acm|springer|nature|science)\b/i;

let bestTitleIdx = 0;
let bestTitleScore = -1;

for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const words = seg.split(/\s+/);
    const lowercaseWords = words.filter(w => w.length > 2 && w[0] === w[0].toLowerCase()).length;
    const ratio = words.length > 0 ? lowercaseWords / words.length : 0;
    let score = seg.length * (0.5 + ratio);
    const isAuthor = authorPattern.test(seg);
    const isVenue = venueKeywords.test(seg);
    if (isAuthor) score *= 0.2;
    if (isVenue) score *= 0.2;
    console.log(`  [${i}] "${seg}" → score=${score.toFixed(1)} author=${isAuthor} venue=${isVenue}`);
    if (score > bestTitleScore) { bestTitleScore = score; bestTitleIdx = i; }
}

console.log(`\nTitle: "${segments[bestTitleIdx]}"`);

// Find authors
for (let i = 0; i < segments.length; i++) {
    if (i === bestTitleIdx) continue;
    if (authorPattern.test(segments[i]) || /^[A-Z][a-z]+,/.test(segments[i])) {
        console.log(`Authors: "${segments[i]}"`);
        break;
    }
}

// Find journal
for (let i = 0; i < segments.length; i++) {
    if (i === bestTitleIdx) continue;
    if (venueKeywords.test(segments[i])) {
        console.log(`Journal: "${segments[i]}"`);
        break;
    }
}
