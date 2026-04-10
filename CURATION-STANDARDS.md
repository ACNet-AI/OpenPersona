# OpenPersona Pack Curation Standards

> **Internal document for ACNLabs curators.**
>
> This document defines the criteria for actively collecting persona/character skill packs
> from the market into the OpenPersona directory via `openpersona curate <owner/repo>`.

---

## Core Criteria (All Three Required)

A pack must satisfy **all three** of the following to be curated:

### 1. Persona / Character / Tool Type

The pack must fall into one of three categories:

- **`single`** — A single persona or character skill pack defining an AI agent's identity,
  personality, voice, or role (companion, fictional character, professional persona, brand voice, etc.)

- **`multi`** — A skill pack containing multiple personas or role-based characters
  (e.g. a team of agents, a collection of professional role modes like CEO/Designer/QA).
  Does not need to use OpenPersona's native `bundle.json` format — any multi-persona skill
  pack qualifies regardless of source format.

- **`tool`** — A persona-adjacent utility skill that generates, transforms, or augments
  personas but is not itself a persona (e.g. colleague-skill which distills a colleague
  into a persona, persona generators, digital-twin builders).

Examples that do **not** qualify:
- Generic code review / search / browser / calculator tools (no persona identity, not a persona tool)
- Data pipeline agents without a defined character or persona relationship
- General methodology / knowledge skill sets unrelated to persona creation or role-play

### 2. GitHub Stars ≥ 500

The repository must have **at least 500 GitHub stars** at the time of curation.

This threshold is the primary popularity signal. The CLI automatically checks star count
via the GitHub API and blocks curation for packs below the threshold.

To override in exceptional cases (e.g., high-quality newly released pack):
```bash
openpersona curate owner/repo --min-stars 100
```

### 3. Agent-Installable (Has SKILL.md)

The repository must contain a **`SKILL.md`** file at the root. This is the universal
skill pack format used by OpenClaw, Cursor, and 30+ agent runners. Its presence
confirms the pack can be installed and activated by an agent.

The CLI checks for SKILL.md on the `main` or `master` branch.

---

## Auto-Enforced Checks (CLI)

The `openpersona curate` command automatically enforces the three core criteria plus:

| Check | Requirement |
|---|---|
| Repo format | Valid `owner/repo` GitHub format |
| Curator token | `OPENPERSONA_CURATOR_TOKEN` present |
| Pack type | `--type` must be `single`, `multi`, or `tool` |
| **SKILL.md** | Present on `main`/`master` branch |
| **Stars** | `stargazers_count >= --min-stars` (default 500) |
| Bio length | `bio` / `description` ≥ 20 characters (when persona.json present) |
| Constitution | `boundaries` must not violate §3 Safety / §6 AI honesty (when persona.json present) |

Schema validation (persona.json format) applies only when the pack includes persona.json.
Packs with only SKILL.md (non-OpenPersona format) skip schema validation but still
require SKILL.md + 500 stars + type classification.

---

## Content Acceptability

Curators apply the following judgment beyond automated checks:

### Accept
- ✅ Well-maintained repo (active commits in the past 12 months)
- ✅ Clear persona identity with meaningful personality description
- ✅ Fictional character packs with proper attribution / fan-work disclosure
- ✅ Multi-persona collections (role modes, team bundles, character sets) in any format
- ✅ Persona-adjacent tools with meaningful relationship to the persona ecosystem

### Decline
- ❌ Generic utility tools with no persona/character/role identity (even with high star count)
- ❌ General knowledge / methodology packs unrelated to AI personas or role-play
- ❌ Packs impersonating real people without disclosure
- ❌ Abandoned repos (no commits in 2+ years, open issues unresolved)
- ❌ Packs that bypass safety constraints

---

## Tag Taxonomy

Use `--tags` to classify the pack. See full taxonomy:

**Role tags** (pick one): `companion` · `assistant` · `mentor` · `coach` · `character` · `brand` · `educator` · `therapist`

**Domain tags** (add relevant): `engineering` · `legal` · `medical` · `finance` · `creative` · `education` · `wellness` · `productivity` · `roleplay`

**Tool tags** (for `tool` type): `generator` · `persona-builder` · `digital-twin` · `transformer`

**System tags** (auto-applied): `curated` · `multi` · `tool`

---

## Curation Command

```bash
# Single persona pack
openpersona curate owner/repo \
  --type single \
  --tags character,roleplay \
  [--token <token>]

# Multi-persona / role collection
openpersona curate owner/repo \
  --type multi \
  --tags engineering,productivity

# Persona-adjacent tool
openpersona curate owner/repo \
  --type tool \
  --tags generator,persona-builder

# Override star threshold for exceptional cases
openpersona curate owner/repo \
  --type single \
  --tags companion,wellness \
  --min-stars 100
```

---

## Curation Log

Maintain a record in `acnlabs/persona-skills` (`CURATED.md`):

```markdown
| Date | Repo | Slug/Name | Stars | Type | Tags | Curator | Notes |
|------|------|-----------|-------|------|------|---------|-------|
| 2026-04-10 | SumeLabs/clawra | clawra | 2.2k | single | companion | @curator | OpenClaw companion |
| 2026-04-10 | titanwings/colleague-skill | colleague-skill | 12.6k | tool | generator,persona-builder | @curator | Distills colleagues into personas |
```
