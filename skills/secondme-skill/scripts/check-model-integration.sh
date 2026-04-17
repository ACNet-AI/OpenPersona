#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GENERATED_PERSONA="${ROOT_DIR}/generated/persona-secondme-skill/persona.json"

if [[ ! -f "${GENERATED_PERSONA}" ]]; then
  echo "[secondme][model-gate] missing generated persona: ${GENERATED_PERSONA}" >&2
  exit 1
fi

python3 - "${GENERATED_PERSONA}" <<'PY'
import json
import sys

persona_path = sys.argv[1]
with open(persona_path, "r", encoding="utf-8") as f:
    persona = json.load(f)

runtime = persona.get("body", {}).get("runtime", {})
models = runtime.get("models")

if not isinstance(models, list) or len(models) == 0:
    print("[secondme][model-gate] BLOCKED")
    print("Missing integrated persona model. Expected body.runtime.models with at least one entry.")
    sys.exit(1)

errors = []
for idx, model in enumerate(models):
    if not isinstance(model, dict):
        errors.append(f"models[{idx}] must be an object")
        continue
    if not model.get("id"):
        errors.append(f"models[{idx}].id is required")
    if not model.get("type"):
        errors.append(f"models[{idx}].type is required")
    if not model.get("base"):
        errors.append(f"models[{idx}].base is required")
    has_artifact = bool(model.get("adapter")) or bool(model.get("gguf"))
    if not has_artifact:
        errors.append(f"models[{idx}] requires at least one artifact path: adapter or gguf")

if errors:
    print("[secondme][model-gate] BLOCKED")
    for err in errors:
        print(f" - {err}")
    sys.exit(1)

print("[secondme][model-gate] OK")
PY
