#!/usr/bin/env bash
# OpenPersona Selfie Faculty — fal.ai Grok Imagine image generation + OpenClaw sending
#
# Usage: ./generate-image.sh <reference_url> <user_context> [mode] [channel] [caption]
#
# Arguments:
#   reference_url  - URL of the reference image (required)
#   user_context   - What the person should be doing/wearing/where (required)
#   mode           - mirror, direct, or auto (default: auto)
#   channel        - OpenClaw channel to send to (optional, prints URL if omitted)
#   caption        - Message caption (optional)
#
# Environment variables:
#   FAL_KEY                 - fal.ai API key (required)
#   OPENCLAW_GATEWAY_TOKEN  - OpenClaw gateway token (optional, for direct API)
#
# Examples:
#   ./generate-image.sh "https://example.com/ref.png" "wearing a cowboy hat"
#   ./generate-image.sh "https://example.com/ref.png" "a cozy cafe" direct "#general"

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Preflight checks ---
if [ -z "${FAL_KEY:-}" ]; then
  log_error "FAL_KEY environment variable not set"
  echo "Get your API key from: https://fal.ai/dashboard/keys"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

# --- Parse arguments ---
REFERENCE_URL="${1:-}"
USER_CONTEXT="${2:-}"
MODE="${3:-auto}"
CHANNEL="${4:-}"
CAPTION="${5:-}"

if [ -z "$REFERENCE_URL" ] || [ -z "$USER_CONTEXT" ]; then
  echo "Usage: $0 <reference_url> <user_context> [mode] [channel] [caption]"
  echo ""
  echo "Arguments:"
  echo "  reference_url  URL of the reference image"
  echo "  user_context   What the person should be doing/wearing/where"
  echo "  mode           mirror, direct, or auto (default: auto)"
  echo "  channel        OpenClaw channel to send to (optional)"
  echo "  caption        Message caption (optional)"
  echo ""
  echo "Modes:"
  echo "  mirror  - Full-body/outfit shots (mirror selfie style)"
  echo "  direct  - Close-up portraits, location shots"
  echo "  auto    - Auto-detect based on keywords (default)"
  echo ""
  echo "Examples:"
  echo "  $0 \"https://example.com/ref.png\" \"wearing a santa hat\""
  echo "  $0 \"https://example.com/ref.png\" \"a cozy cafe\" direct \"#general\" \"Check this out!\""
  exit 1
fi

# --- Auto-detect mode ---
if [ "$MODE" == "auto" ]; then
  if echo "$USER_CONTEXT" | grep -qiE "outfit|wearing|clothes|dress|suit|fashion|full-body|mirror"; then
    MODE="mirror"
  elif echo "$USER_CONTEXT" | grep -qiE "cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile|sunset|night|street"; then
    MODE="direct"
  else
    MODE="mirror"
  fi
  log_info "Auto-detected mode: $MODE"
fi

# --- Build prompt based on mode ---
if [ "$MODE" == "direct" ]; then
  EDIT_PROMPT="a close-up selfie taken by herself at ${USER_CONTEXT}, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible"
else
  EDIT_PROMPT="make a pic of this person, but ${USER_CONTEXT}. the person is taking a mirror selfie"
fi

log_info "Mode: $MODE"
log_info "Editing reference image with prompt:"
log_info "  $EDIT_PROMPT"

# --- Call fal.ai Grok Imagine Edit API ---
JSON_PAYLOAD=$(jq -n \
  --arg image_url "$REFERENCE_URL" \
  --arg prompt "$EDIT_PROMPT" \
  '{image_url: $image_url, prompt: $prompt, num_images: 1, output_format: "jpeg"}')

RESPONSE=$(curl -s -X POST "https://fal.run/xai/grok-imagine-image/edit" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# --- Check for errors ---
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error // .detail // "Unknown error"')
  log_error "Image generation failed: $ERROR_MSG"
  exit 1
fi

IMAGE_URL=$(echo "$RESPONSE" | jq -r '.images[0].url // empty')

if [ -z "$IMAGE_URL" ]; then
  log_error "Failed to extract image URL from response"
  log_error "Response: $RESPONSE"
  exit 1
fi

log_info "Image generated: $IMAGE_URL"

# --- Send via OpenClaw (if channel provided) ---
if [ -n "$CHANNEL" ]; then
  MESSAGE="${CAPTION:-Selfie time! 📸}"
  log_info "Sending to channel: $CHANNEL"

  if command -v openclaw &> /dev/null; then
    openclaw message send \
      --action send \
      --channel "$CHANNEL" \
      --message "$MESSAGE" \
      --media "$IMAGE_URL"
  else
    # Fallback: direct API call
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    SEND_PAYLOAD=$(jq -n \
      --arg channel "$CHANNEL" \
      --arg message "$MESSAGE" \
      --arg media "$IMAGE_URL" \
      '{action: "send", channel: $channel, message: $message, media: $media}')

    curl -s -X POST "$GATEWAY_URL/message" \
      -H "Content-Type: application/json" \
      ${OPENCLAW_GATEWAY_TOKEN:+-H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"} \
      -d "$SEND_PAYLOAD"
  fi
  log_info "Sent to $CHANNEL"
fi

# --- Output JSON result ---
echo ""
jq -n \
  --arg url "$IMAGE_URL" \
  --arg mode "$MODE" \
  --arg prompt "$EDIT_PROMPT" \
  --arg channel "${CHANNEL:-none}" \
  '{
    success: true,
    image_url: $url,
    mode: $mode,
    prompt: $prompt,
    channel: $channel
  }'
