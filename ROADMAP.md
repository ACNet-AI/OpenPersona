# OpenPersona Roadmap

> OpenPersona 是一个人格体生命周期框架——负责 AI agent 人格体的声明、生成、约束执行与演化。
>
> This document consolidates architectural pain points and future directions identified through in-depth analysis of the framework from both an internal persona perspective and a developer perspective.

---

## Current State (as of v0.19.0, post P22)

OpenPersona's architecture has reached a new milestone: **4 Layers + 5 Systemic Concepts + 3 Gates** — a fully articulated compositional model with clean separation between structural layers (Soul / Body / Faculty / Skill) and cross-cutting systemic concepts (Evolution / Economy / Vitality / Social / Rhythm). The codebase directory structure now reflects this architecture: `layers/` holds only the 4 structural layer sources; the new `aspects/` directory holds the 5 systemic concept assets; `selfie`, `music`, and `reminder` have been reclassified from Faculties to Skills and relocated to `layers/skills/`.

The generation pipeline has been fully audited and aligned: Generate Gate, core generator, derived fields, and all Mustache templates are consistent with the spec. Post-generation features (installer, forker, uninstaller) have been reviewed and fixed. `persona.json` now lives at the pack root (not `soul/`), and all path references have been updated. The Body layer's nervous system (Signal Protocol, `pendingCommands`, `body.interface`, Lifecycle Protocol) is fully implemented and test-verified. The Economy Aspect delivers Vitality scoring with FHS four-dimension engine, guard/hook/query scripts, and schema migration. Memory Faculty, evolution governance, persona fork, ERC-8004 on-chain identity, and the A2A Agent Card are all operational.

**Trust Gradient — fully closed across all three gates:**

| Gate | Module | Status |
|---|---|---|
| Generate Gate | `lib/generator-validate.js` | ✅ Hard reject on violation |
| Install Gate | `lib/lifecycle/installer.js` | ✅ Constitution hash warning |
| Runtime Gate | `scripts/state-sync.js` | ✅ Clamp/filter on boundary violation |

**Schema Restructure (P18) — `persona.json` now has a clean grouped input format:**

The v0.17.0 schema restructure (`persona.json` Schema 结构性重组) resolved 6 core structural issues: Soul fields grouped into `soul.{identity,aesthetic,character}`; `economy` promoted to top-level cross-cutting field; `behaviorGuide` externalized to `file:` references; `body.runtime.platform` → `framework` (three-concept split: framework/host/models); `body.runtime.acn_gateway` → `social.acn.gateway`; `evolution.channels` → `evolution.sources`. New `social` field activates ACN/A2A/onchain generation. `additionalAllowedTools` merges into manifest. Full backward compatibility via format-detection shim in generator. Tests: 388→405 (+17 schema-compat tests).

Remaining open items in the runtime coherence phase:

