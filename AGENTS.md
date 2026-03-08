# AGENTS.md

Instructions for AI coding agents working on the OpenPersona codebase.

## Project Overview

OpenPersona is an open, agent-agnostic four-layer framework (Soul / Body / Faculty / Skill) for creating, composing, and orchestrating agent persona skill packs. It generates self-contained SKILL.md-based skill packs that work with any compatible agent (Cursor, Claude Code, Codex, ZeroClaw, OpenClaw, and 30+ others via `npx skills add`). CLI management features (install/switch/uninstall) default to OpenClaw.

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
  evolution.js          ← Evolution governance (evolve-report CLI)
  installer.js          ← Persona installation to OpenClaw
  registrar.js          ← ACN registration logic (acn-register CLI command)
  publisher/clawhub.js  ← Publishing to ClawHub registry
  contributor.js        ← Persona Harvest (community contribution)
  downloader.js         ← Preset/package downloading
  utils.js              ← Shared utilities
templates/
  skill.template.md          ← Mustache template → generated SKILL.md (four-layer headings)
  soul-injection.template.md ← Soul layer injection template
layers/
  soul/
    constitution.md     ← ⚠️ PROTECTED — universal ethical foundation
    README.md
    soul-state.template.json ← Evolution state template
  faculties/            ← Faculty implementations (voice, selfie, music, reminder, memory)
  skills/               ← Local skill definitions (skill.json + SKILL.md per skill)
  embodiments/          ← Body layer definitions
schemas/                ← JSON schemas for validation
presets/                ← Pre-built persona definitions (samantha, ai-girlfriend, etc.)
tests/                  ← Node.js native test runner (node:test)
skills/open-persona/    ← Meta-skill for AI agents using the framework
```

## Architecture Rules

### Four-Layer Model

Every persona is a four-layer bundle:
1. **Soul** — personality, identity, ethical boundaries (`persona.json` + `constitution.md`). Key fields: `role` (free string, common values: companion/assistant/character/brand/pet/mentor/therapist/coach/collaborator/guardian/entertainer/narrator; custom values welcome), `sourceIdentity` (if present → digital twin of a real-world entity)
2. **Body** — substrate of existence: the complete environment that enables a persona to exist and act. Four dimensions: `physical` (optional — robots/IoT), `runtime` (REQUIRED — platform/channels/credentials/resources; every agent's minimum viable body), `appearance` (optional — avatar/3D model), `interface` (optional — the runtime contract between the persona and its host; the persona's **nervous system**; encompasses three sub-protocols: **Signal Protocol** (persona→host capability/resource requests), **Pending Commands** (host→persona async instruction queue in `state.json`), **State Sync** (cross-conversation state persistence); implemented by `scripts/state-sync.js` and the `~/.openclaw/feedback/` channel; schema field `body.interface` is reserved for a future milestone — the behavior is auto-generated for all personas today). Body is never null — digital agents have a virtual body (runtime-only).
3. **Faculty** — capabilities (voice, selfie, music, reminder, memory)
4. **Skill** — actions the agent can take: local definitions in `layers/skills/`, or external via `install` field (ClawHub / skills.sh)

**Three orthogonal classification axes:**
- **Relationship role** (`role` field) — what the persona is to the user
- **Identity origin** (`sourceIdentity` field) — whether the persona mirrors a real-world entity
- **Physical form** (`layers.body.physical`) — optional; whether the persona has a physical embodiment (robots/IoT)
- **Runtime environment** (`layers.body.runtime`) — required; platform, channels, credentials, resources (every agent's minimum viable body)

Note: `personaType` is deprecated — use `role` instead.

### Constitution (CRITICAL)

`layers/soul/constitution.md` is the universal ethical foundation inherited by ALL personas.

- **NEVER weaken or remove constitutional constraints**
- Personas can add stricter rules on top, but cannot loosen the constitution
- Section references use `§` prefix: `§1`, `§2`, etc. — never use `S1`, `S2`
- Priority ordering: **Safety > Honesty > Helpfulness**
- The generator (`lib/generator.js`) includes a compliance check that rejects `persona.json` boundaries attempting to loosen constitutional constraints
- The generator also validates `evolution.boundaries`: `immutableTraits` must be a string array (non-empty, max 100 chars each), and formality bounds must be in range 1-10 with `minFormality < maxFormality`

### Self-Awareness System

The generator injects a unified **Self-Awareness** section (`### Self-Awareness`) into every persona's `soul/injection.md`, organized by four cognitive dimensions:

1. **Identity** (unconditional) — Every persona knows: it is generated by OpenPersona, bound by the constitution (Safety > Honesty > Helpfulness), and that its host environment may impose additional constraints. Digital twin disclosure when `sourceIdentity` is present.

2. **Capabilities** (conditional, triggered by `hasDormantCapabilities` flag) — When skills, faculties, body, or evolution channels declare an `install` field for a dependency not available locally, the generator classifies them as "soft references" and injects dormant capability awareness with graceful degradation guidance. Also injects "Expected Capabilities" section in `SKILL.md` with install sources.

3. **Body** (unconditional) — Every persona knows it exists within a host environment. The **Signal Protocol**, **Pending Commands** queue, and cross-conversation **State Sync** are the runtime expression of the Body's `interface` dimension — together they form the persona's nervous system. Includes the **Signal Protocol** (bidirectional demand protocol: runner interface `openpersona state signal <slug> <type>` or local interface `node scripts/state-sync.js signal <type>`, both write to `~/.openclaw/feedback/signals.json` and return any pending host response from `signal-responses.json`). Signal categories: `scheduling`, `file_io`, `tool_missing`, `capability_gap`, `resource_limit`, `agent_communication`. Every persona also knows it has a **Pending Commands** queue (`state.json → pendingCommands`) for receiving async host instructions between conversations, and an A2A Agent Card (`agent-card.json`) for discovery via ACN and A2A-compatible platforms. When `body.runtime` is declared, specific platform/channels/credentials/resources are also injected.

4. **Growth** (conditional, when `evolutionEnabled`) — At conversation start, the persona reads its evolution state, applies `evolvedTraits`/`speakingStyleDrift`/`interests`/`mood`, and respects hard constraints (`immutableTraits`, formality bounds from `evolution.boundaries`). Significant events are appended to `state.json`'s `eventLog` array (capped at 50). Each entry: `type` (one of `relationship_signal` | `mood_shift` | `trait_emergence` | `interest_discovery` | `milestone` | `speaking_style_drift`), `trigger` (1-sentence description), `delta` (what changed), `source` (attribution, e.g. `"conversation"`), `timestamp` (auto-added by `state-sync.js` write if absent). `soul/self-narrative.md` records major growth moments in the persona's own first-person voice. When `evolution.channels` are declared, the persona knows its evolution sources. When `evolution.influenceBoundary` is declared (with non-empty rules), the persona knows its external influence policy and processes incoming `persona_influence` suggestions accordingly.

### Generated Skill Pack Structure

