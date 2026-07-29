"""
Emit output/numbers.tex. Every figure quoted in the manuscript is defined here
and nowhere else, so no number in the text is typed by hand.
"""

import os
import re

import pandas as pd

REPO = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot"
RAW = r"C:\Users\Dilet\Desktop\Scientometrics_Results"
DATA = os.path.join(REPO, "data", "longitudinal_dataset_N22479.xlsx")
OUT = os.path.join(REPO, "output", "numbers.tex")

COHORT = {
    "Arxiv_Bio_2016": "2016", "Arxiv_CS_2016": "2016", "NeurIPS_2016": "2016",
    "Arxiv_Bio_2023": "2023", "Arxiv_CS_2023": "2023", "NeurIPS_2023": "2023",
    "Arxiv_CS_2025": "2025", "NeurIPS_2025": "2025",
    "Arxiv_General_Latest": "2026",
}

df = pd.read_excel(DATA)
df["Cohort"] = df["Dataset"].map(COHORT)
df["pid"] = df["Dataset"] + "||" + df["Paper File"].astype(str)

macros = {}


def put(name, value):
    macros[name] = value


def n(x):
    return f"{int(x):,}".replace(",", "{,}")


def pc(x, d=2):
    return f"{x * 100:.{d}f}"


# corpus
put("Nrefs", n(len(df)))
put("Npapers", n(df["pid"].nunique()))
put("Nrefsperpaper", f"{len(df) / df['pid'].nunique():.1f}")
put("Ntruncated", n((df.groupby("pid").size() == 50).sum()))
put("Nflag", n((df.Status == "Not Found").sum()))
put("Nverified", n((df.Status == "Verified").sum()))
put("Flagrate", pc((df.Status == "Not Found").mean()))

for c in ["2016", "2023", "2025", "2026"]:
    s = df[df.Cohort == c]
    tag = {"2016": "Sixteen", "2023": "Twentythree", "2025": "Twentyfive", "2026": "Twentysix"}[c]
    put(f"Nrefs{tag}", n(len(s)))
    put(f"Npapers{tag}", n(s["pid"].nunique()))
    put(f"Nflag{tag}", n((s.Status == "Not Found").sum()))
    put(f"Flagrate{tag}", pc((s.Status == "Not Found").mean(), 3))

SLUG = {
    "Arxiv_Bio_2016": "QbioSixteen", "Arxiv_Bio_2023": "QbioTwentythree",
    "Arxiv_CS_2016": "CsSixteen", "Arxiv_CS_2023": "CsTwentythree",
    "Arxiv_CS_2025": "CsTwentyfive", "NeurIPS_2016": "NipsSixteen",
    "NeurIPS_2023": "NipsTwentythree", "NeurIPS_2025": "NipsTwentyfive",
    "Arxiv_General_Latest": "GenTwentysix",
}
for ds, slug in SLUG.items():
    s = df[df.Dataset == ds]
    put(f"Nrefs{slug}", n(len(s)))
    put(f"Npapers{slug}", n(s["pid"].nunique()))
    put(f"Nflag{slug}", n((s.Status == "Not Found").sum()))
    put(f"Flagrate{slug}", pc((s.Status == "Not Found").mean(), 3))

# match quality of the Verified label
mc = os.path.join(RAW, "verified_match_check.csv")
if os.path.exists(mc):
    m = pd.read_csv(mc)
    v = m["Match_Verdict"].value_counts()
    put("Nmatchcorrect", n(v.get("Correct match", 0)))
    put("Nmatchweak", n(v.get("Weak match", 0)))
    put("Nmatchwrong", n(v.get("Wrong record matched", 0)))
    put("Pcmatchcorrect", pc(v.get("Correct match", 0) / len(m)))
    put("Pcmatchweak", pc(v.get("Weak match", 0) / len(m)))
    put("Pcmatchwrong", pc(v.get("Wrong record matched", 0) / len(m)))
    by = m.groupby("Dataset")["Match_Verdict"].apply(lambda s: (s == "Correct match").mean())
    put("Pcmatchcorrectmin", pc(by.min(), 1))
    put("Pcmatchcorrectmax", pc(by.max(), 1))
    put("Matchcorrectminvenue", by.idxmin().replace("_", " "))
    put("Matchcorrectmaxvenue", by.idxmax().replace("_", " "))

