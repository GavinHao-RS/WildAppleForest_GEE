from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Archive the current experiment outputs, notebook snapshot, and optional extra files."
    )
    parser.add_argument(
        "--label",
        default="experiment_output",
        help="Prefix used in the archive folder name, e.g. baseline_output or screened_output.",
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Repository root. Defaults to the parent directory of this script.",
    )
    parser.add_argument(
        "--outputs-dir",
        default="outputs/wildapple_localrun_2021",
        help="Relative or absolute path of the output directory to archive.",
    )
    parser.add_argument(
        "--notebook",
        default="wildapple_localrun_python.ipynb",
        help="Relative or absolute path of the notebook to snapshot.",
    )
    parser.add_argument(
        "--archive-root",
        default="archive",
        help="Relative or absolute path of the archive root directory.",
    )
    parser.add_argument(
        "--include",
        action="append",
        default=[],
        help="Optional extra file or directory to copy into the archive. Repeat this flag if needed.",
    )
    return parser


def resolve_path(repo_root: Path, value: str) -> Path:
    candidate = Path(value)
    return candidate if candidate.is_absolute() else repo_root / candidate


def copy_tree_contents(src_dir: Path, dst_dir: Path) -> list[str]:
    copied = []
    for item in sorted(src_dir.iterdir()):
        target = dst_dir / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy2(item, target)
        copied.append(str(target))
    return copied


def copy_any(src: Path, dst: Path) -> None:
    if src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def main() -> None:
    args = build_parser().parse_args()
    repo_root = resolve_path(Path(__file__).resolve().parents[1], args.repo_root) if args.repo_root else Path(__file__).resolve().parents[1]

    outputs_dir = resolve_path(repo_root, args.outputs_dir)
    notebook_path = resolve_path(repo_root, args.notebook)
    archive_root = resolve_path(repo_root, args.archive_root)

    timestamp = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    archive_dir = archive_root / f"{args.label}_{timestamp}"
    archive_dir.mkdir(parents=True, exist_ok=False)

    if not outputs_dir.exists():
        raise FileNotFoundError(f"Outputs directory does not exist: {outputs_dir}")
    if not notebook_path.exists():
        raise FileNotFoundError(f"Notebook path does not exist: {notebook_path}")

    copied_outputs = copy_tree_contents(outputs_dir, archive_dir)

    notebook_copy_name = f"{notebook_path.stem}_{timestamp}{notebook_path.suffix}"
    notebook_copy_path = archive_dir / notebook_copy_name
    shutil.copy2(notebook_path, notebook_copy_path)

    copied_extra = []
    for extra in args.include:
        extra_src = resolve_path(repo_root, extra)
        if not extra_src.exists():
            raise FileNotFoundError(f"Included path does not exist: {extra_src}")
        target = archive_dir / extra_src.name
        copy_any(extra_src, target)
        copied_extra.append(str(target))

    manifest = {
        "timestamp": datetime.now().astimezone().isoformat(),
        "label": args.label,
        "repo_root": str(repo_root),
        "archive_dir": str(archive_dir),
        "outputs_dir": str(outputs_dir),
        "notebook": str(notebook_path),
        "notebook_copy": str(notebook_copy_path),
        "copied_output_items": copied_outputs,
        "copied_extra_items": copied_extra,
    }
    (archive_dir / "archive_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Archive created: {archive_dir}")
    print(f"Notebook snapshot: {notebook_copy_path.name}")
    print(f"Manifest: {archive_dir / 'archive_manifest.json'}")


if __name__ == "__main__":
    main()
