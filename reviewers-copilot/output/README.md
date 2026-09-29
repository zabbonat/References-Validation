# output/

Manuscript for *Scientometrics*: **Can Referees Rely on Automated Reference Checks? Diagnosing and Reducing False Alarms in CheckIfExist.** Nothing in this folder is written by hand except the prose.

## Files

| File | Produced by |
|---|---|
| `main.tex` | written |
| `references.bib` | written; every entry resolved against arXiv, Crossref or the publisher (log below) |
| `numbers.tex` | `code/make_numbers.py`: audit of the diagnostic corpus |
| `numbers_eval.tex` | `eval/make_paper_numbers.py`: evaluation |
| `table_features.tex`, `table_independent.tex`, `table_constructed.tex`, `table_regression.tex` | `eval/make_paper_numbers.py` |
| `figures/fig_independent.pdf`, `figures/fig_referee.pdf` | `eval/make_paper_figures.py` |
| `sn-jnl.cls`, `sn-apacite.bst` | Springer Nature LaTeX template (December 2024), APA reference style, as Scientometrics recommends |

`main.tex` contains no literal figures. `code/check_manuscript.py` refuses to pass while any macro is undefined, any citation is missing, or any `\pending{...}` marker survives in the text or in a generated file.

## Rebuilding

```bash
python code/make_numbers.py
python eval/reference_features.py
python eval/build_planted.py     # asserts that it reproduces the planted set
python eval/make_paper_numbers.py
python eval/make_paper_figures.py
python code/check_manuscript.py
cd output && latexmk -pdf main.tex
```

`python code/make_submission.py` builds the package for Editorial Manager in `submission/` (not versioned): one flat `main.tex` with numbers and tables inlined, `main.bbl`, `references.bib`, the class and style, the figures, the compiled PDF, and a zip of them. It refuses while any `\pending{...}` marker remains; `--draft` builds anyway.

## Evaluation design

Five sets, all in `eval/data/` except the corpus:

- **Diagnostic corpus.** 22,479 reference strings from 919 arXiv and NeurIPS papers (`data/longitudinal_dataset_N22479.xlsx`), for the prevalence of error-prone features (`eval/reference_features.py`).
- **Independent test set.** Badalova and Mayr (2026), Zenodo 10.5281/zenodo.21457492, CC BY 4.0, copied unmodified to `eval/external/`. The CSV is cp850-encoded and 90 characters in 58 references were saved as `?`; `eval/prepare_mayr.py` restores them by rule and logs every substitution in `eval/data/mayr_104_restorations.csv`.
- **Constructed set.** 200 genuine and 200 altered references (invented, extended title, swapped authors, altered year and venue; 50 each), built by `eval/build_sets.py` with seed 20260928 after the revision was frozen. A rebuild asserts that it reproduces the set exactly.
- **Manuscripts.** The reference strings of 27 papers of the corpus, three per stratum, 636 strings, as the corpus pipeline extracted them (`code/analyze_dataset.py`). That pipeline kept at most the first 50 strings of each paper and cut each string at 500 characters, and for some papers it recovered only a few; the strings are therefore not complete bibliographies, and results on them are reported per fifty references.
- **Planted set.** 132 fabricated references (invented work, extended title, swapped authors) made by editing strings of the same manuscripts that both versions of the tool had verified, with donors from the same bibliography, so that each keeps its manuscript's citation style and extraction damage. Built by `eval/build_planted.py` with seed 20260929; neither version was run on it before the final version (`b8248e2`) was fixed. A rebuild asserts that it reproduces the set exactly.

Two judgements on the manuscripts were made reference by reference, each recorded with its evidence:

- `eval/data/manuscript_changes_audit.csv`: every reference the original tool verified and the final version flags, with the record each version selected, classified as another work, another version, extraction damage, not retrieved, or false disagreement.
- `eval/data/manuscript_cleared_audit.csv`: every reference the original tool flagged and the final version verifies, with the record the final version selected, checked as the work cited or another work.
- `eval/data/manuscript_flags_audit.csv`: a random sample (seed 20260929, `eval/sample_flags.py`) of 40 of the flags the final version presents as possibly wrong, each verified against a DOI, a proceedings page or another named source, with the verdicts defined in `eval/sample_flags.py`.

The tool is run by `eval/harness/run_tool.ts` on the same code path as the web interface (`paste`, `quick`, `raw`, `bibtex` modes mirror `App.tsx` and `BunchPdfView.tsx`). Differences from a browser session, none of which touches the engine's logic: xmldom supplies `DOMParser`; requests the engine sends through the codetabs CORS proxy go to arXiv directly; requests are paced (arXiv one per 3.1 s, Semantic Scholar one per 1.1 s) and retried on 429/5xx except Semantic Scholar, which the app does not retry. Every response, failures included, is cached by URL, so the original and revised engine see identical responses to identical requests.

