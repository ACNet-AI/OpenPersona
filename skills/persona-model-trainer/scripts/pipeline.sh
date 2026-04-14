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
#   --source  Path to training/ folder (output of anyone-skill or persona-knowledge export)
#
# Optional:
#   --method          Training backend: unsloth | qlora | mlx | lora | colab | skip-train
#                       unsloth    — NVIDIA GPU, fastest (default)
#                       mlx        — Apple Silicon
#                       qlora/lora — NVIDIA/CPU fallback
#                       colab      — no local GPU: generate a Colab notebook, then exit
#                       skip-train — resume after Colab: skip training, run voice_test + export
#   --preset          Named hyperparameter preset: gemma4
#                       gemma4 — sets lora-rank=16, lora-layers=16, warmup-ratio=0.1, lora-alpha=16
#                                optimised for google/gemma-4-E4B-it and google/gemma-4-27B-it
#   --epochs          Training epochs (default: 3)
#   --lora-rank       LoRA rank — dimensionality of adapter matrices (default: 16)
#   --lora-alpha      LoRA alpha — scaling factor (default: auto = lora-rank; gemma4 uses rank==alpha)
#   --lora-layers     MLX only: transformer layers to apply LoRA to (default: 16)
#   --warmup-ratio    LR warmup ratio (default: 0.05; gemma4 preset uses 0.1)
#   --batch-size      Per-device batch size (default: 2 — safe for Colab T4 and local with grad-accum=4)
#   --learning-rate   Learning rate (default: 2e-4)
#   --output-dir      Version management root dir (default: models/{slug})
#                     export/ is derived automatically as BASE_DIR/export/
#   --version         Version label for this run (default: auto-inferred as v{N+1})
#   --formats         Export formats, comma-sep: gguf,ollama,vllm,mlx,onnx  (default: gguf,ollama)
#   --quant           GGUF quantization: Q4_K_M | Q8_0 | Q6_K | ...  (default: Q4_K_M)
#   --max-chars       Max chars per training sample (default: 2048)
#   --probes          Path to probes.json (from persona-knowledge export); enables probe evaluation
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
# Preset-controlled params use empty-string sentinels so that:
#   1. Arg parsing records explicitly-set values (non-empty).
#   2. Preset block fills only the still-empty ones → explicit flags always win.
#   3. Final defaults fill anything still unset after preset.
SLUG=""
MODEL=""
SOURCE=""
METHOD="unsloth"
PRESET=""
EPOCHS=""
LORA_RANK=""
LORA_LAYERS=""
WARMUP_RATIO=""
LORA_ALPHA=""          # empty = let train.py compute as lora_rank (alpha == rank)
BATCH_SIZE=2          # default 2: safe for both local (with grad-accum=4) and Colab T4 (15 GB)
LEARNING_RATE="2e-4"
BASE_DIR=""           # set after arg parsing; --output-dir overrides
VERSION=""            # auto-inferred as v{N+1} if not set
FORMATS="gguf,ollama"
QUANT="Q4_K_M"
MAX_CHARS=2048
PROBES_FILE=""
PROBE_SCORE=""
SKIP_VOICE_TEST=false
DRY_RUN=false

# ── Argument parsing ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)            SLUG="$2";           shift 2 ;;
    --model)           MODEL="$2";          shift 2 ;;
    --source)          SOURCE="$2";         shift 2 ;;
    --method)          METHOD="$2";         shift 2 ;;
    --preset)          PRESET="$2";         shift 2 ;;
    --epochs)          EPOCHS="$2";         shift 2 ;;
    --lora-rank)       LORA_RANK="$2";      shift 2 ;;
    --lora-alpha)      LORA_ALPHA="$2";     shift 2 ;;
    --lora-layers)     LORA_LAYERS="$2";    shift 2 ;;
    --warmup-ratio)    WARMUP_RATIO="$2";   shift 2 ;;
    --batch-size)      BATCH_SIZE="$2";     shift 2 ;;
    --learning-rate)   LEARNING_RATE="$2";  shift 2 ;;
    --output-dir)      BASE_DIR="$2";       shift 2 ;;
    --version)         VERSION="$2";        shift 2 ;;
    --formats)         FORMATS="$2";        shift 2 ;;
    --quant)           QUANT="$2";          shift 2 ;;
    --max-chars)       MAX_CHARS="$2";      shift 2 ;;
    --probes)          PROBES_FILE="$2";     shift 2 ;;
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

