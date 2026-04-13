# Model Registry

Curated list of instruction-tuned models tested for persona fine-tuning. Updated as the market evolves.

> **Using a model not listed here?** Any HuggingFace instruction-tuned model with a standard chat template works. Pass its ID directly as `{model_id}` in Phase 2 and use `WebSearch` to look up its memory requirements and any training quirks.

All models use `tokenizer.apply_chat_template()` for chat formatting — the pipeline handles format differences automatically.

---

## Small Tier — QLoRA ≤ 6 GB VRAM (edge / mobile / low-RAM laptop)

| HuggingFace ID | Family | Params | QLoRA VRAM | Context | Apple MLX | inference_config | Notes |
|----------------|--------|--------|-----------|---------|-----------|-----------------|-------|
| `google/gemma-4-E2B-it` | Gemma 4 | 2.3B eff (5.1B total) | ~5 GB | 128K | Yes | `enable_thinking=False` | PLE arch; total params much larger than effective due to per-layer embeddings |
| `Qwen/Qwen3-1.5B-Instruct` | Qwen 3 | 1.5B | ~3 GB | 32K | Yes | `enable_thinking=False` | Thinking mode ON by default; must disable for persona inference |
| `microsoft/Phi-4-mini-instruct` | Phi 4 | 3.8B | ~5 GB | 128K | Yes | — | No thinking mode; strong instruction following for size |
| `meta-llama/Llama-3.2-1B-Instruct` | Llama 3.2 | 1B | ~2 GB | 128K | Yes | — | Minimum viable; very low fidelity for persona |

---

## Medium Tier — QLoRA 6–16 GB VRAM (laptop / mid-range GPU) — **recommended default**

| HuggingFace ID | Family | Params | QLoRA VRAM | Context | Apple MLX | inference_config | Notes |
|----------------|--------|--------|-----------|---------|-----------|-----------------|-------|
| `google/gemma-4-E4B-it` | Gemma 4 | 4.5B eff (8B total) | ~10 GB | 128K | Yes | `enable_thinking=False` | **Default recommendation**. PLE arch; Apache 2.0 |
| `Qwen/Qwen3-4B-Instruct` | Qwen 3 | 4B | ~6 GB | 32K | Yes | `enable_thinking=False` | Good alternative; 32K context limit |
| `Qwen/Qwen3-8B-Instruct` | Qwen 3 | 8B | ~8 GB | 32K | Yes | `enable_thinking=False` | Better voice capture than 4B; still fits M2 Pro 16 GB |
| `meta-llama/Llama-3.2-3B-Instruct` | Llama 3.2 | 3B | ~5 GB | 128K | Yes | — | Lightweight; good for constrained environments |
| `meta-llama/Llama-3.1-8B-Instruct` | Llama 3.1 | 8B | ~8 GB | 128K | Yes | — | Solid all-around; wide Unsloth/mlx-lm support |
| `microsoft/Phi-4-instruct` | Phi 4 | 14B | ~12 GB | 16K | Yes | — | High quality for size; short context window |
| `mistralai/Mistral-7B-Instruct-v0.3` | Mistral | 7B | ~7 GB | 32K | Yes | — | Proven fine-tuning baseline; wide tooling support |

---

## Large Tier — QLoRA 16+ GB VRAM (GPU workstation / server)

| HuggingFace ID | Family | Params | QLoRA VRAM | Context | Apple MLX | inference_config | Notes |
|----------------|--------|--------|-----------|---------|-----------|-----------------|-------|
| `google/gemma-4-31B-it` | Gemma 4 | 30.7B | ~24 GB | 256K | Impractical | `enable_thinking=False` | CUDA-only recommended; best Gemma fidelity |
| `Qwen/Qwen3-14B-Instruct` | Qwen 3 | 14B | ~12 GB | 32K | Yes (24 GB RAM+) | `enable_thinking=False` | Fits RTX 3090/4090; good balance |
| `Qwen/Qwen3-32B-Instruct` | Qwen 3 | 32B | ~24 GB | 32K | Yes (36 GB RAM+) | `enable_thinking=False` | High quality; tight on RTX 4090 |
| `meta-llama/Llama-3.1-70B-Instruct` | Llama 3.1 | 70B | ~48 GB | 128K | No | — | A100 required; best Llama fidelity |
| `mistralai/Mistral-22B-Instruct-v0.3` | Mistral | 22B | ~18 GB | 32K | No | — | Good mid-large option |

