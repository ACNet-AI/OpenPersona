#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <slug> <datasetVersion> <modelVersion> <reportType>" >&2
  echo "Example: $0 secondme-skill v2 v3 data" >&2
  exit 1
fi

slug="$1"
dataset_version="$2"
model_version="$3"
report_type="$4"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"

case "${report_type}" in
  data|model|deploy) ;;
  *)
    echo "Invalid reportType: ${report_type}" >&2
    echo "Allowed values: data | model | deploy" >&2
    exit 1
    ;;
esac

echo "${slug}_${dataset_version}_${model_version}_${timestamp}_${report_type}.md"
