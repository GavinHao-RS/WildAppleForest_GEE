from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import pandas as pd

matplotlib.use("Agg")


def build_problem_dataframe():
    months = ["M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10"]
    return pd.DataFrame(
        {
            "Month": months,
            "S1 image count": [36, 37, 38, 32, 36, 35, 36, 34],
            "Ascending": [23, 25, 23, 22, 23, 24, 22, 23],
            "Descending": [13, 12, 15, 10, 13, 11, 14, 11],
            "S1 total sample": [22, 19, 7, 11, 11, 13, 14, 14],
            "VV": [2030] * 8,
            "VH": [2030] * 8,
            "VV_db": [298, 295, 267, 256, 241, 232, 196, 302],
            "VH_db": [22, 19, 7, 11, 11, 13, 14, 14],
            "VV_VH_ratio": [2030] * 8,
        }
    )


def build_validation_dataframe():
    months = ["M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10"]
    return pd.DataFrame(
        {
            "Month": months,
            "S1 image count": [36, 37, 38, 32, 36, 35, 36, 34],
            "Ascending": [23, 25, 23, 22, 23, 24, 22, 23],
            "Descending": [13, 12, 15, 10, 13, 11, 14, 11],
            "S1 total sample": [2030] * 8,
            "VV": [2030] * 8,
            "VH": [2030] * 8,
            "VV_db": [2030] * 8,
            "VH_db": [2030] * 8,
            "VV_VH_ratio": [2030] * 8,
        }
    )


def build_orbit_split_dataframe():
    months = ["M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10"]
    return pd.DataFrame(
        {
            "Month": months,
            "S1 image count": [36, 37, 38, 32, 36, 35, 36, 34],
            "Ascending": [23, 25, 23, 22, 23, 24, 22, 23],
            "Descending": [13, 12, 15, 10, 13, 11, 14, 11],
            "ASC sample": [2030] * 8,
            "DESC sample": [1674, 1674, 1674, 1674, 1674, 1674, 1674, 1675],
            "ASC VV_db": [2030] * 8,
            "ASC VH_db": [2030] * 8,
            "DESC VV_db": [1674, 1674, 1674, 1674, 1674, 1674, 1674, 1675],
            "DESC VH_db": [1674, 1674, 1674, 1674, 1674, 1674, 1674, 1675],
        }
    )


def render_table_png(df: pd.DataFrame, output_path: Path, title: str):
    fig, ax = plt.subplots(figsize=(16, 4.8), dpi=200)
    ax.axis("off")
    table = ax.table(
        cellText=df.values.tolist(),
        colLabels=list(df.columns),
        loc="center",
        cellLoc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1, 1.5)

    for (row, col), cell in table.get_celld().items():
        if row == 0:
            cell.set_facecolor("#1f4e79")
            cell.set_text_props(color="white", weight="bold")
        elif col in [5, 6, 8]:
            cell.set_facecolor("#eaf3ff")
        elif col == 7:
            cell.set_facecolor("#fff2cc")
        elif col == 4:
            cell.set_facecolor("#fce4d6")

    fig.suptitle(title, fontsize=14, fontweight="bold", y=0.75)
    fig.tight_layout(rect=[0, 0, 1, 0.92])
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


def render_bar_chart_png(df: pd.DataFrame, output_path: Path, title: str):
    plot_df = df[["Month", "VV", "VH", "VV_db", "VH_db", "VV_VH_ratio"]].set_index("Month")
    colors = {
        "VV": "#4C78A8",
        "VH": "#72B7B2",
        "VV_db": "#F58518",
        "VH_db": "#E45756",
        "VV_VH_ratio": "#54A24B",
    }

    fig, ax = plt.subplots(figsize=(14, 7), dpi=200)
    plot_df.plot(kind="bar", ax=ax, color=[colors[c] for c in plot_df.columns], width=0.82)
    ax.set_title(title, fontsize=15, fontweight="bold", pad=28)
    ax.set_xlabel("Month")
    ax.set_ylabel("Sample count")
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.legend(
        title="Band",
        ncols=2,
        frameon=False,
        loc="upper right",
        bbox_to_anchor=(0.98, 1.12),
    )
    ymax = float(plot_df.to_numpy().max())
    ax.set_ylim(0, ymax * 1.14)

    for container in ax.containers:
        labels = [f"{int(bar.get_height())}" for bar in container]
        ax.bar_label(container, labels=labels, padding=2, fontsize=7, rotation=90)

    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    fig.tight_layout(rect=[0, 0, 1, 0.93])
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