# stage A
sa = os.path.join(RAW, "stage_a_flagged_307.csv")
if os.path.exists(sa):
    a = pd.read_csv(sa)
    s = a["StageA_Status"].value_counts()
    put("StageAn", n(len(a)))
    put("StageArecovered", n(s.get("Recovered", 0)))
    put("StageAfuzzy", n(s.get("Fuzzy", 0)))
    put("StageAunresolved", n(s.get("Unresolved", 0)))
    put("PcStageArecovered", pc(s.get("Recovered", 0) / len(a), 1))
    put("PcStageAfuzzy", pc(s.get("Fuzzy", 0) / len(a), 1))
    put("PcStageAunresolved", pc(s.get("Unresolved", 0) / len(a), 1))
    put("StageAcomplete", "yes" if len(a) == (df.Status == "Not Found").sum() else "no")

# significance tests quoted in Section 4
from scipy.stats import chi2_contingency, fisher_exact


def counts(mask):
    s = df[mask]
    return [int((s.Status == "Not Found").sum()), int((s.Status == "Verified").sum())]


def fmt_p(p):
    if p < 1e-14:
        return "p < 10^{-14}"
    if p < 0.001:
        e = int(f"{p:e}".split("e")[1])
        m = float(f"{p:e}".split("e")[0])
        return f"p = {m:.1f} \\times 10^{{{e}}}"
    return f"p = {p:.2f}"


def trend(masks, prefix):
    tab = [counts(m) for m in masks]
    chi2, p, dof, _ = chi2_contingency(tab)
    put(f"{prefix}chisq", f"{chi2:.2f}")
    put(f"{prefix}df", str(dof))
    put(f"{prefix}p", fmt_p(p))


trend([df.Cohort == c for c in ("2016", "2023", "2025")], "Cohorttrend")
trend([df.Dataset == d for d in ("Arxiv_CS_2016", "Arxiv_CS_2023", "Arxiv_CS_2025")], "Cstrend")

for a, b, prefix in [("Arxiv_Bio_2016", "Arxiv_Bio_2023", "Qbio"),
                     ("NeurIPS_2016", "NeurIPS_2023", "Nips")]:
    _, p = fisher_exact([counts(df.Dataset == a), counts(df.Dataset == b)])
    put(f"{prefix}p", fmt_p(p))

# stage B, classification of the residual
sb = os.path.join(RAW, "stage_b_residual.csv")
if os.path.exists(sb):
    b = pd.read_csv(sb)
    v = b.StageB_Verdict.value_counts()
    put("StageBn", n(len(b)))
    for k, tag in [("Segmentation failure", "seg"), ("Not a reference", "notref"),
                   ("Rule limitation", "rule"), ("Coverage limitation", "cov"),
                   ("Fabrication", "fab")]:
        put(f"StageB{tag}", n(v.get(k, 0)))
        put(f"PcStageB{tag}", pc(v.get(k, 0) / len(b), 1))
    put("StageBastro", n(len(b[(b.Dataset == "Arxiv_General_Latest") &
                               (b.StageB_Verdict == "Segmentation failure")])))
    put("StageBcomplete", "yes" if "Unclassified" not in set(b.StageB_Verdict) else "no")

# stage C, independent verification of the accepted sample
sc = os.path.join(RAW, "stage_c_accepted_sample.csv")
if os.path.exists(sc):
    c = pd.read_csv(sc)
    v = c.StageC_Status.value_counts()
    put("StageCn", n(len(c)))
    put("StageCconfirmed", n(v.get("Confirmed", 0)))
    put("StageCfuzzy", n(v.get("Fuzzy", 0)))
    put("StageCunresolved", n(v.get("Unresolved", 0)))
    put("PcStageCconfirmed", pc(v.get("Confirmed", 0) / len(c), 1))
    put("PcStageCfuzzy", pc(v.get("Fuzzy", 0) / len(c), 1))
    put("PcStageCunresolved", pc(v.get("Unresolved", 0) / len(c), 1))
    put("StageCcomplete", "yes" if len(c) == 200 else "no")

    sr = os.path.join(RAW, "stage_c_residual_resolved.csv")
    if os.path.exists(sr):
        rr = pd.read_csv(sr)
        w = rr.StageC_Verdict.value_counts()
        put("StageCrule", n(w.get("Rule limitation", 0)))
        put("StageCcov", n(w.get("Coverage limitation", 0)))
        put("StageCnotref", n(w.get("Not a reference", 0)))
        put("StageCunconf", n(w.get("Unconfirmed", 0)))
        put("StageCfab", n(w.get("Fabrication", 0)))

        # Clopper-Pearson upper bound, exact rather than the rule of three
        from scipy.stats import beta as _beta

        def upper(k, nn):
            return 100.0 if k == nn else _beta.ppf(0.95, k + 1, nn - k)* 100

        nfab = int(w.get("Fabrication", 0))
        nunc = int(w.get("Unconfirmed", 0))
        put("Boundfab", f"{upper(nfab, len(c)):.2f}")
        put("Boundconservative", f"{upper(nfab + nunc, len(c)):.2f}")

