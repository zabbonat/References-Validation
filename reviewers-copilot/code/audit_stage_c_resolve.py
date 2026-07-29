"""
Individual resolution of the stage C residual.

Every accepted reference that the agreement rule could not confirm against any
source is resolved here by hand, and the identifier backing each verdict is
recorded so that the verdict can be rechecked without repeating the search.

Two strings could not be pinned to an exact record. They are reported as
unconfirmed rather than as fabrications, since related work by the same author
groups was located and neither string carries the signature of a fabricated
reference.
"""

import sys

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

IN = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_c_accepted_sample.csv"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_c_residual_resolved.csv"

# keyed on a distinctive fragment of the reference string
EVIDENCE = [
    ("Pecora", "Rule limitation",
     "Pecora and Carroll, Synchronization in chaotic systems, Phys. Rev. Lett. 64, 821 "
     "(1990), doi:10.1103/physrevlett.64.821. String concatenated with a figure caption"),
    ("Karumbaiah", "Rule limitation",
     "Karumbaiah, Borchers, Shou, Falhs et al., LNCS 2023, doi:10.1007/978-3-031-36272-9_37"),
    ("Gorgolewski", "Rule limitation",
     "Gorgolewski et al., Nipype, Frontiers in Neuroinformatics 5:13 (2011), "
     "doi:10.3389/fninf.2011.00013. Long author list defeats the rule"),
    ("Dreambench", "Rule limitation",
     "Peng, Cui, Tang, Qi, Dong et al., DreamBench++, arXiv:2406.16855"),
    ("Ozfish", "Coverage limitation",
     "OzFish dataset, Australian Institute of Marine Science. Research dataset, indexed "
     "by none of the four sources"),
    ("Target posterior inf", "Not a reference", "Table fragment, no bibliographic content"),
    ("Tangent Prop", "Coverage limitation",
     "Simard, Victorri, LeCun and Denker, Tangent Prop, NIPS 1991. The 1991 NIPS "
     "proceedings are poorly indexed; Crossref returns the related 1998 LNCS chapter "
     "doi:10.1007/3-540-49430-8_13 instead"),
    ("BrainHood", "Rule limitation",
     "Tsiakas, Barakova, Khan and Markopoulos, BrainHood, ACM PETRA 2020, "
     "doi:10.1145/3389189.3398004"),
    ("Touvron", "Rule limitation",
     "Touvron, Martin, Stone, Albert et al., Llama 2, arXiv:2307.09288. Long author list"),
    ("Dreicer", "Rule limitation",
     "Dreicer, Electron and Ion Runaway in a Fully Ionized Gas I, Phys. Rev. 115, 238 "
     "(1959), doi:10.1103/physrev.115.238"),
    ("Lyons B. C.", "Unconfirmed",
     "Physics of Plasmas 30 (2023) 092510, Lyons, McClenaghan, Slendebroek et al. Work by "
     "the same author group in the same journal and year was located "
     "(doi:10.1063/5.0148886) but the exact article number was not pinned"),
    ("Laksumanage", "Coverage limitation",
     "Adams and Laksumanage, Building Successful Student Teams in the Engineering "
     "Classroom, Journal of STEM Education 4(3-4), 2003. Confirmed via Semantic Scholar; "
     "the journal is not indexed in Crossref"),
    ("Tworek", "Rule limitation",
     "Chen, Tworek, Jun, Yuan et al., Evaluating Large Language Models Trained on Code, "
     "arXiv:2107.03374. Long author list"),
    ("1505.04597", "Rule limitation",
     "Ronneberger, Fischer and Brox, U-Net, arXiv:1505.04597. The string is a bare URL "
     "carrying no title or author for the rule to compare"),
    ("Reuters", "Coverage limitation",
     "News report, reuters.com, April 2013. Web resource with no persistent bibliographic record"),
    ("Ghadimi", "Rule limitation",
     "Ghadimi and Wang, Approximation Methods for Bilevel Programming, arXiv:1802.02246"),
    ("Anindo Saha", "Unconfirmed",
     "Saha, Bosma, Twilt, van Ginneken, Bjartell, Padhani, Bonekamp et al. The PI-CAI "
     "author group is confirmed active and related work was located "
     "(doi:10.1016/S1470-2045(24)00220-1 and others) but the exact record was not pinned"),
]

df = pd.read_csv(IN)
res = df[df.StageC_Status == "Unresolved"].copy().reset_index(drop=True)

verdicts, evidence = [], []
for _, r in res.iterrows():
    s = str(r["Original Reference"])
    hit = next(((v, e) for frag, v, e in EVIDENCE if frag.lower() in s.lower()), None)
    verdicts.append(hit[0] if hit else "Unclassified")
    evidence.append(hit[1] if hit else "requires individual resolution")

res["StageC_Verdict"] = verdicts
res["StageC_Evidence"] = evidence
res[["ID", "Dataset", "Original Reference", "StageC_Verdict", "StageC_Evidence"]].to_csv(
    OUT, index=False, encoding="utf-8")

print(res.StageC_Verdict.value_counts().to_string())
print()
unc = res[res.StageC_Verdict == "Unclassified"]
for _, r in unc.iterrows():
    print("UNCLASSIFIED:", str(r["Original Reference"])[:120])
print()
print(f"fabrications identified in the accepted sample: "
      f"{(res.StageC_Verdict == 'Fabrication').sum()}")
print(f"strings not pinned to an exact record: {(res.StageC_Verdict == 'Unconfirmed').sum()}")
