#!/usr/bin/env bash
# persona-model-trainer pipeline orchestrator
# Chains: prepare_data → train → voice_test → export
#
# Usage:
#   bash scripts/pipeline.sh \
#     --slug alice \
#     --model google/gemma-4-E4B-it \
#     --source ./training \
#     --method mlx
#
# Required:
#   --slug    Persona slug (used for output dir and Ollama model name)
#   --model   HuggingFace model ID (e.g. google/gemma-4-E4B-it, Qwen/Qwen3-4B-Instruct)
#   --source  Path to training/ folder (output of anyone-skill or persona-dataset export)
#
# Optional:
#   --method          Training backend: unsloth | qlora | mlx | lora | colab | skip-train
#                       unsloth    — NVIDIA GPU, fastest (default)
#                       mlx        — Apple Silicon
#                       qlora/lora — NVIDIA/CPU fallback
#                       colab      — no local GPU: generate a Colab notebook, then exit
#                       skip-train — resume after Colab: skip training, run voice_test + export
#   --epochs          Training epochs (default: 3)
#   --lora-rank       LoRA rank (default: 16)
#   --batch-size      Per-device batch size (default: 2 — safe for Colab T4 and local with grad-accum=4)
#   --learning-rate   Learning rate (default: 2e-4)
#   --output-dir      Version management root dir (default: models/{slug})
#                     export/ is derived automatically as BASE_DIR/export/
#   --version         Version label for this run (default: auto-inferred as v{N+1})
#   --formats         Export formats, comma-sep: gguf,ollama,vllm,onnx  (default: gguf,ollama)
#   --quant           GGUF quantization: Q4_K_M | Q8_0 | Q6_K | ...  (default: Q4_K_M)
#   --max-chars       Max chars per training sample (default: 2048)
#   --skip-voice-test Skip Phase 4a voice validation
#   --dry-run         Validate pipeline setup without actual training or export

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Terminal colors ──────────────────────────────────────────────────────
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
DIM="\033[2m"
RESET="\033[0m"

step()  { echo -e "\n${BOLD}${CYAN}── $* ──${RESET}"; }
ok()    { echo -e "${GREEN}✅  $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠️   $*${RESET}"; }
fail()  { echo -e "${RED}❌  $*${RESET}" >&2; exit 1; }
info()  { echo -e "${DIM}   $*${RESET}"; }

# ── Defaults ─────────────────────────────────────────────────────────────
SLUG=""
MODEL=""
SOURCE=""
METHOD="unsloth"
EPOCHS=3
LORA_RANK=16
BATCH_SIZE=2          # default 2: safe for both local (with grad-accum=4) and Colab T4 (15 GB)
LEARNING_RATE="2e-4"
BASE_DIR=""           # set after arg parsing; --output-dir overrides
VERSION=""            # auto-inferred as v{N+1} if not set
FORMATS="gguf,ollama"
QUANT="Q4_K_M"
MAX_CHARS=2048
SKIP_VOICE_TEST=false
DRY_RUN=false

# ── Argument parsing ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)            SLUG="$2";           shift 2 ;;
    --model)           MODEL="$2";          shift 2 ;;
    --source)          SOURCE="$2";         shift 2 ;;
    --method)          METHOD="$2";         shift 2 ;;
    --epochs)          EPOCHS="$2";         shift 2 ;;
    --lora-rank)       LORA_RANK="$2";      shift 2 ;;
    --batch-size)      BATCH_SIZE="$2";     shift 2 ;;
    --learning-rate)   LEARNING_RATE="$2";  shift 2 ;;
    --output-dir)      BASE_DIR="$2";       shift 2 ;;
    --version)         VERSION="$2";        shift 2 ;;
    --formats)         FORMATS="$2";        shift 2 ;;
    --quant)           QUANT="$2";          shift 2 ;;
    --max-chars)       MAX_CHARS="$2";      shift 2 ;;
    --skip-voice-test) SKIP_VOICE_TEST=true; shift ;;
    --dry-run)         DRY_RUN=true;        shift ;;
    -h|--help)
      # Print only contiguous comment block at top of file (lines 2 onward until first non-comment)
      awk 'NR>1 && /^[^#]/{exit} NR>1{sub(/^# ?/,""); print}' "$0"
      exit 0
      ;;
    *) fail "Unknown argument: $1 (use --help for usage)" ;;
  esac
done

