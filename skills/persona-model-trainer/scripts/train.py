#!/usr/bin/env python3
"""
QLoRA fine-tuning for persona models based on Gemma-4.

Usage:
  python scripts/train.py \
    --model google/gemma-4-4b-it \
    --data training/prepared/ \
    --output models/{slug}/ \
    --epochs 3
"""

import argparse
import json
import os
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="google/gemma-4-E4B-it")
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--method", default="qlora", choices=["qlora", "lora", "full"])
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--dry-run", action="store_true", help="Validate setup without training")
    args = parser.parse_args()

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

    train_count = sum(1 for _ in open(train_path))
    eval_count = sum(1 for _ in open(eval_path)) if eval_path.exists() else 0
    print(f"Training data: {train_count} samples | Eval: {eval_count} samples")

    if args.dry_run:
        print("✅ Dry run complete — setup looks good.")
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

    # LoRA configuration
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_rank,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
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
        warmup_ratio=0.05,
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

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset.get("eval"),
        tokenizer=tokenizer,
        dataset_text_field="text",
        max_seq_length=2048,
    )

    print(f"\nStarting training ({args.epochs} epochs)…")
    trainer.train()

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
        "epochs": args.epochs,
        "train_samples": train_count,
        "eval_samples": eval_count,
        "device": device,
        "adapter_path": str(adapter_path),
    }
    (output_dir / "training_summary.json").write_text(json.dumps(summary, indent=2))
    print(f"   Training summary → {output_dir}/training_summary.json")
    print("\nNext: run scripts/voice_test.py to validate, then scripts/export.py")


if __name__ == "__main__":
    main()
