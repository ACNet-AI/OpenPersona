#!/usr/bin/env python3
"""
version_manager.py — anyone-skill version control
Actions: bump, rollback, history
"""

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_BASE = Path(".claude/skills")


def _meta_path(slug: str, base_dir: Path) -> Path:
    p = base_dir / slug / "meta.json"
    if not p.exists():
        print(f"❌ meta.json not found for '{slug}'", file=sys.stderr)
        sys.exit(1)
    return p


def _versions_dir(slug: str, base_dir: Path) -> Path:
    d = base_dir / slug / ".versions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def bump(slug: str, base_dir: Path):
    """Snapshot current state and increment patch version."""
    skill_dir = base_dir / slug
    meta_path = _meta_path(slug, base_dir)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    current = meta.get("version", "0.1.0")

    # Snapshot
    versions_dir = _versions_dir(slug, base_dir)
    snap_dir = versions_dir / current
    if not snap_dir.exists():
        shutil.copytree(skill_dir, snap_dir, ignore=shutil.ignore_patterns(".versions"))
    print(f"📸 Snapshotted v{current}")

    # Bump patch
    parts = current.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    new_version = ".".join(parts)
    meta["version"] = new_version
    meta["updated-at"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"🔄 Version bumped: {current} → {new_version}")


def rollback(slug: str, version: str, base_dir: Path):
    """Restore a previously snapshotted version."""
    skill_dir = base_dir / slug
    snap_dir = _versions_dir(slug, base_dir) / version
    if not snap_dir.exists():
        print(f"❌ Snapshot for v{version} not found", file=sys.stderr)
        sys.exit(1)
    # Backup current before rollback
    bump(slug, base_dir)
    # Restore snapshot files (excluding .versions/)
    for src in snap_dir.iterdir():
        if src.name == ".versions":
            continue
        dst = skill_dir / src.name
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    print(f"✅ Rolled back to v{version}")


def history(slug: str, base_dir: Path):
    versions_dir = _versions_dir(slug, base_dir)
    snapshots = sorted(versions_dir.iterdir()) if versions_dir.exists() else []
    if not snapshots:
        print("No version history found.")
        return
    print(f"Version history for '{slug}':")
    for s in snapshots:
        meta_f = s / "meta.json"
        ts = "?"
        if meta_f.exists():
            m = json.loads(meta_f.read_text(encoding="utf-8"))
            ts = m.get("updated-at", "?")[:10]
        print(f"  v{s.name}  ({ts})")


def main():
    parser = argparse.ArgumentParser(description="anyone-skill version manager")
    parser.add_argument("--action", choices=["bump", "rollback", "history"], required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--version", help="Target version for rollback")
    parser.add_argument("--base-dir", default=str(DEFAULT_BASE))
    args = parser.parse_args()

    base_dir = Path(args.base_dir)

    if args.action == "bump":
        bump(args.slug, base_dir)
    elif args.action == "rollback":
        if not args.version:
            print("❌ --version required for rollback", file=sys.stderr)
            sys.exit(1)
        rollback(args.slug, args.version, base_dir)
    elif args.action == "history":
        history(args.slug, base_dir)


if __name__ == "__main__":
    main()
