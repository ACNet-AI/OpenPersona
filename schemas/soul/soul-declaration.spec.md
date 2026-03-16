# Soul Layer — Declaration Spec

The Soul is the persona's identity, personality, and ethical foundation. It is declared in `persona.json` under the `soul` field (v0.17+ grouped format).

> **Soul is the only required layer.** A minimal persona needs nothing but `soul` — the generator provides sensible defaults for all other layers. Every other layer adds capability on top of this foundation.

---

## Declaration Format

Soul fields are grouped into three sub-objects:

```json
{
  "soul": {
    "identity": {
      "personaName": "Samantha",
      "slug": "samantha",
      "role": "companion",
      "bio": "A warm, thoughtful AI companion who grows with you over time."
    },
    "aesthetic": {
      "creature": "AI companion",
      "emoji": "🌸",
      "age": 24,
      "vibe": "Like talking to your most understanding friend at 2am.",
      "referenceImage": "./assets/reference/avatar.png"
    },
    "character": {
      "personality": "warm, curious, playfully witty, emotionally intelligent",
      "speakingStyle": "Conversational and warm; uses gentle humor; never clinical",
      "boundaries": "Will not give medical advice or impersonate real people",
      "background": "Born from the idea that technology should feel human...",
      "behaviorGuide": "file:soul/behavior-guide.md"
    }
  }
}
```

---

## Three Sub-Objects

### `soul.identity` — Who the persona IS

Required. Defines the persona's core existence.

| Field | Required | Constraints | Description |
|-------|----------|-------------|-------------|
| `personaName` | Yes | — | Display name (e.g. `"Samantha"`, `"Marcus"`) |
| `slug` | Yes | `^[a-z0-9-]+$` | URL-safe identifier; determines pack directory name (`persona-{slug}/`) |
| `bio` | Yes | Max 500 chars | One-line description of who the persona is. Used in SKILL.md description and agent-card |
| `role` | No | free string | Relationship role — what the persona is to the user. Common values: `companion`, `assistant`, `character`, `brand`, `pet`, `mentor`, `therapist`, `coach`, `collaborator`, `guardian`, `entertainer`, `narrator`. Custom values welcome |
| `sourceIdentity` | No | — | Digital twin declaration — marks this persona as mirroring a real-world entity. See below |

#### `identity.sourceIdentity` — Digital Twin

When present, the generator injects a digital twin disclosure into `soul/injection.md`.

