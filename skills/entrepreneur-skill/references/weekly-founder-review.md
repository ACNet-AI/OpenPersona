# weekly-founder-review

## Use when

- End of each weekly cycle.
- Deciding continue, stop, or pivot for active initiatives.

## Inputs

- North-star metric trend
- Experiment outcomes from the week
- Customer evidence collected
- Resource burn summary (time, cost, people)
- Governance status (critical boundary violation: yes/no)

## Steps

1. Compare outcomes against pre-defined acceptance criteria.
2. Separate signal from noise (one-off events vs repeatable effects).
3. Decide continue, stop, or pivot for each initiative.
4. Define next week's single north-star target.
5. Log decisions and rationale for traceability.

## Output template

```md
Week:
North-star target:
Result:

Initiative decisions:
- [Initiative A]: Continue | Stop | Pivot (why)
- [Initiative B]: Continue | Stop | Pivot (why)

Key risks:
Next week focus:
Owner:
```

## Acceptance criteria

- Every active initiative gets an explicit decision.
- Decision rationale cites evidence, not opinion alone.
- Next-week target is singular and measurable.

## Automation

Use the included script to generate a weekly report from structured metrics:

```bash
python scripts/weekly_founder_review.py \
  --input references/weekly-review.input.example.json \
  --output reports/weekly-review-YYYY-WW.md
```

Metric contract and threshold definitions are documented in `references/metrics-baseline.md`.

If `governance_violation=true`, the system recommendation must be `STOP` regardless of KPI performance.

