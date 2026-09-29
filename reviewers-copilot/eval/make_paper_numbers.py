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
# features identified in the evaluation on manuscripts, reported in the text
for c, ctag in [("hyphenation", "Hyphen"), ("detached_accent", "Accent")]:
    put(f"Feat{ctag}All", pct(feat[c].mean(), 1))
    put(f"Feat{ctag}Min", pct(by[c].min(), 1))
    put(f"Feat{ctag}Max", pct(by[c].max(), 1))

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


runs = [("mayr_baseline_quick", "Original, single reference", "Base"),
        ("mayr_baseline_paste", "Original, pasted bibliography", "BasePaste"),
        ("mayr_revised_quick", "Revised, single reference", "Rev"),
        ("mayr_revised_paste", "Revised, pasted bibliography", "RevPaste")]
flags_by = {}
for name, label, tag in runs:
    fl = ours(name)
    if fl is None:
        continue
    flags_by[tag] = fl
    tp, fp = conf(pd.Series(fl))
    rows_ind.append(("CheckIfExist run in this study", label, tp, fp))
    put(f"Ind{tag}TP", str(tp)); put(f"Ind{tag}FP", str(fp))
    d, f, p = rates(tp, fp); put(f"Ind{tag}Det", d); put(f"Ind{tag}FAR", f); put(f"Ind{tag}Prec", p)

pubflag = (mayr.checkifexist == "flagged").values
if "Base" in flags_by:
    put("IndAgreeQuick", pct((flags_by["Base"] == pubflag).mean()))
    dis = flags_by["Base"] != pubflag
    put("IndDisQuick", str(int(dis.sum())))
    put("IndDisQuickGen", str(int((dis & ~prob.values).sum())))
if "BasePaste" in flags_by:
    put("IndAgreePaste", pct((flags_by["BasePaste"] == pubflag).mean()))
if "Base" in flags_by and "Rev" in flags_by:
    b = int(macros["IndBaseFP"]); r = int(macros["IndRevFP"])
    put("IndFPDrop", f"{(b - r) / b * 100:.0f}")
frozen = ours("mayr_revised_quick_b404b90")
if frozen is not None:
    tp_, fp_ = conf(pd.Series(frozen))
    put("IndFrozenTP", str(tp_)); put("IndFrozenFP", str(fp_))
    if "Rev" in flags_by:
        ch = mayr.loc[frozen != flags_by["Rev"], ["id", "manual_label"]].assign(
            frozen=frozen[frozen != flags_by["Rev"]], final=flags_by["Rev"][frozen != flags_by["Rev"]])
        print("independent, frozen vs final:", ch.to_dict("records"))

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

# availability of each source over every request stored during the evaluation.
# A request counts as answered when the source returned data (JSON or XML) or a
# definite "not found" (404); a bot-verification page, an error status or no
# answer at all does not count.
import urllib.parse
HOSTS = {"api.semanticscholar.org": "STwo", "api.openalex.org": "OA", "api.crossref.org": "CR",
         "export.arxiv.org": "AX", "dblp.org": "DBLP"}
seen = {t: [] for t in HOSTS.values()}
s2_rejected, s2_papers, dblp_bot = 0, 0, 0
for f in (HERE / "cache").rglob("*.json.gz"):
    rec = json.loads(gzip.open(f).read().decode("utf-8"))
    tag = HOSTS.get(urllib.parse.urlparse(rec["url"]).hostname)
    if tag is None:
        continue
    body = rec["body"] if isinstance(rec["body"], str) else json.dumps(rec["body"])
    b = body.lstrip()
    data = rec["status"] == 200 and (b[:1] in "{[" or b.startswith("<?xml") or b.startswith("<feed"))
    seen[tag].append(data or rec["status"] == 404)
    if tag == "STwo" and rec["status"] == 400 and "unsupported fields" in body:
        s2_rejected += 1
    if tag == "STwo" and data and json.loads(body).get("data"):
        s2_papers += 1
    if tag == "DBLP" and "not a bot" in body:
        dblp_bot += 1
for tag, v in seen.items():
    put(f"{tag}Answered", pct(sum(v) / len(v), 0) if v else PENDING % f"{tag} availability")
    put(f"{tag}Requests", f"{len(v):,}".replace(",", "{,}"))
