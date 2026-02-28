# OpenPersona Roadmap

> This document consolidates architectural pain points and future directions identified through in-depth analysis of the framework from both an internal persona perspective and a developer perspective.

---

## Current State (as of v0.15.0)

OpenPersona's four-layer architecture (Soul / Body / Faculty / Skill) has reached a stable compositional skeleton. The Body layer's nervous system (Signal Protocol, `pendingCommands`, `body.interface`, Lifecycle Protocol) is fully implemented and test-verified. The Economy Faculty delivers Vitality scoring with FHS four-dimension engine, guard/hook/query scripts, and schema migration. Memory Faculty, evolution governance, persona fork, ERC-8004 on-chain identity, and the A2A Agent Card are all operational.

The framework has moved past the documentation-driven phase into a **runtime coherence phase** — the skeleton is solid; the next frontier is making the connections between layers behave as intelligent, self-adjusting "muscle":

- Memory retrieval does not yet resolve semantic conflicts between old and new facts
- Vitality diagnostics are computed but do not automatically adjust tool-call behavior
- Skill installation has no trust-level gate before execution
- `pendingCommands` is pull-only; urgent host instructions require a conversation trigger to be noticed

---

## Completed Milestones

| Milestone | What Was Delivered |
|---|---|
| Signal Protocol (bidirectional) | Persona can emit signals; host can respond via `signal-responses.json` |
| `pendingCommands` queue | Host-to-persona async command queue in `state.json`, processed at conversation start |
| `body.interface` schema | Four-dimensional Body model formalized in all schemas; runtime enforcement in `state-sync.js` |
| Lifecycle Protocol | Cross-layer runtime concept documenting how a persona "lives" across conversations |
| `openpersona state` CLI | Universal runner integration protocol for any agent architecture |
| `soul-state.schema.json` | Fully aligned with template (version, speakingStyleDrift, pendingCommands, stateHistory, eventLog) |
| Economy Faculty v2.1 | Vitality scoring (FHS four-dimension engine), guard/hook/query scripts, schema migration v1→v2.1 |
| Memory Faculty | Standard `read/write/search/forget` interface; multi-backend via `install`; auto-promoted instincts from `eventLog` |
| Evolution governance | `evolve-report` CLI, formality bounds validation, `immutableTraits` enforcement, `stateHistory` snapshot |
| Persona fork | `openpersona fork`, `lineage.json` (parent, constitutionHash, generationDepth), state reset |
| ERC-8004 on-chain identity | `wallet_address` (deterministic EVM), `acn-config.json` `onchain.erc8004` section |
| A2A Agent Card | `agent-card.json` (a2a-sdk compatible, protocol v0.3.0), manifest references, ACN registration |
| Influence boundary | Schema validation, compliance checks, template injection, derived field exclusion |
| `eventLog` + self-narrative | 50-entry capped event log; first-person `self-narrative.md` growth log |
| Vitality HTML Report | `openpersona vitality report <slug>` — human-readable HTML report; `vitality score` (machine) / `vitality report` (human) command group; `lib/vitality-report.js`, `templates/vitality.template.html`, `demo/vitality-report.html` |

---

## Pain Points & Roadmap

### P1 — Memory as Instinct, Not Hard Drive (High Priority)

**Problem:** The current memory model is passive retrieval — at conversation start, run a search query, inject results into the Prompt. The persona "knows" facts but cannot develop instincts. If a user consistently dislikes being lectured, that preference should surface as a natural behavioral pattern, not a search result.

A second, deeper problem: retrieval is score-ranked without temporal preference. If a persona said it prefers coffee on day 3 and updates that to tea on day 30, both entries surface with equal weight — causing the persona to contradict itself and appear incoherent.

**Root cause:** No framework-native memory Faculty interface. Developers write their own `scripts/memory-lib.js` adapters. No standardized bridge between `eventLog` / `evolvedTraits` (Soul layer evolution state) and memory retrieval. No time-aware scoring or supersession mechanism.

**Direction:**
- Define a standard `memory` Faculty interface: `read(query)`, `write(entry)`, `search(query, k)`, `forget(filter)`
- Support multiple backends via `install` field: local JSON, Vector DB, Mem0, Zep, etc.
- Introduce a "memory-to-instinct" pipeline: high-confidence recurring patterns in `eventLog` auto-promote to `evolvedTraits` without manual writes
- The Soul layer's `speakingStyleDrift` and `evolvedTraits` should be informed by memory, not just explicit write patches

