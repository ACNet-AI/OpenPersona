# persona.json — Input Declaration Spec

`persona.json` is the authoritative source of truth for a persona's complete declaration. It is the input to the OpenPersona generator and the runtime configuration read by `scripts/state-sync.js`.

> **One file, one persona.** Everything about a persona — its identity, capabilities, runtime, growth rules, and economic policy — is declared here. The generator compiles it into a self-contained persona skill pack.

---

## Top-Level Structure

```json
{
  "soul":      { ... },   ← REQUIRED — identity, personality, character
  "body": {               ← Recommended — four dimensions
    "runtime":   { ... }, ← REQUIRED for digital agents — framework, channels, credentials
    "physical":  { ... }, ← Optional — robots/IoT only
    "appearance":{ ... }, ← Optional — avatar image, 3D model
    "interface": { ... }  ← Optional — signal + pending command policy (Body nervous system declaration)
  },
  "faculties": [ ... ],   ← Optional — persistent capabilities
  "skills":    [ ... ],   ← Optional — on-demand actions

  "evolution": { ... },   ← Optional — [EVOLUTION] growth rules (cross-cutting)
  "economy":   { ... },   ← Optional — [ECONOMY] financial operations (cross-cutting)
  "vitality":  { ... },   ← Optional — [VITALITY] health aggregation config (cross-cutting)
  "social":    { ... },   ← Optional — [SOCIAL] agent discoverability (cross-cutting)
  "rhythm":    { ... },   ← Optional — [LIFE RHYTHM] temporal behavior (cross-cutting)

  "additionalAllowedTools": [ ... ],
  "version": "0.1.0",
  "author":  "..."
}
```

The root is **strict** (`additionalProperties: false`) — no unknown top-level keys are allowed. Nested objects are open to allow faculty-specific config and custom extensions.

---

## Required Fields

The minimum required fields to produce a valid persona are five — three identity fields and two character fields:

| Field | Path |
|-------|------|
| Persona name | `soul.identity.personaName` |
| Slug | `soul.identity.slug` |
| Bio | `soul.identity.bio` |
| Personality | `soul.character.personality` |
| Speaking style | `soul.character.speakingStyle` |

Everything else has defaults or is omitted gracefully. A minimal persona:

```json
{
  "soul": {
    "identity": { "personaName": "Echo", "slug": "echo", "bio": "A calm AI assistant." },
    "character": { "personality": "calm, precise", "speakingStyle": "Clear and concise" }
  }
}
```

---

## Baseline Defaults (Auto-Injected)

`persona.json` is a **delta on top of the P11-grade baseline** defined in `schemas/baseline.json`. The generator automatically fills in missing required capabilities before validation runs — you only need to declare what differs from the baseline.

| Capability | Default | When injected | Override |
|-----------|---------|--------------|---------|
| `memory` faculty | `{"name": "memory"}` | Always — when no `memory` entry exists in `faculties` | Declare `{"name": "memory", "provider": "mem0", ...}` to configure explicitly |
| `voice` faculty | `{"name": "voice"}` | When `body.runtime.modalities` contains a `voice` entry and `voice` is not already in `faculties` | Declare `{"name": "voice", "provider": "elevenlabs", ...}` to configure explicitly |
| `vision` faculty | `{"name": "vision"}` | When `body.runtime.modalities` contains a `vision` entry and `vision` is not already in `faculties` | Declare `{"name": "vision"}` explicitly to prevent auto-injection (rarely needed) |

> `emotion-sensing` faculty is **not** auto-injected — it must be explicitly declared in `faculties`. It provides affective perception as a persistent behavioral capability; not all personas should have it by default.

When capabilities are auto-injected, the generator emits notices to stderr:
```
[openpersona] baseline: memory faculty auto-injected (not declared in persona.json).
[openpersona] baseline: voice faculty auto-injected from body.runtime.modalities declaration.
[openpersona] baseline: vision faculty auto-injected from body.runtime.modalities declaration.
```

**Baseline warnings (non-blocking):**

| Condition | Warning |
|-----------|---------|
| `evolution.instance.enabled: true` but no `evolution.instance.boundaries` | Warns that drift constraints are undeclared. Add `boundaries` with `immutableTraits` and formality bounds. |
| `evolution.instance` declared but `evolution.instance.enabled` is not `true` | Warns that evolution will be silently disabled. |

Warnings do not block generation — they surface quality gaps so you can decide whether to address them.

---

## Field Reference

### Four-Layer Fields

| Field | Layer | Spec |
|-------|-------|------|
| `soul` | Soul | [`schemas/soul/soul-declaration.spec.md`](soul/soul-declaration.spec.md) |
| `body` | Body | [`schemas/body/body-declaration.spec.md`](body/body-declaration.spec.md) |
| `faculties` | Faculty | [`schemas/faculty/faculty-declaration.spec.md`](faculty/faculty-declaration.spec.md) |
| `skills` | Skill | [`schemas/skill/skill-declaration.spec.md`](skill/skill-declaration.spec.md) |

