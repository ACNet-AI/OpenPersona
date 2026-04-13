#!/usr/bin/env python3
"""
Prepare training data → instruction-tuning dataset for any HuggingFace instruction-tuned model.

Reads from TWO layers (anyone-skill output):
  1. training/conversations.jsonl  — distilled & structured turns (quality)
  2. training/raw/                 — original source files (authentic voice)
     Supported raw formats:
       *.jsonl  → {role, content} turns or {role, content} objects
       *.json   → array of message objects
       *.txt    → plain text paragraphs (treated as persona monologue)
       *.csv    → auto-detect speaker column

Usage:
  python scripts/prepare_data.py \
    --input training/conversations.jsonl \
    --raw-dir training/raw/ \
    --profile training/profile.md \
    --output training/prepared/ \
    --model <hf-model-id>

Output format: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
The training script (train.py) applies tokenizer.apply_chat_template() at training time,
so the output is model-agnostic and works for any instruction-tuned model.
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

# Default max chars per sample (rough proxy for token limit).
# train.py applies tokenizer.apply_chat_template() — format is model-agnostic.
# Increase via --max-chars for long-context models (128K+).
DEFAULT_MAX_CHARS = 8192

# Generic prompts used to pair with monologue turns from raw text
GENERIC_PROMPTS = [
    "Tell me more about that.",
    "What's your take on this?",
    "How do you think about it?",
    "Can you elaborate?",
    "What do you mean exactly?",
    "Why is that important to you?",
    "What would you do in that situation?",
    "How did that shape you?",
]


def load_profile(path: Path) -> str:
    """Load profile.md and extract a concise system prompt."""
    text = path.read_text(encoding="utf-8")
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
    return " ".join(lines)[:500]


def load_jsonl(path: Path) -> list:
    """Load a JSONL file as a list of {role, content} turns."""
    turns = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "role" in obj and "content" in obj:
                    turns.append(obj)
            except json.JSONDecodeError:
                continue
    return turns


def load_json(path: Path) -> list:
    """Load a JSON file — expects array of {role, content} objects."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [o for o in data if isinstance(o, dict) and "role" in o and "content" in o]
    except Exception:
        pass
    return []


def load_txt(path: Path) -> list:
    """
    Convert plain text (essay / book / speech / monologue) to turns.
    Each non-empty paragraph becomes an assistant turn, paired with a
    rotating generic user prompt so the trainer sees Q→A structure.
    """
    text = path.read_text(encoding="utf-8")
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    turns = []
    for i, para in enumerate(paragraphs):
        if len(para) < 20:
            continue
        prompt = GENERIC_PROMPTS[i % len(GENERIC_PROMPTS)]
        turns.append({"role": "user", "content": prompt})
        turns.append({"role": "assistant", "content": para})
    return turns


def load_csv(path: Path) -> list:
    """
    Auto-detect a speaker/content column pair and convert to turns.
    Heuristic: look for columns named speaker/role/from + message/content/text.
    Falls back to treating first string column as content (assistant monologue).
    """
    try:
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        if not rows:
            return []
        headers = [h.lower() for h in rows[0].keys()]
        original_headers = list(rows[0].keys())

        # Try to find speaker + content columns
        speaker_col = next(
            (original_headers[i] for i, h in enumerate(headers)
             if h in ("speaker", "role", "from", "sender", "author")), None
        )
        content_col = next(
            (original_headers[i] for i, h in enumerate(headers)
             if h in ("message", "content", "text", "body", "msg")), None
        )

        turns = []
        if speaker_col and content_col:
            for row in rows:
                role_val = row[speaker_col].strip().lower()
                content = row[content_col].strip()
                if not content:
                    continue
                # Map anything that looks like "me/self/user" → user, else assistant
                role = "user" if role_val in ("user", "me", "self", "human") else "assistant"
                turns.append({"role": role, "content": content})
        elif content_col:
            # No speaker column — treat all as assistant monologue
            for i, row in enumerate(rows):
                content = row[content_col].strip()
                if len(content) < 10:
                    continue
                turns.append({"role": "user", "content": GENERIC_PROMPTS[i % len(GENERIC_PROMPTS)]})
                turns.append({"role": "assistant", "content": content})
        return turns
    except Exception:
        return []


def load_raw_dir(raw_dir: Path) -> list:
    """Load all supported files from training/raw/ and merge into a flat turn list."""
    if not raw_dir.exists():
        return []

    all_turns = []
    loaders = {".jsonl": load_jsonl, ".json": load_json, ".txt": load_txt, ".csv": load_csv}
    files_loaded = []

    for path in sorted(raw_dir.iterdir()):
        loader = loaders.get(path.suffix.lower())
        if not loader:
            continue
        turns = loader(path)
        if turns:
            all_turns.extend(turns)
            files_loaded.append(f"{path.name} ({len(turns)} turns)")

    if files_loaded:
        print(f"  Raw sources loaded:")
        for f in files_loaded:
            print(f"    {f}")

    return all_turns


def load_conversations(path: Path) -> list:
    """Load distilled conversations.jsonl."""
    if not path.exists():
        return []
    return load_jsonl(path)


