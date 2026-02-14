# Contributing to OpenPersona

Thank you for your interest in OpenPersona!

## Contributing New Presets

1. Create a directory under `presets/<slug>/` containing:
   - `manifest.json` (four-layer manifest)
   - `persona.json` (pure soul definition)
2. Refer to `presets/ai-girlfriend/` for the format
3. `persona.json` required fields: personaName, slug, bio, personality, speakingStyle
4. `manifest.json` must declare all four layers (soul, body, faculties, skills)
5. Submit a PR

## Contributing New Body Embodiments

1. Create `embodiment.json` under `layers/embodiments/<name>/`
2. Follow `schemas/body/embodiment.schema.json`
3. Fields: name, description, hardwareRef, capabilities, hardwareRequirements
4. Submit a PR

## Contributing New Faculties

1. Create the following under `layers/faculties/<name>/`:
   - `faculty.json` (standard interface)
   - `SKILL.md` (behavior definition)
   - Optional: `scripts/`, resource files
2. `faculty.json` required fields: name, dimension (expression/sense/cognition)
3. Self-contained implementation: fill `files`; Delegated ecosystem: fill `skillRef`; Skeleton: fill `skeleton`
4. Submit a PR

## PR Template

- Describe your changes
- Link related issue (if any)
- Ensure `npm test` passes
