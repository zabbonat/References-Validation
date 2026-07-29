"""
Stage B: classification of the residual left unmatched by stage A.

Each of the 46 strings is assigned to one of five categories. Two are decided
by explicit rules stated below and applied uniformly. The remainder were
resolved individually against a named source, and the identifier or URL is
recorded in EVIDENCE so that any verdict can be rechecked without repeating
the search.

The categories are:
  Not a reference       the string is body text, a formula, a table, a prompt
                        or appendix prose admitted by the heuristic segmenter
  Segmentation failure  the string concatenates two or more distinct references
                        that the segmenter did not separate
  Coverage limitation   a genuine work that none of the four structured sources
                        indexes, typically software, a web resource or grey
                        literature
  Rule limitation       a genuine and indexed work that the agreement rule could
                        not confirm, because the string carries no title to
                        compare against
  Fabrication           no corresponding work could be located
"""

import re
import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

IN = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_a_flagged_307.csv"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_b_residual.csv"

# Resolved individually. Verdict, then the identifier the verdict rests on.
EVIDENCE = {
    "F232": ("Rule limitation",
             "Bare DOI, no title in the string. Resolves to Yang et al., scBERT, "
             "Nature Machine Intelligence. doi:10.1038/s42256-022-00534-z"),
    "F185": ("Rule limitation",
             "Yu, Yu and Wang, KAN or MLP: A Fairer Comparison. arXiv:2407.16674, "
             "title and authors match the string exactly"),
    "F175": ("Rule limitation",
             "Wang, Li, Wu, Chandra and Liu, Energy-Aware Neural Architecture "
             "Optimization with Fast Splitting Steepest Descent. arXiv:1910.03103"),
    "F026": ("Rule limitation",
             "Font subset with a custom encoding and no ToUnicode map; a constant "
             "+29 shift restores Abid, Farooqi and Zou, Persistent Anti-Muslim Bias "
             "in Large Language Models. arXiv:2101.05783"),
    "F038": ("Coverage limitation",
             "Stanford Alpaca, github.com/tatsu-lab/stanford_alpaca. Repository "
             "exists and the listed authors match the string. Software release, "
             "indexed by none of the four sources"),
    "F210": ("Coverage limitation",
             "Gosmar, Multi-Agent Hallucination Evaluator, "
             "github.com/diegogosmar/hall_evaluator. Repository and author confirmed"),
    "F024": ("Segmentation failure",
             "A lesswrong.com post concatenated with the opening of Bai et al.; the "
             "post exists at the URL given in the string"),
    "F045": ("Coverage limitation",
             "International Myeloma Foundation, Understanding Serum Free Light Chain "
             "Assays, patient-information PDF, concatenated with a figure caption. "
             "Grey literature, indexed by none of the four sources"),
    "F136": ("Rule limitation",
             "Ahn et al., Do As I Can, Not As I Say: Grounding Language in Robotic "
             "Affordances. arXiv:2204.01691. The string is truncated mid-entry by the "
             "500-character field limit, which removes the year"),
    # Body text, appendix prose and table content that the rule below does not
    # catch, because a year or a digit string survives inside the passage.
    "F031": ("Not a reference",
             "Tail of a venue string followed by appendix prose, 'A. Theoretically "
             "Analysis In this section, we theoretically analyze...'"),
    "F036": ("Not a reference", "Appendix prose, 'In this Appendix we provide further details...'"),
    "F042": ("Not a reference", "Hyperparameter table content and appendix heading, 'Table 7'"),
    "F049": ("Not a reference", "Body text from a Discussion section on ZIKV outbreak R0 estimation"),
}

# A string carrying several distinct publication years, several 'et al.' markers
# or several DOIs is a block of references the segmenter failed to split. The
# astronomy strata are affected systematically, because the A&A and ApJ styles
# carry no enumeration marker for the splitter to key on.
YEAR = re.compile(r"\b(19\d{2}|20[0-3]\d)\b")
DOI = re.compile(r"10\.\d{4,9}/")
ETAL = re.compile(r"et al\.", re.I)


def is_block(s):
    return len(set(YEAR.findall(s))) >= 3 or len(DOI.findall(s)) >= 2 or len(ETAL.findall(s)) >= 3


# Prose, formulas, tables and prompts carry no bibliographic apparatus at all.
def is_not_reference(s):
    if YEAR.search(s) or DOI.search(s):
        return False
    has_authorish = re.search(r"[A-Z][a-z]+,\s*[A-Z]\.", s) or re.search(r"\bet al\b", s, re.I)
    return not has_authorish


df = pd.read_csv(IN)
res = df[df.StageA_Status == "Unresolved"].copy().reset_index(drop=True)

verdicts, evidence = [], []
for _, r in res.iterrows():
    s = str(r["Original Reference"])
    if r.ID in EVIDENCE:
        v, e = EVIDENCE[r.ID]
    elif is_block(s):
        v, e = "Segmentation failure", "rule: multiple years, DOIs or et al. markers in one string"
    elif is_not_reference(s):
        v, e = "Not a reference", "rule: no year, no DOI and no author pattern"
    else:
        v, e = "Unclassified", "requires individual resolution"
    verdicts.append(v)
    evidence.append(e)

res["StageB_Verdict"] = verdicts
res["StageB_Evidence"] = evidence
res[["ID", "Dataset", "Original Reference", "StageB_Verdict", "StageB_Evidence"]].to_csv(
    OUT, index=False, encoding="utf-8")

print(res.StageB_Verdict.value_counts().to_string())
print()
print("by stratum:")
print(pd.crosstab(res.Dataset, res.StageB_Verdict).to_string())
print()
unc = res[res.StageB_Verdict == "Unclassified"]
if len(unc):
    print(f"{len(unc)} still unclassified:")
    for _, r in unc.iterrows():
        print(f"  {r.ID}: {str(r['Original Reference'])[:150]}")
else:
    print("no string left unclassified")
print()
print(f"fabrications identified: {(res.StageB_Verdict == 'Fabrication').sum()}")
