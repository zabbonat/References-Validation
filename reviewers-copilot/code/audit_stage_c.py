"""
Stage C: independent verification of the accepted stratum.

The screening pass accepted a record without comparing it to the string, so
acceptance carries no information about whether the cited work exists. This
stage takes the stratified random sample of accepted references and verifies
each one independently, by normalizing the string and querying four sources
under the agreement rule. A reference confirmed here exists, and the evidence
is an identifier. A reference that no source confirms is escalated.

The purpose is to bound how often a fabricated reference is absorbed into the
accepted class, which is the quantity the wrong-match rate makes impossible to
assume away.
"""

import os
import sys

import pandas as pd
from tqdm import tqdm

import refcheck

sys.stdout.reconfigure(encoding="utf-8")

SHEET = r"C:\Users\Dilet\Desktop\Scientometrics_Results\AUDIT_VERIFIED_SAMPLE_200_CODING_SHEET.xlsx"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_c_accepted_sample.csv"

sample = pd.read_excel(SHEET, sheet_name="Coding")

rows = []
done = set()
if os.path.exists(OUT):
    prev = pd.read_csv(OUT)
    rows = prev.to_dict("records")
    done = set(prev["ID"])

todo = sample[~sample["ID"].isin(done)]

for _, r in tqdm(todo.iterrows(), total=len(todo)):
    v = refcheck.verify(str(r["Original Reference"]))
    rows.append({
        "ID": r["ID"], "Dataset": r["Dataset"], "Cohort": r["Cohort"],
        "Original Reference": r["Original Reference"],
        "Screening_Matched_Title": r["Matched Title"],
        "Screening_DOI": r["Matched DOI"],
        "StageC_Status": v["status"], "S_Title": round(v["s_title"], 4),
        "Author_Hit": None if v["author_hit"] is None else round(v["author_hit"], 4),
        "Year_OK": v["year_ok"], "Best_Source": v["source"],
        "Best_Title": v["title"], "Best_Year": v["year"], "Best_ID": v["id"],
    })
    if len(rows) % 10 == 0:
        pd.DataFrame(rows).to_csv(OUT, index=False, encoding="utf-8")

out = pd.DataFrame(rows)
out.to_csv(OUT, index=False, encoding="utf-8")

print()
print(out.StageC_Status.value_counts().to_string())
print()
print((out.StageC_Status.value_counts(normalize=True) * 100).round(1).to_string())
