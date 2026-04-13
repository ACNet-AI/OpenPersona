#!/usr/bin/env bash
# Publish persona-model-trainer to ClawHub.
# Usage: ./publish.sh [--version 0.2.0] [--changelog "..."] [--dry-run]
set -euo pipefail

SLUG="persona-model-trainer"
VERSION="0.2.0"
CHANGELOG="Evaluation layer (perplexity + probe), model versioning, Gemma 4 preset, pipeline orchestrator, Colab sync, 138 tests."
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --version)   VERSION="$2";    shift 2 ;;
    --changelog) CHANGELOG="$2";  shift 2 ;;
    --dry-run)   DRY_RUN=true;    shift   ;;
    *) echo "Unknown option: $1"; exit 1  ;;
  esac
done

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$(mktemp -d)/persona-model-trainer"

echo "→ Packaging ${SLUG} v${VERSION} …"
rsync -a \
  --exclude='tests/' \
  --exclude='models/' \
  --exclude='CHANGELOG.md' \
  --exclude='README.md' \
  --exclude='publish.sh' \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='.pytest_cache/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='.agents/' \
  --exclude='.claude/' \
  --exclude='.continue/' \
  --exclude='.kiro/' \
  --exclude='.trae/' \
  --exclude='.windsurf/' \
  --exclude='skills-lock.json' \
  "${SKILL_DIR}/" "${DIST_DIR}/"

echo "→ Package contents:"
find "${DIST_DIR}" -type f | sed "s|${DIST_DIR}/||" | sort

if [[ "${DRY_RUN}" == true ]]; then
  echo "→ Dry run — skipping publish. Package at: ${DIST_DIR}"
  exit 0
fi

echo "→ Publishing to ClawHub …"
clawdhub publish "${DIST_DIR}" \
  --slug  "${SLUG}" \
  --name  "persona-model-trainer" \
  --version "${VERSION}" \
  --changelog "${CHANGELOG}"

rm -rf "$(dirname "${DIST_DIR}")"
echo "✓ Published ${SLUG} v${VERSION}"
