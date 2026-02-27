#!/bin/bash
# Multi-task training pipeline: DEAM (emotion) + Harmonix (structure)
# Запуск на машине с NVIDIA GPU (CUDA)
#
# Предварительно:
#   python -m venv .venv && source .venv/bin/activate
#   pip install -e ".[dev]"
#
# Данные должны лежать в data/deam/ и data/structure/
# (features уже предвычислены, нужны только stats.npz)

set -euo pipefail

echo "=== Step 1: Compute stats.npz for DEAM ==="
python scripts/prepare_deam.py \
    --deam-dir data/deam \
    --output-dir data/deam \
    --compute-stats

echo ""
echo "=== Step 2: Compute stats.npz for Structure ==="
python scripts/prepare_structure.py \
    --harmonix-dir data/harmonixset \
    --output-dir data/structure \
    --compute-stats

echo ""
echo "=== Step 3: Multi-task training ==="
python scripts/train.py \
    --config configs/default.yaml \
    --deam-dir data/deam \
    --structure-dir data/structure \
    --output-dir checkpoints/multitask_v2

echo ""
echo "=== Step 4a: Evaluation — Emotion (DEAM) ==="
python scripts/eval.py \
    --ckpt checkpoints/multitask_v2/best.pt \
    --config configs/default.yaml \
    --deam-dir data/deam \
    --output results/multitask_v2/metrics.csv \
    --plot-dir results/multitask_v2/plots

echo ""
echo "=== Step 4b: Evaluation — Structure (Harmonix) ==="
python scripts/eval.py \
    --ckpt checkpoints/multitask_v2/best.pt \
    --config configs/default.yaml \
    --structure-dir data/structure \
    --output results/multitask_v2/structure_metrics.csv \
    --plot-dir results/multitask_v2/plots

echo ""
echo "=== Step 5: Demo inference ==="
python scripts/infer.py \
    --audio data/deam/audio/10.mp3 \
    --ckpt checkpoints/multitask_v2/best.pt \
    --config configs/default.yaml \
    --out results/multitask_v2/demo_timeline.json \
    --plot results/multitask_v2/demo_timeline.png

echo ""
echo "=== Done! ==="
echo "Checkpoints: checkpoints/multitask_v2/"
echo "Results:     results/multitask_v2/"