# ── Apply preset — only fills params not already set by explicit flags ────────
if [[ -n "$PRESET" ]]; then
  case "$PRESET" in
    gemma4)
      # Explicit flags (non-empty after arg parsing) take priority over preset.
      [[ -z "$LORA_RANK"    ]] && LORA_RANK=16
      [[ -z "$LORA_LAYERS"  ]] && LORA_LAYERS=16
      [[ -z "$WARMUP_RATIO" ]] && WARMUP_RATIO="0.1"
      # lora_alpha: only set when user didn't specify; alpha==rank is Gemma 4 recommendation.
      # train.py computes alpha=rank automatically when --lora-alpha is absent.
      info "Preset gemma4 applied (explicit flags take priority):"
      info "  lora-rank=${LORA_RANK}  lora-layers=${LORA_LAYERS}  warmup-ratio=${WARMUP_RATIO}  lora-alpha=${LORA_ALPHA:-<auto=rank>}"
      info "  Recommended model: google/gemma-4-E4B-it  (MLX: mlx-community/gemma-4-E4B-it-4bit)"
      ;;
    *) fail "Unknown preset: $PRESET  (supported: gemma4)" ;;
  esac
fi

# ── Apply final defaults for any param still unset ───────────────────────────
EPOCHS="${EPOCHS:-3}"
LORA_RANK="${LORA_RANK:-16}"
LORA_LAYERS="${LORA_LAYERS:-16}"
WARMUP_RATIO="${WARMUP_RATIO:-0.05}"

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
echo -e "  ${DIM}slug:         ${RESET}$SLUG"
echo -e "  ${DIM}model:        ${RESET}$MODEL"
echo -e "  ${DIM}source:       ${RESET}$SOURCE"
echo -e "  ${DIM}method:       ${RESET}$METHOD"
[[ -n "$PRESET" ]] && echo -e "  ${DIM}preset:       ${RESET}$PRESET"
echo -e "  ${DIM}epochs:       ${RESET}$EPOCHS"
echo -e "  ${DIM}lora-rank:    ${RESET}$LORA_RANK  alpha: ${LORA_ALPHA:-<auto=rank>}  layers: $LORA_LAYERS  warmup: $WARMUP_RATIO"
echo -e "  ${DIM}version:      ${RESET}$VERSION"
echo -e "  ${DIM}base:         ${RESET}$BASE_DIR"
echo -e "  ${DIM}export:       ${RESET}$EXPORT_DIR"
echo -e "  ${DIM}formats:      ${RESET}$FORMATS"
$DRY_RUN && warn "DRY RUN — no actual training or export"

# ── Step 1: Pre-flight ────────────────────────────────────────────────────
step "Step 1/4  Pre-flight"

METADATA="$SOURCE/metadata.json"
if [[ -f "$METADATA" ]]; then
  DISTILLED=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print(d.get('distilled_turns', 0))
" "$METADATA" 2>/dev/null || echo "?")
  info "metadata.json: distilled_turns = $DISTILLED"
else
  warn "metadata.json not found — skipping turn count check"
fi

