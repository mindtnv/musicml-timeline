#!/usr/bin/env bash
# Сборка thesis.pdf одной командой
# Usage:  cd thesis && ./build.sh
#
# Требует: MiKTeX (xelatex + biber) + Strawberry Perl (для latexmk)

set -e

# Add MiKTeX to PATH if not present
if ! command -v pdflatex >/dev/null 2>&1; then
  export PATH="/c/Users/mindt/AppData/Local/Programs/MiKTeX/miktex/bin/x64:$PATH"
fi

cd "$(dirname "$0")"

echo "[build] pdflatex pass 1..."
pdflatex -interaction=batchmode -halt-on-error main.tex > /tmp/pdflatex1.log 2>&1 || {
  echo "[build] FAILED on pass 1. Last 30 lines of log:"
  tail -30 main.log 2>/dev/null || tail -30 /tmp/pdflatex1.log
  exit 1
}

echo "[build] biber..."
biber main > /tmp/biber.log 2>&1 || {
  echo "[build] biber failed. Log:"
  cat /tmp/biber.log
  # Continue — biber failing is non-fatal if no \cite
}

echo "[build] pdflatex pass 2..."
pdflatex -interaction=batchmode -halt-on-error main.tex > /tmp/pdflatex2.log 2>&1 || {
  echo "[build] FAILED on pass 2. Last 30 lines:"
  tail -30 main.log
  exit 1
}

echo "[build] pdflatex pass 3..."
pdflatex -interaction=batchmode -halt-on-error main.tex > /tmp/pdflatex3.log 2>&1 || {
  echo "[build] FAILED on pass 3. Last 30 lines:"
  tail -30 main.log
  exit 1
}

PAGES=$(pdfinfo main.pdf 2>/dev/null | grep "^Pages" | awk '{print $2}')
SIZE=$(du -h main.pdf | awk '{print $1}')
echo ""
echo "[build] OK ✓"
echo "[build] main.pdf — ${PAGES:-?} страниц, ${SIZE}"