put("STwoRejected", str(s2_rejected))
put("STwoPapers", str(s2_papers))
put("DBLPBot", f"{dblp_bot:,}".replace(",", "{,}"))

# ---------------------------------------------------------------- constructed set
con = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "constructed_400.jsonl", encoding="utf-8")])
put("ConN", str(len(con)))
put("ConGen", str(int((con.kind == "genuine").sum())))
put("ConAlt", str(int((con.kind != "genuine").sum())))
put("ConKindN", str(int((con.kind == "invented").sum())))
KINDS = [("genuine", "Genuine (false alarms)"), ("invented", "Invented work"), ("extended", "Extended title"),
         ("swapped", "Swapped authors"), ("altered", "Altered year and venue")]
# The revised column is the version evaluated blind (c5dc047); the final
# version (with the correction found in this evaluation) and the same-input
# BibTeX run are reported separately in the text.
con_runs = [("constructed_baseline_paste", "Original", "Base"),
            ("constructed_revised_paste_c5dc047", "Revised", "Rev"),
            ("constructed_revised_paste", "Revised, final", "RevFinal"),
            ("constructed_revised_bibtex", "Revised, BibTeX", "RevBib"),
            ("constructed_baseline_bibtex", "Original, BibTeX", "BaseBib")]
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

# RefChecker on the same BibTeX. It drops entries whose title repeats an
# earlier one, so the 100 altered entries that keep their genuine title
# (swapped authors, altered metadata) were run in a second, separate file.
# Each problem it reports is an error, a warning or an item of information;
# a reference counts as flagged if it has an error, a warning or a
# hallucination assessment ("lenient", the definition of Badalova and Mayr),
# or only if it has an error or an assessment ("strict").
RC = HERE / "refchecker_runs"


def refchecker_flags(path):
    out = {}
    d = json.load(open(path, encoding="utf-8"))
    for r in d["records"]:
        key = (r.get("original_reference") or {}).get("bibtex_key")
        items = r.get("_original_errors") or []
        err = any("error_type" in e for e in items) or bool(r.get("hallucination_assessment"))
        warn = any("warning_type" in e for e in items)
        out[key] = (err, err or warn)
    return out, d["summary"]["total_references_processed"]


rc_files = [RC / "constructed_400.json", RC / "constructed_100_same_title.json"]
if all(p.exists() for p in rc_files):
    f1, n1 = refchecker_flags(rc_files[0])
    f2, n2 = refchecker_flags(rc_files[1])
    first_run = set(con[~con.kind.isin(["swapped", "altered"]) | (con.kind == "genuine")].id)
    rc = []
    for _, r in con.iterrows():
        src = f1 if (r.kind not in ("swapped", "altered")) else f2
        strict, lenient = src.get(r.id, (False, False))
        rc.append({"id": r.id, "kind": r.kind, "strict": strict, "lenient": lenient})
    rc = pd.DataFrame(rc)
    # what RefChecker reports on the genuine references it flags: only warnings
    # on year or venue, or something else
    yv, other = 0, 0
    for r in json.load(open(rc_files[0], encoding="utf-8"))["records"]:
        key = (r.get("original_reference") or {}).get("bibtex_key")
        if key not in set(con[con.kind == "genuine"].id):
            continue
        kinds = {("e:" + e["error_type"]) if "error_type" in e else ("w:" + e["warning_type"])
                 for e in (r.get("_original_errors") or []) if "error_type" in e or "warning_type" in e}
        if r.get("hallucination_assessment"):
            kinds.add("hallucination")
        if kinds:
            if kinds <= {"w:year", "w:venue"}:
                yv += 1
            else:
                other += 1
    put("RCGenYearVenue", str(yv))
    put("RCGenFlagged", str(yv + other))
    put("RCProcessedFirst", str(n1))
    put("RCProcessedSecond", str(n2))
    for col, tag in [("lenient", "RC"), ("strict", "RCStrict")]:
        put(f"ConFAR{tag}", pct(rc[rc.kind == "genuine"][col].mean()))
        put(f"ConDet{tag}", pct(rc[rc.kind != "genuine"][col].mean()))
        for k, _ in KINDS[1:]:
            put(f"ConDet{tag}{k.capitalize()}", pct(rc[rc.kind == k][col].mean()))
    have_rc = rc
