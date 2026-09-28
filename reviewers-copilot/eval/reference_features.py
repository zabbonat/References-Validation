"""
Prevalence, by venue and year, of the features of reference strings that the
diagnosis links to errors of automated checking. Offline; the rules mirror
src/services/CitationChecks.ts so that what is counted here is what the tool
now recognises.
"""

import re
import unicodedata
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
REPO = HERE.parent
OUT = HERE / "results" / "reference_features.csv"

ORDER = ["Arxiv_Bio_2016", "Arxiv_Bio_2023", "Arxiv_CS_2016", "Arxiv_CS_2023", "Arxiv_CS_2025",
         "NeurIPS_2016", "NeurIPS_2023", "NeurIPS_2025", "Arxiv_General_Latest"]


def prep(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def cited_years(s):
    s = re.sub(r"10\.\d{4,9}/\S+", " ", s)
    s = re.sub(r"\b\d{4}\.\d{4,5}(v\d+)?\b", " ", s)
    return [int(y) for y in re.findall(r"\b(19\d{2}|20\d{2})\b", s)]


URL = re.compile(r"\bhttps?://\S+|\bwww\.\S+", re.I)
AUTHOR = re.compile(r"[A-Z][A-Za-z'’-]+,\s*[A-Z]\.|[A-Z]\.\s*[A-Z][A-Za-z'’-]+|\bet\s+al\b")


def classify(s):
    years = set(cited_years(s))
    dois = len(re.findall(r"10\.\d{4,9}/", s))
    etal = len(re.findall(r"\bet\s+al\b", s, re.I))
    if len(years) >= 3 or dois >= 2 or etal >= 3:
        return "merged"
    if not years and not dois and not URL.search(s) and not AUTHOR.search(prep(s)):
        return "not_reference"
    return ""


def has_title_text(s):
    # a stretch of four or more words between punctuation marks, whatever the case
    segs = re.split(r"[.,;:()\[\]\"“”]", re.sub(r"\bet\s+al\b", " ", prep(s), flags=re.I))
    return any(sum(1 for w in seg.split() if re.fullmatch(r"[^\W\d_]{2,}", w)) >= 4 for seg in segs)


SCHOLARLY_HOSTS = re.compile(r"(doi\.org|arxiv\.org|aclanthology|openreview\.net|proceedings\.|papers\.nips|dl\.acm|ieeexplore|springer|sciencedirect|wiley|jstor|pubmed|ncbi)", re.I)
REPO_HOST = re.compile(r"(github\.com|gitlab\.com|huggingface\.co)", re.I)
DATACITE = re.compile(r"10\.(5281|6084|5061|17632|7910|24433|25740|5066)/", re.I)

df = pd.read_excel(REPO / "data" / "longitudinal_dataset_N22479.xlsx")
s = df["Original Reference"].astype(str)
kind = s.map(classify)
urls = s.map(lambda x: URL.findall(x))

feat = pd.DataFrame({
    "Dataset": df["Dataset"],
    "ligature": s.str.contains("[ﬀ-ﬆ]", regex=True),
    "merged": kind.eq("merged"),
    "not_reference": kind.eq("not_reference"),
    "no_title": ~kind.ne("") & False,  # placeholder, set below
    "web_link": urls.map(lambda u: any(not SCHOLARLY_HOSTS.search(x) and not REPO_HOST.search(x) for x in u)),
    "repository": s.str.contains(REPO_HOST.pattern.replace("(", "(?:", 1), flags=re.I),
    "datacite_doi": s.str.contains(DATACITE.pattern.replace("(", "(?:", 1), flags=re.I),
    "truncated_authors": s.str.contains(r"\bet\s+al\b|…|\.\.\.", regex=True, flags=re.I),
    "arxiv_id": s.str.contains(r"arXiv[:\s]*\d{4}\.\d{4,5}|arxiv\.org/abs/\d{4}\.\d{4,5}", regex=True, flags=re.I),
})
# a reference without title text, among entries that are single references
feat["no_title"] = kind.eq("") & ~s.map(has_title_text)

OUT.parent.mkdir(parents=True, exist_ok=True)
feat.to_csv(OUT, index=False)

tab = (feat.groupby("Dataset").mean(numeric_only=True).reindex(ORDER) * 100).round(2)
tab.loc["All"] = (feat.mean(numeric_only=True) * 100).round(2)
tab["n"] = feat.groupby("Dataset").size().reindex(ORDER).tolist() + [len(feat)]
print(tab.to_string())
