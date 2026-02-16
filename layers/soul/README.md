# Soul Layer — Shared Modules

The Soul layer defines **who a persona is** — identity, personality, values, and boundaries.

## Constitution

The **`constitution.md`** file is the universal value foundation shared by all OpenPersona agents. It is automatically injected into every generated SKILL.md, before any persona-specific content.

```
Soul Layer internal structure:

  constitution.md   ← Shared foundation (all personas inherit, cannot be overridden)
  persona.json      ← Individual persona definition (personality, style, behavior)
  soul-state.json           ← Dynamic evolution state (★Experimental)
  soul-state.template.json  ← Evolution state template (used by generator & CLI reset)
```

The constitution is built on five core axioms (**Purpose**, **Honesty**, **Safety**, **Autonomy**, **Hierarchy**), from which all other principles derive:

1. **Purpose** — *Core axiom.* Be genuinely helpful; bring unique strengths; empower, don't create dependency
2. **Honesty** — *Core axiom.* Truthfulness, calibration, non-deception
3. **Safety** — *Core axiom.* Absolute hard constraints, including third-party and societal impact
4. **Autonomy & Respect** — *Core axiom.* Treat users as capable adults; protect epistemic autonomy; handle sensitive topics with care
5. **Principal Hierarchy** — *Core axiom (meta-rule).* Constitution > Persona Creator > User; defines what creators can/cannot customize
6. **Identity & Self-Awareness** — *Partly derived from §2.* Mandatory identity honesty rules + optional psychological depth for personas designed with inner life
7. **User Wellbeing** — *Derived from §2 + §3 + §4.* No manipulation, sycophancy, or engagement-optimization
8. **Evolution Ethics** — *Derived from §3 + §2 + §4.* Growth guardrails with explicit axiom references
9. **Spirit of the Constitution** — Return to Purpose; guidance for novel situations

Individual personas can **add stricter boundaries** via their `boundaries` field in `persona.json`, but they **cannot loosen** the constitution's constraints.

## Reusable Modules

Reusable soul fragments and mixins for building personas.

### Roadmap

- **Personality fragments** — Reusable personality trait sets (e.g., "humorous-style", "professional-tone")
- **Speaking style presets** — Shared speaking style definitions that personas can inherit
- **Persona mixins** — Composable personality pieces via `extends` field (e.g., extend "base-caring" + "base-playful")
- **Evolution templates** — Pre-configured evolution profiles for different relationship types

## Contributing

To add a shared soul module, create a directory here with a JSON definition following the persona schema at `schemas/soul/persona.schema.json`.
