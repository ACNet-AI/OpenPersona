# Persona Skill Pack — Directory Specification

A persona skill pack is the output artifact of the OpenPersona generator. It is a self-contained directory that encodes a complete agent persona — identity, behavior, capabilities, and runtime infrastructure — in a form that any SKILL.md-compatible agent runner can consume.

This document is the **single source of truth** for the output directory structure. The generator (`lib/generator/index.js`) must produce a layout conforming to this spec.

---

## Architectural Model

### Four-Layer Static Structure

Every persona is defined by four compositional layers:

| Layer | Answers | Key concept |
|-------|---------|-------------|
| **Soul** | WHO you are | Identity, personality, ethical boundaries, growth narrative |
| **Body** | HOW you exist | Runtime substrate, physical form (optional), nervous system interface |
| **Faculty** | WHAT you can sense/express | Persistent capabilities that change the persona's nature (voice, avatar, memory) |
| **Skill** | WHAT you can do | On-demand actions and tasks (web-search, creative-writing, reminder) |

### Five Systemic Cross-Cutting Concepts

These concepts operate across layers. They do not have their own directories — their files are distributed throughout the pack and annotated in this spec.

| Concept | Role | Files in pack |
|---------|------|---------------|
| **Evolution** | Persona growth and change over time — trait emergence, relationship progression, speaking style drift, interest discovery, mood tracking. Declared via `evolution.*` in `persona.json`; enforced at Generate Gate (`lib/generator/validate.js`) and Runtime Gate (`state-sync.js`). Manages the *content* of `state.json`; Body manages the *transport mechanism*. | `soul/self-narrative.md` (when `evolution.enabled`); evolution fields in `state.json` (`evolvedTraits`, `speakingStyleDrift`, `interests`, `mood`, `relationship`, `eventLog`, `stateHistory`) |
| **Vitality** | Aggregate health monitoring — currently financial dimension only; memory and social dimensions are reserved for future milestones | No dedicated file in pack (framework-level aggregation); Economy adds `scripts/economy-guard.js` |
| **Economy Infrastructure** | Economic identity and optional financial operations | `acn-config.json` (`wallet_address`, `onchain.erc8004`); optional `economy/economic-identity.json`, `economy/economic-state.json`, `scripts/economy*.js` |
| **Social Infrastructure** | Network identity and agent discoverability | `agent-card.json`, `acn-config.json` |
| **Life Rhythm** | Temporal behavior — *when* the persona acts proactively. `heartbeat` controls proactive outreach cadence; `circadian` modulates behavior by time of day. Executed by the host scheduler; the persona only declares the policy. | `persona.json` (`rhythm.heartbeat`, `rhythm.circadian`) |

> **Body > Interface (Nervous System):** `body.interface` declares the signal and pending command policy — the static contract between the persona and its host. The runtime implementation of this contract (`scripts/state-sync.js`, Signal Protocol, Pending Commands queue, State Sync) is the Body's nervous system in action, not a separate cross-cutting concept.

> **Body vs Evolution:** Body (`scripts/state-sync.js`) manages the *transport mechanism* — how state is read, written, and signals are emitted. Evolution manages the *content* — what traits, moods, and relationship stages change over time. `state.json` is shared: Body owns the transport; Evolution owns the payload.

---

## Directory Structure

