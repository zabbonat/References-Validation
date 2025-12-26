---
title: 'CheckIfExist: A Web-Based Tool for Immediate Bibliographic Reference Validation'
tags:
  - scientometrics
  - bibliometrics
  - citation analysis
  - reference validation
  - research integrity
  - LLM hallucination
  - CrossRef
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

`CheckIfExist` is an open-source web application developed to verify bibliographic references against CrossRef metadata in real time. As Large Language Models (LLMs) become integrated into academic drafting, the risk of "reference hallucination"—the generation of plausible but non-existent citations—has introduced a new noise factor in scholarly communication.

The tool parses citations in standard formats (APA, MLA, Chicago, free-text) and structured BibTeX. It returns validation results immediately by employing a multi-dimensional matching algorithm. This algorithm evaluates title similarity, author presence, journal matching, and publication year. Crucially, `CheckIfExist` flags potential "fabricated authors"—names appearing in the input string that are absent from the verified metadata—offering a specific safeguard against the subtle fabrications typical of generative AI. Validated references can be exported as clean APA citations or BibTeX entries based on the authoritative CrossRef record.

# Statement of need

The validity of the citation network is a precondition for robust bibliometric analysis. Citations do more than acknowledge prior work; they are the primary unit of measurement for impact assessment and the tracing of intellectual lineage [@garfield1972citation; @merton1973sociology]. Consequently, compromised citation data degrades the quality of indicators used for funding, recruitment, and tenure.

Citation accuracy has always been a challenge. Historical error rates are significant, with studies finding inaccuracies in 25% to 54% of references [@siebers2000accuracy]. These errors often persist through "citation mutation," where authors cite papers they have not read, replicating previous errors [@simkin2003read]. However, the rise of LLMs has shifted the nature of this problem from human error to algorithmic fabrication.

Unlike traditional errors, LLM hallucinations are stochastic. They generate references that mimic the morphology of real citations—correct journals, plausible dates, and real author names—but point to non-existent documents [@alkaissi2023artificial; @ji2023survey]. Hallucination rates in academic tasks are estimated between 6% and 30% [@agrawal2024language]. Manual verification of these "ghost" references is disproportionately time-consuming because they often look correct at a glance.

Current reference managers (e.g., Zotero, JabRef) excel at storage and formatting but lack native validation layers [@kratochvil2017comparison]. A hallucinated entry looks the same as a valid one in a `.bib` file. While databases like Scopus or Web of Science allow for verification, they are designed for discovery, not for the high-throughput auditing of a reference list.

`CheckIfExist` addresses this gap by offering a lightweight, validation-centric interface. By querying the CrossRef REST API—covering over 140 million records—it allows researchers to validate references at the point of creation, reducing the likelihood that fabricated data enters the downstream bibliographic record.

# Implementation

`CheckIfExist` is built as a client-side React/TypeScript application to ensure privacy and ease of access; no installation is required.

The verification logic follows a specific sequence:

1. **Parsing & Query:** The input is parsed and queried against the CrossRef API.
2. **Fuzzy Matching:** The top three candidates are retrieved to account for inconsistencies in indexing or naming.
3. **Metric Calculation:** Title similarity is assessed using normalized Levenshtein distance.
4. **Author Integrity:** The system cross-references input names against metadata to identify both matches and potential fabrications.
5. **Scoring:** A confidence score is calculated based on these weighted variables.

The tool supports two workflows: a **Quick Check** for individual queries during drafting, and a **Batch Check** for validating full lists or BibTeX files, which includes rate-limiting logic to comply with API standards.

# Acknowledgements

The author thanks CrossRef for maintaining the open REST API that makes this tool possible.

# References
