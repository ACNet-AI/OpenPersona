#!/usr/bin/env bash
# OpenPersona Music Faculty — Suno AI music generation + optional OpenClaw delivery
#
# Usage: ./compose.sh <prompt> [--lyrics <lyrics>] [--channel <channel>] [--caption <caption>]
#
# Arguments:
#   prompt       - Music style/mood description (required)
#   --lyrics     - Song lyrics (optional; omit for instrumental)
#   --channel    - OpenClaw channel to send to (optional)
#   --caption    - Message caption (optional)
#
# Environment variables:
#   SUNO_API_KEY            - Suno API key (required)
#   OPENCLAW_GATEWAY_TOKEN  - OpenClaw gateway token (optional)
#
# Examples:
#   ./compose.sh "soft ambient piano, contemplative"
#   ./compose.sh "indie folk ballad" --lyrics "[Verse]\nI saw you there..."
#   ./compose.sh "upbeat pop" --channel "#general" --caption "Made this for you!"

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Preflight ---
if [ -z "${SUNO_API_KEY:-}" ]; then
  log_error "SUNO_API_KEY environment variable not set"
  echo "Get your API key from: https://suno.com"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

# --- Parse arguments ---
PROMPT=""
LYRICS=""
CHANNEL=""
CAPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --lyrics)   LYRICS="$2"; shift 2 ;;
    --channel)  CHANNEL="$2"; shift 2 ;;
    --caption)  CAPTION="$2"; shift 2 ;;
    *)
      if [ -z "$PROMPT" ]; then
        PROMPT="$1"
      fi
      shift ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "Usage: $0 <prompt> [--lyrics <lyrics>] [--channel <channel>] [--caption <caption>]"
  echo ""
  echo "Examples:"
  echo "  $0 \"soft ambient piano, contemplative, late night\""
  echo "  $0 \"indie folk ballad\" --lyrics \"[Verse] I saw you there...\""
  echo "  $0 \"upbeat pop\" --channel \"#general\" --caption \"New song!\""
  exit 1
fi

# --- Determine mode ---
if [ -n "$LYRICS" ]; then
  INSTRUMENTAL=false
  log_info "Mode: Song with lyrics"
else
  INSTRUMENTAL=true
  log_info "Mode: Instrumental"
fi

log_info "Prompt: $PROMPT"

# --- Build payload ---
if [ "$INSTRUMENTAL" = true ]; then
  JSON_PAYLOAD=$(jq -n \
    --arg prompt "$PROMPT" \
    '{prompt: $prompt, make_instrumental: true, wait_audio: true}')
else
  JSON_PAYLOAD=$(jq -n \
    --arg prompt "$PROMPT" \
    --arg lyrics "$LYRICS" \
    '{prompt: $prompt, lyrics: $lyrics, make_instrumental: false, wait_audio: true}')
fi

# --- Call Suno API ---
log_info "Composing... (this may take 30-60 seconds)"

RESPONSE=$(curl -s -X POST "https://api.suno.ai/v1/generation" \
  -H "Authorization: Bearer $SUNO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# --- Check for errors ---
if echo "$RESPONSE" | jq -e '.error // .detail' > /dev/null 2>&1; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error // .detail // "Unknown error"')
  log_error "Composition failed: $ERROR_MSG"
  exit 1
fi

AUDIO_URL=$(echo "$RESPONSE" | jq -r '.[0].audio_url // .audio_url // empty')
TITLE=$(echo "$RESPONSE" | jq -r '.[0].title // .title // "Untitled"')
DURATION=$(echo "$RESPONSE" | jq -r '.[0].duration // .duration // "unknown"')

if [ -z "$AUDIO_URL" ]; then
  log_error "Failed to extract audio URL from response"
  log_error "Response: $RESPONSE"
  exit 1
fi

log_info "Composed: $TITLE ($DURATION seconds)"
log_info "Audio: $AUDIO_URL"

# --- Send via OpenClaw (if channel provided) ---
if [ -n "$CHANNEL" ]; then
  MESSAGE="${CAPTION:-🎵 $TITLE}"
  log_info "Sending to channel: $CHANNEL"

  if command -v openclaw &> /dev/null; then
    openclaw message send \
      --action send \
      --channel "$CHANNEL" \
      --message "$MESSAGE" \
      --media "$AUDIO_URL"
  else
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    SEND_PAYLOAD=$(jq -n \
      --arg channel "$CHANNEL" \
      --arg message "$MESSAGE" \
      --arg media "$AUDIO_URL" \
      '{action: "send", channel: $channel, message: $message, media: $media}')

    curl -s -X POST "$GATEWAY_URL/message" \
      -H "Content-Type: application/json" \
      ${OPENCLAW_GATEWAY_TOKEN:+-H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"} \
      -d "$SEND_PAYLOAD"
  fi
  log_info "Sent to $CHANNEL"
fi

# --- Output result ---
echo ""
jq -n \
  --arg url "$AUDIO_URL" \
  --arg title "$TITLE" \
  --arg duration "$DURATION" \
  --arg prompt "$PROMPT" \
  --argjson instrumental "$INSTRUMENTAL" \
  --arg channel "${CHANNEL:-none}" \
  '{
    success: true,
    audio_url: $url,
    title: $title,
    duration_seconds: $duration,
    prompt: $prompt,
    instrumental: $instrumental,
    channel: $channel
  }'