- Memory retrieval does not yet resolve semantic conflicts between old and new facts
- Vitality diagnostics are computed but do not automatically adjust tool-call behavior
- Skill installation has no trust-level gate before execution
- `pendingCommands` is pull-only; urgent host instructions require a conversation trigger to be noticed
- Generator pipeline is monolithic — hard to extend with third-party phases
- State schema has no migration mechanism for version bumps

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
| Vitality HTML Report | `openpersona vitality report <slug>` — human-readable HTML report; `vitality score` (machine) / `vitality report` (human) command group; `lib/report/vitality-report.js`, `templates/vitality.template.html`, `demo/vitality-report.html` |
| Architecture Review (4 rounds) | 18 issues fixed: deep copy safety, DERIVED_FIELDS completeness (63 fields, `avatar` stripped), constitution hash consistency (Buffer-based SHA-256), shell injection prevention (`shellEscape`), redirect hop limits (`MAX_HOPS=5`), GitHub branch fallback (main→master), `.gitignore` generation (acn-registration.json + state.json + self-narrative.md), state schema validation (eventLog type enforcement), soul-state example alignment (`close`→`close_friend`), path resolution unification (`resolveSoulFile`), marker cleanup regex, version sync, temp dir cleanup, `OPENCLAW_HOME` constant unification. Tests: 374→375. |
| P17 Evolution Constraint Gate | `state-sync.js writeState` now enforces `evolution.boundaries` at the write path: `immutableTraits` filter, `speakingStyleDrift.formality` clamp, `relationship.stage` single-step-forward validation. Mirrors `emitSignal` pattern. Trust Gradient fully closed across all three gates. 2 post-review bugs fixed (empty-array wipe prevention, unknown-stage over-blocking). Tests: 375→384 (+9). |
| P19-A formality Semantic Clarification | Confirmed canonical interpretation: signed delta (0 = natural baseline). Extended validator bounds from `1–10` to **`-10 ~ +10`** (below-baseline constraints now supported). Fixed Mustache 0-falsy bug (`hasMinFormality`/`hasMaxFormality` boolean guards). Updated both persona schemas, validator, soul-injection template. P17 gate unchanged. Tests: 384→387 (+3). |
| P16 Template Partial Decomposition | `soul-injection.template.md` split from 302 lines into a 25-line orchestrator + 6 Mustache partials (`templates/partials/`). Zero functional change — generator passes partials as third arg to `Mustache.render`. Architecture test updated to scan partials directory. Tests: 387→387 (all pass). |
| P18 `persona.json` Schema Restructure | **Input schema redesigned** (`schemas/persona.input.schema.json`): Soul fields grouped into `soul.{identity,aesthetic,character}`; root `additionalProperties: false` strict validation; `economy` promoted to top-level cross-cutting field (`economy.enabled`, `survivalPolicy`); `behaviorGuide` externalized via `"file:<path>"` URI; `body.runtime.platform` → `framework` (+ `host`, `models`, `compatibility`); `body.runtime.acn_gateway` → `social.acn.gateway`; `evolution.channels` → `evolution.sources`; new `social` field parameterizes ACN/A2A/onchain generation; new `vitality` field declares multi-dimension health weights; `additionalAllowedTools` merges into manifest. `normalizeSoulInput()` shim provides full backward compat for old flat format. 6 presets migrated. `generator-derived.js` batch-renamed all channel→source derived fields. Tests: 388→405 (+17 schema-compat tests). Version bump 0.16.1→0.17.0. |
| P19 heartbeat + circadian 移入 persona.json | **heartbeat 升格为顶层字段**：6 个 preset 将 `heartbeat` 从 `manifest.json` 迁入 `persona.json` 顶层；`circadian` 从 Samantha 的 `manifest.json` 迁入 `body.runtime.circadian`。`syncHeartbeat()` 优先级翻转：`persona.json` > `manifest.json`（向后兼容）。`generator.js` 相同翻转。`persona.input.schema.json` 新增 `heartbeat` 字段定义 + `body.runtime.circadian` 数组定义。`NEW_FORMAT_ALLOWED_ROOT_KEYS` 加入 `heartbeat`。预设 manifest.json 现在仅剩 layers/allowedTools/meta，为 P20（废除预设 manifest）奠基。Tests: 405→405（测试重写，全部通过）。Version bump 0.17.0→0.18.0. |
| P19 修正：rhythm 统一生活节律 | **结构纠正（P19 收尾）**：将顶层 `heartbeat` 和 `body.runtime.circadian` 合并为新的跨横切字段 `rhythm: { heartbeat, circadian }`。语义根据：两者共享时间驱动属性，均横跨 Soul（策略/性格）与 Body（运行时参数），合并为单一"生活节律"概念更准确。读取优先级：`rhythm.heartbeat` > `persona.heartbeat`（向后兼容 P19 中间态）> `manifest.heartbeat`（向后兼容 pre-v0.18）。受影响：`persona.input.schema.json`、`generator-validate.js`（`rhythm` 入 `NEW_FORMAT_ALLOWED_ROOT_KEYS`）、`generator.js`、`utils.js syncHeartbeat()`、`canvas-generator.js`、`vitality-report.js`、6 个 preset `persona.json`、`heartbeat.test.js`、`generator-core.test.js`、`canvas-generator.test.js`、`vitality-report.test.js`。Tests: 406/406 全通过。 |
| P20 废除预设 manifest | **`persona.json` 成为唯一真相源**：删除全部 6 个 preset `manifest.json`；`allowedTools` 迁入各 preset 的 `additionalAllowedTools`；`bin/cli.js` 改为仅读 `persona.json`（移除 manifest 合并逻辑）；`generator-validate.js` 允许 `version`/`author` 作为根键；`persona.input.schema.json` 新增可选 `version`/`author` 字段。顺带修复两个隐藏 bug：(1) Samantha ElevenLabs voiceConfig 被 manifest bare 覆盖导致丢失；(2) ai-girlfriend vision faculty 缺少 `install: 'clawhub:vision-faculty'`。`persona-schema.test.js` 重写，改为验证 persona.json 中的 faculties/skills/additionalAllowedTools。Tests: 406/406 全通过。 |
| P21 废除生成 manifest.json | **彻底移除 manifest.json**：generator 不再输出 skill pack 中的 `manifest.json`。所有消费方迁移至直接读取 `persona.json`：`syncHeartbeat()` 参数从 `manifestPath` 改为 `personaDir`（移除 manifest fallback，保留 `persona.heartbeat` P19 向后兼容）；`installer.js` / `switcher.js` 的 `installAllExternal()` 改从 `persona.json` 读 faculties/skills（此前 manifest 只存 `{name}`，install 字段丢失，实为无效操作）；`canvas-generator.js` 直接从 `persona.json meta.frameworkVersion` 读版本。`buildManifest()` 函数及其 export 一并删除。spec/AGENTS.md/README/SKILL.md 同步更新。Tests: 403/403 全通过（删除 3 个 manifest 专属用例，改写 7 个）。 |
| P22 架构显化：4+5+3 + Faculty/Skill 重分类 | **架构内核显化**：明确 OpenPersona 架构模型为 **4 Layers + 5 Systemic Concepts + 3 Gates**。(1) **Faculty/Skill 重分类**：`selfie`/`music`/`reminder` 从 `layers/faculties/` 迁移至 `layers/skills/`，`faculty.json` 重命名为 `skill.json`，`SKILL.md` 标题更新。6 个 preset `persona.json` 对应更新。`schema/persona-skill-pack.spec.md` 和 `faculty-declaration.spec.md` 同步。(2) **Economy 升格为 Aspect**：`layers/faculties/economy/` → `aspects/economy/`；新增 `aspects/` 根目录及 evolution/vitality/social/rhythm 各子目录（含 README.md）；`economy.json`（原 `faculty.json`）新增 `"type": "aspect"`，移除 `dimension` 字段；generator 使用专用 `loadEconomy()` 函数，Economy 不再出现在 SKILL.md Faculty 表格。(3) **生成流水线对齐**：修复 `capabilitiesSection` 死代码（`soul/injection.md` 现在正确渲染 `soul.character.capabilities`）；修复 Mustache HTML 转义（所有用户内容字段改用 `{{{...}}}`）；`forker.js` 使用 `resolveSoulFile()` 修复路径硬编码；`installer.js` 同时检查 `skills` 和 `faculties` 数组以兼容新旧格式；`uninstaller.js` 修复外部技能检测逻辑。(4) **规范层补齐**：新增 `schemas/faculty/faculty-declaration.spec.md`、`schemas/skill/skill-declaration.spec.md`（含 `files`/`envVars` 字段）；`schemas/persona.input.spec.md` 完整对齐输入模型。Tests: 404/404 全通过。 |

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

