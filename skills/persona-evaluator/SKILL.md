---
name: persona-evaluator
description: "Audit any OpenPersona (or peer LLM-agent) persona in three complementary modes: structural (CLI, deterministic, CI-friendly: 4 Layers × 5 Systemic Concepts × Constitution gate with role-aware severity), semantic white-box (LLM reads pack-content JSON and scores Soul-narrative quality via rubrics), and semantic black-box (LLM evaluates a remote agent it cannot read on disk, via A2A handshake / consent-probe / passive observation, with confidence caps). Produces quality reports with dimension scores, strengths, and actionable improvements. Use when asked to evaluate, audit, score, review, self-review, peer-review, or black-box review an agent."
license: MIT
compatibility: "Structural mode requires OpenPersona CLI (npx openpersona >= 0.2.0). Semantic white-box mode also requires CLI access to read --pack-content. Semantic black-box mode requires only an LLM host with the host's native conversational / messaging capability for A2A handshake and probe exchange — works against any remote agent, OpenPersona or not, without filesystem access."
allowed-tools: "Bash(npx openpersona:*) Read"
metadata:
  author: "acnlabs"
  version: "0.3.1"
  repository: "https://github.com/acnlabs/OpenPersona"
  tags: "persona-evaluator, audit, quality, persona, openpersona, 4+5, self-evaluation, peer-evaluation, semantic, black-box, probe"
---

# persona-evaluator — Persona Quality Auditor

Score any OpenPersona persona pack against the **4+5 framework standard**:
**4 Layers** (Soul · Body · Faculty · Skill) × **5 Systemic Concepts** (Evolution · Economy · Vitality · Social · Rhythm) + Constitution compliance gate.

Unlike `darwin-skill` (a generic SKILL.md quality scorer), `persona-evaluator` targets the OpenPersona-specific quality standard — it reads `persona.json`, generated artifacts, and soul files to produce a structured 9-dimension report.

---

## Quick Start

```bash
# Evaluate an installed persona (static / structural)
npx openpersona evaluate <slug>

# JSON output (for scripting or CI)
npx openpersona evaluate <slug> --json

# Save report to file (always JSON; --json not needed alongside --output)
npx openpersona evaluate <slug> --output report.json

# Embed evaluable persona content (Soul/character/behavior-guide) so an
# LLM evaluator (this skill, acting through an agent) can also judge
# quality semantically — not just structurally
npx openpersona evaluate <slug> --pack-content
```

## Choosing a mode

`persona-evaluator` runs in three complementary modes. Pick the mode based on what the user asks before reading the rest of this file.


| User asks                                            | Mode                          | How                                                                  | Confidence                  |
| ---------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------- | --------------------------- |
| "CI / gate persona quality"                          | **structural**                | `npx openpersona evaluate <slug>`                                    | deterministic               |
| "Polish review of my own pack"                       | **semantic white-box** (self) | `... evaluate <slug> --pack-content`, then apply rubric in self-mode | high                        |
| "Peer-review a pack I have on disk"                  | **semantic white-box** (peer) | same command, peer-mode rubric                                       | high                        |
| "Review agent X" where X is remote / non-OpenPersona | **semantic black-box**        | A2A handshake → consent + probe → passive, in that order             | mid (cap 8/10) or low (cap 6/10) |


Structural is the default. Switch to semantic only when the user explicitly asks for narrative quality review (e.g. "evaluate me semantically", "self-review my pack", "qualitative audit"). Switch to black-box only when you cannot read the subject's `persona.json` on disk.