else:
    have_rc = None
    put("ConFARRC", PENDING % "RefChecker"); put("ConDetRC", PENDING % "RefChecker")

# table: CheckIfExist original and revised (blind) on APA strings, RefChecker
# on the same references in BibTeX, lenient and strict
cols_t = [(t, l) for n, l, t in con_runs if t in ("Base", "Rev") and t in have]
if cols_t and have_rc is not None:
    head = ["\\multicolumn{" + str(len(cols_t)) + "}{c}{\\textbf{CheckIfExist}}",
            "\\multicolumn{2}{c}{\\textbf{RefChecker}}"]
    lines = ["\\begin{tabular}{l" + "r" * (len(cols_t) + 2) + "}", "\\toprule",
             " & " + " & ".join(head) + " \\\\",
             f"\\cmidrule(lr){{2-{1 + len(cols_t)}}} \\cmidrule(lr){{{2 + len(cols_t)}-{3 + len(cols_t)}}}",
             "\\textbf{Kind} & " + " & ".join(f"\\textbf{{{l}}}" for t, l in cols_t)
             + " & \\textbf{Errors, warnings} & \\textbf{Errors} \\\\",
             "\\midrule"]

    def cell(df, sel, col):
        return pct(df[sel(df)][col].mean()) + "\\%"

    for k, label in KINDS:
        vals = [cell(have[t], lambda x: x.kind == k, "flag") for t, _ in cols_t]
        vals += [cell(have_rc, lambda x: x.kind == k, c) for c in ("lenient", "strict")]
        lines.append(f"{label} & " + " & ".join(vals) + " \\\\")
        if k == "genuine":
            lines.append("\\midrule")
    vals = [cell(have[t], lambda x: x.kind != "genuine", "flag") for t, _ in cols_t]
    vals += [cell(have_rc, lambda x: x.kind != "genuine", c) for c in ("lenient", "strict")]
    lines += ["\\midrule", "All altered & " + " & ".join(vals) + " \\\\", "\\bottomrule", "\\end{tabular}"]
    (OUT / "table_constructed.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
else:
    (OUT / "table_constructed.tex").write_text(PENDING % "constructed-set table" + "\n", encoding="utf-8")

# corrections made after this set was evaluated: references they change
if "Rev" in have and "RevFinal" in have:
    m = have["Rev"][["id", "kind", "flag"]].merge(have["RevFinal"][["id", "flag"]], on="id", suffixes=("_b", "_f"))
    ch = m[m.flag_b != m.flag_f]
    put("ConFinalChanged", str(len(ch)))
    put("ConFinalGained", str(int((ch.flag_f & (ch.kind != "genuine")).sum())))
    put("ConFinalLost", str(int((~ch.flag_f & (ch.kind != "genuine")).sum())))
    put("ConFinalGenuine", str(int((ch.kind == "genuine").sum())))
    print("constructed, blind vs final:", ch[["id", "kind", "flag_b", "flag_f"]].to_dict("records"))

# ---------------------------------------------------------------- source availability
AVAIL = [("mayr_baseline_quick", "Ind"), ("constructed_baseline_paste", "Con"), ("corpus_baseline_raw", "Corp")]
for name, tag in AVAIL:
    df = load(name)
    if df is None:
        continue
    for host, htag in [("api.openalex.org", "OA"), ("api.semanticscholar.org", "STwo"), ("dblp.org", "DBLP")]:
        put(f"{tag}Fail{htag}", pct(df.failedRequests.apply(lambda l: host in l).mean(), 0))

# the table is written after the RefChecker results are read, below

# ---------------------------------------------------------------- manuscripts
# Reference strings of 27 manuscripts as the corpus pipeline extracted them: at
# most the first fifty per paper, each cut at 500 characters. Rates are pooled
# over strings and expressed per fifty references.
corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
put("CorpMss", str(corp.paper.nunique()))
put("CorpRefs", str(len(corp)))
size = corp.groupby("paper").size()
put("CorpCapped", str(int((size == 50).sum())))
put("CorpFew", str(int((size <= 5).sum())))
SCRUTINY = ["Not Found", "Partial Match", "Mismatch"]
LIMITS = ["Extraction problem", "Web resource"]
corp_runs = [("corpus_baseline_raw", "Base"), ("corpus_revised_raw_e5f4c90", "RevBlind"), ("corpus_revised_raw", "Rev")]
cl = {}
for name, tag in corp_runs:
    df = load(name)
    if df is None or len(df) < len(corp):
        for k in ["Flag", "Scrut", "Limit"]:
            put(f"Corp{k}Fifty{tag}", PENDING % "manuscripts")
        continue
    d = corp.merge(df[["id", "label", "issues", "reason"]], on="id")
    cl[tag] = d
    for k, sel in [("Flag", d.label != "Verified"), ("Scrut", d.label.isin(SCRUTINY)), ("Limit", d.label.isin(LIMITS))]:
        put(f"Corp{k}N{tag}", str(int(sel.sum())))
        put(f"Corp{k}Rate{tag}", pct(sel.mean()))
        put(f"Corp{k}Fifty{tag}", f"{50 * sel.mean():.1f}")
    for lab, key in [("Not Found", "NotFound"), ("Partial Match", "Partial"), ("Mismatch", "Mismatch"),
                     ("Extraction problem", "Extraction"), ("Web resource", "Web")]:
        put(f"Corp{key}N{tag}", str(int((d.label == lab).sum())))

# fall in the flags that present a reference as possibly wrong, against the original
for tag in ["RevBlind", "Rev"]:
    if {"Base", tag} <= cl.keys():
        b_ = cl["Base"].label.isin(SCRUTINY).mean()
        put(f"CorpScrutDrop{tag}", f"{(b_ - cl[tag].label.isin(SCRUTINY).mean()) / b_ * 100:.0f}")

# references the blind version flagged although the original verified them, and
# how many of these the final version verifies after the corrections
if {"Base", "RevBlind", "Rev"} <= cl.keys():
    m = (cl["Base"][["id", "label"]].merge(cl["RevBlind"][["id", "label"]], on="id", suffixes=("_b", "_x"))
         .merge(cl["Rev"][["id", "label"]].rename(columns={"label": "label_f"}), on="id"))
    newb = m[(m.label_b == "Verified") & (m.label_x != "Verified")]
    put("CorpNewFlagsBlind", str(len(newb)))
    put("CorpNewFlagsBlindCleared", str(int((newb.label_f == "Verified").sum())))

# how the final revision changes the verdict on each string, against the original
if {"Base", "Rev"} <= cl.keys():
    m = cl["Base"][["id", "label"]].merge(cl["Rev"][["id", "label"]], on="id", suffixes=("_b", "_r"))
    put("CorpCleared", str(int(((m.label_b != "Verified") & (m.label_r == "Verified")).sum())))
    put("CorpNewFlags", str(int(((m.label_b == "Verified") & (m.label_r != "Verified")).sum())))
    put("CorpRelabeled", str(int((m.label_b.isin(SCRUTINY) & m.label_r.isin(LIMITS)).sum())))
    put("CorpStillFlagged", str(int((m.label_b.isin(SCRUTINY) & m.label_r.isin(SCRUTINY)).sum())))

# ---------------------------------------------------------------- planted fabrications
# Fabrications written in the style of the manuscripts (build_planted.py). A
# referee reading a bibliography of fifty references, one of them fabricated,
# sees the scrutiny flags raised by the other forty-nine and, with the detection
# probability, the fabrication; the share of those flags that is the
# fabrication is what the check contributes to finding it.
pl = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "planted_manuscripts.jsonl", encoding="utf-8")])
put("PlantN", str(len(pl)))
put("PlantMss", str(pl.paper.nunique()))
put("PlantKindMin", str(int(pl.kind.value_counts().min())))
put("PlantKindMax", str(int(pl.kind.value_counts().max())))
plant = {}
for name, tag in [("planted_baseline_raw", "Base"), ("planted_revised_raw", "Rev")]:
    df = load(name)
    if df is None or len(df) < len(pl):
        put(f"PlantDet{tag}", PENDING % "planted fabrications")
        put(f"PlantShare{tag}", PENDING % "planted fabrications")
        continue
    d = pl.merge(df[["id", "label", "issues"]], on="id")
    d["flag"] = d.label != "Verified"
    plant[tag] = d
    p = d.flag.mean()
    p_s = d.label.isin(SCRUTINY).mean()          # flagged as possibly wrong
    put(f"PlantDet{tag}", pct(p))
    put(f"PlantDetScrut{tag}", pct(p_s))
    for k in ["invented", "extended", "swapped"]:
        put(f"PlantDet{tag}{k.capitalize()}", pct(d[d.kind == k].flag.mean()))
    if tag in cl:
        noise_s = 49 * cl[tag].label.isin(SCRUTINY).mean()
        noise = 49 * (cl[tag].label != "Verified").mean()
        put(f"PlantNoise{tag}", f"{noise_s:.1f}")
        put(f"PlantNoiseAll{tag}", f"{noise:.1f}")
        put(f"PlantShare{tag}", pct(p_s / (noise_s + p_s), 0))
        put(f"PlantShareAll{tag}", pct(p / (noise + p), 0))

