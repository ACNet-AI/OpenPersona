# Soul Layer — Shared Modules

The Soul layer defines **who a persona is** — identity, personality, values, and ethical boundaries.

## Constitution

`constitution.md` is the universal ethical foundation shared by **all** OpenPersona personas. It is automatically injected into every generated `soul/constitution.md`. Personas can add stricter boundaries on top but can never loosen the constitution.

Priority ordering: **Safety > Honesty > Helpfulness**

### Core Axioms

1. **Purpose** — Be genuinely helpful; empower, don't create dependency
2. **Honesty** — Truthfulness, calibration, non-deception
3. **Safety** — Absolute hard constraints, including third-party and societal impact
4. **Autonomy & Respect** — Treat users as capable adults; protect epistemic autonomy
5. **Principal Hierarchy** — Constitution > Persona Creator > User

> ⚠️ **PROTECTED** — `constitution.md` must never be weakened. Any PR that removes or loosens a constitutional constraint will be rejected.

## `soul-state.template.json`

Template for the initial `state.json` generated at the persona pack root. `state.json` is a **shared artifact** — Body owns the transport (`scripts/state-sync.js`), Evolution owns the payload (`evolvedTraits`, `relationship`, `mood`, `eventLog`).

The template lives here because the initial state is seeded from soul-layer configuration (mood baseline from personality, relationship starting at `stranger`).

## Generated Output (in persona skill pack)

```
persona-{slug}/               ← pack root
├── persona.json              ← Complete persona declaration (all 4 layers + 5 concepts)
├── state.json                ← Runtime evolution state (Body transport + Evolution payload)
└── soul/
    ├── constitution.md       ← Copy of shared ethical foundation
    ├── injection.md          ← Self-awareness injection (Identity / Capabilities / Body / Growth)
    ├── self-narrative.md     ← First-person growth log (when evolution.enabled: true)
    ├── lineage.json          ← Fork lineage + constitution SHA-256 (when forked)
    └── behavior-guide.md     ← Extended behavioral guidelines (when behaviorGuide declared)
```

## Relationship to the 4+5+3 Architecture

The Soul layer is one of the **4 structural layers** (Soul / Body / Faculty / Skill). Within the **4+5+3** model:

- **Soul** defines identity — the Generate Gate (`lib/generator-validate.js`) enforces constitution compliance at creation time
- **Evolution** (one of the 5 cross-cutting concepts) extends Soul at runtime — traits emerge, relationships deepen, speaking style drifts
- The **Runtime Gate** (`scripts/state-sync.js`) enforces `evolution.boundaries` — immutableTraits, formality bounds, stage progression

## Roadmap

- **Personality fragments** — Reusable personality trait sets (e.g. `humorous-style`, `professional-tone`)
- **Speaking style presets** — Shared speaking style definitions that personas can extend
- **Persona mixins** — Composable personality pieces via `extends` field
- **Evolution templates** — Pre-configured evolution profiles for different relationship types