```
persona-{slug}/
│
│  ── Core files ──────────────────────────────────────────────────────
├── persona.json          [ALL LAYERS] Complete persona declaration — Soul fields,
│                          Faculty config, Skill list, Body config, evolution settings.
│                          This is the authoritative source of truth for the whole pack.
│
├── state.json            [BODY + EVOLUTION] Shared runtime state container.
│                          Body (scripts/state-sync.js) owns the transport (read/write/signal).
│                          Evolution owns the payload (mood, relationship, evolvedTraits,
│                          speakingStyleDrift, interests, eventLog, stateHistory).
│                          Body also carries pendingCommands (host→persona queue).
│                          Generated unconditionally. Read at conversation start; written at end.
│
├── SKILL.md              [ALL LAYERS] Agent-facing index. Runner manifest (frontmatter)
│                          + behavioral instructions (body). Structure mirrors the four
│                          layers: ## Soul, ## Body (### Runtime, ### Interface), ## Faculty,
│                          ## Skill. Also documents expected capabilities and generated files.
│
├── agent-card.json       [SOCIAL INFRASTRUCTURE] A2A Agent Card (protocol v0.3.0).
│                          Enables discovery via ACN and A2A-compatible platforms.
│
├── acn-config.json       [ECONOMY + SOCIAL INFRASTRUCTURE] ACN registration config.
│                          Contains wallet_address (deterministic EVM address from slug)
│                          and onchain.erc8004 section for on-chain identity registration.
│
├── .gitignore            [FRAMEWORK] Standard ignores for the skill pack directory.
│
│  ── Soul layer ──────────────────────────────────────────────────────
├── soul/                 Soul layer artifacts. Contains only static and archival files —
│   │                     files that are written once (or append-only) and never
│   │                     overwritten wholesale. Runtime state lives at the root.
│   │
│   ├── injection.md      [SOUL] Self-awareness injection — the unified ### Self-Awareness
│   │                     block covering Identity, Capabilities, Body, and Growth dimensions.
│   │                     Injected into agent context at conversation start.
│   │
│   ├── constitution.md   [SOUL] Universal ethical foundation (read-only copy).
│   │                     Applies to all personas. Safety > Honesty > Helpfulness.
│   │                     Never weakened by persona-specific boundaries.
│   │
│   ├── self-narrative.md [EVOLUTION] First-person growth log. Written by the persona itself.
│   │                     Records significant milestones in the persona's own voice.
│   │                     Stored in soul/ because it is archival and persona-authored;
│   │                     conceptually owned by the Evolution concept.
│   │                     Append-only — never overwrite or delete entries.
│   │                     Generated when evolution.enabled: true.
│   │
│   ├── lineage.json      [SOUL] Fork lineage record — parent slug, constitutionHash
│   │                     (SHA-256 for constraint chain integrity), generationDepth.
│   │                     Generated only when this persona was created via `openpersona fork`.
│   │                     Written once at fork time; never modified.
│   │
│   └── behavior-guide.md [SOUL] Extended behavioral guidelines — externalized from
│                         `persona.json` `behaviorGuide` field. Written when `behaviorGuide`
│                         is an inline string (converted to `file:` reference) or a
│                         `file:` URI pointing to a source file. Absent if `behaviorGuide`
│                         is not declared.
│
│  ── Economy Infrastructure ──────────────────────────────────────────
├── economy/              Economy Infrastructure data files. Present only when
│   │                     `economy.enabled: true`. Scripts live in `scripts/` (not here).
│   │
│   ├── economic-identity.json  [ECONOMY INFRASTRUCTURE] AgentBooks agent identity
│   │                           bootstrap — agent ID, wallet address, provider config.
│   │                           Written once at generation time; not overwritten on
│   │                           re-generation (idempotent).
│   │
│   └── economic-state.json     [ECONOMY INFRASTRUCTURE] AgentBooks initial financial
│                               state record — balance sheet, burn rate history seed.
│                               Written once at generation time; not overwritten on
│                               re-generation (idempotent).
│
│  ── Assets ──────────────────────────────────────────────────────────
├── assets/
│   ├── avatar/           [BODY: appearance] Visual identity assets — images, Live2D
│   │                     models (.model3.json), VRM (.vrm), textures. Populated from
│   │                     `body.appearance.avatar` and `body.appearance.model3d` fields.
│   │                     Paths in persona.json use ./assets/avatar/...
│   │
│   ├── reference/        [FACULTY: selfie] Reference images for AI selfie generation.
│   │                     Populated from the `referenceImage` field.
│   │                     Resolves to ./assets/reference/avatar.png when bundled.
│   │
│   └── templates/        [OPTIONAL] Document or config templates.
│
│  ── References ──────────────────────────────────────────────────────
├── references/           On-demand detail documents. Read by the agent when needed.
│   │                     Not loaded at conversation start (reduces context overhead).
│   │
│   ├── {faculty}.md      [FACULTY] One file per active faculty with an install dependency
│   │                     or detailed configuration (e.g. voice.md, avatar.md, memory.md).
│   │
│   └── SIGNAL-PROTOCOL.md  [BODY] Host-side implementation guide for the
│                           Signal Protocol feedback directory (signals.json,
│                           signal-responses.json). Referenced from SKILL.md Interface section.
│
│  ── Scripts ─────────────────────────────────────────────────────────
└── scripts/
    ├── state-sync.js     [BODY] Nervous system nerve fiber — implements read / write /
    │                     signal commands. Self-contained, no external dependencies.
    │                     Works as local fallback when openpersona CLI is not installed.
    │
    ├── speak.js          [FACULTY: voice] Text-to-speech invocation script.
    ├── speak.sh          [FACULTY: voice] Shell wrapper for speak.js.
    │
    ├── compose.js        [FACULTY: music → SKILL] Music composition invocation.  (*)
    ├── compose.sh        [SKILL: music] Shell wrapper for compose.js.
    │
    ├── economy.js        [ECONOMY INFRASTRUCTURE] AgentBooks management commands.
    │                     Present only when economy.enabled: true.
    ├── economy-guard.js  [VITALITY] Outputs FINANCIAL_HEALTH_REPORT. Exits 0 always.
    │                     Present only when economy.enabled: true.
    └── economy-hook.js   [ECONOMY INFRASTRUCTURE] Post-conversation cost recorder.
                          Present only when economy.enabled: true.
```