HAS_DATA=false
[[ -f "$SOURCE/conversations.jsonl" ]] && HAS_DATA=true
[[ -d "$SOURCE/raw" ]] && HAS_DATA=true
$HAS_DATA || fail "No data found in $SOURCE. Expected conversations.jsonl and/or raw/  Run anyone-skill or persona-knowledge first."

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
  COLAB_ARGS=(
    --slug          "$SLUG"
    --model         "$MODEL"
    --training-dir  "$PREPARED_DIR"
    --epochs        "$EPOCHS"
    --lora-rank     "$LORA_RANK"
    --lora-layers   "$LORA_LAYERS"
    --warmup-ratio  "$WARMUP_RATIO"
    --batch-size    "$BATCH_SIZE"
    --learning-rate "$LEARNING_RATE"
    --output        "$NOTEBOOK_PATH"
  )
  [[ -n "$LORA_ALPHA" ]] && COLAB_ARGS+=(--lora-alpha "$LORA_ALPHA")
  python3 "$SCRIPT_DIR/generate_colab.py" "${COLAB_ARGS[@]}"

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
    --lora-layers   "$LORA_LAYERS"
    --warmup-ratio  "$WARMUP_RATIO"
    --batch-size    "$BATCH_SIZE"
    --learning-rate "$LEARNING_RATE"
    --version       "$VERSION"
    --formats       "$FORMATS"
    --quant         "$QUANT"
  )
  # --lora-alpha: only passed when explicitly set; otherwise train.py auto-computes alpha=rank
  [[ -n "$LORA_ALPHA" ]] && TRAIN_ARGS+=(--lora-alpha "$LORA_ALPHA")
  [[ -f "$PROFILE"    ]] && TRAIN_ARGS+=(--profile "$PROFILE")
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
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    print(d.get('overall_score', '?'))
except Exception:
    print('?')
" "$VOICE_OUT" 2>/dev/null || echo "?")
    ok "Voice fidelity: $VOICE_SCORE / 5.0 → $VOICE_OUT"

    # Warn if below threshold but don't block export
    if python3 -c "
import json, sys; d=json.load(open(sys.argv[1], encoding='utf-8'))
exit(0 if d.get('overall_score',0) >= 3.0 else 1)
" "$VOICE_OUT" 2>/dev/null; then
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

  # ── Step 4c: Probe evaluation (optional) ─────────────────────────────────
  if [[ -n "$PROBES_FILE" ]]; then
    step "Step 4c/4  Probe evaluation"
    if [[ ! -d "$EXPORT_DIR/adapter_weights" ]]; then
      warn "adapter_weights/ not found — skipping probe evaluation"
    else
      PROBE_OUT="$EXPORT_DIR/probe_results.json"
      # eval_probe.py only supports mlx|hf — map pipeline method accordingly
      if [[ "$METHOD" == "mlx" ]]; then
        EVAL_PROBE_METHOD="mlx"
      else
        EVAL_PROBE_METHOD="hf"
      fi
      PROBE_ARGS=(
        --adapter    "$EXPORT_DIR/adapter_weights"
        --probes     "$PROBES_FILE"
        --output     "$PROBE_OUT"
        --method     "$EVAL_PROBE_METHOD"
      )
      [[ "$EVAL_PROBE_METHOD" == "hf" ]] && PROBE_ARGS+=(--base-model "$MODEL")
      python3 "$SCRIPT_DIR/eval_probe.py" "${PROBE_ARGS[@]}"

      # Inject probe_score into training_summary.json
      python3 -c "
import json, sys; from pathlib import Path
sp = Path(sys.argv[1]); pp = Path(sys.argv[2])
if not sp.exists() or not pp.exists(): sys.exit(0)
s = json.loads(sp.read_text(encoding='utf-8'))
p = json.loads(pp.read_text(encoding='utf-8'))
probe_score = p.get('probe_score')
if probe_score is None: sys.exit(0)
ev = s.setdefault('evaluation', {})
if 'probe_score' not in ev:
    ev['probe_score'] = probe_score
    sp.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding='utf-8')
