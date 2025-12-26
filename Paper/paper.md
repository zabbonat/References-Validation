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

`CheckIfExist` is an open-source, web-based application designed for the immediate verification of bibliographic references against the CrossRef scholarly metadata database. In an era where large language models increasingly permeate academic writing workflows, the tool addresses the critical challenge of distinguishing authentic citations from fabricated ones—a phenomenon known as reference hallucination. 

The application accepts citations in any standard format (APA, MLA, Chicago, or free-text) as well as structured BibTeX entries, and delivers real-time validation results within seconds. Through a multi-dimensional matching algorithm that evaluates title similarity, author verification, journal correspondence, and publication year accuracy, `CheckIfExist` computes a confidence score indicating the likelihood that a given reference corresponds to an actual scholarly work. Critically, the tool detects potential fabricated authors—names present in the queried citation that do not appear among the verified authors of the matched publication—providing an essential safeguard against sophisticated LLM-generated hallucinations. For each validated reference, the application generates correctly formatted APA citations and BibTeX entries derived from authoritative CrossRef metadata, ensuring bibliographic accuracy in downstream use.

# Statement of need

The foundation of scholarly communication rests upon the accuracy and verifiability of bibliographic references. Citations serve as the connective tissue of scientific discourse: they acknowledge intellectual contributions, establish provenance of ideas, enable reproducibility, and constitute the basis for quantitative research impact assessment [@garfield1972citation; @merton1973sociology]. The integrity of citation networks directly influences bibliometric indicators that shape funding decisions, hiring practices, and scientific reputation.

Yet citation errors have long plagued academic publishing. Empirical studies document error rates ranging from 25% to 54% of references containing at least one inaccuracy [@siebers2000accuracy]. These errors propagate through the literature as authors copy citations without verification—a phenomenon termed citation mutation [@simkin2003read]. The consequences extend beyond individual papers: incorrect references misdirect researchers, waste resources, and undermine the cumulative architecture of scientific knowledge.

The widespread adoption of large language models in academic contexts has dramatically amplified these concerns. LLMs can generate citations exhibiting sophisticated verisimilitude—plausible author names, realistic journal titles, coherent publication years—that nonetheless correspond to no existing work [@alkaissi2023artificial; @ji2023survey]. Empirical investigations report hallucination rates between 6% and 30% in LLM-generated academic content, varying by model and domain [@agrawal2024language]. The stochastic nature of these fabrications renders manual detection cognitively demanding and practically unscalable.

Existing reference management tools—Zotero, Mendeley, EndNote, JabRef—provide sophisticated functionality for organizing, storing, and formatting bibliographic data [@kratochvil2017comparison]. However, these systems are architected for citation *management*, not *validation*. A hallucinated reference enters these tools indistinguishable from legitimate citations. Bibliographic databases such as Web of Science, Scopus, and Google Scholar offer search capabilities, but verification requires manual querying of each reference individually—a workflow that interrupts writing and scales poorly for comprehensive bibliography audits.

`CheckIfExist` occupies a distinct and complementary position in the scholarly infrastructure: it provides instantaneous, automated verification at the moment researchers need it. By interfacing with the CrossRef REST API—which indexes metadata for over 140 million scholarly works—the tool delivers validation results in seconds rather than minutes. This immediacy transforms reference verification from a burdensome post-hoc task into an integrated component of the writing process itself.

# Implementation

The application is implemented in React with TypeScript, ensuring cross-platform browser compatibility without installation requirements. The verification pipeline operates as follows: user input (free-text or BibTeX) is parsed and submitted to the CrossRef API; the top three candidate matches are retrieved to accommodate author name variations; string similarity is computed via the Levenshtein distance metric normalized by maximum string length; author verification extracts family names from CrossRef metadata and checks their presence in the query while simultaneously detecting potential fabricated names; finally, a composite confidence score integrates these components with penalties for detected discrepancies.

Two operational modes serve different use cases. **Quick Check** enables rapid verification of individual citations during manuscript preparation or peer review. **Batch Check** processes multiple references sequentially—from BibTeX exports or newline-separated lists—with rate limiting to respect API usage policies, enabling systematic validation of entire bibliographies.

# Acknowledgements

The author acknowledges the CrossRef organization for providing open access to their REST API, which constitutes the foundational infrastructure enabling this tool.

# References
