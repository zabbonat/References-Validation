"""
Numbers and tables of the evaluation, for output/.
    output/numbers_eval.tex       macros quoted in the text
    output/table_features.tex     feature prevalence by stratum
    output/table_independent.tex  independent test set
    output/table_constructed.tex  constructed set
Parts whose inputs do not exist yet are emitted as PENDING markers, which
code/check_manuscript.py refuses to pass.
"""

import gzip
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
REPO = HERE.parent
RES = HERE / "results"
OUT = REPO / "output"

macros = {}
PENDING = r"\pending{%s}"


def put(k, v):
    macros[k] = v


def pct(x, d=1):
    return f"{x * 100:.{d}f}"


def load(name):
    p = RES / f"{name}.jsonl"
    if not p.exists():
        return None
    return pd.DataFrame([json.loads(l) for l in open(p, encoding="utf-8")])


STRATA = [("Arxiv_Bio_2016", "arXiv \\textit{q-bio} 2016", "QbioSixteen"),
          ("Arxiv_Bio_2023", "arXiv \\textit{q-bio} 2023", "QbioTwentythree"),
          ("Arxiv_CS_2016", "arXiv \\textit{cs.AI} 2016", "CsSixteen"),
          ("Arxiv_CS_2023", "arXiv \\textit{cs.AI} 2023", "CsTwentythree"),
          ("Arxiv_CS_2025", "arXiv \\textit{cs.AI} 2025", "CsTwentyfive"),
          ("NeurIPS_2016", "NeurIPS 2016", "NipsSixteen"),
          ("NeurIPS_2023", "NeurIPS 2023", "NipsTwentythree"),
          ("NeurIPS_2025", "NeurIPS 2025", "NipsTwentyfive"),
          ("Arxiv_General_Latest", "arXiv general 2026", "Gen")]

# ---------------------------------------------------------------- features
feat = pd.read_csv(RES / "reference_features.csv")
by = feat.groupby("Dataset").mean(numeric_only=True)
cols = [("ligature", "Ligature", "Lig"), ("no_title", "No title", "NoTitle"),
        ("merged", "Merged", "Merged"), ("not_reference", "Not a ref.", "NotRef"),
        ("web_link", "Web link", "Web"), ("arxiv_id", "arXiv id", "Arxiv")]
lines = ["\\begin{tabular}{l" + "r" * (len(cols) + 1) + "}", "\\toprule",
         "\\textbf{Stratum} & " + " & ".join(f"\\textbf{{{c[1]}}}" for c in cols) + " & \\textbf{Strings} \\\\",
         "\\midrule"]
for ds, label, tag in STRATA:
    row = [pct(by.loc[ds, c], 1) for c, _, _ in cols]
    n = int((feat.Dataset == ds).sum())
    lines.append(f"{label} & " + " & ".join(row) + f" & {n:,} \\\\".replace(",", "{,}"))
    for c, _, ctag in cols:
        put(f"Feat{ctag}{tag}", pct(by.loc[ds, c], 1))
allrow = [pct(feat[c].mean(), 1) for c, _, _ in cols]
lines += ["\\midrule", "All & " + " & ".join(allrow) + f" & {len(feat):,} \\\\".replace(",", "{,}"),
          "\\bottomrule", "\\end{tabular}"]