The original engine is the snapshot of `src/services` on `main`, in `eval/harness/baseline/`.

## Revision history

| Commit | What |
|---|---|
| `b404b90` | Revision frozen before any evaluation |
| `5abdb37` | Year read from the supplied text, not the parsed field (found on the independent set; the parser took 1904 from an arXiv identifier) |
| `c5dc047` | Title-text detection independent of case (found while measuring title-less references in the corpus) |
| `e5f4c90` | Title-extension check applied to references verified by volume and page (found on the constructed set) |
| `8b0b50c` | Line-break hyphenation repaired before search and comparison (found on the manuscripts) |
| `142a77b` | Names as PDF extraction and the sources write them: accents separated from their letters, compound surnames, record names damaged by encoding (found on the manuscripts) |
| `b8248e2` | Given names against joined initials, exact title preferred to a containing one, spacing in title comparison, a DOI given twice counted once (found on the manuscripts). Final version. |

Which version each result belongs to:

| Set | Version evaluated blind | Final version (`b8248e2`) |
|---|---|---|
| Independent | none: a few cases were inspected during the diagnosis | `mayr_revised_{quick,paste}.jsonl`; the frozen version's are `*_b404b90.jsonl` |
| Constructed | `c5dc047`: `constructed_revised_paste_c5dc047.jsonl` (table) | `constructed_revised_paste.jsonl`, `constructed_revised_bibtex.jsonl` |
| Manuscripts | `e5f4c90`: `corpus_revised_raw_e5f4c90.jsonl` | `corpus_revised_raw.jsonl` |
| Planted | `b8248e2` | `planted_revised_raw.jsonl`; the original's `planted_baseline_raw.jsonl` |

The original engine's results are the `*_baseline_*.jsonl` files. Intermediate runs of `142a77b` are kept as `*_142a77b.jsonl` and not reported.

Weaknesses present in both versions and left unchanged: the arXiv query is a disjunction of words; the heuristic that extracts a title from a reference string splits it at commas; the Semantic Scholar query asks for a field (`isRetracted`) that the service rejects. During the evaluation DBLP answered every request with a bot-verification page.

## Statistical analysis

All in `eval/make_paper_numbers.py` (statsmodels):

- The two versions are compared on the same references: exact McNemar tests on the references whose verdict changes, and Wilson intervals for the shares quoted with them.
- On the manuscripts, references are clustered in papers. The change in the share of references presented as possibly wrong (Not Found, Partial Match, Mismatch) is estimated with a linear probability model on the two versions stacked, with reference fixed effects and standard errors clustered by manuscript.
- `table_regression.tex`: for each version, a linear probability model of that outcome on the features of `eval/reference_features.py` (joined to the manuscript strings by row, with a check) and a DOI indicator, with stratum fixed effects and standard errors clustered by manuscript. Whether a feature's effect changes between versions is tested on the two versions stacked, with the version interacted with every regressor. A linear model is used because under the revised tool some features predict the outcome perfectly, which rules out a logit.

## RefChecker

Version 3.0.190, run without a language model (`--llm-provider` omitted; the base install has no LLM SDKs, and LLM API keys were removed from its environment). Without a model it extracts nothing from plain text, so on the constructed set both tools receive the same BibTeX file (`eval/data/constructed_400.bib`). On the independent set the comparison uses the RefChecker results published by Badalova and Mayr.

## Provenance

The evaluation harness, the analysis code, the revisions to the engine and drafts of the text were produced with an AI coding assistant, and the audit of the diagnostic corpus (individual resolution of unresolved references) was carried out by the same assistant with API and web access. Every audit verdict is recorded against a named identifier or URL. The manuscript's "Use of AI tools" statement says so and must be confirmed by the author before submission.

## Bibliography verification log

Every entry was resolved against its identifier. Four did not survive a first draft:

| Key | Correction |
|---|---|
| `tkaczyk2015` | CERMINE is 2015 (IJDAR 18(4)), not 2018 |
| `priem2022` | a single-source Crossref query returned a different paper by overlapping authors; the OpenAlex paper is arXiv 2205.01833 |
| `zhao2026` | first author entered as "Yiming Zhao" from a secondary source; arXiv 2605.07723 gives Zhenyue Zhao |
| `shi2026` | a search engine summary attributed CiteAudit to "Yuan et al."; arXiv 2602.23452 gives Kaiwen Shi as first author |

Three of the four are the failure this paper is about: a plausible bibliographic claim that nobody had checked against the record.
