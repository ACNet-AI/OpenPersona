#!/usr/bin/env python3
"""
Probe-based role consistency evaluation for fine-tuned persona adapters.

Loads a trained adapter, runs a set of predefined probe questions, and
computes a weighted keyword-match score that measures character fidelity.

Usage (MLX — Apple Silicon):
    python scripts/eval_probe.py \
      --adapter  models/{slug}/export/adapter_weights \
      --probes   training/probes.json \
      --output   probe_results.json \
      --method   mlx

Usage (HuggingFace — NVIDIA / CPU):
    python scripts/eval_probe.py \
      --adapter    models/{slug}/export/adapter_weights \
      --probes     training/probes.json \
      --output     probe_results.json \
      --method     hf \
      --base-model google/gemma-4-E4B-it

Output (probe_results.json):
    {
      "probe_score": 0.87,
      "probe_count": 3,
      "results": [
        {"id": "name", "question": "...", "keywords": [...],
         "weight": 1.0, "response": "...", "hit": true},
        ...
      ]
    }
"""

import argparse
import json
import sys
from pathlib import Path


def _chat_template_extra_kwargs(tokenizer) -> dict:
    """Return enable_thinking=False if the tokenizer supports it (Gemma 4)."""
    try:
        tokenizer.apply_chat_template([], tokenize=False, enable_thinking=False)
        return {"enable_thinking": False}
    except Exception:
        return {}


def _format_prompt(tokenizer, question: str) -> str:
    """Apply chat template so the model responds in persona mode."""
    extra = _chat_template_extra_kwargs(tokenizer)
    messages = [{"role": "user", "content": question}]
    return tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
        **extra,
    )


def _calc_score(probes: list, responses: list) -> tuple:
    """Compute weighted keyword-match probe score.

    Args:
        probes:    list of probe dicts from probes.json
        responses: list of generated response strings (same order as probes)

    Returns:
        (probe_score, results) where results is a list of per-probe dicts.
    """
    results = []
    sum_weighted_hits = 0.0
    sum_weights = 0.0

    for probe, response in zip(probes, responses):
        keywords = probe.get("keywords", [])
        hit = any(kw.lower() in response.lower() for kw in keywords)
        weight = float(probe.get("weight", 1.0))
        sum_weighted_hits += weight * hit
        sum_weights += weight
        results.append({
            "id":       probe.get("id", ""),
            "question": probe.get("question", ""),
            "keywords": keywords,
            "weight":   weight,
            "response": response,
            "hit":      hit,
        })

    probe_score = round(sum_weighted_hits / sum_weights, 4) if sum_weights > 0 else 0.0
    return probe_score, results


def _run_mlx(adapter_path: Path, probes: list) -> list:
    """Generate responses for each probe using MLX (Apple Silicon)."""
    try:
        import mlx_lm
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: uv pip install mlx-lm")
        sys.exit(1)

    # Resolve base model from adapter_config.json.
    # mlx_lm.load(path_or_hf_repo, adapter_path=...) requires the base model as
    # the first argument — passing the adapter directory directly would fail because
    # it only contains LoRA weights, not full model weights.
    adapter_cfg_path = adapter_path / "adapter_config.json"
    if not adapter_cfg_path.exists():
        print(f"❌ adapter_config.json not found in {adapter_path}")
        print("   Cannot determine base model for MLX inference.")
        sys.exit(1)
    base_model = json.loads(adapter_cfg_path.read_text()).get("base_model_name_or_path")
    if not base_model:
        print("❌ base_model_name_or_path missing in adapter_config.json")
        sys.exit(1)

    print(f"Loading base model for MLX inference: {base_model}")
    try:
        model, tokenizer = mlx_lm.load(base_model, adapter_path=str(adapter_path))
    except Exception as e:
        print(f"❌ Failed to load MLX model: {e}")
        sys.exit(1)

    responses = []
    for probe in probes:
        prompt = _format_prompt(tokenizer, probe["question"])
        response = mlx_lm.generate(model, tokenizer, prompt=prompt, max_tokens=200, verbose=False)
        responses.append(response)
        print(f"  [{probe['id']}] {response[:80]}{'…' if len(response) > 80 else ''}")
    return responses


def _run_hf(adapter_path: Path, base_model: str, probes: list) -> list:
    """Generate responses for each probe using HuggingFace + PEFT."""
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel
        import torch
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: uv pip install transformers peft torch")
        sys.exit(1)

    print(f"Loading base model: {base_model}")
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype="auto",
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(model, str(adapter_path))
    model.eval()

    responses = []
    for probe in probes:
        prompt = _format_prompt(tokenizer, probe["question"])
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        with __import__("torch").no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=200,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        decoded = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        responses.append(decoded)
        print(f"  [{probe['id']}] {decoded[:80]}{'…' if len(decoded) > 80 else ''}")
    return responses


def main():
    parser = argparse.ArgumentParser(description="Probe-based persona evaluation")
    parser.add_argument("--adapter",    required=True,
                        help="Path to adapter_weights directory")
    parser.add_argument("--probes",     required=True,
                        help="Path to probes.json (from persona-knowledge export)")
    parser.add_argument("--output",     required=True,
                        help="Output path for probe_results.json")
    parser.add_argument("--method",     choices=["mlx", "hf"], default="mlx",
                        help="Inference backend: mlx (Apple Silicon) or hf (HuggingFace)")
    parser.add_argument("--base-model", default=None,
                        help="HuggingFace model ID — required for --method hf")
    args = parser.parse_args()

    if args.method == "hf" and not args.base_model:
        print("❌ --base-model is required when using --method hf")
        sys.exit(1)

    probes_path = Path(args.probes)
    if not probes_path.exists():
        print(f"❌ probes.json not found: {probes_path}")
        sys.exit(1)

    probes_data = json.loads(probes_path.read_text())
    probes = probes_data.get("probes", [])
    if not probes:
        print("⚠️  No probes defined in probes.json — nothing to evaluate.")
        sys.exit(0)

    adapter_path = Path(args.adapter)
    print(f"Running {len(probes)} probe(s) via {args.method}…")

    if args.method == "mlx":
        responses = _run_mlx(adapter_path, probes)
    else:
        responses = _run_hf(adapter_path, args.base_model, probes)

    probe_score, results = _calc_score(probes, responses)

    output = {
        "probe_score": probe_score,
        "probe_count": len(probes),
        "results": results,
    }
    Path(args.output).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"\n✅ Probe score: {probe_score:.2%} ({sum(r['hit'] for r in results)}/{len(probes)} hits)")
    print(f"   Results → {args.output}")


if __name__ == "__main__":
    main()
