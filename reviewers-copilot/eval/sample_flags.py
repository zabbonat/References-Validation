"""
Random sample of the flags that ask a referee for scrutiny (Not Found, Partial
Match, Mismatch) raised by the final version of the tool on the manuscripts,
for individual verification. Writes eval/data/manuscript_flags_sample.csv with
empty verdict and evidence columns; the verified file is
eval/data/manuscript_flags_audit.csv.

Verdicts:
    citation error      the work exists, and the citation differs from it in
                        title, authors, year or venue beyond formatting
    correct             the work exists and is cited correctly; a year off by
                        one or a cut compound surname is noted but does not
                        make a citation an error
    extraction damage   the string, as extracted from the PDF, is truncated
                        before its title, garbled or merged with other text
    unverifiable        unpublished material that no source records
    not a reference     the string is not a bibliographic reference
    fabricated          no such work exists
"""

import json
from pathlib import Path

import pandas as pd

SEED = 20260929
N = 40
HERE = Path(__file__).parent
OUT = HERE / "data" / "manuscript_flags_sample.csv"

corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
res = pd.DataFrame([json.loads(l) for l in open(HERE / "results" / "corpus_revised_raw.jsonl", encoding="utf-8")])
assert len(res) == len(corp)
d = corp.merge(res[["id", "label", "issues", "matchedTitle", "matchedYear", "source", "doi"]], on="id")
flags = d[d.label.isin(["Not Found", "Partial Match", "Mismatch"])]
sample = flags.sample(n=min(N, len(flags)), random_state=SEED).sort_values("id")
sample = sample.assign(issues=sample.issues.map(lambda l: " | ".join(l)), verdict="", evidence="")
if OUT.exists():
    old = pd.read_csv(OUT, dtype=str).fillna("")
    assert list(old.id) == list(sample.id), "the sample has changed"
else:
    sample[["id", "paper", "ref", "label", "issues", "matchedTitle", "matchedYear", "source", "doi",
            "verdict", "evidence"]].to_csv(OUT, index=False, encoding="utf-8")
print(f"{len(flags)} scrutiny flags; sample of {len(sample)} written to {OUT.name}")
