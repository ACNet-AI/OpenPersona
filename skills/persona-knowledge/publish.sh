#!/usr/bin/env bash
# Publish persona-knowledge to ClawHub.
# Usage: ./publish.sh --changelog "..." [--version 0.3.0] [--dry-run]
set -euo pipefail

SLUG="persona-knowledge"
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read version from SKILL.md (metadata.version field) as default
_skill_version() {
  awk -F'"' '/version:/{print $2; exit}' "${SKILL_DIR}/SKILL.md"
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
  --name  "persona-knowledge" \
  --version "${VERSION}" \
  --changelog "${CHANGELOG}"

rm -rf "$(dirname "${DIST_DIR}")"
echo "✓ Published ${SLUG} v${VERSION}"
