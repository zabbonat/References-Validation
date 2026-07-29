"""
Stage A of the reference audit: deterministic re-verification.

No human judgement and no language model is involved. Every reference string
that the original pass left unresolved is normalized and re-queried against
four metadata sources. A string that re-matches is an extraction artifact and
the DOI is the evidence. A string that matches nowhere goes to stage B, where
it is searched for on the open web to separate a genuinely unindexed work from
a fabrication.

Writes one row per input string with every score and every candidate record, so
that any verdict can be recontrolled without rerunning the queries.
"""

import json
import os
import re
import sys
import time
import unicodedata
from difflib import SequenceMatcher

import pandas as pd
import requests

sys.stdout.reconfigure(encoding="utf-8")

MAILTO = "diletta.abbonato@unito.it"
DATA = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\data\longitudinal_dataset_N22479.xlsx"
OUT = r"C:\Users\Dilet\Desktop\Scientometrics_Results\stage_a_flagged_307.csv"

TITLE_TAU = 0.85
FUZZY_TAU = 0.50


# --------------------------------------------------------------- normalization
LIGATURES = {
    "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
    "\ufb05": "st", "\ufb06": "st", "\u0153": "oe", "\u00e6": "ae",
}


def deglue(s):
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)          # authorYear -> author Year
    s = re.sub(r"(?<=[A-Za-z])(?=\d{4}\b)", " ", s)      # Smith2019 -> Smith 2019
    s = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", s)
    s = re.sub(r"\s*([,.;:()\[\]])\s*", r" \1 ", s)
    return re.sub(r"\s+", " ", s).strip()


def phi(s):
    s = str(s)
    for lig, rep in LIGATURES.items():
        s = s.replace(lig, rep)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return deglue(s)


def tokens(s):
    return {w for w in re.findall(r"[a-z0-9]+", str(s).lower()) if len(w) >= 3}


def s_title(ref_norm, cand_title):
    """max(normalized Levenshtein, token containment of the candidate title)."""
    if not cand_title:
        return 0.0
    a, b = ref_norm.lower(), str(cand_title).lower()
    s_lev = SequenceMatcher(None, a, b).ratio()
    tb = tokens(b)
    s_tok = len(tb & tokens(a)) / len(tb) if tb else 0.0
    return max(s_lev, s_tok)


def author_hit(ref_norm, families):
    """Fraction of the candidate's author surnames present in the reference."""
    fams = [f for f in (families or []) if f and len(f) >= 3]
    if not fams:
        return None
    low = ref_norm.lower()
    return sum(f.lower() in low for f in fams) / len(fams)


def years_in(s):
    return {int(y) for y in re.findall(r"\b(19\d{2}|20[0-3]\d)\b", str(s))}


def year_ok(ref_norm, cand_year):
    ys = years_in(ref_norm)
    if not ys or not cand_year:
        return None
    try:
        cy = int(float(cand_year))
    except (TypeError, ValueError):
        return None
    return any(abs(cy - y) <= 1 for y in ys)


# ------------------------------------------------------------------- retrieval
def get(url, params, timeout=25, tries=3):
    for k in range(tries):
        try:
            r = requests.get(url, params=params, timeout=timeout,
                             headers={"User-Agent": f"CheckIfExist-audit (mailto:{MAILTO})"})
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 500, 502, 503):
                time.sleep(4 * (k + 1))
                continue
            return None
        except Exception:
            time.sleep(3 * (k + 1))
    return None


def q_crossref(q):
    d = get("https://api.crossref.org/works",
            {"query.bibliographic": q[:400], "rows": 3, "mailto": MAILTO})
    out = []
    for it in (d or {}).get("message", {}).get("items", []):
        out.append({
            "source": "Crossref",
            "title": (it.get("title") or [""])[0],
            "authors": [a.get("family", "") for a in it.get("author", [])],
            "year": ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0],
            "id": it.get("DOI", ""),
        })
    return out


def keywords(q, k=18):
    """OpenAlex and arXiv reject long punctuated strings; they need keywords."""
    return " ".join(re.findall(r"[A-Za-z]{3,}", q)[:k])


def q_openalex(q):
    d = get("https://api.openalex.org/works",
            {"search": keywords(q), "per-page": 3, "mailto": MAILTO})
    out = []
    for it in (d or {}).get("results", []):
        fams = []
        for a in it.get("authorships", []):
            name = ((a.get("author") or {}).get("display_name") or "").split()
            if name:
                fams.append(name[-1])
        out.append({
            "source": "OpenAlex",
            "title": it.get("title") or "",
            "authors": fams,
            "year": it.get("publication_year"),
            "id": it.get("doi") or it.get("id", ""),
        })
    return out


