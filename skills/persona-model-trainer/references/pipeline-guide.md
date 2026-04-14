# End-to-End Pipeline Guide

Complete walkthrough: from raw source material to a locally-runnable persona model.

---

## Pipeline Overview

```
anyone-skill                persona-knowledge           persona-model-trainer
────────────────            ────────────────────        ──────────────────────────────
Phase 1–3: Collect data  →  export_training.py       →  pipeline.sh
Phase 4:   Distill turns        │                          │
Phase 5:   Build pack           │  training/               │  models/{slug}/
Phase 6-D: Export           ────┤  ├─ conversations.jsonl  │  ├─ export/
                                │  ├─ raw/                 │  │  ├─ adapter_weights/
                                │  ├─ profile.md           │  │  ├─ training_summary.json
                                │  ├─ metadata.json        │  │  └─ gguf/{slug}.gguf
                                │  └─ probes.json  ────────┼─►│
                                │                          │  adapters/v1/
                                │                          │  ├─ adapter_weights/
                                │                          │  ├─ training_summary.json
                                │                          │  │  └─ evaluation:
                                │                          │  │     ├─ perplexity
                                │                          │  │     └─ probe_score
                                │                          │  ├─ voice_test_results.json
                                │                          │  └─ probe_results.json
```

---

## Phase 1 — Collect Source Data

Use `anyone-skill` (Phases 1–5) or point `persona-knowledge` at existing sources.

**With anyone-skill:**

```
Trigger: "I want to train a model for [name]"
→ Runs Phases 1–3: collects sources, distills, builds persona pack
→ Produces: training/ directory with raw/ + conversations.jsonl
```

**With persona-knowledge directly:**

```bash
# Initialize a dataset
python skills/persona-knowledge/scripts/init_knowledge.py --slug {slug} --name "{Name}"

# Add sources to datasets/{slug}/sources/
# Add wiki pages to datasets/{slug}/wiki/ (identity.md, voice.md, ...)
```

---

## Phase 2 — Export Training Data

`persona-knowledge` exports a structured `training/` directory and generates `probes.json` automatically.

```bash
python skills/persona-knowledge/scripts/export_training.py \
  --slug {slug} \
  --output ./training

# Output:
#   training/conversations.jsonl   — distilled Q-A turns from wiki + sources
#   training/raw/                  — original source files (authentic voice)
#   training/profile.md            — character sheet (system prompt seed)
#   training/metadata.json         — version, hash, source snapshot
#   training/probes.json           — keyword probes for role consistency eval
```

**Version tracking:**

```bash
# List all past exports with hash and turn count
python skills/persona-knowledge/scripts/export_training.py --slug {slug} --list

# Force a specific version label (useful after curating data manually)
python skills/persona-knowledge/scripts/export_training.py \
  --slug {slug} --output ./training --version v3
```

**Minimum data requirements:**


| Tier      | Min. assistant turns | Expected quality   |
| --------- | -------------------- | ------------------ |
| Prototype | 50                   | Limited coherence  |
| Good      | 200                  | Recognizable voice |
| Excellent | 500+                 | Strong fidelity    |


---

## Phase 3 — Train

One command chains prepare → train → voice test → export:

```bash
# Gemma 4 on Apple Silicon (recommended)
bash skills/persona-model-trainer/scripts/pipeline.sh \
  --slug {slug} \
  --model mlx-community/gemma-4-E4B-it-4bit \
  --source ./training \
  --method mlx \
  --preset gemma4 \
  --probes ./training/probes.json

# Gemma 4 on NVIDIA GPU (Unsloth, fits 8 GB VRAM)
bash skills/persona-model-trainer/scripts/pipeline.sh \
  --slug {slug} \
  --model google/gemma-4-E4B-it \
  --source ./training \
  --method unsloth \
  --preset gemma4 \
  --probes ./training/probes.json

# No local GPU — generate a Colab notebook instead
bash skills/persona-model-trainer/scripts/pipeline.sh \
  --slug {slug} \
  --model google/gemma-4-E4B-it \
  --source ./training \
  --method colab \
  --preset gemma4
# → Generates colab_train_{slug}.ipynb
# Step A: Upload the notebook to colab.research.google.com and run all cells.
# Step B: Download adapter_weights_{slug}.zip from Colab, then unzip:
#           unzip adapter_weights_{slug}.zip -d models/{slug}/export/
# Step C: Re-run pipeline to finish voice test + export:
#           bash skills/persona-model-trainer/scripts/pipeline.sh \
#             --slug {slug} --method skip-train
```

**What `--preset gemma4` sets:**


| Parameter      | Value | Why                                         |
| -------------- | ----- | ------------------------------------------- |
| `lora-rank`    | 16    | Balance quality vs. adapter size            |
| `lora-alpha`   | 16    | alpha == rank (Google recommendation)       |
| `lora-layers`  | 16    | MLX: top-16 layers capture persona voice    |
| `warmup-ratio` | 0.1   | Prevents early divergence on small datasets |


Override any preset value with an explicit flag:

```bash
--preset gemma4 --lora-rank 32 --epochs 5
```

---

## Phase 4 — Evaluation

`pipeline.sh` runs two complementary evaluations automatically (when data is available).

### Perplexity — Language Model Uncertainty

