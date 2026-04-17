#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${ROOT_DIR}/../.." && pwd)"
SLUG="secondme-skill"
MODEL_DIR="skills/secondme-skill/models/secondme-skill"
PACK_DIR="skills/secondme-skill/generated/persona-secondme-skill"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --model-dir) MODEL_DIR="$2"; shift 2 ;;
    --pack-dir) PACK_DIR="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--slug <slug>] [--model-dir <path>] [--pack-dir <path>]" >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[secondme][gates] missing required command: $1" >&2
    exit 1
  fi
}

echo "[secondme][gates] preflight"
require_cmd npx
require_cmd python3

cd "${WORKSPACE_ROOT}"

echo "[secondme][gates] regenerate pack"
bash "skills/secondme-skill/scripts/regenerate-pack.sh"

if [[ -f "${MODEL_DIR}/export/training_summary.json" || -f "${MODEL_DIR}/training_summary.json" ]]; then
  echo "[secondme][gates] integrate persona model"
  python3 "skills/persona-model-trainer/scripts/pack_integrate.py" \
    --slug "${SLUG}" \
    --model-dir "${MODEL_DIR}" \
    --pack-dir "${PACK_DIR}"
else
  echo "[secondme][gates] model artifacts not found at ${MODEL_DIR}; skip integration"
fi

echo "[secondme][gates] sync check"
bash "skills/secondme-skill/scripts/check-sync.sh"

echo "[secondme][gates] model integration check"
bash "skills/secondme-skill/scripts/check-model-integration.sh"

echo "[secondme][gates] publish check"
bash "skills/secondme-skill/scripts/publish-check.sh"

echo "[secondme][gates] all checks passed"