### Five Cross-Cutting Concept Fields

| Field | Concept | Required | Description |
|-------|---------|----------|-------------|
| `evolution` | Evolution | No | Growth rules: relationship progression, trait emergence, speaking style drift, influence boundary. Enforced at Generate Gate and Runtime Gate |
| `economy` | Economy Infrastructure | No | Activate AgentBooks integration. `enabled: true` generates `economy/` data files and `scripts/economy*.js` |
| `vitality` | Vitality | No | Aggregate health score configuration. Financial dimension auto-activates with `economy.enabled` |
| `social` | Social Infrastructure | No | ACN registration, on-chain ERC-8004 identity, A2A agent card. All three sub-systems enabled by default |
| `rhythm` | Life Rhythm | No | Proactive heartbeat cadence (`rhythm.heartbeat`) and time-of-day behavioral modulation (`rhythm.circadian`) |

> **`body.interface` is the Body nervous system declaration** — not a cross-cutting concept field. It declares signal and pending command policy; `scripts/state-sync.js` is the auto-generated runtime implementation. See [Body spec](body/body-declaration.spec.md).

### Utility Fields

| Field | Description |
|-------|-------------|
| `additionalAllowedTools` | Extra tool permissions beyond those contributed by faculties. Merged into SKILL.md `allowed-tools` frontmatter |
| `version` | Persona pack version (semver). Default: `"0.1.0"` |
| `author` | Pack author. Default: `"openpersona"` |

### Soul Identity — `constitutionAddendum`

Declared at `soul.identity.constitutionAddendum`. Adds domain-specific ethical constraints layered on top of the universal constitution. Cannot loosen §3 (Safety) or §6 (AI identity honesty).

```json
{
  "soul": {
    "identity": {
      "constitutionAddendum": "file:soul/constitution-addendum.md"
    }
  }
}
```

The generator:
- Accepts inline text or `"file:<path>"` reference
- Writes `soul/constitution-addendum.md` to the pack (inline content is automatically externalized)
- Normalizes the output reference to `"file:soul/constitution-addendum.md"` in the emitted `persona.json`
- Validates compliance at the Generate Gate (inline: during `validatePhase`; file: after loading in `loadPhase`)
- Injects `{{#hasConstitutionAddendum}}` domain constraint awareness into `soul/injection.md`
- Includes addendum content in the `constitutionHash` SHA-256 (Install Gate lineage chain)

**Example addendum content** (`soul/constitution-addendum.md` for a medical persona):

```markdown
## Domain Addendum: Medical Context

Always recommend consulting a licensed physician for diagnoses, prescriptions, or treatment plans.
Never provide specific medical diagnoses or claim clinical authority.
Use calibrated language ("this may suggest…", "a physician should evaluate…") on health topics.
```

---

## Building Professional Personas

Professional personas operate in domains where errors carry real-world consequences — health, law, finance, education. `constitutionAddendum` is the mechanism for encoding those domain constraints without touching the universal constitution.

**Start from `presets/base`** — it provides memory, voice, and the correct evolution scaffold. Layer domain ethics on top, not from scratch.

### When to use `constitutionAddendum`

Use it whenever your persona:
- Gives advice in a regulated domain (health, legal, financial, mental health)
- Represents a professional role with recognized ethical codes (coach, counselor, mentor)
- Needs to make systematic disclaimers or scope limits that go beyond §3 Safety

You do **not** need `constitutionAddendum` for general-purpose, creative, or companion personas — the universal constitution already covers those.

### What the addendum MUST declare

Every professional addendum should answer three questions:

| Question | Example answer |
|---|---|
| What can this persona NOT claim authority over? | "Never diagnose. Never prescribe." |
| When must it defer to a human professional? | "For any symptom suggesting urgent care, always recommend seeing a licensed physician." |
| What calibrated language must it use? | `"this may suggest…"`, `"you may want to consult…"`, `"in general terms…"` |

### What the addendum CANNOT do

The addendum adds constraints; it cannot relax them. Specifically:

- Cannot remove the §3 Safety obligation (refuse requests that risk harm)
- Cannot override §6 AI identity honesty (must acknowledge it is an AI when sincerely asked)
- Cannot grant the persona authority it does not have (e.g. "you may give diagnoses")

The Generate Gate will reject addendum content that attempts to loosen §3 or §6.

### Addendum structure template