def q_dblp(q):
    d = get("https://dblp.org/search/publ/api", {"q": q[:200], "format": "json", "h": 3})
    hits = (((d or {}).get("result") or {}).get("hits") or {}).get("hit") or []
    out = []
    for h in hits:
        i = h.get("info", {})
        a = (i.get("authors") or {}).get("author") or []
        a = a if isinstance(a, list) else [a]
        out.append({
            "source": "DBLP",
            "title": i.get("title", ""),
            "authors": [str(x.get("text", x)).split()[-1] for x in a],
            "year": i.get("year"),
            "id": i.get("doi") or i.get("url", ""),
        })
    return out


def q_arxiv(q):
    try:
        r = requests.get("http://export.arxiv.org/api/query",
                         params={"search_query": f"all:{keywords(q, 12)}", "max_results": 3},
                         timeout=25)
        if r.status_code != 200:
            return []
    except Exception:
        return []
    import xml.etree.ElementTree as ET
    ns = "{http://www.w3.org/2005/Atom}"
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError:
        return []
    out = []
    for e in root.findall(f"{ns}entry"):
        t = (e.findtext(f"{ns}title") or "").strip()
        pub = (e.findtext(f"{ns}published") or "")[:4]
        auth = [(a.findtext(f"{ns}name") or "").split()[-1] for a in e.findall(f"{ns}author")]
        out.append({"source": "arXiv", "title": t, "authors": auth,
                    "year": int(pub) if pub.isdigit() else None,
                    "id": (e.findtext(f"{ns}id") or "")})
    return out


# ------------------------------------------------------------------------ main
df = pd.read_excel(DATA)
flagged = df[df["Status"] == "Not Found"].copy().reset_index(drop=True)

rows = []
done = set()
if os.path.exists(OUT):
    prev = pd.read_csv(OUT)
    rows = prev.to_dict("records")
    done = set(prev["ID"])
print(f"stage A over {len(flagged)} strings, {len(done)} already done", flush=True)

for i, r in flagged.iterrows():
    if f"F{i + 1:03d}" in done:
        continue
    raw = str(r["Original Reference"])
    norm = phi(raw)

    cands = []
    for fn in (q_crossref, q_openalex, q_dblp, q_arxiv):
        try:
            cands += fn(norm)
        except Exception as e:
            print(f"  [{i}] {fn.__name__} failed: {e}", flush=True)
        time.sleep(0.4)

    best = None
    for c in cands:
        st = s_title(norm, c["title"])
        ah = author_hit(norm, c["authors"])
        yo = year_ok(norm, c["year"])
        score = (st, ah if ah is not None else 0.0)
        if best is None or score > best["score"]:
            best = {"score": score, "s_title": st, "author_hit": ah, "year_ok": yo, **c}

    if best is None:
        status = "Unresolved"
        best = {"s_title": 0.0, "author_hit": None, "year_ok": None,
                "source": "", "title": "", "authors": [], "year": None, "id": ""}
    elif best["s_title"] >= TITLE_TAU and (best["author_hit"] or 0) >= 0.5 and best["year_ok"] is not False:
        status = "Recovered"
    elif best["s_title"] >= FUZZY_TAU:
        status = "Fuzzy"
    else:
        status = "Unresolved"

    rows.append({
        "ID": f"F{i + 1:03d}",
        "Cohort": r.get("Cohort", ""),
        "Dataset": r["Dataset"],
        "Paper File": r["Paper File"],
        "Original Reference": raw,
        "Normalized": norm,
        "StageA_Status": status,
        "S_Title": round(best["s_title"], 4),
        "Author_Hit": None if best["author_hit"] is None else round(best["author_hit"], 4),
        "Year_OK": best["year_ok"],
        "Best_Source": best["source"],
        "Best_Title": best["title"],
        "Best_Year": best["year"],
        "Best_ID": best["id"],
        "N_Candidates": len(cands),
        "All_Candidates": json.dumps(cands, ensure_ascii=False)[:4000],
    })

    if (i + 1) % 10 == 0 or i == len(flagged) - 1:
        pd.DataFrame(rows).to_csv(OUT, index=False, encoding="utf-8")
        done = pd.DataFrame(rows)["StageA_Status"].value_counts().to_dict()
        print(f"[{i + 1}/{len(flagged)}] {done}", flush=True)

pd.DataFrame(rows).to_csv(OUT, index=False, encoding="utf-8")
print("written:", OUT, flush=True)
