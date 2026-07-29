"""
Match-correctness of the Verified label, computed over the whole verified stratum.

The original pass accepted the first record Crossref returned without comparing
it to the reference string. This script applies the agreement rule to the record
that was actually stored, so the share of Verified labels that survive a real
comparison can be measured. No API call and no judgement is involved: the input
is the retrieved record already present in the dataset.
"""

import re
import sys
import unicodedata
from difflib import SequenceMatcher

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

DATA = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\data\longitudinal_dataset_N22479.xlsx"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\verified_match_check.csv"

LIGATURES = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi",
             "\ufb04": "ffl", "\u0153": "oe", "\u00e6": "ae"}


def phi(s):
    s = str(s)
    for lig, rep in LIGATURES.items():
        s = s.replace(lig, rep)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def toks(s):
    return {w for w in re.findall(r"[a-z0-9]+", str(s).lower()) if len(w) >= 3}


def years(s):
    return {int(y) for y in re.findall(r"\b(19\d{2}|20[0-3]\d)\b", str(s))}


df = pd.read_excel(DATA)
v = df[df["Status"] == "Verified"].copy()
print(f"verified stratum: {len(v):,}")

rec = []
for _, r in v.iterrows():
    ref = phi(r["Original Reference"])
    title = str(r["Found Title"]) if pd.notna(r["Found Title"]) else ""
    tt = toks(title)
    s_tok = len(tt & toks(ref)) / len(tt) if tt else 0.0
    s_lev = SequenceMatcher(None, ref.lower(), title.lower()).ratio() if title else 0.0
    s_title = max(s_tok, s_lev)

    ys = years(ref)
    try:
        fy = int(float(r["Year"])) if pd.notna(r["Year"]) else None
    except (TypeError, ValueError):
        fy = None
    y_ok = None if (not ys or fy is None) else any(abs(fy - y) <= 1 for y in ys)

    if s_title >= 0.85 and y_ok is not False:
        verdict = "Correct match"
    elif s_title >= 0.50:
        verdict = "Weak match"
    else:
        verdict = "Wrong record matched"

    rec.append({
        "Dataset": r["Dataset"], "Paper File": r["Paper File"],
        "Original Reference": r["Original Reference"], "Found Title": title,
        "Found Year": r["Year"], "DOI": r["DOI"],
        "S_Title": round(s_title, 4), "Year_OK": y_ok, "Match_Verdict": verdict,
    })

out = pd.DataFrame(rec)
out.to_csv(OUT, index=False, encoding="utf-8")

print()
print(out["Match_Verdict"].value_counts().to_string())
print()
print((out["Match_Verdict"].value_counts(normalize=True) * 100).round(2).to_string())
print()
print("by dataset (% correct):")
print((out.groupby("Dataset")["Match_Verdict"]
       .apply(lambda s: (s == "Correct match").mean() * 100).round(1).to_string()))
print()
print("written:", OUT)
