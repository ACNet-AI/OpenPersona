# Data Acceptance Report — Iris E2E Test

**generated_at**: 2026-04-17T11:00:00Z  
**pipeline_stage**: ingest → distill  
**dataset_version**: v1  
**test_subject**: iris (synthetic AI researcher)

## Source inventory

| Source | Type | Turns |
|---|---|---|
| `tests/iris/training/raw/iris-notes.txt` | monologue / blog | 12 |
| `tests/iris/training/conversations.jsonl` | structured Q&A | 20 |

**Total turns**: 32 (16 assistant-role)  
**Prepared samples**: 16 → split: 14 train / 2 eval  
**Composition**: 38% authentic voice + 62% distilled

## PII scan
No PII patterns detected in synthetic fixture data.

## Data gate
- Minimum assistant-role turns (≥ 10): **PASS** (16)
- Profile.md present: **PASS**
- Probes.json present (5 probes): **PASS**

## Notes
⚠️ Sample count (16) is below recommended minimum (50). Sufficient for smoke test; production use requires more source material.

**Result: PASS (smoke test)**