# ── Validate required args ────────────────────────────────────────────────
[[ -z "$SLUG"   ]] && fail "--slug is required"
[[ -z "$MODEL"  ]] && fail "--model is required  (HuggingFace model ID)"
[[ -z "$SOURCE" ]] && fail "--source is required (path to training/ folder)"
[[ ! -d "$SOURCE" ]] && fail "Source directory not found: $SOURCE"

SOURCE="$(cd "$SOURCE" && pwd)"
BASE_DIR="${BASE_DIR:-models/$SLUG}"     # version management root
EXPORT_DIR="$BASE_DIR/export"           # current working version (large files, only one copy)
PREPARED_DIR="$BASE_DIR/prepared"       # training inputs (independent of export/)
OUTPUT_DIR="$EXPORT_DIR"                # passed to train.py / voice_test.py / export.py
PROFILE="$SOURCE/profile.md"

# ── Auto-infer version ────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  # || N=0 guards against ls failing (set -euo pipefail + no adapters/ dir yet on first run)
  N=$(ls -d "$BASE_DIR/adapters/v"[0-9]* 2>/dev/null | wc -l | tr -d ' ') || N=0
  VERSION="v$(( N + 1 ))"
fi

START_TS=$(date +%s)

# ── Header ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}persona-model-trainer pipeline${RESET}"
echo -e "  ${DIM}slug:    ${RESET}$SLUG"
echo -e "  ${DIM}model:   ${RESET}$MODEL"
echo -e "  ${DIM}source:  ${RESET}$SOURCE"
echo -e "  ${DIM}method:  ${RESET}$METHOD"
echo -e "  ${DIM}epochs:  ${RESET}$EPOCHS"
echo -e "  ${DIM}version: ${RESET}$VERSION"
echo -e "  ${DIM}base:    ${RESET}$BASE_DIR"
echo -e "  ${DIM}export:  ${RESET}$EXPORT_DIR"
echo -e "  ${DIM}formats: ${RESET}$FORMATS"
$DRY_RUN && warn "DRY RUN — no actual training or export"

# ── Step 1: Pre-flight ────────────────────────────────────────────────────
step "Step 1/4  Pre-flight"

