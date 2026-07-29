"""
Figures for output/. Both are drawn from the released dataset, no hand-entered
values.
"""

import os

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot"
RAW = r"C:\Users\Dilet\Desktop\Scientometrics_Results"
FIG = os.path.join(REPO, "output", "figures")
os.makedirs(FIG, exist_ok=True)

plt.rcParams.update({
    "font.family": "serif", "font.size": 9, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.alpha": 0.3,
    "grid.linestyle": "--", "axes.axisbelow": True, "figure.dpi": 200,
})

ORDER = ["Arxiv_Bio_2016", "Arxiv_Bio_2023", "Arxiv_CS_2016", "Arxiv_CS_2023",
         "Arxiv_CS_2025", "NeurIPS_2016", "NeurIPS_2023", "NeurIPS_2025",
         "Arxiv_General_Latest"]
LABEL = {"Arxiv_Bio_2016": "q-bio\n2016", "Arxiv_Bio_2023": "q-bio\n2023",
         "Arxiv_CS_2016": "cs.AI\n2016", "Arxiv_CS_2023": "cs.AI\n2023",
         "Arxiv_CS_2025": "cs.AI\n2025", "NeurIPS_2016": "NeurIPS\n2016",
         "NeurIPS_2023": "NeurIPS\n2023", "NeurIPS_2025": "NeurIPS\n2025",
         "Arxiv_General_Latest": "arXiv gen.\n2026"}

df = pd.read_excel(os.path.join(REPO, "data", "longitudinal_dataset_N22479.xlsx"))

# ------------------------------------------------- figure 1: unresolved by venue
rate = df.groupby("Dataset").apply(lambda s: (s.Status == "Not Found").mean() * 100)
size = df.groupby("Dataset").size()

fig, ax = plt.subplots(figsize=(7.0, 3.1))
x = range(len(ORDER))
vals = [rate[d] for d in ORDER]
cols = ["#4C72B0" if "Bio" in d else "#C44E52" if "CS" in d or "General" in d else "#55A868"
        for d in ORDER]
ax.bar(x, vals, color=cols, width=0.68, edgecolor="white", linewidth=0.6)
for i in x:
    ax.text(i, vals[i] + 0.06, f"{vals[i]:.2f}", ha="center", va="bottom", fontsize=7.5)
ax.set_xticks(list(x))
ax.set_xticklabels([f"{LABEL[d]}\n$n$={size[d]:,}" for d in ORDER], fontsize=7.5)
ax.set_ylabel("Unresolved rate under the\nsingle-source pass (%)")
ax.set_ylim(0, max(vals) * 1.25)
ax.tick_params(axis="x", length=0, pad=4)
fig.tight_layout()
fig.savefig(os.path.join(FIG, "fig1_unresolved_by_venue.pdf"), bbox_inches="tight")
plt.close(fig)

# --------------------------------------------- figure 2: quality of Verified label
m = pd.read_csv(os.path.join(RAW, "verified_match_check.csv"))
cats = ["Correct match", "Weak match", "Wrong record matched"]
colr = {"Correct match": "#55A868", "Weak match": "#DD8452", "Wrong record matched": "#C44E52"}

sh = (m.groupby("Dataset")["Match_Verdict"].value_counts(normalize=True)
      .unstack(fill_value=0).reindex(ORDER)[cats] * 100)

fig, ax = plt.subplots(figsize=(7.0, 3.1))
bottom = [0.0] * len(ORDER)
for c in cats:
    ax.bar(range(len(ORDER)), sh[c].values, bottom=bottom, label=c,
           color=colr[c], width=0.68, edgecolor="white", linewidth=0.6)
    for i, v in enumerate(sh[c].values):
        if v >= 7:
            ax.text(i, bottom[i] + v / 2, f"{v:.0f}", ha="center", va="center",
                    fontsize=7, color="white")
    bottom = [b + v for b, v in zip(bottom, sh[c].values)]
ax.set_xticks(range(len(ORDER)))
ax.set_xticklabels([LABEL[d] for d in ORDER], fontsize=7.5)
ax.set_ylabel("Share of references labelled\nVerified by the single-source pass (%)")
ax.set_ylim(0, 100)
ax.tick_params(axis="x", length=0, pad=4)
ax.legend(frameon=False, fontsize=7.5, ncol=3, loc="lower center",
          bbox_to_anchor=(0.5, -0.42))
fig.tight_layout()
fig.savefig(os.path.join(FIG, "fig2_verified_match_quality.pdf"), bbox_inches="tight")
plt.close(fig)

sorted(os.listdir(FIG))
