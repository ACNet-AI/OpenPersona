#!/usr/bin/env bash
# Publish entrepreneur-skill to ClawHub.
# Usage: ./publish.sh --changelog "..." [--version 0.1.0] [--dry-run]
set -euo pipefail

SLUG="entrepreneur-skill"
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

_skill_version() {
  grep '^version:' "${SKILL_DIR}/SKILL.md" | head -1 | sed 's/version:[[:space:]]*//' | tr -d '"'
}

VERSION="$(_skill_version)"
CHANGELOG=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --version)   VERSION="$2";    shift 2 ;;
    --changelog) CHANGELOG="$2";  shift 2 ;;
    --dry-run)   DRY_RUN=true;    shift   ;;
    *) echo "Unknown option: $1"; exit 1  ;;
  esac
done

if [[ -z "${CHANGELOG}" ]]; then
  echo "Error: --changelog is required" >&2
  echo "Usage: ./publish.sh --changelog \"What changed in this release\"" >&2
  exit 1
fi

DIST_DIR="$(mktemp -d)/${SLUG}"

echo "-> Packaging ${SLUG} v${VERSION} ..."
rsync -a \
  --exclude='tests/' \
  --exclude='generated/' \
  --exclude='reports/' \
  --exclude='CHANGELOG.md' \
  --exclude='publish.sh' \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='package.json' \
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

echo "-> Package contents:"
find "${DIST_DIR}" -type f | sed "s|${DIST_DIR}/||" | sort

if [[ "${DRY_RUN}" == true ]]; then
  echo "-> Dry run -- skipping publish. Package at: ${DIST_DIR}"
  exit 0
fi

echo "-> Publishing to ClawHub ..."
npx clawhub@latest publish "${DIST_DIR}" \
  --slug  "${SLUG}" \
  --name  "entrepreneur-skill" \
  --version "${VERSION}" \
  --changelog "${CHANGELOG}"

rm -rf "$(dirname "${DIST_DIR}")"
echo "✓ Published ${SLUG} v${VERSION}"
