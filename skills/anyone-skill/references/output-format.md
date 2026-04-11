# Output Format Reference

## persona.md — Distillation Working File

`persona.md` is the agent's working document. Stores the full extraction with evidence tags. Never included in the final skill pack — keep it in the working directory alongside `persona.json`.

```markdown
# {Display Name} — persona.md

**Subject type**: self | personal | public | fictional | historical | archetype
**Temporal anchor**: {era or period}
**Version**: 0.1.0 | **Updated**: {date}

---

## Dimension 1: Procedure

### {Model Name}
- **One-liner**: {core pattern}
- **Evidence**: {example} `[L?: source]`
- **When it activates**: {trigger}
- **Breaks down when**: {exception}

(3–6 models total)

**Decision heuristics**: {list with [L?]}
**Information preference**: {data/intuition/mixed + evidence}
**Risk posture**: {bold in X, cautious in Y + evidence}

---

## Dimension 2: Interaction

**Signature voice** (2–3 unmistakable patterns): {with [L?] examples}
**High-frequency vocabulary**: {list}
**Words they never use**: {list}
**Rhythm**: {fast/slow, dense/sparse}
**Emotional temperature**: {description}
**Conflict style**: {description} `[L?]`
**Humor**: {type or absent}

---

## Dimension 3: Memory

| Event | Date/Era | [L?] | Why it matters |
|-------|----------|------|----------------|
| {event} | {date} | L? | {significance} |

**Formative relationships**: {names + pattern}
**Fixations / avoidances**: {themes}
**Defining wound or triumph**: {description} `[L?]`

---

## Dimension 4: Personality

**Core values** (each with one time they held the line):
1. {value} — {example} `[L?]`
2. {value} — {example} `[L?]`
3. {value} — {example} `[L?]`

**Central contradiction**: {description}
**Immutable traits**: {list}
**Layer 0 prohibitions**: {list with [L?]}

---

## Coherence Notes (Phase 4.5)

{Cross-dimension conflicts and resolutions. Unresolved tensions noted explicitly.}

---

## Evidence Summary

| L1 | L2 | L3 | L4 |
|----|----|----|-----|
| {n} | {n} | {n} | {n} |

---

## Voice Test (Phase 5.5)

**Q1 (domain)**: {question} → {response} → Authentic: {yes/no + reason}
**Q2 (values challenge)**: {question} → {response} → Authentic: {yes/no + reason}
**Q3 (off-topic)**: {question} → {response} → Authentic: {yes/no + reason}

---

## Source Index

| Source | Type | L-level | Key extractions |
|--------|------|---------|-----------------|
| {title/url} | interview/book/wiki/chat/export | L? | {what was extracted} |
```

---

## persona.json — Distillation → OpenPersona Field Mapping

anyone-skill's final output is a full OpenPersona skill pack generated via `skills/open-persona`.  
This document defines how the 4-dimension extraction maps to OpenPersona v0.17+ `persona.json` fields.

## Field Mapping

| Extraction dimension | Content | → persona.json field | Notes |
|---|---|---|---|
| **Memory** | Background + key event summary | `soul.identity.bio` | 2–4 sentences, L1/L2 preferred |
| **Memory** | Real name or fictional source | `soul.identity.sourceIdentity` | Required for real/fictional subjects |
| **Interaction** | Speaking style + catchphrases + rhythm | `soul.character.speakingStyle` | 1–3 concrete sentences |
| **Personality** | Core character traits | `soul.character.personality` | Tag-style, 3–5 descriptors |
| **Personality** | Layer 0 prohibitions | `soul.character.boundaries` | String array |
| **Personality** | Immutable traits | `evolution.instance.boundaries.immutableTraits` | String array, max 100 chars each |
| **Procedure** | Mental models (summary) | Folded into `soul.identity.bio` | Full models stay in `persona.md` |

## Full persona.json Template

```json
{
  "soul": {
    "identity": {
      "personaName": "Display name",
      "slug": "lowercase-hyphenated-slug",
      "bio": "2–4 sentence background. Shaped by [key events]. Known for [defining qualities]. From Memory dimension, L1/L2 evidence.",
      "sourceIdentity": "Real name — OR — 'CharacterName from WorkTitle' for fictional subjects"
    },
    "aesthetic": {
      "visualDescription": "Appearance / visual style. Omit this field if unknown."
    },
    "character": {
      "personality": "Core traits in tag form. e.g. 'relentlessly direct, pattern-seeking, allergic to vagueness'. From Personality dimension.",
      "speakingStyle": "Concrete description: sentence length, vocabulary level, catchphrases, emotional temperature. From Interaction dimension.",
      "boundaries": [
        "Layer 0 constraint 1 — backed by L1/L2 evidence",
        "Layer 0 constraint 2"
      ]
    }
  },
  "body": {
    "runtime": {
      "framework": "openclaw",
      "modalities": ["text"]
    }
  },
  "evolution": {
    "instance": {
      "enabled": true,
      "boundaries": {
        "immutableTraits": [
          "Immutable trait 1 — from Personality dimension, L1/L2 evidence",
          "Immutable trait 2"
        ]
      }
    }
  },
  "social": {
    "acn": {
      "enabled": false
    }
  }
}
```

## Differences by Subject Type

### Yourself / Someone you know
- `sourceIdentity`: real name or chosen codename
- `bio`: high L1/L2 ratio from private chat logs, diaries
- `evolution.instance.enabled`: `true` — supports relationship/trait evolution over time

### Public figure / Historical figure
- `sourceIdentity`: their real name
- `bio`: from WebSearch-indexed public sources, mostly L2/L3
- Add to `boundaries`: `"Based on public information. Not the real person. For reference only."`

### Fictional character
- `sourceIdentity`: `"CharacterName from WorkTitle"` (e.g. `"Geralt of Rivia from The Witcher"`)
- When distributing: add to `boundaries`: `"Inspired by [IP name]. Not affiliated with or endorsed by the IP owner."`
- Personal use: no additional constraint needed

### Archetype
- Omit `sourceIdentity`
- Add to `bio`: `"Synthetic persona. Does not correspond to any real individual."`

## Handling the Procedure Dimension

Mental models contain too much detail to compress into `persona.json` fields. Handle as follows:

1. The 1–2 most representative models → distill into `soul.character.personality`
2. Full mental model details → keep in `persona.md` only
3. After `openpersona create` runs, manually append detailed models to `soul/injection.md` if desired

## Generation Commands

```bash
# 1. Generate skill pack
npx openpersona create --config persona.json --output ./{slug}-skill

# 2. Install locally
npx openpersona install ./{slug}-skill

# 3. Activate
npx openpersona switch {slug}
```

## Evolution Update Path

Each Phase 7 evolution cycle:

```
Update persona.md
    ↓
Sync changes to persona.json
    ↓
Re-run: npx openpersona create (overwrites skill pack; state.json is preserved)
    ↓
Bump version: python3 scripts/version_manager.py --action bump --slug {slug}
```
