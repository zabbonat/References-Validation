"""
Prepare the Badalova-Mayr test set (Zenodo 10.5281/zenodo.21457492) for the
harness.

The released CSV is encoded in cp850, which cannot represent typographic
quotes, dashes, the ellipsis or some Central European letters, so 90 characters
in 58 references were saved as '?'. The tools evaluated in the paper saw the
original text. The characters are restored below by rules that follow from the
citation styles of the three source documents, plus five personal names
restored by hand. Every substitution is logged.
"""

import json
import re
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
SRC = HERE / "external" / "badalova_mayr_2026" / "manual_reference_verification_dataset.csv"
OUT = HERE / "data" / "mayr_104.jsonl"
LOG = HERE / "data" / "mayr_104_restorations.csv"

NAMES = {
    "Micha? Marci?czuk": "Michał Marcińczuk",
    "Bolikowski, ?.": "Bolikowski, Ł.",
    "Ond?rej Dusek": "Ondřej Dušek",
    "Kamile? Luko?iut?e": "Kamilė Lukošiūtė",
}

RULES = [
    # page and year ranges: 165?172, 11(3-4):78?88
    (r"(?<=\d)\?(?=\d)", "–"),
    # APA 7 truncated author list: "Penchev, I., ? Hussenot, L."
    (r"(?<=\., )\?(?= [A-Z])", "…"),
    # apostrophes: Stanford?s, don?t, Can?t, It?s, CIKM ?21
    (r"(?<=[A-Za-z])\?(?=(s|t|re|ll|ve|d)\b)", "’"),
    (r"(?<= )\?(?=\d\d\b)", "’"),
    # spaced dash: "Inforex ? a Collaborative"
    (r"(?<= )\?(?= [a-z])", "–"),
    # dash inside a quoted title: "SoMeSci?A", "SoftwareKG?a"
    (r"(?<=[A-Za-z])\?(?=[A-Za-z])", "—"),
    # opening quote before a title: ". ?Credit Lost"
    (r"(?<=\s)\?(?=[A-Z0-9])", "“"),
    # closing quote before . or , : "astronomy?. In:", "articles.? In"
    (r"(?<=[A-Za-z0-9)])\?(?=[.,])", "”"),
    (r"(?<=\.)\?(?= )", "”"),
]

df = pd.read_csv(SRC, encoding="cp850")
OUT.parent.mkdir(parents=True, exist_ok=True)

log = []
with open(OUT, "w", encoding="utf-8") as f:
    for _, r in df.iterrows():
        s = str(r.reference)
        before = s
        for k, v in NAMES.items():
            s = s.replace(k, v)
        for pat, rep in RULES:
            s = re.sub(pat, rep, s)
        if s != before:
            log.append({"id": f"{r.document_id}-{r.reference_number}", "before": before, "after": s})
        f.write(json.dumps({"id": f"{r.document_id}-{r.reference_number}", "ref": s,
                            "manual_label": r.manual_label}, ensure_ascii=False) + "\n")

pd.DataFrame(log).to_csv(LOG, index=False, encoding="utf-8")
left = sum(x["after"].count("?") for x in log)
print(f"references: {len(df)}, restored: {len(log)}, '?' remaining in restored strings: {left}")