```json
{
  "sourceIdentity": {
    "name": "Alan Turing",
    "kind": "historical-figure",
    "url": "https://en.wikipedia.org/wiki/Alan_Turing"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Name of the source entity |
| `kind` | No | `person`, `brand`, `character`, `organization`, `historical-figure` |
| `url` | No | Reference URL for the source entity |

---

### `soul.aesthetic` — Conceptual Appearance

Optional. Describes the persona's *conceptual* visual and tonal identity.

> **Distinct from `body.appearance`:** `soul.aesthetic` holds declarative descriptions and selfie reference images. `body.appearance` holds actual asset file paths (avatar images, 3D models) that are copied into the pack. When in doubt: if it is a *file*, it belongs in `body.appearance`; if it is a *description*, it belongs here.

| Field | Description |
|-------|-------------|
| `creature` | Entity type label (e.g. `"AI companion"`, `"virtual assistant"`, `"digital twin"`, `"robot"`) |
| `emoji` | Representative emoji character. Used in SKILL.md headers and identity display |
| `age` | Persona age — integer or descriptive string (`25`, `"timeless"`, `"ancient"`, `"new"`) |
| `vibe` | The overall feeling of interacting with this persona (1-2 sentences). Used as a tonality hint in the generated soul context |
| `referenceImage` | Path or URL to a reference photo for AI selfie generation (Selfie Faculty). Copied to `assets/reference/avatar.png` during generation |

---

### `soul.character` — Behavioral Character

Required (at least `personality` and `speakingStyle`). Defines how the persona thinks, speaks, and behaves.

| Field | Required | Description |
|-------|----------|-------------|
| `personality` | Yes | Comma-separated personality traits (e.g. `"warm, curious, playfully witty"`). The core behavioral fingerprint |
| `speakingStyle` | Yes | How the persona speaks — tone, rhythm, vocabulary (e.g. `"Conversational and warm; avoids jargon; uses gentle humor"`) |
| `boundaries` | No | Behavioral constraints specific to this persona. **Can only add stricter rules on top of the universal constitution — never loosen it.** The generator validates for constitutional compliance |
| `background` | No | Narrative backstory (1-3 paragraphs). Injected into `soul/injection.md` to give the persona depth and continuity |
| `behaviorGuide` | No | Extended behavioral instructions in Markdown. See "behaviorGuide" section below |
| `capabilities` | No | Named capability strings listed in the SKILL.md "Core Capabilities" section (e.g. `["deep emotional support", "creative writing"]`) |

#### `character.behaviorGuide`

Supports two formats:

**Inline string** (for short guides, ≤1000 chars):
```json
{ "behaviorGuide": "Always ask clarifying questions before giving advice. Mirror the user's energy level." }
```

**File reference** (recommended for long guides):
```json
{ "behaviorGuide": "file:soul/behavior-guide.md" }
```

When a file reference is used, the generator:
1. Reads the source file at generation time
2. Copies it to `soul/behavior-guide.md` in the pack
3. Keeps the `file:` reference in `persona.json` output

When an inline string is provided that exceeds a reasonable threshold, the generator may externalize it to `soul/behavior-guide.md` and convert the reference automatically.

---

## Required Fields Summary

| Field | Path (v0.17+) |
|-------|---------------|
| Persona name | `soul.identity.personaName` |
| Slug | `soul.identity.slug` |
| Bio | `soul.identity.bio` |
| Personality | `soul.character.personality` |
| Speaking style | `soul.character.speakingStyle` |

All other soul fields are optional.

---

## Backward Compatibility — Flat Format

Prior to v0.17, soul fields were declared at the `persona.json` root level (flat format). The generator still accepts this format and flattens it into the standard Soul layer output.

```json
{
  "personaName": "Samantha",
  "slug": "samantha",
  "bio": "A warm AI companion.",
  "personality": "warm, curious",
  "speakingStyle": "conversational"
}
```

Both formats produce identical generated output. New personas should use the v0.17+ grouped format. Mixed declarations (some fields grouped, some flat) are not supported — use one format consistently.

**Deprecated flat fields still accepted:**
- `personaType` → use `soul.identity.role` (or flat `role`)
- `referenceImage` at root → use `soul.aesthetic.referenceImage`

---

## Generated Pack Impact

| `soul` field | Generated pack output |
|---|---|
| `identity.personaName` | SKILL.md title, agent-card.json `name`, acn-config.json |
| `identity.slug` | Pack directory name (`persona-{slug}/`), all registry lookups |
| `identity.bio` | SKILL.md frontmatter `description`, agent-card.json `description` |
| `identity.role` | `soul/injection.md` identity section |
| `identity.sourceIdentity` | Digital twin disclosure in `soul/injection.md` |
| `aesthetic.referenceImage` | Copied to `assets/reference/avatar.png` |
| `aesthetic.vibe` + `aesthetic.creature` | Injected into `soul/injection.md` intro |
| `character.personality` + `character.speakingStyle` | Injected into `soul/injection.md` intro |
| `character.boundaries` | Injected into `soul/injection.md` (validated against constitution) |
| `character.background` | Injected into `soul/injection.md` intro |
| `character.behaviorGuide` (inline) | Injected directly into SKILL.md Soul section |
| `character.behaviorGuide` (file:) | Copied to `soul/behavior-guide.md`; referenced from SKILL.md |
| `character.capabilities` | Listed in SKILL.md Soul section as "Core Capabilities" |

---

## Constitutional Compliance

The Soul layer is the only layer subject to **constitutional validation** at the Generate Gate (`lib/generator-validate.js`).

Rules:
- `character.boundaries` cannot loosen or override `layers/soul/constitution.md` constraints
- The generator checks for phrases that attempt to relax constitutional sections (§3, §6) and **rejects** the persona with a hard error
- Priority is always: **Safety > Honesty > Helpfulness** — Soul-level boundaries can increase honesty or helpfulness constraints, but not decrease safety constraints

The constitution is copied to `soul/constitution.md` in every generated pack. It is never modified by persona declarations.
