---

name: persona-model-trainer
description: Fine-tune a small local model (Gemma-4 E2B/E4B) on distilled persona data from anyone-skill. Produces a self-contained, locally runnable persona model that works on phones and personal computers — no cloud API required.
version: 0.1.0
license: MIT
author: acnlabs
compatibility:
  agents:
    - claude-code
    - cursor
    - openclaw
allowed-tools: Read Write Bash WebSearch
metadata:
  requires:
    - anyone-skill (for training data)
    - python >= 3.11
    - uv (pip install uv)
    - 4 GB+ RAM for E2B model, 8 GB+ for E4B model
  optional:
    - CUDA GPU + Unsloth (2–5× faster QLoRA)
    - Apple Silicon + MLX (Apple-native, faster than PyTorch MPS)
    - autoresearch skill (Phase 6.5 hyperparameter refinement loop)

---

# persona-model-trainer

Fine-tune a small local model on distilled persona data. Turn anyone-skill's output into a self-contained model that **is** the person — no prompting, no cloud, no latency.

**Dependency chain**: `anyone-skill` → `persona-model-trainer` → runnable Gemma-4 persona model

**Input**: `training/` folder produced by `anyone-skill` Step 6-D (raw/ populated in Phase 3)  
**Output**: LoRA/QLoRA adapter weights (method depends on hardware) + GGUF export for Ollama/llama.cpp + updated skill pack

---

## When to use this skill

Trigger phrases:

- "train a model for this persona"
- "make it run locally / on my phone"
- "fine-tune on the distilled data"
- "I want a model, not just a prompt"
- "create a self-contained persona model"

**Not suitable when:**

- Effective assistant-role turns (raw/ + conversations.jsonl combined) < 200
- User only wants a quick prompt-based persona (use anyone-skill alone)

> Fictional characters and historical figures can be trained if `training/raw/` contains scripts, lore, speeches, or biographies — check actual turn count, not subject type.

---

## Phase 1: Pre-flight Check

Read `training/metadata.json` (written by anyone-skill Step 6-D):

```json
{
  "slug": "...",
  "name": "...",
  "subject_type": "personal | public | fictional | historical | archetype",
  "source_count": 3,
  "total_words": 48000,
  "distilled_turns": 320,
  "raw_files": ["whatsapp.jsonl", "essays.txt"],
  "created_at": "2026-04-11T10:00:00Z"
}
```

**Gate — estimate effective assistant turns before proceeding:**

```bash
# Quick count without running the full pipeline
python3 -c "
import json, pathlib
raw = sum(
    sum(1 for l in open(f) if json.loads(l).get('role')=='assistant')
    for f in pathlib.Path('training/raw').glob('*.jsonl') if f.exists()
) if pathlib.Path('training/raw').exists() else 0
dist = sum(1 for l in open('training/conversations.jsonl')
           if json.loads(l).get('role')=='assistant') \
       if pathlib.Path('training/conversations.jsonl').exists() else 0
print(f'assistant turns — raw: {raw}  distilled: {dist}  total: {raw+dist}')
"
```

If total < 200 → stop:  
*"Not enough authentic voice data (< 200 turns). Fine-tuning would overfit noise. Use the prompt-based persona instead, or collect more source material."*

**Minimum quality bar:**

- ≥ 200 `assistant`-role turns (combined from raw/ + conversations.jsonl)
- Source material spans ≥ 3 distinct topics or time periods
- No PII red flags from PII scan output

> **Note**: Fictional and historical subjects can meet this bar via `training/raw/` (scripts, lore books, speeches, biographies). Check the actual turn count — don't reject based on subject type alone.

Read `slug` from `metadata.json["slug"]` — used as `{slug}` in all subsequent commands. Confirm once:

*"Found [N] assistant-role turns from [source_count] sources for slug `{slug}`. Estimated training time: [~X hours] on [detected hardware]. Proceed?"*

---

## Phase 2: Model Selection

Ask once (hardware will be verified in Phase 3 after environment setup):

> *"Which model size do you want?"*
>
> - **E2B** (`google/gemma-4-E2B-it`, ~~2B active params) — runs on phones (4 GB RAM), fastest training (~~1–2h on M2), lower fidelity
> - **E4B** (`google/gemma-4-E4B-it`, ~~4B active params) — laptop-class (8 GB RAM), better voice capture (~~4–6h on M2), **recommended**
> - **26B-A4B** (`google/gemma-4-26B-A4B-it`, 26B MoE / 4B active) — high quality, complex to fine-tune, requires 24 GB+ RAM

