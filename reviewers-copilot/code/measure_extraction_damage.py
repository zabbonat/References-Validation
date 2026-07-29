"""
Prevalence of extraction damage by venue and year.

This is the test of the instrument-drift hypothesis that the corpus permits.
It does not identify the compilation engine, which the corpus does not record.
It measures instead whether the damage that engines are known to produce becomes
more frequent in the strata where the unresolved rate rises.

Three signatures are counted, each cheap and unambiguous:
  ligature   - a Unicode ligature codepoint survives in the extracted string
  glued      - a lowercase letter is followed directly by an uppercase one,
               which is what a lost inter-field space looks like
  hyphenated - a line-break hyphen was carried into the string
"""

import re
import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

DATA = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\data\longitudinal_dataset_N22479.xlsx"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\extraction_damage.csv"

ORDER = ["Arxiv_Bio_2016", "Arxiv_Bio_2023", "Arxiv_CS_2016", "Arxiv_CS_2023",
         "Arxiv_CS_2025", "NeurIPS_2016", "NeurIPS_2023", "NeurIPS_2025",
         "Arxiv_General_Latest"]

LIG = re.compile(r"[\ufb00-\ufb06\u0153\u00e6]")
HYPH = re.compile(r"[a-z]- [a-z]")

# A naive [a-z][A-Z] test is dominated by legitimate camel-case tokens, above
# all arXiv, whose frequency in these bibliographies roughly quadruples over the
# period for reasons that have nothing to do with extraction. Those tokens are
# removed before the test is applied.
CAMEL_OK = re.compile(
    r"\b(?:ar[XT]iv|bioRxiv|medRxiv|CoRR|PLo?S|NeurIPS|ICLR|OpenAI|OpenReview|"
    r"DeepMind|GitHub|GitLab|ImageNet|WordNet|PubMed|CorpusID|LeCun|Mc[A-Z]\w*|"
    r"Mac[A-Z]\w*|De[A-Z]\w*|Van[A-Z]\w*|PhD|MSc|BSc|fMRI|EEG|NeuroImage|ApJ|"
    r"PhysRev\w*|JMLR|TensorFlow|PyTorch|LaTeX|BibTeX|MathML|JavaScript|"
    r"[A-Z]?[a-z]*[A-Z]{2,}\w*)\b")
GLUED = re.compile(r"[a-z][A-Z]")

df = pd.read_excel(DATA)
s = df["Original Reference"].astype(str)
s_nocamel = s.map(lambda x: CAMEL_OK.sub(" ", x))

df["ligature"] = s.str.contains(LIG)
df["glued"] = s_nocamel.str.contains(GLUED)
df["hyphenated"] = s.str.contains(HYPH)
df["any_damage"] = df.ligature | df.glued | df.hyphenated
df["unresolved"] = df.Status == "Not Found"

df.to_csv(OUT, index=False, encoding="utf-8")

tab = (df.groupby("Dataset")[["ligature", "glued", "hyphenated", "any_damage", "unresolved"]]
       .mean().reindex(ORDER) * 100).round(2)
tab["n"] = df.groupby("Dataset").size().reindex(ORDER)

print(tab.to_string())
print()

corr = tab[["ligature", "glued", "hyphenated", "any_damage"]].corrwith(tab["unresolved"], method="spearman")
print("Spearman correlation with the unresolved rate, across the nine strata:")
print(corr.round(3).to_string())
print()

print("unresolved rate among damaged and undamaged strings:")
print((df.groupby("any_damage")["unresolved"].mean() * 100).round(3).to_string())
print()
print("relative risk:",
      round(df[df.any_damage].unresolved.mean() / df[~df.any_damage].unresolved.mean(), 2))
