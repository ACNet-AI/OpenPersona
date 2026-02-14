#!/usr/bin/env bash
# OpenPersona Voice Faculty — TTS synthesis + optional OpenClaw delivery
#
# Usage: ./speak.sh <text> [output_path] [channel] [caption]
#
# Arguments:
#   text         - Text to synthesize (required)
#   output_path  - Output audio file path (default: /tmp/openpersona-voice-{timestamp}.mp3)
#   channel      - OpenClaw channel to send to (optional)
#   caption      - Message caption (optional)
#
# Environment variables:
#   TTS_PROVIDER   - elevenlabs, openai, or qwen3 (required)
#   TTS_API_KEY    - API key (required for elevenlabs/openai)
#   TTS_VOICE_ID   - Voice identifier (provider-specific)
#   OPENCLAW_GATEWAY_TOKEN - For messaging delivery (optional)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# --- Parse arguments ---
TEXT="${1:-}"
OUTPUT="${2:-/tmp/openpersona-voice-$(date +%s).mp3}"
CHANNEL="${3:-}"
CAPTION="${4:-}"

if [ -z "$TEXT" ]; then
  echo "Usage: $0 <text> [output_path] [channel] [caption]"
  echo ""
  echo "Environment variables:"
  echo "  TTS_PROVIDER   elevenlabs, openai, or qwen3"
  echo "  TTS_API_KEY    API key for the TTS provider"
  echo "  TTS_VOICE_ID   Voice identifier (provider-specific)"
  echo ""
  echo "Examples:"
  echo "  TTS_PROVIDER=openai TTS_API_KEY=sk-... $0 \"Hello, how are you?\""
  echo "  TTS_PROVIDER=elevenlabs $0 \"I wrote you a poem\" /tmp/poem.mp3 \"#general\""
  exit 1
fi

PROVIDER="${TTS_PROVIDER:-}"

# Auto-detect provider
if [ -z "$PROVIDER" ]; then
  if [ -n "${TTS_API_KEY:-}" ]; then
    PROVIDER="openai"
    log_warn "TTS_PROVIDER not set, defaulting to openai"
  else
    log_error "TTS_PROVIDER not set and no TTS_API_KEY found"
    echo "Set TTS_PROVIDER to: elevenlabs, openai, or qwen3"
    exit 1
  fi
fi

if ! command -v jq &> /dev/null; then
  log_error "jq is required but not installed"
  echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi

log_info "Provider: $PROVIDER"
log_info "Text: ${TEXT:0:80}$([ ${#TEXT} -gt 80 ] && echo '...')"

# --- Generate audio based on provider ---
case "$PROVIDER" in
  elevenlabs)
    if [ -z "${TTS_API_KEY:-}" ] && [ -z "${ELEVENLABS_API_KEY:-}" ]; then
      log_error "TTS_API_KEY or ELEVENLABS_API_KEY required for ElevenLabs"
      exit 1
    fi
    API_KEY="${ELEVENLABS_API_KEY:-$TTS_API_KEY}"
    VOICE_ID="${TTS_VOICE_ID:-21m00Tcm4TlvDq8ikWAM}"  # Default: Rachel
    STABILITY="${TTS_STABILITY:-0.5}"
    SIMILARITY="${TTS_SIMILARITY:-0.75}"
    JSON_PAYLOAD=$(jq -n \
      --arg text "$TEXT" \
      --argjson stability "$STABILITY" \
      --argjson similarity "$SIMILARITY" \
      '{text: $text, model_id: "eleven_multilingual_v2", voice_settings: {stability: $stability, similarity_boost: $similarity}}')

    curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \
      -H "xi-api-key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$JSON_PAYLOAD" \
      --output "$OUTPUT"
    ;;

  openai)
    if [ -z "${TTS_API_KEY:-}" ]; then
      log_error "TTS_API_KEY required for OpenAI TTS"
      exit 1
    fi
    VOICE_ID="${TTS_VOICE_ID:-nova}"  # Default: nova (warm, female)
    JSON_PAYLOAD=$(jq -n \
      --arg input "$TEXT" \
      --arg voice "$VOICE_ID" \
      '{model: "tts-1-hd", input: $input, voice: $voice, response_format: "mp3"}')

    curl -s -X POST "https://api.openai.com/v1/audio/speech" \
      -H "Authorization: Bearer $TTS_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$JSON_PAYLOAD" \
      --output "$OUTPUT"
    ;;

  qwen3)
    QWEN_URL="${QWEN3_TTS_URL:-http://localhost:8080}"
    JSON_PAYLOAD=$(jq -n \
      --arg input "$TEXT" \
      --arg voice "${TTS_VOICE_ID:-default}" \
      '{input: $input, voice: $voice}')

    curl -s -X POST "$QWEN_URL/v1/audio/speech" \
      -H "Content-Type: application/json" \
      -d "$JSON_PAYLOAD" \
      --output "$OUTPUT"
    ;;

  *)
    log_error "Unknown provider: $PROVIDER (use elevenlabs, openai, or qwen3)"
    exit 1
    ;;
esac

# --- Validate output ---
if [ ! -f "$OUTPUT" ] || [ ! -s "$OUTPUT" ]; then
  log_error "Failed to generate audio — output file is empty"
  exit 1
fi

FILE_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
log_info "Audio generated: $OUTPUT ($FILE_SIZE bytes)"

# --- Send via OpenClaw (if channel provided) ---
if [ -n "$CHANNEL" ]; then
  MESSAGE="${CAPTION:-🎤}"
  log_info "Sending to channel: $CHANNEL"

  if command -v openclaw &> /dev/null; then
    openclaw message send \
      --action send \
      --channel "$CHANNEL" \
      --message "$MESSAGE" \
      --media "$OUTPUT"
  else
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    curl -s -X POST "$GATEWAY_URL/message" \
      ${OPENCLAW_GATEWAY_TOKEN:+-H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"} \
      -F "channel=$CHANNEL" \
      -F "message=$MESSAGE" \
      -F "media=@$OUTPUT"
  fi
  log_info "Sent to $CHANNEL"
fi

# --- Output result ---
echo ""
jq -n \
  --arg file "$OUTPUT" \
  --arg provider "$PROVIDER" \
  --arg size "$FILE_SIZE" \
  --arg channel "${CHANNEL:-none}" \
  '{success: true, audio_file: $file, provider: $provider, size_bytes: $size, channel: $channel}'