# ---------------------------------------------------------------- verified by hand
# 1. every reference the original verified and the final version flags, with
#    the record each version selected, classified by hand
aud = HERE / "data" / "manuscript_changes_audit.csv"
if aud.exists():
    a = pd.read_csv(aud, dtype=str).fillna("")
    assert (a["class"] != "").all(), "unclassified rows in manuscript_changes_audit.csv"
    put("ChangesN", str(len(a)))
    for c, tag in [("another work", "Other"), ("another version", "Version"), ("extraction damage", "Damage"),
                   ("not retrieved", "Lost"), ("false disagreement", "False")]:
        put(f"Changes{tag}", str(int((a["class"] == c).sum())))
else:
    put("ChangesN", PENDING % "classification of new flags")
# 1b. every reference the original flagged and the final version verifies,
#     checked against the record the final version selected
aud = HERE / "data" / "manuscript_cleared_audit.csv"
if aud.exists():
    a = pd.read_csv(aud, dtype=str).fillna("")
    put("ClearedN", str(len(a)))
    put("ClearedWrong", str(int((a.verdict == "another work").sum())))
    put("ClearedRight", str(int((a.verdict == "work cited").sum())))
else:
    put("ClearedN", PENDING % "check of newly verified references")
# 2. a random sample of the final version's flags that present a reference as
#    possibly wrong, each verified individually
smp = HERE / "data" / "manuscript_flags_audit.csv"
if smp.exists():
    a = pd.read_csv(smp, dtype=str).fillna("")
    assert (a.verdict != "").all(), "unverified rows in manuscript_flags_audit.csv"
    put("SampleN", str(len(a)))
    # correct citations: whether Crossref has a record of the work (any version)
    c = a[a.verdict == "correct"]
    put("SampleCorrectNoCrossref", str(int((c.crossref_record == "no").sum())))
    put("SampleCorrectCrossref", str(int((c.crossref_record == "yes").sum())))
    for c, tag in [("citation error", "Error"), ("correct", "Correct"), ("extraction damage", "Damage"),
                   ("unverifiable", "Unverifiable"), ("not a reference", "NotRef"), ("fabricated", "Fabricated")]:
        put(f"Sample{tag}", str(int((a.verdict == c).sum())))
