# AGENTS.md

Instructions for AI coding agents working on the OpenPersona codebase.

## Project Overview

OpenPersona is an open four-layer agent framework (Soul / Body / Faculty / Skill) for creating, composing, and orchestrating agent persona skill packs. It generates self-contained skill packs that give AI agents a complete identity.

**Key distinction:** This repo is the *framework itself*, not a persona. The `skills/open-persona/SKILL.md` is a meta-skill for *using* the framework; this file guides *developing* it.

## Setup

```bash
npm install        # Install dependencies
node --test tests/ # Run all tests — must pass before any PR
```

- **Node.js ≥ 18** required (see `engines` in package.json)
- No build step — plain CommonJS, no transpilation
- Dependencies: fs-extra, mustache, commander, inquirer, chalk, adm-zip

## Project Structure

```
bin/cli.js              ← CLI entry point (commander-based)
lib/
  generator.js          ← Core persona generation logic (the heart of the project)
  installer.js          ← Persona installation to OpenClaw
  publisher/clawhub.js  ← Publishing to ClawHub registry
  contributor.js        ← Persona Harvest (community contribution)
  downloader.js         ← Preset/package downloading
  utils.js              ← Shared utilities
templates/
  skill.template.md     ← Mustache template → generated SKILL.md
  soul-injection.template.md ← Soul layer injection template
layers/
  soul/
    constitution.md     ← ⚠️ PROTECTED — universal ethical foundation
    README.md
    soul-state.template.json ← Evolution state template
  faculties/            ← Faculty implementations (voice, selfie, music, reminder)
  embodiments/          ← Body layer definitions
schemas/                ← JSON schemas for validation
presets/                ← Pre-built persona definitions (samantha, ai-girlfriend, etc.)
tests/                  ← Node.js native test runner (node:test)
skills/open-persona/    ← Meta-skill for AI agents using the framework
```

## Architecture Rules

### Four-Layer Model

Every persona is a four-layer bundle:
1. **Soul** — personality, identity, ethical boundaries (`persona.json` + `constitution.md`)
2. **Body** — physical embodiment (`embodiment.json`, null for digital agents)
3. **Faculty** — capabilities (voice, selfie, music, reminder)
4. **Skill** — external skills from ClawHub / skills.sh

### Constitution (CRITICAL)

`layers/soul/constitution.md` is the universal ethical foundation inherited by ALL personas.

- **NEVER weaken or remove constitutional constraints**
- Personas can add stricter rules on top, but cannot loosen the constitution
- Section references use `§` prefix: `§1`, `§2`, etc. — never use `S1`, `S2`
- Priority ordering: **Safety > Honesty > Helpfulness**
- The generator (`lib/generator.js`) includes a compliance check that rejects `persona.json` boundaries attempting to loosen constitutional constraints

### Template System

- Templates use **Mustache** syntax (`{{variable}}`, `{{#section}}...{{/section}}`)
- `skill.template.md` generates the persona's main SKILL.md
- `soul-injection.template.md` injects soul-layer instructions (including soul evolution)
- Template variables are populated by `lib/generator.js`

### Version Synchronization

All version references must stay in sync at `0.4.0`:
- `package.json` → `version`
- `bin/cli.js` → `.version()`
- `lib/generator.js` → `frameworkVersion` default
- `presets/*/manifest.json` → `meta.frameworkVersion`
- `skills/open-persona/SKILL.md` → frontmatter `version`

When bumping versions, update ALL of these locations.

## Code Style

- **CommonJS** (`require` / `module.exports`) — no ES modules
- **No transpilation** — code runs directly on Node.js ≥ 18
- **Quotes:** single quotes for strings
- **Error handling:** use `printError()` from `lib/utils.js` for user-facing errors
- **Path resolution:** use `resolvePath()` from `lib/utils.js`, never hardcode absolute paths
- **Dependencies:** prefer lightweight packages; the framework should stay lean

## Testing

```bash
npm test                    # Run all tests
node --test tests/generator.test.js  # Run specific test file
```

- Uses **Node.js native test runner** (`node:test` + `node:assert`)
- Tests create temp directories in `os.tmpdir()` and clean up after themselves
- Key test coverage: persona generation, constitution injection, compliance checks, faculty handling, soul evolution
- **All tests must pass before committing**

## Adding a New Faculty

1. Create directory: `layers/faculties/<name>/`
2. Add required files:
   - `faculty.json` — standard interface (name, dimension, description, allowedTools, envVars, triggers, files)
   - `SKILL.md` — behavior definition for the AI agent
   - `scripts/` — implementation scripts (optional)
3. Dimension must be one of: `expression`, `sense`, `cognition`
4. The generator auto-discovers faculties from `layers/faculties/` — no registration needed
5. Add tests if the faculty affects generation logic

## Adding a New Preset

1. Create directory: `presets/<slug>/`
2. Add `persona.json` (required fields: personaName, slug, bio, personality, speakingStyle)
3. Add `manifest.json` (must declare all four layers, set `meta.frameworkVersion`)
4. Test: `npx openpersona create --preset <slug> --output /tmp/test`
5. Update the preset table in `README.md` and `skills/open-persona/SKILL.md`

## Commit & PR Guidelines

- Run `npm test` before every commit
- Commit messages: concise, imperative mood (e.g., "Add reminder faculty", "Fix constitution compliance check")
- If changing the constitution, explain the ethical reasoning in the PR description
- If changing the generator, verify all presets still generate correctly
- If changing templates, check that generated SKILL.md output is valid markdown
