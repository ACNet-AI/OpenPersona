---
name: evaluator-skill
version: 0.1.0
description: "Score any OpenPersona persona pack across 4 Layers + 5 Systemic Concepts. Produces a quality report with dimension scores, constitution compliance, strengths, and actionable improvement recommendations. Use when asked to evaluate, audit, score, or review an OpenPersona persona."
license: MIT
compatibility: "Requires OpenPersona CLI (npx openpersona). Works with any installed persona pack."
allowed-tools: Read Bash
metadata:
  author: acnlabs
  repository: "https://github.com/acnlabs/OpenPersona"
  tags: "evaluator, audit, quality, persona, openPersona, 4+5"
---

# evaluator-skill — Persona Quality Auditor

Score any OpenPersona persona pack against the **4+5 framework standard**:
**4 Layers** (Soul · Body · Faculty · Skill) × **5 Systemic Concepts** (Evolution · Economy · Vitality · Social · Rhythm) + Constitution compliance gate.

Unlike [darwin-skill](https://openpersona.co/skill/darwin-skill) (which scores generic SKILL.md content), evaluator-skill targets the OpenPersona-specific quality standard — it reads `persona.json`, generated artifacts, and soul files to produce a structured 9-dimension report.

---

## Quick Start

```bash
# Evaluate an installed persona
npx openpersona evaluate <slug>

# JSON output (for scripting or CI)
npx openpersona evaluate <slug> --json

# Save report to file
npx openpersona evaluate <slug> --json --output report.json
```

---

## What Gets Scored

| Dimension | What It Measures | Key Signals |
|-----------|-----------------|-------------|
| **Soul** | Identity depth and constraint quality | Required fields, background depth, boundaries, aesthetic |
| **Body** | Runtime substrate and nervous system | `state-sync.js`, framework, modalities, channels |
| **Faculty** | Persistent capability coverage | memory (baseline), expression, sense dimensions |
| **Skill** | On-demand action portfolio and trust policy | Skill declarations, trust levels, `minTrustLevel` gate |
| **Evolution** | Growth governance completeness | `instance.enabled`, `immutableTraits`, formality bounds |
| **Economy** | Financial awareness (optional) | Declared = scored; absent = neutral 5/10 |
| **Vitality** | Health scoring configuration (optional) | Weights, multi-dimension coverage |
| **Social** | ACN discoverability and A2A readiness | `agent-card.json`, `acn-config.json`, contacts |
| **Rhythm** | Time-aware behavior (optional) | Heartbeat strategy, circadian schedule |

**Score bands:** 0–4 Needs Work · 5–6 Developing · 7–8 Good · 9–10 Excellent

**Constitution gate:** Any §3 Safety violation in `soul/behavior-guide.md`, `soul/constitution.md`, or `SKILL.md` caps the overall score at 3/10 regardless of dimension scores.

---

## Reading the Report

```
  ┌─ OpenPersona Evaluation: secondme ────────────────────
  │  Overall Score: 7/10  [Good]
  │  ✓ Constitution: PASSED
  └────────────────────────────────────────────────────────

  Soul:        ████████░░ 8/10
  Body:        ███████░░░ 7/10
  Faculty:     ██████░░░░ 6/10
               → No expression faculty (voice/avatar) — text-only output
  Skill:       █████░░░░░ 5/10
               ✗ evolution.skill.minTrustLevel not set — Skill Trust Gate inactive
  Evolution:   ████████░░ 8/10
  Economy:     █████░░░░░ 5/10 (not declared)
  Vitality:    █████░░░░░ 5/10 (not declared)
  Social:      ██████████ 10/10
  Rhythm:      █████░░░░░ 5/10 (not declared)

  Strengths: Soul, Evolution, Social
  Needs Work: Skill
```

**✗ Issue** — Something is missing or broken that materially reduces quality.  
**→ Suggestion** — An optional improvement that would raise the score.  
**(not declared)** — An optional systemic concept that was not configured; scored neutrally.

---

## Acting on Findings

### Fix §3 violations first
Constitution violations are hard blocks — they cap the score at 3 regardless of everything else. Open `soul/behavior-guide.md` and remove any capability declarations that violate §3 Safety.

### Fix issues before suggestions
Issues (✗) indicate missing required elements or broken configurations. Suggestions (→) are optional enhancements. Prioritize issues in low-scoring dimensions.

### Apply fixes via refine
For Soul-layer fixes (background depth, speaking style, boundaries):

```bash
npx openpersona refine <slug> --emit    # request refinement via Signal Protocol
# (host LLM generates improvements)
npx openpersona refine <slug> --apply   # apply approved refinement
```

For structural fixes (missing faculty, missing minTrustLevel):
Edit `persona.json` directly and regenerate:

```bash
npx openpersona update <slug>           # regenerate from updated persona.json
```

### Re-evaluate after fixes
```bash
npx openpersona evaluate <slug>
```

---

## CI Integration

```yaml
# .github/workflows/persona-quality.yml
- name: Evaluate persona quality
  run: |
    npx openpersona evaluate ${{ env.PERSONA_SLUG }} --json --output report.json
    SCORE=$(jq '.overallScore' report.json)
    if [ "$SCORE" -lt 6 ]; then
      echo "Persona quality score $SCORE < 6 — review required"
      exit 1
    fi
```

---

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `open-persona` | Creates personas that evaluator-skill audits — the production/QA pair |
| `darwin-skill` | Evaluates generic SKILL.md quality; evaluator-skill evaluates OpenPersona pack quality |
| `anyone-skill` | Distills personas that can be evaluated with this skill after generation |
| `open-persona refine` | The fix path after evaluator-skill identifies Soul-layer improvements |

---

## Install

evaluator-skill ships bundled with the OpenPersona framework and is available immediately after installing it:

```bash
npm install -g openpersona
# evaluator-skill is included — no separate install needed
npx openpersona evaluate <slug>
```

A standalone distributable (`acnlabs/evaluator-skill`) will be published to openpersona.co once a separate repository is created.
