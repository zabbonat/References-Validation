"""
Shared retrieval and agreement code. Imported by audit_stage_a.py and
audit_stage_c.py so that both apply the identical rule.
"""

import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from difflib import SequenceMatcher

import requests

MAILTO = "diletta.abbonato@unito.it"
TITLE_TAU = 0.85
FUZZY_TAU = 0.50

LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
             "ﬅ": "st", "ﬆ": "st", "œ": "oe", "æ": "ae"}


def deglue(s):
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    s = re.sub(r"(?<=[A-Za-z])(?=\d{4}\b)", " ", s)
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


def keywords(q, k=18):
    return " ".join(re.findall(r"[A-Za-z]{3,}", q)[:k])


def s_title(ref_norm, cand_title):
    if not cand_title:
        return 0.0
    a, b = ref_norm.lower(), str(cand_title).lower()
    tb = tokens(b)
    s_tok = len(tb & tokens(a)) / len(tb) if tb else 0.0
    return max(SequenceMatcher(None, a, b).ratio(), s_tok)


def author_hit(ref_norm, families):
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
    return [{"source": "Crossref",
             "title": (it.get("title") or [""])[0],
             "authors": [a.get("family", "") for a in it.get("author", [])],
             "year": ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0],
             "id": it.get("DOI", "")}
            for it in (d or {}).get("message", {}).get("items", [])]


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
        out.append({"source": "OpenAlex", "title": it.get("title") or "", "authors": fams,
                    "year": it.get("publication_year"), "id": it.get("doi") or it.get("id", "")})
    return out


def q_dblp(q):
    d = get("https://dblp.org/search/publ/api", {"q": q[:200], "format": "json", "h": 3})
    hits = (((d or {}).get("result") or {}).get("hits") or {}).get("hit") or []
    out = []
    for h in hits:
        i = h.get("info", {})
        a = (i.get("authors") or {}).get("author") or []
        a = a if isinstance(a, list) else [a]
        out.append({"source": "DBLP", "title": i.get("title", ""),
                    "authors": [str(x.get("text", x)).split()[-1] for x in a],
                    "year": i.get("year"), "id": i.get("doi") or i.get("url", "")})
    return out


def q_arxiv(q):
    try:
        r = requests.get("http://export.arxiv.org/api/query",
                         params={"search_query": f"all:{keywords(q, 12)}", "max_results": 3},
                         timeout=25)
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
    except Exception:
        return []
    ns = "{http://www.w3.org/2005/Atom}"
    out = []
    for e in root.findall(f"{ns}entry"):
        pub = (e.findtext(f"{ns}published") or "")[:4]
        out.append({"source": "arXiv",
                    "title": (e.findtext(f"{ns}title") or "").strip(),
                    "authors": [(a.findtext(f"{ns}name") or "").split()[-1]
                                for a in e.findall(f"{ns}author")],
                    "year": int(pub) if pub.isdigit() else None,
                    "id": e.findtext(f"{ns}id") or ""})
    return out


SOURCES = (q_crossref, q_openalex, q_dblp, q_arxiv)


def verify(raw, pause=0.4):
    """Normalize, query every source, and return the best candidate and verdict."""
    norm = phi(raw)
    cands = []
    for fn in SOURCES:
        try:
            cands += fn(norm)
        except Exception:
            pass
        time.sleep(pause)

    best = None
    for c in cands:
        st = s_title(norm, c["title"])
        ah = author_hit(norm, c["authors"])
        key = (st, ah if ah is not None else 0.0)
        if best is None or key > best["key"]:
            best = {"key": key, "s_title": st, "author_hit": ah,
                    "year_ok": year_ok(norm, c["year"]), **c}

    if best is None:
        return {"status": "Unresolved", "s_title": 0.0, "author_hit": None, "year_ok": None,
                "source": "", "title": "", "year": None, "id": "", "n_candidates": 0}

    if best["s_title"] >= TITLE_TAU and (best["author_hit"] or 0) >= 0.5 and best["year_ok"] is not False:
        status = "Confirmed"
    elif best["s_title"] >= FUZZY_TAU:
        status = "Fuzzy"
    else:
        status = "Unresolved"

    return {"status": status, "s_title": best["s_title"], "author_hit": best["author_hit"],
            "year_ok": best["year_ok"], "source": best["source"], "title": best["title"],
            "year": best["year"], "id": best["id"], "n_candidates": len(cands)}
