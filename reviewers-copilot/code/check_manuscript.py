"""
Pre-submission guard. Fails loudly if the manuscript quotes a macro that is not
defined, or if a pending marker survives.
"""

import re

REPO = r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot"

tex = open(REPO + r"\output\main.tex", encoding="utf-8").read()
num = open(REPO + r"\output\numbers.tex", encoding="utf-8").read()
bib = open(REPO + r"\output\references.bib", encoding="utf-8").read()

defined = set(re.findall(r"\\newcommand\{\\([A-Za-z]+)\}", num + tex))
used = set(re.findall(r"\\([A-Za-z]+)", tex))

# data macros follow the capitalised naming convention of make_numbers.py.
# Capitalised LaTeX primitives are not data macros.
LATEX = {"Phi", "Delta", "Sigma", "Omega", "Gamma", "Lambda", "Theta", "Pi",
         "Psi", "Xi", "Upsilon", "LaTeX", "TeX"}
data_used = {u for u in used if u[:1].isupper()} - LATEX
missing = sorted(data_used - defined)
unused = sorted(defined - used - {"pending"})

cited = set()
for m in re.findall(r"\\cite[tp]?\{([^}]*)\}", tex):
    cited |= {k.strip() for k in m.split(",")}
bibkeys = set(re.findall(r"@\w+\{([^,]+),", bib))

pending = re.findall(r"\\pending\{([^}]*)\}", tex)

# the manuscript quotes stage A counts as if the stage were complete
stage_a_done = re.search(r"\\newcommand\{\\StageAcomplete\}\{(\w+)\}", num)
stage_a_done = bool(stage_a_done and stage_a_done.group(1) == "yes")
quotes_stage_a = "\\StageAn" in tex or "\\PcStageArecovered" in tex

print(f"macros used but undefined : {missing or 'none'}")
print(f"macros defined but unused : {len(unused)} ({', '.join(unused[:6])}{'...' if len(unused) > 6 else ''})")
print(f"citations missing from bib: {sorted(cited - bibkeys) or 'none'}")
print(f"bib entries never cited   : {sorted(bibkeys - cited) or 'none'}")
print(f"pending markers           : {len(pending)}")
for p in pending:
    print(f"    - {p}")

stage_a_bad = quotes_stage_a and not stage_a_done
print(f"stage A complete          : {'yes' if stage_a_done else 'NO, but quoted in the text'}"
      if quotes_stage_a else "stage A                   : not quoted")

ok = not missing and not (cited - bibkeys) and not pending and not stage_a_bad
print()
print("SUBMITTABLE" if ok else "NOT SUBMITTABLE")
