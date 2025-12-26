---
title: 'CheckIfExist: A Web-Based Tool for Immediate Bibliographic Reference Validation'
tags:
  - scientometrics
  - bibliometrics
  - citation analysis
  - reference validation
  - research integrity
  - LLM hallucination
authors:
  - name: Diletta Abbonato
    orcid: 0000-0002-6275-8787
    affiliation: 1
affiliations:
  - name: Department of Culture, Politics and Society, University of Turin, Italy
    index: 1
    ror: 048tbm396
date: 27 December 2024
bibliography: paper.bib
---

# Summary

`CheckIfExist` is an open-source web-based tool that provides immediate verification of bibliographic references against the CrossRef scholarly database. The tool addresses the growing problem of citation errors and AI-generated reference hallucinations by enabling researchers to instantly validate whether a given citation corresponds to an actual published work. Users can input references in free-text format or as structured BibTeX entries, and receive real-time feedback including match confidence scores, detection of potential fake authors, and corrected metadata in APA and BibTeX formats.

# Statement of need

The integrity of scholarly communication depends on accurate bibliographic references. Citations acknowledge intellectual contributions, enable reproducibility, and form the basis for research impact assessment [@garfield1972citation; @merton1973sociology]. Studies have documented citation error rates between 25% and 54% across disciplines [@siebers2000accuracy], with errors propagating through citation networks as subsequent authors copy references without verification [@simkin2003read].

The rapid adoption of large language models (LLMs) in academic workflows has introduced a new threat: reference hallucination. LLMs can generate citations that appear plausible—with realistic author names, journal titles, and publication years—yet correspond to no actual published work [@alkaissi2023artificial; @ji2023survey]. Hallucination rates in LLM-generated academic content range from 6% to over 30% depending on the model and domain [@agrawal2024language].

While reference management tools such as Zotero, Mendeley, and EndNote excel at organizing and formatting citations [@kratochvil2017comparison], they do not verify reference authenticity. A hallucinated citation will be stored alongside legitimate references without any indication of its spurious nature. Similarly, bibliographic databases like Web of Science or Scopus require manual querying of each citation—a process that scales poorly for comprehensive bibliography audits.

`CheckIfExist` fills this gap by providing immediate, automated verification. The tool queries the CrossRef REST API, which indexes over 140 million scholarly works, and applies string similarity algorithms to compute multi-dimensional match confidence scores across title, author, journal, and publication year metadata. The verification completes within seconds, enabling researchers to validate citations at the speed of modern content production.

# Features

The tool offers two usage modes:

- **Quick Check**: Accepts free-form citation text in any format (APA, MLA, Chicago, etc.) for rapid single-reference verification
- **Batch Check**: Processes multiple references from BibTeX entries or newline-separated lists, enabling systematic validation of entire bibliographies

For each verified reference, `CheckIfExist` provides:

- Match confidence score (0-100%)
- Detection of potential fake or extra authors not present in the actual publication
- Identification of metadata discrepancies (wrong year, journal mismatch)
- Correctly formatted APA citation derived from authoritative CrossRef metadata
- Valid BibTeX entry for LaTeX integration

The verification algorithm uses Levenshtein distance for string similarity computation, retrieves the top three candidate matches from CrossRef to handle author name variations, and applies penalties for detected discrepancies to compute an overall confidence score.

# Acknowledgements

The author thanks the CrossRef organization for providing open access to their REST API, which makes this tool possible.

# References
