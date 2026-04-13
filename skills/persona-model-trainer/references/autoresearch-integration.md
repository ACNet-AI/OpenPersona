# Autoresearch Integration (Phase 6.5)

Optional hyperparameter refinement loop using the autoresearch skill.

**Activate only when ALL three conditions are met:**

1. Voice fidelity score < 3.0
2. Training data has ≥ 1000 assistant-role turns
3. User agrees to spend additional training time

If conditions not met → skip to Phase 7 and note the shortfall in `training_summary.json`.

---

## Step 1 — Diagnose weak dimensions

From voice test results, identify which categories scored lowest:

- `off_topic` weak → model broke persona, sounded like a generic AI assistant
- `values` weak → over-hedged, no distinctive opinion
- `casual` weak → register mismatch, too formal or too generic
- `expression` weak → vocabulary and rhythm not captured

## Step 2 — Generate `program.md`

Write a `program.md` file at the working directory root:

```markdown
# Hyperparameter Refinement — {slug}

## Objective
Maximize voice_fidelity_score. Target: ≥ 3.5. Current best: {score}.

## Weak dimensions
{list from voice test, e.g. "humor: 2.1, off_topic: 2.3"}

## Metric
val_bpb printed to stdout by train.py wrapper (lower is better; maps to 1 - voice_score/5)

## Variables to explore (one change per iteration)
- lora_rank: try 8, 16, 32
- learning_rate: try 1e-4, 2e-4, 5e-4
- epochs: try 2, 3, 4
- lora_dropout: try 0.0, 0.05, 0.1
- target_modules: try ["q_proj","v_proj"] vs ["q_proj","v_proj","k_proj","o_proj"]

## Constraints
- Max 5 iterations
- Revert to previous best if val_bpb increases
- Stop when val_bpb ≤ 0.30 (= voice score ≥ 3.5) or iterations exhausted
```

## Step 3 — Prepare autoresearch entry points

autoresearch expects `train.py` at the project root and reads `val_bpb` (lower is better) from its stdout to track improvement. Create a root-level wrapper that runs training **and** the voice test, then prints the metric autoresearch reads:

```bash
# Create root-level train.py wrapper (training + voice test in one step)
cat > train.py << 'EOF'
"""autoresearch entry point: train → voice test → print val_bpb-compatible metric."""
import subprocess, sys, json, pathlib

meta_path = pathlib.Path("training/metadata.json")
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
slug_name = meta.get("slug", "persona")
adapter_path = f"models/{slug_name}/adapter_weights"
results_path = f"models/{slug_name}/voice_test_results.json"

# Read base model from training summary (written by train.py after each run)
# training_summary.json must contain "base_model" — set when running train.py --model {model_id}
summary_path = pathlib.Path(f"models/{slug_name}/training_summary.json")
base_model = ""
if summary_path.exists():
    try:
        base_model = json.loads(summary_path.read_text()).get("base_model", "")
    except Exception:
        pass
if not base_model:
    print("ERROR: base_model not found in training_summary.json.")
    print("  Re-run train.py with --model <your-hf-model-id> so it writes base_model to training_summary.json.")
    sys.exit(1)

# Step 1: run training
ret = subprocess.call([sys.executable, "scripts/train.py"] + sys.argv[1:])
if ret != 0:
    sys.exit(ret)

# Step 2: run voice test (with correct base model)
subprocess.call([
    sys.executable, "scripts/voice_test.py",
    "--model", adapter_path,
    "--base-model", base_model,
    "--profile", "training/profile.md",
    "--output", results_path,
])

# Step 3: print metric for autoresearch to read (inverted score = val_bpb style)
try:
    score = json.loads(pathlib.Path(results_path).read_text())["overall_score"]
    val_bpb = round(1.0 - score / 5.0, 4)   # 5.0 → 0.0 (best), 1.0 → 0.8 (worst)
    print(f"val_bpb {val_bpb}")
except Exception:
    print("val_bpb 1.0")  # signal failure
EOF

# Create root-level prepare.py wrapper (autoresearch setup step — idempotent check)
cat > prepare.py << 'EOF'
"""autoresearch entry point: verify training data is ready (idempotent — no args needed)."""
import pathlib, sys

prepared = pathlib.Path("training/prepared")
train_file = prepared / "train.jsonl"
if train_file.exists():
    count = sum(1 for _ in open(train_file))
    print(f"✅ training data ready: {count} samples in {train_file}")
    sys.exit(0)
else:
    print("❌ training/prepared/train.jsonl not found.")
    print("   Run Phase 4 first:")
    print("   python scripts/prepare_data.py --input training/conversations.jsonl --raw-dir training/raw/ --profile training/profile.md --output training/prepared/ --model {model_id}")
    sys.exit(1)
EOF
```

This makes autoresearch's built-in `val_bpb` tracking work correctly: a voice score of 5.0 maps to `val_bpb = 0.0` (best), 3.5 → `0.30`, 3.0 → `0.40`. autoresearch keeps iterations that lower `val_bpb`.

## Step 4 — Invoke autoresearch skill

> Read and follow the `autoresearch` skill from `.agents/skills/autoresearch/SKILL.md`.
> Let it drive the iteration loop: modify hyperparameters → run → evaluate → keep improvements.

**Important**: autoresearch modifies `train.py` at the root level. The root `train.py` is a thin wrapper — **hyperparameters live in `scripts/train.py`**. In `program.md`, add this constraint so autoresearch targets the right file:

```markdown
## Implementation note
Hyperparameters are in `scripts/train.py` (not the root train.py wrapper).
Modify `scripts/train.py` to change lora_rank, learning_rate, epochs, etc.
The root train.py runs training then voice_test and prints val_bpb to stdout.
```

The autoresearch skill will:

1. Read `program.md` to understand objective and constraints
2. Modify hyperparameters in `scripts/train.py` one variable at a time
3. Run `uv run train.py` — this trains, runs voice_test, and prints `val_bpb` to stdout
4. Keep if `val_bpb` decreased (= voice score improved), revert if not
5. Repeat up to 5 iterations or until `val_bpb ≤ 0.30` (= voice score ≥ 3.5)

## Step 5 — Return to main flow

Once autoresearch completes (score ≥ 3.5 or iterations exhausted):

- Record best configuration in `training_summary.json`
- Proceed to Phase 7 with the best checkpoint