Default recommendation:

- Apple Silicon (M1/M2/M3/M4) → **E4B** via MLX (Apple-native; fallback: PyTorch MPS LoRA)
- NVIDIA GPU ≥ 8 GB VRAM → **E4B** via Unsloth QLoRA (fallback: vanilla QLoRA)
- CPU only → **E2B** (warn: very slow, ~20h+)

---

## Phase 3: Environment Setup

```bash
# Install uv if missing
which uv || pip install uv

# Create isolated environment
uv venv .venv-trainer
source .venv-trainer/bin/activate
```

**Install training stack — pick by platform:**

```bash
# NVIDIA GPU (CUDA) — Unsloth (official recommended QLoRA path, 2–5× faster than vanilla HF)
uv pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
uv pip install torch torchvision torchaudio \
  transformers>=4.50 datasets sentencepiece protobuf

# NVIDIA GPU (CUDA) — vanilla HuggingFace fallback (if Unsloth install fails)
uv pip install torch torchvision torchaudio \
  transformers>=4.50 peft>=0.14 datasets trl>=0.9 \
  bitsandbytes accelerate sentencepiece protobuf

# Apple Silicon (M1/M2/M3/M4) — MLX (Apple-native, faster than PyTorch MPS)
uv pip install mlx-lm

# Apple Silicon fallback — PyTorch MPS (if MLX doesn't support chosen model yet)
# MPS backend is built-in to PyTorch ≥ 2.0 — do NOT use --index-url .../cpu
uv pip install torch torchvision torchaudio \
  transformers>=4.50 peft>=0.14 datasets trl>=0.9 \
  accelerate sentencepiece protobuf

# CPU only
uv pip install torch torchvision torchaudio \
  transformers>=4.50 peft>=0.14 datasets trl>=0.9 \
  accelerate sentencepiece protobuf
```

Verify setup (also confirms hardware for the model size chosen in Phase 2):

```bash
python scripts/check_env.py
```

---

## Phase 4: Data Preparation

`prepare_data.py` reads from **two layers** and merges them:

| Layer | Path | Content | Role in training |
|-------|------|---------|-----------------|
| Raw sources | `training/raw/` | Original files (.jsonl / .json / .txt / .csv) | Authentic voice — teaches real wording |
| Distilled | `training/conversations.jsonl` | Structured turns from anyone-skill | Coherent Q→A pairs |

```bash
python scripts/prepare_data.py \
  --input training/conversations.jsonl \
  --raw-dir training/raw/ \
  --profile training/profile.md \
  --output training/prepared/ \
  --model-size {e2b|e4b|26b}
```

Both `--input` and `--raw-dir` are optional — the script works if at least one exists.  
To use raw data only (skipping anyone-skill distillation): omit `--input`.  
To use distilled only (original behavior): omit `--raw-dir` or leave `training/raw/` empty.

**Raw format auto-detection:**

| File type | Handling |
|-----------|---------|
| `.jsonl` / `.json` | Parsed as `{role, content}` turns directly |
| `.txt` | Paragraphs → assistant turns, paired with generic user prompts |
| `.csv` | Auto-detects speaker/content columns; falls back to monologue |

**What this does:**

1. Loads raw/ files → converts to `{role, content}` turns (authentic voice layer)
2. Loads `conversations.jsonl` → appends as structured turns (distilled layer)
3. Formats all turns into Gemma-4 instruction-tuning format with profile system prompt
4. Scans for PII patterns (SSN, credit card, email, passwords)
5. Splits train (90%) / eval (10%) preserving temporal order
6. Reports composition: `{N}% authentic voice + {N}% distilled`

---

## Phase 5: Fine-Tuning

Generate and run the training config:

**Pick method by hardware:**

```bash
# NVIDIA GPU — Unsloth QLoRA (recommended: 2–5× faster, less VRAM)
python scripts/train.py \
  --model google/gemma-4-E4B-it \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method unsloth \
  --lora-rank 16 --lora-alpha 32 \
  --epochs 3 --batch-size 4 --learning-rate 2e-4

# NVIDIA GPU — vanilla QLoRA fallback (if Unsloth unavailable)
python scripts/train.py \
  --model google/gemma-4-E4B-it \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method qlora \
  --lora-rank 16 --lora-alpha 32 \
  --epochs 3 --batch-size 4 --learning-rate 2e-4

# Apple Silicon — MLX (recommended: Apple-native, faster than PyTorch MPS)
python scripts/train.py \
  --model google/gemma-4-E4B-it \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method mlx \
  --lora-rank 16 --epochs 3 --learning-rate 2e-4

# Apple Silicon fallback — PyTorch MPS LoRA (if MLX doesn't support model yet)
python scripts/train.py \
  --model google/gemma-4-E4B-it \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method lora \
  --lora-rank 16 --lora-alpha 32 \
  --epochs 3 --batch-size 2 --learning-rate 2e-4
```

