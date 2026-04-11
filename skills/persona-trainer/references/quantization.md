# GGUF Quantization Guide

## What is GGUF?

GGUF is the file format used by llama.cpp, Ollama, LM Studio, and Open WebUI. It packages model weights with metadata into a single portable file that can run on phones, laptops, and desktops without Python or a GPU.

## Quantization Levels

| Level | Size (4B model) | Quality loss | Best for |
|-------|----------------|-------------|----------|
| `Q8_0` | ~4.5 GB | Minimal | Workstation / high-RAM laptop |
| `Q6_K` | ~3.5 GB | Very low | MacBook Pro / desktop |
| **`Q4_K_M`** | **~2.5 GB** | **Low** | **Recommended default** |
| `Q4_0` | ~2.3 GB | Low-moderate | Older hardware |
| `Q3_K_M` | ~1.9 GB | Moderate | Budget laptops |
| `Q2_K` | ~1.5 GB | High | Minimum viable / very old devices |

**Default choices by model size:**
- 1B → `Q8_0` (already small; preserve quality)
- 4B → `Q4_K_M` (best balance for phones/laptops)
- 12B → `Q4_K_M` (fits 8 GB VRAM/RAM)

## Running GGUF Models

### Ollama (easiest)
```bash
ollama create {slug} -f model/ollama/Modelfile
ollama run {slug}
```

### LM Studio (GUI)
1. Open LM Studio
2. My Models → Add Model → select `{slug}.gguf`
3. Load and chat

### llama.cpp (advanced / mobile)
```bash
# macOS / Linux
./llama-cli -m model/gguf/{slug}.gguf --interactive --ctx-size 4096

# With Metal (Apple Silicon)
./llama-cli -m model/gguf/{slug}.gguf --interactive --n-gpu-layers 35
```

### iPhone / Android (via llama.cpp iOS/Android port)
- Copy the `.gguf` file to the app's documents directory
- Apps: LLM Farm (iOS), MLC Chat (iOS/Android), Pocketpal AI (Android)
- Recommended: `Q4_K_M` for 4B, `Q8_0` for 1B

## Context Length

Gemma-4 supports up to 8192 tokens context. For conversation-heavy personas, use `--ctx-size 4096` or higher. Larger context uses more RAM linearly.
