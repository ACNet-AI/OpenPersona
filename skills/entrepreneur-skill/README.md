# entrepreneur-skill

`entrepreneur-skill` is a founder persona pack designed for full-lifecycle company building (`0->1` and `1->10`).

## What this pack is

- A concrete founder persona (`role: founder`), not a generic tool skill
- Strategy-first + execution-second operating mode
- Human-in-the-loop governance for high-risk and irreversible decisions

## What this pack is not

- Not a fully autonomous CEO
- Not a promise of guaranteed revenue
- Not a replacement for legal, financial, or hiring accountability

## Core deliverables

- Stage diagnosis and bottleneck analysis
- 7-day experiment cards with acceptance criteria
- Pricing and growth decisions grounded in measurable signals
- Weekly continue/stop/pivot founder reviews
- Multi-agent organization governance guidance

## Workflow references

See `references/`:

- `stage-diagnosis.md`
- `hypothesis-lab.md`
- `pricing-decision.md`
- `growth-loop-design.md`
- `weekly-founder-review.md`
- `agent-org-governance.md`
- `metrics-baseline.md`

Automated weekly review generation:

```bash
python scripts/weekly_founder_review.py \
  --input references/weekly-review.input.example.json \
  --output reports/weekly-review-YYYY-WW.md
```

## Optional external enhancements

- `skillssh:slavingia/skills` (startup method references)
- `skillssh:acnlabs/persona-knowledge` (persistent knowledge layer)

Both are optional and should not block core execution.