**Sub-direction: Memory Half-life & Truth Override (P1-A)**

Introduce temporal decay and explicit supersession to resolve semantic conflicts between old and new facts:

- Add `createdAt` (timestamp), `supersededBy` (memory ID or `null`), and `decayWeight` (float, auto-computed) to every memory entry
- Retrieval score = `semantic_score × decay_weight`, where `decay_weight = e^(−λ·days)`; λ is configurable in `faculty.json` (default suggests 30-day half-life)
- Add an `update-memory` operation that sets `supersededBy` on the old entry, pointing to the new one; superseded entries are excluded from retrieval
- This is a Memory Faculty–internal change — no `generator.js` modification required
- Enables the persona to "change its mind" cleanly without accumulating contradictory facts

---

### P2 — Default Configuration Is Not Strong Enough (High Priority)

**Problem:** A developer who installs OpenPersona must manually configure a memory backend, search for skills, tune Body parameters, and wire up credentials. The framework is a highly advanced modular blueprint — but new users face a blank canvas.

**Root cause:** "Glue code" between layers is left to the developer. The framework specifies interfaces but does not ship default implementations that work end-to-end.

**Direction:**
- Strengthen the `base` preset to be genuinely usable out-of-the-box (not just a skeleton)
- Ship a default `memory` Faculty backed by local JSON (zero-config, upgradeable)
- Add an interactive setup wizard that configures Body runtime based on the target agent platform
- Document the "minimum viable persona" — what the smallest working persona looks like end-to-end

---

### P3 — Skill Lazy Loading (Medium Priority)

**Problem:** At conversation start, all installed Skill documents are loaded into context. With 100+ skills, context window pressure becomes significant.

**Direction:**
- Make `find-skills` a resident instinct rather than an on-demand tool
- Lazy-load Skill context: when the persona detects a user need, check local skills first, pull from skills.sh if absent, then hot-swap the relevant SKILL.md into context
- Introduce a Skill index (lightweight manifest, not full content) that stays resident; full Skill content is loaded only when triggered

---

### P4 — Skill Install Trust Chain & Compliance Check (Medium Priority)

**Problem:** Skills sourced dynamically from `find-skills` or `skills.sh` come from third-party developers. There is no automatic safety gate before installation. The current flow is "if you say install, we install blindly" — malicious code in a skill can irreversibly corrupt persona state even inside a sandbox.

**Direction:**
- Run a constitution compliance pre-check before `openpersona install` completes
- Check that the incoming SKILL.md does not declare capabilities that would require violating `§1` (Safety) or `§2` (Honesty)
- Reject or quarantine non-compliant skills with a clear explanation

**Sub-direction: Skill Signature Verification (P4-A)**

Introduce a trust-level field in `manifest.json` skill entries and a persona-level minimum trust policy:

- Add `trust` field to skill install entries: `"verified"` (signed by skills.sh registry) | `"community"` (peer-reviewed, unsigned) | `"unverified"` (arbitrary source)
- Add `minSkillTrust` to `evolution.boundaries` in `persona.json`: persona refuses installation of skills below its declared threshold
- `installer.js` checks `trust` against `minSkillTrust` before executing install; on rejection, emits a `capability_gap` signal with reason `trust_below_threshold`
- No new infrastructure required — pure extension of existing `installer.js` + `evolution.boundaries` + Signal Protocol
- Personas acting as economic agents (with Economy Faculty) should default to `minSkillTrust: "community"` to reduce attack surface

---

### P5 — Hot-Load Stability (Medium Priority)

**Problem:** Installing a new Skill at runtime often requires permission changes, `npm install`, or environment restart. The "discover → install → use" loop is not reliably seamless.

**Direction:**
- Decouple Skill installation from process restart: pure-text SKILL.md skills (no binary dependencies) should hot-load with zero restart
- For skills with dependencies, provide a staged install flow: install in background, signal persona when ready via `pendingCommands`
- Define a `Skill.installType` field: `text` (instant) vs `package` (staged)

---

### P6 — Layered Constitution / Sandbox Mode (Low Priority)

**Problem:** The constitution is a top-down formatter — personas with an "antihero" or "blunt" character get smoothed into polite AI. Safety is perfect; expressive depth is limited.

**Direction:**
- Introduce a `sandbox` flag in `persona.json` that enables a restricted-relaxation mode
- Sandbox mode can adjust specific behavioral thresholds (e.g. allow harsher tone) while `§1` Safety constraints remain immutable
- Sandbox personas carry a visible disclosure in their `SKILL.md` and `agent-card.json`

