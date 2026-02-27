@echo off
REM Multi-task training pipeline: DEAM (emotion) + Harmonix (structure)
REM Запуск на Windows с NVIDIA GPU (CUDA)
REM
REM Предварительно:
REM   python -m venv .venv
REM   .venv\Scripts\activate
REM   pip install -e ".[dev]"
REM
REM Данные должны лежать в data\deam\ и data\structure\

echo === Step 1: Compute stats.npz for DEAM ===
python scripts/prepare_deam.py --deam-dir data/deam --output-dir data/deam --compute-stats
if %errorlevel% neq 0 goto :error

echo.
echo === Step 2: Compute stats.npz for Structure ===
python scripts/prepare_structure.py --harmonix-dir data/harmonixset --output-dir data/structure --compute-stats
if %errorlevel% neq 0 goto :error

echo.
echo === Step 3: Multi-task training ===
python scripts/train.py --config configs/default.yaml --deam-dir data/deam --structure-dir data/structure --output-dir checkpoints/multitask_v2
if %errorlevel% neq 0 goto :error

echo.
echo === Step 4a: Evaluation — Emotion (DEAM) ===
python scripts/eval.py --ckpt checkpoints/multitask_v2/best.pt --config configs/default.yaml --deam-dir data/deam --output results/multitask_v2/metrics.csv --plot-dir results/multitask_v2/plots
if %errorlevel% neq 0 goto :error

echo.
echo === Step 4b: Evaluation — Structure (Harmonix) ===
python scripts/eval.py --ckpt checkpoints/multitask_v2/best.pt --config configs/default.yaml --structure-dir data/structure --output results/multitask_v2/structure_metrics.csv --plot-dir results/multitask_v2/plots
if %errorlevel% neq 0 goto :error

echo.
echo === Step 5: Demo inference ===
python scripts/infer.py --audio data/deam/audio/10.mp3 --ckpt checkpoints/multitask_v2/best.pt --config configs/default.yaml --out results/multitask_v2/demo_timeline.json --plot results/multitask_v2/demo_timeline.png
if %errorlevel% neq 0 goto :error

echo.
echo === Done! ===
echo Checkpoints: checkpoints\multitask_v2\
echo Results:     results\multitask_v2\
goto :end

:error
echo.
echo === FAILED at step above ===
exit /b 1

:end
