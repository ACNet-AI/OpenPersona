#!/usr/bin/env python3
"""
Prepare training/conversations.jsonl → instruction-tuning dataset for Gemma-4.

Usage:
  python scripts/prepare_data.py \
    --input training/conversations.jsonl \
    --profile training/profile.md \
    --output training/prepared/ \
    --model-size 4b
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

GEMMA_CHAT_TEMPLATE = (
    "<start_of_turn>user\n{user}<end_of_turn>\n"
    "<start_of_turn>model\n{model}<end_of_turn>"
)

SYSTEM_PREFIX_TEMPLATE = (
    "<start_of_turn>user\n[System: {system_prompt}]\n\n{user}<end_of_turn>\n"
    "<start_of_turn>model\n{model}<end_of_turn>"
)

# Rough max tokens per model size (leave room for context)
# Maps both old (1b/4b/12b) and new (e2b/e4b/26b) size aliases
MAX_TOKENS = {"1b": 1024, "e2b": 1024, "4b": 2048, "e4b": 2048, "12b": 4096, "26b": 4096}


def load_profile(path: Path) -> str:
    """Load profile.md and extract a concise system prompt."""
    text = path.read_text(encoding="utf-8")
    # Use first 500 chars as system prompt (covers name, anchor, key traits)
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
    return " ".join(lines)[:500]


def load_conversations(path: Path):
    turns = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                turns.append(json.loads(line))
    return turns


def build_samples(turns, system_prompt: str, max_chars: int):
    """
    Build (user_turn, assistant_turn) pairs from the flat turn list.
    Each pair: a 'user' turn immediately followed by an 'assistant' turn.
    """
    samples = []
    i = 0
    while i < len(turns) - 1:
        if turns[i]["role"] == "user" and turns[i + 1]["role"] == "assistant":
            user_text = turns[i]["content"].strip()
            model_text = turns[i + 1]["content"].strip()
            # Skip empty or very short turns
            if len(user_text) < 3 or len(model_text) < 5:
                i += 1
                continue
            total = len(user_text) + len(model_text)
            if total > max_chars:
                # Truncate model response, keep user intact
                model_text = model_text[: max_chars - len(user_text) - 50] + "…"
            if system_prompt:
                text = SYSTEM_PREFIX_TEMPLATE.format(
                    system_prompt=system_prompt,
                    user=user_text,
                    model=model_text,
                )
            else:
                text = GEMMA_CHAT_TEMPLATE.format(user=user_text, model=model_text)
            samples.append({"text": text})
            i += 2
        else:
            i += 1
    return samples


def split_dataset(samples, eval_ratio=0.1):
    """Temporal split: last eval_ratio fraction goes to eval (no shuffle)."""
    n = len(samples)
    split = max(1, int(n * (1 - eval_ratio)))
    return samples[:split], samples[split:]


def scan_pii(turns):
    """Rough PII scan — flag samples containing obvious patterns."""
    patterns = [
        (r"\b\d{3}-\d{2}-\d{4}\b", "SSN"),
        (r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b", "credit card"),
        (r"\bpassword\s*[:=]\s*\S+", "password"),
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "email"),
    ]
    flags = []
    for t in turns:
        content = t.get("content", "")
        for pat, label in patterns:
            if re.search(pat, content, re.IGNORECASE):
                flags.append(label)
    return list(set(flags))


def save_jsonl(samples, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-size", default="e4b",
                        choices=["1b", "4b", "12b", "e2b", "e4b", "26b"])
    args = parser.parse_args()

    input_path = Path(args.input)
    profile_path = Path(args.profile)
    output_dir = Path(args.output)

    if not input_path.exists():
        print(f"❌ Input not found: {input_path}")
        sys.exit(1)

    print(f"Loading conversations from {input_path}…")
    turns = load_conversations(input_path)
    assistant_turns = [t for t in turns if t["role"] == "assistant"]
    print(f"  Total turns: {len(turns)} ({len(assistant_turns)} assistant-role)")

    # PII scan
    pii_flags = scan_pii(turns)
    if pii_flags:
        print(f"  ⚠️  PII patterns detected: {', '.join(pii_flags)}")
        print("     Review training/conversations.jsonl before training.")

    system_prompt = ""
    if profile_path.exists():
        system_prompt = load_profile(profile_path)
        print(f"  System prompt: {system_prompt[:80]}…")

    max_chars = MAX_TOKENS[args.model_size] * 4  # rough char → token ratio
    samples = build_samples(turns, system_prompt, max_chars)
    print(f"  Built {len(samples)} training samples")

    if len(samples) < 50:
        print("  ⚠️  Very few samples — model will likely overfit.")

    train_samples, eval_samples = split_dataset(samples)
    print(f"  Split: {len(train_samples)} train / {len(eval_samples)} eval")

    save_jsonl(train_samples, output_dir / "train.jsonl")
    save_jsonl(eval_samples, output_dir / "eval.jsonl")

    # Save stats
    stats = {
        "total_turns": len(turns),
        "assistant_turns": len(assistant_turns),
        "samples": len(samples),
        "train": len(train_samples),
        "eval": len(eval_samples),
        "model_size": args.model_size,
        "max_chars_per_sample": max_chars,
        "pii_flags": pii_flags,
    }
    (output_dir / "stats.json").write_text(json.dumps(stats, indent=2))

    print(f"\n✅ Data prepared → {output_dir}")
    print(f"   train.jsonl  ({len(train_samples)} samples)")
    print(f"   eval.jsonl   ({len(eval_samples)} samples)")


if __name__ == "__main__":
    main()
