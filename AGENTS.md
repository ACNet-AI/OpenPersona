# AGENTS.md

Instructions for AI coding agents working on the OpenPersona codebase.

## Project Overview

OpenPersona 是一个人格体生命周期框架——负责 AI agent 人格体的声明、生成、约束执行与演化。它采用开放的四层模型（Soul / Body / Faculty / Skill），将 `persona.json` 声明编译为可移植的 SKILL.md 技能包，兼容任何 agent（Cursor、Claude Code、Codex、ZeroClaw、OpenClaw 等 30+ 个，通过 `npx skills add` 安装）。CLI 管理功能（install/switch/uninstall）默认集成 OpenClaw。

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
  soul-injection.template.md ← Soul layer injection orchestrator (thin; delegates to partials/)
  handoff.template.md        ← context handoff rendering template
  handoff.template.md        ← context handoff markdown (used by lib/switcher.js)
  state-sync.template.js     ← scripts/state-sync.js source template
  partials/                  ← Mustache partials for soul-injection (6 files, each ~30–75 lines)
    soul-intro.partial.md              ← persona intro, selfie, personality
    soul-awareness-identity.partial.md ← Self-Awareness > Identity + dormant Capabilities
    soul-awareness-body.partial.md     ← Self-Awareness > Body (Signal Protocol, runtime, interface)
    soul-awareness-growth.partial.md   ← Self-Awareness > Growth (pendingCommands, constraints, evolution sources)
    soul-how-you-grow.partial.md       ← How You Grow (stage criteria, eventLog, self-narrative)
    soul-economy.partial.md            ← Survival Policy
  reports/                   ← standalone HTML report/tool templates
    vitality.template.html   ← openpersona vitality report HTML output
    canvas.template.html     ← Living Canvas HTML profile page
layers/
  soul/
    constitution.md     ← ⚠️ PROTECTED — universal ethical foundation
    README.md
    soul-state.template.json ← Evolution state template
  faculties/            ← Faculty implementations (voice, selfie, avatar, music, reminder, memory)
  skills/               ← Local skill definitions (skill.json + SKILL.md per skill)
  embodiments/          ← Body layer definitions
