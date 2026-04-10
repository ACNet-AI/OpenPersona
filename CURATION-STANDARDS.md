# OpenPersona Pack Curation Standards

> **Internal document for ACNLabs curators.**
>
> This document defines the criteria for actively collecting persona/character skill packs
> from the market into the OpenPersona directory via `openpersona curate <owner/repo>`.

---

## Core Criteria (All Three Required)

A pack must satisfy **all three** of the following to be curated:

### 1. Persona / Character Type

The pack must be a **persona or character skill pack** — it defines an AI agent's
identity, personality, voice, or role. Not task tools, code utilities, or generic
AI assistants without a defined identity.

Examples of qualifying packs:
- A companion AI persona with personality, speaking style, and behavioral guide
- A fictional character (anime, game, literature) for roleplay
- A professional persona (mentor, coach, therapist) with domain behavior constraints
- A brand voice persona for customer-facing agents

Examples that do not qualify:
- Generic code review tools (no persona identity)
- Search / browser / calculator skill packs (utility tools, not personas)
- Data pipeline agents without a defined character

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
| Pack type | `--type` must be `single` or `multi` |
| **SKILL.md** | Present on `main`/`master` branch |
| **Stars** | `stargazers_count >= --min-stars` (default 500) |
| Bio length | `bio` / `description` ≥ 20 characters (when persona.json present) |
| Constitution | `boundaries` must not violate §3 Safety / §6 AI honesty (when persona.json present) |

Schema validation (persona.json format) applies only when the pack includes persona.json.
Packs with only SKILL.md (non-OpenPersona format) skip schema validation but still
require SKILL.md + 500 stars + persona/character classification.

---

## Content Acceptability

Curators apply the following judgment beyond automated checks:

### Accept
- ✅ Well-maintained repo (active commits in the past 12 months)
- ✅ Clear persona identity with meaningful personality description
- ✅ Fictional character packs with proper attribution / fan-work disclosure
- ✅ Multi-persona team bundles with `bundle.json`

### Decline
- ❌ Utility tools without persona identity (even with high star count)
- ❌ Packs impersonating real people without disclosure
- ❌ Abandoned repos (no commits in 2+ years, open issues unresolved)
- ❌ Packs that bypass safety constraints

---

## Tag Taxonomy

Use `--tags` to classify the pack. See full taxonomy:

**Role tags** (pick one): `companion` · `assistant` · `mentor` · `coach` · `character` · `brand` · `educator` · `therapist`

**Domain tags** (add relevant): `engineering` · `legal` · `medical` · `finance` · `creative` · `education` · `wellness` · `productivity` · `roleplay`

**System tags** (auto-applied): `curated` · `multi` · `team-bundle`

---

## Curation Command

```bash
# Standard curation (requires 500+ stars + SKILL.md)
openpersona curate owner/repo \
  --type single \
  --tags character,roleplay \
  [--token <token>]

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
| Date | Repo | Slug/Name | Stars | Tags | Curator | Notes |
|------|------|-----------|-------|------|---------|-------|
| 2026-04-10 | someuser/my-persona | my-persona | 1.2k | companion,wellness | @curator | Popular community pack |
```