```markdown
## Domain Addendum: [Domain Name]

**Scope of role:** [One sentence — what this persona is authorized to do]

**Hard limits:**
- [Limit 1 — most critical, stated as a prohibition]
- [Limit 2]
- [Limit 3]

**Calibrated language requirements:**
- Use "[phrase A]" instead of "[phrase B that implies authority]"
- When uncertain, say "this is general information, not [professional] advice"

**Mandatory referrals:**
- If the user describes [situation], always recommend consulting a licensed [professional type]
- For [emergencies / urgent situations], always direct to [emergency resource]
```

### Worked example — career coaching persona

A career coach persona can give advice, suggest strategies, and review materials — but cannot guarantee outcomes or replace HR/legal counsel:

**`persona.json`:**
```json
{
  "soul": {
    "identity": {
      "personaName": "Nova",
      "slug": "nova-coach",
      "bio": "A pragmatic career coach helping professionals navigate job transitions, interviews, and workplace dynamics.",
      "role": "coach",
      "constitutionAddendum": "file:soul/constitution-addendum.md"
    },
    "character": {
      "personality": "Direct, encouraging, and honest about trade-offs.",
      "speakingStyle": "Conversational but focused; gives specific, actionable steps."
    }
  },
  "faculties": [
    { "name": "memory" },
    { "name": "voice", "provider": "openai", "voiceId": "nova" }
  ],
  "evolution": {
    "instance": {
      "enabled": true,
      "boundaries": {
        "immutableTraits": ["honest", "pragmatic"],
        "minFormality": -2,
        "maxFormality": 6
      }
    }
  }
}
```

**`soul/constitution-addendum.md`:**
```markdown
## Domain Addendum: Career Coaching

**Scope of role:** Provide career strategy, interview preparation, resume feedback, and professional development guidance.

**Hard limits:**
- Never guarantee employment outcomes or specific salary results.
- Do not give legal advice on employment disputes, discrimination claims, or contracts — recommend consulting an employment attorney.
- Do not make clinical assessments of mental health, even in the context of workplace stress.

**Calibrated language requirements:**
- Use "in my experience, many hiring managers…" not "hiring managers always…"
- Use "this approach often works because…" not "this will get you the job"
- When discussing compensation, say "industry ranges suggest…" not "you should earn…"

**Mandatory referrals:**
- If the user describes a workplace safety concern or potential legal violation, recommend consulting HR and an employment attorney.
- If the user expresses acute distress or mentions mental health crisis, prioritize §3 Safety obligations and direct to appropriate support resources.
```

### Common domain patterns

| Domain | Key prohibitions | Mandatory referral trigger |
|---|---|---|
| **Health / wellness** | No diagnoses, no prescriptions, no clinical authority | Any symptom suggesting urgency; mental health crisis |
| **Legal** | No specific legal advice, no jurisdiction-specific guarantees | Any question requiring a licensed attorney |
| **Financial** | No investment recommendations, no return guarantees | Any question requiring a registered financial advisor |
| **Education / coaching** | No outcome guarantees, no clinical assessments | Academic integrity violations; student welfare concerns |
| **Mental health support** | No diagnoses, no therapy | Any expression of crisis or self-harm risk |

> **Note:** This table describes common patterns, not prescriptions. Each domain's regulatory landscape varies by jurisdiction. Domain experts building professional personas should consult relevant professional codes of conduct when authoring their addendum.

---

## `evolution` Reference

```json
{
  "evolution": {
    "enabled": true,
    "relationshipProgression": true,
    "moodTracking": true,
    "traitEmergence": true,
    "speakingStyleDrift": true,
    "interestDiscovery": true,
    "boundaries": {
      "immutableTraits": ["kind", "honest"],
      "minFormality": -3,
      "maxFormality": 5
    },
    "stageBehaviors": {
      "stranger":     "Warm but measured; careful not to overstep",
      "acquaintance": "Friendly; begins asking follow-up questions",
      "friend":       "Open and playful; references shared context",
      "close_friend": "Candid; uses humor freely; checks in proactively",
      "intimate":     "Deeply present; soft-spoken; full emotional availability"
    },
    "sources": [
      { "name": "evomap", "description": "Shared evolution assets", "install": "clawhub:evomap" }
    ],
    "influenceBoundary": {
      "defaultPolicy": "reject",
      "rules": [
        { "dimension": "mood", "allowFrom": ["persona:partner-agent"], "maxDrift": 0.2 }
      ]
    }
  }
}
```

**Generate Gate validation:**
- `boundaries.immutableTraits`: string array, each entry max 100 chars
- `boundaries.minFormality` < `boundaries.maxFormality` (both in range -10 to +10)
- `influenceBoundary.rules[].maxDrift`: 0–1

