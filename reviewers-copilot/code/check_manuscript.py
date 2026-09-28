"""
Pre-submission guard. Fails loudly if the manuscript quotes a macro that is not
defined, cites a key missing from the bibliography, or if a pending marker
survives in the text or in any generated number or table.
"""

import re
from pathlib import Path

OUT = Path(r"C:\Users\Dilet\Desktop\References-Validation\reviewers-copilot\output")

tex = (OUT / "main.tex").read_text(encoding="utf-8")
bib = (OUT / "references.bib").read_text(encoding="utf-8")
generated = {p.name: p.read_text(encoding="utf-8")
             for p in [OUT / "numbers.tex", OUT / "numbers_eval.tex", *OUT.glob("table_*.tex")]
             if p.exists()}

defined = set(re.findall(r"\\newcommand\{\\([A-Za-z]+)\}", "".join(generated.values()) + tex))
# a command is a backslash not itself preceded by one: "\\Word" is a line break
used = set(re.findall(r"(?<!\\)\\([A-Za-z]+)", tex))

# data macros follow a capitalised naming convention; capitalised LaTeX
# primitives are not data macros
LATEX = {"Phi", "Delta", "Sigma", "Omega", "Gamma", "Lambda", "Theta", "Pi",
         "Psi", "Xi", "Upsilon", "LaTeX", "TeX"}
data_used = {u for u in used if u[:1].isupper()} - LATEX
missing = sorted(data_used - defined)

cited = set()
for m in re.findall(r"\\cite[tp]?\{([^}]*)\}", tex):
    cited |= {k.strip() for k in m.split(",")}
bibkeys = set(re.findall(r"@\w+\{([^,]+),", bib))

pending = [("main.tex", p) for p in re.findall(r"\\pending\{([^}]*)\}", tex)]
for name, body in generated.items():
    pending += [(name, p) for p in re.findall(r"\\pending\{([^}]*)\}", body)]

# a quoted macro whose value is itself pending
pending_values = sorted(k for k, v in re.findall(r"\\newcommand\{\\([A-Za-z]+)\}\{(.*)\}",
                                                    "".join(generated.values()))
                        if "pending" in v and k in used)

print(f"macros used but undefined : {missing or 'none'}")
print(f"citations missing from bib: {sorted(cited - bibkeys) or 'none'}")
print(f"bib entries never cited   : {sorted(bibkeys - cited) or 'none'}")
print(f"pending markers           : {len(pending)}")
for where, p in pending:
    print(f"    - [{where}] {p}")
if pending_values:
    print(f"quoted values still pending: {', '.join(pending_values)}")

ok = not missing and not (cited - bibkeys) and not pending
print()
print("SUBMITTABLE" if ok else "NOT SUBMITTABLE")