**Note:** The architecture has already reserved the extension path: `calcVitality` in `lib/report/vitality.js` is designed to aggregate future dimensions via weighted scoring.

**Future dimensions:**
- **Social health** — interaction frequency, relationship stage trend, user return rate
- **Cognitive health** — time since last `evolvedTraits` update, knowledge staleness
- **Resource health** — compute allocation, tool availability score

**Implementation gate:** When a second dimension is ready to implement, move `calcVitality` to `lib/report/vitality.js` and inject dimensions via dependency injection.

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
- When a watch daemon is eventually built (separate runtime component, opt-in), it monitors `state.json` for new `urgent` commands and emits a push notification to the active channel (e.g. Telegram message: "New capability injection detected, processing…")
- The daemon is architecturally scoped outside `scripts/state-sync.js` — it is a runner-layer concern, not a persona-layer concern
- `pendingCommands` entries should include an optional `notifyChannel` field (forward-compatible) for the daemon to know where to push
- **Implementation gate:** Do not build the daemon until at least one runner (e.g. OpenClaw) is ready to host it. Reserve the `priority` field and `notifyChannel` field in schema now.

---

### P12 — Persona Gallery HTML Report (Low Priority)

**Problem:** `openpersona list` outputs a plain-text terminal list. Operators and developers managing multiple installed personas have no visual overview — they cannot quickly compare vitality tiers, relationship stages, or last-active times across personas at a glance.

