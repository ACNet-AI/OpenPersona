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

Gemma-4 supports up to 128K tokens context (E2B/E4B). For conversation-heavy personas, use `--ctx-size 4096` or higher. Larger context uses more RAM linearly.

---

## vLLM — Production API Serving

vLLM provides an OpenAI-compatible REST API over the merged HF model. Best for:
- Teams running the persona as a shared internal service
- Integrating with existing OpenAI SDK clients
- NVIDIA GPU servers (A10, A100, H100, RTX 30/40 series)

**Setup:**
```bash
pip install vllm
bash models/{slug}/vllm/launch.sh         # starts on :8000
```

**Test:**
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"{slug}","messages":[{"role":"user","content":"Hello"}]}'
```

**When to choose vLLM vs. Ollama:**

| | vLLM | Ollama |
|--|------|--------|
| Format | Merged HF (safetensors) | GGUF |
| API | OpenAI-compatible REST | Ollama REST + CLI |
| Throughput | Very high (paged KV cache) | Moderate |
| Best for | Production server / multi-user | Personal laptop |
| VRAM required | Full precision (8–16 GB) | Quantized (3–8 GB) |

---

## ONNX — Edge and Mobile Deployment

ONNX IR (Open Neural Network Exchange) allows running the model in browser (WASM), Android, iOS, and Raspberry Pi without Python.

**Export:**
```bash
uv pip install "optimum[exporters]"
python scripts/export.py --formats onnx --slug {slug} ...
```

**Runtimes:**

| Target | Runtime | Notes |
|--------|---------|-------|
| Android / iOS | ONNX Runtime Mobile | INT8 quantize for phones |
| Browser (WASM) | onnxruntime-web | E2B model recommended |
| Desktop Python | onnxruntime | Fast CPU inference |
| Raspberry Pi | onnxruntime | ARM-optimized |

**When to use ONNX:**
- Need to run offline on a phone without a companion app server
- Browser-based chat interface (WASM)
- IoT / embedded devices (Raspberry Pi, Jetson Nano — aligns with E2B/E4B spec)
- CI/CD regression testing without GPU

**Size after ONNX export (E4B, INT8):** ~2–3 GB (comparable to GGUF Q4_K_M)
