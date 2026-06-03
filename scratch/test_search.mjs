// Test computeTitleSim simulation
const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
const calculateSimilarity = (str1, str2) => {
    const clean1 = normalize(str1);
    const clean2 = normalize(str2);
    if (clean1 === clean2) return 100;
    // Word overlap
    const words1 = clean1.split(/\s+/).filter(w => w.length > 0);
    const words2 = clean2.split(/\s+/).filter(w => w.length > 0);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    let intersection = 0;
    for (const word of set1) if (set2.has(word)) intersection++;
    const union = new Set([...set1, ...set2]).size;
    const wordSim = union > 0 ? Math.round((intersection / union) * 100) : 0;
    return wordSim;
};

const computeTitleSim = (expectedTitle, resultTitle) => {
    const cleanExpected = normalize(expectedTitle);
    const cleanResult = normalize(resultTitle);
    let sim = calculateSimilarity(cleanExpected, cleanResult);
    if (sim < 90 && cleanExpected.includes(cleanResult) && cleanResult.length > 20) {
        sim = 95;
    }
    return sim;
};

// BibTeX input (what user pastes in Quick Check)
const bibQuery = `@article{ho2020denoising,
  title={Denoising diffusion probabilistic models},
  author={Ho, Jonathan and Jain, Ajay and Abbeel, Pieter},
  journal={Advances in neural information processing systems},
  volume={33},
  pages={6840--6851},
  year={2020}
}`;

// What extractLikelyTitle returns for this BibTeX
function extractLikelyTitle(rawRef) {
    let ref = rawRef.trim();
    ref = ref.replace(/\b[Pp]{1,2}\.?\s*\d+[-–]\d+/g, '');
    ref = ref.replace(/\b\d{1,5}\s*[-–]\s*\d{1,5}\b/g, '');
    ref = ref.replace(/\b[Vv]ol\.?\s*\d+/g, '');
    ref = ref.replace(/\b[Nn]o\.?\s*\d+/g, '');
    ref = ref.replace(/\b[Ii]ssue\s*\d+/g, '');
    ref = ref.replace(/\b\d{1,4}\s*\(\d{1,4}\)/g, '');
    ref = ref.replace(/\(?\b(19|20)\d{2}\b\)?/g, '');
    ref = ref.replace(/https?:\/\/doi\.org\/[^\s,]+/gi, '');
    ref = ref.replace(/\bdoi:\s*[^\s,]+/gi, '');
    ref = ref.replace(/\b[A-Z]{1,4}\s+(?=[A-Z][a-zà-ö])/g, '');
    const segments = ref.split(/[,;]|(?<=\.)\s+(?=[A-Z])/)
        .map(s => s.trim().replace(/^[.]+|[.]+$/g, '').trim())
        .filter(s => s.length > 5);
    if (segments.length > 1) {
        const venueKeywords = /\b(journal|proceedings|conference|transactions|advances|letters|review|annals|bulletin|workshop|symposium|arxiv)\b/i;
        const authorPattern = /\b(and)\b.*\b(and)\b|\b[A-Z][a-z]+\s+and\s+[A-Z][a-z]+/;
        const scored = segments.map(seg => {
            const words = seg.split(/\s+/);
            const lowercaseWords = words.filter(w => w.length > 2 && w[0] === w[0].toLowerCase()).length;
            const ratio = words.length > 0 ? lowercaseWords / words.length : 0;
            let score = seg.length * (0.5 + ratio);
            if (venueKeywords.test(seg)) score *= 0.3;
            if (authorPattern.test(seg)) score *= 0.3;
            return { seg, score };
        });
        scored.sort((a, b) => b.score - a.score);
        ref = scored[0].seg;
    }
    ref = ref.replace(/\s{2,}/g, ' ').replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim();
    if (ref.length >= 10 && ref.length < rawRef.length * 0.95) return ref;
    return null;
}

console.log("=== BibTeX input ===");
const extractedTitle = extractLikelyTitle(bibQuery);
console.log(`extractLikelyTitle result: "${extractedTitle}"`);

// What title is used in checkWithFallback
const title = extractedTitle || bibQuery;
console.log(`title variable: "${title}"`);

// Simulate OA returning the correct paper
const oaResultTitle = "Denoising Diffusion Probabilistic Models";
const sim = computeTitleSim(title, oaResultTitle);
console.log(`\ncomputeTitleSim("${title}", "${oaResultTitle}") = ${sim}`);
console.log(`MIN_TITLE_SIMILARITY (70) passed? ${sim >= 70 ? 'YES ✅' : 'NO ❌'}`);
