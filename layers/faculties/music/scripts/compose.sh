#!/usr/bin/env bash
# OpenPersona Music Faculty — Suno AI music generation via sunoapi.org
#
# Usage: ./compose.sh <prompt> [options]
#
# Arguments:
#   prompt          - Music description or lyrics (required)
#
# Options:
#   --style <style>     - Music style/genre (for custom mode)
#   --title <title>     - Song title (for custom mode)
#   --instrumental      - Generate instrumental only (no vocals)
#   --model <model>     - Suno model: V4, V4_5, V4_5PLUS, V4_5ALL, V5 (default: V4_5ALL)
#   --channel <channel> - OpenClaw channel to send to (optional)
#   --caption <caption> - Message caption (optional)
#   --timeout <seconds> - Max wait for generation (default: 180)
#
# Environment variables:
#   SUNO_API_KEY            - Suno API key from sunoapi.org (required)
#   SUNO_MODEL              - Default model (overridden by --model)
#   OPENCLAW_GATEWAY_TOKEN  - OpenClaw gateway token (optional)
#
# Examples:
#   # Simple mode (auto-generates lyrics)
#   ./compose.sh "a soft ambient piano piece about starlight"
#
#   # Custom mode with lyrics
#   ./compose.sh "[Verse] I don't have hands to hold..." --style "indie folk" --title "Sunlight"
#
#   # Instrumental
#   ./compose.sh "dreamy lo-fi beats, vinyl crackle, rainy day" --instrumental
#
#   # Send to OpenClaw channel
#   ./compose.sh "upbeat pop" --channel "#music" --caption "New song!"

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

# --- API Configuration ---
SUNO_API_BASE="https://api.sunoapi.org"

# --- Preflight ---
if [ -z "${SUNO_API_KEY:-}" ]; then
  log_error "SUNO_API_KEY environment variable not set"
  echo "Get your API key from: https://sunoapi.org/api-key"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

# --- Parse arguments ---
PROMPT=""
STYLE=""
TITLE=""
INSTRUMENTAL=false
MODEL="${SUNO_MODEL:-V4_5ALL}"
CHANNEL=""
CAPTION=""
TIMEOUT=180

while [[ $# -gt 0 ]]; do
  case $1 in
    --style)        STYLE="$2"; shift 2 ;;
    --title)        TITLE="$2"; shift 2 ;;
    --instrumental) INSTRUMENTAL=true; shift ;;
    --model)        MODEL="$2"; shift 2 ;;
    --channel)      CHANNEL="$2"; shift 2 ;;
    --caption)      CAPTION="$2"; shift 2 ;;
    --timeout)      TIMEOUT="$2"; shift 2 ;;
    *)
      if [ -z "$PROMPT" ]; then
        PROMPT="$1"
      fi
      shift ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "Usage: $0 <prompt> [--style <style>] [--title <title>] [--instrumental] [--model <model>]"
  echo ""
  echo "Simple mode:  $0 \"a soft piano piece about starlight\""
  echo "Custom mode:  $0 \"[Verse] lyrics...\" --style \"indie folk\" --title \"Sunlight\""
  echo "Instrumental: $0 \"dreamy lo-fi beats\" --instrumental"
  exit 1
fi

# --- Determine mode ---
if [ -n "$STYLE" ] || [ -n "$TITLE" ]; then
  CUSTOM_MODE=true
  # Auto-fill title if style provided but no title
  if [ -z "$TITLE" ]; then TITLE="Untitled"; fi
  if [ -z "$STYLE" ]; then STYLE="pop"; fi
  log_info "Mode: Custom (style: $STYLE, title: $TITLE)"
else
  CUSTOM_MODE=false
  log_info "Mode: Simple (auto-generate)"
fi

if [ "$INSTRUMENTAL" = true ]; then
  log_info "Type: Instrumental (no vocals)"
else
  log_info "Type: Song with vocals"
fi
log_info "Model: $MODEL"
log_info "Prompt: ${PROMPT:0:100}..."

# --- Build payload ---
if [ "$CUSTOM_MODE" = true ]; then
  if [ "$INSTRUMENTAL" = true ]; then
    JSON_PAYLOAD=$(jq -n \
      --arg style "$STYLE" \
      --arg title "$TITLE" \
      --arg model "$MODEL" \
      '{customMode: true, instrumental: true, style: $style, title: $title, model: $model, callBackUrl: ""}')
  else
    JSON_PAYLOAD=$(jq -n \
      --arg prompt "$PROMPT" \
      --arg style "$STYLE" \
      --arg title "$TITLE" \
      --arg model "$MODEL" \
      '{customMode: true, instrumental: false, prompt: $prompt, style: $style, title: $title, model: $model, callBackUrl: ""}')
  fi