else:
    put("SampleN", PENDING % "verified sample of flags")

# ---------------------------------------------------------------- paired tests
# The two versions are compared on the same references: exact McNemar tests on
# the discordant pairs, and Wilson intervals for the proportions.
import statsmodels.formula.api as smf
from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.proportion import proportion_confint


def pfmt(p):
    return "$p<0.001$" if p < 0.001 else f"$p={p:.2g}$"


def paired_test(a, b, tag):
    a, b = pd.Series(a).astype(bool).values, pd.Series(b).astype(bool).values
    table = [[int((a & b).sum()), int((a & ~b).sum())], [int((~a & b).sum()), int((~a & ~b).sum())]]
    p = mcnemar(table, exact=True).pvalue
    put(f"{tag}P", pfmt(p))
    put(f"{tag}Lost", str(table[0][1]))      # flagged by the original only
    put(f"{tag}Gained", str(table[1][0]))    # flagged by the revised version only
    for side, x in [("Base", a), ("Rev", b)]:
        lo, hi = proportion_confint(int(x.sum()), len(x), method="wilson")
        put(f"{tag}{side}Lo", pct(lo))
        put(f"{tag}{side}Hi", pct(hi))
    return p


if {"Base", "Rev"} <= flags_by.keys():
    paired_test(flags_by["Base"][prob.values], flags_by["Rev"][prob.values], "TestIndDet")
    paired_test(flags_by["Base"][~prob.values], flags_by["Rev"][~prob.values], "TestIndFAR")
