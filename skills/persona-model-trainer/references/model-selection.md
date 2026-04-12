# Model Selection Guide

## Gemma-4 Model IDs & Size Comparison

| HuggingFace ID | Active params | RAM (inference) | Training method | Training time (M2 Pro) | Best for |
|----------------|--------------|----------------|-----------------|------------------------|----------|
| `google/gemma-4-E2B-it` | ~2B | ~2 GB | LoRA (MPS/CPU) | ~1–2h | Phones, low-RAM laptops |
| `google/gemma-4-E4B-it` | ~4B | ~4 GB | LoRA (MPS) / QLoRA (CUDA) | ~4–6h | MacBook, mid-range GPU, **recommended** |
| `google/gemma-4-26B-A4B-it` | 4B active / 26B total (MoE) | ~16 GB | QLoRA (CUDA only) | ~10–14h | High-end workstation |

> Note: Gemma-4 is multimodal (text + image + video + audio). For persona fine-tuning, only text capabilities are used.

## Training Method by Platform

| Platform | Method | Why |
|----------|--------|-----|
| Apple Silicon (MPS) | **Full LoRA** (fp16/bf16) | bitsandbytes 4-bit quantization requires CUDA — not available on MPS |
| NVIDIA GPU (CUDA) | **QLoRA** (4-bit) | Reduces VRAM by ~4×; fits E4B in 8 GB VRAM |
| CPU only | **Full LoRA** (fp32) | No quantization support; very slow |

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
