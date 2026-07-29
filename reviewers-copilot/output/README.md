# output/

Manuscript and figures. Nothing in this folder is written by hand except the prose.

## Files

| File | Produced by |
|---|---|
| `main.tex` | written |
| `references.bib` | written, every entry resolved against Crossref/arXiv (log below) |
| `numbers.tex` | `code/make_numbers.py` |
| `figures/fig1_unresolved_by_venue.pdf` | `code/make_figures.py` |
| `figures/fig2_verified_match_quality.pdf` | `code/make_figures.py` |

## Rebuilding

```bash
python code/make_numbers.py && python code/make_figures.py && latexmk -pdf output/main.tex
```

`main.tex` contains no literal figures. Every quantity is a macro defined in `numbers.tex`, which is regenerated from `data/longitudinal_dataset_N22479.xlsx` and the analysis outputs. If a number in the text looks wrong, the fix goes in `make_numbers.py`, never in `main.tex`.

## The `\pending` marker

Claims not yet established by the audit are wrapped in `\pending{...}`, which renders in red boldface. The manuscript must not be submitted while any such marker survives compilation. Check with:

```bash
grep -n "pending{" output/main.tex
```

## Audit status

The audit runs in three stages. Only a stage that has completed may be cited in the manuscript.

- **Stage A, deterministic re-verification. Complete.** All 307 strings left unresolved by the single-source pass were normalized and re-queried against Crossref, OpenAlex, DBLP and arXiv. Verdict follows the agreement rule; evidence is the DOI or repository identifier. No judgement involved. Script: `code/audit_stage_a.py`. Output: `stage_a_flagged_307.csv`. Result: 197 recovered, 64 fuzzy, 46 unresolved.

  The first run of this stage was invalid and is retained as `stage_a_flagged_307_CROSSREF_ONLY_superseded.csv`. It passed the whole punctuated reference string to OpenAlex and an exact-phrase query to arXiv, and both return nothing under those conditions, so the run was effectively Crossref-only despite reporting four sources. Testing the two query forms on five references known to be genuine gave zero hits for the full-string form and five for the keyword form. Correcting the queries moved the residual from 60 to 46.
- **Stage B, resolution of the residual. Complete.** The 46 strings unmatched by all four sources in stage A. Script: `code/audit_stage_b.py`. Output: `stage_b_residual.csv`. Result: 21 segmentation failures, 17 not references, 5 rule limitations, 3 coverage limitations, **0 fabrications**.

  Two categories are assigned by rules stated in the script and applied uniformly. The other 13 strings were resolved individually and the identifier or URL backing each verdict is recorded in the `EVIDENCE` table in the script, so no verdict rests on an unrecorded judgement.

  The dominant finding is that 18 of the 21 segmentation failures are astronomy bibliographies from the 2026 cohort. The A&A and ApJ styles carry no enumeration marker, so the splitter returns whole reference lists as single strings. This is a property of one parser meeting one citation style.
- **Stage C, independent verification of the accepted stratum. Complete.** The 200-row stratified sample was verified string by string against four sources under the agreement rule, without reference to the record the screening pass accepted. Scripts: `code/audit_stage_c.py`, `code/audit_stage_c_resolve.py`. Outputs: `stage_c_accepted_sample.csv`, `stage_c_residual_resolved.csv`. Result: 125 confirmed, 58 fuzzy, 17 unresolved; the 17 resolve into 10 rule limitations, 4 coverage limitations, 1 non-reference and 2 that could not be pinned to an exact record. **0 fabrications.** Exact 95% upper bound 1.49%, or 3.11% treating both unpinned strings as fabrications.

  This is **not** the human verification originally specified. It is an automated second pass, performed by the same class of tools as the screening it audits, and the manuscript must describe it as such. What it can establish is that a cited work exists and where; what it cannot establish is anything that requires a reader's judgement. See the provenance note below.

## Provenance of the audit

The verification reported in stages A, B and C was carried out by an automated agent with API and web-search access, not by a human expert coder. Every verdict is backed by a recorded identifier or URL and can be rechecked, and the rule-based categories are reproducible from the scripts. Two things follow and both belong in the manuscript rather than in this file.

The manuscript may not describe this audit as manual, expert or single-coder. It is an automated audit with recorded evidence.

No inter-rater reliability statistic is available, because there is one coder and it is not a person. The `Double_Coded` column in the two coding sheets marks a 25% subset reserved for a second, human coder; until someone codes it, agreement statistics cannot be reported. The author should at minimum spot-check the 13 individually resolved strings in stage B and the escalated cases in stage C, since those are the verdicts that carry the fabrication claim.

