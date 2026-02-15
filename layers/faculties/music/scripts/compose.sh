#!/usr/bin/env bash
# OpenPersona Music Faculty — ElevenLabs Music API (music_v1)
#
# Usage: ./compose.sh <prompt> [options]
#
# Arguments:
#   prompt              - Music description (required)
#
# Options:
#   --instrumental      - Generate instrumental only (no vocals)
#   --plan              - Use composition plan mode (structured sections)
#   --duration <secs>   - Song length in seconds (3-600, default: auto)
#   --format <format>   - Output format (default: mp3_44100_128)
#   --output <path>     - Save audio to file (default: ./composition-<timestamp>.mp3)
#   --channel <channel> - OpenClaw channel to send to (optional)
#   --caption <caption> - Message caption (optional)
#
# Environment variables:
#   ELEVENLABS_API_KEY       - ElevenLabs API key (shared with voice faculty)
#   OPENCLAW_GATEWAY_TOKEN   - OpenClaw gateway token (optional)
#
# Examples:
#   ./compose.sh "a soft ambient piano piece about starlight"
#   ./compose.sh "dreamy lo-fi beats" --instrumental --duration 60
#   ./compose.sh "indie folk ballad" --plan --output ./song.mp3
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
API_BASE="https://api.elevenlabs.io"
DEFAULT_FORMAT="mp3_44100_128"

# --- Preflight ---
if [ -z "${ELEVENLABS_API_KEY:-}" ]; then
  log_error "ELEVENLABS_API_KEY environment variable not set"
  echo "Get your API key from: https://elevenlabs.io"
  echo "(Same key used by the voice faculty)"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

# --- Parse arguments ---
PROMPT=""
INSTRUMENTAL=false
PLAN_MODE=false
DURATION=""
FORMAT="$DEFAULT_FORMAT"
OUTPUT=""
CHANNEL=""
CAPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --instrumental) INSTRUMENTAL=true; shift ;;
    --plan)         PLAN_MODE=true; shift ;;
    --duration)     DURATION="$2"; shift 2 ;;
    --format)       FORMAT="$2"; shift 2 ;;
    --output)       OUTPUT="$2"; shift 2 ;;
    --channel)      CHANNEL="$2"; shift 2 ;;
    --caption)      CAPTION="$2"; shift 2 ;;
    *)
      if [ -z "$PROMPT" ]; then
        PROMPT="$1"
      fi
      shift ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "Usage: $0 <prompt> [--instrumental] [--plan] [--duration <secs>] [--format <format>] [--output <path>]"
  echo ""
  echo "Simple mode:    $0 \"a soft piano piece about starlight\""
  echo "Instrumental:   $0 \"dreamy lo-fi beats\" --instrumental"
  echo "Plan mode:      $0 \"indie folk ballad\" --plan"
  echo "With duration:  $0 \"cinematic orchestra\" --duration 120"
  exit 1
fi

# --- Determine output file ---
if [ -z "$OUTPUT" ]; then
  EXT="mp3"
  if [[ "$FORMAT" == pcm_* ]]; then EXT="wav"; fi
  if [[ "$FORMAT" == opus_* ]]; then EXT="ogg"; fi
  OUTPUT="./composition-$(date +%s).${EXT}"
fi

TYPE_LABEL="Song"
if [ "$INSTRUMENTAL" = true ]; then TYPE_LABEL="Instrumental"; fi
MODE_LABEL="Simple"
if [ "$PLAN_MODE" = true ]; then MODE_LABEL="Plan"; fi

log_info "Mode: $MODE_LABEL | Type: $TYPE_LABEL | Format: $FORMAT"
log_info "Prompt: ${PROMPT:0:100}..."
if [ -n "$DURATION" ]; then log_info "Duration: ${DURATION}s"; fi