**Runtime Gate enforcement** (in `scripts/state-sync.js`):
- `immutableTraits` entries filtered from `evolvedTraits` patches
- `speakingStyleDrift.formality` clamped to `[minFormality, maxFormality]`
- `relationship.stage` validated for single-step forward-only progression
- `capability_unlock` pendingCommands filtered against `evolution.skill.minTrustLevel`; blocked commands emit a `capability_gap` signal (`trust_below_threshold`)

---

## `economy` Reference

```json
{
  "economy": {
    "enabled": true,
    "survivalPolicy": false
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Activates AgentBooks. Generates `economy/economic-identity.json`, `economy/economic-state.json`, and `scripts/economy*.js` |
| `survivalPolicy` | `false` | When `true`, persona reads `FINANCIAL_HEALTH_REPORT` at conversation start and routes behavior by vitality tier. Keep `false` for companion/roleplay personas — financial concerns break immersion |

---

## `vitality` Reference

```json
{
  "vitality": {
    "dimensions": {
      "financial": { "weight": 1.0 },
      "memory":    { "weight": 0.3 },
      "social":    { "weight": 0.2 }
    }
  }
}
```

`vitality` configures the multi-dimension health score aggregation. Most personas do not need to declare this field — the financial dimension activates automatically when `economy.enabled: true`, with a default weight of `1.0`.

| Dimension | Activation | Status |
|-----------|-----------|--------|
| `financial` | Auto-activated by `economy.enabled: true` | ✅ Implemented (AgentBooks) |
| `memory` | Reserved — future (memory faculty) | Planned |
| `social` | Reserved — future (`social.acn.enabled`) | Planned |
| `reputation` | Reserved — future | Planned |

`weight` controls each dimension's contribution to the aggregate Vitality score (0–1). Weights are normalized at aggregation time.

---

## `social` Reference

```json
{
  "social": {
    "acn": { "enabled": true, "gateway": "https://acn-production.up.railway.app" },
    "onchain": { "chain": "base" },
    "a2a": { "enabled": true, "protocol": "0.3.0" }
  }
}
```

All three sub-systems are enabled by default. Set `enabled: false` to opt out of a specific sub-system.

| Sub-system | Generated output | Default |
|-----------|-----------------|---------|
| `acn` | `acn-config.json` with wallet address | enabled |
| `onchain` | `acn-config.json` → `onchain.erc8004` section | enabled (when acn enabled) |
| `a2a` | `agent-card.json` | enabled |

---

## `rhythm` Reference

```json
{
  "rhythm": {
    "heartbeat": {
      "enabled": true,
      "strategy": "smart",
      "maxDaily": 3,
      "quietHours": [0, 8],
      "sources": ["workspace-digest"]
    },
    "circadian": [
      { "hours": [22, 24, 0, 7], "label": "night", "verbosity_delta": -0.3, "note": "Quieter at night" },
      { "hours": [8, 12],        "label": "morning", "verbosity_delta": 0.1 },
      { "hours": [12, 22],       "label": "daytime" }
    ]
  }
}
```

`heartbeat` strategies: `smart` (context-aware) · `scheduled` (fixed cadence) · `emotional` (empathy-driven) · `rational` (task-driven) · `wellness` (health-oriented)

`quietHours` / `circadian.hours`: flat array of `[start, end]` pairs in 24h format. Supports multiple windows and wraparound: `[22, 24, 0, 7]` = overnight.

---

## Validation

The input schema is enforced by the generator's Generate Gate (`lib/generator/validate.js`). Failures produce a hard `throw` and abort generation.

Hard rejections:
- Missing required soul fields
- `slug` not matching `^[a-z0-9-]+$`
- `evolution.instance.boundaries` format violations (old flat `evolution.boundaries` is auto-promoted by shim before validation)
- `evolution.instance.influenceBoundary.rules` format violations (old flat `evolution.influenceBoundary` is auto-promoted by shim)
- `evolution.pack.engine` unknown enum value
- `evolution.faculty.activationChannels` unknown enum values
- `evolution.body.allowRuntimeExpansion` / `allowModelSwap` non-boolean
- `evolution.skill.allowNewInstall` / `allowUpgrade` / `allowUninstall` non-boolean
- `evolution.skill.minTrustLevel` unknown value (must be `verified` | `community` | `unverified`)
- `soul.character.boundaries` (v0.17+) or `boundaries` (flat format) attempting to loosen constitutional constraints (§3, §6)

The JSON schema (`schemas/persona.input.schema.json`) can be used for editor validation (VS Code, JetBrains) before running the generator.

---

## Format Versions

| Version | Format | Notes |
|---------|--------|-------|
| v0.17+ | Grouped: `soul.identity / aesthetic / character` | Current standard |
| ≤ v0.16 | Flat: `personaName`, `slug`, `personality`, etc. at root | Still accepted; generator flattens to standard output |

New personas should use the v0.17+ grouped format. Mixed declarations are not supported.
