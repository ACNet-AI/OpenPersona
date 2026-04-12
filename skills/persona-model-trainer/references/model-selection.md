# Model Selection Guide

## Gemma-4 Model IDs & Size Comparison

| HuggingFace ID | Active params | RAM (inference) | Training method | Training time (M2 Pro) | Best for |
|----------------|--------------|----------------|-----------------|------------------------|----------|
| `google/gemma-4-E2B-it` | ~2B | ~2 GB | LoRA (MPS/CPU) | ~1–2h | Phones, low-RAM laptops |
| `google/gemma-4-E4B-it` | ~4B | ~4 GB | LoRA (MPS) / QLoRA (CUDA) | ~4–6h | MacBook, mid-range GPU, **recommended** |
| `google/gemma-4-26B-A4B-it` | 4B active / 26B total (MoE) | ~16 GB | QLoRA (CUDA only) | ~10–14h | High-end workstation |

> Note: Gemma-4 is multimodal (text + image + video + audio). For persona fine-tuning, only text capabilities are used.

## Training Backend by Platform

| Platform | Recommended | Fallback | Why |
|----------|------------|---------|-----|
| NVIDIA GPU (CUDA) | **Unsloth** (`--method unsloth`) | vanilla QLoRA (`--method qlora`) | Unsloth: 2–5× faster, 60% less VRAM via custom CUDA kernels; official Google recommendation |
| Apple Silicon (M1/M2/M3/M4) | **MLX** (`--method mlx`) | PyTorch MPS LoRA (`--method lora`) | MLX: Apple-native framework, faster than PyTorch MPS backend; bitsandbytes 4-bit requires CUDA |
| CPU only | vanilla LoRA (`--method lora`) | — | No quantization; very slow |

### Unsloth vs. vanilla HuggingFace (CUDA)

| | Unsloth | Vanilla peft+trl |
|---|---------|-----------------|
| Speed | 2–5× faster | baseline |
| VRAM | ~60% less | baseline |
| Install | `pip install unsloth` | `pip install peft trl bitsandbytes` |
| API | `FastLanguageModel` | `AutoModelForCausalLM + get_peft_model` |
| Gemma-4 support | ✅ (official) | ✅ |

### MLX vs. PyTorch MPS (Apple Silicon)

| | MLX | PyTorch MPS |
|---|-----|------------|
| Framework | Apple-native (Metal) | Cross-platform PyTorch |
| Speed | Faster (unified memory optimized) | Slower |
| QLoRA 4-bit | ❌ not yet | ❌ (bitsandbytes CUDA-only) |
| LoRA support | ✅ via `mlx_lm.lora` | ✅ via peft |
| GGUF export | Via llama.cpp convert | Via llama.cpp convert |
| Install | `pip install mlx-lm` | `pip install torch peft trl` |

## Hardware → Model Recommendation

| Hardware | Recommended model | Notes |
|----------|------------------|-------|
| iPhone 15 Pro / iPad M2+ | E2B | Via GGUF + on-device inference (Ollama / llama.cpp) |
| MacBook Air M2 8 GB | E2B | E4B LoRA training needs ~8 GB |
| MacBook Pro M2/M3 16 GB | **E4B** | Ideal — MPS LoRA, ~5h training |
| MacBook Pro M3 Max 36 GB+ | E4B or 26B-A4B | Enough unified memory |
| NVIDIA RTX 3080 (10 GB) | **E4B** | CUDA QLoRA fits in VRAM |
| NVIDIA RTX 4090 (24 GB) | E4B or 26B-A4B | Full QLoRA in VRAM, fast |
| A100 / H100 | 26B-A4B | Best quality, ~2h training |

## Quality vs. Data Trade-off

| Data volume (assistant turns) | E2B quality | E4B quality | 26B-A4B quality |
|-------------------------------|------------|------------|----------------|
| 200–500 | Limited | Moderate | Moderate |
| 500–2000 | Good | Good | Good |
| 2000–10000 | Very good | Excellent | Excellent |
| 10000+ | Excellent | Excellent | Best |

## When to Use Each Model

**E2B** — "Fast prototype / mobile-first"
- Testing the pipeline
- Primary deployment target is phones
- Data < 500 turns (larger models overfit anyway)

**E4B** — "Production default"
- Balanced quality and speed
- Most personal computers can train this
- Recommended for most users

**26B-A4B** — "Studio quality"
- Rich data (2000+ turns)
- CUDA GPU required (MoE fine-tuning not well-supported on MPS)
- Publication or commercial-grade output
