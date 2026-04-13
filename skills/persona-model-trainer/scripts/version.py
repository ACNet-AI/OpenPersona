#!/usr/bin/env python3
"""
Model version management for persona-model-trainer.

Adapter weights are archived per-version (lightweight, ~150 MB each).
export/ holds only the currently active version's full artifacts (gguf/ollama/vllm).

Sub-commands:
  update-manifest  Record a new version in manifest.json (called by pipeline.sh)
  list             Show version history with fidelity scores and dates
  activate         Switch active version (re-exports from archived adapter)
  diff             Compare two versions side-by-side
  push             Push a version's adapter to HuggingFace Hub (optional)

Usage:
  python scripts/version.py list --slug samantha
  python scripts/version.py activate --slug samantha --version v1
  python scripts/version.py diff --slug samantha --version-a v1 --version-b v2
  python scripts/version.py push --slug samantha --version v2 --hf-repo alice/samantha-persona
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


# ── Helpers ────────────────────────────────────────────────────────────────

def _resolve_base_dir(slug: str, base_dir: str | None) -> Path:
    """Return the absolute base directory for the given slug."""
    if base_dir:
        return Path(base_dir).resolve()
    return Path(f"models/{slug}").resolve()


def _load_manifest(manifest_path: Path) -> dict:
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save_manifest(manifest_path: Path, data: dict) -> None:
    manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def _load_summary(summary_path: Path) -> dict:
    """Load a training_summary.json, returning {} on missing or malformed file."""
    if not summary_path.exists():
        return {}
    try:
        return json.loads(summary_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _sorted_version_dirs(adapters_dir: Path) -> list[Path]:
    """Return adapter version directories sorted numerically (v1 < v2 < ... < v10)."""
    dirs = [d for d in adapters_dir.iterdir() if d.is_dir() and d.name.startswith("v")]
    def _key(d: Path) -> int:
        try:
            return int(d.name[1:])
        except ValueError:
            return 0
    return sorted(dirs, key=_key)


# ── Sub-commands ───────────────────────────────────────────────────────────

def cmd_update_manifest(args: argparse.Namespace) -> None:
    """Record a new version in manifest.json (called by pipeline.sh after archiving)."""
    base_dir = _resolve_base_dir(args.slug, args.base_dir)
    manifest_path = base_dir / "manifest.json"

    manifest = _load_manifest(manifest_path)
    versions = manifest.get("versions") or []
    if args.version not in versions:
        versions.append(args.version)

    manifest["current"] = args.version
    manifest["versions"] = versions
    _save_manifest(manifest_path, manifest)
    print(f"manifest.json updated: current={args.version}, versions={versions}")


def cmd_list(args: argparse.Namespace) -> None:
    """Show version history table."""
    base_dir = _resolve_base_dir(args.slug, getattr(args, "base_dir", None))
    adapters_dir = base_dir / "adapters"
    manifest = _load_manifest(base_dir / "manifest.json")
    current = manifest.get("current", "")

    if not adapters_dir.exists():
        print("No versions yet. Run pipeline.sh to train a first version.")
        return

    version_dirs = _sorted_version_dirs(adapters_dir)
    if not version_dirs:
        print("No versions yet. Run pipeline.sh to train a first version.")
        return

    # Header — first-column width 11 = marker(1) + space(1) + version(9)
    print(f"\n  {'  VERSION':<11} {'TURNS':<8} {'FIDELITY':<12} {'BASE MODEL':<28} {'DATE':<12}")
    print(f"  {'-'*11} {'-'*8} {'-'*12} {'-'*28} {'-'*12}")

    for vdir in version_dirs:
        summary = _load_summary(vdir / "training_summary.json")
        voice   = _load_summary(vdir / "voice_test_results.json")

        version  = vdir.name
        turns    = str(summary.get("train_samples") or "—")
        fidelity_raw = voice.get("overall_score") if voice else None
        fidelity = f"{fidelity_raw:.1f}/5.0" if fidelity_raw is not None else "—"
        base_model = (summary.get("base_model") or "—")[:27]
        date_raw = summary.get("trained_at") or ""
        date = date_raw[:10] if date_raw else "—"

        marker = "*" if version == current else " "
        print(f"  {marker} {version:<9} {turns:<8} {fidelity:<12} {base_model:<28} {date:<12}")

    print()


def cmd_activate(args: argparse.Namespace) -> None:
    """Switch active version: clear export/, restore adapter, re-run export.py."""
    base_dir    = _resolve_base_dir(args.slug, getattr(args, "base_dir", None))
    adapters_dir = base_dir / "adapters"
    export_dir   = base_dir / "export"
    version      = args.version

    adapter_archive = adapters_dir / version
    if not adapter_archive.exists():
        print(f"Error: version {version} not found at {adapter_archive}", file=sys.stderr)
        sys.exit(1)

    summary = _load_summary(adapter_archive / "training_summary.json")
    if not summary:
        print(f"Error: training_summary.json missing or corrupt for {version}", file=sys.stderr)
        sys.exit(1)

    base_model = summary.get("base_model")
    if not base_model:
        print("Error: base_model not found in training_summary.json", file=sys.stderr)
        sys.exit(1)

    profile_path = summary.get("profile_path")
    # CLI overrides take priority over archived values
    formats = getattr(args, "formats", None) or summary.get("formats") or "gguf,ollama"
    quant   = getattr(args, "quant",   None) or summary.get("quant")   or "Q4_K_M"

    print(f"Activating version {version} for slug '{args.slug}'…")
    print(f"  base_model : {base_model}")
    print(f"  formats    : {formats}")
    print(f"  quant      : {quant}")

    # 1. Clear entire export/ to prevent stale files from previous version
    if export_dir.exists():
        shutil.rmtree(export_dir)
    export_dir.mkdir(parents=True)

    # 2. Restore adapter weights and metadata
    adapter_src = adapter_archive / "adapter_weights"
    if not adapter_src.exists():
        print(f"Error: adapter_weights/ missing from archive {adapter_archive}", file=sys.stderr)
        print(f"  The archive may be corrupt. Re-train to recreate it.", file=sys.stderr)
        sys.exit(1)
    shutil.copytree(adapter_src, export_dir / "adapter_weights")
    shutil.copy(adapter_archive / "training_summary.json", export_dir / "training_summary.json")
    voice_src = adapter_archive / "voice_test_results.json"
    if voice_src.exists():
        shutil.copy(voice_src, export_dir / "voice_test_results.json")

    # 2b. Optionally restore prepared/ dataset for training reproducibility
    if getattr(args, "restore_data", False):
        prepared_dir = base_dir / "prepared"
        data_src = adapter_archive / "data"
        if data_src.exists():
            if prepared_dir.exists():
                shutil.rmtree(prepared_dir)
            shutil.copytree(data_src, prepared_dir)
            print(f"  Restored dataset → {prepared_dir}")
        else:
            print("  Warning: no data/ archive for this version — skipping restore",
                  file=sys.stderr)

    # 3. Re-run export.py to rebuild gguf/ollama/vllm/onnx
    # export.py derives output dir from adapter_path.parent when --output-dir is absent.
    # Since adapter_path is absolute, parent = export_dir. ✓
    cmd = [
        sys.executable, str(SCRIPT_DIR / "export.py"),
        "--model",      str(export_dir / "adapter_weights"),
        "--base-model", base_model,
        "--slug",       args.slug,
        "--formats",    formats,
        "--quant",      quant,
    ]
    if profile_path and Path(profile_path).exists():
        cmd += ["--profile", profile_path]

    print(f"\nRunning export.py…")
    ret = subprocess.call(cmd)
    if ret != 0:
        print(f"Error: export.py exited with code {ret}", file=sys.stderr)
        sys.exit(ret)

    # 4. Update manifest
    manifest_path = base_dir / "manifest.json"
    manifest = _load_manifest(manifest_path)
    manifest["current"] = version
    _save_manifest(manifest_path, manifest)

    print(f"\n✅ Version {version} is now active.")


def cmd_diff(args: argparse.Namespace) -> None:
    """Compare two versions side-by-side."""
    base_dir     = _resolve_base_dir(args.slug, getattr(args, "base_dir", None))
    adapters_dir = base_dir / "adapters"

    va, vb = args.version_a, args.version_b
    path_a = adapters_dir / va / "training_summary.json"
    path_b = adapters_dir / vb / "training_summary.json"

    if not (adapters_dir / va).exists():
        print(f"Error: version {va} not found", file=sys.stderr)
        sys.exit(1)
    if not (adapters_dir / vb).exists():
        print(f"Error: version {vb} not found", file=sys.stderr)
        sys.exit(1)

    sa = _load_summary(path_a)
    sb = _load_summary(path_b)

    fields = [
        ("version",      "version"),
        ("base_model",   "base_model"),
        ("method",       "method"),
        ("epochs",       "epochs"),
        ("lora_rank",    "lora_rank"),
        ("train_turns",  "train_samples"),
        ("fidelity",     None),     # special: from voice_test_results.json
        ("perplexity",   None),     # special: from evaluation block
        ("probe_score",  None),     # special: from evaluation block
        ("formats",       "formats"),
        ("quant",         "quant"),
        ("trained_at",    "trained_at"),
        ("data_samples",  "data_samples"),
        ("data_hash",     "data_hash"),
    ]

    voice_a = _load_summary(adapters_dir / va / "voice_test_results.json")
    voice_b = _load_summary(adapters_dir / vb / "voice_test_results.json")

    print(f"\n  {'FIELD':<16} {va:<30} {vb:<30}")
    print(f"  {'-'*16} {'-'*30} {'-'*30}")

    for label, key in fields:
        if key == "base_model":
            val_a = (sa.get(key) or "—")[:29]
            val_b = (sb.get(key) or "—")[:29]
        elif label in ("perplexity", "probe_score"):
            # Nested inside training_summary.json["evaluation"]
            raw_a = sa.get("evaluation", {}).get(label)
            raw_b = sb.get("evaluation", {}).get(label)
            val_a = f"{raw_a:.2f}" if raw_a is not None else "—"
            val_b = f"{raw_b:.2f}" if raw_b is not None else "—"
        elif key is None:  # fidelity: from voice_test_results.json
            raw_a = voice_a.get("overall_score") if voice_a else None
            raw_b = voice_b.get("overall_score") if voice_b else None
            val_a = f"{raw_a:.1f}/5.0" if raw_a is not None else "—"
            val_b = f"{raw_b:.1f}/5.0" if raw_b is not None else "—"
        else:
            val_a = str(sa.get(key) or "—")[:29]
            val_b = str(sb.get(key) or "—")[:29]

        marker = "≠" if val_a != val_b else " "
        print(f"{marker} {label:<16} {val_a:<30} {val_b:<30}")

    print()


def cmd_push(args: argparse.Namespace) -> None:
    """Push a version's adapter to HuggingFace Hub (optional feature)."""
    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("Error: huggingface_hub not installed.", file=sys.stderr)
        print("  Run: uv pip install huggingface_hub", file=sys.stderr)
        sys.exit(1)

    base_dir     = _resolve_base_dir(args.slug, getattr(args, "base_dir", None))
    adapters_dir = base_dir / "adapters"
    version_dir  = adapters_dir / args.version

    if not version_dir.exists():
        print(f"Error: version {args.version} not found at {version_dir}", file=sys.stderr)
        sys.exit(1)

    api = HfApi()
    print(f"Pushing {args.version} → {args.hf_repo}…")
    api.upload_folder(
        folder_path=str(version_dir),
        repo_id=args.hf_repo,
        repo_type="model",
        commit_message=f"{args.version}: adapter weights for {args.slug}",
        ignore_patterns=["data/*"],  # exclude training data — use --include-data for dataset push
    )
    api.create_tag(
        repo_id=args.hf_repo,
        repo_type="model",
        tag=args.version,
    )
    print(f"✅ Pushed and tagged {args.version} on {args.hf_repo}")

    if getattr(args, "include_data", False):
        data_dir = version_dir / "data"
        if not data_dir.exists():
            print("Warning: no data/ archive — skipping dataset push", file=sys.stderr)
        else:
            dataset_repo = f"{args.hf_repo}-dataset"
            print(f"\n⚠️  Dataset push: repo will be PRIVATE ({dataset_repo})")
            confirm = input("   Contains training conversations. Confirm? [y/N] ").strip().lower()
            if confirm != "y":
                print("  Skipped.")
            else:
                api.create_repo(dataset_repo, repo_type="dataset", private=True, exist_ok=True)
                api.upload_folder(
                    folder_path=str(data_dir),
                    repo_id=dataset_repo,
                    repo_type="dataset",
                    commit_message=f"{args.version}: prepared dataset for {args.slug}",
                )
                api.create_tag(repo_id=dataset_repo, repo_type="dataset", tag=args.version)
                print(f"✅ Dataset pushed and tagged {args.version} on {dataset_repo}")