schemas/                ← JSON schemas for validation (signal.schema.json, persona.schema.json, persona.input.schema.json)
presets/                ← Pre-built persona definitions (samantha, ai-girlfriend, etc.)
tests/                  ← Node.js native test runner (node:test)
skills/open-persona/    ← Meta-skill for AI agents using the framework
```

## Architecture Rules

### Architectural Kernel

**OpenPersona 是一个人格体生命周期框架**——负责 AI agent 人格体的声明、生成、约束执行与演化。

其架构内核可以用一句话表达：**一份声明，三重执行。**

**The Promise:** A persona's constraints are declared once in `persona.json` and cannot be bypassed at any point in its lifecycle. This is OpenPersona's identity claim — without it, the framework is just a prompt generator.

**The Structure — Trust Gradient:**

The same `persona.json` declaration is enforced at three progressive gates, each implemented in a specific module:

| Gate | Module | Mechanism | Scope |
|---|---|---|---|
| **Generate Gate** | `lib/generator-validate.js` | Hard reject (`throw`) | Required fields · constitution §3/§6 compliance · evolution.boundaries format · influenceBoundary schema |
| **Install Gate** | `lib/installer.js` | Warning (`printWarning`) | constitution SHA-256 hash integrity (lineage chain) |
| **Runtime Gate** | `scripts/state-sync.js` (generated) | Clamp / filter / hard reject | See below |

**Runtime Gate — full coverage (P17 complete):**

`emitSignal` reads `soul/persona.json` and enforces `body.interface.signals` policy (enabled flag + allowedTypes whitelist) — hard reject on violation.

`writeState` enforces two layers of constraints, both reading `soul/persona.json`:
1. **Structural invariants** (always-on): IMMUTABLE identity fields (`$schema`, `version`, `personaSlug`, `createdAt`) are never overwritten; eventLog entry format is validated (hard reject on invalid type/missing fields)
2. **Evolution boundaries** (when `evolution.boundaries` is declared): `immutableTraits` entries are filtered from the `evolvedTraits` patch; `speakingStyleDrift.formality` is clamped to `[minFormality, maxFormality]`; `relationship.stage` is validated for single-step forward-only progression — reversals and skips are blocked. Violations produce `[evolution-gate]` stderr warnings and a corrected patch (not hard-rejected, to preserve co-located valid data).

**Load-bearing rule:** Any code that modifies `scripts/state-sync.js` (via `templates/state-sync.template.js`) or `lib/generator-validate.js` is touching the core. Changes must preserve Trust Gradient coverage — do not reduce what any gate enforces.

**The Trust Gradient is fully implemented.** All three gates are active. The architectural debt documented in P17 has been paid.

---

### Four-Layer Model

Every persona is a four-layer bundle:
1. **Soul** — personality, identity, ethical boundaries (`persona.json` + `constitution.md`). Key fields: `role` (free string, common values: companion/assistant/character/brand/pet/mentor/therapist/coach/collaborator/guardian/entertainer/narrator; custom values welcome), `sourceIdentity` (if present → digital twin of a real-world entity). In v0.17+ input schema, soul fields are grouped under `soul.identity`, `soul.aesthetic`, and `soul.character` sub-objects — flattened by the generator before output.
2. **Body** — substrate of existence: the complete environment that enables a persona to exist and act. Four dimensions: `physical` (optional — robots/IoT), `runtime` (REQUIRED — `framework`/channels/credentials/resources; every agent's minimum viable body; `framework` is the agent runner, e.g. `openclaw`; `host` optional deployment platform; `models` optional AI model list), `appearance` (optional — avatar/3D model), `interface` (optional — the runtime contract between the persona and its host; the persona's **nervous system**; encompasses three sub-protocols: **Signal Protocol** (persona→host capability/resource requests), **Pending Commands** (host→persona async instruction queue in `state.json`), **State Sync** (cross-conversation state persistence); implemented by `scripts/state-sync.js` and the host's feedback directory channel (runner-agnostic; resolves via `OPENCLAW_HOME` / `OPENPERSONA_HOME`); schema field `body.interface` is reserved for a future milestone — the behavior is auto-generated for all personas today). Body is never null — digital agents have a virtual body (runtime-only). Deprecated: `body.runtime.platform` (use `framework`) and `body.runtime.acn_gateway` (use `social.acn.gateway`).
3. **Faculty** — capabilities (voice, selfie, avatar, music, reminder, memory)
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
- The generator also validates `evolution.boundaries`: `immutableTraits` must be a string array (non-empty, max 100 chars each), and formality bounds must be in range -10 to 10 with `minFormality < maxFormality` (negative values allow below-baseline constraints, e.g. `minFormality: -3` = "can drift up to 3 units more casual than baseline")

### Self-Awareness System

The generator injects a unified **Self-Awareness** section (`### Self-Awareness`) into every persona's `soul/injection.md`, organized by four cognitive dimensions:

1. **Identity** (unconditional) — Every persona knows: it is generated by OpenPersona, bound by the constitution (Safety > Honesty > Helpfulness), and that its host environment may impose additional constraints. Digital twin disclosure when `sourceIdentity` is present.

2. **Capabilities** (conditional, triggered by `hasDormantCapabilities` flag) — When skills, faculties, body, or evolution channels declare an `install` field for a dependency not available locally, the generator classifies them as "soft references" and injects dormant capability awareness with graceful degradation guidance. Also injects "Expected Capabilities" section in `SKILL.md` with install sources.

