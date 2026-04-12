# persona-model-trainer

Fine-tune a small local model (Gemma-4 1B/4B/12B) on distilled persona data. Turn an [anyone-skill](https://github.com/acnlabs/anyone-skill) persona into a **self-contained model** that runs on phones and personal computers — no cloud API, no latency, no subscription.

## What it does

```
anyone-skill output          persona-model-trainer        Runnable model
─────────────────────   →   ──────────────────   →   ──────────────────────
training/                    QLoRA fine-tune              models/{slug}/
  conversations.jsonl        on Gemma-4 1B/4B/12B          adapter_weights/
  profile.md                 QLoRA fine-tune +              gguf/{slug}.gguf
  metadata.json              iteration loop                 ollama/Modelfile
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

# 2. Check your environment
uv run scripts/check_env.py

# 3. Prepare training data (from anyone-skill output)
uv run scripts/prepare_data.py \
  --input training/conversations.jsonl \
  --profile training/profile.md \
  --output training/prepared/ \
  --model-size 4b

# 4. Fine-tune
uv run scripts/train.py \
  --model google/gemma-4-4b-it \
  --data training/prepared/ \
  --output models/{slug}/

# 5. Validate voice fidelity
uv run scripts/voice_test.py \
  --model models/{slug}/adapter_weights/ \
  --profile training/profile.md

# 6. Export for local use
uv run scripts/export.py \
  --model models/{slug}/adapter_weights/ \
  --slug {slug} \
  --formats gguf,ollama

# 7. Run locally
ollama create {slug} -f models/{slug}/ollama/Modelfile
ollama run {slug}
```

## Pipeline Phases


| Phase               | Script                 | Purpose                                                                    |
| ------------------- | ---------------------- | -------------------------------------------------------------------------- |
| 1. Pre-flight       | `check_env.py`         | Verify hardware, packages, data quality                                    |
| 2. Model selection  | (interactive)          | Choose 1B / 4B / 12B                                                       |
| 3. Environment      | `uv pip install`       | Install training stack                                                     |
| 4. Data prep        | `prepare_data.py`      | Format JSONL → instruction-tuning dataset                                  |
| 5. Fine-tuning      | `train.py`             | QLoRA training loop with early stopping                                    |
| 6. Voice validation | `voice_test.py`        | Automated fidelity scoring (1–5 scale)                                     |
| **6.5. Refinement** | **autoresearch skill** | **Optional: hyperparameter search when score < 3.0 and data ≥ 1000 turns** |
| 7. Export           | `export.py`            | GGUF + Ollama Modelfile                                                    |
| 8. Pack integration | (manual)               | Bundle model into persona skill pack                                       |


## Dependency Chain

```
anyone-skill  →  persona.json + training/   →  persona-trainer  →  runnable model
  (distill)          (openpersona create)         (fine-tune)       (Ollama / llama.cpp)
```

Use `anyone-skill` alone for a prompt-based persona (instant, no training).  
Add `persona-model-trainer` when you want a self-contained model that doesn't need a cloud API.

## Data Requirements

- **Minimum**: 200 `assistant`-role turns (flagged `"trainable": true` in `metadata.json`)
- **Recommended**: 1000+ turns spanning multiple time periods
- **Not suitable**: fictional characters, historical figures (no authentic dialogue)

## Privacy

Training bakes your data into model weights permanently. See `references/privacy.md` before training on sensitive conversations.

## References

- [Model Selection Guide](references/model-selection.md) — hardware requirements, size trade-offs
- [QLoRA Guide](references/qlora-guide.md) — hyperparameter tuning
- [Quantization Guide](references/quantization.md) — GGUF levels, running on phones
- [Privacy Guide](references/privacy.md) — data handling, PII risks, consent

## License

MIT