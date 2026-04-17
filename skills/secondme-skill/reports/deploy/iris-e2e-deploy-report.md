# Deploy Acceptance Report — Iris E2E Test

**generated_at**: 2026-04-17T11:00:00Z  
**pipeline_stage**: integrate → report  
**runtime_pack**: `skills/secondme-skill/generated/persona-secondme-skill/`

## Gate results (run-gates.sh)

| Gate | Script | Result |
|---|---|---|
| Regenerate pack | `scripts/regenerate-pack.sh` | ✅ PASS |
| Sync check | `scripts/check-sync.sh` | ✅ PASS |
| Model integration | `scripts/check-model-integration.sh` | ✅ PASS |
| Publish check | `scripts/publish-check.sh` | ✅ PASS |

## Runtime pack contents

```
generated/persona-secondme-skill/
  persona.json          ← model entry 'secondme-skill-local-v-local-500' present
  SKILL.md
  acn-config.json
  agent-card.json
  model/
    adapter_weights/    ← adapters.safetensors + adapter_config.json
    training_summary.json
    RUNNING.md
  soul/
  scripts/
  references/
```

## Deployment recommendation

⚠️ **BLOCKED on probe_score** — do not deploy to production until probe_score ≥ 0.8.

To unblock:
1. Train adapter specifically on persona-specific data (e.g. `tests/iris/training/prepared/`)
2. Re-run `eval_probe.py` to verify probe_score ≥ 0.8
3. Re-run `run-gates.sh` to confirm all gates pass
4. Promote to release

## E2E pipeline smoke test summary

All orchestration stages executed successfully:

| Stage | Status |
|---|---|
| init (toolchain check) | ✅ |
| ingest (prepare_data.py) | ✅ |
| distill (fixture → 14 training samples) | ✅ |
| train (MLX, previously verified) | ✅ |
| eval — perplexity + voice | ✅ |
| eval — probe | ❌ (failure routing tested) |
| integrate (pack_integrate.py) | ✅ |
| gates (run-gates.sh all pass) | ✅ |

**Pipeline orchestration: VERIFIED**