**Training loop** (eval-per-epoch with best-checkpoint retention):

1. Run one epoch
2. Evaluate on held-out set — metric: `eval_loss` (lower is better)
3. If eval_loss improved → checkpoint kept; if degraded → revert to best checkpoint
4. Repeat for remaining epochs

**Early stopping**: if eval_loss doesn't improve for 2 consecutive epochs, stop.

**Live monitoring** — method-dependent:

```bash
# HF Trainer (qlora / lora methods) — poll trainer_state.json every 15s
watch -n 15 "python3 -c \"
import json, pathlib
p = pathlib.Path('models/{slug}/checkpoints/trainer_state.json')
if p.exists():
    s = json.loads(p.read_text())
    log = s.get('log_history', [])
    if log: print(log[-1])
\""

# MLX — progress prints directly to stdout; no polling needed
# Run in foreground or capture with: python scripts/train.py ... 2>&1 | tee train.log

# Unsloth — uses tqdm + loss printed to stdout each step
# Run in foreground or: python scripts/train.py ... 2>&1 | tee train.log
```

---

## Phase 6: Voice Validation

After training completes, run automated voice test:

```bash
python scripts/voice_test.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --profile training/profile.md \
  --output models/{slug}/voice_test_results.json \
  --questions 10
```

The script generates 10 test prompts covering:

- Domain expertise questions
- Values/ethics challenges  
- Casual conversation
- Off-topic deflections
- Characteristic humor or expression

For each response, score against `profile.md` traits (1–5 scale). Report:

```
Voice fidelity score: 3.8 / 5.0
Strongest dimension: speaking style (4.5)
Weakest dimension: humor (2.8) — may need more training data in this area
```

If overall score ≥ 3.0 → proceed to Phase 7.

If overall score < 3.0 → check conditions below before proceeding to Phase 6.5.

---

## Phase 6.5: Hyperparameter Refinement (optional — autoresearch loop)

**Activate only when ALL three conditions are met:**

1. Voice fidelity score < 3.0
2. Training data has ≥ 1000 assistant-role turns
3. User agrees to spend additional training time

If conditions not met → skip to Phase 7 and note the shortfall in `training_summary.json`.

---

### Step 1 — Diagnose weak dimensions

From voice test results, identify which categories scored lowest:

- `off_topic` weak → model broke persona, sounded like a generic AI assistant
- `values` weak → over-hedged, no distinctive opinion
- `casual` weak → register mismatch, too formal or too generic
- `expression` weak → vocabulary and rhythm not captured

### Step 2 — Generate `program.md`

Write a `program.md` file at the working directory root:

```markdown
# Hyperparameter Refinement — {slug}

## Objective
Maximize voice_fidelity_score. Target: ≥ 3.5. Current best: {score}.

## Weak dimensions
{list from voice test, e.g. "humor: 2.1, off_topic: 2.3"}

## Metric
val_bpb printed to stdout by train.py wrapper (lower is better; maps to 1 - voice_score/5)

## Variables to explore (one change per iteration)
- lora_rank: try 8, 16, 32
- learning_rate: try 1e-4, 2e-4, 5e-4
- epochs: try 2, 3, 4
- lora_dropout: try 0.0, 0.05, 0.1
- target_modules: try ["q_proj","v_proj"] vs ["q_proj","v_proj","k_proj","o_proj"]

## Constraints
- Max 5 iterations
- Revert to previous best if val_bpb increases
- Stop when val_bpb ≤ 0.30 (= voice score ≥ 3.5) or iterations exhausted
```

### Step 3 — Prepare autoresearch entry points

autoresearch expects `train.py` at the project root and reads `val_bpb` (lower is better) from its stdout to track improvement. Create a root-level wrapper that runs training **and** the voice test, then prints the metric autoresearch reads:

