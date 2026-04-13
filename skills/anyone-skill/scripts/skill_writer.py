#!/usr/bin/env python3
"""
skill_writer.py — anyone-skill output manager
Actions: list, init, combine
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BASE = Path(".claude/skills")


def list_skills(base_dir: Path):
    skills = []
    if not base_dir.exists():
        print("No skills found.")
        return
    for meta_path in sorted(base_dir.glob("*/meta.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            skills.append(meta)
        except Exception:
            pass
    if not skills:
        print("No skills found in", base_dir)
        return
    print(f"{'Slug':<24} {'Type':<16} {'Version':<10} {'Updated'}")
    print("-" * 70)
    for m in skills:
        print(
            f"{m.get('slug','?'):<24} "
            f"{m.get('subject-type','?'):<16} "
            f"{m.get('version','?'):<10} "
            f"{m.get('updated-at','?')[:10]}"
        )


def init_skill(slug: str, base_dir: Path, subject_type: str = "personal"):
    skill_dir = base_dir / slug
    skill_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {
        "slug": slug,
        "version": "0.1.0",
        "subject-type": subject_type,
        "display-name": slug,
        "created-at": now,
        "updated-at": now,
        "sources": [],
        "evidence-summary": {"L1": 0, "L2": 0, "L3": 0, "L4": 0},
        "created-by": "create-anyone@1.0.0",
    }
    meta_path = skill_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Initialized {skill_dir}/meta.json")
    return skill_dir


def update_meta(slug: str, base_dir: Path, patch: dict):
    meta_path = base_dir / slug / "meta.json"
    if not meta_path.exists():
        print(f"❌ meta.json not found for {slug}", file=sys.stderr)
        sys.exit(1)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta.update(patch)
    meta["updated-at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Updated meta.json for {slug}")


def main():
    parser = argparse.ArgumentParser(description="anyone-skill writer")
    parser.add_argument("--action", choices=["list", "init", "update-meta"], required=True)
    parser.add_argument("--slug", help="Persona slug")
    parser.add_argument("--base-dir", default=str(DEFAULT_BASE))
    parser.add_argument("--subject-type", default="personal")
    parser.add_argument("--patch", help="JSON patch string for update-meta")
    args = parser.parse_args()

    base_dir = Path(args.base_dir)

    if args.action == "list":
        list_skills(base_dir)
    elif args.action == "init":
        if not args.slug:
            print("❌ --slug required for init", file=sys.stderr)
            sys.exit(1)
        init_skill(args.slug, base_dir, args.subject_type)
    elif args.action == "update-meta":
        if not args.slug or not args.patch:
            print("❌ --slug and --patch required for update-meta", file=sys.stderr)
            sys.exit(1)
        update_meta(args.slug, base_dir, json.loads(args.patch))


if __name__ == "__main__":
    main()
