"""
BibTeX version of the constructed set, for a comparison in which both tools
receive the same structured input. RefChecker without a language model cannot
segment plain-text references, but reads BibTeX; CheckIfExist has a BibTeX
path of its own.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent
rows = [json.loads(l) for l in open(HERE / "data" / "constructed_400_fields.jsonl", encoding="utf-8")]


def esc(s):
    return re.sub(r"([&%$#_])", r"\\\1", str(s or "")).replace("{", "").replace("}", "")


entries, jsonl = [], []
for r in rows:
    author = " and ".join(f"{fam}, {giv}".strip(", ") for giv, fam in r["authors"])
    fields = [("title", "{" + esc(r["title"]) + "}"), ("author", author), ("journal", esc(r["venue"])),
              ("year", r["year"]), ("volume", r["volume"]), ("number", r["issue"]), ("pages", r["page"]),
              ("doi", r["doi"])]
    body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v not in ("", None))
    entries.append(f"@article{{{r['id']},\n{body}\n}}")
    jsonl.append({"id": r["id"], "title": r["title"], "author": author, "journal": r["venue"],
                  "year": str(r["year"]), "doi": r["doi"]})

(HERE / "data" / "constructed_400.bib").write_text("\n\n".join(entries) + "\n", encoding="utf-8")
with open(HERE / "data" / "constructed_400_bibtex.jsonl", "w", encoding="utf-8") as f:
    for j in jsonl:
        f.write(json.dumps(j, ensure_ascii=False) + "\n")
print(len(entries), "entries")
