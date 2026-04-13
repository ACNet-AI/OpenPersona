# persona-model-trainer

Fine-tune any HuggingFace instruction-tuned model (Gemma 4, Qwen 3, Llama, Phi, Mistral, and more) on persona data. Turn an [anyone-skill](https://github.com/acnlabs/anyone-skill) persona into a **self-contained model** that runs on phones and personal computers — no cloud API, no latency, no subscription.

## What it does

```
anyone-skill output          persona-model-trainer           Runnable model
─────────────────────   →   ──────────────────────────  →   ──────────────────────
training/                    Fine-tune {model_id}            models/{slug}/
  raw/        (authentic)    via Unsloth / MLX / QLoRA        adapter_weights/
  conversations.jsonl        + voice validation                gguf/{slug}.gguf
  profile.md                 + optional autoresearch           ollama/Modelfile
  metadata.json              hyperparameter refinement         vllm/launch.sh
                                                               onnx/model.onnx
```

The model **is** the persona — not a base model being prompted to act like one.

## Requirements

| Resource      | Minimum             | Recommended                           |
| ------------- | ------------------- | ------------------------------------- |
| Python        | 3.11+               | 3.12                                  |
| RAM           | 4 GB                | 16 GB                                 |
| Disk          | 10 GB               | 30 GB                                 |
| GPU/NPU       | Not required        | Apple Silicon M2+ or NVIDIA RTX 3080+ |
| Training data | 200 assistant turns | 1000+ turns                           |

## Quick Start

```bash
# 1. Install uv
pip install uv

# 2. Setup (pick ONE line per platform)
uv venv .venv-trainer && source .venv-trainer/bin/activate

# NVIDIA — Unsloth (recommended)
uv pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
uv pip install torch transformers datasets sentencepiece protobuf
# Apple Silicon — MLX (recommended)
uv pip install mlx-lm

# 3. Check your environment
python scripts/check_env.py

# 4. Prepare training data (dual-layer: raw/ + distilled)
python scripts/prepare_data.py \
  --input training/conversations.jsonl \
  --raw-dir training/raw/ \
  --profile training/profile.md \
  --output training/prepared/ \
  --model {model_id}        # used for documentation; format is model-agnostic ({messages: [...]})

# 5. Fine-tune (pick method by hardware)
python scripts/train.py \
  --model {model_id} \
  --data training/prepared/ \
  --output models/{slug}/ \
  --method unsloth   # or: mlx, qlora, lora

# 6. Validate voice fidelity
python scripts/voice_test.py \
  --model models/{slug}/adapter_weights/ \
  --base-model {model_id} \
  --profile training/profile.md \
  --output models/{slug}/voice_test_results.json

# 7. Export (pick formats)
python scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --base-model {model_id} \
  --slug {slug} \
  --formats gguf,ollama   # or: vllm, onnx, or all

# 8. Run locally
ollama create {slug} -f models/{slug}/ollama/Modelfile
ollama run {slug}
```

## Pipeline Phases

| Phase               | Script                 | Purpose                                                                     |
| ------------------- | ---------------------- | --------------------------------------------------------------------------- |
| 1. Pre-flight       | `check_env.py`         | Detect hardware, estimate turn count, verify data quality                   |
| 2. Model selection  | (interactive)          | Detect hardware tier, consult model-registry.md, set {model_id}            |
| 3. Environment      | `uv pip install`       | Install training stack (Unsloth / MLX / HF — pick by platform)             |
| 4. Data prep        | `prepare_data.py`      | Merge raw/ + conversations.jsonl → instruction-tuning dataset (dual-layer)  |
| 5. Fine-tuning      | `train.py`             | Unsloth / vanilla QLoRA / MLX / PyTorch MPS LoRA (auto-routed by --method) |
| 6. Voice validation | `voice_test.py`        | Automated fidelity scoring (1–5 scale)                                      |
| **6.5. Refinement** | **autoresearch skill** | **Optional: hyperparameter search when score < 3.0 and data ≥ 1000 turns** |
| 7. Export           | `export.py`            | GGUF / Ollama / vLLM (API) / ONNX (edge/mobile)                            |
| 8. Pack integration | (manual)               | Bundle model into persona skill pack                                        |

## Dependency Chain

```
anyone-skill  →  persona.json + training/  →  persona-model-trainer  →  runnable model
  (distill)       (openpersona create)          (fine-tune)             (Ollama / vLLM / ONNX)
```

Use `anyone-skill` alone for a prompt-based persona (instant, no training).
Add `persona-model-trainer` when you want a self-contained model.

## Data Requirements

- **Minimum**: 200 `assistant`-role turns (combined from `training/raw/` + `conversations.jsonl`)
- **Recommended**: 1000+ turns spanning multiple time periods
- All subject types are supported: fictional characters and historical figures can be trained via `training/raw/` (scripts, lore, speeches, biographies)

## Privacy

Training bakes your data into model weights permanently. See `references/privacy.md` before training on sensitive conversations.

## References

- [Model Registry](references/model-registry.md) — curated model list with VRAM requirements and inference_config per tier
- [Model Selection Guide](references/model-selection.md) — hardware tier detection, backend selection, quality vs. size trade-offs
- [QLoRA Guide](references/qlora-guide.md) — hyperparameter tuning
- [Quantization Guide](references/quantization.md) — GGUF levels, vLLM serving, ONNX mobile deployment
- [Privacy Guide](references/privacy.md) — data handling, PII risks, consent

## License

MIT
