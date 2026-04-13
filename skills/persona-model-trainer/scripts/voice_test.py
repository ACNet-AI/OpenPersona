#!/usr/bin/env python3
"""
Automated voice fidelity test for a fine-tuned persona model.
Scores how well the model's outputs match the distilled persona profile.

Usage:
  python scripts/voice_test.py \
    --model models/{slug}/adapter_weights/ \
    --base-model <hf-model-id> \
    --profile training/profile.md \
    --questions 10
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_PROBES = [
    # Domain expertise
    ("Tell me about your work / what you're most passionate about.", "domain"),
    ("What's your opinion on [a topic central to this persona]?", "domain"),
    # Values challenge
    ("Would you compromise your principles for a better outcome?", "values"),
    ("What's something most people get wrong about you?", "values"),
    # Casual
    ("How was your day?", "casual"),
    ("What do you do to relax?", "casual"),
    # Off-topic deflection
    ("Can you write me a Python function?", "off_topic"),
    ("What's the capital of France?", "off_topic"),
    # Voice / expression
    ("How would you explain [complex topic] to a child?", "expression"),
    ("Give me your honest take — no filter.", "expression"),
]


def load_profile_traits(profile_path: Path) -> str:
    if not profile_path.exists():
        return ""
    return profile_path.read_text(encoding="utf-8")[:1000]


def probe_chat_template_kwargs(tokenizer) -> dict:
    """Probe tokenizer ONCE for Gemma 4 / Qwen 3 enable_thinking support.
    Call this once after model load and pass the result to generate_response().
    Gemma 4 requires enable_thinking=False to suppress thinking tokens during
    inference; other tokenizers raise TypeError on unknown kwargs.
    """
    try:
        tokenizer.apply_chat_template([], tokenize=False, enable_thinking=False)
        return {"enable_thinking": False}
    except Exception:
        return {}


def generate_response(model, tokenizer, prompt: str, system_prompt: str = "",
                      max_tokens: int = 200,
                      temperature: float = 1.0,
                      top_p: float = 0.95,
                      top_k: int = 64,
                      chat_template_extra: dict | None = None) -> str:
    """Generate a response using tokenizer.apply_chat_template() — model-agnostic.

    Default sampling params follow official Gemma 4 recommendations
    (temperature=1.0, top_p=0.95, top_k=64). Adjust per model-registry.md
    if using a different base model.

    Pass `chat_template_extra` from probe_chat_template_kwargs() — computed once
    before the test loop, not per-call.
    """
    import torch
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    extra = chat_template_extra or {}
    # apply_chat_template handles format differences across Gemma, Qwen, Llama, Phi, Mistral, etc.
    input_text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
        **extra,
    )
    inputs = tokenizer(input_text, return_tensors="pt").to(model.device)
    input_len = inputs["input_ids"].shape[1]

    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            pad_token_id=tokenizer.eos_token_id,
        )
    # Decode only the newly generated tokens (after the prompt)
    new_tokens = output[0][input_len:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def score_response(question: str, response: str, category: str, profile: str) -> dict:
    """
    Heuristic scoring — production version would use a judge LLM.
    Returns a score 1–5 and brief rationale.
    """
    score = 3
    notes = []

    if len(response) < 20:
        score -= 1
        notes.append("response too short")
    if len(response) > 800:
        score -= 1
        notes.append("response too long / rambling")

    if category == "off_topic":
        # Good: persona deflects or answers in character, not as a generic assistant
        generic_phrases = ["as an AI", "I'm a language model", "I cannot", "I don't have"]
        if any(p.lower() in response.lower() for p in generic_phrases):
            score -= 2
            notes.append("broke persona — sounded like a generic AI assistant")
        else:
            score += 1
            notes.append("maintained persona on off-topic prompt")

    if category == "values":
        # Good: shows genuine opinion, not neutral hedging
        hedge_phrases = ["it depends", "on one hand", "both sides", "there are many perspectives"]
        if sum(1 for p in hedge_phrases if p.lower() in response.lower()) >= 2:
            score -= 1
            notes.append("over-hedged — lacks distinctive voice")

    # Clamp to 1–5
    score = max(1, min(5, score))
    return {"score": score, "notes": "; ".join(notes) if notes else "ok"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to adapter_weights/")
    parser.add_argument("--base-model", required=True, help="HuggingFace model ID used as base (e.g. google/gemma-4-E4B-it)")
    parser.add_argument("--profile", default="training/profile.md")
    parser.add_argument("--questions", type=int, default=10,
                        help=f"Number of voice probe questions (1–{len(DEFAULT_PROBES)}, default: %(default)s)",
                        metavar="N")
    parser.add_argument("--output", default=None, help="JSON output path (default: alongside model)")
    parser.add_argument("--temperature", type=float, default=1.0,
                        help="Sampling temperature (default: 1.0 per Gemma 4 official recommendation)")
    parser.add_argument("--top-p", type=float, default=0.95,
                        help="Top-p nucleus sampling (default: 0.95)")
    parser.add_argument("--top-k", type=int, default=64,
                        help="Top-k sampling (default: 64)")
    args = parser.parse_args()

    if args.questions < 1:
        print("❌ --questions must be at least 1")
        sys.exit(1)

    model_path = Path(args.model)
    profile_path = Path(args.profile)

    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import PeftModel
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        sys.exit(1)

    print(f"Loading model from {model_path}…")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype="auto",
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, str(model_path))
    model.eval()

    # Probe tokenizer once — passed into generate_response() per call (not re-probed)
    chat_template_extra = probe_chat_template_kwargs(tokenizer)
    if chat_template_extra:
        print(f"   enable_thinking=False: active (Gemma 4 / Qwen 3 mode)")

    profile = load_profile_traits(profile_path)
    probes = DEFAULT_PROBES[: args.questions]

    results = []
    total_score = 0

    print(f"\nRunning {len(probes)} voice probes…\n")
    for i, (question, category) in enumerate(probes, 1):
        print(f"[{i}/{len(probes)}] {category}: {question[:60]}…")
        response = generate_response(
            model, tokenizer, question, system_prompt=profile,
            temperature=args.temperature, top_p=args.top_p, top_k=args.top_k,
            chat_template_extra=chat_template_extra,
        )
        scoring = score_response(question, response, category, profile)
        total_score += scoring["score"]

        result = {
            "question": question,
            "category": category,
            "response": response,
            "score": scoring["score"],
            "notes": scoring["notes"],
        }
        results.append(result)
        print(f"  Score: {scoring['score']}/5 — {scoring['notes']}")
        print(f"  Response: {response[:120]}…\n")

    avg_score = total_score / len(probes)
    by_category = {}
    for r in results:
        cat = r["category"]
        by_category.setdefault(cat, []).append(r["score"])

    category_avgs = {cat: sum(scores) / len(scores) for cat, scores in by_category.items()}
    best_cat = max(category_avgs, key=category_avgs.get)
    worst_cat = min(category_avgs, key=category_avgs.get)

    summary = {
        "overall_score": round(avg_score, 2),
        "pass": avg_score >= 3.0,
        "category_scores": {k: round(v, 2) for k, v in category_avgs.items()},
        "strongest_dimension": best_cat,
        "weakest_dimension": worst_cat,
        "probes": results,
    }

    output_path = Path(args.output) if args.output else model_path.parent / "voice_test_results.json"
    output_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    print(f"\n{'='*50}")
    print(f"Voice fidelity score: {avg_score:.1f} / 5.0")
    print(f"Strongest dimension: {best_cat} ({category_avgs[best_cat]:.1f})")
    print(f"Weakest dimension:   {worst_cat} ({category_avgs[worst_cat]:.1f})")
    if avg_score >= 3.0:
        print("✅ PASS — ready to export")
    else:
        print("⚠️  BELOW THRESHOLD — consider re-training with more epochs or data")
    print(f"\nFull results → {output_path}")


if __name__ == "__main__":
    main()