" "$EXPORT_DIR/training_summary.json" "$PROBE_OUT"
      PROBE_SCORE=$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    print(f\"{d.get('probe_score', 0):.0%}\")
except Exception:
    print('?')
" "$PROBE_OUT" 2>/dev/null || echo "?")
      ok "Probe evaluation complete → $PROBE_OUT  (score: $PROBE_SCORE)"
    fi
  fi

  # ── Inject version fields (skip-train / Colab path: train.py never ran) ──
  # For normal training these fields are already written by train.py (no-op here).
  python3 -c "
import json, sys
from datetime import datetime
from pathlib import Path
p = Path(sys.argv[1])
if not p.exists(): sys.exit(0)
s = json.loads(p.read_text(encoding='utf-8'))
changed = False
for k, v in [('version', sys.argv[2]), ('formats', sys.argv[4]), ('quant', sys.argv[3])]:
    if k not in s:
        s[k] = v
        changed = True
if 'trained_at' not in s:
    s['trained_at'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    changed = True
if changed:
    p.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding='utf-8')
" "$EXPORT_DIR/training_summary.json" "$VERSION" "$QUANT" "$FORMATS"

  # ── Inject data stats into export training_summary.json ─────────────────
  # Reads from PREPARED_DIR/stats.json (always present after Step 2).
  # No-op if fields already present or either file is missing.
  python3 -c "
import json, sys; from pathlib import Path
sp = Path(sys.argv[1]); dp = Path(sys.argv[2])
if not sp.exists() or not dp.exists(): sys.exit(0)
s = json.loads(sp.read_text(encoding='utf-8'))
d = json.loads(dp.read_text(encoding='utf-8'))
changed = False
for k, v in [('data_samples', d.get('train')), ('data_eval_samples', d.get('eval')), ('data_hash', d.get('data_hash'))]:
    if k not in s and v is not None:
        s[k] = v; changed = True
if changed:
    sp.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding='utf-8')
" "$EXPORT_DIR/training_summary.json" "$PREPARED_DIR/stats.json"

  # ── Inject dataset version from source metadata.json ────────────────────
  # Reads export_version / export_hash from $SOURCE/metadata.json (persona-knowledge output).
  # No-op if $METADATA missing, fields already present, or either file is absent.
  python3 -c "
import json, sys; from pathlib import Path
sp = Path(sys.argv[1]); mp = Path(sys.argv[2])
if not sp.exists() or not mp.exists(): sys.exit(0)
s = json.loads(sp.read_text(encoding='utf-8'))
m = json.loads(mp.read_text(encoding='utf-8'))
changed = False
for k, v in [('dataset_version', m.get('export_version')),
             ('dataset_export_hash', m.get('export_hash'))]:
    if k not in s and v is not None:
        s[k] = v; changed = True
if changed:
    sp.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding='utf-8')
" "$EXPORT_DIR/training_summary.json" "$METADATA"

  # ── Archive version ──────────────────────────────────────────────────────
  step "Archive  (version: $VERSION)"
  ARCHIVE="$BASE_DIR/adapters/$VERSION"
  mkdir -p "$ARCHIVE"
  # Adapter weights: remove existing first to avoid nesting on re-run of same version
  rm -rf "$ARCHIVE/adapter_weights"
  cp -r "$EXPORT_DIR/adapter_weights"          "$ARCHIVE/"
  cp    "$EXPORT_DIR/training_summary.json"   "$ARCHIVE/" 2>/dev/null || true
  cp    "$EXPORT_DIR/voice_test_results.json" "$ARCHIVE/" 2>/dev/null || true
  cp    "$EXPORT_DIR/probe_results.json"      "$ARCHIVE/" 2>/dev/null || true
  # Archive prepared data snapshot (train/eval JSONL + stats.json)
  # Remove first to prevent nesting when the same version is re-archived
  rm -rf "$ARCHIVE/data"
  cp -r "$PREPARED_DIR" "$ARCHIVE/data"

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
[[ -n "$VOICE_SCORE"  ]] && echo -e "  ${DIM}Voice:    ${RESET}$VOICE_SCORE / 5.0"
[[ -n "$PROBE_SCORE"  ]] && echo -e "  ${DIM}Probe:    ${RESET}$PROBE_SCORE"
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

  if echo "$FORMATS" | grep -q "mlx"; then
    echo -e "  ${BOLD}# Run on Apple Silicon (MLX):${RESET}"
    echo "  python -m mlx_lm.generate --model $OUTPUT_DIR/mlx --prompt 'Hello'"
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
