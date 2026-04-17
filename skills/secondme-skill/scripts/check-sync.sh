#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_PERSONA="${ROOT_DIR}/persona.json"
GENERATED_PERSONA="${ROOT_DIR}/generated/persona-secondme-skill/persona.json"

if [[ ! -f "${ROOT_PERSONA}" ]]; then
  echo "[secondme][sync-check] missing root persona: ${ROOT_PERSONA}" >&2
  exit 1
fi

if [[ ! -f "${GENERATED_PERSONA}" ]]; then
  echo "[secondme][sync-check] missing generated persona: ${GENERATED_PERSONA}" >&2
  exit 1
fi

python3 - "$ROOT_PERSONA" "$GENERATED_PERSONA" <<'PY'
import json
import sys

root_path, generated_path = sys.argv[1], sys.argv[2]
with open(root_path, "r", encoding="utf-8") as f:
    root = json.load(f)
with open(generated_path, "r", encoding="utf-8") as f:
    gen = json.load(f)

def read_slug(doc):
    return (
        doc.get("soul", {}).get("identity", {}).get("slug")
        or doc.get("slug")
    )

checks = [
    ("slug", read_slug(root), read_slug(gen)),
    ("version", root.get("version"), gen.get("version")),
    ("skills_count", len(root.get("skills", [])), len(gen.get("skills", []))),
]

errors = []
for name, rv, gv in checks:
    if rv != gv:
        errors.append(f"{name}: root={rv!r}, generated={gv!r}")

if errors:
    print("[secondme][sync-check] FAILED")
    for err in errors:
        print(f" - {err}")
    sys.exit(1)

def skill_signature(doc):
    skills = doc.get("skills", [])
    pairs = []
    for skill in skills:
        name = skill.get("name", "")
        install = skill.get("install", "")
        pairs.append((name, install))
    return sorted(pairs)

root_sig = skill_signature(root)
gen_sig = skill_signature(gen)
if root_sig != gen_sig:
    print("[secondme][sync-check] FAILED")
    print(" - skills signature mismatch (name/install pairs differ)")
    print(f" - root: {root_sig}")
    print(f" - generated: {gen_sig}")
    sys.exit(1)

print("[secondme][sync-check] OK")
PY
