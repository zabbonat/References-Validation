"""
Figures for output/figures, drawn from the evaluation results only.
    fig_independent.pdf  detection against false alarms on the independent set
    fig_referee.pdf      flags on the manuscripts and fabrications hidden in them
"""

import json
from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).parent
RES = HERE / "results"
FIG = HERE.parent / "output" / "figures"
FIG.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "font.family": "serif", "font.size": 9, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.alpha": 0.3,
    "grid.linestyle": "--", "axes.axisbelow": True,
})

# ---------------------------------------------------------------- independent set
mayr = pd.read_csv(HERE / "external" / "badalova_mayr_2026" / "manual_reference_verification_dataset.csv",
                   encoding="cp850")
mayr["id"] = mayr.document_id + "-" + mayr.reference_number
prob = mayr.manual_label == "problematic"


def point(flagged):
    return (flagged & ~prob).sum() / (~prob).sum() * 100, (flagged & prob).sum() / prob.sum() * 100


pts = {}
for col, label in [("checkifexist", "CheckIfExist (published)"), ("refchecker", "RefChecker"),
                   ("hallucinator", "Hallucinator"), ("hallucitechecker", "HalluCiteChecker"),
                   ("halref", "HalRef")]:
    pts[label] = point(mayr[col] == "flagged")
for name, label in [("mayr_baseline_quick", "CheckIfExist original (this study)"),
                    ("mayr_revised_quick", "CheckIfExist revised")]:
    p = RES / f"{name}.jsonl"
    if p.exists():
        d = mayr[["id"]].merge(pd.DataFrame([json.loads(l) for l in open(p, encoding="utf-8")]), on="id")
        pts[label] = point(d.label.ne("Verified").values)

fig, ax = plt.subplots(figsize=(5.2, 3.6))
for label, (x, y) in pts.items():
    ours = "this study" in label or "revised" in label
    color = "#C44E52" if "revised" in label else ("#4C72B0" if ours else "0.45")
    ax.scatter(x, y, s=55 if ours else 38, color=color, zorder=3,
               marker="o" if "CheckIfExist" in label else "s", edgecolor="white", linewidth=0.6)
    if label == "CheckIfExist (published)":
        ax.annotate(label, (x, y), xytext=(58, 83), fontsize=7.5, ha="left", va="center",
                    arrowprops=dict(arrowstyle="-", color="0.6", lw=0.6, shrinkB=4))
        continue
    dx, dy, ha = {
        "CheckIfExist original (this study)": (1.5, -2.8, "left"),
        "CheckIfExist revised": (0, 2.8, "center"),
        "RefChecker": (1.5, 0.6, "left"),
    }.get(label, (1.2, -1.2, "left"))
    ax.annotate(label, (x, y), xytext=(x + dx, y + dy), fontsize=7.5, ha=ha, va="center")
if "CheckIfExist original (this study)" in pts and "CheckIfExist revised" in pts:
    (x0, y0), (x1, y1) = pts["CheckIfExist original (this study)"], pts["CheckIfExist revised"]
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0),
                arrowprops=dict(arrowstyle="->", color="#C44E52", lw=1.1, shrinkA=6, shrinkB=6))
ax.set_xlim(0, 85)
ax.set_ylim(45, 102)
ax.set_xlabel("Genuine references flagged (%)")
ax.set_ylabel("Problematic references flagged (%)")
fig.tight_layout()
fig.savefig(FIG / "fig_independent.pdf", bbox_inches="tight")
plt.close(fig)

# ---------------------------------------------------------------- what a referee sees
def load(name):
    p = RES / f"{name}.jsonl"
    return pd.DataFrame([json.loads(l) for l in open(p, encoding="utf-8")]) if p.exists() else None


corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
pl = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "planted_manuscripts.jsonl", encoding="utf-8")])
SEGMENTS = [("Not Found", "Not found", "#C44E52"), ("Disagreement", "Partial match or mismatch", "#E8A33D"),
            ("Extraction problem", "Extraction problem", "0.55"), ("Web resource", "Web resource", "0.78")]
versions = [("corpus_baseline_raw", "Original"), ("corpus_revised_raw_e5f4c90", "Revised,\nevaluated blind"),
            ("corpus_revised_raw", "Revised,\nfinal")]
bars = {}
for name, label in versions:
    df = load(name)
    if df is None or len(df) < len(corp):
        continue
    lab = corp.merge(df[["id", "label"]], on="id").label.replace({"Partial Match": "Disagreement", "Mismatch": "Disagreement"})
    bars[label] = {k: 50 * (lab == k).mean() for k, _, _ in SEGMENTS}
planted = {}
for name, label in [("planted_baseline_raw", "Original"), ("planted_revised_raw", "Revised, final")]:
    df = load(name)
    if df is None or len(df) < len(pl):
        continue
    d = pl.merge(df[["id", "label"]], on="id")
    d["flag"] = d.label != "Verified"
    planted[label] = [100 * d[d.kind == k].flag.mean() for k in ["invented", "extended", "swapped"]] + [100 * d.flag.mean()]

if len(bars) == 3 and len(planted) == 2:
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.2, 3.0), gridspec_kw={"width_ratios": [1.2, 1]})
    ys = list(range(len(bars)))[::-1]
    for y, (label, seg) in zip(ys, bars.items()):
        left = 0
        for k, name, color in SEGMENTS:
            a1.barh(y, seg[k], left=left, color=color, height=0.55, edgecolor="white", linewidth=0.5)
            left += seg[k]
        a1.text(left + 0.3, y, f"{left:.1f}", va="center", fontsize=7.5)
    a1.set_yticks(ys)
    a1.set_yticklabels(list(bars.keys()), fontsize=8)
    a1.set_xlabel("References flagged per fifty")
    a1.grid(axis="y", visible=False)
    a1.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=c) for _, _, c in SEGMENTS],
              labels=[n for _, n, _ in SEGMENTS], fontsize=6.8, frameon=False,
              loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=2)
    a1.set_title("(a) Flags on the manuscripts", fontsize=8.5, loc="left")
    kinds = ["Invented\nwork", "Extended\ntitle", "Swapped\nauthors", "All"]
    x = range(len(kinds))
    for off, (label, color) in zip([-0.19, 0.19], [("Original", "#4C72B0"), ("Revised, final", "#C44E52")]):
        a2.bar([i + off for i in x], planted[label], width=0.36, color=color, label=label)
    a2.set_xticks(list(x))
    a2.set_xticklabels(kinds, fontsize=7.5)
    a2.set_ylim(0, 105)
    a2.set_ylabel("Flagged (%)")
    a2.grid(axis="x", visible=False)
    a2.legend(fontsize=6.8, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=2)
    a2.set_title("(b) Fabrications hidden in them", fontsize=8.5, loc="left")
    fig.tight_layout()
    fig.savefig(FIG / "fig_referee.pdf", bbox_inches="tight")
    plt.close(fig)

print(sorted(p.name for p in FIG.glob("fig_*.pdf")))
