#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${ROOT_DIR}/../.." && pwd)"

echo "[secondme] regenerate runtime pack from root persona.json"
echo "[secondme] workspace: ${WORKSPACE_ROOT}"

cd "${WORKSPACE_ROOT}"
npx openpersona create \
  --config "skills/secondme-skill/persona.json" \
  --output "skills/secondme-skill/generated"

echo "[secondme] done: skills/secondme-skill/generated/persona-secondme-skill"