Computed from validation loss during training. `eval.jsonl` is always generated by `prepare_data.py` (last 10% of samples, temporal split).

```
perplexity = exp(eval_loss)
```


| Range   | Interpretation                                                   |
| ------- | ---------------------------------------------------------------- |
| < 10    | Excellent — model has deeply internalized the persona's patterns |
| 10 – 30 | Good — strong fidelity for most use cases                        |
| 30 – 60 | Fair — recognizable voice, may drift under pressure              |
| > 60    | Poor — likely insufficient data or too few epochs                |


### Probe Score — Role Consistency

Keyword matching against predefined questions (generated from `wiki/identity.md`, `wiki/voice.md`).

```
probe_score = Σ(hit × weight) / Σweight    (0.0 – 1.0)
```


| Probes     | Weight | Question                           |
| ---------- | ------ | ---------------------------------- |
| `name`     | 1.0    | "What is your name?"               |
| `identity` | 0.8    | "Tell me about yourself."          |
| `voice`    | 0.5    | "Say something in your own style." |


Run probe evaluation standalone (after training):

```bash
# Apple Silicon (MLX)
python skills/persona-model-trainer/scripts/eval_probe.py \
  --adapter    models/{slug}/export/adapter_weights \
  --probes     training/probes.json \
  --output     probe_results.json \
  --method     mlx

# NVIDIA / CPU (HuggingFace + PEFT)
python skills/persona-model-trainer/scripts/eval_probe.py \
  --adapter    models/{slug}/export/adapter_weights \
  --probes     training/probes.json \
  --output     probe_results.json \
  --method     hf \
  --base-model google/gemma-4-E4B-it
```

### Reading Results

All scores land in `training_summary.json`:

```json
{
  "base_model": "mlx-community/gemma-4-E4B-it-4bit",
  "method": "mlx",
  "lora_rank": 16,
  "train_samples": 312,
  "eval_samples": 35,
  "evaluation": {
    "eval_loss":   2.1804,
    "perplexity":  8.85,
    "probe_score": 0.9286
  }
}
```

---

## Phase 5 — Version Management

Every `pipeline.sh` run archives the adapter as `v{N}`. Manage versions without re-training.

```bash
# List all versions with fidelity, perplexity, probe_score
python skills/persona-model-trainer/scripts/version.py list --slug {slug}

# Compare two versions side-by-side
python skills/persona-model-trainer/scripts/version.py diff \
  --slug {slug} --version-a v1 --version-b v2
# Shows: base_model, lora_rank, perplexity, probe_score, data_hash, ...

# Switch active version (updates Ollama / vLLM / GGUF links)
python skills/persona-model-trainer/scripts/version.py activate \
  --slug {slug} --version v2

# Restore training data snapshot from a specific version
python skills/persona-model-trainer/scripts/version.py activate \
  --slug {slug} --version v1 --restore-data

# Push adapter weights to HuggingFace Hub
python skills/persona-model-trainer/scripts/version.py push \
  --slug {slug} --version v2 --hf-repo you/{slug}-persona

# Push adapter + training data snapshot (private dataset repo)
python skills/persona-model-trainer/scripts/version.py push \
  --slug {slug} --version v2 --hf-repo you/{slug}-persona --include-data
```

---

## Phase 6 — Run the Model

After export, three local serving options are available:

```bash
# Ollama (easiest — chat in terminal or Open WebUI)
ollama create {slug} -f models/{slug}/export/ollama/Modelfile
ollama run {slug}

# llama.cpp / LM Studio
# → Open models/{slug}/export/gguf/{slug}.gguf

# vLLM (OpenAI-compatible API, NVIDIA GPU)
pip install vllm
bash models/{slug}/export/vllm/launch.sh
# → http://localhost:8000/v1/chat/completions
```

---

## Iterative Improvement Loop

```
Collect more data          Retrain               Evaluate delta
(persona-knowledge)  →  (pipeline.sh)  →  (version diff v2 v3)
      ↑                                              │
      └──────────────────────────────────────────────┘
         if probe_score < 0.7 or perplexity > 30:
           add more identity/voice wiki content
           increase epochs or lora-rank
```

**Common fixes:**


| Symptom                        | Likely cause                                | Fix                                                         |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| probe_score < 0.5              | Model doesn't know its name / identity      | Add more `wiki/identity.md` content; increase epochs        |
| perplexity > 40                | Insufficient or inconsistent training data  | Add 100+ more turns; check data quality                     |
| Voice drift after a few turns  | lora_rank too low                           | Increase to 32; add more voice examples                     |
| Training loss doesn't decrease | Learning rate too high or data format error | Reduce lr to 1e-4; run `prepare_data.py` and inspect output |


---

## Traceability

Every trained version records its full provenance chain:

```
adapters/v2/training_summary.json
  dataset_version:     v3              ← persona-knowledge export version
  dataset_export_hash: sha256:a1b2c3…  ← hash of conversations.jsonl at export time
  data_hash:           sha256:d4e5f6…  ← hash of prepared train.jsonl
  data_samples:        312
  evaluation:
    perplexity:        8.85
    probe_score:       0.9286
```

This chain lets you:

- Reproduce exact training conditions months later (`--restore-data`)
- Audit which source data produced which model behavior
- Roll back to a prior version if a new export degrades quality