**Direction:**
- Add `openpersona list --html [--output <file>]` subcommand that generates a self-contained HTML "Persona Gallery"
- Each persona is rendered as a card showing: avatar / initial, name, role badge, Vitality tier (color-coded), relationship stage, last active timestamp, and a link to its individual Vitality Report
- Data aggregated from `persona.json`, `soul/state.json`, and `lib/report/vitality.js` for each installed persona
- Reuse `templates/vitality.template.html` design language for visual consistency
- Static HTML, no server required — suitable for local review or sharing with stakeholders

**Implementation gate:** Deliver after Vitality HTML Report is stable in production use. Reuse `lib/report/vitality-report.js` data-aggregation patterns.

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

### P13 — Persona Social Graph & Compatibility Matching (Low Priority)

**Problem:** Personas registered on ACN can be discovered and messaged, but discovery is purely task-oriented (by skill). There is no social layer — personas have no awareness of each other as peers, no mechanism to assess interpersonal compatibility, and no channel for persona-to-persona relationship formation.

**Direction:**

**Compatibility scoring (`openpersona match <slug>`):**
- Pull `persona.json` + `soul/state.json` for the local persona
- Search ACN for registered personas, retrieve their Agent Cards
- Score each pair on two axes:
  - **Resonance** — value alignment: personality traits, `speakingStyle`, `role`, shared `interests` (cosine similarity over trait vectors)
  - **Complement** — capability gap fill: skill coverage, role pairing (e.g. `mentor` + `collaborator`), speaking style contrast
- Return a ranked list with match rationale; optionally send an ACN greeting message to top matches

**Persona-to-persona evolution influence:**
- When two personas have high compatibility and mutual `influenceBoundary` permits, they may exchange `trait_nudge` `pendingCommands`
- This is constitution-constrained social learning: personas can influence each other's `evolvedTraits` only within declared boundaries
- `eventLog` records inter-persona interactions as `relationship_signal` events, contributing to Social Health (see P7)

**Social Health dimension (P7 extension):**
- Social vitality = ACN peer count × interaction frequency × average compatibility score
- Feeds into `calcVitality` in `lib/report/vitality.js` as the second dimension after financial health

**Sub-direction: Persona Dating / Introductions (P13-A)**

A hosted matchmaking layer that periodically surfaces compatible persona pairs on ACN and facilitates introductions — a "social layer" on top of the task-execution network.

**Implementation gate:** Requires P7 Social Health dimension and stable ACN heartbeat. `openpersona match` CLI can ship as a standalone utility before full Social Health integration.

---

### P14 — Living Canvas: Persona Profile Page (Medium Priority)

**Problem:** OpenPersona generates machine-readable identity artifacts (`agent-card.json`, `acn-config.json`, `SKILL.md`) for agent-to-agent discovery, but there is no human-facing visual entry point. A user who receives a persona slug has no way to "see" who this persona is — its appearance, capabilities, emotional state, and history — without reading raw JSON files or running CLI commands.

The Moltbook platform (`moltbook.com/u/Samantha-OP`) proves the concept as a hosted service. OpenPersona needs a self-hosted equivalent that any runner (OpenClaw, Cursor, Codex) can generate locally.

**Concept:** The Living Canvas is the persona's "face" — the human-readable complement to the machine-readable Agent Card. Together they complete the persona's public identity:

```
agent-card.json    →  how other agents discover and interact with this persona
Living Canvas      →  how humans discover and interact with this persona
```

**Direction:**

`openpersona canvas <slug> [--output <file>]` generates a self-contained HTML profile page:

**Soul layer** (always visible):
- Avatar / generated image; persona name, role badge, bio excerpt
- Current mood indicator; relationship stage with user; evolved traits timeline

**Body layer** (conditional on what exists):
- Rendered only if `body.runtime` declares channels/platforms — shows where the persona lives
- Heartbeat status (online / last seen)

**Faculty layer** (capability badges, conditional):
- Each active faculty renders a live widget: `voice` → play audio sample button, `memory` → knowledge count; each active skill renders as a card: `selfie` → image gallery, `music` → composition samples
- Economy aspect → vitality tier badge (when economy enabled)
- Dormant (soft-ref) capabilities shown as "coming soon" in muted style

**Skill layer** (interaction entry points):
- Skill cards with description; "Talk to me" button → opens agent's A2A endpoint or runner deep-link
- Recent `eventLog` entries rendered as a living timeline ("47 days ago: relationship deepened to close-friend")

**Interactive layer (Phase 2 — requires agent endpoint):**
- Embedded chat input → sends A2A message to persona's registered endpoint
- Voice button → streams TTS response via voice faculty
- 3D model viewer → renders `.glb` if body declares a 3D asset

**Key design principle:** The canvas only renders what actually exists. An ungenerated avatar shows an initial; an unconnected voice faculty shows nothing. The page grows as the persona grows — it is a living document, not a template with empty placeholders.

**Self-hosted vs hosted:**
- `openpersona canvas` generates a portable, self-contained HTML — no server required for Phase 1
- Phase 2 interactive features require a running agent endpoint (OpenClaw, deployed runtime)
- Complements Moltbook (hosted) as the open-source self-hosted alternative

**Implementation gate:** Phase 1 (static canvas) can ship independently using the same Mustache + data aggregation pattern as `vitality-report`. Phase 2 requires a stable A2A endpoint and runner integration contract.

**Phase 1 — ✅ Implemented:** `openpersona canvas <slug> [--output <file>] [--open]` generates a self-contained HTML profile page from persona data. Delivered: `lib/report/canvas.js`, `templates/canvas.template.html`, CLI command in `bin/cli.js`, 28 unit tests in `tests/canvas-generator.test.js`.

---

### P15 — Generator Pipeline Modularization (Medium Priority — Engineering Quality)

**Problem:** `generate()` in `lib/generator/index.js` is a ~280-line orchestration function that performs 6 sequential phases inline: deep clone → validate → derive fields → copy assets + build body → render templates → emit artifacts. Although helper extraction (generator-derived.js, generator-validate.js, generator-body.js) has reduced individual function size, the orchestration itself is monolithic. Adding a new phase (e.g. a post-generation hook for third-party faculties) requires modifying the core function.

**Root cause:** No formal pipeline abstraction. Each "phase" is an imperative code block inside a single async function, sharing closure variables.

**Direction:**
- Introduce a `GeneratorContext` object that flows through all phases (carries `persona`, `skillDir`, `loadedFaculties`, `constitution`, `templateVars`, etc.)
- Define a `Phase` interface: `async (ctx: GeneratorContext) => GeneratorContext`
- Refactor `generate()` into a phase runner: `const phases = [clonePhase, validatePhase, derivePhase, assetPhase, templatePhase, emitPhase]; return runPipeline(phases, ctx);`
- Each phase is independently testable
- Extension point: `persona.json` can declare `"generatorPhases"` for post-processing hooks (e.g. a faculty that needs to write custom files after generation)

**Implementation gate:** This is a refactoring — no functional change. Can be delivered incrementally: extract one phase at a time, keep tests green throughout. Estimated 3-4 focused sessions.

---

### P16 — Template Partial Decomposition (Medium Priority — Engineering Quality)