# --- Optional: Generate composition plan ---
COMPOSITION_PLAN=""
if [ "$PLAN_MODE" = true ]; then
  log_step "Generating composition plan..."

  PLAN_PAYLOAD=$(jq -n --arg prompt "$PROMPT" '{prompt: $prompt, model_id: "music_v1"}')
  if [ -n "$DURATION" ]; then
    PLAN_PAYLOAD=$(echo "$PLAN_PAYLOAD" | jq --argjson ms "$((DURATION * 1000))" '.music_length_ms = $ms')
  fi

  PLAN_RESPONSE=$(curl -s -X POST "$API_BASE/v1/music/plan" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$PLAN_PAYLOAD")

  # Check for error
  if echo "$PLAN_RESPONSE" | jq -e '.detail' &> /dev/null; then
    log_error "Plan API error: $(echo "$PLAN_RESPONSE" | jq -r '.detail // .message // "Unknown error"')"
    exit 1
  fi

  COMPOSITION_PLAN="$PLAN_RESPONSE"
  STYLES=$(echo "$COMPOSITION_PLAN" | jq -r '.positive_global_styles // [] | join(", ")')
  SECTIONS=$(echo "$COMPOSITION_PLAN" | jq -r '.sections // [] | map(.section_name) | join(" → ")')
  log_info "Plan generated — Styles: $STYLES"
  log_info "Sections: $SECTIONS"
fi

# --- Build stream payload ---
if [ -n "$COMPOSITION_PLAN" ]; then
  STREAM_PAYLOAD=$(jq -n --argjson plan "$COMPOSITION_PLAN" '{model_id: "music_v1", composition_plan: $plan}')
else
  STREAM_PAYLOAD=$(jq -n --arg prompt "$PROMPT" '{model_id: "music_v1", prompt: $prompt}')
  if [ -n "$DURATION" ]; then
    STREAM_PAYLOAD=$(echo "$STREAM_PAYLOAD" | jq --argjson ms "$((DURATION * 1000))" '.music_length_ms = $ms')
  fi
  if [ "$INSTRUMENTAL" = true ]; then
    STREAM_PAYLOAD=$(echo "$STREAM_PAYLOAD" | jq '.force_instrumental = true')
  fi
fi

# --- Compose the music ---
# Try /v1/music first (compose), fallback to /v1/music/stream
log_step "Composing..."

HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
  -X POST "$API_BASE/v1/music?output_format=$FORMAT" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$STREAM_PAYLOAD")

if [ "$HTTP_CODE" != "200" ]; then
  log_warn "/v1/music returned HTTP $HTTP_CODE, trying /v1/music/stream..."
  rm -f "$OUTPUT"

  HTTP_CODE=$(curl -s -w "%{http_code}" -o "$OUTPUT" \
    -X POST "$API_BASE/v1/music/stream?output_format=$FORMAT" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$STREAM_PAYLOAD")

  if [ "$HTTP_CODE" != "200" ]; then
    ERROR_BODY=$(cat "$OUTPUT" 2>/dev/null || echo "Unknown error")
    rm -f "$OUTPUT"
    log_error "Music API returned HTTP $HTTP_CODE"
    log_error "$ERROR_BODY"
    exit 1
  fi
fi

# --- Check file ---
FILE_SIZE=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null || echo "0")
SIZE_MB=$(echo "scale=2; $FILE_SIZE / 1048576" | bc 2>/dev/null || echo "?")

log_info "Composed! Saved to: $OUTPUT (${SIZE_MB} MB)"

# --- Send via OpenClaw (if channel provided) ---
if [ -n "$CHANNEL" ]; then
  MESSAGE="${CAPTION:-🎵 New composition}"
  log_step "Sending to channel: $CHANNEL"

  if command -v openclaw &> /dev/null; then
    openclaw message send \
      --channel "$CHANNEL" \
      --message "$MESSAGE" \
      --media "$OUTPUT" || log_warn "Failed to send via OpenClaw"
  else
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    SEND_PAYLOAD=$(jq -n \
      --arg channel "$CHANNEL" \
      --arg message "$MESSAGE" \
      --arg media "$OUTPUT" \
      '{action: "send", channel: $channel, message: $message, media: $media}')

    curl -s -X POST "$GATEWAY_URL/message" \
      -H "Content-Type: application/json" \
      ${OPENCLAW_GATEWAY_TOKEN:+-H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"} \
      -d "$SEND_PAYLOAD" || log_warn "Failed to send via gateway"
  fi
  log_info "Sent to $CHANNEL"
fi

# --- Output result ---
echo ""
jq -n \
  --arg file "$OUTPUT" \
  --arg size "$SIZE_MB" \
  --arg format "$FORMAT" \
  --arg prompt "$PROMPT" \
  --argjson instrumental "$INSTRUMENTAL" \
  --argjson plan_mode "$PLAN_MODE" \
  --arg duration "${DURATION:-auto}" \
  --arg channel "${CHANNEL:-none}" \
  '{
    success: true,
    file: $file,
    size_mb: $size,
    format: $format,
    prompt: $prompt,
    instrumental: $instrumental,
    plan_mode: $plan_mode,
    duration_requested: $duration,
    channel: $channel
  }'