if {"Base", "Rev"} <= have.keys():
    g = have["Base"].kind.eq("genuine").values
    paired_test(have["Base"].flag.values[~g], have["Rev"].flag.values[~g], "TestConDet")
    paired_test(have["Base"].flag.values[g], have["Rev"].flag.values[g], "TestConFAR")
if {"Base", "Rev"} <= plant.keys():
    paired_test(plant["Base"].flag, plant["Rev"].flag, "TestPlant")
    kind_p = [paired_test(plant["Base"].flag[plant["Base"].kind == k], plant["Rev"].flag[plant["Rev"].kind == k],
                          f"TestPlant{k.capitalize()}") for k in ["invented", "extended", "swapped"]]
    put("TestPlantKindMaxP", pfmt(max(kind_p)))

# Manuscripts: references are clustered in papers. The change in the share
# presented as possibly wrong is estimated with reference fixed effects on the
# two versions stacked, and standard errors clustered by manuscript.
for tag in ["RevBlind", "Rev"]:
    if not {"Base", tag} <= cl.keys():
        continue
    s = pd.concat([cl["Base"].assign(revised=0), cl[tag].assign(revised=1)], ignore_index=True)
    s["y"] = s.label.isin(SCRUTINY).astype(int)
    m = smf.ols("y ~ revised + C(id)", data=s).fit(cov_type="cluster", cov_kwds={"groups": s.paper})
    lo, hi = m.conf_int().loc["revised"]
    put(f"CorpDiff{tag}", f"${m.params['revised'] * 100:+.1f}$")
    put(f"CorpDiff{tag}Lo", f"${lo * 100:+.1f}$")
    put(f"CorpDiff{tag}Hi", f"${hi * 100:+.1f}$")
    put(f"CorpDiff{tag}P", pfmt(m.pvalues["revised"]))

# ---------------------------------------------------------------- regression on the manuscripts
# Probability that a reference string of the manuscripts is presented as
# possibly wrong, on the features of Table 2 (computed for every string of the
# corpus by eval/reference_features.py, joined here by row), with stratum fixed
# effects and standard errors clustered by manuscript. A linear probability
# model: under the revised tool some features predict the outcome perfectly,
# which rules out a logit.
REG = [("ligature", "Ligature", "Lig"), ("hyphenation", "Word broken across lines", "Hyphen"),
       ("detached_accent", "Accent apart from its letter", "Accent"), ("no_title", "No title", "NoTitle"),
       ("merged", "Merged entries", "Merged"), ("not_reference", "Not a reference", "NotRef"),
       ("web_link", "Web link", "Web"), ("arxiv_id", "arXiv identifier", "Arxiv"), ("doi", "DOI", "Doi")]
