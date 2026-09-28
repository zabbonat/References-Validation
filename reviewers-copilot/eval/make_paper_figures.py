"""
Figures for output/figures, drawn from the evaluation results only.
    fig_independent.pdf  detection against false alarms on the independent set
    fig_workload.pdf     flags per manuscript, original and revised tool
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

# ---------------------------------------------------------------- manuscripts
corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
per = {}
for name, label in [("corpus_baseline_raw", "Original"), ("corpus_revised_raw", "Revised")]:
    p = RES / f"{name}.jsonl"
    if not p.exists():
        continue
    df = pd.DataFrame([json.loads(l) for l in open(p, encoding="utf-8")])
    if len(df) < len(corp):
        continue
    d = corp.merge(df[["id", "label"]], on="id")
    per[label] = d.assign(flag=d.label.ne("Verified")).groupby("paper").flag.sum()

if len(per) == 2:
    both = pd.DataFrame(per).sort_values("Original")
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    x = range(len(both))
    for i, (o, r) in enumerate(zip(both.Original, both.Revised)):
        ax.plot([i, i], [o, r], color="0.75", lw=1, zorder=1)
    ax.scatter(x, both.Original, s=22, color="#4C72B0", label="Original", zorder=2)
    ax.scatter(x, both.Revised, s=22, color="#C44E52", label="Revised", zorder=3)
    ax.set_xticks([])
    ax.set_xlabel("Manuscripts, ordered by flags under the original tool")
    ax.set_ylabel("References flagged per manuscript")
    ax.legend(frameon=False, fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(FIG / "fig_workload.pdf", bbox_inches="tight")
    plt.close(fig)

print(sorted(p.name for p in FIG.glob("fig_*.pdf")))
