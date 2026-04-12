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
    - CUDA GPU (10–30× speedup over CPU)
    - Metal GPU (Apple Silicon — supported via PyTorch MPS)

- autoresearch skill (for Phase 6.5 hyperparameter refinement loop)

---

# persona-trainer

Fine-tune a small local model on distilled persona data. Turn anyone-skill's output into a self-contained model that **is** the person — no prompting, no cloud, no latency.

**Dependency chain**: `anyone-skill` → `persona-model-trainer` → runnable Gemma-4 persona model

**Input**: `training/` folder produced by `anyone-skill` Phase 3 export  
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

- `training/metadata.json` shows `"trainable": false` (< 200 assistant turns)
- Subject is a fictional character or historical figure (insufficient authentic dialogue data)
- User only wants a quick prompt-based persona (use anyone-skill alone)

---

## Phase 1: Pre-flight Check

Read `training/metadata.json`:

```json
{
  "slug": "...",
  "subject_type": "self | personal | public | ...",
  "message_count": 1240,
  "trainable": true,
  "date_range": "2021-03 to 2024-11",
  "sources": ["iMessage", "WhatsApp"]
}
```

**Gate**: if `trainable: false` → stop and explain: *"Not enough authentic dialogue (< 200 turns). Fine-tuning would overfit noise. Use the prompt-based persona instead."*

**Minimum quality bar before proceeding:**

- ≥ 200 `assistant`-role turns
- ≥ 3 distinct date ranges (not a single conversation burst)
- No PII red flags (scan for patterns: SSN, credit card, passwords)

Read `slug` from `metadata.json["slug"]` — this value is used as `{slug}` in all subsequent commands (Phase 5 `--output`, Phase 6 `--model`, Phase 7 `--slug`, etc.). Confirm once:

*"Found [N] training turns spanning [date range] for slug `{slug}`. Estimated training time: [~X hours] on [detected hardware]. Proceed?"*

---

## Phase 2: Model Selection

Ask once (hardware will be verified in Phase 3 after environment setup):

> *"Which model size do you want?"*
>
> - **E2B** (`google/gemma-4-E2B-it`, ~~2B active params) — runs on phones (4 GB RAM), fastest training (~~1–2h on M2), lower fidelity
> - **E4B** (`google/gemma-4-E4B-it`, ~~4B active params) — laptop-class (8 GB RAM), better voice capture (~~4–6h on M2), **recommended**
> - **26B-A4B** (`google/gemma-4-26B-A4B-it`, 26B MoE / 4B active) — high quality, complex to fine-tune, requires 24 GB+ RAM

Default recommendation:

- Apple Silicon (M1/M2/M3/M4) → **E4B** via MPS (full LoRA, not QLoRA — see Phase 5)
- NVIDIA GPU ≥ 8 GB VRAM → **E4B** via QLoRA
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
# NVIDIA GPU (CUDA) — includes bitsandbytes for QLoRA 4-bit
uv pip install torch torchvision torchaudio \
  transformers>=4.50 peft>=0.14 datasets trl>=0.9 \
  bitsandbytes accelerate sentencepiece protobuf

# Apple Silicon (MPS) — standard PyTorch; bitsandbytes NOT needed (MPS doesn't support 4-bit)
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

Run the data preparation script:

```bash
python scripts/prepare_data.py \
  --input training/conversations.jsonl \
  --profile training/profile.md \
  --output training/prepared/ \
  --model-size {e2b|e4b|26b}
```

Map to prepare_data.py internal sizes: `e2b` → `1b`, `e4b` → `4b`, `26b` → `12b` (controls max token length per sample).

**What this does:**

1. Loads `conversations.jsonl`
2. Formats turns into instruction-tuning format:
  ```
   <start_of_turn>user
   {user message}
   <end_of_turn>
   <start_of_turn>model
   {persona response}
   <end_of_turn>
  ```
3. Injects persona profile as a system prompt prefix on every sample
4. Splits into train (90%) / eval (10%) preserving temporal order (no data leakage)
5. Reports: `[N_train] train / [N_eval] eval samples · max token length: [L]`

---

## Phase 5: Fine-Tuning

Generate and run the training config:

**Pick method by hardware:**

```bash
# NVIDIA GPU — QLoRA (4-bit quantized, saves VRAM)
python scripts/train.py \
  --model google/gemma-4-E4B-it \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method qlora \
  --lora-rank 16 --lora-alpha 32 \
  --epochs 3 --batch-size 4 --learning-rate 2e-4

# Apple Silicon (MPS) — full LoRA (bitsandbytes 4-bit not supported on MPS)
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

**Live monitoring** — HuggingFace Trainer prints loss to stdout. If backgrounded, poll `trainer_state.json` (it's a static file overwritten each step, not a stream):

```bash
# macOS / Linux: refresh every 15s
watch -n 15 "python -c \"
import json, pathlib
p = pathlib.Path('models/{slug}/checkpoints/trainer_state.json')
if p.exists():
    s = json.loads(p.read_text())
    log = s.get('log_history', [])
    if log: print(log[-1])
\""
```

---

## Phase 6: Voice Validation

After training completes, run automated voice test:

```bash
python scripts/voice_test.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --profile training/profile.md \
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

If conditions not met → skip to Phase 7 and note the shortfall in `training_summary.md`.

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
    print("   Run Phase 4 first: python scripts/prepare_data.py --input training/conversations.jsonl ...")
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

- Record best configuration in `training_summary.md`
- Proceed to Phase 7 with the best checkpoint

---

## Phase 7: Export

Export the fine-tuned model in usable formats:

```bash
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model google/gemma-4-E4B-it \
  --slug {slug} \
  --formats gguf,ollama
```

**Outputs:**

```
models/{slug}/
  adapter_weights/          ← LoRA adapter (small, ~50–200 MB)
  gguf/
    {slug}-{size}.gguf      ← for llama.cpp / LM Studio / Open WebUI
  ollama/
    Modelfile               ← for Ollama
  voice_test_results.json
  training_summary.md
```

**Register with Ollama** (if installed):

```bash
ollama create {slug} -f models/{slug}/ollama/Modelfile
ollama run {slug}
```

**Run with llama.cpp** (mobile-friendly):

```bash
./llama-cli -m models/{slug}/gguf/{slug}-{size}.gguf --interactive
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
    training_summary.md     ← fidelity scores, data stats
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


| Script                    | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `scripts/check_env.py`    | Verify Python, PyTorch, GPU/MPS availability                      |
| `scripts/prepare_data.py` | Format JSONL → instruction-tuning dataset                         |
| `scripts/train.py`        | QLoRA fine-tuning loop (eval-per-epoch, best checkpoint retained) |
| `scripts/voice_test.py`   | Automated voice fidelity scoring                                  |
| `scripts/export.py`       | Export to GGUF + Ollama Modelfile                                 |


---

## References

- `references/model-selection.md` — hardware requirements, quality vs. size trade-offs
- `references/qlora-guide.md` — QLoRA hyperparameter tuning guide
- `references/quantization.md` — GGUF quantization levels (Q4_K_M recommended for balance)
- `references/privacy.md` — what gets baked into the model weights; data handling guidance

