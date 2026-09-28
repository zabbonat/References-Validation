# Manual Reference Verification Dataset for Hallucinated and Suspicious Citation Detection Tools

## Overview

This dataset accompanies the manuscript **“Detecting Hallucinated and Suspicious Citations: What Current Tools Can and Cannot Do”** by Fidan Badalova and Philipp Mayr.

It contains a reference-level manual verification of **104 references from three scholarly documents** and the standardized binary outputs of five tools for detecting hallucinated or bibliographically problematic citations:

- CheckIfExist
- HalluCiteChecker
- Hallucinator
- Hallucinated Reference Finder (HalRef)
- RefChecker

The dataset was created to compare how the tools identify problematic references and how often they incorrectly flag verified references. It is **not intended to estimate the prevalence** of hallucinated citations in the scientific literature.

## Files

- `manual_reference_verification_dataset.csv`  -  reference-level manual labels and tool outputs
- `README.md`  -  dataset documentation

## Source documents

### P1 RenoBench: A Citation Parsing Benchmark

- **Venue:** Workshop on Citation Extraction and Parsing (CiteX)
- **Year:** 2026
- **Total references:** 24
- **Verified references:** 21
- **Problematic references:** 3

### P2 SoFAIR Dataset: A Multidisciplinary Dataset of Research Papers Annotated with Software Mentions

- **Venue:** Scientific Data
- **Year:** 2026
- **Total references:** 15
- **Verified references:** 11
- **Problematic references:** 4

### P3 Efficient Semantic Uncertainty Quantification in Language Models via Diversity-Steered Sampling

- **Venue:** arXiv
- **Year:** 2025
- **Total references:** 65
- **Verified references:** 39
- **Problematic references:** 26

### Dataset totals

- **Total references:** 104
- **Verified references:** 71
- **Problematic references:** 33

The documents form a convenience sample:

- **P1** was selected after a nonexistent publication attributed to P.M. was identified in its reference list.
- **P2** was encountered during the investigation of problematic citations.
- **P3** was selected from a NeurIPS 2025 paper highlighted in GPTZero’s investigation of hallucinated references. The complete reference list was subsequently checked independently.

The sample was intentionally used to include different types of bibliographic problems and should not be treated as representative of scholarly publications in general.

## Manual verification

F.B. manually checked all 104 references. The verification considered the cited title, authors, publication venue, year, DOI or other available identifiers, and records available through scholarly databases, publisher pages, and conference or repository pages.

A reference was labeled:

- `verified` when the publication existed and its core bibliographic metadata could be confirmed;
- `problematic` when the cited publication could not be verified or when one or more core elements such as title, authors, venue, year, or DOI were inconsistent with the verified publication record.

A reference was not classified as problematic solely because it was absent from one database.

## Tool evaluation

The tools were evaluated between **June and July 2026** using the interfaces available to the authors at the time of testing. Public web interfaces were used with their available default settings where applicable.

Tool outputs were standardized as:

- `flagged` - the tool marked the reference as suspicious, mismatched, unresolved, not found, or otherwise requiring verification;
- `not_flagged` - the tool accepted the reference or did not report a bibliographic problem.

The CSV contains standardized binary outcomes rather than the complete raw output produced by each tool.

## Dataset columns

- `document_id` - source document identifier: `P1`, `P2`, or `P3`
- `document_title` - title of the source document
- `document_url` - URL of the source document
- `document_venue` - journal, conference, repository, or other venue
- `document_year` - publication or posting year
- `reference_number` - position of the reference in the source document
- `reference` - full bibliographic reference as cited in the source document
- `manual_label` - manual reference-standard label: `verified` or `problematic`
- `checkifexist` - standardized CheckIfExist result
- `hallucitechecker` - standardized HalluCiteChecker result
- `hallucinator` - standardized Hallucinator result
- `halref` - standardized HalRef result
- `refchecker` - standardized RefChecker result

The combination of `document_id` and `reference_number` uniquely identifies each reference.
