#!/usr/bin/env python3
"""
Generate weekly founder review markdown from metric input JSON.

Usage:
  python scripts/weekly_founder_review.py \
    --input references/weekly-review.input.example.json \
    --output reports/weekly-review-2026-W16.md
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def pct_improvement(current: float, baseline: float) -> float:
    if baseline == 0:
        return 0.0
    return ((current - baseline) / baseline) * 100.0


def decide(pass_count: int, governance_violation: bool) -> str:
    if governance_violation:
        return "stop"
    if pass_count >= 3:
        return "continue"
    if pass_count >= 1:
        return "pivot"
    return "stop"


def format_pct(value: float) -> str:
    return f"{value:.2f}%"


def load_input(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _require_fields(data: dict, fields: list[str]) -> None:
    missing = [f for f in fields if f not in data]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")


def _require_fraction(name: str, value: Any) -> None:
    try:
        v = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a numeric fraction in [0, 1]") from exc
    if v < 0 or v > 1:
        raise ValueError(f"{name} must be a fraction in [0, 1], got {value}")


def validate_input(data: dict) -> None:
    required = [
        "week_label",
        "owner",
        "north_star_target",
        "interview_count",
        "valid_experiment_count",
        "paid_conversion_rate",
        "paid_conversion_baseline",
        "weekly_retention_rate",
        "weekly_retention_baseline",
        "cashflow_delta",
        "runway_days",
        "runway_days_baseline",
    ]
    _require_fields(data, required)

    _require_fraction("paid_conversion_rate", data["paid_conversion_rate"])
    _require_fraction("paid_conversion_baseline", data["paid_conversion_baseline"])
    _require_fraction("weekly_retention_rate", data["weekly_retention_rate"])
    _require_fraction("weekly_retention_baseline", data["weekly_retention_baseline"])

    initiatives = data.get("initiatives", [])
    if not isinstance(initiatives, list):
        raise ValueError("initiatives must be an array")
    for item in initiatives:
        if not isinstance(item, dict):
            raise ValueError("each initiative entry must be an object")
        if "decision" in item:
            decision = str(item["decision"]).lower()
            if decision not in {"continue", "pivot", "stop"}:
                raise ValueError(
                    f"initiative decision must be continue/pivot/stop, got {item['decision']}"
                )


def build_report(data: dict) -> str:
    conversion_impr = pct_improvement(
        float(data["paid_conversion_rate"]),
        float(data["paid_conversion_baseline"]),
    )
    retention_impr = pct_improvement(
        float(data["weekly_retention_rate"]),
        float(data["weekly_retention_baseline"]),
    )
    runway_change = float(data["runway_days"]) - float(data["runway_days_baseline"])

    checks = [
        ("Interview count >= 20", float(data["interview_count"]) >= 20),
        ("Valid experiment count >= 8", float(data["valid_experiment_count"]) >= 8),
        ("Conversion improvement >= 10%", conversion_impr >= 10.0),
        ("Retention improvement >= 5%", retention_impr >= 5.0),
        (
            "Cash flow positive or runway increased",
            float(data["cashflow_delta"]) > 0 or runway_change > 0,
        ),
    ]

    pass_count = sum(1 for _, ok in checks if ok)
    governance_violation = bool(data.get("governance_violation", False))
    recommendation = decide(pass_count, governance_violation)

    initiatives = data.get("initiatives", [])
    risks = data.get("key_risks", [])

    lines = [
        f"# Weekly Founder Review - {data.get('week_label', 'N/A')}",
        "",
        f"- Owner: {data.get('owner', 'N/A')}",
        f"- North-star target: {data.get('north_star_target', 'N/A')}",
        "",
        "## KPI snapshot",
        "",
        f"- Interview count: {data['interview_count']}",
        f"- Valid experiments: {data['valid_experiment_count']}",
        f"- Paid conversion: {format_pct(float(data['paid_conversion_rate']) * 100)} (baseline {format_pct(float(data['paid_conversion_baseline']) * 100)})",
        f"- Conversion improvement: {format_pct(conversion_impr)}",
        f"- Weekly retention: {format_pct(float(data['weekly_retention_rate']) * 100)} (baseline {format_pct(float(data['weekly_retention_baseline']) * 100)})",
        f"- Retention improvement: {format_pct(retention_impr)}",
        f"- Cash flow delta: {data['cashflow_delta']}",
        f"- Runway days: {data['runway_days']} (baseline {data['runway_days_baseline']}, delta {runway_change:+.0f})",
        "",
        "## Threshold checks",
        "",
    ]

    for name, ok in checks:
        status = "PASS" if ok else "FAIL"
        lines.append(f"- [{status}] {name}")

    lines.extend(
        [
            "",
            f"Pass count: {pass_count}/5",
            f"Governance violation: {'YES' if governance_violation else 'NO'}",
            f"System recommendation: **{recommendation.upper()}**",
            "",
            "## Initiative decisions",
            "",
        ]
    )

    if initiatives:
        for item in initiatives:
            lines.append(
                f"- {item.get('name', 'N/A')}: {item.get('decision', 'n/a').upper()} - {item.get('reason', '')}"
            )
    else:
        lines.append("- No initiatives provided.")

    lines.extend(["", "## Key risks", ""])
    if risks:
        for risk in risks:
            lines.append(f"- {risk}")
    else:
        lines.append("- No risks provided.")

    lines.extend(
        [
            "",
            "## Next week focus",
            "",
            data.get("next_week_focus", "N/A"),
            "",
        ]
    )

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate weekly founder review markdown.")
    parser.add_argument("--input", required=True, help="Path to input JSON file")
    parser.add_argument("--output", required=True, help="Path to output markdown file")
    args = parser.parse_args()

    data = load_input(Path(args.input))
    validate_input(data)
    report = build_report(data)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report + "\n", encoding="utf-8")
    print(f"Generated report: {output_path}")


if __name__ == "__main__":
    main()
