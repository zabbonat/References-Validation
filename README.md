# [CheckIfExist](https://zabbonat.github.io/References-Validation/) - Reference Verification Tool 🔍

[**CheckIfExist**](https://zabbonat.github.io/References-Validation/) is a tool for researchers and academics to verify the authenticity of references. It cross-checks citations against the CrossRef, Semantic Scholar, OpenAlex, DBLP, and arXiv databases to detect hallucinations, verify metadata, and ensure accuracy in your bibliography.

> **Update: arXiv and DBLP integration**  
> CheckIfExist now features fallback integration with both **arXiv** and **DBLP**. This update ensures that recent computer science conference papers (e.g., NeurIPS, ICLR, CVPR) and preprints are successfully found and validated, even if they aren't indexed on CrossRef or Semantic Scholar yet.

## 🚀 Features
- **Quick Verification**: Verification of single references via text selection or clipboard.
- **PDF & DOCX Batch Processing**: Upload your full PDF/DOCX papers directly. CheckIfExist will automatically locate the References section, extract all citations across multiple pages, and batch verify them!
- **Batch Processing**: Paste a list of BibTeX entries or plain text/numbered citations to verify them all at once. Includes a progress bar and summary statistics.
- **File Upload**: Upload references directly from txt/bib/docx files without manually copying or pasting.
- **Advanced Validation Logic**:
  - Detects partial matches (e.g., correct title but wrong author or year).
  - Validates DOIs: explicitly flags **Mismatch/Error** if the provided DOI points to an unrelated paper.
  - Handles "First Name Last Name" vs "Last Name First Name" variations.
  - Penalizes scores for missing authors in the query.
  - Retraction Check: Automatically alerts if an article has been retracted or withdrawn based on CrossRef and OpenAlex data.
  - DBLP + arXiv Fallback: When a paper isn't found (or has a low match confidence) in CrossRef, Semantic Scholar, and OpenAlex, CheckIfExist automatically queries DBLP and arXiv to catch conference papers and preprints not yet indexed elsewhere.
  - arXiv Direct Lookup: References containing an arXiv ID (e.g., `arXiv:2301.12345`) or arXiv DOI (`10.48550/arXiv.XXXX`) are resolved instantly via the arXiv API.
- **Smart Filtering & Reporting**:
  - Dynamic filter bar (All, Verified, Partial, Mismatch, Not Found, Issues) to quickly isolate problematic references in batch reports.
- **Bibliometric Data**:
  - Citation Counts: Displays the number of citations received by each validated paper to gauge its impact.
- **Manual Verification Fallbacks**:
  - Automatically strips malformed DOIs/URLs before searching on Google Scholar to ensure robust manual verification.
- **Output Formats & In-line Editing**:
  - APA, MLA, ISO 690, and BibTeX: Get the correct citations instantly.
  - In-line Editing: Directly edit the generated reference formats within the result card before copying or downloading.

## 🛠 **Run Locally**

If you want to run the code yourself:

1.  **Clone the repo**
    ```bash
    git clone https://github.com/zabbonat/References-Validation.git
    cd References-Validation
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the web app**
    ```bash
    npm run dev
    ```


If you use CheckIfExist in your research, peer-review process, or academic workflow, please cite:

> Abbonato, D. (2026). CheckIfExist: Detecting Citation Hallucinations in the Era of AI-Generated Content. *arXiv preprint arXiv:2602.15871*.

```bibtex
@article{abbonato2026checkifexist,
  title={CheckIfExist: Detecting Citation Hallucinations in the Era of AI-Generated Content},
  author={Abbonato, Diletta},
  journal={arXiv preprint arXiv:2602.15871},
  year={2026}
}
```

---
*Disclaimer: The tool may occasionally misclassify authentic references, so always double-check flagged items manually.*
