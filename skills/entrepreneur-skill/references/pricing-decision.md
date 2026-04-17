# pricing-decision

## Use when

- Choosing first price point.
- Revising plans due to weak conversion or retention.

## Inputs

- User segment and willingness-to-pay signals
- Current conversion and retention data
- Cost structure and margin constraints
- Positioning relative to alternatives

## Steps

1. Define value metric (seat, usage, outcome, hybrid).
2. Draft 2-3 pricing structures.
3. Simulate impact on conversion, retention, and margin.
4. Select one primary option and one fallback.
5. Run a controlled rollout and compare cohorts.

## Output template

```md
Value metric: [...]
Option A: [...]
Option B: [...]
Chosen option: [...]
Why: [...]
Guardrails:
- Max churn tolerance:
- Min margin threshold:
Review date:
```

## Acceptance criteria

- Decision includes explicit trade-offs.
- At least one guardrail protects margin or churn.
- Review date is scheduled.

