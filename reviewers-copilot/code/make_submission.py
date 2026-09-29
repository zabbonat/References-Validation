"""
Build the LaTeX submission package for Scientometrics from output/main.tex.

Editorial Manager flattens folders and compiles a single main file, so the
package is flat: one .tex with the generated numbers and tables inlined,
figures next to it, the Springer Nature class and APA bibliography style, the
.bib and the .bbl produced here, and the compiled PDF for checking.

    python code/make_submission.py            refuses while any \\pending marker remains
    python code/make_submission.py --draft    builds anyway, with "draft" in the name

Requires pdflatex and bibtex on the path.
"""

import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "output"
OUT = REPO / "submission"
DRAFT = "--draft" in sys.argv


def inline(tex: str) -> str:
    """Replace \\input{x} by the contents of output/x.tex, recursively."""
    def repl(m):
        path = SRC / (m.group(1) + ".tex")
        return inline(path.read_text(encoding="utf-8")).rstrip("\n")
    return re.sub(r"\\input\{([^}]+)\}", repl, tex)


tex = inline((SRC / "main.tex").read_text(encoding="utf-8"))
tex = tex.replace("{figures/", "{")

# a marker left in the text means something the author must still confirm
body = tex.split("\\begin{document}", 1)[1]
pending = re.findall(r"\\pending\{([^}]*)\}", body)
if pending and not DRAFT:
    sys.exit("not built: pending markers remain: " + "; ".join(pending))

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
(OUT / "main.tex").write_text(tex, encoding="utf-8")
for name in ["references.bib", "sn-jnl.cls", "sn-apacite.bst"]:
    shutil.copy(SRC / name, OUT / name)
figures = sorted(set(re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", tex)))
for fig in figures:
    shutil.copy(SRC / "figures" / fig, OUT / fig)

for cmd in (["pdflatex", "-interaction=nonstopmode", "main.tex"], ["bibtex", "main"],
            ["pdflatex", "-interaction=nonstopmode", "main.tex"], ["pdflatex", "-interaction=nonstopmode", "main.tex"]):
    subprocess.run(cmd, cwd=OUT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
log = (OUT / "main.log").read_text(encoding="utf-8", errors="replace")
errors = [l for l in log.splitlines() if l.startswith("!")]
undefined = re.findall(r"(?:Citation|Reference) `[^']+' on page \d+ undefined", log)
if errors or undefined or not (OUT / "main.pdf").exists():
    sys.exit(f"compilation problems: {errors[:3]} {undefined[:3]}")

stem = "Abbonato_Scientometrics_submission" + ("_draft" if DRAFT else "")
keep = ["main.tex", "main.bbl", "references.bib", "sn-jnl.cls", "sn-apacite.bst", "main.pdf"] + figures
with zipfile.ZipFile(OUT / f"{stem}.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in keep:
        z.write(OUT / name, name)
shutil.copy(OUT / "main.pdf", OUT / f"{stem}.pdf")
for f in OUT.iterdir():
    if f.name not in keep + [f"{stem}.zip", f"{stem}.pdf"]:
        f.unlink()
print(f"{stem}.zip: " + ", ".join(keep))
if pending:
    print("pending markers: " + "; ".join(pending))