---

## Experimental / Known Limitations

| HuggingFace ID | Limitation | Workaround |
|----------------|-----------|-----------|
| `google/gemma-4-26B-A4B-it` | MoE 3D fused expert tensors incompatible with bitsandbytes; QLoRA silently loads ~43.7 GB instead of expected ~8 GB | Use A100 80GB with full-precision LoRA, or use `google/gemma-4-31B-it` instead |
| `Qwen/Qwen3-30B-A3B-Instruct` | MoE architecture; similar bitsandbytes quantization issues as Gemma 26B-A4B | Use `Qwen/Qwen3-32B-Instruct` (dense) instead |
| Models without `tokenizer.chat_template` | Old models may lack a chat template; `apply_chat_template()` will error | Use a newer instruction-tuned variant, or manually set `tokenizer.chat_template` |

---

## Per-Model Training Notes

### Thinking Mode (Gemma 4, Qwen 3)

Both Gemma 4 and Qwen 3 have a built-in reasoning/thinking mode that should be **disabled** for persona fine-tuning and inference. Thinking tokens break persona voice and consume context window.

**Gemma 4** — disable via processor/tokenizer:
```python
text = processor.apply_chat_template(
    messages, tokenize=False, add_generation_prompt=True,
    enable_thinking=False,  # critical for persona use
)
```

**Qwen 3** — add `/no_think` to the system message, or use:
```python
text = tokenizer.apply_chat_template(
    messages, tokenize=False, add_generation_prompt=True,
    enable_thinking=False,
)
```

### Gemma 4 PLE Architecture

E2B and E4B use Per-Layer Embeddings: each decoder layer has its own embedding table. These are large but used only for lookups. This is why:
- `E2B` is described as "2.3B effective" but loads 5.1B params (and needs ~9.6 GB BF16 for inference)
- `E4B` is "4.5B effective" but loads 8B params (~15 GB BF16 for inference)
- QLoRA training only trains the LoRA adapters on top — the 4-bit base still needs to be loaded

### Native System Prompt Support

All models in this registry support the `system` role in their chat template. The training pipeline injects `profile.md` as a system message:
```python
{"role": "system", "content": profile_text}
```

Older models (pre-2024) may silently ignore the system role or merge it into the first user turn — check the model card if persona adherence is poor.

### Recommended Sampling Parameters (inference)

Most models in this registry perform well with:
- `temperature=1.0, top_p=0.95, top_k=64` — Gemma 4 official recommendation; used as default in `voice_test.py`
- For Llama/Mistral: `temperature=0.7, top_p=0.9` is also common; override via `voice_test.py --temperature 0.7 --top-p 0.9`

**Pipeline auto-handling:** `train.py` and `voice_test.py` both probe the tokenizer for `enable_thinking` support once at startup and pass `enable_thinking=False` automatically for Gemma 4 and Qwen 3. No manual configuration needed.

### Adding New Models

To add a model to this registry:
1. Verify it has a chat template: `tokenizer.chat_template is not None`
2. Measure QLoRA VRAM: load with `load_in_4bit=True` + LoRA and check `nvidia-smi` / `htop`
3. Check MLX support: `mlx_lm.load("{model_id}")` — errors if unsupported
4. Test persona fine-tuning with a small dataset (200 turns) and voice test
5. Add a row to the appropriate tier table above
