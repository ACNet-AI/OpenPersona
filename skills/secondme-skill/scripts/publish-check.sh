#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PERSONA_PATH="${ROOT_DIR}/persona.json"

if [[ ! -f "${PERSONA_PATH}" ]]; then
  echo "[secondme][publish-check] missing persona.json: ${PERSONA_PATH}" >&2
  exit 1
fi

python3 - "${PERSONA_PATH}" <<'PY'
import json
import sys

persona_path = sys.argv[1]
with open(persona_path, "r", encoding="utf-8") as f:
    persona = json.load(f)

PORTABLE_PREFIXES = ("clawhub:", "skillssh:", "openpersona:")

local_installs = []
for skill in persona.get("skills", []):
    install = skill.get("install", "")
    if not isinstance(install, str) or not install:
        continue
    if not any(install.startswith(p) for p in PORTABLE_PREFIXES):
        local_installs.append((skill.get("name", ""), install))

if local_installs:
    print("[secondme][publish-check] BLOCKED")
    print("Found non-portable install sources. Replace with clawhub:, skillssh:, or openpersona: before publish:")
    for name, install in local_installs:
        print(f" - {name}: {install}")
    sys.exit(1)

print("[secondme][publish-check] OK")
PY