## Negative results, deliberately retained

Two mechanisms were proposed to explain the temporal trend in the unresolved rate. Both were tested and both failed, and Section 4.5 of the manuscript reports the failure rather than dropping it.

- **Extraction damage.** `code/measure_extraction_damage.py`. Ligature damage *falls* over the period (arXiv cs.AI 22.04% in 2016 to 0.82% in 2025) and correlates negatively with the unresolved rate across the nine strata (Spearman −0.617). Lost inter-field spaces show no relationship (+0.017). At string level, damage does raise the risk of remaining unresolved by 1.55×, so the mechanism exists; it is simply not distributed as the trend would require.

  A first version of this measurement appeared to support the hypothesis. It tested for a lowercase letter followed by an uppercase one, which is dominated by legitimate camel-case tokens, above all *arXiv*, whose frequency roughly quadruples over the period for reasons unrelated to extraction. Excluding those tokens removes the apparent trend.
- **Preprint composition.** Preprint citations rise from 6.4% to 24.3% of references within arXiv cs.AI, and preprint references are 1.78× more likely to remain unresolved. This does not explain the trend, because the trend holds within each category: among references mentioning no preprint server, the cs.AI unresolved rate still rises 0.36% → 1.06% → 2.56%.

`code/detect_encoding_damage.py` searched for a third mechanism, font subsets carrying a custom encoding without a ToUnicode map, which renders text as shifted glyph codes. One clear instance exists in the corpus, an Abid, Farooqi and Zou reference recoverable by a constant +29 shift, but the signature appears in essentially no other string. The mechanism is real and rare, and it does not carry the trend.

## Independent of the audit

The match-quality result (Table 2, Figure 2) is independent of all three stages. It is computed offline from the record the screening pass itself stored, by `code/audit_verified_match.py`, and requires no retrieval and no judgement.

## Bibliography verification log

Checked during preparation. Two entries in an earlier draft did not survive checking and were corrected.

| Key | Status |
|---|---|
| `sakai2026` | confirmed, arXiv 2601.18724, ACL 2026, Sakai / Kamigaito / Watanabe |
| `zhao2026` | confirmed, arXiv 2605.07723 |
| `russinovich2026` | confirmed, arXiv 2607.00738, Russinovich / Siva Kumar / Salem |
| `naturebanned2026` | confirmed, nature.com/articles/d41586-026-01595-5 |
| `naturesocsci2026` | confirmed, nature.com/articles/d41586-026-01545-1 |
| `naturepolluting2026` | confirmed, doi 10.1038/d41586-026-00969-z |
| `verabaceta2019` | confirmed via Crossref, doi 10.1007/s11192-019-03264-z |
| `lopez2009` | confirmed via Crossref, doi 10.1007/978-3-642-04346-8_62 |
| `tkaczyk2015` | **corrected.** Cited as `tkaczyk2018` in an earlier draft. CERMINE is 2015, IJDAR 18(4), doi 10.1007/s10032-015-0249-8 |
| `priem2022` | **corrected.** A Crossref query returned Piwowar, Priem and Orr (2019), *The Future of OA*, which is a different paper. The OpenAlex paper is arXiv 2205.01833 (2022), confirmed directly |
| `zhao2026` | **corrected.** The first author was initially entered as "Yiming Zhao", inferred from a secondary source that cited the paper as "Zhao et al." and never checked. arXiv 2605.07723 gives Zhenyue Zhao, Yihe Wang, Toby Stuart, Mathijs De Vaan, Paul Ginsparg and Yian Yin. The given name was invented, which is the failure this manuscript is about, caught by checking the identifier |
| `bhattacharyya2023`, `walters2023`, `day2023`, `eysenbach2023`, `martinmartin2018`, `visser2021` | carried over from the existing bibliography |

The `priem2022` case is worth recording. A single-source bibliographic query returned a plausible but incorrect record, with overlapping authors and a related topic. That is the same failure the manuscript measures at 25.35% across the corpus, encountered while assembling the manuscript's own bibliography.

## Known divergence between manuscript and shipped tool

`SearchService.ts:161` normalizes with `NFD`, which does not decompose the `ﬁ` ligature; only `NFKD` does. `code/analyze_dataset.py` used `NFKD` followed by an ASCII fold, which deletes any character that fails to decompose. The normalization described in Section 3 of the manuscript is the one implemented in `audit_stage_a.py` and used for the reported results. The shipped dashboard does not yet implement it. Either the tool is brought into line with the manuscript, or Section 3 must say which artefact it describes.
