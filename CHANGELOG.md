# Changelog

All notable changes to OpenPersona are documented here.

---

## [0.21.0] — 2026-04-19

### New: Unified CLI Architecture

OpenPersona now uses a fully symmetric resource-namespaced CLI (`kubectl`-style). All persona-ecosystem resources live under one entry point.

**New command namespaces:**

- `openpersona skill install/update/uninstall/list/search/publish/info` — full agent skill pack lifecycle
- `openpersona persona <action>` — namespace aliases for all 18 existing root persona commands
- `openpersona model install/publish` — stub (placeholder for v1.0 persona model registry)

**Smart root router:**

`openpersona install <target>` now auto-detects pack type and routes accordingly:
- Has `persona.json` → installs to `~/.openpersona/` (persona pack)
- Only `SKILL.md` → installs to `.agents/skills/` (skill pack)

**New flags on `openpersona install` and `openpersona skill install`:**
- `--runtime=<claude|cursor|openclaw|hermes|openpersona>` — install to a specific agent's skill dir
- `--global` — install to `~/.agents/skills/` (user-global AGENTS.md convention)
- `--all` — mirror to all detected runtime dirs in CWD

**Default skill install target:** `.agents/skills/<slug>/` — the AGENTS.md universal convention, auto-discovered by Cursor, Claude Code, and OpenClaw without extra configuration.

### New Modules

- `lib/skill/installer.js` — skill installer with multi-target support
- `lib/skill/uninstaller.js` — skill uninstaller (registry-based installTarget lookup)
- `lib/skill/updater.js` — skill updater (re-downloads from recorded source URL)
- `lib/skill/publisher.js` — skill publisher (POST to openpersona.co/api/skills/publish; graceful fallback if endpoint not yet live)
- `lib/skill/searcher.js` — skill searcher (queries openpersona.co/api/skills; graceful 404 fallback)

### Registry Changes

- `lib/registry/index.js` `registryAdd()` now accepts an `opts` object with:
  - `installTarget` — absolute path where the skill/persona was installed (used by `uninstall` and `update`)
  - `source` — original GitHub owner/repo or local path
  - `resourceType` — `'persona'` (default) or `'skill'`
- All new skill installs record `installTarget` for reliable uninstall/update

### Behavior Change

- `openpersona install <SKILL.md-only pack>` now installs to `.agents/skills/` (was: `~/.openpersona/`)
- This was undocumented behavior; existing persona-pack installs are unchanged

### Documentation

- `skills/open-persona/SKILL.md` — companion skill install commands updated from `npx skills add` to `openpersona skill install`
- `skills/brand-persona-skill/README.md` — updated install instructions
- `README.md` — new "Unified Command Surface" section with migration guide
- `skills/open-persona/SKILL.md` version bumped to 0.21.0

### Tests

- Added `tests/skill/skill-lifecycle.test.js` with 29 new test cases
- Total: 680 tests, 0 failures (was 651)

### Accumulated since 0.20.0

- `skills/secondme-skill/` — SecondMe persona skill pack integration
- `skills/entrepreneur-skill/` — Entrepreneur persona skill pack
- `skills/brand-persona-skill/` — Brand agent meta-skill (distill any commercial entity into an agent)
- `openpersona dataset install/publish` — HuggingFace persona dataset directory
- MLX and Unsloth training backends in persona-model-trainer
- Curator normalization improvements (`lib/remote/curator.js`)
- Publisher fetch timeout fix (`lib/publisher/index.js`) — 10s hard limit prevents indefinite hanging
- npm package size reduced from 33.4MB to 234kB via `package.json files[]` allowlist

---

## [0.20.0] and earlier

See git log for earlier changes.