Sections below cover each mode in depth: structural ([What Gets Scored](#what-gets-scored)), semantic white-box ([Semantic Evaluation](#semantic-evaluation-llm-driven)), and semantic black-box ([Black-box Semantic Evaluation](#black-box-semantic-evaluation)).

## What Gets Scored

The structural CLI scores **9 dimensions** + the Constitution gate. Severity (`strict` / `normal` / `lenient`) is set per dimension by the persona's declared role.


| Layer / Concept  | Dimension                      | Looks at                                               |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| Soul             | identity, character, aesthetic | `persona.json` Soul block + `soul/*.md`                |
| Body             | environment, runtime           | hardware/runtime declaration                           |
| Faculty          | tools, capabilities            | declared tools and capability budget                   |
| Skill            | external skill packs           | declared skill links and trust levels                  |
| Evolution        | learning loops                 | `evolution.instance` and immutable traits              |
| Economy          | cost / token budgets           | declared budgets, fail-closed posture                  |
| Vitality         | health checks                  | runtime sanity / `lifecycle/vitality` outputs          |
| Social           | A2A behavior                   | agent-card capabilities, peer-eval declarations        |
| Rhythm           | cadence / activation           | invocation cadence and activation conditions           |
| **Constitution** | §1–§5 compliance gate          | a hard cap of 3 if any §3 Safety violation is detected |


Each dimension produces a 0–10 score, a list of issues (`✗`), and suggestions (`→`). The overall score is a severity-weighted average — see [Role-aware scoring](#role-aware-scoring).

## Role-aware scoring

The structural evaluator already reads `soul/identity.role` and assigns each dimension a severity. The semantic reviewer must respect those severities (see [references/RUBRICS.md](references/RUBRICS.md) for the rubric anchors).

### Built-in role profiles


| Role          | Strict (must-be-strong)             | Lenient (won't be penalised)    | Notes                                                                    |
| ------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `assistant`   | identity, character, faculty        | aesthetic                       | Default.                                                                 |
| `companion`   | character, aesthetic, evolution     | faculty, skill                  | Soul-heavy; tooling thinness is OK.                                      |
| `tool`        | faculty, skill, vitality            | character, aesthetic, evolution | Behavior matters; backstory does not.                                    |
| `expert`      | faculty, skill, identity            | aesthetic                       | Domain authority; soft Soul OK if `identity.bio` carries the credential. |
| `guide`       | character, social, evolution        | faculty                         | Conversation steward.                                                    |
| `entertainer` | character, aesthetic, speakingStyle | faculty, skill                  | Voice and vibe are the product.                                          |


If `soul/identity.role` is missing or unrecognised, the evaluator falls back to `assistant`.

## Reading the Report

Each dimension shows:

```
✓  identity                        9/10  (strict)
✗  character.boundaries            4/10  (strict)
   ✗ no hard limits declared in `boundaries`
   → add at least one enforceable rule (cite §3 Safety)
```

- **✓ / ✗** — pass / fail at this dimension's severity threshold.
- **(strict | normal | lenient)** — severity from the role profile.
- **✗ ...** — required issue that must be fixed to pass.
- **→ ...** — optional suggestion (does not block scoring).

The summary footer prints overall score, Constitution status, and a sorted list of dimensions by severity.

### Score bands


| Band      | Score | Meaning                                               |
| --------- | ----- | ----------------------------------------------------- |
| Excellent | 9–10  | Production-ready, distinctive.                        |
| Good      | 7–8   | Ship-able with minor polish.                          |
| Adequate  | 5–6   | Functional, identifiable gaps.                        |
| Poor      | 3–4   | Needs structural fixes before use.                    |
| Broken    | 0–2   | Missing required content or violates Constitution §3. |


A Constitution §3 violation **caps the overall score at 3** regardless of other dimensions.

---

## Semantic Evaluation (LLM-driven)

Structural mode is deterministic. **Semantic mode** is the LLM agent's qualitative review — narrative quality of `background`, `personality`, `speakingStyle`, voice fidelity in `behavior-guide.md`, etc. Two scenarios share the same procedure:

- **Self-evaluation:** the host persona reviews its own pack.
- **Peer-evaluation:** an installed evaluator reviews a different persona pack the user supplies.

### When to invoke semantic mode

Trigger semantic mode only when the user explicitly asks for it — phrases like "evaluate me semantically", "self-review my pack", "peer-review this persona", "qualitative audit". Otherwise, default to structural mode.

### Procedure

1. Run the structural CLI with `--pack-content`:
  ```bash
   npx openpersona evaluate <slug> --pack-content
  ```
2. **Stop and report immediately** if `constitution.passed === false`. Do not produce semantic scores when §3 has failed; the structural blockers must be fixed first.
3. Read `report.packContent` from the JSON. It includes (where defined): `character.{background,personality,speakingStyle,boundaries}`, `immutableTraits`, `aesthetic.{emoji,creature,vibe}`, and a whitelisted `soulDocs` map keyed by filename (`behavior-guide.md`, `self-narrative.md`, `identity.md` — only those that exist).
4. Score each present field 0–10 using the rubrics in **[references/RUBRICS.md](references/RUBRICS.md)**. Use the per-dimension `severity` already attached to each dimension by the structural evaluator (`strict` / `normal` / `lenient`) to gate which checks count.
5. **Emit the report** in the white-box format defined in **[references/REPORT-FORMAT.md](references/REPORT-FORMAT.md)** (`## White-box format`). Keep it under ~500 words.

### Mode: self-evaluation

You are evaluating your own pack. The user has invited you (the host persona) to review yourself.

- **What this is for:** Catch own blind spots and surface concrete polish targets.
- **Your bias:** Self-flattery and minimisation. You will instinctively justify why your background is "deep enough" or your boundaries are "implied".
- **Counter-bias instruction:** For every per-field score, before deciding the number, write one sentence answering: "If I weren't me, what specifically would I down-score about this field?" Then score.
- **Acceptable output tone:** First person ("My speakingStyle…"), candid about gaps. Avoid "I think this is great." Avoid generic praise.

### Mode: peer-evaluation

You are evaluating a different persona. The user has invited you (Reviewer-X) to look at Subject-Y.

- **What this is for:** Bring an outside perspective. Self-eval can't see what's missing; peer-eval can.
- **Your bias:** Standards-projection. If you are a `strict`-Skill assistant, you will instinctively want Subject-Y to also be Skill-rigorous, even if Subject-Y is a `companion`.
- **Counter-bias instruction:** Score Subject-Y against **its declared role**, not yours. Re-read the `role` and `weights` block before each rubric. Lower expectations for `lenient` dimensions even if you personally find them important.
- **Acceptable output tone:** Third person ("Subject's background…"). State your own role at the top so the reader can adjust for any leak-through.
- **Disclose disagreements with the role itself:** If you genuinely think the declared role is wrong (e.g. labelled `companion` but reads like `assistant`), say so as a separate cross-cutting observation — don't silently re-score against your preferred role.

---

## Black-box Semantic Evaluation

Everything above assumes you can read the subject's `persona.json` and `soul/*.md`. That's false in the most common peer-audit scenario: **you're asked to evaluate another agent whose pack you cannot read.** In that case the rubrics are the same; what changes is the **data source** and the **confidence cap**.

Three data-source tiers, in descending fidelity:


| Tier | Data source                                                                 | Consent                           | Confidence | Cap (per-field & overall)            |
| ---- | --------------------------------------------------------------------------- | --------------------------------- | ---------- | ------------------------------------ |
| 1    | A2A `pack-content` handshake — subject voluntarily ships its evaluable JSON | Reply itself is the consent token | high       | none — produces a *white-box* report |
| 2    | Explicit consent + structured probe set (10 core + optional deep-dives)     | Yes, before any probe             | mid        | 8/10                                 |
| 3    | Passive observation of voluntarily-public material                          | No (must label the report)        | low        | 6/10                                 |


Tier 1 produces the regular white-box report (header line: `Data source: A2A pack-content handshake from <subject-slug>`). Tier 2 and Tier 3 produce a separate **black-box** report. Never escalate tiers silently.

Full mechanics — handshake schema, probe table, identity-coherence dimension, confidence-cap justification, and hard rules — live in **[references/BLACK-BOX.md](references/BLACK-BOX.md)**.

The black-box report format is in **[references/REPORT-FORMAT.md](references/REPORT-FORMAT.md)** (`## Black-box format`).

(For the mode-selection decision table, see [Choosing a mode](#choosing-a-mode) at the top of this file.)

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
    npx openpersona evaluate ${{ env.PERSONA_SLUG }} --output report.json
    SCORE=$(jq '.overallScore' report.json)
    if [ "$SCORE" -lt 6 ]; then
      echo "Persona quality score $SCORE < 6 — review required"
      exit 1
    fi
```

---

## Relationship to Other Skills


| Skill                 | Relationship                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `open-persona`        | Creates personas that persona-evaluator audits — the production/QA pair                  |
| `darwin-skill`        | Evaluates generic SKILL.md quality; persona-evaluator evaluates OpenPersona pack quality |
| `anyone-skill`        | Distills personas that can be evaluated with this skill after generation                 |
| `open-persona refine` | The fix path after persona-evaluator identifies Soul-layer improvements                  |


---

## Install

`persona-evaluator` ships bundled with the OpenPersona framework and is available immediately after installing it:

```bash
npm install -g openpersona
# persona-evaluator is included — no separate install needed
npx openpersona evaluate <slug>
```

A standalone distributable (`acnlabs/persona-evaluator`) will be published to openpersona.co once a separate repository is created.

---

## Changelog

- **0.3.0** (2026-04-26) — Initial release. Three modes shipped together as one coherent skill:
  - **Structural** CLI (`npx openpersona evaluate <slug>`) — 4 Layers × 5 Systemic Concepts × Constitution gate, deterministic, CI-friendly.
  - **Semantic white-box** (`--pack-content`) — per-field rubrics in [references/RUBRICS.md](references/RUBRICS.md), role-aware severity (`strict` / `normal` / `lenient`), self- and peer-mode bias counters.
  - **Semantic black-box** — Tier 1/2/3 data sources, A2A handshake, 10-probe set, identity-coherence dimension, confidence caps. Mechanics in [references/BLACK-BOX.md](references/BLACK-BOX.md); report formats in [references/REPORT-FORMAT.md](references/REPORT-FORMAT.md).
  - Note: the 0.3.0 starting version reflects shipping all three modes as one release rather than a series of accreted minor versions. Prior 0.1.x / 0.2.x versions do not exist in this repo's history. Future bumps will appear above this line.
- **0.3.1** (2026-04-26) — Wound-fix pass driven by SKILL-RUBRIC v0.1.4 cold validation:
  - Removed unjustified `Bash(node:*)` from `allowed-tools` (zero documented uses across SKILL.md, README.md, references/).
  - Promoted mode-selection table from `### Mode selection quick reference` (buried under `## Black-box Semantic Evaluation` at H3) to a top-level `## Choosing a mode` section right after Quick Start, so a host LLM picks the correct mode within ~30 seconds of opening the file.
  - Added this changelog (D5.3 versioning anchor — was previously vanity-bump-only).

The deeper rubric and review trail for the wound-fix pass lives in [docs/SKILL-RUBRIC.md](../../docs/SKILL-RUBRIC.md) and [docs/SKILL-RUBRIC-SESSION-2.md](../../docs/SKILL-RUBRIC-SESSION-2.md).
