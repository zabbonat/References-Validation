import bibtexParse from './src/vendors/bibtexParse.js';

const sampleBibTeX = `
@article{sample1,
  title={Sample Title},
  author={Doe, John},
  year={2024}
}
`;

const sampleList = `
Values and Valuing in Design
Unknown Author
2020
`;

console.log("Testing BibTeX Parsing...");
try {
    const json = bibtexParse.toJSON(sampleBibTeX);
    console.log("BibTeX Result:", JSON.stringify(json, null, 2));
} catch (e) {
    console.error("BibTeX Failed:", e);
}

console.log("\nTesting List Parsing (Should be empty, no crash)...");
try {
    const json = bibtexParse.toJSON(sampleList);
    console.log("List Result:", JSON.stringify(json, null, 2));
} catch (e) {
    console.error("List Failed:", e);
}
