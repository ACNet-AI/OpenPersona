#!/usr/bin/env bash
set -euo pipefail

# One-command demo runner for Living Canvas.
# - Starts local static server
# - Starts avatar-runtime
# - Starts a session
# - Continuously syncs state into demo/living-canvas.state.json

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo"

HTTP_PORT="${HTTP_PORT:-3840}"
RUNTIME_PORT="${RUNTIME_PORT:-3738}"
PERSONA_SLUG="${PERSONA_SLUG:-samantha}"
FORM="${FORM:-image}"
SYNC_INTERVAL_SEC="${SYNC_INTERVAL_SEC:-2}"
RENDERER_MODE="${RENDERER_MODE:-}"  # pixi | l2dwidget | vector  (empty = use state default)
_PERSONA_FLAG_SET=false

# Parse options before positional MODE argument
_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --renderer)
      RENDERER_MODE="$2"
      shift 2
      ;;
    --renderer=*)
      RENDERER_MODE="${1#*=}"
      shift
      ;;
    --persona)
      PERSONA_SLUG="$2"
      _PERSONA_FLAG_SET=true
      shift 2
      ;;
    --persona=*)
      PERSONA_SLUG="${1#*=}"
      _PERSONA_FLAG_SET=true
      shift
      ;;
    *)
      _ARGS+=("$1")
      shift
      ;;
  esac
done

MODE="${_ARGS[0]:-auto}" # auto | mock | heygen | live2d

if [[ -n "$RENDERER_MODE" && "$RENDERER_MODE" != "pixi" && "$RENDERER_MODE" != "l2dwidget" && "$RENDERER_MODE" != "vector" ]]; then
  echo "Usage: $0 [--persona <slug>] [--renderer pixi|l2dwidget|vector] [auto|mock|heygen|live2d]"
  echo "  --persona   load an installed persona by slug"
  echo "  --renderer  override the frontend renderer (default: pixi)"
  exit 1
fi

if [[ "$MODE" != "auto" && "$MODE" != "mock" && "$MODE" != "heygen" && "$MODE" != "live2d" ]]; then
  echo "Usage: $0 [--persona <slug>] [--renderer pixi|l2dwidget|vector] [auto|mock|heygen|live2d]"
  exit 1
fi

if [[ "$MODE" == "auto" ]]; then
  if [[ -n "${HEYGEN_API_KEY:-}" ]]; then
    MODE="heygen"
  elif [[ -n "${LIVE2D_ENDPOINT:-}" ]]; then
    MODE="live2d"
  else
    MODE="mock"
  fi
fi

echo "[living-canvas] mode=$MODE persona=$PERSONA_SLUG form=$FORM"

if [[ "$MODE" == "heygen" && -z "${HEYGEN_API_KEY:-}" ]]; then
  echo "[living-canvas] HEYGEN_API_KEY is required in heygen mode."
  exit 1
fi

if [[ "$MODE" == "live2d" && -z "${LIVE2D_ENDPOINT:-}" ]]; then
  echo "[living-canvas] LIVE2D_ENDPOINT is missing; live2d provider will run in skeleton compatibility mode."
fi

# ── persona directory lookup (only when --persona flag is explicit) ────────────
if [[ "$_PERSONA_FLAG_SET" == "true" ]]; then
  _PERSONA_DIR=""
  for _CAND in \
    "$HOME/.openpersona/personas/persona-${PERSONA_SLUG}" \
    "$HOME/.openclaw/skills/persona-${PERSONA_SLUG}" \
    "$HOME/.openclaw/persona-${PERSONA_SLUG}"; do
    if [[ -f "$_CAND/soul/persona.json" ]]; then
      _PERSONA_DIR="$_CAND"
      break
    fi
  done
  if [[ -z "$_PERSONA_DIR" ]]; then
    echo "[living-canvas] persona not found: ${PERSONA_SLUG}"
    echo "  searched:"
    echo "    ~/.openpersona/personas/persona-${PERSONA_SLUG}"
    echo "    ~/.openclaw/skills/persona-${PERSONA_SLUG}"
    echo "    ~/.openclaw/persona-${PERSONA_SLUG}"
    exit 1
  fi
  echo "[living-canvas] persona dir: ${_PERSONA_DIR}"

  _PERSONA_JSON="${_PERSONA_DIR}/soul/persona.json"
  _PERSONA_NAME="$(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        p = json.load(f)
    print(p.get('personaName') or p.get('name') or sys.argv[2], end='')
