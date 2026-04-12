#!/usr/bin/env python3
"""
Export fine-tuned persona model to multiple deployment formats.

Supported --formats (comma-separated):
  gguf    — llama.cpp / LM Studio / Ollama source (quantized, offline)
  ollama  — Modelfile for `ollama create` (requires gguf)
  vllm    — vLLM-compatible merged HF model + launch script (production API)
  onnx    — ONNX IR export for Edge / WASM / mobile runtimes

Usage:
  python scripts/export.py \
    --model models/{slug}/adapter_weights/ \
    --base-model google/gemma-4-E4B-it \
    --slug {slug} \
    --formats gguf,ollama,vllm,onnx
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


GGUF_QUANT_LEVELS = {
    "e2b": "Q8_0",    # E2B: already tiny — preserve quality
    "e4b": "Q4_K_M",  # E4B: best balance for phones/laptops
    "26b": "Q4_K_M",  # 26B A4B: balance for workstations
    # legacy keys kept for backward compat
    "1b": "Q8_0",
    "4b": "Q4_K_M",
    "12b": "Q4_K_M",
}

OLLAMA_MODELFILE_TEMPLATE = """\
FROM {gguf_path}

SYSTEM \"\"\"{system_prompt}\"\"\"

PARAMETER temperature 0.8
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
"""


def merge_adapter(base_model: str, adapter_path: Path, merged_path: Path):
    """Merge LoRA adapter weights into the base model for export."""
    print(f"Merging adapter into base model…")
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel

        tokenizer = AutoTokenizer.from_pretrained(base_model)
        base = AutoModelForCausalLM.from_pretrained(
            base_model,
            torch_dtype=torch.float16,
            device_map="cpu",
            trust_remote_code=True,
        )
        model = PeftModel.from_pretrained(base, str(adapter_path))
        merged = model.merge_and_unload()
        merged.save_pretrained(str(merged_path))
        tokenizer.save_pretrained(str(merged_path))
        print(f"  ✅ Merged model saved → {merged_path}")
        return True
    except Exception as e:
        print(f"  ❌ Merge failed: {e}")
        return False


def export_gguf(merged_path: Path, output_path: Path, quant: str, slug: str) -> Path:
    """Convert merged model to GGUF using llama.cpp convert script."""
    output_path.mkdir(parents=True, exist_ok=True)
    gguf_file = output_path / f"{slug}.gguf"

    # Try to find llama.cpp convert script
    convert_candidates = [
        "convert_hf_to_gguf.py",
        os.path.expanduser("~/llama.cpp/convert_hf_to_gguf.py"),
        "/usr/local/lib/llama.cpp/convert_hf_to_gguf.py",
    ]
    convert_script = next((p for p in convert_candidates if Path(p).exists()), None)

    if not convert_script:
        print("  ⚠️  llama.cpp convert script not found.")
        print("     Install llama.cpp: https://github.com/ggerganov/llama.cpp")
        print(f"     Then run manually:")
        print(f"       python convert_hf_to_gguf.py {merged_path} --outfile {gguf_file} --outtype {quant.lower()}")
        return None

    print(f"Converting to GGUF ({quant})…")
    result = subprocess.run(
        [sys.executable, convert_script, str(merged_path), "--outfile", str(gguf_file), "--outtype", quant.lower()],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        size_mb = gguf_file.stat().st_size // (1024 * 1024)
        print(f"  ✅ GGUF exported → {gguf_file} ({size_mb} MB)")
        return gguf_file
    else:
        print(f"  ❌ GGUF conversion failed:\n{result.stderr[-500:]}")
        return None


def export_ollama(gguf_path: Path, output_path: Path, slug: str, system_prompt: str):
    """Generate Ollama Modelfile."""
    output_path.mkdir(parents=True, exist_ok=True)
    modelfile = OLLAMA_MODELFILE_TEMPLATE.format(
        gguf_path=gguf_path.resolve() if gguf_path else f"<path-to-{slug}.gguf>",
        system_prompt=system_prompt[:300].replace('"', '\\"'),
    )
    modelfile_path = output_path / "Modelfile"
    modelfile_path.write_text(modelfile)
    print(f"  ✅ Ollama Modelfile → {modelfile_path}")

    # Try to register with Ollama if installed
    try:
        result = subprocess.run(["ollama", "--version"], capture_output=True)
        if result.returncode == 0:
            print(f"\nOllama detected. To register:")
            print(f"  ollama create {slug} -f {modelfile_path}")
            print(f"  ollama run {slug}")
    except FileNotFoundError:
        print(f"\nTo use with Ollama: ollama create {slug} -f {modelfile_path}")


VLLM_LAUNCH_TEMPLATE = """\
#!/usr/bin/env bash
# vLLM inference server for {slug}
# Requires: pip install vllm
# Usage: bash models/{slug}/vllm/launch.sh [--port 8000]

MODEL_PATH="$(dirname "$0")/../merged"
PORT="${{1:---port}} ${{2:-8000}}"

python -m vllm.entrypoints.openai.api_server \\
  --model "$MODEL_PATH" \\
  --served-model-name "{slug}" \\
  --max-model-len 4096 \\
  --dtype float16 \\
  $PORT