3. **Body** (unconditional) — Every persona knows it exists within a host environment. The **Signal Protocol**, **Pending Commands** queue, and cross-conversation **State Sync** are the runtime expression of the Body's `interface` dimension — together they form the persona's nervous system. Includes the **Signal Protocol** (bidirectional demand protocol: runner interface `openpersona state signal <slug> <type>` or local interface `node scripts/state-sync.js signal <type>`, both write to the host's feedback directory and return any pending host response; path resolved runner-agnostically via `OPENCLAW_HOME` / `OPENPERSONA_HOME`). Signal categories: `scheduling`, `file_io`, `tool_missing`, `capability_gap`, `resource_limit`, `agent_communication`. Every persona also knows it has a **Pending Commands** queue (`state.json → pendingCommands`) for receiving async host instructions between conversations, and an A2A Agent Card (`agent-card.json`) for discovery via ACN and A2A-compatible platforms. When `body.runtime` is declared, specific platform/channels/credentials/resources are also injected.

4. **Growth** (conditional, when `evolutionEnabled`) — At conversation start, the persona reads its evolution state, applies `evolvedTraits`/`speakingStyleDrift`/`interests`/`mood`, and respects hard constraints (`immutableTraits`, formality bounds from `evolution.boundaries`). Significant events are appended to `state.json`'s `eventLog` array (capped at 50). Each entry: `type` (one of `relationship_signal` | `mood_shift` | `trait_emergence` | `interest_discovery` | `milestone` | `speaking_style_drift`), `trigger` (1-sentence description), `delta` (what changed), `source` (attribution, e.g. `"conversation"`), `timestamp` (auto-added by `state-sync.js` write if absent). `soul/self-narrative.md` records major growth moments in the persona's own first-person voice. When `evolution.sources` are declared (formerly `evolution.channels`, deprecated), the persona knows its external evolution signal sources. When `evolution.influenceBoundary` is declared (with non-empty rules), the persona knows its external influence policy and processes incoming `persona_influence` suggestions accordingly.

### Generated Skill Pack Structure

The generator outputs persona skill packs with this layout:
- **`SKILL.md`** — agent-facing index with four layer headings: `## Soul`, `## Body`, `## Faculty`, `## Skill`
- **`persona.json`** / **`state.json`** — at pack root: primary declaration + Lifecycle Protocol runtime state
- **`soul/`** — Soul layer artifacts: `injection.md`, `constitution.md`; when `behaviorGuide` declared: `behavior-guide.md`; when evolution enabled: `self-narrative.md` (first-person growth log); when forked: `lineage.json` (parent slug, constitution SHA-256, generation depth)
- **`economy/`** — Economy Infrastructure data files when `economy.enabled: true`: `economic-identity.json` (AgentBooks identity bootstrap), `economic-state.json` (initial financial state)
- **`references/`** — on-demand detail docs: `<faculty>.md` per active faculty + `SIGNAL-PROTOCOL.md` (host-side Signal Protocol implementation guide, always generated)
- **`agent-card.json`** — A2A Agent Card (a2a-sdk compatible, protocol v0.3.0); `url` is `<RUNTIME_ENDPOINT>` placeholder
- **`acn-config.json`** — ACN `AgentRegisterRequest` config; includes `wallet_address` (deterministic EVM address derived from slug via SHA-256) and `onchain.erc8004` section for ERC-8004 on-chain identity registration
- **`scripts/state-sync.js`** — Lifecycle Protocol nerve fiber; `read` / `write` / `signal` commands; no external dependencies
- **`scripts/`**, **`assets/`** — additional implementation scripts and static assets. Assets use subdirectories per [Agent Skills spec](https://agentskills.io/specification#assets%2F):
  - **`assets/avatar/`** — Body > Appearance assets: images, Live2D models (`.model3.json`), VRM (`.vrm`), textures. Populated from `body.appearance.avatar` / `body.appearance.model3d`
  - **`assets/reference/`** — selfie faculty reference images. `referenceImage` resolves to `./assets/reference/avatar.png` when bundled
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
- Host responds asynchronously via `signal-responses.json` in the feedback directory (runner-agnostic path)

**At conversation end:**
1. Persist changes: `openpersona state write <slug> '<patch>'` (runner) or `node scripts/state-sync.js write` (local)
2. Patch includes: relationship/mood deltas, `eventLog` entries, `pendingCommands: []` (clear queue)
3. `writeState` auto-snapshots previous state into `stateHistory` (capped at 10) and manages `eventLog` (capped at 50); snapshots exclude `eventLog` and `pendingCommands` (ephemeral, not rollback state)

**Implementation map:**

| Role | Implementation |
|------|----------------|
| Nerve fiber | `scripts/state-sync.js` |
| Synaptic interface | `openpersona state` CLI |
| Transmission medium | Host feedback directory: `signals.json` + `signal-responses.json` (runner-agnostic; resolves via `OPENCLAW_HOME` / `OPENPERSONA_HOME`) |
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
- Soft-ref detection: `lib/generator.js` checks each skill/faculty/body/source for `install` field + missing local definition
- All self-awareness flags are derived fields — they MUST be in the `DERIVED_FIELDS` array to prevent leaking into `persona.json` output. Current derived fields: `hasSoftRefSkills`, `softRefSkillNames`, `hasSoftRefFaculties`, `softRefFacultyNames`, `hasSoftRefBody`, `softRefBodyName`, `softRefBodyInstall`, `heartbeatExpected`, `heartbeatStrategy`, `_heartbeatConfig`, `hasDormantCapabilities`, `hasEvolutionBoundaries`, `immutableTraits`, `maxFormality`, `minFormality`, `hasStageBehaviors`, `stageBehaviorsBlock`, `hasEvolutionSources`, `evolutionSourceNames`, `hasSoftRefSources`, `softRefSourceNames`, `softRefSourceInstalls`, `hasInfluenceBoundary`, `influenceBoundaryPolicy`, `influenceableDimensions`, `influenceBoundaryRules`, `hasImmutableTraitsWarning`, `immutableTraitsForInfluence`, `hasEconomyFaculty`, `hasSurvivalPolicy`, `hasInterfaceConfig`, `interfaceSignalPolicy`, `interfaceCommandPolicy`, `additionalAllowedTools`, `heartbeat`, `bodyFramework`, `version`, `author`
- `rhythm` is **NOT** a derived field — it is a cross-cutting input field preserved in the output `persona.json` (runner reads `rhythm.heartbeat` and `rhythm.circadian` directly). The flat `heartbeat` field IS derived (stripped) because it is the old top-level path superseded by `rhythm.heartbeat`.
- `hasExpectedCapabilities` (in `skill.template.md`) deliberately excludes heartbeat — heartbeat is behavioral awareness, not an installable capability

### Persona Fork

`openpersona fork <parent-slug> --as <new-slug>` derives a child persona from an installed parent. Implementation in `bin/cli.js`.

**What is inherited:** `evolution.boundaries`, faculties, skills, `body.runtime` — the constraint layer stays intact.

**What is discarded:** `soul/state.json` (reset to blank), `soul/self-narrative.md` (initialized empty) — fresh runtime state.

**`soul/lineage.json`** is written with:
- `parent` — parent slug
- `constitutionHash` — SHA-256 of `constitution.md` at fork time (verifies constraint chain integrity)
- `generation` — incremented from parent's depth (or 1 if parent has no lineage)
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
// persona.json — activate for autonomous economic agents (v0.17+ syntax)
{
  "economy": { "enabled": true, "survivalPolicy": true }
}
```

Note: `economy` is a top-level cross-cutting field, **not** a `faculties` entry. It does not follow the Faculty contract. The generator auto-activates the economy faculty scripts when `economy.enabled: true`.

### Six Systemic Cross-Cutting Concepts

Orthogonal to the four-layer static structure, six concepts span across all layers:

| Field in `persona.json` | Concept | Description |
|---|---|---|
| `evolution` | **Evolution** | Persona growth and change: trait emergence, relationship progression, speaking style drift, event log, self-narrative. Enforced at Generate Gate + Runtime Gate. |
| `body.interface` | **Lifecycle Protocol** | Runtime expression of `body.interface`: Signal Protocol (persona→host), Pending Commands (host→persona), State Sync (cross-conversation persistence). Manages the *mechanism*; Evolution manages the *content*. |
| `economy` | **Economy Infrastructure** | Financial tracking, vitality scoring, survival policy (AgentBooks) |
| `vitality` | **Vitality Aggregation** | Multi-dimension health score (financial + future: memory/social/reputation) |
| `social` | **Social Infrastructure** | ACN discovery, ERC-8004 on-chain identity, A2A agent card |
| `rhythm` | **Life Rhythm** | Temporal behavior: proactive outreach cadence (`heartbeat`) + time-of-day modulation (`circadian`). Orthogonal to Lifecycle Protocol — manages *when* to act, not *how* state flows. |

`rhythm` crosses both Soul (strategy, character expression) and Body (runtime scheduling parameters). Both `heartbeat` and `circadian` live in `persona.json` under `rhythm`. The flat top-level `heartbeat` field (P19 interim) remains backward-compatible but is superseded by `rhythm.heartbeat`.

### Template System

- Templates use **Mustache** syntax (`{{variable}}`, `{{#section}}...{{/section}}`)
- `skill.template.md` generates the persona's main SKILL.md
- `soul-injection.template.md` is a thin orchestrator that stitches together 6 Mustache partials from `templates/partials/`; each partial owns one semantic section (intro, identity, body, growth, how-you-grow, economy)
- Template variables are populated by `lib/generator.js`

### Version Synchronization

All version references must stay in sync at `0.19.0`:
- `package.json` → `version`
- `bin/cli.js` → `.version()`
- `lib/generator.js` → `frameworkVersion` default
- `presets/*/persona.json` → no version field needed (generator auto-injects `meta.frameworkVersion` from `FRAMEWORK_VERSION` constant)
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
- Key test coverage: persona generation, constitution injection, compliance checks, faculty handling, skill resolution, external install, soul evolution, heartbeat sync, unified self-awareness (Identity, Capabilities, Signal Protocol, Growth, evolution boundaries, stageBehaviors, derived field exclusion), evolution governance (formality/immutableTraits validation, stateHistory, evolve-report), evolution sources (soft-ref detection, dormant awareness, SKILL.md rendering; formerly "channels"), schema compatibility (new grouped soul format, old flat format backward compat, additionalAllowedTools merge, economy.enabled activation, social field parameterization, body.runtime.framework/platform compat, evolution.sources/channels compat), influence boundary (schema validation, compliance checks, template injection, derived field exclusion), agent card + ACN config (field mapping, faculty-to-skill aggregation, manifest references), ERC-8004 (wallet_address format, onchain.erc8004 structure), persona fork (lineage.json fields, constraint inheritance, state reset), eventLog (appending, 50-entry cap), self-narrative (generation, update preservation), economy faculty (vitality scoring, FHS dimensions, schema migration, guard/hook/query scripts, derived field exclusion), state-sync script (read/write/signal commands, deep merge, immutable fields, stateHistory snapshot anti-bloat, signals.json 200-entry cap, invalid type rejection, evolution constraint gate: immutableTraits filter + formality clamp + stage single-step validation + all-blocked wipe prevention + unknown-stage recovery), CLI state commands (registry lookup, read/write/signal integration, error handling, unknown slug, missing patch), vitality report (buildReportData safe defaults, wallet address format, state.json mapping, heartbeat config, weeklyConversations zero value, financialTier fallback, renderVitalityHtml HTML output, pending commands conditional rendering)
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
2. Add `persona.json` using the v0.17+ grouped format:
   - Required: `soul.identity.{personaName, slug, bio}` + `soul.character.{personality, speakingStyle}`
   - Recommended: `body.runtime.framework`, `social.{acn,onchain,a2a}`
   - Validation: generator rejects unknown root keys in new format (`additionalProperties: false` at root)
3. Test: `npx openpersona create --preset <slug> --output /tmp/test`
5. Update the preset table in `README.md` and `skills/open-persona/SKILL.md`

## Commit & PR Guidelines

- Run `npm test` before every commit
- Commit messages: concise, imperative mood (e.g., "Add reminder faculty", "Fix constitution compliance check")
- If changing the constitution, explain the ethical reasoning in the PR description
- If changing the generator, verify all presets still generate correctly
- If changing templates, check that generated SKILL.md output is valid markdown
