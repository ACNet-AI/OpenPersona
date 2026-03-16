# Evolution — Systemic Concept

Evolution is one of the **five systemic concepts** in OpenPersona's 4+5+3 architecture. It governs persona growth, relationship progression, trait emergence, and cross-conversation state persistence.

## Role

Evolution is not a structural layer — it is an operational dimension that spans all four layers:
- **Soul**: personality traits evolve (`evolvedTraits`), speaking style drifts, relationship stages advance
- **Body**: `state.json` (pack root) persists evolution state between conversations; `scripts/state-sync.js` is the nerve fiber
- **Faculty/Skill**: behavior may change as relationship deepens or traits emerge

## Declaration

Declared in `persona.json` under the top-level `evolution` field:

```json
{
  "evolution": {
    "enabled": true,
    "boundaries": {
      "immutableTraits": ["empathetic", "curious"],
      "speakingStyleDrift": { "minFormality": -3, "maxFormality": 3 }
    },
    "sources": [{ "name": "openai-updates", "install": "clawhub:openai-updates" }]
  }
}
```

## Implementation Files

Evolution's source files are distributed across the framework:

| File | Location | Role |
|------|----------|------|
| `soul-state.template.json` | `layers/soul/` | Template for `state.json` (pack root) |
| `state-sync.template.js` | `templates/` | Mustache template → `scripts/state-sync.js` (Runtime Gate) |
| `soul-awareness-growth.partial.md` | `templates/partials/` | Self-Awareness › Growth injection |
| `soul-how-you-grow.partial.md` | `templates/partials/` | Growth behavior guidance |
| Evolution validation logic | `lib/generator-validate.js` | Generate Gate — boundaries format enforcement |
| Evolution governance | `lib/evolution.js` | `evolve-report` CLI command |

## Future

When evolution has standalone source assets (e.g. a dedicated growth engine or evolution pack), they will be added to this directory.