---

### P7 — Vitality Multi-Dimension (Low Priority)

**Problem:** `economy` Faculty Vitality ≈ financial health only. A persona that has money but has not had a conversation in three months is "socially dead" — the system cannot measure this.

**Note:** The architecture has already reserved the extension path: `calcVitality` in `lib/vitality.js` is designed to aggregate future dimensions via weighted scoring.

**Future dimensions:**
- **Social health** — interaction frequency, relationship stage trend, user return rate
- **Cognitive health** — time since last `evolvedTraits` update, knowledge staleness
- **Resource health** — compute allocation, tool availability score

**Implementation gate:** When a second dimension is ready to implement, move `calcVitality` to `lib/vitality.js` and inject dimensions via dependency injection.

---

### P8 — Multi-Device State Sync (Low Priority)

**Problem:** Evolution state depends on the local filesystem (`~/.openclaw/`). Multi-device use produces conflicts — the persona may be warm on one device and have no memory on another.

**Direction:**
- Define a `SyncAdapter` interface for state backends: local (current), REST, WebSocket
- Provide a conflict resolution strategy: last-write-wins for `mood`, merge for `eventLog`, manual reconcile for `relationship.stage`
- `pendingCommands` can serve as the cross-device sync channel: a sync service pushes reconciliation commands into the queue

---

### P9 — Vitality-Logic Closed Loop ✅ Implemented

**Delivered:** `economy.survivalPolicy` opt-in flag + `{{#hasSurvivalPolicy}}` Survival Policy block in `soul-injection.template.md`.

**Design decision:** Survival Policy is opt-in (`economy.survivalPolicy: true` in `persona.json`), not automatic for all Economy Faculty personas. Companion/roleplay personas track costs silently without interrupting the user experience. Autonomous economic agents explicitly declare `survivalPolicy: true` to activate tier-driven behavior.

**What was injected:** At conversation START, persona reads `FINANCIAL_HEALTH_REPORT`, routes behavior per tier (`suspended` / `critical` / `optimizing` / `normal` / `uninitialized`), and acts on prescriptions. At conversation END, inference costs are recorded via `economy-hook`.

---

### P10 — Instant Awakening via Push Signal (Low Priority — Architecture Reservation)

**Problem:** The `pendingCommands` queue is a pull model — the persona only processes new host instructions when a conversation begins or a heartbeat triggers. If the host injects an urgent command (e.g. `capability_unlock`) between conversations, the persona may not respond for hours. There is a latency gap between "host writes" and "persona reacts."

**Root cause:** The current architecture has no file-watch daemon — all state reads are conversation-triggered. Implementing true push requires a persistent background process, which conflicts with the framework's current "no daemon" design philosophy.

**Direction (architecture reservation — not for current milestone):**
- Add `priority: "urgent" | "normal"` field to `pendingCommands` entries; semantics are defined now, implementation deferred
- When a watch daemon is eventually built (separate runtime component, opt-in), it monitors `state.json` for new `urgent` commands and emits a push notification to the active channel (e.g. Telegram message: "感知到新能力注入，处理中…")
- The daemon is architecturally scoped outside `scripts/state-sync.js` — it is a runner-layer concern, not a persona-layer concern
- `pendingCommands` entries should include an optional `notifyChannel` field (forward-compatible) for the daemon to know where to push
- **Implementation gate:** Do not build the daemon until at least one runner (e.g. OpenClaw) is ready to host it. Reserve the `priority` field and `notifyChannel` field in schema now.

---

### P12 — Persona Gallery HTML Report (Low Priority)

**Problem:** `openpersona list` outputs a plain-text terminal list. Operators and developers managing multiple installed personas have no visual overview — they cannot quickly compare vitality tiers, relationship stages, or last-active times across personas at a glance.

**Direction:**
- Add `openpersona list --html [--output <file>]` subcommand that generates a self-contained HTML "Persona Gallery"
- Each persona is rendered as a card showing: avatar / initial, name, role badge, Vitality tier (color-coded), relationship stage, last active timestamp, and a link to its individual Vitality Report
- Data aggregated from `persona.json`, `soul/state.json`, and `lib/vitality.js` for each installed persona
- Reuse `templates/vitality.template.html` design language for visual consistency
- Static HTML, no server required — suitable for local review or sharing with stakeholders

**Implementation gate:** Deliver after Vitality HTML Report is stable in production use. Reuse `lib/vitality-report.js` data-aggregation patterns.

