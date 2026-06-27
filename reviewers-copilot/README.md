# CheckIfExist Reviewer's Copilot: Official Replication Package

This repository contains the complete open scientometric replication package for the research article:

> **"Extraction Artifacts, Not Hallucination Epidemics, Explain the Apparent Rise of Unverifiable Citations in Published Scientific Proceedings"**  
> *Author:* Diletta Abbonato (CPS Department, University of Turin, Italy)  
> *Target Journal:* Scientometrics (Springer)

---

## Repository Structure

```text
reviewers-copilot/
├── data/
│   ├── longitudinal_dataset_N22479.xlsx   # Full longitudinal corpus (N=22,479 records across ArXiv & NeurIPS)
│   ├── not_found_refs.json                # Phase 1 unresolved red flags audit pool (n=307)
│   └── batch_0..9.json                    # Federated cross-referencing API query snapshots
├── code/
│   ├── strict_green_audit.py              # Strict consistency verification script (Title + Author + Year)
│   ├── evaluate_detector.py               # Common pool benchmark evaluation metrics (RQ1)
│   └── generate_benchmark.py              # Synthetic adversarial benchmark assembly script
├── manuscript/
│   ├── main.tex                           # Final submitted LaTeX article source
│   └── references.bib                     # Authoritative CrossRef-audited bibliography
└── README.md                              # This documentation
```

---

## Key Methodological Reproducibility Points

1. **Extraction Resilience Layer:** Demonstrates how NFKD Unicode ligature decomposition (`\ufb01` -> `fi`) and regular expression de-gluing of unnumbered APA blocks recover 88.2% of naive single-source API red flags.
2. **Asymmetric Jaccard Author Guard:** Eliminates security bypasses by assigning `0.0` whenever candidate reference authorship is unparseable.
3. **Honest Audited Upper Bound (<0.02%):** Hanley-Lippman Rule of Three applied directly to the manually inspected zero-hallucination pool (n=807).

## License
Released under the MIT License. All scientometric metadata derived from public OpenAlex and CrossRef REST graph endpoints.
