# Pack Integration & Usage (Phases 8–9)

## Phase 8: Pack Integration

Bundle the model into the persona skill pack:

```
{slug}-skill/
  SKILL.md
  persona.json
  soul/injection.md
  ...
  model/                    ← NEW
    adapter_weights/        ← LoRA weights (versioned)
    gguf/{slug}.gguf        ← quantized model
    ollama/Modelfile
    training_summary.json   ← fidelity scores, data stats, base model
    voice_test_results.json
```

Update `persona.json` to declare the bundled model:

```json
{
  "body": {
    "runtime": {
      "models": [
        {
          "id": "{slug}-local",
          "type": "fine-tuned",
          "base": "{model_id}",
          "adapter": "./model/adapter_weights/",
          "gguf": "./model/gguf/{slug}.gguf",
          "fidelity_score": 3.8,
          "trainable": true
        }
      ]
    }
  }
}
```

---

## Phase 9: Usage Instructions

Generate a `model/RUNNING.md` with platform-specific run instructions:

```markdown
# Running {DisplayName} locally

## Ollama (recommended — macOS / Linux / Windows)
ollama run {slug}

## LM Studio (GUI, all platforms)
Open LM Studio → Load Model → select {slug}.gguf

## llama.cpp (advanced)
./llama-cli -m model/gguf/{slug}.gguf --interactive --ctx-size 4096

## vLLM — OpenAI-compatible API server (NVIDIA GPU)
pip install vllm
bash model/vllm/launch.sh
# → http://localhost:8000/v1/chat/completions

## ONNX — Edge / mobile / browser
# Android / iOS: bundle model/onnx/ into your app with ONNX Runtime Mobile
# Browser: use onnxruntime-web

## OpenClaw integration
# persona.json already declares the local model — OpenClaw picks it up automatically
openpersona switch {slug}
```