# Test after launch:
#   curl http://localhost:8000/v1/chat/completions \\
#     -H "Content-Type: application/json" \\
#     -d '{{"model":"{slug}","messages":[{{"role":"user","content":"Hello"}}]}}'
"""


def export_vllm(merged_path: Path, output_path: Path, slug: str, system_prompt: str):
    """Prepare vLLM-compatible serving directory (merged HF model + launch script)."""
    output_path.mkdir(parents=True, exist_ok=True)

    if not merged_path.exists():
        print("  ⚠️  Merged model not found — run gguf export first (it merges the adapter).")
        print(f"     Expected path: {merged_path}")
        return

    # Write launch script
    launch_script = output_path / "launch.sh"
    launch_script.write_text(VLLM_LAUNCH_TEMPLATE.format(slug=slug))
    launch_script.chmod(0o755)

    # Write system prompt as a separate file for convenience
    if system_prompt:
        (output_path / "system_prompt.txt").write_text(system_prompt)

    # Write README snippet
    readme = output_path / "README.md"
    readme.write_text(f"""\
# vLLM serving — {slug}

## Quick start
```bash
pip install vllm
bash models/{slug}/vllm/launch.sh
```

## OpenAI-compatible API
```bash
curl http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{{"model":"{slug}","messages":[{{"role":"user","content":"Hello"}}]}}'
```

## System prompt
Defined in `system_prompt.txt`. Pass it as a system message in each request,
or use `--system-prompt` flag (vLLM ≥ 0.4).
""")

    print(f"  ✅ vLLM launch script → {launch_script}")
    print(f"     Start server: bash {launch_script}")
    print(f"     Install vLLM: pip install vllm")


def export_onnx(merged_path: Path, output_path: Path, slug: str):
    """Export merged model to ONNX IR for Edge / WASM / mobile runtimes."""
    output_path.mkdir(parents=True, exist_ok=True)

    try:
        from optimum.exporters.onnx import main_export
    except ImportError:
        print("  ⚠️  optimum not installed. Run:")
        print("       uv pip install optimum[exporters]")
        print(f"     Then retry: python scripts/export.py --formats onnx ...")
        print(f"\n  Manual export command:")
        print(f"    optimum-cli export onnx --model {merged_path} {output_path}")
        return

    if not merged_path.exists():
        print(f"  ❌ Merged model not found at {merged_path}. Run gguf/vllm export first.")
        return

    print(f"Exporting to ONNX (this may take 5–15 minutes)…")
    try:
        main_export(
            model_name_or_path=str(merged_path),
            output=output_path,
            task="text-generation-with-past",
            device="cpu",
            fp16=False,
        )
        print(f"  ✅ ONNX model → {output_path}/")
        print(f"     Use with: onnxruntime / onnxruntime-web / ONNX Runtime Mobile")
    except Exception as e:
        print(f"  ❌ ONNX export failed: {e}")
        print(f"     Try manual: optimum-cli export onnx --model {merged_path} {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to adapter_weights/")
    parser.add_argument("--base-model", default="google/gemma-4-E4B-it")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--formats", default="gguf,ollama",
                        help="Comma-separated: gguf,ollama,vllm,onnx")
    parser.add_argument("--model-size", default="e4b",
                        choices=["e2b", "e4b", "26b", "1b", "4b", "12b"])
    parser.add_argument("--profile", default="training/profile.md")
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()

    adapter_path = Path(args.model)
    formats = [f.strip() for f in args.formats.split(",")]

    base_output = Path(args.output_dir) if args.output_dir else adapter_path.parent
    merged_path = base_output / "merged"
    gguf_output = base_output / "gguf"
    ollama_output = base_output / "ollama"
    vllm_output = base_output / "vllm"
    onnx_output = base_output / "onnx"

    system_prompt = ""
    profile_path = Path(args.profile)
    if profile_path.exists():
        lines = [l.strip() for l in profile_path.read_text().splitlines()
                 if l.strip() and not l.startswith("#")]
        system_prompt = " ".join(lines)[:300]

    gguf_path = None
    needs_merge = any(f in formats for f in ["gguf", "ollama", "vllm", "onnx"])

    if needs_merge:
        ok = merge_adapter(args.base_model, adapter_path, merged_path)
        if ok:
            if "gguf" in formats or "ollama" in formats:
                quant = GGUF_QUANT_LEVELS.get(args.model_size, "Q4_K_M")
                gguf_path = export_gguf(merged_path, gguf_output, quant, args.slug)
        else:
            print("⚠️  Merge failed — skipping formats that require merged model.")

    if "ollama" in formats:
        export_ollama(
            gguf_path or gguf_output / f"{args.slug}.gguf",
            ollama_output, args.slug, system_prompt
        )

    if "vllm" in formats:
        export_vllm(merged_path, vllm_output, args.slug, system_prompt)

    if "onnx" in formats:
        export_onnx(merged_path, onnx_output, args.slug)

    print(f"\n✅ Export complete — outputs in {base_output}/")
    print("Formats exported:", ", ".join(formats))


if __name__ == "__main__":
    main()