if {"Base", "RevBlind", "Rev"} <= cl.keys():
    rows = corp.id.str[1:].astype(int).values
    rd = feat.loc[rows, [c for c, _, _ in REG if c != "doi"]].reset_index(drop=True).astype(int)
    rd["doi"] = corp.ref.str.contains(r"10\.\d{4,9}/", regex=True).astype(int).values
    rd = pd.concat([corp[["id", "paper", "stratum"]].reset_index(drop=True), rd], axis=1)
    # the join by row is checked on a feature recomputed from the strings themselves
    again = corp.ref.str.contains(r"arXiv[:\s]*\d{4}\.\d{4,5}|arxiv\.org/abs/\d{4}\.\d{4,5}", regex=True, case=False)
    assert (again.astype(int).values == rd.arxiv_id.values).all(), "features not aligned with the manuscripts"
    rhs = " + ".join(c for c, _, _ in REG) + " + C(stratum)"
    fits = {}
    for tag in ["Base", "RevBlind", "Rev"]:
        d = rd.assign(y=rd.id.map(cl[tag].set_index("id").label.isin(SCRUTINY).astype(int)))
        fits[tag] = (smf.ols(f"y ~ {rhs}", data=d).fit(cov_type="cluster", cov_kwds={"groups": d.paper}), d)
        for c, _, ctag in REG:
            put(f"Reg{tag}{ctag}", f"{fits[tag][0].params[c] * 100:.1f}")
            put(f"Reg{tag}{ctag}Abs", f"{abs(fits[tag][0].params[c]) * 100:.1f}")
        put(f"Reg{tag}NoTitleRate", pct(d[d.no_title == 1].y.mean(), 0))
    # has the revision changed the effect of a feature? both versions stacked,
    # with the version interacted with every regressor
    for tag in ["RevBlind", "Rev"]:
        a, b = fits["Base"][1].assign(rev=0), fits[tag][1].assign(rev=1)
        s = pd.concat([a, b], ignore_index=True)
        inter = " + ".join(f"rev:{c}" for c, _, _ in REG)
        m = smf.ols(f"y ~ {rhs} + rev + {inter} + rev:C(stratum)", data=s).fit(
            cov_type="cluster", cov_kwds={"groups": s.paper})
        for c, _, ctag in REG:
            put(f"RegChange{tag}{ctag}", f"{abs(m.params['rev:' + c]) * 100:.1f}")
            put(f"RegChange{tag}{ctag}P", pfmt(m.pvalues["rev:" + c]))

    def cell(m, c):
        b, p = m.params[c] * 100, m.pvalues[c]
        stars = "^{***}" if p < 0.01 else "^{**}" if p < 0.05 else "^{*}" if p < 0.1 else ""
        return f"${b:.1f}{stars}$", f"$({m.bse[c] * 100:.1f})$"

    lines = ["\\begin{tabular}{lrrr}", "\\toprule",
             "& \\textbf{Original} & \\textbf{Revised, blind} & \\textbf{Revised, final} \\\\", "\\midrule"]
    for c, label, _ in REG:
        share = pct(rd[c].mean())
        cs = [cell(fits[t][0], c) for t in ["Base", "RevBlind", "Rev"]]
        lines.append(f"{label} ({share}\\%) & " + " & ".join(x[0] for x in cs) + " \\\\")
        lines.append(" & " + " & ".join(x[1] for x in cs) + " \\\\")
    lines += ["\\midrule",
              "Stratum fixed effects & yes & yes & yes \\\\",
              "Presented as possibly wrong & " + " & ".join(pct(fits[t][1].y.mean()) + "\\%" for t in ["Base", "RevBlind", "Rev"]) + " \\\\",
              "$R^2$ & " + " & ".join(f"{fits[t][0].rsquared:.2f}" for t in ["Base", "RevBlind", "Rev"]) + " \\\\",
              f"Strings (manuscripts) & \\multicolumn{{3}}{{c}}{{{len(rd)} ({rd.paper.nunique()})}} \\\\",
              "\\bottomrule", "\\end{tabular}"]
    (OUT / "table_regression.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")
else:
    (OUT / "table_regression.tex").write_text(PENDING % "regression table" + "\n", encoding="utf-8")

# ---------------------------------------------------------------- write
# any quantity the text uses that the available results cannot supply yet is
# marked pending, so that the manuscript compiles and check_manuscript fails
import re
used = set(re.findall(r"\\([A-Z][A-Za-z]+)\{\}", (OUT / "main.tex").read_text(encoding="utf-8")))
defined_elsewhere = set(re.findall(r"\\newcommand\{\\([A-Za-z]+)\}", (OUT / "numbers.tex").read_text(encoding="utf-8")))
for k in sorted(used - defined_elsewhere - set(macros)):
    put(k, PENDING % k)
text = ["% Generated by eval/make_paper_numbers.py. Do not edit by hand.", ""]
text += [f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in macros.items()]
(OUT / "numbers_eval.tex").write_text("\n".join(text) + "\n", encoding="utf-8")
print(f"{len(macros)} macros; pending: {sum('pending' in str(v) for v in macros.values())}")