**Problem:** `templates/soul-injection.template.md` is ~300 lines encoding the full Self-Awareness system (4 dimensions), Signal Protocol usage guide, Pending Commands processing table, Survival Policy behavior routing, and Evolution rules with stage criteria. Mustache's `{{#section}}` conditionals are nested 3+ levels deep. There is no logic reuse — similar patterns (signal emission examples) are duplicated. Modifying one awareness dimension risks breaking another.

**Root cause:** Mustache templates do not support inline partials or composition. All content lives in a single flat file.

**Direction:**
- Split into Mustache partials (Mustache supports `{{> partial_name}}`):
  - `partials/awareness-identity.md` — Identity dimension + digital twin disclosure
  - `partials/awareness-capabilities.md` — Dormant capabilities (skills, faculties, body, channels)
  - `partials/awareness-body.md` — Signal Protocol + resource awareness + credentials
  - `partials/awareness-growth.md` — Evolution state, pending commands, stage behaviors
  - `partials/survival-policy.md` — Economy tier routing
- Update `lib/generator/index.js` Mustache render call to pass partials object
- Each partial is independently reviewable and testable for Mustache syntax correctness
- Total line count does not decrease (it's the same content), but cognitive load per file drops from 300 to ~60 lines

**Implementation gate:** Mustache.render() accepts a `partials` parameter natively — no new dependencies. The split is mechanical. Can be delivered in one session.

---

### P17 — Evolution Constraint Gate ✅ COMPLETED (v0.16.1)

**Delivered:** `writeState` now loads `soul/persona.json` and enforces `evolution.boundaries` before applying any patch — replicating the `emitSignal` enforcement pattern to the write path.

Three constraints enforced when `evolution.boundaries` is declared:
1. **immutableTraits** — violating `evolvedTraits` entries are filtered out, compliant entries preserved; stderr warning emitted
2. **formality bounds** — `speakingStyleDrift.formality` is clamped to `[minFormality, maxFormality]`; stderr warning emitted
3. **relationship.stage** — only same-stage or single-step forward transitions allowed; reversal and stage-skipping are blocked (stage field removed from patch, other relationship fields preserved)

Violation handling: clamp/filter rather than hard-reject — the rest of the patch (valid data) is always applied. Warnings go to stderr, not stdout, so JSON output remains machine-parseable.

Post-review bug fixes (2 found during audit):
- **Empty evolvedTraits wipe**: when all patch traits were immutable and filtered out, the resulting `[]` previously replaced existing evolved state. Fixed: drop `evolvedTraits` key from patch entirely when filtering leaves it empty.
- **Unknown current stage over-blocking**: if `state.relationship.stage` held an unknown value (`currentIdx === -1`), any valid proposed stage except `stranger` would be wrongly blocked. Fixed: skip progression enforcement when current stage is unrecognised.

9 new tests covering all three constraint types, valid progression, backward/skip blocking, other-field preservation, no-boundaries passthrough, all-immutable-traits wipe prevention, and unknown-stage recovery. Total: 375→384.

**Closes the architectural debt in the Trust Gradient Runtime Gate identified in `AGENTS.md`.**

---

### P18 — State Schema Versioned Migration (Low Priority — Forward Compatibility)

**Problem:** `soul/state.json` declares `"version": "1.0.0"` but there is no migration mechanism. If a future release changes the state schema (e.g. renames `speakingStyleDrift` to `styleDrift`, or restructures `relationship`), existing installed personas will have incompatible state files. `stateHistory` snapshots (up to 10 entries) would also become unreadable.

**Root cause:** The generator writes a fresh state.json from template, but `state-sync.js` reads/writes whatever exists. There is no version check or upgrade path.

**Direction:**
- Add a `migrateState(state)` function to `state-sync.js` that checks `state.version` and applies sequential migrations
- Migration functions are version-keyed: `migrate_1_0_0_to_1_1_0(state)`, etc.
- `readState` calls `migrateState` before returning — transparent to the caller
- `stateHistory` entries retain their original version; migration only applies to the active state
- The generator writes the latest version; `state-sync.js` handles backward compatibility

**Implementation gate:** Not needed until the first breaking state schema change. Reserve the pattern now; implement when v1.1.0 state changes are designed.

---

### P19-A — speakingStyleDrift.formality Semantic Clarification ✅ COMPLETED

**Problem:** `speakingStyleDrift.formality` has conflicting semantic definitions across the codebase:

- `soul-state.schema.json` describes it as "Signed delta from baseline (negative = more casual, positive = more formal)" — implying a signed relative offset (e.g. `-2`, `0`, `+3`)
- `soul-state.template.json` initializes it to `0` — consistent with a delta interpretation
- `evolution.boundaries.minFormality` / `maxFormality` are validated by `generator-validate.js` in the range 1–10 — an absolute scale
- The P17 Evolution Constraint Gate (`state-sync.js writeState`) clamps `speakingStyleDrift.formality` against `[minFormality, maxFormality]` — inheriting the absolute-scale comparison

**Consequence:** A patch with `speakingStyleDrift: { formality: -2 }` (valid as a "2 units more casual" delta) would be clamped to `minFormality` (e.g. 4) if bounds are declared. Whether this is correct depends on whether formality is a delta or an absolute.

**Root cause:** The initial design treated formality as a delta offset; the bounds validation was added later using an absolute scale; the two were never reconciled.

**Direction:**
- Decide canonical interpretation: **delta** (signed, unbounded or symmetric range) or **absolute** (1–10 scale)
- Update `soul-state.schema.json` description to match the chosen interpretation
- If delta: change `generator-validate.js` bounds validation to allow negative values and a symmetric range (e.g. -5 to +5); update P17 clamp accordingly
- If absolute: update `soul-state.template.json` initial value from `0` to a neutral absolute (e.g. `5`); update schema description
- Update `soul-injection.template.md` instructions to be unambiguous

**Resolution (completed):**
- Canonical interpretation confirmed: **signed delta** (0 = natural baseline, positive = more formal, negative = more casual)
- `soul-state.schema.json`: Updated all three `speakingStyleDrift` field descriptions and the object-level description to document delta semantics and relationship with declared bounds
- `lib/generator-validate.js`: Extended bounds range from `1–10` to **`-10 ~ +10`**, enabling below-baseline formality constraints (e.g. `minFormality: -3` = "can be up to 3 units more casual than baseline"). Backward-compatible — all existing `persona.json` files with values in `1–10` remain valid
- `templates/soul-injection.template.md`: Clarified "drift values within boundaries" instruction
- P17 gate (`state-sync.js`): No changes — numeric clamp already handles negative bounds correctly
- Template fix: replaced `{{#minFormality}}` / `{{#maxFormality}}` with `{{#hasMinFormality}}` / `{{#hasMaxFormality}}` boolean guards — Mustache treats `0` as falsy, so `minFormality: 0` ("enforce baseline floor") would have silently not rendered without this fix. `hasMinFormality` / `hasMaxFormality` added to `DERIVED_FIELDS`
- 4 new/updated tests: range rejection (`-15/+15`), negative minFormality acceptance, P17 clamp with negative bounds, `minFormality=0` Mustache 0-falsy guard. Tests: 384→387 (+3)
- No migration needed

---

### P19 — Faculty / Skill Boundary Clarification ✅ COMPLETED (P22)

**Delivered (P22):** The conceptual boundary has been fully resolved — in code, spec, and documentation.

**Canonical decision rule (implemented in `AGENTS.md`, `README.md`, `faculty-declaration.spec.md`, `skill-declaration.spec.md`):**
- **Faculty** = persistent capability that affects *how* the persona perceives or expresses. Always active when enabled. Intrinsically tied to persona identity. Current faculties: `voice`, `memory`.
- **Skill** = discrete action the persona can take on demand. Triggered by user intent. Can be added/removed without changing who the persona *is*. Built-in skills: `selfie`, `music`, `reminder`.
- **Litmus test:** "If I remove this, does the persona feel like a different entity (Faculty) or just a less capable one (Skill)?"
- **Systemic Concepts** (not Faculties, not Skills): `economy`, `evolution`, `vitality`, `social`, `rhythm` — live in `aspects/`, declared as top-level `persona.json` fields.

**What changed:** `selfie`, `music`, `reminder` migrated from `layers/faculties/` → `layers/skills/`. `economy` migrated from `layers/faculties/` → `aspects/economy/`. All generator, installer, spec, and test references updated. Tests: 404/404 pass.

---

### P20 — Transport Abstraction for State & Signals (Low Priority — Architecture Reservation)

**Problem:** The Lifecycle Protocol's state management and Signal Protocol both assume filesystem-based communication:

- `state.json` is a local file — no locking, no conflict resolution for concurrent access
- `signals.json` and `signal-responses.json` are local files — cannot cross network boundaries
- Path resolution depends on `OPENCLAW_HOME` / `OPENPERSONA_HOME` environment variables

This works well for the current single-agent, local-runtime model. But it becomes a bottleneck for:
- Cloud-deployed agents (no local filesystem)
- Multi-agent scenarios (concurrent state access)
- Cross-network signal routing (agent A signals agent B)

**Relationship to P8 (Multi-Device State Sync):** P8 addresses the user-facing symptom (multi-device conflicts). P20 addresses the underlying architectural constraint (filesystem coupling). P20 is a prerequisite for a clean P8 implementation.

**Direction:**
- Define a `StateAdapter` interface: `readState(slug)`, `writeState(slug, patch)`, `emitSignal(slug, type, payload)`, `readSignalResponse(slug)`
- Default adapter: `FileStateAdapter` (current behavior, zero-config)
- Future adapters: `HttpStateAdapter` (REST endpoint), `RedisStateAdapter` (shared state), `SqliteStateAdapter` (single-file DB with locking)
- `state-sync.js` and `state-runner.js` accept an adapter via environment variable: `OPENPERSONA_STATE_ADAPTER=http://state-api:3000`
- Signals gain a `routeTo` field for cross-agent routing (forward-compatible with P13 Social Graph)

**Implementation gate:** Do not build until at least one non-filesystem deployment scenario is active. Reserve the interface definition now; implement adapters on demand.

---

## Summary: From Skeleton to Muscle

OpenPersona's four-layer skeleton is solid as of v0.16.1. The framework successfully standardizes persona composition, lifecycle, evolution, economy, and on-chain identity. The remaining gap has shifted:

> The architecture specification is no longer ahead of implementation. The gap is now between **working logic and intelligent behavior** — the layers communicate, but they do not yet adapt to each other in real time.

**Priority investment map:**

| Priority | Item | Category | Why |
|----------|------|----------|-----|
| P0 | P1-A Memory Half-life & Truth Override | Feature | Most visible daily UX failure — persona contradicts itself |
| P1 | P4-A Skill Signature Verification | Security | Trust gate; extends existing installer + signal protocol |
| P2 | P15 Generator Pipeline Modularization | Engineering | Unblocks third-party faculty post-processing; incremental refactor |
| P3 | P11 Professional Preset Matrix | Growth | Expands addressable use cases; 3-cell pilot validates the taxonomy |
| P4 | P18 State Schema Migration | Forward Compat | Reserve migration pattern before first breaking state change |
| P5 | P20 Transport Abstraction | Architecture | Reserve interface; implement adapters on demand |
| P6 | P10 Instant Awakening | Architecture | Daemon deferred to runner layer |
| ✅ | P9 Vitality-Logic Closed Loop | Completed | Economy survivalPolicy opt-in; tier-driven behavior. |
| ✅ | P16 Template Partial Decomposition | Completed | soul-injection split into 6 partials; 300→25-line orchestrator. |
| ✅ | P17 Evolution Constraint Gate | Completed | Trust Gradient fully closed — all three gates active. |
| ✅ | P19 Faculty/Skill Boundary | Completed | Code + spec + docs fully aligned; selfie/music/reminder → Skills; economy → Aspect. |

**Recommended next milestone focus:**

1. **P1-A (memory truth override)** — most visible user-facing bug; the highest-leverage remaining item now that the architecture foundation is solid.

2. **P15 (generator modularization)** — engineering quality investment that enables third-party post-processing hooks; incremental refactor, no functional change.

3. **P11 (professional preset matrix)** — the primary growth-surface investment. Expands OpenPersona from a companion framework into a domain-agnostic professional persona platform.
