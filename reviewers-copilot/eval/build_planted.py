"""
Planted set: fabricated references written in the style of the manuscripts.

The constructed set formats every reference in APA from clean metadata. A
referee meets fabrications in a different form: inside a bibliography, in its
citation style, with the damage of PDF extraction. Here each fabrication is
made by editing a real reference string of one of the 27 manuscripts, with a
donor taken from the same manuscript, so that it keeps that manuscript's style:

    invented   the base's authors with a title spliced from the first half of
               the base title and the second half of the donor's
    extended   the base title followed by "for" and the last three content
               words of the donor's title
    swapped    the base title under the donor's author names

These are the three fabrication kinds of the constructed set, built by the
same rules. Bases are references that both the original and the revised tool
verified, whose record title occurs verbatim in the string, so that the title
can be located and edited. Up to three bases of each kind are drawn from each
manuscript. Identifiers in the base string, if any, are kept: fabricated
references often carry real ones.

Built with a fixed seed from the results of the original tool and of the
version of the revision evaluated blind on the manuscripts. Neither version
was run on these strings before the final version of the revision (commit
b8248e2) was fixed.
"""

import json
import random
import re
import unicodedata
from pathlib import Path

import pandas as pd

SEED = 20260929
PER_KIND = 3
HERE = Path(__file__).parent
OUT = HERE / "data" / "planted_manuscripts.jsonl"
rng = random.Random(SEED)


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^\w\s]|_", "", s.lower()).strip()


WORD = re.compile(r"[^\W_]+")


def tokens(s):
    """Word tokens of the original string, with their offsets."""
    return [(fold(m.group()), m.start(), m.end()) for m in WORD.finditer(s) if fold(m.group())]


def locate(ref, title):
    """Offsets of the record title in the reference string, or None."""
    toks, rec = tokens(ref), [t for t, _, _ in tokens(title)]
    if len(rec) < 4:
        return None
    for i in range(len(toks) - len(rec) + 1):
        if all(toks[i + j][0] == rec[j] for j in range(len(rec))):
            return toks[i][1], toks[i + len(rec) - 1][2], toks[i:i + len(rec)]
    return None


LABEL = re.compile(r"^\s*(\[\d+\]|\d+\.)\s*")
YEAR = re.compile(r"[(\s.,]*\b(19|20)\d{2}[a-z]?\b")
STOP = {"a", "an", "the", "of", "for", "and", "in", "on", "to", "with", "by", "from", "via", "using", "towards"}


def split_prefix(prefix):
    """label, author names, and whatever follows the names (year, punctuation)."""
    m = LABEL.match(prefix)
    label = m.group() if m else ""
    rest = prefix[len(label):]
    y = YEAR.search(rest)
    names, tail = (rest[:y.start()], rest[y.start():]) if y else (rest, "")
    return label, names, tail


def families(names):
    return {fold(w) for w in re.findall(r"[A-Z][\w'’-]{2,}", names)} - {"and", "et", "al"}


def content_words(title):
    title = unicodedata.normalize("NFKC", title)   # ligatures to letters
    return [w for w in re.findall(r"[A-Za-z][A-Za-z-]+", title) if w.lower() not in STOP]


def load(name):
    return pd.DataFrame([json.loads(l) for l in open(HERE / "results" / f"{name}.jsonl", encoding="utf-8")])


corp = pd.DataFrame([json.loads(l) for l in open(HERE / "data" / "corpus_27_manuscripts.jsonl", encoding="utf-8")])
base = load("corpus_baseline_raw")[["id", "label"]]
rev = load("corpus_revised_raw_e5f4c90")[["id", "label", "matchedTitle"]]
d = corp.merge(base, on="id").merge(rev, on="id", suffixes=("_b", "_r"))
d = d[(d.label_b == "Verified") & (d.label_r == "Verified") & d.matchedTitle.notna()]

eligible = []
for _, r in d.iterrows():
    loc = locate(r.ref, re.sub(r"<[^>]+>", " ", r.matchedTitle))
    if not loc:
        continue
    start, end, toks = loc
    label, names, tail = split_prefix(r.ref[:start])
    if not families(names):
        continue
    eligible.append({"id": r.id, "paper": r.paper, "stratum": r.stratum, "ref": r.ref, "start": start,
                     "end": end, "toks": toks, "label": label, "names": names, "tail": tail,
                     "title": r.ref[start:end]})
el = pd.DataFrame(eligible)

rows = []
for paper, g in el.groupby("paper", sort=True):
    items = g.to_dict("records")
    if len(items) < 2:
        continue
    order = items[:]
    rng.shuffle(order)
    kinds = ["invented", "extended", "swapped"] * PER_KIND
    for b, kind in zip(order, kinds):
        others = [x for x in items if x["id"] != b["id"]]
        s, e, ref = b["start"], b["end"], b["ref"]
        if kind == "invented":
            pool = [x for x in others if len(x["toks"]) >= 4]
            if not pool:
                continue
            dn = rng.choice(pool)
            k = max(2, len(b["toks"]) // 2)
            cut_b = b["toks"][k - 1][2]                      # end of the first half of the base title
            dt = dn["toks"][len(dn["toks"]) // 2:]           # second half of the donor title
            spliced = ref[s:cut_b] + " " + dn["ref"][dt[0][1]:dt[-1][2]]
            new = ref[:s] + spliced + ref[e:]
        elif kind == "extended":
            pool = [x for x in others if len(content_words(x["title"])) >= 3]
            if not pool:
                continue
            dn = rng.choice(pool)
            tail_words = " ".join(w.lower() for w in content_words(dn["title"])[-3:])
            new = ref[:e] + " for " + tail_words + ref[e:]
        else:
            fam = families(b["names"])
            pool = [x for x in others if not (families(x["names"]) & fam)]
            if not pool:
                continue
            dn = rng.choice(pool)
            new = b["label"] + dn["names"] + b["tail"] + ref[s:]
        rows.append({"id": f"X{len(rows):03d}", "ref": new, "kind": kind, "paper": paper,
                     "stratum": b["stratum"], "base_id": b["id"], "donor_id": dn["id"]})

lines = [json.dumps(r, ensure_ascii=False) for r in rows]
if OUT.exists():
    assert OUT.read_text(encoding="utf-8").splitlines() == lines, "rebuild does not reproduce the planted set"
else:
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
out = pd.DataFrame(rows)
print(f"eligible bases: {len(el)} in {el.paper.nunique()} manuscripts")
print(f"planted: {len(out)} strings in {out.paper.nunique()} manuscripts")
print(out.kind.value_counts().to_string())
