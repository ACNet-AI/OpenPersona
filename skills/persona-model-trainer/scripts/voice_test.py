#!/usr/bin/env python3
"""
Automated voice fidelity test for a fine-tuned persona model.
Scores how well the model's outputs match the distilled persona profile.

Usage:
  python scripts/voice_test.py \
    --model models/{slug}/adapter_weights/ \
    --base-model google/gemma-4-E4B-it \
    --profile training/profile.md \
    --questions 10
"""

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


def generate_response(model, tokenizer, prompt: str, max_tokens: int = 200) -> str:
    import torch
    inputs = tokenizer(
        f"<start_of_turn>user\n{prompt}<end_of_turn>\n<start_of_turn>model\n",
        return_tensors="pt",
    ).to(model.device)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id,
        )
    decoded = tokenizer.decode(output[0], skip_special_tokens=True)
    # Extract only the model's response part
    marker = "<start_of_turn>model\n"
    if marker in decoded:
        return decoded.split(marker)[-1].strip()
    return decoded.strip()


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
    parser.add_argument("--base-model", default="google/gemma-4-E4B-it")
    parser.add_argument("--profile", default="training/profile.md")
    parser.add_argument("--questions", type=int, default=10)
    parser.add_argument("--output", default=None, help="JSON output path (default: alongside model)")
    args = parser.parse_args()

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

    profile = load_profile_traits(profile_path)
    probes = DEFAULT_PROBES[: args.questions]

    results = []
    total_score = 0

    print(f"\nRunning {len(probes)} voice probes…\n")
    for i, (question, category) in enumerate(probes, 1):
        print(f"[{i}/{len(probes)}] {category}: {question[:60]}…")
        response = generate_response(model, tokenizer, question)
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
