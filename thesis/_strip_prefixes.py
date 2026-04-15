"""Strip duplicate chapter/section number prefixes from .tex headings.

After running, the auto-numbering from \section/\subsection (configured via
titlesec in main.tex) will produce the visible numbers; manual prefixes in
the .tex source would have caused duplication ("1.1 1.1 Music...").
"""
import re
import sys
from pathlib import Path

# Force UTF-8 stdout so Russian prints correctly on Windows console
sys.stdout.reconfigure(encoding="utf-8")

# Patterns to strip — applied in order
patterns = [
    # \section{Глава 1. Foo}                  → \section{Foo}
    (re.compile(r"(\\section\{)Глава\s+\d+\.\s*"),                r"\1"),
    # \section{Приложение A. Foo}             → \section{Foo}
    (re.compile(r"(\\section\{)Приложение\s+[A-Za-zА-Я]\.\s*"),  r"\1"),
    # \subsection{1.1 Foo}                    → \subsection{Foo}
    (re.compile(r"(\\subsection\{)\d+(\.\d+)+\s+"),               r"\1"),
    # \subsubsection{1.1.1 Foo}               → \subsubsection{Foo}
    (re.compile(r"(\\subsubsection\{)\d+(\.\d+){2,}\s+"),         r"\1"),
    # Appendix subsections "A.1 Foo"          → "Foo"
    (re.compile(r"(\\subsection\{)[A-Z]\.\d+\s+"),                r"\1"),
]

base = Path(__file__).resolve().parent / "chapters"
total = 0
for tex in sorted(base.glob("*.tex")):
    text = tex.read_text(encoding="utf-8")
    orig = text
    for pat, repl in patterns:
        text = pat.sub(repl, text)
    if text != orig:
        # Count by lines that are different (rough count of edits)
        changed = sum(1 for a, b in zip(orig.splitlines(), text.splitlines()) if a != b)
        tex.write_text(text, encoding="utf-8")
        print(f"  {tex.name}: ~{changed} headings stripped")
        total += changed
    else:
        print(f"  {tex.name}: (no changes)")

print(f"\nTOTAL: {total} prefix lines updated")
