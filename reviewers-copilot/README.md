# CheckIfExist: replication package

Replication package for the article

> **Can Referees Rely on Automated Reference Checks? Diagnosing and Reducing False Alarms in CheckIfExist**
> Diletta Abbonato, CPS Department, University of Turin. Manuscript prepared for *Scientometrics*.

The tool itself, CheckIfExist, is the web application in the root of this repository (`src/`). Its verification engine is `src/services/SearchService.ts`, with the checks added in the revision in `src/services/CitationChecks.ts` and `src/services/TextNormalize.ts`.

## Contents

```text
reviewers-copilot/
├── output/        the manuscript: main.tex, references.bib, generated numbers, tables and figures
├── eval/          the evaluation: test sets, harness that runs the tool, results, RefChecker runs
├── code/          audit of the diagnostic corpus, and the checks run on the manuscript
├── data/          the diagnostic corpus (22,479 reference strings from 919 papers) and its audit
└── manuscript/    an earlier draft of the article, superseded by output/main.tex
```

`output/README.md` describes the evaluation design, the rebuild sequence and the revision history of the engine. Every quantity in the manuscript is produced by a script; none is typed by hand.

## Quick rebuild

```bash
python code/make_numbers.py
python eval/reference_features.py
python eval/make_paper_numbers.py
python eval/make_paper_figures.py
python code/check_manuscript.py
python code/check_style.py
```

Re-running the tool itself (`eval/harness/run_tool.ts`, Node 20 or later) needs the responses of the bibliographic sources stored during the evaluation (`eval/cache/`, 37 MB). They are not in this repository and are to be deposited in a public archive; with them in place the harness reproduces every result without network access. Without them, responses come live from Crossref, OpenAlex, Semantic Scholar, arXiv and DBLP and will differ where the sources have changed.

## Licence

MIT. The independent test set in `eval/external/badalova_mayr_2026/` is by Badalova and Mayr (2026), Zenodo 10.5281/zenodo.21457492, CC BY 4.0, and is redistributed unmodified.
