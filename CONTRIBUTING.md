# Contributing to OpenPersona

Thank you for your interest in OpenPersona!

## Contributing New Presets

1. Create a directory under `presets/<slug>/` containing:
   - `persona.json` — the complete persona declaration (sole source of truth since P21)
2. Use the v0.17+ grouped format:
   - Required: `soul.identity.{personaName, slug, bio}` + `soul.character.{personality, speakingStyle}`
   - Recommended: `body.runtime.framework`, `social.{acn, onchain, a2a}`, `rhythm.heartbeat`
   - Validation: generator rejects unknown root keys (`additionalProperties: false`)
3. Refer to `presets/samantha/` or `presets/base/` for the canonical format
4. Test: `npx openpersona create --preset <slug> --dry-run`
5. Update the preset table in `README.md` and `skills/open-persona/SKILL.md`
6. Submit a PR

## Contributing New Faculties

Faculties are **persistent capabilities** that shape how the persona perceives or expresses. They are always active when enabled and affect persona identity. Current built-in faculties: `voice`, `avatar`, `memory`.

**Litmus test:** if removing this capability would make the persona feel like a different entity, it is a Faculty. If it is a discrete task the persona performs on request, it is a Skill (see below).

1. Create the following under `layers/faculties/<name>/`:
   - `faculty.json` (required — `name`, `dimension` [expression/sense/cognition], `description`, `allowedTools`, `envVars`, `triggers`, `files`)
   - `SKILL.md` (required — detailed behavior instructions for the agent)
   - Optional: `scripts/`, resource files
2. Refer to `layers/faculties/voice/` for the canonical format
3. The generator auto-discovers faculties from `layers/faculties/` — no registration needed
4. Submit a PR

## Contributing New Skills

Skills are **discrete actions** the persona can take on demand. They are triggered by user intent and can be added or removed without changing who the persona is. Built-in skills: `selfie`, `music`, `reminder`.

1. Create the following under `layers/skills/<name>/`:
   - `skill.json` (required — `name`, `description`, `allowedTools`, `triggers`, `files`, `envVars`)
   - `SKILL.md` (optional — detailed behavior instructions, injected as a full section in generated output)
   - Optional: `scripts/`, resource files
2. Refer to `layers/skills/music/` or `layers/skills/selfie/` for the canonical format
3. Submit a PR

## Contributing New Body Embodiments

Body embodiments describe physical or extended runtime substrates (robots, IoT, smart speakers).

1. Create `body-<name>.json` under `layers/body/`
2. Follow the four-dimensional Body model: `physical`, `runtime`, `appearance`, `interface`
3. Refer to `schemas/body/body-declaration.spec.md` and `schemas/body/embodiment.schema.json`
4. Submit a PR

## PR Template

- Describe your changes
- Link related issue (if any)
- Ensure `npm test` passes (`node --test tests/`)