```bash
# Create root-level train.py wrapper (training + voice test in one step)
cat > train.py << 'EOF'
"""autoresearch entry point: train → voice test → print val_bpb-compatible metric."""
import subprocess, sys, json, pathlib

meta_path = pathlib.Path("training/metadata.json")
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
slug_name = meta.get("slug", "persona")
adapter_path = f"models/{slug_name}/adapter_weights"
results_path = f"models/{slug_name}/voice_test_results.json"

# Read base model from training summary (written by train.py after each run)
summary_path = pathlib.Path(f"models/{slug_name}/training_summary.json")
base_model = "google/gemma-4-E4B-it"  # fallback default
if summary_path.exists():
    try:
        base_model = json.loads(summary_path.read_text()).get("base_model", base_model)
    except Exception:
        pass

# Step 1: run training
ret = subprocess.call([sys.executable, "scripts/train.py"] + sys.argv[1:])
if ret != 0:
    sys.exit(ret)

# Step 2: run voice test (with correct base model)
subprocess.call([
    sys.executable, "scripts/voice_test.py",
    "--model", adapter_path,
    "--base-model", base_model,
    "--profile", "training/profile.md",
    "--output", results_path,
])

# Step 3: print metric for autoresearch to read (inverted score = val_bpb style)
try:
    score = json.loads(pathlib.Path(results_path).read_text())["overall_score"]
    val_bpb = round(1.0 - score / 5.0, 4)   # 5.0 → 0.0 (best), 1.0 → 0.8 (worst)
    print(f"val_bpb {val_bpb}")
except Exception:
    print("val_bpb 1.0")  # signal failure
EOF

# Create root-level prepare.py wrapper (autoresearch setup step — idempotent check)
cat > prepare.py << 'EOF'
"""autoresearch entry point: verify training data is ready (idempotent — no args needed)."""
import pathlib, sys

prepared = pathlib.Path("training/prepared")
train_file = prepared / "train.jsonl"
if train_file.exists():
    count = sum(1 for _ in open(train_file))
    print(f"✅ training data ready: {count} samples in {train_file}")
    sys.exit(0)
else:
    print("❌ training/prepared/train.jsonl not found.")
    print("   Run Phase 4 first:")
    print("   python scripts/prepare_data.py --input training/conversations.jsonl --raw-dir training/raw/ --profile training/profile.md --output training/prepared/ --model-size e4b")
    sys.exit(1)
EOF
```

This makes autoresearch's built-in `val_bpb` tracking work correctly: a voice score of 5.0 maps to `val_bpb = 0.0` (best), 3.5 → `0.30`, 3.0 → `0.40`. autoresearch keeps iterations that lower `val_bpb`.

### Step 4 — Invoke autoresearch skill

> Read and follow the `autoresearch` skill from `.agents/skills/autoresearch/SKILL.md`.
> Let it drive the iteration loop: modify hyperparameters → run → evaluate → keep improvements.

**Important**: autoresearch modifies `train.py` at the root level. The root `train.py` is a thin wrapper — **hyperparameters live in `scripts/train.py`**. In `program.md`, add this constraint so autoresearch targets the right file:

```markdown
## Implementation note
Hyperparameters are in `scripts/train.py` (not the root train.py wrapper).
Modify `scripts/train.py` to change lora_rank, learning_rate, epochs, etc.
The root train.py runs training then voice_test and prints val_bpb to stdout.
```

The autoresearch skill will:

1. Read `program.md` to understand objective and constraints
2. Modify hyperparameters in `scripts/train.py` one variable at a time
3. Run `uv run train.py` — this trains, runs voice_test, and prints `val_bpb` to stdout
4. Keep if `val_bpb` decreased (= voice score improved), revert if not
5. Repeat up to 5 iterations or until `val_bpb ≤ 0.30` (= voice score ≥ 3.5)

### Step 5 — Return to main flow

Once autoresearch completes (score ≥ 3.5 or iterations exhausted):

- Record best configuration in `training_summary.json`
- Proceed to Phase 7 with the best checkpoint

---

## Phase 7: Export

Choose formats based on your deployment target:

| Format | Use case | Command flag |
|--------|----------|-------------|
| `gguf` | Offline / laptop / mobile (llama.cpp, LM Studio) | `--formats gguf` |
| `ollama` | Local CLI chat via Ollama | `--formats gguf,ollama` |
| `vllm` | Production OpenAI-compatible API server | `--formats vllm` |
| `onnx` | Edge / WASM / Android / iOS runtimes | `--formats onnx` |

