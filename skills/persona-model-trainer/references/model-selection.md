# Model Selection Guide

This guide explains how to choose a model for persona fine-tuning. For the full list of tested models, see [model-registry.md](model-registry.md).

## Decision Flow

```
1. Detect hardware tier (VRAM / unified memory available)
      ↓
2. Look up models for that tier in model-registry.md
      ↓
3. User picks a model — or enters any HuggingFace instruction-tuned model ID
      ↓
4. Set {model_id} for all subsequent pipeline phases
```

## Hardware Tier

| Tier | Hardware | QLoRA VRAM budget | Apple MLX | Default model |
|------|----------|------------------|-----------|--------------|
| Small | Apple Silicon ≤ 16 GB / CPU / mobile | ≤ 6 GB | Yes | `google/gemma-4-E2B-it` |
| Medium | Apple Silicon 16 GB+ / NVIDIA ≥ 8 GB | 6–16 GB | Yes | `google/gemma-4-E4B-it` ★ |
| Large | NVIDIA ≥ 24 GB / A100 | 16 GB+ | Impractical | `google/gemma-4-31B-it` |

★ Overall default if user has no preference.

> **Memory note**: QLoRA training always requires more VRAM than inference — the 4-bit base model must be loaded plus LoRA adapter gradients and optimizer states. A model with 5 GB inference footprint typically needs 8–12 GB for QLoRA training. Always leave 2–3 GB headroom above the QLoRA estimate in the registry.

## Training Backend by Platform

| Platform | Recommended | Fallback | Notes |
|----------|------------|---------|-------|
| NVIDIA GPU (CUDA) | **Unsloth** (`--method unsloth`) | vanilla QLoRA (`--method qlora`) | Unsloth: 2–5x faster, ~60% less VRAM; supports most dense architectures |
| Apple Silicon | **MLX** (`--method mlx`) | PyTorch MPS LoRA (`--method lora`) | MLX requires model support — check `mlx_lm.load("{model_id}")` first |
| CPU only | vanilla LoRA (`--method lora`) | — | Very slow; Small tier models only |

### Unsloth Coverage

Unsloth supports most major dense architectures including Llama, Qwen, Gemma, Phi, Mistral, and Falcon. MoE architectures (Gemma 26B-A4B, Qwen 30B-A3B) are **not** supported for QLoRA — see the Experimental section in model-registry.md.

### MLX Coverage

mlx-lm adds model support continuously. Verify before using:
```bash
python -c "from mlx_lm import load; load('{model_id}')"
```
If this errors, fall back to PyTorch MPS LoRA.

## How to Choose Between Models in the Same Tier

Within a tier, choose by:

1. **Context window** — personas with long conversations benefit from 128K+ context (Llama 3.1/3.2, Gemma 4)
2. **Training data volume** — more data → larger model; 200–500 turns → Small/Medium; 2000+ turns → Medium/Large
3. **Target deployment** — phone/edge → GGUF Small; laptop personal use → Medium GGUF; shared API → Large vLLM
4. **Tooling familiarity** — Gemma 4 and Llama 3 have the widest community guides and Unsloth support
5. **License requirements** — all models in the registry are permissive (Apache 2.0, Llama Community License, MIT, or similar)

## Quality vs. Data Trade-off

| Data volume (assistant turns) | Small quality | Medium quality | Large quality |
|-------------------------------|-------------|---------------|--------------|
| 200–500 | Limited | Moderate | Moderate (overfitting risk with small data) |
| 500–2000 | Good | Good | Good |
| 2000–10000 | Very good | Excellent | Excellent |
| 10000+ | Excellent | Excellent | Best |

## Using a Model Not in the Registry

Any instruction-tuned model on HuggingFace that satisfies these conditions works:

1. Has a chat template: `tokenizer.chat_template is not None`
2. Supports the `system` role (most post-2024 models do)
3. Is loadable by `AutoModelForCausalLM` (standard HuggingFace format)

Before using an unregistered model:
```bash
# 1. Verify chat template
python -c "
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained('{model_id}')
print('chat_template:', tok.chat_template is not None)
msgs = [{'role':'system','content':'test'},{'role':'user','content':'hi'}]
print(tok.apply_chat_template(msgs, tokenize=False))
"

# 2. Check QLoRA feasibility (requires CUDA)
python -c "
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
import torch
cfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
m = AutoModelForCausalLM.from_pretrained('{model_id}', quantization_config=cfg, device_map='auto')
print('Loaded OK')
"
```

Use `WebSearch` to find community reports on fine-tuning this specific model if the above tests pass.
