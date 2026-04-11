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

## Target Modules for Gemma-4

Always fine-tune attention layers:
```python
target_modules = ["q_proj", "v_proj", "k_proj", "o_proj"]
```

For richer adaptation, add MLP layers (at the cost of more memory):
```python
target_modules = ["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
```
