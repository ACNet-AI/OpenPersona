# Soul Layer — Shared Modules

Reusable soul fragments and mixins for building personas.

## MVP Status

Currently empty. Persona definitions live in `presets/*/persona.json`.

## Roadmap

- **Personality fragments** — Reusable personality trait sets (e.g., "humorous-style", "professional-tone")
- **Speaking style presets** — Shared speaking style definitions that personas can inherit
- **Persona mixins** — Composable personality pieces via `extends` field (e.g., extend "base-caring" + "base-playful")
- **Evolution templates** — Pre-configured evolution profiles for different relationship types

## Contributing

To add a shared soul module, create a directory here with a JSON definition following the persona schema at `schemas/soul/persona.schema.json`.