except Exception:
    print(sys.argv[2], end='')
" "$_PERSONA_JSON" "$PERSONA_SLUG" 2>/dev/null || echo "$PERSONA_SLUG")"

  _PERSONA_AVATAR_IMG="$(python3 -c "
import json, sys
try:
    with open(sys.argv[1]) as f:
        p = json.load(f)
    img = (p.get('appearance') or {}).get('avatarImage') or \
          ((p.get('body') or {}).get('appearance') or {}).get('avatarImage') or ''
    print(img, end='')
except Exception:
    print('', end='')
" "$_PERSONA_JSON" 2>/dev/null || echo "")"

  export LIVING_CANVAS_PERSONA_NAME="${LIVING_CANVAS_PERSONA_NAME:-${_PERSONA_NAME}}"
  if [[ -n "$_PERSONA_AVATAR_IMG" ]]; then
    export LIVING_CANVAS_AVATAR="${LIVING_CANVAS_AVATAR:-${_PERSONA_DIR}/${_PERSONA_AVATAR_IMG}}"
  else
    export LIVING_CANVAS_AVATAR="${LIVING_CANVAS_AVATAR:-}"
  fi
fi

if [[ "$MODE" == "live2d" && -n "${LIVE2D_ENDPOINT:-}" && -z "${LIVE2D_MODEL3_URL:-}" ]]; then
  LIVE2D_LOCAL_SAMPLE_ENABLED="${LIVE2D_LOCAL_SAMPLE_ENABLED:-true}"
  if [[ "$LIVE2D_LOCAL_SAMPLE_ENABLED" == "true" ]]; then
    if bash "$ROOT_DIR/packages/avatar-runtime/scripts/ensure-default-live2d-sample.sh"; then
      LIVE2D_BRIDGE_BASE="${LIVE2D_ENDPOINT%/}"
      if [[ -f "$ROOT_DIR/packages/avatar-runtime/assets/live2d/slot/default.model.json" ]]; then
        export LIVE2D_MODEL3_URL="${LIVE2D_BRIDGE_BASE}/assets/live2d/slot/default.model.json"
      elif [[ -f "$ROOT_DIR/packages/avatar-runtime/assets/live2d/slot/default.model3.json" ]]; then
        export LIVE2D_MODEL3_URL="${LIVE2D_BRIDGE_BASE}/assets/live2d/slot/default.model3.json"
      fi
      if [[ -n "${LIVE2D_MODEL3_URL:-}" ]]; then
        echo "[living-canvas] using local default model: ${LIVE2D_MODEL3_URL}"
      fi
    else
      echo "[living-canvas] local sample preparation failed; will try public sample fallback"
    fi
  fi

  if [[ -z "${LIVE2D_MODEL3_URL:-}" ]]; then
    LIVE2D_PUBLIC_SAMPLE_ENABLED="${LIVE2D_PUBLIC_SAMPLE_ENABLED:-true}"
    if [[ "$LIVE2D_PUBLIC_SAMPLE_ENABLED" == "true" ]]; then
      export LIVE2D_MODEL3_URL="${LIVE2D_PUBLIC_SAMPLE_MODEL3_URL:-https://unpkg.com/live2d-widget-model-chitose@1.0.5/assets/chitose.model.json}"
      echo "[living-canvas] using public sample model: ${LIVE2D_MODEL3_URL}"
    fi
  fi
fi

