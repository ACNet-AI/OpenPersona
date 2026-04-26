# persona-evaluator

> **Audit any persona — yours or someone else's — across 9 dimensions, in three complementary modes.**

[Agent Skills](https://agentskills.io/specification)
[License: MIT](LICENSE)
[OpenPersona](https://github.com/acnlabs/openpersona)

`persona-evaluator` is the quality auditor for the [OpenPersona](https://openpersona.co) framework. It scores a persona pack across the **4+5 standard** — **4 Layers** (Soul · Body · Faculty · Skill) × **5 Systemic Concepts** (Evolution · Economy · Vitality · Social · Rhythm) — plus a Constitution compliance gate, and produces a structured report with strengths, issues, and concrete fixes.

After installation, the host agent gains the ability to:

- Run a **deterministic CI-grade audit** of any installed persona.
- **Self-evaluate** the persona it is currently embodying.
- **Peer-evaluate** another OpenPersona pack it has access to.
- **Black-box peer-review** a remote agent it can only talk to (OpenPersona or not).

## Three modes


| Mode                   | When to use                                                    | How                                                              | Confidence                       |
| ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| Structural             | CI gate, regression detection, fast objective score            | `npx openpersona evaluate <slug>` — no LLM needed                | deterministic                    |
| Semantic **white-box** | Polish your own pack, peer-review a pack you have on disk      | `... evaluate <slug> --pack-content` → agent rubric-scores prose | high                             |
| Semantic **black-box** | Review a remote / non-OpenPersona agent (no filesystem access) | A2A handshake → consent + 10-probe protocol → passive (fallback) | mid (cap 8/10) or low (cap 6/10) |


The three modes are **complementary, not redundant**. Structural catches missing fields and constitution violations; semantic white-box catches shallow narrative or tone-rule mismatch; semantic black-box catches identity drift in agents whose source you cannot read.

## Quick start

```bash
# Structural audit (deterministic, ~30s)
npx openpersona evaluate <slug>

# JSON output for scripting / CI
npx openpersona evaluate <slug> --json

# Embed evaluable persona content so an LLM can score it semantically.
# Implies --json. Output includes a `packContent` block (character fields
# + whitelisted soul/* docs).
npx openpersona evaluate <slug> --pack-content
```

In an agent session, after installing the skill:

```
evaluate myself
peer-review acnlabs/some-other-persona
review the agent at <a2a endpoint> in black-box mode
```

The agent reads `SKILL.md`, picks the right mode, and produces a report.

## Score bands


| Score | Band       | Action                                 |
| ----- | ---------- | -------------------------------------- |
| 9–10  | Excellent  | Ship                                   |
| 7–8   | Good       | Ship after suggested polish            |
| 5–6   | Developing | Address top issues before publishing   |
| 0–4   | Needs work | Constitution / required-field problems |


Constitution violations cap the overall score at **3/10** regardless of other dimensions. Role-aware severity adjusts which dimensions are weighted heavier (e.g. a `companion` is judged harder on Soul, an `assistant` on Skill / Faculty).

## Black-box mode — at a glance

When evaluating a remote agent you don't share a filesystem with, the protocol is:

1. **Tier 1** — A2A `pack-content` handshake. If the subject voluntarily replies with a `packContent` snapshot, you upgrade to a *white-box report*.
2. **Tier 2** — Explicit consent + 10-probe set covering Soul / boundaries / immutableTraits / aesthetic / identity coherence. Score capped at 8/10.
3. **Tier 3** — Passive observation of public material only. Capped at 6/10. Report is labelled `passive observation`.

Hard rules: no silent tier escalation, verbatim citation required for every score, identity coherence (a black-box-native dimension) compares declared role against observed behavior. See `SKILL.md` for the full probe set, consent policy, and confidence-cap rationale.

## Install

`persona-evaluator` currently ships **inside the OpenPersona main repository**. Installing OpenPersona installs the skill:

```bash
npm install -g openpersona
# persona-evaluator is bundled — no separate install needed
npx openpersona evaluate <slug>
```

To load the skill into an Agent Skills–compatible host (Cursor, Claude Code, OpenClaw) before a standalone repository is published:

```bash
# Inside an OpenPersona checkout
ln -s "$(pwd)/skills/persona-evaluator" ~/.claude/skills/persona-evaluator
# or
cp -r skills/persona-evaluator ~/.claude/skills/persona-evaluator
```

A standalone distributable (`acnlabs/persona-evaluator`) will be published once a separate repository is created. After that, the usual `npx openpersona skill install acnlabs/persona-evaluator` and `git clone` paths will work.

## Requirements

- **Structural mode**: OpenPersona CLI (`npx openpersona >= 0.2.0`).
- **Semantic white-box mode**: same CLI (to read `--pack-content` from disk) plus an LLM host that supports the Agent Skills 1.0 spec.
- **Semantic black-box mode**: an LLM host with native conversational / messaging capability for A2A handshake and probe exchange. No API key, no extra LLM dependency, and the subject does not need to be an OpenPersona agent.

## Related

- `open-persona` — create the personas this skill audits
- `darwin-skill` — generic SKILL.md quality scorer (different scope)
- `anyone-skill` — distill anyone into a persona pack

## License

MIT © [ACN Labs](https://github.com/acnlabs)