```bash
# Local use (default) — GGUF + Ollama
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --slug {slug} \
  --formats gguf,ollama

# API server — vLLM (OpenAI-compatible, NVIDIA GPU)
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --slug {slug} \
  --formats vllm

# Edge / mobile — ONNX (requires: uv pip install optimum[exporters])
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --slug {slug} \
  --formats onnx

# All formats at once
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --slug {slug} \
  --formats gguf,ollama,vllm,onnx
```

**Output tree:**

```
models/{slug}/
  adapter_weights/          ← LoRA adapter (small, ~50–200 MB)
  merged/                   ← Full merged HF model (shared by all formats)
  gguf/
    {slug}.gguf             ← for llama.cpp / LM Studio / Open WebUI
  ollama/
    Modelfile               ← ollama create {slug} -f Modelfile
  vllm/
    launch.sh               ← bash launch.sh → OpenAI-compatible API on :8000
    system_prompt.txt
    README.md
  onnx/
    model.onnx              ← onnxruntime / onnxruntime-web / mobile
  voice_test_results.json
  training_summary.json
```

**Run locally with Ollama:**
```bash
ollama create {slug} -f models/{slug}/ollama/Modelfile
ollama run {slug}
```

**Serve as API with vLLM** (OpenAI-compatible, NVIDIA GPU):
```bash
pip install vllm
bash models/{slug}/vllm/launch.sh
# → listening on http://localhost:8000/v1/chat/completions
```

**Run on mobile / Edge with ONNX:**
```bash
# Android / iOS: copy onnx/ directory into your app
# WASM: use onnxruntime-web in browser
# Desktop CLI: python -c "import onnxruntime as ort; ..."
```

**Run with llama.cpp directly:**
```bash
./llama-cli -m models/{slug}/gguf/{slug}.gguf --interactive
```

---

## Phase 8: Pack Integration

Bundle the model into the persona skill pack:

```
{slug}-skill/
  SKILL.md
  persona.json
  soul/injection.md
  ...
  model/                    ← NEW
    adapter_weights/        ← LoRA weights (versioned)
    gguf/{slug}.gguf        ← quantized model
    ollama/Modelfile
    training_summary.json   ← fidelity scores, data stats, base model
    voice_test_results.json
```

Update `persona.json` to declare the bundled model:

```json
{
  "body": {
    "runtime": {
      "models": [
        {
          "id": "{slug}-local",
          "type": "fine-tuned",
          "base": "google/gemma-4-E4B-it",
          "adapter": "./model/adapter_weights/",
          "gguf": "./model/gguf/{slug}.gguf",
          "fidelity_score": 3.8,
          "trainable": true
        }
      ]
    }
  }
}
```

---

## Phase 9: Usage Instructions

Generate a `model/RUNNING.md` with platform-specific run instructions:

```markdown
# Running {DisplayName} locally

## Ollama (recommended — macOS / Linux / Windows)
ollama run {slug}

## LM Studio (GUI, all platforms)
Open LM Studio → Load Model → select {slug}.gguf

## llama.cpp (advanced)
./llama-cli -m model/gguf/{slug}.gguf --interactive --ctx-size 4096

## OpenClaw integration
# persona.json already declares the local model — OpenClaw picks it up automatically
openpersona switch {slug}
```

---

## Tools


| Tool        | Purpose                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `Bash`      | Run training pipeline, check hardware, export models                        |
| `Read`      | Load `training/conversations.jsonl`, `profile.md`, `metadata.json`          |
| `Write`     | Generate training configs, Modelfile, RUNNING.md                            |
| `WebSearch` | Fetch latest Gemma-4 model card, HuggingFace model IDs, quantization guides |


---

## Scripts


| Script                    | Purpose                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `scripts/check_env.py`    | Detect hardware, recommend model size and training backend                      |
| `scripts/prepare_data.py` | Merge raw/ + conversations.jsonl → instruction-tuning dataset (dual-layer)      |
| `scripts/train.py`        | Fine-tuning: Unsloth / vanilla QLoRA / MLX / PyTorch MPS LoRA (auto-routed)    |
| `scripts/voice_test.py`   | Automated voice fidelity scoring against profile.md (1–5 scale)                 |
| `scripts/export.py`       | Export to GGUF / Ollama / vLLM launch script / ONNX (pick one or all)          |


---

## References

- `references/model-selection.md` — hardware requirements, quality vs. size trade-offs
- `references/qlora-guide.md` — QLoRA hyperparameter tuning guide
- `references/quantization.md` — GGUF quantization levels (Q4_K_M recommended for balance)
- `references/privacy.md` — what gets baked into the model weights; data handling guidance