def build_samples(turns, system_prompt: str, max_chars: int):
    """
    Build message-list samples from the flat turn list.
    Output format: {"messages": [{role, content}, ...]}
    train.py applies tokenizer.apply_chat_template() at training time,
    keeping the format model-agnostic (works for Gemma, Qwen, Llama, Phi, Mistral, etc.).
    """
    samples = []
    i = 0
    while i < len(turns) - 1:
        if turns[i]["role"] == "user" and turns[i + 1]["role"] == "assistant":
            user_text = turns[i]["content"].strip()
            assistant_text = turns[i + 1]["content"].strip()
            # Skip empty or very short turns
            if len(user_text) < 3 or len(assistant_text) < 5:
                i += 1
                continue
            total = len(user_text) + len(assistant_text)
            if total > max_chars:
                # Truncate assistant response, keep user intact
                assistant_text = assistant_text[: max_chars - len(user_text) - 50] + "…"
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": user_text})
            messages.append({"role": "assistant", "content": assistant_text})
            samples.append({"messages": messages})
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
    parser.add_argument("--input", default="training/conversations.jsonl",
                        help="Distilled conversations JSONL (anyone-skill output)")
    parser.add_argument("--raw-dir", default="training/raw/",
                        help="Directory of original source files (authentic voice)")
    parser.add_argument("--profile", default="training/profile.md")
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="",
                        help="HuggingFace model ID (informational; recorded in stats.json)")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                        help="Max chars per sample (default: 8192). Increase for 128K+ context models.")
    args = parser.parse_args()

    input_path = Path(args.input)
    raw_dir = Path(args.raw_dir)
    profile_path = Path(args.profile)
    output_dir = Path(args.output)

    if not input_path.exists() and not raw_dir.exists():
        print(f"❌ No training data found.")
        print(f"   Expected at least one of:")
        print(f"     {input_path}  (distilled conversations)")
        print(f"     {raw_dir}     (raw source files)")
        print(f"   Run anyone-skill Phase 6-D first to export training data.")
        sys.exit(1)

    all_turns = []

    # Layer 1: raw/ — authentic voice, original wording
    print(f"\n── Layer 1: Raw sources ({raw_dir}) ──")
    raw_turns = load_raw_dir(raw_dir)
    if raw_turns:
        all_turns.extend(raw_turns)
        print(f"  Subtotal: {len(raw_turns)} turns from raw/")
    else:
        print(f"  (none found — skipping)")

    # Layer 2: conversations.jsonl — distilled, structured
    print(f"\n── Layer 2: Distilled conversations ({input_path}) ──")
    distilled_turns = load_conversations(input_path)
    if distilled_turns:
        all_turns.extend(distilled_turns)
        print(f"  Subtotal: {len(distilled_turns)} turns from conversations.jsonl")
    else:
        print(f"  (not found — skipping)")

    if not all_turns:
        print("\n❌ No turns loaded from either source.")
        sys.exit(1)

    print(f"\n── Combined ──")
    assistant_turns = [t for t in all_turns if t.get("role") == "assistant"]
    print(f"  Total turns: {len(all_turns)} ({len(assistant_turns)} assistant-role)")
    print(f"  Raw: {len(raw_turns)}  Distilled: {len(distilled_turns)}")

    # PII scan
    pii_flags = scan_pii(all_turns)
    if pii_flags:
        print(f"  ⚠️  PII patterns detected: {', '.join(pii_flags)}")
        print("     Review training data before proceeding.")

    system_prompt = ""
    if profile_path.exists():
        system_prompt = load_profile(profile_path)
        print(f"  System prompt: {system_prompt[:80]}…")

    max_chars = args.max_chars
    samples = build_samples(all_turns, system_prompt, max_chars)
    print(f"  Built {len(samples)} training samples")

    if len(samples) < 50:
        print("  ⚠️  Very few samples (<50) — model will likely overfit.")
        print("     Add more source material to training/raw/ or training/conversations.jsonl")

    train_samples, eval_samples = split_dataset(samples)
    print(f"  Split: {len(train_samples)} train / {len(eval_samples)} eval")

    save_jsonl(train_samples, output_dir / "train.jsonl")
    save_jsonl(eval_samples, output_dir / "eval.jsonl")

    stats = {
        "total_turns": len(all_turns),
        "raw_turns": len(raw_turns),
        "distilled_turns": len(distilled_turns),
        "assistant_turns": len(assistant_turns),
        "samples": len(samples),
        "train": len(train_samples),
        "eval": len(eval_samples),
        "model": args.model,
        "max_chars_per_sample": max_chars,
        "pii_flags": pii_flags,
    }
    (output_dir / "stats.json").write_text(json.dumps(stats, indent=2))

    print(f"\n✅ Data prepared → {output_dir}")
    print(f"   train.jsonl  ({len(train_samples)} samples)")
    print(f"   eval.jsonl   ({len(eval_samples)} samples)")
    if raw_turns and distilled_turns:
        raw_pct = round(len(raw_turns) / len(all_turns) * 100)
        print(f"   Composition: {raw_pct}% authentic voice + {100-raw_pct}% distilled")


if __name__ == "__main__":
    main()
