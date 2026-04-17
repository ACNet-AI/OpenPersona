#!/usr/bin/env python3
"""
Fine-tune any HuggingFace instruction-tuned model for a persona.

Supported methods (pick by hardware):
  unsloth  — NVIDIA GPU, recommended (2–5× faster QLoRA via Unsloth)
  qlora    — NVIDIA GPU fallback (vanilla HuggingFace peft+trl)
  mlx      — Apple Silicon, recommended (Apple-native MLX framework)
  lora     — Apple Silicon fallback (PyTorch MPS full LoRA)

Usage:
  python scripts/train.py \
    --model <hf-model-id> \
    --data training/prepared/ \
    --output models/{slug}/export/ \
    --method unsloth \
    --epochs 3
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def _parse_eval_loss(lines: list) -> float | None:
    """Extract the last Val loss value from mlx_lm.lora stdout/stderr lines.

    mlx_lm.lora prints: "Iter 259: Val loss 6.359, Val took 17.220s"
    Returns None when no Val loss line is found (no eval data or parse failure).
    """
    matches = re.findall(r'Val loss (\d+\.?\d*(?:[eE][+-]?\d+)?)', ''.join(lines))
    return float(matches[-1]) if matches else None


def _version_fields(args) -> dict:
    """Build version-tracking fields for training_summary.json.

    These fields are informational only — they do not affect training logic.
    They are read by version.py activate to reconstruct the export step.
    """
    profile_path = getattr(args, "profile", None)
    return {
        "version":      getattr(args, "version", "v1"),
        "trained_at":   datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "profile_path": str(Path(profile_path).resolve()) if profile_path else None,
        "formats":      getattr(args, "formats", "gguf,ollama"),
        "quant":        getattr(args, "quant", "Q4_K_M"),
    }


def _chat_template_extra_kwargs(tokenizer) -> dict:
    """Probe tokenizer once for Gemma 4 enable_thinking support.
    Gemma 4 generates thinking tokens by default; disable them for persona
    fine-tuning so training targets clean persona responses only.
    Other tokenizers raise TypeError on unknown kwargs — caught and ignored.
    """
    try:
        tokenizer.apply_chat_template([], tokenize=False, enable_thinking=False)
        return {"enable_thinking": False}
    except Exception:
        return {}


def train_mlx(args, output_dir, train_path, eval_path, train_count: int = 0, eval_count: int = 0):
    """Apple Silicon native training via mlx-lm."""
    try:
        import mlx_lm  # noqa: F401
        from transformers import AutoTokenizer
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: uv pip install mlx-lm transformers")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_path = output_dir / "adapter_weights"
    adapter_path.mkdir(parents=True, exist_ok=True)

    # Convert {"messages": [...]} → {"text": "..."} for mlx-lm compatibility.
    # mlx-lm's native messages support varies by version; pre-converting is safer.
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    extra = _chat_template_extra_kwargs(tokenizer)
    mlx_data_dir = output_dir / "mlx_data"
    mlx_data_dir.mkdir(parents=True, exist_ok=True)

    for src, dst_name in [(train_path, "train.jsonl"), (eval_path, "valid.jsonl")]:
        if not Path(src).exists():
            continue
        dst = mlx_data_dir / dst_name
        with open(src, encoding="utf-8") as fin, open(dst, "w", encoding="utf-8") as fout:
            for line in fin:
                sample = json.loads(line)
                msgs = sample.get("messages", [])
                text = tokenizer.apply_chat_template(
                    msgs, tokenize=False, add_generation_prompt=False, **extra
                )
                fout.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
    print(f"  Converted training data for mlx-lm → {mlx_data_dir}")

    # mlx-lm CLI changed in newer versions:
    # - Entry point: `python -m mlx_lm lora`
    # - Layer flag: `--num-layers` (replaces old `--lora-layers`)
    # - Rank is no longer exposed as a direct CLI flag in this version.
    # We pass the available compatible knobs and keep lora_rank recorded in summary.
    cmd = [
        sys.executable, "-m", "mlx_lm", "lora",
        "--model", args.model,
        "--train",
        "--data", str(mlx_data_dir),
        "--save-every", "100",
        "--adapter-path", str(adapter_path),
        "--iters", str(args.epochs * 500),  # approx epoch → iters
        "--num-layers", str(args.lora_layers),
        "--learning-rate", str(args.learning_rate),
        "--batch-size", str(args.batch_size),
    ]
    if eval_path.exists():
        cmd += ["--val-batches", "25"]

    print(f"Training with MLX (Apple Silicon native)…")
    print(f"Command: {' '.join(cmd)}")

    # Popen tee: stream output to terminal while capturing for Val loss parsing.
    # subprocess.call would lose the output; capture_output would hide it from the user.
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    captured = []
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        captured.append(line)
    proc.wait()
    if proc.returncode != 0:
        sys.exit(proc.returncode)

    eval_loss = _parse_eval_loss(captured)  # None when no eval data or no Val loss line

    # MLX saves adapters as .safetensors — write summary
    summary = {
        "base_model": args.model,
        "method": "mlx",
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "lora_layers": args.lora_layers,
        "epochs": args.epochs,
        "train_samples": train_count,
        "eval_samples": eval_count,
        "device": "apple-silicon",
        "adapter_path": str(adapter_path),
        **_version_fields(args),
    }
    if eval_loss is not None:
        summary["evaluation"] = {
            "eval_loss":  round(eval_loss, 4),
            "perplexity": round(math.exp(eval_loss), 2),
        }
    (output_dir / "training_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Patch adapter_config.json: add base_model_name_or_path so eval_probe.py
    # and voice_test.py can discover the base model without --base-model flag.
    adapter_cfg_path = adapter_path / "adapter_config.json"
    if adapter_cfg_path.exists():
        try:
            adapter_cfg = json.loads(adapter_cfg_path.read_text(encoding="utf-8"))
            if "base_model_name_or_path" not in adapter_cfg:
                adapter_cfg["base_model_name_or_path"] = args.model
                adapter_cfg_path.write_text(
                    json.dumps(adapter_cfg, indent=4, ensure_ascii=False), encoding="utf-8"
                )
        except Exception:
            pass  # non-fatal: eval tools can still use --base-model flag

    print(f"\n✅ MLX adapter saved → {adapter_path}")


def train_unsloth(args, output_dir, train_path, eval_path, train_count: int = 0, eval_count: int = 0):
    """NVIDIA GPU training via Unsloth (2–5× faster than vanilla HF)."""
    try:
        from unsloth import FastLanguageModel
        from datasets import load_dataset
        from trl import SFTTrainer
        from transformers import TrainingArguments
    except ImportError as e:
        print(f"❌ Unsloth or dependency not installed: {e}")
        print("   Run: uv pip install 'unsloth[colab-new]'")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    adapter_path = output_dir / "adapter_weights"

    print(f"Loading model with Unsloth: {args.model}")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=2048,
        load_in_4bit=True,
        dtype=None,  # auto-detect
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        # target_modules omitted: PEFT auto-detects all linear layers for any architecture
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    data_files = {"train": str(train_path)}
    if eval_path.exists():
        data_files["eval"] = str(eval_path)
    dataset = load_dataset("json", data_files=data_files)

    # Apply model-agnostic chat template via formatting_func.
    # prepare_data.py outputs {"messages": [...]} — apply_chat_template handles
    # format differences across Gemma, Qwen, Llama, Phi, Mistral, etc.
    # Gemma 4 requires enable_thinking=False to suppress thinking tokens so the
    # model trains on clean persona responses only (probed once, cached in extra).
    extra = _chat_template_extra_kwargs(tokenizer)

    def formatting_func(examples):
        return [
            tokenizer.apply_chat_template(
                msgs, tokenize=False, add_generation_prompt=False, **extra
            )
            for msgs in examples["messages"]
        ]

    has_eval = eval_path.exists()
    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=args.warmup_ratio,
        logging_steps=10,
        eval_strategy="epoch" if has_eval else "no",
        save_strategy="epoch",
        fp16=True,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset.get("eval"),
        tokenizer=tokenizer,
        formatting_func=formatting_func,
        max_seq_length=2048,
    )

    print("Training with Unsloth (2–5× faster QLoRA)…")
    trainer.train()
    model.save_pretrained(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))

    eval_loss = next(
        (e["eval_loss"] for e in reversed(trainer.state.log_history) if "eval_loss" in e),
        None,
    )

    summary = {
        "base_model": args.model,
        "method": "unsloth",
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "epochs": args.epochs,
        "train_samples": train_count,
        "eval_samples": eval_count,
        "device": "cuda",
        "adapter_path": str(adapter_path),
        **_version_fields(args),
    }
    if eval_loss is not None:
        summary["evaluation"] = {
            "eval_loss":  round(eval_loss, 4),
            "perplexity": round(math.exp(eval_loss), 2),
        }
    (output_dir / "training_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\n✅ Unsloth adapter saved → {adapter_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="HuggingFace model ID (e.g. google/gemma-4-E4B-it)")
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--method", default="unsloth",
                        choices=["unsloth", "qlora", "mlx", "lora", "full"])
    parser.add_argument("--lora-rank",    type=int,   default=16,
                        help="LoRA rank — dimensionality of adapter matrices (default: 16)")
    parser.add_argument("--lora-alpha",   type=int,   default=None,
                        help="LoRA alpha — scaling factor (default: auto = lora-rank; alpha==rank is Gemma 4 recommendation)")
    parser.add_argument("--lora-layers",  type=int,   default=16,
                        help="MLX only: number of transformer layers to apply LoRA to (default: 16)")
    parser.add_argument("--warmup-ratio", type=float, default=0.05,
                        help="Warmup ratio for LR scheduler (default: 0.05; Gemma 4 preset uses 0.1)")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--dry-run", action="store_true", help="Validate setup without training")
    # Version-tracking fields — informational only, recorded in training_summary.json
    # for use by version.py activate when reconstructing the export step.
    parser.add_argument("--version",  default="v1",
                        help="Version label (e.g. v1, v2) written to training_summary.json")
    parser.add_argument("--profile",  default=None,
                        help="Path to profile.md — absolute path recorded in summary for version activate")
    parser.add_argument("--formats",  default="gguf,ollama",
                        help="Export formats recorded in summary (e.g. gguf,ollama,vllm,onnx)")
    parser.add_argument("--quant",    default="Q4_K_M",
                        help="GGUF quantization level recorded in summary for version activate")
    args = parser.parse_args()
    # Resolve lora_alpha: default to lora_rank (alpha == rank is the Gemma 4 recommendation
    # and works well for most persona fine-tuning tasks; avoids silent global default changes).
    if args.lora_alpha is None:
        args.lora_alpha = args.lora_rank

    data_dir = Path(args.data)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Validate inputs
    train_path = data_dir / "train.jsonl"
    eval_path = data_dir / "eval.jsonl"
    if not train_path.exists():
        print(f"❌ Training data not found: {train_path}")
        print("   Run scripts/prepare_data.py first.")
        sys.exit(1)

    train_count = sum(1 for _ in open(train_path, encoding="utf-8"))
    eval_count = sum(1 for _ in open(eval_path, encoding="utf-8")) if eval_path.exists() else 0
    print(f"Training data: {train_count} samples | Eval: {eval_count} samples")
    print(f"Method: {args.method}")
    print(f"Hyperparameters: lora_rank={args.lora_rank} lora_alpha={args.lora_alpha} "
          f"lora_layers={args.lora_layers} warmup_ratio={args.warmup_ratio} "
          f"epochs={args.epochs} batch_size={args.batch_size} lr={args.learning_rate}")

    if args.dry_run:
        print("✅ Dry run complete — setup looks good.")
        return

    # Route to optimized training backend
    if args.method == "mlx":
        train_mlx(args, output_dir, train_path, eval_path, train_count, eval_count)
        return
    if args.method == "unsloth":
        train_unsloth(args, output_dir, train_path, eval_path, train_count, eval_count)
        return

    # Import training dependencies
    try:
        import torch
        from datasets import load_dataset
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            TrainingArguments,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training
        from trl import SFTTrainer
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: uv pip install transformers peft trl datasets bitsandbytes accelerate")
        sys.exit(1)

    # Detect device
    if torch.cuda.is_available():
        device = "cuda"
        print(f"Using CUDA: {torch.cuda.get_device_name(0)}")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
        print("Using Metal (Apple Silicon MPS)")
    else:
        device = "cpu"
        print("⚠️  CPU only — training will be very slow")

    # QLoRA config (4-bit quantization — CUDA only; MPS/CPU use full LoRA)
    bnb_config = None
    if args.method == "qlora":
        if device != "cuda":
            print(f"  ⚠️  QLoRA requires CUDA. Falling back to full LoRA on {device}.")
            args.method = "lora"
        else:
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
            )

    print(f"\nLoading model: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        quantization_config=bnb_config,
        device_map="auto" if device == "cuda" else None,
        torch_dtype=torch.bfloat16 if device == "mps" else (torch.float16 if device == "cuda" else torch.float32),
        trust_remote_code=True,
    )

    if bnb_config:
        model = prepare_model_for_kbit_training(model)

    # LoRA configuration — target_modules omitted: PEFT auto-detects all linear
    # layers for any architecture (Gemma, Qwen, Llama, Phi, Mistral, etc.)
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Load dataset
    data_files = {"train": str(train_path)}
    if eval_path.exists():
        data_files["eval"] = str(eval_path)
    dataset = load_dataset("json", data_files=data_files)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=args.warmup_ratio,
        logging_steps=10,
        eval_strategy="epoch" if eval_path.exists() else "no",
        save_strategy="epoch",
        load_best_model_at_end=eval_path.exists(),
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        fp16=device == "cuda",
        bf16=device == "mps",
        report_to="none",
        logging_dir=str(output_dir / "logs"),
    )

    # formatting_func applies tokenizer.apply_chat_template() on {"messages": [...]}
    # output of prepare_data.py — model-agnostic across all supported architectures.
    # Gemma 4: enable_thinking=False suppresses thinking tokens during training.
    extra = _chat_template_extra_kwargs(tokenizer)

    def formatting_func(examples):
        return [
            tokenizer.apply_chat_template(
                msgs, tokenize=False, add_generation_prompt=False, **extra
            )
            for msgs in examples["messages"]
        ]

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset.get("eval"),
        tokenizer=tokenizer,
        formatting_func=formatting_func,
        max_seq_length=2048,
    )

    print(f"\nStarting training ({args.epochs} epochs)…")
    trainer.train()

    # Extract eval_loss from training log history (populated when eval data exists)
    eval_loss = next(
        (e["eval_loss"] for e in reversed(trainer.state.log_history) if "eval_loss" in e),
        None,
    )

    # Save adapter weights
    adapter_path = output_dir / "adapter_weights"
    model.save_pretrained(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))
    print(f"\n✅ Adapter weights saved → {adapter_path}")

    # Save training summary
    summary = {
        "base_model": args.model,
        "method": args.method,
        "lora_rank": args.lora_rank,
        "lora_alpha": args.lora_alpha,
        "epochs": args.epochs,
        "train_samples": train_count,
        "eval_samples": eval_count,
        "device": device,
        "adapter_path": str(adapter_path),
        **_version_fields(args),
    }
    if eval_loss is not None:
        summary["evaluation"] = {
            "eval_loss":  round(eval_loss, 4),
            "perplexity": round(math.exp(eval_loss), 2),
        }
    (output_dir / "training_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"   Training summary → {output_dir}/training_summary.json")
    print("\nNext: run scripts/voice_test.py to validate, then scripts/export.py")


if __name__ == "__main__":
    main()