def render_orbit_split_bar_chart_png(df: pd.DataFrame, output_path: Path, title: str):
    plot_df = df[["Month", "ASC sample", "DESC sample"]].set_index("Month")
    colors = {
        "ASC sample": "#4C78A8",
        "DESC sample": "#E45756",
    }

    fig, ax = plt.subplots(figsize=(13, 6.5), dpi=200)
    plot_df.plot(kind="bar", ax=ax, color=[colors[c] for c in plot_df.columns], width=0.72)
    ax.set_title(title, fontsize=15, fontweight="bold", pad=24)
    ax.set_xlabel("Month")
    ax.set_ylabel("Sample count")
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.legend(
        title="Orbit pass",
        ncols=2,
        frameon=False,
        loc="upper right",
        bbox_to_anchor=(0.98, 1.10),
    )
    ymax = float(plot_df.to_numpy().max())
    ax.set_ylim(0, ymax * 1.12)

    for container in ax.containers:
        labels = [f"{int(bar.get_height())}" for bar in container]
        ax.bar_label(container, labels=labels, padding=2, fontsize=8)

    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    fig.tight_layout(rect=[0, 0, 1, 0.94])
    fig.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


def main():
    repo_root = Path(__file__).resolve().parents[1]
    out_dir = repo_root / "outputs" / "debug_figures"
    out_dir.mkdir(parents=True, exist_ok=True)

    problem_df = build_problem_dataframe()
    render_table_png(
        problem_df,
        out_dir / "wildapple_s1_sampling_diagnostics_table.png",
        "Wild Apple S1 Monthly Sampling Diagnostics Table",
    )
    render_bar_chart_png(
        problem_df,
        out_dir / "wildapple_s1_sampling_diagnostics_barchart.png",
        "Wild Apple S1 Monthly Sample Counts by Band",
    )

    validation_df = build_validation_dataframe()
    render_table_png(
        validation_df,
        out_dir / "wildapple_s1_sampling_validation_table.png",
        "Wild Apple S1 Minimal-Fix Validation Table",
    )
    render_bar_chart_png(
        validation_df,
        out_dir / "wildapple_s1_sampling_validation_barchart.png",
        "Wild Apple S1 Minimal-Fix Validation Counts by Band",
    )

    orbit_df = build_orbit_split_dataframe()
    render_table_png(
        orbit_df,
        out_dir / "wildapple_s1_orbit_split_table_20260410.png",
        "Wild Apple S1 Orbit-Split Diagnostics Table (2026-04-10)",
    )
    render_orbit_split_bar_chart_png(
        orbit_df,
        out_dir / "wildapple_s1_orbit_split_barchart_20260410.png",
        "Wild Apple S1 ASC vs DESC Sample Counts (2026-04-10)",
    )

    print(out_dir / "wildapple_s1_sampling_diagnostics_table.png")
    print(out_dir / "wildapple_s1_sampling_diagnostics_barchart.png")
    print(out_dir / "wildapple_s1_sampling_validation_table.png")
    print(out_dir / "wildapple_s1_sampling_validation_barchart.png")
    print(out_dir / "wildapple_s1_orbit_split_table_20260410.png")
    print(out_dir / "wildapple_s1_orbit_split_barchart_20260410.png")


if __name__ == "__main__":
    main()
