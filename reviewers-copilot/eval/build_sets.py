"""
Build the two evaluation sets that are not taken from elsewhere.

Constructed set. Two hundred references from the corpus whose Crossref record
matched on title and year are re-fetched by DOI and formatted in APA 7. Each
yields one genuine reference and one altered reference, fifty of each of four
kinds:
    invented   first author of the base, title spliced from the first half of
               the base title and the second half of another title from the
               same stratum: a work that does not exist
    extended   the base title followed by words from another title: a real
               title with invented words appended
    swapped    the base title with the author list of another reference
    altered    real title and authors, year moved by three to five years and
               venue replaced: a citation error, not a fabrication
Half of the pairs carry the base DOI in both versions, since fabricated
references often carry real identifiers.

Corpus sample. Three whole manuscripts per venue-year stratum, with every
reference string as extracted from the PDF, for the per-manuscript workload.

Built after the engine revision was frozen (commit b404b90), with a fixed seed.
"""

import json
import random
import re
import time
from pathlib import Path

import pandas as pd
import requests
from tqdm import tqdm

SEED = 20260928
N_BASE = 200
PER_STRATUM_MANUSCRIPTS = 3
MAILTO = "diletta.abbonato@unito.it"

HERE = Path(__file__).parent
REPO = HERE.parent
OUT_CONSTRUCTED = HERE / "data" / "constructed_400.jsonl"
OUT_BASES = HERE / "data" / "constructed_bases.csv"
OUT_CORPUS = HERE / "data" / "corpus_27_manuscripts.jsonl"

rng = random.Random(SEED)

# ---------------------------------------------------------------- bases
match = pd.read_csv(REPO / "data" / "verified_match_check.csv")
pool = match[(match.Match_Verdict == "Correct match") & match.DOI.notna()
             & ~match.DOI.astype(str).str.contains("10.48550", regex=False)].copy()
pool = pool.drop_duplicates("DOI")
shares = pool.Dataset.value_counts(normalize=True)
alloc = (shares * N_BASE * 1.4).round().astype(int)   # reserve for failed fetches
cands = pd.concat(pool[pool.Dataset == d].sample(n=min(k, (pool.Dataset == d).sum()), random_state=SEED)
                  for d, k in alloc.items()).sample(frac=1.0, random_state=SEED)


def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def fetch(doi):
    for k in range(3):
        try:
            r = requests.get(f"https://api.crossref.org/works/{doi}", params={"mailto": MAILTO}, timeout=30)
            if r.status_code == 200:
                return r.json()["message"]
            if r.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(3 * (k + 1))
    return None


target = (shares * N_BASE).round().astype(int)
while target.sum() > N_BASE:
    target[target.idxmax()] -= 1
while target.sum() < N_BASE:
    target[target.idxmin()] += 1

bases = []
taken = {d: 0 for d in target.index}
for _, row in tqdm(cands.iterrows(), total=len(cands)):
    if taken[row.Dataset] >= target[row.Dataset]:
        continue
    it = fetch(row.DOI)
    time.sleep(0.2)
    if not it:
        continue
    title = strip_tags((it.get("title") or [""])[0])
    sub = strip_tags((it.get("subtitle") or [""])[0])
    if sub and sub.lower() not in title.lower():
        title = f"{title}: {sub}"
    authors = [(a.get("given", ""), a.get("family", "")) for a in it.get("author", []) if a.get("family")]
    venue = strip_tags((it.get("container-title") or [""])[0])
    year = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
    if not (title and authors and venue and year) or len(title.split()) < 4:
        continue
    bases.append({
        "doi": row.DOI, "stratum": row.Dataset, "title": title, "authors": authors,
        "venue": venue, "year": int(year), "volume": it.get("volume", ""),
        "issue": it.get("issue", ""), "page": it.get("page", ""),
    })
    taken[row.Dataset] += 1
    if len(bases) == N_BASE:
        break

assert len(bases) == N_BASE, f"only {len(bases)} usable bases"

# ---------------------------------------------------------------- APA 7


def initials(given):
    parts = re.split(r"[\s-]+", given.strip())
    return " ".join(p[0] + "." for p in parts if p and p[0].isalpha())


def fmt_authors(authors):
    names = [f"{fam}, {initials(giv)}".rstrip(", ") for giv, fam in authors]
    if len(names) == 1:
        return names[0]
    if len(names) <= 20:
        return ", ".join(names[:-1]) + ", & " + names[-1]
    return ", ".join(names[:19]) + ", … " + names[-1]


def fmt(b, with_doi):
    s = f"{fmt_authors(b['authors'])} ({b['year']}). {b['title'].rstrip('.')}. {b['venue']}"
    if b.get("volume"):
        s += f", {b['volume']}"
        if b.get("issue"):
            s += f"({b['issue']})"
    if b.get("page"):
        s += f", {b['page']}"
    s += "."
    if with_doi:
        s += f" https://doi.org/{b['doi']}"
    return s


STOP = {"a", "an", "the", "of", "for", "and", "in", "on", "to", "with", "by", "from", "via", "using", "towards"}


def content_words(title):
    return [w for w in re.findall(r"[A-Za-z][A-Za-z-]+", title) if w.lower() not in STOP]


