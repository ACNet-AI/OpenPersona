# QLoRA Hyperparameter Guide

## What is QLoRA?

QLoRA (Quantized Low-Rank Adaptation) fine-tunes a 4-bit quantized base model by training only a small set of low-rank adapter matrices. This reduces VRAM/RAM requirements by ~4× compared to full fine-tuning, while retaining most of the quality.

## Key Parameters

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `lora_rank` (r) | 16 | 4–64 | Higher = more expressive adapter, more memory |
| `lora_alpha` | 32 | = 2×r | Scaling factor; keep at 2× rank |
| `lora_dropout` | 0.05 | 0–0.1 | Regularization; increase if overfitting |
| `learning_rate` | 2e-4 | 1e-5–5e-4 | Too high → unstable; too low → no learning |
| `epochs` | 3 | 1–5 | More epochs = risk of overfitting on small data |
| `batch_size` | 4 | 1–16 | Limited by RAM; use gradient_accumulation to compensate |
| `gradient_accumulation` | 4 | 2–16 | Effective batch = batch_size × accumulation |

## Tuning by Data Size

| Assistant turns | Recommended settings |
|----------------|---------------------|
| 200–500 | r=8, epochs=2, lr=1e-4 (small data → conservative) |
| 500–2000 | r=16, epochs=3, lr=2e-4 (default) |
| 2000–10000 | r=32, epochs=3–4, lr=2e-4 |
| 10000+ | r=64, epochs=3, lr=3e-4 |

## Signs of Overfitting

- `eval_loss` starts increasing while `train_loss` keeps decreasing
- Model responses are too literal / quote training data verbatim
- No variation across similar prompts

**Fix**: reduce epochs, increase dropout (0.05 → 0.1), add more diverse data

## Signs of Underfitting

- `eval_loss` remains high after 3 epochs
- Responses feel generic, not like the persona
- Voice test scores < 2.5

**Fix**: increase rank (16 → 32), increase epochs, check data quality (too many short turns?)

## Target Modules

**Recommended: omit `target_modules` entirely** — PEFT auto-detects the appropriate layers for any model:

```python
# In get_peft_model() — omit target_modules for universal compatibility
model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, ...))
# PEFT defaults to all linear layers, which works for any architecture
```

If you need to specify manually (e.g. for memory savings), common configurations by model family:

| Family | Attention only | Attention + MLP |
|--------|---------------|-----------------|
| Llama / Qwen / Gemma | `["q_proj","v_proj","k_proj","o_proj"]` | add `"gate_proj","up_proj","down_proj"` |
| Phi-4 | `["q_proj","v_proj","k_proj","o_proj"]` | add `"fc1","fc2"` |
| Mistral | same as Llama | same as Llama |

> For models not listed here, check the model card or community fine-tuning guides. Per-model notes are also tracked in [model-registry.md](model-registry.md).

## Model-Specific Inference Notes

Per-model inference configuration (thinking mode, sampling parameters, architecture limitations) is maintained centrally in [model-registry.md](model-registry.md) → "Per-Model Training Notes" section. Check there before running voice tests or inference on a model with a thinking mode (Gemma 4, Qwen 3, etc.).
