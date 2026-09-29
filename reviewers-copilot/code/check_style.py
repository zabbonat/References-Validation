"""
Style rules for the manuscript: no em dashes or double hyphens in the prose,
and no numbers at all in the introduction.
"""

import re
from pathlib import Path

tex = (Path(__file__).parent.parent / "output" / "main.tex").read_text(encoding="utf-8")
body = tex.split(r"\begin{document}")[1]

prose = re.sub(r"\\begin\{(table|tabular|tabularx|figure)\}.*?\\end\{\1\}", " ", body, flags=re.S)
prose = re.sub(r"\\c?midrule(\([^)]*\))?\{[^}]*\}", " ", prose)
dashes = prose.count("\u2014") + len(re.findall(r"(?<![-])--(?![-])", prose))

intro = tex.split(r"\section{Introduction}")[1].split(r"\section{Data and methods}")[0]
intro = re.sub(r"\\(cite[tp]?|ref|label)\{[^}]*\}", " ", intro)
digits = re.findall(r"\d+", intro)
macros = re.findall(r"\\([A-Z][A-Za-z]+)\{\}", intro)
spelled = [w for w in ["hundred", "thousand", "million", "one in", "half of", "a third", "a quarter"]
           if w in intro.lower()]

print(f"em dashes or double hyphens : {dashes}")
print(f"digits in the introduction  : {digits or 'none'}")
print(f"number macros in the intro  : {macros or 'none'}")
print(f"quantities in words (intro) : {spelled or 'none'}")
print("\nSTYLE OK" if not (dashes or digits or macros or spelled) else "\nSTYLE VIOLATIONS")