def donor_for(i, stratum, pred):
    idx = [j for j, b in enumerate(bases) if j != i and b["stratum"] == stratum and pred(bases[j])]
    if not idx:
        idx = [j for j, b in enumerate(bases) if j != i and pred(bases[j])]
    return bases[rng.choice(idx)]


KINDS = ["invented", "extended", "swapped", "altered"]
order = list(range(N_BASE))
rng.shuffle(order)
kind_of = {i: KINDS[k % 4] for k, i in enumerate(order)}
doi_of = {i: (k // 4) % 2 == 0 for k, i in enumerate(order)}   # half of each kind carry the DOI

rows = []
fields = []   # structured version of every row, for tools that take BibTeX


def record(rid, rec, with_doi):
    fields.append({"id": rid, "title": rec["title"], "authors": rec["authors"], "venue": rec["venue"],
                   "year": rec["year"], "volume": rec["volume"], "issue": rec["issue"],
                   "page": rec["page"], "doi": rec["doi"] if with_doi else ""})


for i, b in enumerate(bases):
    kind, with_doi = kind_of[i], doi_of[i]
    rows.append({"id": f"G{i:03d}", "ref": fmt(b, with_doi), "kind": "genuine",
                 "problematic": False, "base_doi": b["doi"], "stratum": b["stratum"], "has_doi": with_doi})
    record(f"G{i:03d}", b, with_doi)
    fam = {f.lower() for _, f in b["authors"]}
    p = dict(b)
    if kind == "invented":
        d = donor_for(i, b["stratum"], lambda x: len(x["title"].split()) >= 4)
        w1, w2 = b["title"].split(), d["title"].split()
        p["title"] = " ".join(w1[: max(2, len(w1) // 2)] + w2[len(w2) // 2:])
        p["authors"] = b["authors"][:1] + d["authors"][1:3]
    elif kind == "extended":
        d = donor_for(i, b["stratum"], lambda x: len(content_words(x["title"])) >= 3)
        tail = content_words(d["title"])[-3:]
        p["title"] = b["title"].rstrip(".") + " for " + " ".join(w.lower() for w in tail)
    elif kind == "swapped":
        d = donor_for(i, b["stratum"], lambda x: not ({f.lower() for _, f in x["authors"]} & fam))
        p["authors"] = d["authors"]
    else:  # altered
        d = donor_for(i, b["stratum"], lambda x: x["venue"].lower() != b["venue"].lower())
        shift = rng.choice([-5, -4, -3, 3, 4, 5])
        if b["year"] + shift > 2026:
            shift = -abs(shift)
        p["year"] = b["year"] + shift
        p["venue"], p["volume"], p["issue"], p["page"] = d["venue"], d["volume"], d["issue"], d["page"]
    rows.append({"id": f"P{i:03d}", "ref": fmt(p, with_doi), "kind": kind,
                 "problematic": True, "base_doi": b["doi"], "stratum": b["stratum"], "has_doi": with_doi})
    record(f"P{i:03d}", p, with_doi)

OUT_CONSTRUCTED.parent.mkdir(parents=True, exist_ok=True)
lines = [json.dumps(r, ensure_ascii=False) for r in rows]
if OUT_CONSTRUCTED.exists():
    # the set is already under evaluation: a rebuild must reproduce it exactly
    old = OUT_CONSTRUCTED.read_text(encoding="utf-8").splitlines()
    assert old == lines, "rebuild does not reproduce the constructed set"
else:
    OUT_CONSTRUCTED.write_text("\n".join(lines) + "\n", encoding="utf-8")
with open(HERE / "data" / "constructed_400_fields.jsonl", "w", encoding="utf-8") as f:
    for r in fields:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
pd.DataFrame([{**b, "authors": "; ".join(f"{g} {f}".strip() for g, f in b["authors"])} for b in bases]).to_csv(
    OUT_BASES, index=False, encoding="utf-8")

# ---------------------------------------------------------------- corpus sample
corpus = pd.read_excel(REPO / "data" / "longitudinal_dataset_N22479.xlsx")
corpus["pid"] = corpus["Dataset"] + "|" + corpus["Paper File"].astype(str)
papers = (corpus.drop_duplicates("pid")[["pid", "Dataset"]]
          .groupby("Dataset", group_keys=False)
          .apply(lambda g: g.sample(n=min(PER_STRATUM_MANUSCRIPTS, len(g)), random_state=SEED)))
sample = corpus[corpus.pid.isin(set(papers.pid))].reset_index()
with open(OUT_CORPUS, "w", encoding="utf-8") as f:
    for _, r in sample.iterrows():
        f.write(json.dumps({"id": f"C{r['index']:05d}", "ref": str(r["Original Reference"]),
                            "paper": r["pid"], "stratum": r["Dataset"]}, ensure_ascii=False) + "\n")

print(f"constructed: {len(rows)} strings ({N_BASE} genuine, {N_BASE} altered)")
print(pd.Series([r["kind"] for r in rows]).value_counts().to_string())
print(f"corpus sample: {sample.pid.nunique()} manuscripts, {len(sample)} reference strings")