> `compose.js` / `compose.sh` are Skill source files — copied from `layers/skills/music/scripts/` during generation.

### Runtime-only files (not generated, appear at runtime)

```
persona-{slug}/
├── handoff.json          [BODY] Context handoff snapshot — generated by
│                         `openpersona switch` when transitioning from another persona.
│                         Contains relationship stage, mood snapshot, shared interests.
│                         Intended to be read once at the next conversation start;
│                         not automatically deleted.
│
└── soul/
    └── (no runtime files — soul/ is static/archival only)
```

---

## File-to-Layer Mapping

| File | Layer / Concept |
|------|----------------|
| `persona.json` | All layers (primary declaration) |
| `state.json` | Body (transport) + Evolution (payload) |
| `SKILL.md` | All layers (agent index) |
| `agent-card.json` | Social Infrastructure |
| `acn-config.json` | Economy Infrastructure + Social Infrastructure |
| `soul/injection.md` | Soul |
| `soul/constitution.md` | Soul |
| `soul/self-narrative.md` | Evolution (stored in soul/ — archival, persona-authored) |
| `soul/lineage.json` | Soul (fork) |
| `soul/behavior-guide.md` | Soul (when `behaviorGuide` declared) |
| `economy/economic-identity.json` | Economy Infrastructure (when `economy.enabled: true`) |
| `economy/economic-state.json` | Economy Infrastructure (when `economy.enabled: true`) |
| `assets/avatar/` | Body: Appearance |
| `assets/reference/` | Faculty: Selfie |
| `assets/templates/` | Optional (document/config templates) |
| `references/{faculty}.md` | Faculty (per faculty) |
| `references/SIGNAL-PROTOCOL.md` | Body (nervous system) |
| `scripts/state-sync.js` | Body (nervous system) |
| `scripts/speak.js` / `speak.sh` | Faculty: Voice |
| `scripts/compose.js` / `compose.sh` | Skill: Music |
| `scripts/economy*.js` | Economy Infrastructure / Vitality |
| `handoff.json` | Body (runtime-only) |

---

## SKILL.md Structure