# ── CLI ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Model version management for persona-model-trainer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # update-manifest
    p_um = sub.add_parser("update-manifest", help="Record new version in manifest.json")
    p_um.add_argument("--slug",     required=True)
    p_um.add_argument("--version",  required=True)
    p_um.add_argument("--base-dir", default=None,
                      help="Base directory (default: models/{slug}/ relative to CWD)")

    # list
    p_ls = sub.add_parser("list", help="Show version history")
    p_ls.add_argument("--slug",     required=True)
    p_ls.add_argument("--base-dir", default=None)

    # activate
    p_ac = sub.add_parser("activate", help="Switch active version")
    p_ac.add_argument("--slug",     required=True)
    p_ac.add_argument("--version",  required=True)
    p_ac.add_argument("--base-dir", default=None)
    p_ac.add_argument("--formats",       default=None,
                      help="Override export formats (default: value from training_summary.json)")
    p_ac.add_argument("--quant",         default=None,
                      help="Override GGUF quantization (default: value from training_summary.json)")
    p_ac.add_argument("--restore-data",  action="store_true",
                      help="Also restore prepared/ dataset from archived data/ (for training reproducibility)")

    # diff
    p_df = sub.add_parser("diff", help="Compare two versions")
    p_df.add_argument("--slug",       required=True)
    p_df.add_argument("--version-a",  required=True)
    p_df.add_argument("--version-b",  required=True)
    p_df.add_argument("--base-dir",   default=None)

    # push
    p_pu = sub.add_parser("push", help="Push adapter to HuggingFace Hub")
    p_pu.add_argument("--slug",     required=True)
    p_pu.add_argument("--version",  required=True)
    p_pu.add_argument("--hf-repo",  required=True, dest="hf_repo",
                      help="HuggingFace Hub repo ID (e.g. alice/samantha-persona)")
    p_pu.add_argument("--base-dir",      default=None)
    p_pu.add_argument("--include-data",  action="store_true",
                      help="Also push prepared dataset to a private HF Hub dataset repo")

    args = parser.parse_args()

    dispatch = {
        "update-manifest": cmd_update_manifest,
        "list":            cmd_list,
        "activate":        cmd_activate,
        "diff":            cmd_diff,
        "push":            cmd_push,
    }
    dispatch[args.cmd](args)


if __name__ == "__main__":
    main()