METADATA="$SOURCE/metadata.json"
if [[ -f "$METADATA" ]]; then
  DISTILLED=$(python3 -c "
import json, sys
d = json.load(open('$METADATA'))
print(d.get('distilled_turns', 0))
" 2>/dev/null || echo "?")
  info "metadata.json: distilled_turns = $DISTILLED"
else
  warn "metadata.json not found — skipping turn count check"
fi

HAS_DATA=false
[[ -f "$SOURCE/conversations.jsonl" ]] && HAS_DATA=true
[[ -d "$SOURCE/raw" ]] && HAS_DATA=true
$HAS_DATA || fail "No data found in $SOURCE. Expected conversations.jsonl and/or raw/  Run anyone-skill or persona-dataset first."

[[ -f "$PROFILE" ]] && info "profile.md: found" || warn "profile.md not found — system prompt will be empty"

ok "Pre-flight passed"

# ── Step 2: Prepare data ──────────────────────────────────────────────────
step "Step 2/4  Prepare data"

mkdir -p "$PREPARED_DIR"

PREPARE_ARGS=(
  --output "$PREPARED_DIR"
  --model  "$MODEL"
  --max-chars "$MAX_CHARS"
)
[[ -f "$SOURCE/conversations.jsonl" ]] && PREPARE_ARGS+=(--input "$SOURCE/conversations.jsonl")
[[ -d "$SOURCE/raw"                 ]] && PREPARE_ARGS+=(--raw-dir "$SOURCE/raw")
[[ -f "$PROFILE"                    ]] && PREPARE_ARGS+=(--profile "$PROFILE")

python3 "$SCRIPT_DIR/prepare_data.py" "${PREPARE_ARGS[@]}"

TRAIN_SAMPLES=$(wc -l < "$PREPARED_DIR/train.jsonl" 2>/dev/null | tr -d ' ' || echo 0)
ok "Data prepared: $TRAIN_SAMPLES training samples → $PREPARED_DIR"

# ── Step 3: Fine-tune ─────────────────────────────────────────────────────
step "Step 3/4  Fine-tune  (method: $METHOD, epochs: $EPOCHS)"

if [[ "$METHOD" == "colab" ]]; then
  # Generate a Colab notebook instead of running training locally
  NOTEBOOK_PATH="colab_train_${SLUG}.ipynb"
  python3 "$SCRIPT_DIR/generate_colab.py" \
    --slug          "$SLUG" \
    --model         "$MODEL" \
    --training-dir  "$PREPARED_DIR" \
    --epochs        "$EPOCHS" \
    --lora-rank     "$LORA_RANK" \
    --batch-size    "$BATCH_SIZE" \
    --learning-rate "$LEARNING_RATE" \
    --output        "$NOTEBOOK_PATH"

  echo ""
  warn "Colab mode: training will run in Google Colab, not locally."
  echo "  Upload $NOTEBOOK_PATH to colab.research.google.com"
  echo "  After training, download adapter_weights_${SLUG}.zip and unzip into $EXPORT_DIR/"
  echo "  Then re-run pipeline.sh --method skip-train to do voice_test + export"
  echo ""
  exit 0
fi

if [[ "$METHOD" == "skip-train" ]]; then
  # Used after Colab training: skip training, go straight to voice_test + export.
  # prepare_data.py already ran above (Step 2) — idempotent, safe to re-run.
  ADAPTER_CHECK="$OUTPUT_DIR/adapter_weights"
  if [[ ! -d "$ADAPTER_CHECK" ]]; then
    fail "adapter_weights/ not found at $ADAPTER_CHECK\n   Unzip the Colab download first:\n   unzip adapter_weights_${SLUG}.zip -d $OUTPUT_DIR/"
  fi
  ok "Skipping training (adapter already present at $ADAPTER_CHECK)"
else
  TRAIN_ARGS=(
    --model         "$MODEL"
    --data          "$PREPARED_DIR"
    --output        "$OUTPUT_DIR"
    --method        "$METHOD"
    --epochs        "$EPOCHS"
    --lora-rank     "$LORA_RANK"
    --batch-size    "$BATCH_SIZE"
    --learning-rate "$LEARNING_RATE"
    --version       "$VERSION"
    --formats       "$FORMATS"
    --quant         "$QUANT"
  )
  [[ -f "$PROFILE" ]] && TRAIN_ARGS+=(--profile "$PROFILE")
  $DRY_RUN && TRAIN_ARGS+=(--dry-run)

  python3 "$SCRIPT_DIR/train.py" "${TRAIN_ARGS[@]}"

  if $DRY_RUN; then
    ok "Dry run complete — adapter training skipped"
  else
    ok "Training complete → $OUTPUT_DIR/adapter_weights/"
  fi
fi

# ── Step 4a: Voice validation ─────────────────────────────────────────────
VOICE_SCORE=""
if ! $SKIP_VOICE_TEST && ! $DRY_RUN; then
  step "Step 4a/4  Voice validation"

  ADAPTER_PATH="$OUTPUT_DIR/adapter_weights"
  if [[ ! -d "$ADAPTER_PATH" ]]; then
    warn "adapter_weights/ not found — skipping voice test"
  else
    VOICE_OUT="$OUTPUT_DIR/voice_test_results.json"
    VOICE_ARGS=(
      --model      "$ADAPTER_PATH"
      --base-model "$MODEL"
      --output     "$VOICE_OUT"
      --questions  10
    )
    [[ -f "$PROFILE" ]] && VOICE_ARGS+=(--profile "$PROFILE")

    python3 "$SCRIPT_DIR/voice_test.py" "${VOICE_ARGS[@]}"

    VOICE_SCORE=$(python3 -c "
import json, sys
try:
    d = json.load(open('$VOICE_OUT'))
    print(d.get('overall_score', '?'))
except Exception:
    print('?')
" 2>/dev/null || echo "?")
    ok "Voice fidelity: $VOICE_SCORE / 5.0 → $VOICE_OUT"

    # Warn if below threshold but don't block export
    if python3 -c "
import json; d=json.load(open('$VOICE_OUT'))
exit(0 if d.get('overall_score',0) >= 3.0 else 1)
" 2>/dev/null; then
      true
    else
      warn "Score below 3.0 — consider re-training with more data or more epochs"
      warn "Continuing to export anyway (you can re-train and re-export later)"
    fi
  fi
fi

# ── Step 4b: Export ───────────────────────────────────────────────────────
if ! $DRY_RUN; then
  step "Step 4b/4  Export  (formats: $FORMATS)"

  EXPORT_ARGS=(
    --model      "$OUTPUT_DIR/adapter_weights/"
    --base-model "$MODEL"
    --slug       "$SLUG"
    --formats    "$FORMATS"
    --quant      "$QUANT"
  )
  [[ -f "$PROFILE" ]] && EXPORT_ARGS+=(--profile "$PROFILE")

  python3 "$SCRIPT_DIR/export.py" "${EXPORT_ARGS[@]}"

  # ── Inject version fields (skip-train / Colab path: train.py never ran) ──
  # For normal training these fields are already written by train.py (no-op here).
  python3 -c "
import json, sys
from datetime import datetime
from pathlib import Path
p = Path('$EXPORT_DIR/training_summary.json')
if not p.exists(): sys.exit(0)
s = json.loads(p.read_text())
changed = False
for k, v in [('version', '$VERSION'), ('formats', '$FORMATS'), ('quant', '$QUANT')]:
    if k not in s:
        s[k] = v
        changed = True
if 'trained_at' not in s:
    s['trained_at'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    changed = True
if changed:
    p.write_text(json.dumps(s, indent=2))
"

  # ── Archive version ──────────────────────────────────────────────────────
  step "Archive  (version: $VERSION)"
  ARCHIVE="$BASE_DIR/adapters/$VERSION"
  mkdir -p "$ARCHIVE"
  # No trailing slash: cp -r dir dst/ copies dir itself (→ dst/dir/), not its contents
  cp -r "$EXPORT_DIR/adapter_weights"          "$ARCHIVE/"
  cp    "$EXPORT_DIR/training_summary.json"   "$ARCHIVE/" 2>/dev/null || true
  cp    "$EXPORT_DIR/voice_test_results.json" "$ARCHIVE/" 2>/dev/null || true

  python3 "$SCRIPT_DIR/version.py" update-manifest \
    --slug "$SLUG" --version "$VERSION" \
    --base-dir "$(cd "$BASE_DIR" && pwd)"
  ok "Archived $VERSION → $ARCHIVE"
fi

# ── Summary ───────────────────────────────────────────────────────────────
END_TS=$(date +%s)
ELAPSED=$(( END_TS - START_TS ))
ELAPSED_FMT="$(( ELAPSED / 60 ))m $(( ELAPSED % 60 ))s"

echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
if $DRY_RUN; then
  echo -e "${BOLD}Dry run complete${RESET}  (${ELAPSED_FMT})"
else
  echo -e "${BOLD}${GREEN}Pipeline complete${RESET}  (${ELAPSED_FMT})"
fi
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${DIM}Version:  ${RESET}$VERSION"
echo -e "  ${DIM}Archive:  ${RESET}$BASE_DIR/adapters/$VERSION/"
echo -e "  ${DIM}Export:   ${RESET}$EXPORT_DIR/"
echo -e "  ${DIM}Summary:  ${RESET}$EXPORT_DIR/training_summary.json"
[[ -n "$VOICE_SCORE" ]] && echo -e "  ${DIM}Voice:    ${RESET}$VOICE_SCORE / 5.0"
echo ""

if ! $DRY_RUN; then
  echo -e "${BOLD}Next steps:${RESET}"
  echo ""

  if echo "$FORMATS" | grep -q "ollama"; then
    MODELFILE="$OUTPUT_DIR/ollama/Modelfile"
    echo -e "  ${BOLD}# Run locally with Ollama:${RESET}"
    echo "  ollama create $SLUG -f $MODELFILE"
    echo "  ollama run $SLUG"
    echo ""
  fi

  if echo "$FORMATS" | grep -q "gguf"; then
    echo -e "  ${BOLD}# Run with llama.cpp / LM Studio:${RESET}"
    echo "  ./llama-cli -m $OUTPUT_DIR/gguf/${SLUG}.gguf --interactive"
    echo ""
  fi

  if echo "$FORMATS" | grep -q "vllm"; then
    echo -e "  ${BOLD}# Serve as OpenAI-compatible API:${RESET}"
    echo "  bash $OUTPUT_DIR/vllm/launch.sh"
    echo "  # → http://localhost:8000/v1/chat/completions"
    echo ""
  fi

  echo -e "  ${BOLD}# Pack integration (bundle into installed persona skill pack):${RESET}"
  echo "  python scripts/pack_integrate.py \\"
  echo "    --slug $SLUG \\"
  echo "    --model-dir $BASE_DIR \\"
  echo "    [--pack-dir ~/.openpersona/personas/persona-$SLUG/]"
  echo "  # Dry-run first: add --dry-run to preview changes"
  echo ""
  echo -e "  ${BOLD}# Version management:${RESET}"
  echo "  python scripts/version.py list --slug $SLUG"
  echo "  python scripts/version.py activate --slug $SLUG --version v1"
fi
