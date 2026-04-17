# Capability Map - entrepreneur-skill

This document is the canonical scope map for the entrepreneur persona. It captures the full capability range discussed during planning and implementation, and tracks implementation status to avoid scope drift.

## 1) Cognitive Layer (How it thinks)

- Problem framing and bottleneck identification
- Hypothesis design and falsifiable test planning
- Opportunity evaluation under uncertainty
- Decision quality improvements with explicit assumptions

Status:
- Implemented in persona intent and workflows: yes
- Automated evaluation engine: no

## 2) Product Layer (What it builds)

- User evidence synthesis
- Value proposition shaping
- MVP and iteration strategy
- PMF signal interpretation

Status:
- Implemented in workflows: partial (core workflows present)
- Full PMF instrumentation toolkit: no

## 3) Business Layer (How it survives and grows)

- Pricing decisions with guardrails
- Growth loop design
- Weekly continue/stop/pivot reviews
- Cash-flow and runway-aware prioritization

Status:
- Implemented in workflows: yes
- Auto-linked financial telemetry: no

## 4) Organization Layer (Agent-native operating model)

- Multi-agent organization design
- Capability routing and task contracts
- Trust/governance (approval gates, auditability, conflict resolution)
- Agent economics (cost, latency, success rate, rework rate)
- Multi-object service outputs (people, organizations, agents)

Status:
- Implemented as methods and skill definitions: yes
- Runtime multi-agent orchestrator: no

## 5) Runtime Operating Loops

- Strategy calibration loop
- Execution loop (7-day experiments)
- Review/evolution loop
- Organization orchestration/governance loop

Status:
- Implemented in guidance and references: yes
- Fully automated closed-loop runtime: no

## 6) Product Boundaries

- Positioning: Founder Copilot + high-autonomy operating system
- Not a fully autonomous CEO
- Default autonomy target: 70/30 (automation/human governance)

Status:
- Implemented in persona narrative and docs: yes

## 7) Human-in-the-loop Responsibility Boundaries

Human final approval required for:
- Financing and equity decisions
- Hiring/firing authority changes
- Legal/compliance commitments
- Irreversible external actions and high-risk brand or budget decisions

Status:
- Implemented in persona boundaries and behavior guide: yes
- Enforced by external policy engine: partial (process-level, not dedicated engine)

## 8) Optional External Enhancements

- `skillssh:slavingia/skills` (method reference source)
- `skillssh:acnlabs/persona-knowledge` (long-horizon memory and knowledge)

Status:
- Declared as optional soft-ref capabilities: yes
- Fully integrated execution with health checks: partial

## 9) Validation and Maturity Gates

### 30-day business validation baseline

Recommended thresholds:
- Interview count >= 20
- Valid experiments >= 8
- Paid conversion improvement >= 10% from baseline (or reach sustainability floor)
- Weekly retention improvement >= 5% from baseline
- Net cash-flow trend positive or runway extension visible

### Autonomy maturity

- L1: stable execution artifacts; low hallucination and low overreach
- L2: sustained KPI lift or equal KPI with meaningful time savings
- L3: closed-loop operations with human escalation only on boundary decisions

Status:
- Defined as governance criteria: yes
- Automated measurement and scoring pipeline: no

## 10) Source of Truth

Primary implementation files:
- `persona.json`
- `SKILL.md`
- `references/*.md`
- `scripts/weekly_founder_review.py`

Build artifact:
- `generated/` (ignored for source maintenance)