# extraction damage and preprint composition, the two candidate mechanisms
ed = os.path.join(RAW, "extraction_damage.csv")
if os.path.exists(ed):
    e = pd.read_csv(ed)
    e["unres"] = e.Status == "Not Found"
    for ds, slug in SLUG.items():
        s = e[e.Dataset == ds]
        put(f"Lig{slug}", pc(s.ligature.mean(), 2))
        put(f"Glue{slug}", pc(s.glued.mean(), 2))
    put("Damagerr", f"{e[e.any_damage].unres.mean() / e[~e.any_damage].unres.mean():.2f}")
    by = e.groupby("Dataset")[["ligature", "glued", "hyphenated", "any_damage", "unres"]].mean()
    for col, name in [("ligature", "Lig"), ("glued", "Glue"), ("any_damage", "Damage")]:
        put(f"Rho{name}", f"{by[col].corr(by['unres'], method='spearman'):+.3f}")

    s = e["Original Reference"].astype(str)
    e["preprint"] = s.str.contains(r"arXiv|bioRxiv|medRxiv|preprint|OpenReview|CoRR",
                                   case=False, regex=True)
    put("Preprintrr", f"{e[e.preprint].unres.mean() / e[~e.preprint].unres.mean():.2f}")
    for ds, slug in [("Arxiv_CS_2016", "CsSixteen"), ("Arxiv_CS_2023", "CsTwentythree"),
                     ("Arxiv_CS_2025", "CsTwentyfive")]:
        s2 = e[(e.Dataset == ds) & (~e.preprint)]
        put(f"Nonpreprintrate{slug}", pc(s2.unres.mean(), 2))
        put(f"Preprintshare{slug}", pc(e[e.Dataset == ds].preprint.mean(), 1))

# benchmark
bd = os.path.join(RAW, "BENCHMARK_DATASET.xlsx")
np_ = os.path.join(RAW, "naive_predictions.csv")
cp = os.path.join(RAW, "checkifexist_predictions.csv")
if all(os.path.exists(p) for p in (bd, np_, cp)):
    b = pd.read_excel(bd).reset_index(drop=True)
    b["naive"] = pd.read_csv(np_)["Naive_Flag"].values
    b["cie"] = (pd.read_csv(cp)["Status"].values == "Not Found").astype(int)
    pos = b.Category.str.startswith("Ground Truth")
    put("Nbench", n(len(b)))
    put("Nbenchgroup", n(b.Category.value_counts().iloc[0]))
    for tag, col in [("Naive", "naive"), ("Cie", "cie")]:
        TP = b.loc[pos, col].sum(); FN = pos.sum() - TP
        FP = b.loc[~pos, col].sum(); TN = (~pos).sum() - FP
        P, R = TP / (TP + FP), TP / (TP + FN)
        put(f"{tag}prec", pc(P)); put(f"{tag}rec", pc(R))
        put(f"{tag}fone", pc(2 * P * R / (P + R)))
        put(f"{tag}fprintact", pc(b[b.Category == "True Negative (Clean)"][col].mean(), 1))
        put(f"{tag}fprstressed", pc(b[b.Category == "True Negative (Adversarial)"][col].mean(), 1))

lines = [
    "% Generated by code/make_numbers.py. Do not edit by hand.",
    "% Every quantity quoted in the manuscript is defined here.",
    "",
]
for k, v in macros.items():
    lines.append(f"\\newcommand{{\\{k}}}{{{v}}}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

len(macros)