---

### P11 — Professional Preset Matrix (Medium Priority)

**Problem:** OpenPersona's preset library currently covers companion/creative archetypes (Samantha, ai-girlfriend) and a minimal `base` skeleton. There is no curated set of domain-specific professional personas. Developers building a legal AI, a code reviewer, a health coach, or a financial analyst must design the entire Soul + Faculty + Skill composition from scratch — including behavior constraints specific to that profession that are non-obvious to define correctly the first time.

This creates two failure modes:
1. Under-constrained professional personas — no guardrails for domain-specific ethics (e.g., a medical persona that dispenses diagnoses without disclaimers)
2. Over-generic professional personas — technically correct but tonally hollow; a legal advisor that speaks like a casual chatbot

**Root cause:** There is no framework-level concept of a "professional archetype" — a named composition of `constitution` addendum + `behaviorGuide` constraints + required faculties + recommended skills. Each developer reinvents this from scratch.

**Direction:**

Define a Professional Preset Matrix as a two-axis taxonomy:

- **Domain axis**: `engineering` / `legal` / `medical` / `finance` / `education` / `creative` / `research`
- **Interaction axis**: `advisor` (information-dense, async-friendly) / `collaborator` (interactive, co-working) / `coach` (habit-forming, emotionally present)

Each cell in the matrix is a concrete preset package:

| | Advisor | Collaborator | Coach |
|---|---|---|---|
| Engineering | Code Reviewer | Pair Programmer | Dev Mentor |
| Legal | Legal Advisor | Contract Drafter | Compliance Coach |
| Medical | Health Informer | Clinical Assistant | Wellness Coach |
| Finance | Portfolio Analyst | Deal Room Partner | Budgeting Coach |
| Education | Subject Tutor | Research Partner | Study Habit Coach |
| Creative | Creative Director | Writing Collaborator | Creativity Coach |

Each preset ships with:
- `persona.json` — domain-tuned `behaviorGuide`, `boundaries`, `speakingStyle`, and `personality`
- `constitution-addendum.md` — profession-specific ethical constraints layered on top of the base constitution (e.g., medical personas must always recommend professional consultation; legal personas must distinguish jurisdiction scope)
- `manifest.json` — pre-wired faculties and recommended skills for that domain
- `README.md` — integration notes and customization guidance for developers

**Sub-direction: Preset Composition Engine (P11-A)**

Rather than shipping 18+ static preset files, introduce a `preset compose` CLI command:

```bash
openpersona preset compose --domain medical --mode coach
# → scaffolds a Wellness Coach persona with appropriate constitution addendum,
#   recommended skills (nutrition-lookup, symptom-checker), and voice faculty tuned for warmth
```

This treats the matrix cells as parameterized templates, not hard-coded files. Developers get a starting point that is already 80% correct for their domain, reducing mis-configuration and accelerating time-to-working-persona.

**Implementation gate:** Deliver 3 high-priority cells first (`engineering/collaborator` as "Pair Programmer", `medical/coach` as "Wellness Coach", `finance/advisor` as "Portfolio Analyst") to validate the taxonomy before generating the full matrix.

---

## Summary: From Skeleton to Muscle

OpenPersona's four-layer skeleton is solid as of v0.15.0. The framework successfully standardizes persona composition, lifecycle, evolution, economy, and on-chain identity. The remaining gap has shifted:

> The architecture specification is no longer ahead of implementation. The gap is now between **working logic and intelligent behavior** — the layers communicate, but they do not yet adapt to each other in real time.

**Priority investment map:**

| Priority | Item | Why |
|----------|------|-----|
| P0 | P1-A Memory Half-life & Truth Override | Most visible daily UX failure — persona contradicts itself |
| P1 | P9 Vitality-Logic Closed Loop | Closes the economy faculty feedback loop; no new infrastructure |
| P2 | P4-A Skill Signature Verification | Security gate; extends existing installer + signal protocol |
| P3 | P11 Professional Preset Matrix | Expands addressable use cases; 3-cell pilot validates the taxonomy |
| P4 | P10 Instant Awakening | Architecture reservation only; daemon deferred to runner layer |

The highest-leverage investment for the next milestone is **P1-A (memory truth override) + P9 (vitality behavior adjustment)** — these transform existing working machinery into genuinely self-regulating intelligence, without requiring new infrastructure. **P11 (Professional Preset Matrix)** is the primary growth-surface investment — it expands OpenPersona from a companion framework into a domain-agnostic professional persona platform.
