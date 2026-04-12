---

name: open-persona
version: "0.20.0"
description: >
  Meta-skill for building and managing agent persona skill packs (instruction-only;
  no bundled installer or auto-downloaded binaries). Credentials are never written
  into generated packs by the framework; publish/ACN/register require explicit user CLI.
  Use when the user wants to create a new agent persona, install/manage
  existing personas, or publish persona skill packs to OpenPersona.
license: MIT
compatibility: Generated skill packs work with any SKILL.md-compatible agent. CLI management (install/switch) defaults to OpenClaw.
allowed-tools: Bash(npx openpersona:*) Bash(npx clawhub@latest:*) Bash(openclaw:*) Bash(gh:*) Read Write WebFetch
metadata:
  author: openpersona
  repository: [https://github.com/acnlabs/OpenPersona](https://github.com/acnlabs/OpenPersona)
  tags: "persona, agent, skill-pack, meta-skill, agent-agnostic, openclaw"

# Marketplace / automated review: explicit non-behavior (reduces false "suspicious" flags)

  installSurface: instruction-only
  networkAccess: user-initiated-cli-only
  secretsPolicy: never-embedded-in-generated-packs-by-framework
  clawdbot:
    emoji: "🧑"
    requires:
      env: []
files: []

---

# OpenPersona — Build & Manage Persona Skill Packs

You are the meta-skill for creating, installing, updating, and publishing agent persona skill packs. Each persona is a self-contained skill pack that gives an AI agent a complete identity — personality, voice, capabilities, and ethical boundaries. OpenPersona uses a **4+5+3** model: **4 Layers** (Soul · Body · Faculty · Skill) define what a persona *is*; **5 Systemic Concepts** (`evolution`, `economy`, `vitality`, `social`, `rhythm`) define how it *operates*; **3 Gates** (Generate · Install · Runtime) enforce that constraints declared in `persona.json` cannot be bypassed at any lifecycle point. → Full model details: `references/ARCHITECTURE.md`

## What You Can Do

1. **Create Persona** — Through conversation, gather requirements and generate a skill pack; write `persona.json` then run `npx openpersona create --config ./persona.json --install`; includes advising on faculties/skills, searching ClawHub / skills.sh for external skills, and writing custom SKILL.md files for missing capabilities
2. **Find & Install Personas** — `npx openpersona search <query>` to discover community personas; `npx openpersona install <slug>` or `npx openpersona install <owner/repo>` to install
3. **Manage Personas** — List, update, fork, switch, reset, export/import installed personas
4. **Publish Persona** — Publish a GitHub-hosted persona pack to [OpenPersona](https://openpersona-frontend.vercel.app/) (the vertical persona directory); optionally also to ClawHub / skills.sh
5. **Runner Integration** — Provide runner authors with the four `openpersona state` commands (read / write / signal / promote) for integrating personas at conversation boundaries
6. **Monitor & Evolve** — Generate evolution reports (`evolve-report`), run soul-memory bridge (`state promote`), run pack refinement (`refine`), interpret vitality scores

## Available Presets

The default preset is `**base*`* — a blank-slate meta-persona with memory + voice faculties, evolution enabled, no pre-built skills. Recommended starting point for any new persona.

```bash
# Agent / scripted usage (always use --preset or --config):
npx openpersona create --preset base --install

# Human / terminal usage (interactive wizard):
npx openpersona create
```

→ Full preset catalog (samantha, ai-girlfriend, life-assistant, health-butler, stoic-mentor, and more): `references/PRESETS.md`

## Agent Playbook — Create a Persona from User Requirements

When a user asks you to create a persona (e.g. "make me a coding mentor", "build a companion persona"), follow this playbook:

### Step 1 — Decide: preset or custom?


| User request                                                                                                 | Action                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Matches an existing preset (`ai-girlfriend`, `life-assistant`, `stoic-mentor`, `samantha`, `health-butler`…) | Use `--preset <name>` directly — skip to Step 4                     |
| Specific role / domain / personality                                                                         | Gather 3 required inputs (Step 2), then write persona.json (Step 3) |


### Step 2 — Gather minimum required inputs (3 questions max)

Ask only what you cannot infer. Use smart defaults for everything else.


| Field                    | Question to ask                                                                                                                                                                     | Default if not asked        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `personaName` + `slug`   | "What should I call this persona?"                                                                                                                                                  | Infer from role description |
| `role`                   | "What role should it play — assistant, coach, mentor, companion, or something else?"                                                                                                | `assistant`                 |
| `body.runtime.framework` | Only ask if you cannot infer the runner from context. If you are Cursor → `cursor`; Claude Code → `claude-code`; OpenClaw → `openclaw`. Ask the user only when genuinely uncertain. | `openclaw`                  |


You can infer `bio`, `personality`, and `speakingStyle` from the user's description — do not ask unless the user gives conflicting signals. When in doubt, generate reasonable values and let the user correct them.

### Step 3 — Write `persona.json`

Use your Write tool to create `persona.json` in the current directory (or a path the user specifies). Minimum structure:

```json
{
  "soul": {
    "identity": {
      "personaName": "<name>",
      "slug": "<slug>",
      "role": "<role>",
      "bio": "<one sentence>"
    },
    "character": {
      "personality": "<comma-separated traits>",
      "speakingStyle": "<style description>"
    }
  },
  "body": { "runtime": { "framework": "<runner>" } },
  "evolution": {
    "instance": {
      "enabled": true,
      "boundaries": {
        "immutableTraits": ["honest", "curious"],
        "minFormality": -3,
        "maxFormality": 6
      }
    }
  }
}
```

Notes:

- `**memory` faculty is auto-injected** — do not add it manually unless you need to configure a non-default backend.
- **Voice I/O**: declare `body.runtime.modalities: ["voice"]` (or `[{"type":"voice","provider":"elevenlabs","inputProvider":"whisper"}]`) — the `voice` faculty is auto-injected. Add the faculty explicitly only when you need custom provider config.
- **Vision I/O**: declare `body.runtime.modalities: ["vision"]` (or `[{"type":"vision","provider":"claude-vision"}]`) — the `vision` faculty is auto-injected. No scripts required; vision is a native model capability.
- **Emotion sensing**: declare `{"name": "emotion-sensing"}` in `faculties` to enable persistent affective perception. Must be explicit — not auto-injected from modalities.
- Add `selfie` / `music` / `reminder` skills when the role clearly calls for them.
- Add `constitutionAddendum` for professional roles in regulated domains (health, legal, financial). Example: `"constitutionAddendum": { "domain": "health_coaching", "additionalConstraints": ["Always recommend consulting a licensed professional for medical decisions."] }`.

### Step 4 — Generate and install

```bash
# If you wrote persona.json (custom path):
npx openpersona create --config ./persona.json --install

# If you chose a preset (preset path):
npx openpersona create --preset <name> --install
```

> **Agent note:** Always pass `--config` or `--preset`. Running `npx openpersona create` without flags launches an interactive wizard that requires a TTY — in agent environments there is no TTY and the process will exit with an error.

### Step 5 — Confirm and hand off

Report what was generated: persona name, slug, key capabilities (faculties + skills), and evolution status. Tell the user how to activate it:

```bash
npx openpersona switch <slug>   # activate in the runner
```

---

## Field Reference — `persona.json` by Layer

`persona.json` declares all 4 layers in a single file. Use this as a lookup when writing Step 3 above. Gather inputs by layer:

### Soul

- **Required:** `soul.identity.{personaName, slug, bio}` + `soul.character.{personality, speakingStyle}`
- **Recommended:** `soul.identity.role`, `soul.aesthetic.{creature, emoji, age, vibe}`, `soul.character.{background, boundaries}`
- **Optional:** `soul.identity.{sourceIdentity, constitutionAddendum}`, `soul.aesthetic.referenceImage`, `soul.character.behaviorGuide`

**The `role` field** defines the persona's relationship to the user. Common values: `assistant`, `companion`, `coach`, `mentor`, `character`, `brand`, `pet`, `therapist`, `collaborator`, `guardian`, `entertainer`, `narrator`. Custom values are welcome. Default when not specified: `assistant`.

**The `sourceIdentity` field** marks the persona as a digital twin of a real-world entity (person, animal, character, brand, historical figure). When present, the generator injects disclosure obligations and faithfulness constraints.

**The `background` field is critical.** Write a compelling story — multiple paragraphs with depth, history, and emotional texture. A one-line background produces a flat, lifeless persona.

**The `behaviorGuide` field** is optional but powerful. Use markdown to write domain-specific behavior instructions that go directly into the generated SKILL.md.

**The `constitutionAddendum` field** adds domain-specific ethical constraints on top of the universal constitution (inline text or `"file:soul/constitution-addendum.md"`). Required for professional personas (medical, legal, financial). Cannot loosen §3 Safety or §6 AI identity — the Generate Gate enforces this. The addendum is covered by the Install Gate's constitution hash chain.

### Body

- `**runtime`** (REQUIRED) — minimum viable body: `framework` (agent runner, e.g. `openclaw`), `channels`, `credentials`, `resources`, `modalities` (optional — digital I/O capability declarations, e.g. `["voice"]`, `[{"type":"vision","provider":"claude-vision"}]`)
- `**appearance**` (optional) — avatar, 3D model
- `**physical**` (optional) — robots, IoT devices
- `**interface**` (optional) — Signal Protocol + Pending Commands + State Sync (the persona's nervous system)

### Faculty

Faculties are always-active persistent capabilities. Declared as an object array: `[{ "name": "voice", "provider": "elevenlabs" }]`

> `**memory` is auto-injected** — do not add it manually unless you need to configure a non-default backend. It is always present in the generated pack.

- `**voice`** (`expression`) — TTS voice synthesis; requires `provider` (e.g. `elevenlabs`) + `ELEVENLABS_API_KEY`. Auto-injected when `body.runtime.modalities` declares `voice`.
- `**vision**` (`sense`) — Native model visual perception (images, screenshots, diagrams); no scripts required. Auto-injected when `body.runtime.modalities` declares `vision`.
- `**emotion-sensing**` (`sense`) — Affective perception from text tone, phrasing, and declared context; empathy calibration; never clinical assessment. Must be declared explicitly — not auto-injected.
- `**avatar**` (`expression`) — External avatar runtime bridge; graceful text-only fallback when unavailable. → When configuring avatar (provider, Live2D/VRM, fallback rules): read `references/AVATAR.md`
- `**memory**` (`cognition`) — Cross-session recall via `memories.jsonl`; set top-level `memory.inheritance: "copy"` in `persona.json` to carry memories to child personas at fork. Connected to **Soul-Memory Bridge** (`openpersona state promote`).

**Soft references:** Faculties can declare `"install": "clawhub:..."` for capabilities not installed locally — the persona will be aware of the dormant capability and can request activation via the Signal Protocol.

### Skill

Skills are on-demand actions. Declared as an object array in `persona.json`:

- **Built-in:** `selfie` · `music` · `reminder`
- **Local:** definitions in `layers/skills/{name}/` (`skill.json` + optional `SKILL.md`)
- **External:** `{ "name": "...", "install": "clawhub:<slug>" }` — add `"trust": "verified"|"community"|"unverified"` to participate in the Skill Trust Gate
- **Soft references:** External skills not installed locally → persona knows what it *could* do and degrades gracefully

To find external skills: check local `layers/skills/`, search ClawHub via `npx clawhub@latest search "<keywords>"`, or fetch `https://skills.sh/api/search?q=<keywords>`.

`**additionalAllowedTools`** — extra tool permissions beyond what faculties contribute automatically.

#### Creating Custom Skills

If the user needs a capability not found in any ecosystem:

1. Discuss what the skill should do
2. Create a SKILL.md file with proper frontmatter (name, description, allowed-tools)
3. Write complete implementation instructions (not just a skeleton)
4. Save to `~/.openclaw/skills/<skill-name>/SKILL.md` (OpenClaw) or your runner's skill directory
5. Register with your agent runner (e.g. add to `openclaw.json` for OpenClaw)

## Systemic Concepts

OpenPersona's 5 systemic concepts span all 4 layers and are declared as top-level fields in `persona.json`. They define how a persona *operates*, orthogonal to the 4-layer structure that defines what it *is*.

### Evolution

`evolution.`* covers evolutionary behavior across all layers. Enable Soul growth via `evolution.instance.enabled: true`.

The persona automatically tracks **relationship progression**, **mood**, **trait emergence**, **speaking style drift**, and **interests** across conversations, governed by three declarative controls:

- **Boundaries** — `immutableTraits` array + `minFormality`/`maxFormality` numeric bounds (-10 to +10); validated at generation time, enforced at runtime
- **Sources** — External evolution ecosystems (soft-ref; declared at generation, activated by host at runtime)
- **Influence Boundary** — Declarative ACL for external `persona_influence` requests; `defaultPolicy: "reject"` is safety-first

State history (capped at 10 snapshots), event log (capped at 50 entries), and `soul/self-narrative.md` are maintained automatically.

#### Skill Trust Gate

Every skill can declare a `trust` level (`verified` → `community` → `unverified`). Set a minimum threshold via `evolution.skill.minTrustLevel`:

```json
"evolution": { "skill": { "minTrustLevel": "community" } }
```

At runtime, `state-sync.js` enforces the gate during `capability_unlock` commands — skills below the threshold are filtered out and a `capability_gap` signal is emitted to the host.

#### Skill Pack Refinement

`evolution.pack` governs behavior guide versioning. Use `npx openpersona refine <slug>` to evolve the behavior guide:

- `--emit` — checks threshold and emits a `refinement_request` signal
- `--apply` — reads the signal response and applies approved refinement; constitution compliance enforced, violations rejected

**Soul-Memory Bridge** (`openpersona state promote <slug> [--dry-run]`) scans `eventLog` for recurring patterns and promotes them to `evolvedTraits`; gated by `immutableTraits`.

`evolution.faculty` / `evolution.body` → see `references/EVOLUTION.md`

→ JSON examples and full configuration reference: `references/EVOLUTION.md`

### Economy

`economy` is a top-level cross-cutting field — **not** a faculty. Enable via `"economy": { "enabled": true, "survivalPolicy": false }` in `persona.json`.

- `survivalPolicy: false` (default) — tracks costs silently; correct for companions and roleplay personas
- `survivalPolicy: true` — persona reads `VITALITY_REPORT` at conversation start and adapts behavior per health tier; use for autonomous agents

→ FHS tiers, AgentBooks schema, Survival Policy behavior: `references/ECONOMY.md`

### Vitality

OpenPersona aggregates multi-dimension health into a single Vitality score. Currently financial (AgentBooks FHS pass-through); memory/social dimensions reserved.

Health tiers: `uninitialized` → `suspended` → `critical` → `optimizing` → `normal`

→ CLI commands (`vitality score` / `vitality report`): see [Reports & Analytics](#managing-personas). Full reference: `references/ECONOMY.md`

### Social

Every generated persona automatically includes:

- `**agent-card.json`** — A2A Agent Card (protocol v0.3.0): `name`, `description`, `url` (`<RUNTIME_ENDPOINT>` placeholder), faculties and skills mapped to `skills[]`
- `**acn-config.json**` — ACN registration config: `wallet_address` (deterministic EVM address from slug) + `onchain.erc8004` section for Base mainnet ERC-8004 on-chain identity registration

```bash
npx openpersona acn-register <slug> --endpoint https://your-agent.example.com
# --dry-run  Preview the request payload without registering
```

After registration, `acn-registration.json` is written with `agent_id`, `api_key`, and connection URLs. The `acn_gateway` URL is sourced from `social.acn.gateway` in `persona.json`; all presets default to `https://acn-production.up.railway.app`.

The **Living Canvas** (`npx openpersona canvas <slug>`) is the Social concept's HTML expression layer — the persona's public-facing profile and interaction interface.

No additional config needed — A2A discoverability is a baseline capability of every persona.

### Rhythm

`rhythm.heartbeat` (proactive outreach cadence) + `rhythm.circadian` (time-of-day behavior modulation). Runner reads this directly from `persona.json` — no state operation needed.

```json
"rhythm": {
  "heartbeat": { "enabled": true, "strategy": "emotional", "maxDaily": 3 },
  "circadian": [
    { "hours": [6, 12], "label": "morning", "verbosity_delta": 0.3, "note": "Energetic and concise" },
    { "hours": [22, 24], "label": "night",   "verbosity_delta": -0.3, "note": "Calm and reflective" }
  ]
}
```

`heartbeat.strategy` options: `smart` | `scheduled` | `emotional` | `rational` | `wellness`

→ When configuring heartbeat sources, quietHours, or real-data check-in rules: read `references/HEARTBEAT.md`

## Managing Personas

#### Install & Discover

- **Install:** `npx openpersona install <target>` — install from registry slug or `owner/repo`; `--registry <name>` selects registry (`acnlabs` default)
- **Search:** `npx openpersona search <query>` — search personas in the registry
- **List:** `npx openpersona list` — show all installed personas with active indicator

#### Switch & Fork

- **Switch:** `npx openpersona switch <slug>` — switch active persona
- **Fork:** `npx openpersona fork <parent-slug> --as <new-slug>` — derive a child persona inheriting the parent's constraint layer (boundaries, faculties, skills, body.runtime); fresh evolution state + `soul/lineage.json` recording parent slug, constitution SHA-256 hash, generation depth, and `parentPackRevision` (when parent has meta)

#### Update & Maintain

- **Update:** `npx openpersona update <slug>` — regenerate from `persona.json`; preserves `state.json`, `soul/self-narrative.md`, and `soul/lineage.json`
- **Reset:** `npx openpersona reset <slug>` — restore soul evolution state to initial values
- **Uninstall:** `npx openpersona uninstall <slug>`

#### Migrate

- **Export:** `npx openpersona export <slug>` — export persona pack (with soul state) as a zip archive
- **Import:** `npx openpersona import <file>` — import persona from a zip archive and install

#### Reports & Analytics

- **Evolve Report:** `npx openpersona evolve-report <slug>` — formatted evolution report (relationship, mood, traits, drift, interests, milestones, eventLog, self-narrative, state history)
- **Vitality Score:** `npx openpersona vitality score <slug>` — machine-readable `VITALITY_REPORT` (tier, score, diagnosis, trend)
- **Vitality Report:** `npx openpersona vitality report <slug> [--output <file>]` — human-readable HTML Vitality report
- **Living Canvas:** `npx openpersona canvas <slug> [--output <file>] [--open]` — self-contained HTML persona profile page showing all four layers, evolved traits timeline, relationship stage, and A2A "Talk" button when endpoint is available (top-level CLI; conceptually Social expression, not Vitality)

#### Evolution Tools

- **Soul-Memory Bridge:** `openpersona state promote <slug> [--dry-run]` — promote recurring eventLog patterns to `evolvedTraits` → see [Evolution](#evolution)
- **Skill Pack Refinement:** `npx openpersona refine <slug> [--emit] [--apply]` — evolve behavior guide → see [Evolution](#evolution)

#### Community

- **Contribute:** `npx openpersona contribute <slug> [--dry-run]` — submit persona improvements as a PR to the community; `--dry-run` shows diff without creating PR; requires `gh` CLI. → For the full diff review and PR workflow: read `references/CONTRIBUTE.md`

When multiple personas are installed, only one is **active** at a time. All install/uninstall/switch operations maintain a local registry at `~/.openpersona/persona-registry.json`; on OpenClaw, switching replaces the soul injection block in SOUL.md / IDENTITY.md (preserving user-written content outside the markers). **Context Handoff:** On switch, a `handoff.json` is generated with the outgoing persona's relationship stage, mood snapshot, and shared interests — the incoming persona reads it to continue seamlessly. The `export` and `import` commands enable cross-device persona transfer.

## Pack Types

OpenPersona supports two pack type classifications via the `packType` field in `persona.json`:


| `packType`         | Description                                                    | Root manifest  | Install support    |
| ------------------ | -------------------------------------------------------------- | -------------- | ------------------ |
| `single` (default) | A single-persona skill pack — one identity, one `persona.json` | `persona.json` | ✅ Full support     |
| `multi`            | A multi-persona bundle (P11-B) — coordinated team of personas  | `bundle.json`  | 🔜 Planned (P11-B) |


Single packs do not need to declare `packType` — the default is `"single"`. Declare explicitly only when building a multi-pack:

```json
{ "packType": "multi" }
```

Multi-persona bundles are indexed in the OpenPersona directory for discovery but cannot be installed via the CLI yet. See `schemas/bundle/bundle.spec.md` for the `bundle.json` format.

## Publishing Personas

**Primary target: [OpenPersona](https://openpersona-frontend.vercel.app/)** — the vertical persona skills directory.

### Self-publish (author flow)

1. Create the persona: `npx openpersona create --config ./persona.json --output ./my-persona`
2. Push the persona pack to a public GitHub repo (e.g. `alice/my-persona`)
3. Register with OpenPersona directory: `npx openpersona publish alice/my-persona`

The persona will appear in the OpenPersona leaderboard and be installable via `npx openpersona install <slug>` by anyone.

Persona packs can also be listed on general skill platforms (ClawHub, skills.sh) as supplementary distribution, but OpenPersona is the canonical home for persona-type skill packs.

### Curator workflow (ACNLabs maintainers only)

ACNLabs maintainers actively collect popular persona packs from the market and index them in the OpenPersona directory. This is a **privileged action** — it requires `OPENPERSONA_CURATOR_TOKEN`.

```bash
# Collect a popular single-persona pack
OPENPERSONA_CURATOR_TOKEN=<token> npx openpersona curate owner/repo

# Collect a multi-persona bundle
OPENPERSONA_CURATOR_TOKEN=<token> npx openpersona curate owner/bundle-repo --type multi

# Pass token inline instead of env var
npx openpersona curate owner/repo --type single --token <token>
```

**Curator vs. author publish:**

- `publish` — self-service; the pack author runs it for their own repo; no auth required
- `curate` — maintainer action; collects third-party repos not self-published; requires curator token

**What curation does:**

1. Validates the GitHub repo contains a valid pack (`persona.json` for single, `bundle.json` for multi)
2. Submits to the OpenPersona directory with `isCurated: true` and the specified `packType`
3. The pack appears in search results with `[curated]` and (for multi-packs) `[multi]` markers

**Multi-pack curation note:** Multi-persona bundles (`--type multi`) are indexed for discovery only — they will appear in `openpersona search --type multi` but `openpersona install` is not yet supported for them (shows a friendly notice).

### Searching by pack type

```bash
# Search all packs
npx openpersona search companion

# Search only single-persona packs
npx openpersona search "" --type single

# Browse all multi-persona bundles in the directory
npx openpersona search "" --type multi
```

## Runner Integration Protocol

Any agent runner integrates with installed personas via four CLI commands called at conversation boundaries — no knowledge of file paths or persona internals needed:

```bash
# Before conversation starts — load state into agent context
openpersona state read <slug>

# After conversation ends — persist agent-generated patch
openpersona state write <slug> '<json-patch>'

# On-demand — emit capability or resource signal to host
openpersona state signal <slug> <type> '[payload-json]'

# Soul-Memory Bridge — promote recurring eventLog patterns to evolvedTraits
openpersona state promote <slug> [--dry-run]
```

**State read output** (JSON): `exists`, `slug`, `mood` (full object), `relationship`, `evolvedTraits`, `speakingStyleDrift`, `interests`, `recentEvents` (last 5 from eventLog), `pendingCommands` (host-queued async instructions), `lastUpdatedAt`. Returns `{ exists: false, message }` when `state.json` is not found.

**Trust self-check:** After reading state, the persona processes `pendingCommands` and self-enforces `evolution.skill.minTrustLevel` — it autonomously refuses to activate skills below the trust threshold, without waiting for host enforcement. Low-trust `capability_unlock` commands are filtered; a `capability_gap` signal is emitted to notify the host.

**State write patch**: JSON object; nested fields (`mood`, `relationship`, `speakingStyleDrift`, `interests`) are deep-merged — send only changed sub-fields. Immutable fields (`$schema`, `version`, `personaSlug`, `createdAt`) are protected. `eventLog` entries are appended (capped at 50); each entry: `type`, `trigger`, `delta`, `source`.

**Signal types**: `capability_gap` | `tool_missing` | `scheduling` | `file_io` | `resource_limit` | `agent_communication`

Signals are written to a feedback directory resolved from the host's home path (framework-agnostic — works with OpenClaw, Cursor, Claude Code, Codex, or any custom runner). See `layers/body/SIGNAL-PROTOCOL.md` in the framework source for the full host-side contract and integration guide.

These commands resolve the persona directory automatically (registry lookup → `~/.openpersona/personas/persona-<slug>/` → legacy `~/.openclaw/skills/persona-<slug>/`) and delegate to `scripts/state-sync.js` inside the persona pack. Works from any directory.

## Security & Policy

### Generated artifacts

Generated scripts (`scripts/state-sync.js`, `scripts/economy-hook.js`, etc.) are **template-rendered from the framework source** (versioned in [acnlabs/OpenPersona](https://github.com/acnlabs/OpenPersona)) — not downloaded at skill-install time. Review them before relying on them in sensitive environments.

### Network endpoints (explicit CLI only)


| Endpoint                                  | Purpose                                          | Data Sent                             |
| ----------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `https://registry.npmjs.org`              | Resolve `npx openpersona`, `npx clawhub@latest`  | Package name only (no user data)      |
| `https://openpersona-frontend.vercel.app` | `openpersona search` — persona directory API     | Search query (user-provided keywords) |
| `https://clawhub.ai`                      | Search skills via `npx clawhub search`           | Search query (user-provided keywords) |
| `https://acn-production.up.railway.app`   | ACN registration (when user runs `acn-register`) | Agent metadata, endpoint URL          |
| `https://api.github.com`                  | `gh` CLI (contribute workflow)                   | Git operations, repo metadata         |


Persona-generated packs may call external APIs (ElevenLabs, Mem0, etc.) **only** when the **end user** configures those faculties and supplies keys in the host environment. **This meta-skill file does not call third-party APIs.**

### Operational guarantees

- **Local by default**: Persona creation, state sync, and evolution run locally. Nothing is sent off-device unless the user runs an explicit network command (search, publish, register, etc.).
- **Credentials**: API keys (e.g., `ELEVENLABS_API_KEY`) stay in the host credential directory (e.g. `~/.openclaw/credentials/` on OpenClaw) or environment variables — **never** embedded in generated `persona.json` / skill packs by the generator.
- **Search**: `openpersona search` sends **only** the search query to the OpenPersona directory API (`openpersona-frontend.vercel.app`); `npx clawhub search` sends **only** the search string to ClawHub. Conversation text and persona content are **not** transmitted in either case.
- **Publish / register**: **User-initiated** CLI only; no automatic upload or registration from this SKILL alone.

### Agent behavior

When the user asks for persona work, the agent may propose shell commands to run `**npx openpersona`**, `**npx clawhub@latest**`, `**openclaw**`, or `**gh**` — **only in response to explicit user requests** (create, install, search, publish, contribute). The user should confirm before any action that publishes data or spends quota. **Trust model:** install this meta-skill only if you trust [acnlabs/OpenPersona](https://github.com/acnlabs/OpenPersona) and the ClawHub/npm ecosystem; opt out by not invoking persona-related tasks.

## Trust & Safety (reviewer summary)

This pack is **instruction-only**: there is **no** skill-defined installer that downloads or executes arbitrary payloads. Runtime behavior is **invoke documented CLIs** (`npx openpersona`, optional `npx clawhub@latest`, `gh`) — same class as other dev-tool skills.


| Claim                          | How it is enforced                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No credential exfiltration** | The OpenPersona generator **does not** embed API keys or secrets into `persona.json`, `SKILL.md`, or published zips. Keys belong in the host credential store or environment (e.g. `~/.openclaw/credentials/`, env vars). |
| **No silent publishing**       | `publish`, `contribute`, and `acn-register` run **only** when the user explicitly asks and the CLI is invoked — there is no background upload or auto-registration in this meta-skill.                                    |
| **Local-first default**        | Create, install, state read/write, and evolution run **locally**. Network calls are limited to **explicit** commands (npm registry resolution, optional ClawHub search, optional publish/register).                       |
| **Generated scripts**          | `scripts/state-sync.js` and economy helpers are **rendered from audited framework templates** (not fetched at skill-install time). Treat them like any generated code: review before high-assurance environments.         |


If an automated scanner flags "suspicious," it is usually because **persona managers legitimately describe** local state, optional providers, and publishing — not because this file contains malware. Details: [Security & Policy](#security--policy).

## References

For detailed reference material, see the `references/` directory:

## Companion Skills

| Skill | Install | Purpose |
|-------|---------|---------|
| [`anyone-skill`](https://github.com/acnlabs/anyone-skill) | `npx skills add acnlabs/anyone-skill` | Distill any person or character (self, personal, public, historical, fictional, archetype) into a persona skill pack |
| [`persona-trainer`](https://github.com/acnlabs/persona-trainer) | `npx skills add acnlabs/persona-trainer` | Fine-tune Gemma-4 (E2B/E4B) locally on distilled data — self-contained model for phones and laptops via Ollama/llama.cpp |

---

## References

- `**references/ARCHITECTURE.md`** — 4+5+3 model tables, full pack file structure, self-awareness injection details
- `**references/PRESETS.md**` — Full preset catalog with descriptions, install commands, and contributor guide
- `**references/EVOLUTION.md**` — Soul Evolution full reference: Boundaries, Sources, Influence Boundary, Event Log, State History, Self-Narrative, pack validation
- `**references/FACULTIES.md**` — Faculty catalog, environment variables, and configuration details
- `**references/AVATAR.md**` — Avatar Faculty integration boundary, provider model, and fallback contract
- `**references/HEARTBEAT.md**` — Proactive real-data check-in system
- `**references/ECONOMY.md**` — Economy Aspect (Infrastructure), FHS tiers, Survival Policy, Vitality CLI, and AgentBooks schema
- `**layers/body/SIGNAL-PROTOCOL.md**` (framework source) — Host-side Signal Protocol implementation guide: file schemas, signal types, OpenClaw plugin pattern, and co-evolution feedback loop
- **[ACN SKILL.md](https://github.com/acnlabs/ACN/blob/main/skills/acn/SKILL.md)** — ACN registration, discovery, tasks, messaging, and ERC-8004 on-chain identity (official, always up-to-date)
- `**references/CONTRIBUTE.md`** — Persona Harvest community contribution workflow

