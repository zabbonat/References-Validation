"""
Copy the audit outputs into data/ for release.

The two large tables repeat reference strings that longitudinal_dataset_N22479
already carries, so they are exported without that column and joined back on
Dataset and Paper File plus row order.
"""

import os
import shutil

import pandas as pd

RAW = r"C:\Users\Dilet\Desktop\Scientometrics_Results"
DATA = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\data"

# small enough to release verbatim
for f in ["stage_b_residual.csv", "stage_c_residual_resolved.csv",
          "AUDIT_FLAGGED_307_CODING_SHEET.xlsx",
          "AUDIT_VERIFIED_SAMPLE_200_CODING_SHEET.xlsx"]:
    shutil.copy(os.path.join(RAW, f), os.path.join(DATA, f))

# stage A carries a JSON blob of every candidate record; keep the verdict and
# the winning record, drop the blob
a = pd.read_csv(os.path.join(RAW, "stage_a_flagged_307.csv"))
a.drop(columns=["All_Candidates"]).to_csv(
    os.path.join(DATA, "stage_a_flagged_307.csv"), index=False, encoding="utf-8")

# stage C, drop the reference text
c = pd.read_csv(os.path.join(RAW, "stage_c_accepted_sample.csv"))
c.drop(columns=["Original Reference"]).to_csv(
    os.path.join(DATA, "stage_c_accepted_sample.csv"), index=False, encoding="utf-8")

# match check over the whole accepted stratum, scores and verdict only
m = pd.read_csv(os.path.join(RAW, "verified_match_check.csv"))
# the matched title is recoverable from the main dataset via the DOI
m[["Dataset", "Paper File", "DOI", "S_Title", "Year_OK", "Match_Verdict"]].to_csv(
    os.path.join(DATA, "verified_match_check.csv"), index=False, encoding="utf-8")

# extraction damage, the three boolean signatures only
e = pd.read_csv(os.path.join(RAW, "extraction_damage.csv"))
e[["Dataset", "Paper File", "Status", "ligature", "glued", "hyphenated",
   "any_damage"]].to_csv(os.path.join(DATA, "extraction_damage.csv"),
                         index=False, encoding="utf-8")

for f in sorted(os.listdir(DATA)):
    p = os.path.join(DATA, f)
    if os.path.isfile(p):
        print(f"{os.path.getsize(p) / 1024:9.1f} KB  {f}")
