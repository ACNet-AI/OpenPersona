#!/usr/bin/env bash
# OpenPersona Selfie Faculty - fal.ai image generation
# Usage: ./generate-image.sh <reference_url> <prompt>
# Requires FAL_KEY env var

set -e
REF="${1:-}"
PROMPT="${2:-a friendly selfie}"

if [ -z "$FAL_KEY" ]; then
  echo "Error: FAL_KEY environment variable is required" >&2
  exit 1
fi

if [ -z "$REF" ]; then
  # No reference: use fal.ai direct generation
  curl -s -X POST "https://queue.fal.run/fal-ai/grok-imagine/v1" \
    -H "Authorization: Key $FAL_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"$PROMPT\"}"
else
  # With reference: use edit endpoint
  curl -s -X POST "https://queue.fal.run/fal-ai/xai/grok-imagine-image/edit" \
    -H "Authorization: Key $FAL_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"image_url\": \"$REF\", \"prompt\": \"$PROMPT\"}"
fi