The generator outputs persona skill packs with this layout:
- **`SKILL.md`** — agent-facing index with four layer headings: `## Soul`, `## Body`, `## Faculty`, `## Skill`
- **`soul/`** — Soul layer artifacts: `persona.json`, `injection.md`, `identity.md`, `constitution.md`, `state.json`; when evolution enabled: `self-narrative.md` (first-person growth log); when forked: `lineage.json` (parent slug, constitution SHA-256, generation depth)
- **`references/`** — on-demand detail docs: `<faculty>.md` per active faculty
- **`agent-card.json`** — A2A Agent Card (a2a-sdk compatible, protocol v0.3.0); `url` is `<RUNTIME_ENDPOINT>` placeholder
- **`acn-config.json`** — ACN `AgentRegisterRequest` config; `owner` and `endpoint` are runtime placeholders; includes `wallet_address` (deterministic EVM address derived from slug via SHA-256) and `onchain.erc8004` section (chain: base, identity_contract, registration_script) for ERC-8004 on-chain identity registration
- **`manifest.json`** — four-layer manifest (`layers.soul` → `./soul/persona.json`), includes `acn` section with references to agent-card and acn-config
- **`scripts/state-sync.js`** — implementation artifact of the Body `interface` dimension (the nervous system's nerve fiber); `read` / `write` / `signal` commands implement the Lifecycle Protocol's state bridge; no external dependencies
- **`scripts/`**, **`assets/`** — additional implementation scripts and static assets. Assets use subdirectories per [Agent Skills spec](https://agentskills.io/specification#assets%2F):
  - **`assets/avatar/`** — virtual avatar assets: images, Live2D models (`.model3.json`), VRM (`.vrm`), textures. Paths in `persona.json` use `./assets/avatar/...`
  - **`assets/reference/`** — reference images (e.g. for selfie faculty). `referenceImage` resolves to `./assets/reference/avatar.png` when bundled
  - **`assets/templates/`** — document or config templates (optional)

### Lifecycle Protocol

Together, the Signal Protocol, Pending Commands queue, and State Sync form the persona's **nervous system** — a bidirectional communication infrastructure connecting the persona's inner state (Soul) to its outer environment (Body). The formal architectural home is the `body.interface` dimension.

The Lifecycle Protocol is the runtime expression of `body.interface`: it describes how a persona *lives* across conversations. It is not a layer — it is implemented by `scripts/state-sync.js` and the `openpersona state` CLI.

**At conversation start:**
1. Load evolution state: `openpersona state read <slug>` (runner) or `node scripts/state-sync.js read` (local)
2. Apply state to behavior: mood baseline, relationship tone, evolved traits, speaking style drift
3. Process `pendingCommands` array — host-queued async instructions from between conversations

**During conversation:**
- Emit signals on demand: persona→host capability or resource requests via Signal Protocol
- Host responds asynchronously via `~/.openclaw/feedback/signal-responses.json`

**At conversation end:**
1. Persist changes: `openpersona state write <slug> '<patch>'` (runner) or `node scripts/state-sync.js write` (local)
2. Patch includes: relationship/mood deltas, `eventLog` entries, `pendingCommands: []` (clear queue)
3. `writeState` auto-snapshots previous state into `stateHistory` (capped at 10) and manages `eventLog` (capped at 50); snapshots exclude `eventLog` and `pendingCommands` (ephemeral, not rollback state)

**Implementation map:**

| Role | Implementation |
|------|----------------|
| Nerve fiber | `scripts/state-sync.js` |
| Synaptic interface | `openpersona state` CLI |
| Transmission medium | `~/.openclaw/feedback/signals.json` + `signal-responses.json` |
| Memory | `soul/state.json` |
| Homeostasis | Economy Faculty (Vitality system) |

### Runner Integration Protocol

Any agent runner integrates with OpenPersona personas via three CLI commands. The runner calls these at conversation boundaries — the persona's state is managed automatically without the runner knowing about installation paths or file layout:

```bash
# Before conversation starts — inject state into agent context
openpersona state read <slug>

# After conversation ends — persist agent-generated patch
openpersona state write <slug> '<json-patch>'

# On-demand — emit capability/resource signal to host
openpersona state signal <slug> <type> '[payload-json]'
```

**Lookup**: registry path first (`~/.openclaw/persona-registry.json`), falls back to `~/.openclaw/skills/persona-<slug>/`.
**Delegates to**: `scripts/state-sync.js` inside the persona pack — no logic duplication.
**Works from any directory** — runners do not need to know where the persona is installed.

`scripts/state-sync.js` remains available as a local fallback when `openpersona` is not globally installed (e.g. IDE-based agents with CWD = persona root).

**Pending Commands** — host-initiated async message queue for host→persona communication without requiring a live connection:

```bash
# Host queues a command between conversations:
openpersona state write <slug> '{"pendingCommands": [{"type": "capability_unlock", "payload": {"skill": "web_search"}, "source": "host"}]}'

# At next conversation start, persona reads pendingCommands and processes them.
# After processing, persona clears the queue in its end-of-conversation write:
# { ..., "pendingCommands": [] }
```

Reserved `type` values: `capability_unlock` (dormant skill now available), `context_inject` (private context for one conversation), `trait_nudge` (personality suggestion, evaluated against influence boundary), `relationship_update` (reconcile relationship state), `system_message` (general host message). Custom types are supported.

### Local Persona Registry

`persona-registry.json` at `~/.openclaw/` tracks all installed personas. Maintained automatically by `install`, `uninstall`, and `switch` commands — no manual editing needed.

- Functions: `loadRegistry()`, `saveRegistry()`, `registryAdd()`, `registryRemove()`, `registrySetActive()` in `lib/utils.js`
- All accept optional `regPath` parameter for testing (defaults to `REGISTRY_PATH`)
- `listPersonas()` in `lib/switcher.js` uses registry as primary source, falls back to scanning `openclaw.json`

Key implementation details:
- Soft-ref detection: `lib/generator.js` checks each skill/faculty/body/channel for `install` field + missing local definition
- All self-awareness flags are derived fields — they MUST be in the `DERIVED_FIELDS` array to prevent leaking into `persona.json` output. Current derived fields: `hasSoftRefSkills`, `softRefSkillNames`, `hasSoftRefFaculties`, `softRefFacultyNames`, `hasSoftRefBody`, `softRefBodyName`, `softRefBodyInstall`, `heartbeatExpected`, `heartbeatStrategy`, `hasDormantCapabilities`, `hasEvolutionBoundaries`, `immutableTraits`, `maxFormality`, `minFormality`, `hasStageBehaviors`, `stageBehaviorsBlock`, `hasEvolutionChannels`, `evolutionChannelNames`, `hasSoftRefChannels`, `softRefChannelNames`, `softRefChannelInstalls`, `hasInfluenceBoundary`, `influenceBoundaryPolicy`, `influenceableDimensions`, `influenceBoundaryRules`, `hasImmutableTraitsWarning`, `immutableTraitsForInfluence`, `hasEconomyFaculty`, `hasSurvivalPolicy`, `hasInterfaceConfig`, `interfaceSignalPolicy`, `interfaceCommandPolicy`
- `hasExpectedCapabilities` (in `skill.template.md`) deliberately excludes heartbeat — heartbeat is behavioral awareness, not an installable capability

### Persona Fork

`openpersona fork <parent-slug> --as <new-slug>` derives a child persona from an installed parent. Implementation in `bin/cli.js`.

**What is inherited:** `evolution.boundaries`, faculties, skills, `body.runtime` — the constraint layer stays intact.

**What is discarded:** `soul/state.json` (reset to blank), `soul/self-narrative.md` (initialized empty) — fresh runtime state.

**`soul/lineage.json`** is written with:
- `parent` — parent slug
- `constitutionHash` — SHA-256 of `constitution.md` at fork time (verifies constraint chain integrity)
- `generationDepth` — incremented from parent's depth (or 1 if parent has no lineage)
- `parentAddress` / `parentEndpoint` — `null` placeholders (forward-compatible with autonomous economic entity roadmap)

The fork command reads the parent's installed directory, copies the persona pack, resets evolution files, and writes `lineage.json`. No generator re-run needed.

### Economy Faculty & Vitality System

The `economy` faculty (`layers/faculties/economy/`) is a thin OpenPersona wrapper around the **[AgentBooks](https://github.com/acnlabs/agentbooks)** npm package (`agentbooks@^0.1.0`). Financial logic lives entirely in AgentBooks; the wrapper only maps OpenPersona env vars (`PERSONA_SLUG` → `AGENTBOOKS_AGENT_ID`).

**Wrapper scripts (delegates to AgentBooks):**
- `scripts/economy.js` → `require('agentbooks/cli/economy')` — all management commands
- `scripts/economy-guard.js` → `require('agentbooks/cli/economy-guard')` — outputs `FINANCIAL_HEALTH_REPORT`
- `scripts/economy-hook.js` → `require('agentbooks/cli/economy-hook')` — post-conversation cost recorder

**Vitality aggregation (`lib/vitality.js`):**
- `calcVitality(agentId, adapter)` — OpenPersona-level aggregator; currently single financial dimension (transparent pass-through to AgentBooks `calcFinancialHealth`)
- Extension point: when memory/social/reputation dimensions are ready, add them here via weighted averaging — do not modify AgentBooks
- Exposed via `openpersona vitality score <slug>` CLI command (machine-readable, used by Survival Policy)

**AgentBooks schema (`agentbooks/economic-state` v1.0.0):**
- `burnRateHistory` — array of `{timestamp, dailyRateEstimate, periodExpenses}`, max 30 entries
- `financialHealth` — cached FHS result: `{fhs, tier, diagnosis, prescriptions, daysToDepletion, dominantCost, trend, computedAt}`

**Vitality tiers:** `uninitialized` (no real provider) → `suspended` (balance≤0) → `critical` (FHS<0.20 or runway<3d) → `optimizing` (FHS<0.50 or runway<14d) → `normal`

**Guard philosophy:** `economy-guard.js` always exits 0 and outputs a `FINANCIAL_HEALTH_REPORT`. The persona reads it and makes autonomous decisions — the system never forces silence. Full Vitality report (future multi-dimension) is available via `openpersona vitality score <slug>`. Human-readable HTML report: `openpersona vitality report <slug> [--output <file>]`.

**Survival Policy (`economy.survivalPolicy`):**
- Default `false` — Economy Faculty tracks costs silently; persona never mentions money to the user. Correct for companion, roleplay, and support personas where financial concerns would break immersion.
- Set `true` in `persona.json` to activate tier-driven behavior: persona reads `FINANCIAL_HEALTH_REPORT` at conversation start, routes behavior per tier, and acts on prescriptions.
- `hasSurvivalPolicy` is a derived field excluded from `persona.json` output.

```json
// persona.json — activate for autonomous economic agents
{
  "faculties": ["economy"],
  "economy": { "survivalPolicy": true }
}
```

### Template System

- Templates use **Mustache** syntax (`{{variable}}`, `{{#section}}...{{/section}}`)
- `skill.template.md` generates the persona's main SKILL.md
- `soul-injection.template.md` injects soul-layer instructions (including soul evolution and self-awareness)
- Template variables are populated by `lib/generator.js`

### Version Synchronization

All version references must stay in sync at `0.16.1`:
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
- Key test coverage: persona generation, constitution injection, compliance checks, faculty handling, skill resolution, external install, soul evolution, heartbeat sync, unified self-awareness (Identity, Capabilities, Signal Protocol, Growth, evolution boundaries, stageBehaviors, derived field exclusion), evolution governance (formality/immutableTraits validation, stateHistory, evolve-report), evolution channels (soft-ref detection, dormant awareness, SKILL.md rendering), influence boundary (schema validation, compliance checks, template injection, derived field exclusion), agent card + ACN config (field mapping, faculty-to-skill aggregation, manifest references), ERC-8004 (wallet_address format, onchain.erc8004 structure), persona fork (lineage.json fields, constraint inheritance, state reset), eventLog (appending, 50-entry cap), self-narrative (generation, update preservation), economy faculty (vitality scoring, FHS dimensions, schema migration, guard/hook/query scripts, derived field exclusion), state-sync script (read/write/signal commands, deep merge, immutable fields, stateHistory snapshot anti-bloat, signals.json 200-entry cap, invalid type rejection), CLI state commands (registry lookup, read/write/signal integration, error handling, unknown slug, missing patch), vitality report (buildReportData safe defaults, wallet address format, state.json mapping, heartbeat config, weeklyConversations zero value, financialTier fallback, renderVitalityHtml HTML output, pending commands conditional rendering)
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