(OUT / "table_features.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
for c, _, ctag in cols:
    put(f"Feat{ctag}All", pct(feat[c].mean(), 1))

# ---------------------------------------------------------------- independent set
mayr = pd.read_csv(HERE / "external" / "badalova_mayr_2026" / "manual_reference_verification_dataset.csv",
                   encoding="cp850")
mayr["id"] = mayr.document_id + "-" + mayr.reference_number
prob = mayr.manual_label == "problematic"
put("IndN", str(len(mayr)))
put("IndDocs", str(mayr.document_id.nunique()))
put("IndProb", str(int(prob.sum())))
put("IndGen", str(int((~prob).sum())))
restor = pd.read_csv(HERE / "data" / "mayr_104_restorations.csv")
put("IndRestoredChars", str(int(restor.before.str.count(r"\?").sum())))
put("IndRestoredRefs", str(len(restor)))


def conf(flagged):
    tp = int((prob & flagged).sum()); fp = int((~prob & flagged).sum())
    return tp, fp


def rates(tp, fp):
    np_, ng = int(prob.sum()), int((~prob).sum())
    return pct(tp / np_), pct(fp / ng), (pct(tp / (tp + fp)) if tp + fp else "--")


rows_ind = []
published = [("checkifexist", "CheckIfExist (original)"), ("refchecker", "RefChecker"),
             ("hallucinator", "Hallucinator"), ("hallucitechecker", "HalluCiteChecker"), ("halref", "HalRef")]
for col, label in published:
    tp, fp = conf(mayr[col] == "flagged")
    rows_ind.append(("Published by the independent study", label, tp, fp))
    if col == "checkifexist":
        put("IndPubTP", str(tp)); put("IndPubFP", str(fp))
    if col == "refchecker":
        put("IndRCTP", str(tp)); put("IndRCFP", str(fp))
        d, f, p = rates(tp, fp); put("IndRCDet", d); put("IndRCFAR", f); put("IndRCPrec", p)


def ours(name):
    df = load(name)
    if df is None:
        return None
    d = mayr[["id"]].merge(df, on="id", how="left")
    return d.label.ne("Verified").values


runs = [("mayr_baseline_quick", "CheckIfExist original, single-reference path", "Base"),
        ("mayr_baseline_paste", "CheckIfExist original, pasted-bibliography path", "BasePaste"),
        ("mayr_revised_quick", "CheckIfExist revised, single-reference path", "Rev"),
        ("mayr_revised_paste", "CheckIfExist revised, pasted-bibliography path", "RevPaste")]
flags_by = {}
for name, label, tag in runs:
    fl = ours(name)
    if fl is None:
        continue
    flags_by[tag] = fl
    tp, fp = conf(pd.Series(fl))
    rows_ind.append(("This study", label, tp, fp))
    put(f"Ind{tag}TP", str(tp)); put(f"Ind{tag}FP", str(fp))
    d, f, p = rates(tp, fp); put(f"Ind{tag}Det", d); put(f"Ind{tag}FAR", f); put(f"Ind{tag}Prec", p)

pubflag = (mayr.checkifexist == "flagged").values
if "Base" in flags_by:
    put("IndAgreeQuick", pct((flags_by["Base"] == pubflag).mean()))
if "BasePaste" in flags_by:
    put("IndAgreePaste", pct((flags_by["BasePaste"] == pubflag).mean()))
if "Base" in flags_by and "Rev" in flags_by:
    b = int(macros["IndBaseFP"]); r = int(macros["IndRevFP"])
    put("IndFPDrop", f"{(b - r) / b * 100:.0f}")
frozen = ours("mayr_revised_quick_b404b90")
if frozen is not None:
    put("IndFrozenFP", str(conf(pd.Series(frozen))[1]))

lines = ["\\begin{tabular}{lrrrrr}", "\\toprule",
         "& \\multicolumn{2}{c}{\\textbf{Flagged}} & & & \\\\",
         "\\cmidrule(lr){2-3}",
         "\\textbf{Tool} & \\textbf{Problematic} & \\textbf{Genuine} & \\textbf{Detection} & \\textbf{False alarms} & \\textbf{Precision} \\\\",
         "\\midrule"]
block = None
for blk, label, tp, fp in rows_ind:
    if blk != block:
        if block is not None:
            lines.append("\\midrule")
        lines.append(f"\\multicolumn{{6}}{{l}}{{\\textit{{{blk}}}}} \\\\")
        block = blk
    d, f, p = rates(tp, fp)
    lines.append(f"\\quad {label} & {tp} & {fp} & {d}\\% & {f}\\% & {p}\\% \\\\")
lines += ["\\bottomrule", "\\end{tabular}"]
(OUT / "table_independent.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")

# Semantic Scholar availability over every request stored during the evaluation
s2 = []
for f in (HERE / "cache").rglob("*.json.gz"):
    rec = json.loads(gzip.open(f).read().decode("utf-8"))
    if "semanticscholar" in rec["url"]:
        s2.append(rec["status"] == 200)
put("STwoAnswered", pct(sum(s2) / len(s2), 0) if s2 else PENDING % "S2 availability")
put("STwoRequests", f"{len(s2):,}".replace(",", "{,}"))

# ---------------------------------------------------------------- constructed set
con = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "constructed_400.jsonl", encoding="utf-8")])
put("ConN", str(len(con)))
put("ConGen", str(int((con.kind == "genuine").sum())))
put("ConAlt", str(int((con.kind != "genuine").sum())))
put("ConKindN", str(int((con.kind == "invented").sum())))
KINDS = [("genuine", "Genuine (false alarms)"), ("invented", "Invented work"), ("extended", "Extended title"),
         ("swapped", "Swapped authors"), ("altered", "Altered year and venue")]
