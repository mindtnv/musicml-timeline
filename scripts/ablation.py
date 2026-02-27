"""Run ablation experiments: vary features and dataset combinations.

Orchestrates 4 experiments:
    1. baseline_multitask: log_mel, DEAM + Structure, in_channels=1
    2. logmel_chroma_multitask: log_mel_chroma, DEAM + Structure, in_channels=2
    3. singletask_emotion: log_mel, DEAM only, in_channels=1
    4. singletask_structure: log_mel, Structure only, in_channels=1

Each experiment: generate modified config -> train -> eval -> collect results.

Usage:
    python scripts/ablation.py --config configs/default.yaml \
        --deam-dir data/deam --structure-dir data/structure \
        --output-dir results/ablation \
        --experiments baseline_multitask logmel_chroma_multitask
"""

from __future__ import annotations

import argparse
import copy
import csv
import subprocess
import sys
from pathlib import Path

import yaml

EXPERIMENTS = {
    "baseline_multitask": {
        "features_mode": "log_mel",
        "in_channels": 1,
        "use_deam": True,
        "use_structure": True,
    },
    "logmel_chroma_multitask": {
        "features_mode": "log_mel_chroma",
        "in_channels": 2,
        "use_deam": True,
        "use_structure": True,
    },
    "singletask_emotion": {
        "features_mode": "log_mel",
        "in_channels": 1,
        "use_deam": True,
        "use_structure": False,
    },
    "singletask_structure": {
        "features_mode": "log_mel",
        "in_channels": 1,
        "use_deam": False,
        "use_structure": True,
    },
}


def generate_config(base_cfg: dict, experiment: dict) -> dict:
    """Create a modified config for an experiment."""
    cfg = copy.deepcopy(base_cfg)
    cfg["features"]["mode"] = experiment["features_mode"]
    cfg["model"]["in_channels"] = experiment["in_channels"]
    return cfg


