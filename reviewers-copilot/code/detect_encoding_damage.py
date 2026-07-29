"""
Detect reference strings damaged by a font subset carrying a custom encoding
without a usable ToUnicode map.

When a PDF embeds a subsetted font and omits the ToUnicode CMap, text extraction
returns raw glyph indices rather than characters. In the common case the offset
is constant, so the damage is reversible by a single shift. This script measures
how often that signature appears, by venue and year.

The mechanism is the one the manuscript refers to as instrument drift. Detecting
it does not require knowing the compilation engine, only the output.
"""

import re
import sys

import pandas as pd
from tqdm import tqdm

sys.stdout.reconfigure(encoding="utf-8")

DATA = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\data\longitudinal_dataset_N22479.xlsx"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\encoding_damage.csv"

# frequent tokens of English bibliographic prose
COMMON = {
    "the", "and", "for", "with", "from", "learning", "networks", "neural", "data",
    "model", "models", "arxiv", "proceedings", "conference", "journal", "advances",
    "systems", "international", "deep", "using", "analysis", "based", "language",
    "vision", "image", "recognition", "processing", "machine", "information",
    "computer", "science", "research", "review", "letters", "physics", "nature",
    "university", "press", "volume", "pages", "eds", "acm", "ieee", "springer",
}

MIN_SHIFT, MAX_SHIFT = -60, 60


# A shift displaces the space character too, so decoded text arrives with its
# words glued together. Scoring must therefore look for substrings, not tokens,
# and the words must be long enough not to match inside unrelated text.
PROBE = sorted({w for w in COMMON if len(w) >= 5})


def score(s):
    low = s.lower()
    return sum(w in low for w in PROBE)


def suspicious(s):
    """A damaged string carries almost no spaces, because spaces shift too."""
    if len(s) < 40:
        return False
    return (s.count(" ") / len(s)) < 0.10 or score(s) == 0


def best_shift(s):
    base = score(s)
    best, gain = 0, 0
    for k in range(MIN_SHIFT, MAX_SHIFT + 1):
        if k == 0:
            continue
        t = "".join(chr(o) if 0x20 <= (o := ord(c) + k) < 0x7F else c for c in s)
        g = score(t) - base
        if g > gain:
            best, gain = k, g
    return best, gain


df = pd.read_excel(DATA)

rows = []
for _, r in tqdm(df.iterrows(), total=len(df)):
    s = str(r["Original Reference"])
    base = score(s)
    shift, gain = best_shift(s) if suspicious(s) else (0, 0)
    rows.append({
        "Dataset": r["Dataset"], "Paper File": r["Paper File"], "Status": r["Status"],
        "Original Reference": s, "Base_Score": base, "Best_Shift": shift,
        "Shift_Gain": gain, "Encoding_Damaged": bool(gain >= 2),
    })

out = pd.DataFrame(rows)
out.to_csv(OUT, index=False, encoding="utf-8")

dmg = out[out.Encoding_Damaged]
print()
print(f"strings showing the signature: {len(dmg)} of {len(out)} ({len(dmg) / len(out) * 100:.3f}%)")
print(f"papers affected: {dmg['Paper File'].nunique()} of {out['Paper File'].nunique()}")
print()
print("by venue-year (% of strings):")
print((out.groupby("Dataset")["Encoding_Damaged"].mean() * 100).round(3).to_string())
print()
print("shift values observed:")
print(dmg["Best_Shift"].value_counts().head(10).to_string())
print()
print("share of the damaged strings that the screening pass left unresolved:")
print(dmg["Status"].value_counts().to_string())