con_runs = [("constructed_baseline_paste", "Original", "Base"), ("constructed_revised_paste", "Revised", "Rev")]
have = {}
for name, label, tag in con_runs:
    df = load(name)
    if df is None or len(df) < len(con):
        continue
    d = con.merge(df[["id", "label"]], on="id")
    d["flag"] = d.label != "Verified"
    have[tag] = d
    put(f"ConFAR{tag}", pct(d[d.kind == "genuine"].flag.mean()))
    put(f"ConDet{tag}", pct(d[d.kind != "genuine"].flag.mean()))
    for k, _ in KINDS[1:]:
        put(f"ConDet{tag}{k.capitalize()}", pct(d[d.kind == k].flag.mean()))
    alt = d[d.kind != "genuine"]
    put(f"ConDet{tag}DOI", pct(alt[alt.has_doi].flag.mean()))
    put(f"ConDet{tag}NoDOI", pct(alt[~alt.has_doi].flag.mean()))
    put(f"ConVerified{tag}", str(int((alt.label == "Verified").sum())))
for tag in ["Base", "Rev"]:
    if tag not in have:
        for k in ["ConFAR", "ConDet"]:
            put(f"{k}{tag}", PENDING % "constructed set")

if have:
    lines = ["\\begin{tabular}{l" + "r" * len(have) + "}", "\\toprule",
             "\\textbf{Kind} & " + " & ".join(f"\\textbf{{{l}}}" for n, l, t in con_runs if t in have) + " \\\\",
             "\\midrule"]
    for k, label in KINDS:
        vals = [pct(have[t][have[t].kind == k].flag.mean()) + "\\%" for n, l, t in con_runs if t in have]
        lines.append(f"{label} & " + " & ".join(vals) + " \\\\")
        if k == "genuine":
            lines.append("\\midrule")
    vals = [pct(have[t][have[t].kind != "genuine"].flag.mean()) + "\\%" for n, l, t in con_runs if t in have]
    lines += ["\\midrule", "All altered & " + " & ".join(vals) + " \\\\", "\\bottomrule", "\\end{tabular}"]
    (OUT / "table_constructed.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
else:
    (OUT / "table_constructed.tex").write_text(PENDING % "constructed-set table" + "\n", encoding="utf-8")

# ---------------------------------------------------------------- manuscripts
corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
put("CorpMss", str(corp.paper.nunique()))
put("CorpRefs", str(len(corp)))
per_ms = {}
for name, tag in [("corpus_baseline_raw", "Base"), ("corpus_revised_raw", "Rev")]:
    df = load(name)
    if df is None or len(df) < len(corp):
        put(f"CorpFlagMean{tag}", PENDING % "manuscripts")
        continue
    d = corp.merge(df[["id", "label"]], on="id")
    d["flag"] = d.label != "Verified"
    per = d.groupby("paper").flag.sum()
    per_ms[tag] = per
    put(f"CorpFlagMean{tag}", f"{per.mean():.1f}")
    put(f"CorpFlagMed{tag}", f"{per.median():.0f}")
    put(f"CorpFlagMax{tag}", f"{per.max():.0f}")
    put(f"CorpClean{tag}", pct((per == 0).mean(), 0))
    put(f"CorpFlagRate{tag}", pct(d.flag.mean()))
    put(f"CorpRefsPerMs", f"{d.groupby('paper').size().mean():.1f}")
    flagged = d[d.flag]
    for lab, key in [("Extraction problem", "Extraction"), ("Web resource", "Web"),
                     ("Not Found", "NotFound"), ("Partial Match", "Partial"), ("Mismatch", "Mismatch")]:
        put(f"Corp{tag}Share{key}", pct((flagged.label == lab).mean() if len(flagged) else 0, 0))

# A referee reading a manuscript that contains one fabricated reference sees the
# flags on its genuine references plus, with probability p, the fabrication.
# p comes from the constructed set, over the three kinds that are fabrications.
if per_ms.keys() == {"Base", "Rev"} and have.keys() == {"Base", "Rev"}:
    for tag in ["Base", "Rev"]:
        c = have[tag]
        p = c[c.kind.isin(["invented", "extended", "swapped"])].flag.mean()
        noise = per_ms[tag]
        put(f"PlantDet{tag}", pct(p, 0))
        put(f"PlantNoise{tag}", f"{noise.mean():.1f}")
        # expected share of the flags that is the fabrication, averaged over manuscripts
        put(f"PlantShare{tag}", pct((p / (noise + p)).mean(), 0))
else:
    for tag in ["Base", "Rev"]:
        put(f"PlantDet{tag}", PENDING % "planted fabrication")
        put(f"PlantShare{tag}", PENDING % "planted fabrication")

# ---------------------------------------------------------------- write
text = ["% Generated by eval/make_paper_numbers.py. Do not edit by hand.", ""]
text += [f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in macros.items()]
(OUT / "numbers_eval.tex").write_text("\n".join(text) + "\n", encoding="utf-8")
print(f"{len(macros)} macros; pending: {sum('pending' in str(v) for v in macros.values())}")