def run_experiment(
    name: str,
    experiment: dict,
    base_cfg: dict,
    deam_dir: Path | None,
    structure_dir: Path | None,
    output_dir: Path,
) -> dict | None:
    """Run a single ablation experiment (train + eval)."""
    exp_dir = output_dir / name
    exp_dir.mkdir(parents=True, exist_ok=True)

    cfg = generate_config(base_cfg, experiment)
    config_path = exp_dir / "config.yaml"
    with open(config_path, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False)

    # Build train command
    train_cmd = [
        sys.executable, "scripts/train.py",
        "--config", str(config_path),
        "--output-dir", str(exp_dir / "checkpoints"),
    ]
    if experiment["use_deam"] and deam_dir:
        train_cmd.extend(["--deam-dir", str(deam_dir)])
    if experiment["use_structure"] and structure_dir:
        train_cmd.extend(["--structure-dir", str(structure_dir)])

    print(f"\n{'='*60}")
    print(f"Experiment: {name}")
    print(f"  features_mode: {experiment['features_mode']}")
    print(f"  in_channels: {experiment['in_channels']}")
    print(f"  use_deam: {experiment['use_deam']}")
    print(f"  use_structure: {experiment['use_structure']}")
    print(f"{'='*60}")

    print(f"\nTraining: {' '.join(train_cmd)}")
    result = subprocess.run(train_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Training FAILED for {name}:")
        print(result.stderr)
        return None
    print(result.stdout)

    # Build eval command
    ckpt_path = exp_dir / "checkpoints" / "best.pt"
    if not ckpt_path.exists():
        print(f"No best.pt found for {name}, skipping eval")
        return None

    metrics_path = exp_dir / "metrics.csv"
    eval_cmd = [
        sys.executable, "scripts/eval.py",
        "--config", str(config_path),
        "--ckpt", str(ckpt_path),
        "--output", str(metrics_path),
        "--plot-dir", str(exp_dir / "plots"),
    ]
    if experiment["use_deam"] and deam_dir:
        eval_cmd.extend(["--deam-dir", str(deam_dir)])
    if experiment["use_structure"] and structure_dir:
        eval_cmd.extend(["--structure-dir", str(structure_dir)])

    print(f"\nEvaluating: {' '.join(eval_cmd)}")
    result = subprocess.run(eval_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Evaluation FAILED for {name}:")
        print(result.stderr)
        return None
    print(result.stdout)

    # Parse metrics CSV
    if metrics_path.exists():
        return parse_metrics_csv(metrics_path)
    return None


def parse_metrics_csv(csv_path: Path) -> dict:
    """Parse a metrics CSV into a summary dict."""
    summary: dict = {}
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            head = row["head"]
            if head not in summary:
                summary[head] = {
                    "accuracy": float(row["accuracy"]),
                    "macro_f1": float(row["macro_f1"]),
                }
    return summary


def write_comparison_csv(
    all_results: dict[str, dict],
    output_path: Path,
) -> None:
    """Write comparison CSV with one row per (experiment, head)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["experiment", "head", "accuracy", "macro_f1"])
        for exp_name, heads in all_results.items():
            for head_name, metrics in heads.items():
                writer.writerow([
                    exp_name,
                    head_name,
                    f"{metrics['accuracy']:.4f}",
                    f"{metrics['macro_f1']:.4f}",
                ])


def plot_comparison(
    all_results: dict[str, dict],
    output_path: Path,
) -> None:
    """Create a grouped bar chart comparing experiments."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    heads = sorted(
        {h for exp in all_results.values() for h in exp},
    )
    exp_names = list(all_results.keys())

    x = np.arange(len(heads))
    width = 0.8 / max(len(exp_names), 1)

    fig, ax = plt.subplots(figsize=(10, 6))
    for i, exp_name in enumerate(exp_names):
        values = [
            all_results[exp_name].get(h, {}).get("macro_f1", 0) for h in heads
        ]
        ax.bar(x + i * width, values, width, label=exp_name)

    ax.set_ylabel("Macro F1")
    ax.set_title("Ablation Experiment Comparison")
    ax.set_xticks(x + width * (len(exp_names) - 1) / 2)
    ax.set_xticklabels(heads)
    ax.legend()
    ax.set_ylim(0, 1)

    fig.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ablation experiments")
    parser.add_argument(
        "--config", default="configs/default.yaml", help="Base config file",
    )
    parser.add_argument("--deam-dir", default=None, help="DEAM data directory")
    parser.add_argument(
        "--structure-dir", default=None, help="Structure data directory",
    )
    parser.add_argument(
        "--output-dir", default="results/ablation", help="Output directory",
    )
    parser.add_argument(
        "--experiments",
        nargs="+",
        default=list(EXPERIMENTS.keys()),
        choices=list(EXPERIMENTS.keys()),
        help="Experiments to run (default: all)",
    )
    args = parser.parse_args()

    with open(args.config) as f:
        base_cfg = yaml.safe_load(f)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    deam_dir = Path(args.deam_dir) if args.deam_dir else None
    structure_dir = Path(args.structure_dir) if args.structure_dir else None

    all_results: dict[str, dict] = {}

    for exp_name in args.experiments:
        experiment = EXPERIMENTS[exp_name]
        result = run_experiment(
            exp_name, experiment, base_cfg, deam_dir, structure_dir, output_dir,
        )
        if result:
            all_results[exp_name] = result

    if all_results:
        comparison_path = output_dir / "comparison.csv"
        write_comparison_csv(all_results, comparison_path)
        print(f"\nComparison CSV: {comparison_path}")

        chart_path = output_dir / "comparison.png"
        plot_comparison(all_results, chart_path)
        print(f"Comparison chart: {chart_path}")

    print("\n=== Ablation Complete ===")
    for exp_name, heads in all_results.items():
        for head, m in heads.items():
            print(
                f"  {exp_name}/{head}: "
                f"acc={m['accuracy']:.4f}, f1={m['macro_f1']:.4f}"
            )


if __name__ == "__main__":
    main()
