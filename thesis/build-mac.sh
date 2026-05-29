#!/usr/bin/env bash
# Сборка main.pdf на macOS (BasicTeX + пакеты из usermode + biber 2.21).
# Usage:  cd thesis && ./build-mac.sh
#
# Требует: pdflatex (BasicTeX, /Library/TeX/texbin) и biber в PATH (~/.local/bin).

set -e
cd "$(dirname "$0")"

export PATH="/Library/TeX/texbin:$HOME/.local/bin:$PATH"

echo "[build] pdflatex pass 1..."
pdflatex -interaction=nonstopmode -halt-on-error main.tex >/tmp/mac-pl1.log 2>&1 || {
  echo "[build] FAILED pass 1:"; grep -n '^!' /tmp/mac-pl1.log | head; exit 1; }

echo "[build] biber..."
biber main >/tmp/mac-biber.log 2>&1 || { echo "[build] biber failed:"; tail -20 /tmp/mac-biber.log; exit 1; }

echo "[build] pdflatex pass 2..."
pdflatex -interaction=nonstopmode -halt-on-error main.tex >/tmp/mac-pl2.log 2>&1 || {
  echo "[build] FAILED pass 2:"; grep -n '^!' /tmp/mac-pl2.log | head; exit 1; }

echo "[build] pdflatex pass 3..."
pdflatex -interaction=nonstopmode -halt-on-error main.tex >/tmp/mac-pl3.log 2>&1 || {
  echo "[build] FAILED pass 3:"; grep -n '^!' /tmp/mac-pl3.log | head; exit 1; }

PAGES=$(pdfinfo main.pdf 2>/dev/null | awk '/^Pages/{print $2}')
echo ""
echo "[build] OK ✓  main.pdf — ${PAGES:-?} страниц"
