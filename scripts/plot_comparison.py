"""Generate comparison bar charts for all configurations."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path


def plot_config_comparison(output_path: str) -> None:
    """Bar chart: 5 configs × 4 tasks (accuracy)."""
    configs = ["CNN v2", "CNN+BiLSTM\nv2", "PANNs+Linear\nv2", "PANNs+BiLSTM\nv2", "AST\n(fine-tuned)"]
    tasks = ["Segment", "Arousal", "Valence", "Genre"]

    # Best results per config (accuracy %)
    data = np.array([
        [35.3, 62.0, 51.7, 83.9],   # CNN v2
        [32.2, 62.3, 54.2, 60.9],   # CNN+LSTM v2
        [24.0, 61.2, 53.8, 81.9],   # PANNs v2
        [32.9, 64.9, 55.0, 77.7],   # PANNs+LSTM v2
        [40.6, 60.6, 51.1, 81.5],   # AST v2
    ])

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(len(tasks))
    width = 0.15
    colors = ["#2196F3", "#4CAF50", "#FF9800", "#9C27B0", "#F44336"]

    for i, (config, color) in enumerate(zip(configs, colors)):
        offset = (i - 2) * width
        bars = ax.bar(x + offset, data[i], width, label=config, color=color, alpha=0.85)
        for bar, val in zip(bars, data[i]):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                    f"{val:.1f}", ha="center", va="bottom", fontsize=7, fontweight="bold")

    ax.set_ylabel("Accuracy (%)", fontsize=12)
    ax.set_title("Comparison of 5 Configurations Across 4 Tasks", fontsize=14, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(tasks, fontsize=11)
    ax.legend(loc="upper left", fontsize=9)
    ax.set_ylim(0, 100)
    ax.grid(axis="y", alpha=0.3)
    ax.axhline(y=33.3, color="gray", linestyle="--", alpha=0.4, label="Random (3-class)")
    ax.axhline(y=16.7, color="gray", linestyle=":", alpha=0.4, label="Random (6-class)")

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches="tight")
    print(f"Saved: {output_path}")
    plt.close()


def plot_v1_vs_v2(output_path: str) -> None:
    """Bar chart: v1 vs v2 deltas for CNN baseline."""
    tasks = ["Segment", "Arousal", "Valence", "Genre"]
    v1 = [24.3, 65.9, 55.8, 82.7]
    v2 = [35.3, 62.0, 51.7, 83.9]
    deltas = [v2[i] - v1[i] for i in range(4)]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    # Left: side-by-side bars
    x = np.arange(len(tasks))
    width = 0.35
    bars1 = ax1.bar(x - width/2, v1, width, label="v1 (baseline)", color="#BBDEFB", edgecolor="#1565C0")
    bars2 = ax1.bar(x + width/2, v2, width, label="v2 (improved)", color="#1565C0")

    for bar, val in zip(bars1, v1):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                f"{val:.1f}", ha="center", va="bottom", fontsize=9)
    for bar, val in zip(bars2, v2):
        ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
                f"{val:.1f}", ha="center", va="bottom", fontsize=9)

    ax1.set_ylabel("Accuracy (%)", fontsize=11)
    ax1.set_title("CNN Baseline: v1 vs v2", fontsize=13, fontweight="bold")
    ax1.set_xticks(x)
    ax1.set_xticklabels(tasks)
    ax1.legend()
    ax1.set_ylim(0, 100)
    ax1.grid(axis="y", alpha=0.3)

    # Right: delta bars
    colors = ["#4CAF50" if d > 0 else "#F44336" for d in deltas]
    bars = ax2.bar(tasks, deltas, color=colors, alpha=0.85)
    for bar, d in zip(bars, deltas):
        ax2.text(bar.get_x() + bar.get_width()/2,
                bar.get_height() + (0.3 if d > 0 else -0.8),
                f"{d:+.1f}%", ha="center", va="bottom" if d > 0 else "top",
                fontsize=11, fontweight="bold")

    ax2.set_ylabel("Delta (%)", fontsize=11)
    ax2.set_title("Improvement v1 → v2", fontsize=13, fontweight="bold")
    ax2.axhline(y=0, color="black", linewidth=0.8)
    ax2.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches="tight")
    print(f"Saved: {output_path}")
    plt.close()


def plot_factorial_heatmap(output_path: str) -> None:
    """2x2 factorial heatmap for segment accuracy."""
    fig, axes = plt.subplots(1, 4, figsize=(16, 4))
    task_names = ["Segment", "Arousal", "Valence", "Genre"]

    # [CNN per-window, CNN+BiLSTM, PANNs per-window, PANNs+BiLSTM]
    data_all = {
        "Segment": np.array([[35.3, 32.2], [24.0, 32.9]]),
        "Arousal": np.array([[62.0, 62.3], [61.2, 64.9]]),
        "Valence": np.array([[51.7, 54.2], [53.8, 55.0]]),
        "Genre": np.array([[83.9, 60.9], [81.9, 77.7]]),
    }

    for ax, task in zip(axes, task_names):
        data = data_all[task]
        im = ax.imshow(data, cmap="YlOrRd", aspect="auto", vmin=20, vmax=90)
        ax.set_xticks([0, 1])
        ax.set_xticklabels(["Per-window", "BiLSTM"], fontsize=9)
        ax.set_yticks([0, 1])
        ax.set_yticklabels(["CNN", "PANNs"], fontsize=9)
        ax.set_title(task, fontsize=12, fontweight="bold")

        for i in range(2):
            for j in range(2):
                ax.text(j, i, f"{data[i, j]:.1f}%", ha="center", va="center",
                       fontsize=12, fontweight="bold",
                       color="white" if data[i, j] > 60 else "black")

    fig.suptitle("2×2 Factorial Experiment: Accuracy by Task", fontsize=14, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(output_path, dpi=200, bbox_inches="tight")
    print(f"Saved: {output_path}")
    plt.close()


if __name__ == "__main__":
    out = Path("results/plots")
    out.mkdir(parents=True, exist_ok=True)

    plot_config_comparison(str(out / "comparison_5configs.png"))
    plot_v1_vs_v2(str(out / "v1_vs_v2_cnn.png"))
    plot_factorial_heatmap(str(out / "factorial_heatmap.png"))
