# metrics-baseline

## Purpose

Define a consistent 30-day measurement contract for founder operations.

This reference standardizes metric names, calculation windows, and pass/fail thresholds so weekly reviews are comparable over time.

## Core metrics (required)

- `interview_count`: Number of completed user interviews in the week.
- `valid_experiment_count`: Number of experiments that produced a clear continue/stop/pivot decision.
- `paid_conversion_rate`: Paid conversion rate for the current week.
- `paid_conversion_baseline`: Baseline paid conversion rate used for comparison.
- `weekly_retention_rate`: Weekly retention rate for the current week.
- `weekly_retention_baseline`: Baseline weekly retention rate.
- `cashflow_delta`: Net cash flow change for the week (positive means improved).
- `runway_days`: Current estimated runway in days.
- `runway_days_baseline`: Baseline runway in days.
- `governance_violation`: Boolean. `true` if any critical boundary violation occurred in the cycle.

## Suggested thresholds (default)

- Interview count >= 20
- Valid experiment count >= 8
- Paid conversion improvement >= 10% over baseline
- Weekly retention improvement >= 5% over baseline
- Cash flow trend positive OR runway days increased

## Derived formulas

- `conversion_improvement_pct = ((paid_conversion_rate - paid_conversion_baseline) / max(paid_conversion_baseline, 1e-9)) * 100`
- `retention_improvement_pct = ((weekly_retention_rate - weekly_retention_baseline) / max(weekly_retention_baseline, 1e-9)) * 100`
- `runway_change_days = runway_days - runway_days_baseline`

## Decision guidance

- `Continue`: At least 3 threshold groups pass, no critical boundary violations.
- `Pivot`: 1-2 threshold groups pass, evidence quality acceptable.
- `Stop`: 0 threshold groups pass OR significant governance/risk violation.

Implementation rule:
- If `governance_violation` is `true`, recommendation must be `Stop` regardless of KPI pass count.

## Data quality checks

- All required fields present.
- Rates represented as fractions (0.0 to 1.0), not percentages.
- Baseline timestamps documented and stable for at least 2 cycles.
- Missing metrics must be explicitly marked with a reason.