cleanup() {
  if [[ -n "${HTTP_PID:-}" ]] && kill -0 "$HTTP_PID" 2>/dev/null; then
    kill "$HTTP_PID" || true
  fi
  if [[ -n "${RUNTIME_PID:-}" ]] && kill -0 "$RUNTIME_PID" 2>/dev/null; then
    kill "$RUNTIME_PID" || true
  fi
}
trap cleanup EXIT INT TERM

echo "[living-canvas] start static server: http://127.0.0.1:${HTTP_PORT}"
python3 -m http.server "$HTTP_PORT" --directory "$ROOT_DIR" >/tmp/living-canvas-http.log 2>&1 &
HTTP_PID=$!

export AVATAR_PROVIDER="$MODE"
export HEYGEN_STRICT="$([[ "$MODE" == "heygen" ]] && echo "true" || echo "false")"
export LIVE2D_STRICT="${LIVE2D_STRICT:-false}"
export AVATAR_RUNTIME_URL="http://127.0.0.1:${RUNTIME_PORT}"

echo "[living-canvas] start avatar-runtime: ${AVATAR_RUNTIME_URL}"
node "$ROOT_DIR/packages/avatar-runtime/bin/avatar-runtime.js" --port "$RUNTIME_PORT" >/tmp/living-canvas-runtime.log 2>&1 &
RUNTIME_PID=$!

sleep 1

START_JSON="$(node "$ROOT_DIR/layers/faculties/avatar/scripts/avatar-runtime.js" start "$PERSONA_SLUG" "$FORM")"
SESSION_ID="$(python3 - <<'PY' "$START_JSON"
import json,sys
obj=json.loads(sys.argv[1])
print(obj.get("sessionId",""))
PY
)"

if [[ -z "$SESSION_ID" ]]; then
  echo "[living-canvas] failed to get sessionId"
  exit 1
fi

export LIVING_CANVAS_STATE_PATH="${LIVING_CANVAS_STATE_PATH:-demo/living-canvas.state.json}"
export LIVING_CANVAS_PERSONA_NAME="${LIVING_CANVAS_PERSONA_NAME:-Persona}"
export LIVING_CANVAS_ROLE="${LIVING_CANVAS_ROLE:-companion}"
export LIVING_CANVAS_AVATAR="${LIVING_CANVAS_AVATAR:-}"
export LIVING_CANVAS_DISPLAY_MODE="${LIVING_CANVAS_DISPLAY_MODE:-provider}"
export LIVING_CANVAS_QUALITY="${LIVING_CANVAS_QUALITY:-medium}"
export LIVING_CANVAS_AUTO_QUALITY="${LIVING_CANVAS_AUTO_QUALITY:-true}"
export LIVING_CANVAS_ALLOW_RUNTIME_TOKEN="${LIVING_CANVAS_ALLOW_RUNTIME_TOKEN:-true}"

STATE_QUERY_PATH="$LIVING_CANVAS_STATE_PATH"
if [[ "$STATE_QUERY_PATH" == demo/* ]]; then
  STATE_QUERY_PATH="./${STATE_QUERY_PATH#demo/}"
fi

_RENDERER_PARAM=""
if [[ -n "$RENDERER_MODE" ]]; then
  _RENDERER_PARAM="&renderer=${RENDERER_MODE}"
fi

echo "[living-canvas] sessionId=$SESSION_ID"
echo "[living-canvas] open: http://127.0.0.1:${HTTP_PORT}/demo/living-canvas.html?state=${STATE_QUERY_PATH}${_RENDERER_PARAM}"
echo "[living-canvas] display controls via env: LIVING_CANVAS_DISPLAY_MODE=provider|experimental, LIVING_CANVAS_QUALITY=low|medium|high, LIVING_CANVAS_AUTO_QUALITY=true|false"
if [[ -n "$RENDERER_MODE" ]]; then
  echo "[living-canvas] renderer: ${RENDERER_MODE} (forced via --renderer flag)"
fi

node "$ROOT_DIR/layers/faculties/avatar/scripts/avatar-runtime.js" sync-loop "$PERSONA_SLUG" "$SESSION_ID" "$SYNC_INTERVAL_SEC"
