# output/

Manuscript for *Scientometrics*: **Can Referees Rely on Automated Reference Checks? Diagnosing and Reducing False Alarms in CheckIfExist.** Nothing in this folder is written by hand except the prose.

## Files

| File | Produced by |
|---|---|
| `main.tex` | written |
| `references.bib` | written; every entry resolved against arXiv, Crossref or the publisher (log below) |
| `numbers.tex` | `code/make_numbers.py`: audit of the diagnostic corpus |
| `numbers_eval.tex` | `eval/make_paper_numbers.py`: evaluation |
| `table_features.tex`, `table_independent.tex`, `table_constructed.tex` | `eval/make_paper_numbers.py` |
| `figures/fig_independent.pdf`, `figures/fig_workload.pdf` | `eval/make_paper_figures.py` |

`main.tex` contains no literal figures. `code/check_manuscript.py` refuses to pass while any macro is undefined, any citation is missing, or any `\pending{...}` marker survives in the text or in a generated file.

## Rebuilding

```bash
python code/make_numbers.py
python eval/reference_features.py
python eval/make_paper_numbers.py
python eval/make_paper_figures.py
python code/check_manuscript.py
latexmk -pdf output/main.tex
```

## Evaluation design

Four sets, all in `eval/data/`:

- **Diagnostic corpus.** 22,479 reference strings from 919 arXiv and NeurIPS papers (`data/longitudinal_dataset_N22479.xlsx`), for the prevalence of error-prone features (`eval/reference_features.py`).
- **Independent test set.** Badalova and Mayr (2026), Zenodo 10.5281/zenodo.21457492, CC BY 4.0, copied unmodified to `eval/external/`. The CSV is cp850-encoded and 90 characters in 58 references were saved as `?`; `eval/prepare_mayr.py` restores them by rule and logs every substitution in `eval/data/mayr_104_restorations.csv`.
- **Constructed set.** 200 genuine and 200 altered references (invented, extended title, swapped authors, altered year and venue; 50 each), built by `eval/build_sets.py` with seed 20260928 after the revision was frozen. A rebuild asserts that it reproduces the set exactly.
- **Manuscripts.** 27 whole bibliographies, three per stratum, 636 strings.

The tool is run by `eval/harness/run_tool.ts` on the same code path as the web interface (`paste`, `quick`, `raw`, `bibtex` modes mirror `App.tsx` and `BunchPdfView.tsx`). Differences from a browser session, none of which touches the engine's logic: xmldom supplies `DOMParser`; requests the engine sends through the codetabs CORS proxy go to arXiv directly; requests are paced (arXiv one per 3.1 s, Semantic Scholar one per 1.1 s) and retried on 429/5xx except Semantic Scholar, which the app does not retry. Every response, failures included, is cached by URL, so the original and revised engine see identical responses to identical requests.

The original engine is the snapshot of `src/services` on `main`, in `eval/harness/baseline/`.

## Revision history

| Commit | What |
|---|---|
| `b404b90` | Revision frozen before any evaluation |
| `5abdb37` | Year read from the supplied text, not the parsed field (found on the independent set; the parser took 1904 from an arXiv identifier) |
| `c5dc047` | Title-text detection independent of case (found while measuring title-less references in the corpus) |

Both corrections were made before the constructed set and the manuscripts were evaluated with the revised engine. Results on the independent set are reported for the final version; the frozen version's are kept as `eval/results/mayr_revised_*_b404b90.jsonl`.

A few cases of the independent set were inspected during the diagnosis, before the revision was written. It is therefore not fully held out; the constructed set is.

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