The SKILL.md frontmatter conforms to the [Agent Skills specification](https://agentskills.io/specification). The body is an OpenPersona specialization with a four-layer heading structure.

### Frontmatter Constraints (from Agent Skills spec)

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars; `[a-z0-9-]` only; no leading/trailing/consecutive hyphens; **must match the pack directory name** (e.g. `persona-samantha` → dir `persona-samantha/`) |
| `description` | Yes | Max 1024 chars. Persona packs use a bio-style description rather than a task-oriented description — see "Design Deviations" below |
| `compatibility` | No | Max 500 chars |
| `license` | No | Recommended for publicly published presets |
| `allowed-tools` | No | Space-delimited; experimental |
| `metadata` | No | Arbitrary key-value map; OpenPersona always sets `framework: openpersona` |

### Body Structure

```markdown
---
name: persona-{slug}
description: ...
compatibility: ...
allowed-tools: ...
metadata:
  author: openpersona
  version: "..."
  framework: openpersona
---

# {Name} Persona Skill

## Soul
(identity, personality, behavioral guidelines)

## Body

### Runtime
(platform/environment; "Digital-only" for virtual personas)

### Interface (Lifecycle Protocol)
(state read/write/signal command reference)

## Faculty
(table of active faculties with dimension and reference link)

## Skill
(table of active skills with description and trigger)

## Expected Capabilities (Not Yet Activated)
(soft-ref skills/faculties requiring external install — omitted if none)

## Generated Files
(directory index + on-chain identity instructions)
```

### Design Deviations from Agent Skills

Persona skill packs intentionally deviate from standard Agent Skills conventions in two ways:

1. **Always-active loading**: Standard skills are activated on demand; a persona's SKILL.md is loaded at every conversation start. Content length exceeding the recommended 500 lines is acceptable and expected for complex personas — behavioral fidelity takes priority over context economy.

2. **`description` is a bio, not a task description**: Agent Skills recommends describing "what the skill does and when to use it" for task discovery. Persona pack descriptions identify the persona's character and voice instead. This is intentional — personas are discovered by identity, not by task.

---

## Faculty Classification

| Faculty | Dimension | Rationale |
|---------|-----------|-----------|
| `voice` | expression | Persistent synthesis capability; changes how the persona communicates |
| `avatar` | expression | Real-time 3D/video avatar runtime bridge (HeyGen); requires external install. Animated live presence — disabling makes the persona invisible/non-animated. |
| `memory` | cognition | Episodic/semantic memory store; cross-runner portable; distinct from structural state in `state.json` |

> **`selfie`, `music`, and `reminder` are Skills, not Faculties.** They are on-demand discrete tasks (generate a photo, compose a song, set a reminder). Declare them in `persona.json` under `skills`, not `faculties`. They are implemented in `layers/skills/` with `skill.json` + `SKILL.md` + optional `scripts/`.

> **`economy` is a systemic concept, not a Faculty.** Its source files live in `aspects/economy/` (not `layers/faculties/`). Activate it via `economy: { enabled: true }` in `persona.json` — the generator loads it via `loadEconomy()` and emits `scripts/economy*.js` (AgentBooks wrappers). The old `"faculties": ["economy"]` syntax remains backward-compatible but is deprecated. `economy` does not follow the Faculty contract (`dimension`, `faculty.json`) and should not be treated as a peer of `voice`, `avatar`, or `memory`.

### Faculty vs. Skill distinction

- **Faculty** — a persistent capability that changes the persona's nature. Always active once declared. Alters what the persona *is*.
- **Skill** — an on-demand action or task. Invoked when needed. Defines what the persona *can do*.

Borderline cases resolved by this rule: if disabling the capability would make the persona fundamentally *different* (voice → silent, avatar → invisible), it is a Faculty. If it is a discrete task the persona performs on request (compose music, set reminder, search web, send selfie), it is a Skill.

---

## Extensibility Contract

### Adding a new Faculty

1. Create `layers/faculties/{name}/` with `faculty.json` and `SKILL.md`
2. `faculty.json` must declare `dimension`: one of `expression`, `sense`, `cognition`
3. The generator auto-discovers faculties — no registration needed
4. Add a `references/{name}.md` entry if the faculty has complex usage instructions
5. Add tests covering generation logic changes

### Adding a new Systemic Cross-Cutting Concept

A concept qualifies as systemic when it: (a) genuinely spans multiple layers with no single natural layer home, (b) requires its own top-level declaration field in `persona.json`, and (c) has its own lifecycle independent of the four layers. Concepts may be conditional (like Evolution) or unconditional (like Social Infrastructure). Note: Body-internal behaviors (nervous system, state transport) do not qualify — they belong to Body regardless of how many files they generate.

Steps:
1. Document the concept in this spec (name, role, files in pack)
2. Add derived fields to `DERIVED_FIELDS` in `lib/generator/derived.js` if needed
3. Add self-awareness injection to `soul-injection.template.md` if the persona should know about it
4. Update `AGENTS.md` architecture section

### Adding a new Skill

1. **Local definition**: create `layers/skills/{name}/` with `skill.json` and `SKILL.md`
2. **Inline-only**: declare directly in `persona.json` `skills` array with `name` + optional `description` / `trigger`
3. **External**: add `install: "clawhub:<slug>"` — generator marks it as a soft-ref and injects dormant capability awareness into `soul/injection.md`
4. See `schemas/skill/skill-declaration.spec.md` for full declaration format

### Reserved future concepts

| Concept | Description |
|---------|-------------|
| **Trust Infrastructure** | Reputation, credential verification, trust scoring |
| **Cognitive Infrastructure** | Reasoning scaffolds, planning systems, meta-cognition |
