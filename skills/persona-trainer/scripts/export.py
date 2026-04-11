#!/usr/bin/env python3
"""
Export fine-tuned persona model to GGUF and Ollama formats.

Usage:
  python scripts/export.py \
    --model models/{slug}/adapter_weights/ \
    --base-model google/gemma-4-4b-it \
    --slug {slug} \
    --formats gguf,ollama
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


GGUF_QUANT_LEVELS = {
    "1b": "Q8_0",    # 1B: keep quality, size manageable
    "4b": "Q4_K_M",  # 4B: best balance for phones/laptops
    "12b": "Q4_K_M", # 12B: balance for workstations
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to adapter_weights/")
    parser.add_argument("--base-model", default="google/gemma-4-E4B-it")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--formats", default="gguf,ollama")
    parser.add_argument("--model-size", default="4b", choices=["1b", "4b", "12b"])
    parser.add_argument("--profile", default="training/profile.md")
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()

    adapter_path = Path(args.model)
    formats = [f.strip() for f in args.formats.split(",")]

    base_output = Path(args.output_dir) if args.output_dir else adapter_path.parent
    merged_path = base_output / "merged"
    gguf_output = base_output / "gguf"
    ollama_output = base_output / "ollama"

    system_prompt = ""
    profile_path = Path(args.profile)
    if profile_path.exists():
        lines = [l.strip() for l in profile_path.read_text().splitlines() if l.strip() and not l.startswith("#")]
        system_prompt = " ".join(lines)[:300]

    gguf_path = None

    if "gguf" in formats or "ollama" in formats:
        ok = merge_adapter(args.base_model, adapter_path, merged_path)
        if ok and "gguf" in formats:
            quant = GGUF_QUANT_LEVELS.get(args.model_size, "Q4_K_M")
            gguf_path = export_gguf(merged_path, gguf_output, quant, args.slug)

    if "ollama" in formats:
        export_ollama(gguf_path or gguf_output / f"{args.slug}.gguf", ollama_output, args.slug, system_prompt)

    print(f"\n✅ Export complete")
    print(f"Next: integrate into skill pack with scripts/pack_model.py or manually copy model/ directory")


if __name__ == "__main__":
    main()