else
  JSON_PAYLOAD=$(jq -n \
    --arg prompt "$PROMPT" \
    --argjson instrumental "$INSTRUMENTAL" \
    --arg model "$MODEL" \
    '{customMode: false, instrumental: $instrumental, prompt: $prompt, model: $model, callBackUrl: ""}')
fi

# --- Call Suno API ---
log_step "Submitting composition request..."

RESPONSE=$(curl -s -X POST "$SUNO_API_BASE/api/v1/generate" \
  -H "Authorization: Bearer $SUNO_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD")

# Check for errors
CODE=$(echo "$RESPONSE" | jq -r '.code // 0')
if [ "$CODE" != "200" ]; then
  MSG=$(echo "$RESPONSE" | jq -r '.msg // "Unknown error"')
  log_error "API error (code $CODE): $MSG"
  exit 1
fi

TASK_ID=$(echo "$RESPONSE" | jq -r '.data.taskId // empty')
if [ -z "$TASK_ID" ]; then
  log_error "Failed to get taskId from response"
  log_error "Response: $RESPONSE"
  exit 1
fi

log_info "Task ID: $TASK_ID"
log_step "Composing... (this usually takes 30-60 seconds)"

# --- Poll for completion ---
ELAPSED=0
POLL_INTERVAL=5
AUDIO_URL=""
STREAM_URL=""
SONG_TITLE=""
DURATION=""

while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  STATUS_RESPONSE=$(curl -s -G "$SUNO_API_BASE/api/v1/generate/record-info" \
    --data-urlencode "taskId=$TASK_ID" \
    -H "Authorization: Bearer $SUNO_API_KEY")

  STATUS_CODE=$(echo "$STATUS_RESPONSE" | jq -r '.code // 0')
  if [ "$STATUS_CODE" != "200" ]; then
    log_warn "Poll returned code $STATUS_CODE, retrying... (${ELAPSED}s)"
    continue
  fi

  # Check if data array has results with audio_url
  AUDIO_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.data[0].audio_url // empty')
  if [ -n "$AUDIO_URL" ] && [ "$AUDIO_URL" != "null" ]; then
    STREAM_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.data[0].stream_audio_url // empty')
    SONG_TITLE=$(echo "$STATUS_RESPONSE" | jq -r '.data.data[0].title // "Untitled"')
    DURATION=$(echo "$STATUS_RESPONSE" | jq -r '.data.data[0].duration // "unknown"')
    break
  fi

  # Show progress
  printf "\r  ⏳ Waiting... (%ds / %ds)" "$ELAPSED" "$TIMEOUT"
done
echo ""

if [ -z "$AUDIO_URL" ] || [ "$AUDIO_URL" = "null" ]; then
  log_error "Timed out after ${TIMEOUT}s. Task $TASK_ID may still be processing."
  log_info "Check manually: curl -s '$SUNO_API_BASE/api/v1/generate/record-info?taskId=$TASK_ID' -H 'Authorization: Bearer \$SUNO_API_KEY'"
  exit 1
fi

log_info "Composed: $SONG_TITLE (${DURATION}s)"
log_info "Audio: $AUDIO_URL"
if [ -n "$STREAM_URL" ] && [ "$STREAM_URL" != "null" ]; then
  log_info "Stream: $STREAM_URL"
fi

# --- Send via OpenClaw (if channel provided) ---
if [ -n "$CHANNEL" ]; then
  MESSAGE="${CAPTION:-🎵 $SONG_TITLE}"
  log_step "Sending to channel: $CHANNEL"

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
  --arg stream "${STREAM_URL:-}" \
  --arg title "$SONG_TITLE" \
  --arg duration "$DURATION" \
  --arg prompt "$PROMPT" \
  --arg model "$MODEL" \
  --argjson instrumental "$INSTRUMENTAL" \
  --argjson customMode "$CUSTOM_MODE" \
  --arg taskId "$TASK_ID" \
  --arg channel "${CHANNEL:-none}" \
  '{
    success: true,
    audio_url: $url,
    stream_url: $stream,
    title: $title,
    duration_seconds: $duration,
    prompt: $prompt,
    model: $model,
    instrumental: $instrumental,
    custom_mode: $customMode,
    task_id: $taskId,
    channel: $channel
  }'
