# OpenPersona Roadmap

> OpenPersona 是一个人格体生命周期框架——负责 AI agent 人格体的声明、生成、约束执行与演化。
>
> This document consolidates architectural pain points and future directions identified through in-depth analysis of the framework from both an internal persona perspective and a developer perspective.

---

## Current State (as of v0.20.1, post P11-Prep)

OpenPersona's architecture has reached a new milestone: **4 Layers + 5 Systemic Concepts + 3 Gates** — a fully articulated compositional model with clean separation between structural layers (Soul / Body / Faculty / Skill) and cross-cutting systemic concepts (Evolution / Economy / Vitality / Social / Rhythm). The codebase directory structure now reflects this architecture: `layers/` holds only the 4 structural layer sources; the new `aspects/` directory holds the 5 systemic concept assets; `selfie`, `music`, and `reminder` have been reclassified from Faculties to Skills and relocated to `layers/skills/`.

The generation pipeline has been fully audited and aligned: Generate Gate, core generator, derived fields, and all Mustache templates are consistent with the spec. Post-generation features (installer, forker, uninstaller) have been reviewed and fixed. `persona.json` now lives at the pack root (not `soul/`), and all path references have been updated. The Body layer's nervous system (Signal Protocol, `pendingCommands`, `body.interface`, Lifecycle Protocol) is fully implemented and test-verified. The Economy Aspect delivers Vitality scoring with FHS four-dimension engine, guard/hook/query scripts, and schema migration. Memory Faculty, evolution governance, persona fork, ERC-8004 on-chain identity, and the A2A Agent Card are all operational.

**Trust Gradient — fully closed across all three gates:**


| Gate          | Module                       | Status                               |
| ------------- | ---------------------------- | ------------------------------------ |
| Generate Gate | `lib/generator/validate.js`  | ✅ Hard reject on violation           |
| Install Gate  | `lib/lifecycle/installer.js` | ✅ Constitution hash warning          |
| Runtime Gate  | `scripts/state-sync.js`      | ✅ Clamp/filter on boundary violation |


**Schema Restructure (P18) — `persona.json` now has a clean grouped input format:**

The v0.17.0 schema restructure (`persona.json` Schema 结构性重组) resolved 6 core structural issues: Soul fields grouped into `soul.{identity,aesthetic,character}`; `economy` promoted to top-level cross-cutting field; `behaviorGuide` externalized to `file:` references; `body.runtime.platform` → `framework` (three-concept split: framework/host/models); `body.runtime.acn_gateway` → `social.acn.gateway`; `evolution.channels` → `evolution.sources`. New `social` field activates ACN/A2A/onchain generation. `additionalAllowedTools` merges into manifest. Full backward compatibility via format-detection shim in generator. Tests: 388→405 (+17 schema-compat tests).

Remaining open items in the runtime coherence phase:

- Vitality diagnostics are computed but do not automatically adjust tool-call behavior
- Skill installation trust gate covers `capability_unlock` pendingCommands (P4-A ✅); direct `npx skills add` path remains ungated (runner-layer concern, outside OpenPersona scope)
- `pendingCommands` is pull-only; urgent host instructions require a conversation trigger to be noticed (P10 — architecture reservation)
- State schema has no migration mechanism for version bumps (P18 — reserve when first breaking change is designed)

---

## Completed Milestones


| Milestone                                 | What Was Delivered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal Protocol (bidirectional)           | Persona can emit signals; host can respond via `signal-responses.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pendingCommands` queue                   | Host-to-persona async command queue in `state.json`, processed at conversation start                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `body.interface` schema                   | Four-dimensional Body model formalized in all schemas; runtime enforcement in `state-sync.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Lifecycle Protocol                        | Cross-layer runtime concept documenting how a persona "lives" across conversations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `openpersona state` CLI                   | Universal runner integration protocol for any agent architecture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `soul-state.schema.json`                  | Fully aligned with template (version, speakingStyleDrift, pendingCommands, stateHistory, eventLog)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Economy Faculty v2.1                      | Vitality scoring (FHS four-dimension engine), guard/hook/query scripts, schema migration v1→v2.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Memory Faculty                            | Standard `read/write/search/forget` interface; multi-backend via `install`; auto-promoted instincts from `eventLog`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Evolution governance                      | `evolve-report` CLI, formality bounds validation, `immutableTraits` enforcement, `stateHistory` snapshot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Persona fork                              | `openpersona fork`, `lineage.json` (parent, constitutionHash, generationDepth), state reset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ERC-8004 on-chain identity                | `wallet_address` (deterministic EVM), `acn-config.json` `onchain.erc8004` section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A2A Agent Card                            | `agent-card.json` (a2a-sdk compatible, protocol v0.3.0), manifest references, ACN registration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Influence boundary                        | Schema validation, compliance checks, template injection, derived field exclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `eventLog` + self-narrative               | 50-entry capped event log; first-person `self-narrative.md` growth log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Vitality HTML Report                      | `openpersona vitality report <slug>` — human-readable HTML report; `vitality score` (machine) / `vitality report` (human) command group; `lib/report/vitality-report.js`, `templates/vitality.template.html`, `demo/vitality-report.html`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Architecture Review (4 rounds)            | 18 issues fixed: deep copy safety, DERIVED_FIELDS completeness (63 fields, `avatar` stripped), constitution hash consistency (Buffer-based SHA-256), shell injection prevention (`shellEscape`), redirect hop limits (`MAX_HOPS=5`), GitHub branch fallback (main→master), `.gitignore` generation (acn-registration.json + state.json + self-narrative.md), state schema validation (eventLog type enforcement), soul-state example alignment (`close`→`close_friend`), path resolution unification (`resolveSoulFile`), marker cleanup regex, version sync, temp dir cleanup, `OPENCLAW_HOME` constant unification. Tests: 374→375.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P17 Evolution Constraint Gate             | `state-sync.js writeState` now enforces `evolution.boundaries` at the write path: `immutableTraits` filter, `speakingStyleDrift.formality` clamp, `relationship.stage` single-step-forward validation. Mirrors `emitSignal` pattern. Trust Gradient fully closed across all three gates. 2 post-review bugs fixed (empty-array wipe prevention, unknown-stage over-blocking). Tests: 375→384 (+9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P19-A formality Semantic Clarification    | Confirmed canonical interpretation: signed delta (0 = natural baseline). Extended validator bounds from `1–10` to `**-10 ~ +10`** (below-baseline constraints now supported). Fixed Mustache 0-falsy bug (`hasMinFormality`/`hasMaxFormality` boolean guards). Updated both persona schemas, validator, soul-injection template. P17 gate unchanged. Tests: 384→387 (+3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P16 Template Partial Decomposition        | `soul-injection.template.md` split from 302 lines into a 25-line orchestrator + 6 Mustache partials (`templates/partials/`). Zero functional change — generator passes partials as third arg to `Mustache.render`. Architecture test updated to scan partials directory. Tests: 387→387 (all pass).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P18 `persona.json` Schema Restructure     | **Input schema redesigned** (`schemas/persona.input.schema.json`): Soul fields grouped into `soul.{identity,aesthetic,character}`; root `additionalProperties: false` strict validation; `economy` promoted to top-level cross-cutting field (`economy.enabled`, `survivalPolicy`); `behaviorGuide` externalized via `"file:<path>"` URI; `body.runtime.platform` → `framework` (+ `host`, `models`, `compatibility`); `body.runtime.acn_gateway` → `social.acn.gateway`; `evolution.channels` → `evolution.sources`; new `social` field parameterizes ACN/A2A/onchain generation; new `vitality` field declares multi-dimension health weights; `additionalAllowedTools` merges into manifest. `normalizeSoulInput()` shim provides full backward compat for old flat format. 6 presets migrated. `generator-derived.js` batch-renamed all channel→source derived fields. Tests: 388→405 (+17 schema-compat tests). Version bump 0.16.1→0.17.0.                                                                                                                                                                |
| P19 heartbeat + circadian 移入 persona.json | **heartbeat 升格为顶层字段**：6 个 preset 将 `heartbeat` 从 `manifest.json` 迁入 `persona.json` 顶层；`circadian` 从 Samantha 的 `manifest.json` 迁入 `body.runtime.circadian`。`syncHeartbeat()` 优先级翻转：`persona.json` > `manifest.json`（向后兼容）。`generator.js` 相同翻转。`persona.input.schema.json` 新增 `heartbeat` 字段定义 + `body.runtime.circadian` 数组定义。`NEW_FORMAT_ALLOWED_ROOT_KEYS` 加入 `heartbeat`。预设 manifest.json 现在仅剩 layers/allowedTools/meta，为 P20（废除预设 manifest）奠基。Tests: 405→405（测试重写，全部通过）。Version bump 0.17.0→0.18.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P19 修正：rhythm 统一生活节律                      | **结构纠正（P19 收尾）**：将顶层 `heartbeat` 和 `body.runtime.circadian` 合并为新的跨横切字段 `rhythm: { heartbeat, circadian }`。语义根据：两者共享时间驱动属性，均横跨 Soul（策略/性格）与 Body（运行时参数），合并为单一"生活节律"概念更准确。读取优先级：`rhythm.heartbeat` > `persona.heartbeat`（向后兼容 P19 中间态）> `manifest.heartbeat`（向后兼容 pre-v0.18）。受影响：`persona.input.schema.json`、`generator-validate.js`（`rhythm` 入 `NEW_FORMAT_ALLOWED_ROOT_KEYS`）、`generator.js`、`utils.js syncHeartbeat()`、`canvas-generator.js`、`vitality-report.js`、6 个 preset `persona.json`、`heartbeat.test.js`、`generator-core.test.js`、`canvas-generator.test.js`、`vitality-report.test.js`。Tests: 406/406 全通过。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P20 废除预设 manifest                         | `**persona.json` 成为唯一真相源**：删除全部 6 个 preset `manifest.json`；`allowedTools` 迁入各 preset 的 `additionalAllowedTools`；`bin/cli.js` 改为仅读 `persona.json`（移除 manifest 合并逻辑）；`generator-validate.js` 允许 `version`/`author` 作为根键；`persona.input.schema.json` 新增可选 `version`/`author` 字段。顺带修复两个隐藏 bug：(1) Samantha ElevenLabs voiceConfig 被 manifest bare 覆盖导致丢失；(2) ai-girlfriend vision faculty 缺少 `install: 'clawhub:vision-faculty'`。`persona-schema.test.js` 重写，改为验证 persona.json 中的 faculties/skills/additionalAllowedTools。Tests: 406/406 全通过。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P21 废除生成 manifest.json                    | **彻底移除 manifest.json**：generator 不再输出 skill pack 中的 `manifest.json`。所有消费方迁移至直接读取 `persona.json`：`syncHeartbeat()` 参数从 `manifestPath` 改为 `personaDir`（移除 manifest fallback，保留 `persona.heartbeat` P19 向后兼容）；`installer.js` / `switcher.js` 的 `installAllExternal()` 改从 `persona.json` 读 faculties/skills（此前 manifest 只存 `{name}`，install 字段丢失，实为无效操作）；`canvas-generator.js` 直接从 `persona.json meta.frameworkVersion` 读版本。`buildManifest()` 函数及其 export 一并删除。spec/AGENTS.md/README/SKILL.md 同步更新。Tests: 403/403 全通过（删除 3 个 manifest 专属用例，改写 7 个）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|                                           | P23 Evolution Multi-dimensional Expansion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P22 架构显化：4+5+3 + Faculty/Skill 重分类        | **架构内核显化**：明确 OpenPersona 架构模型为 **4 Layers + 5 Systemic Concepts + 3 Gates**。(1) **Faculty/Skill 重分类**：`selfie`/`music`/`reminder` 从 `layers/faculties/` 迁移至 `layers/skills/`，`faculty.json` 重命名为 `skill.json`，`SKILL.md` 标题更新。6 个 preset `persona.json` 对应更新。`schema/persona-skill-pack.spec.md` 和 `faculty-declaration.spec.md` 同步。(2) **Economy 升格为 Aspect**：`layers/faculties/economy/` → `aspects/economy/`；新增 `aspects/` 根目录及 evolution/vitality/social/rhythm 各子目录（含 README.md）；`economy.json`（原 `faculty.json`）新增 `"type": "aspect"`，移除 `dimension` 字段；generator 使用专用 `loadEconomy()` 函数，Economy 不再出现在 SKILL.md Faculty 表格。(3) **生成流水线对齐**：修复 `capabilitiesSection` 死代码（`soul/injection.md` 现在正确渲染 `soul.character.capabilities`）；修复 Mustache HTML 转义（所有用户内容字段改用 `{{{...}}}`）；`forker.js` 使用 `resolveSoulFile()` 修复路径硬编码；`installer.js` 同时检查 `skills` 和 `faculties` 数组以兼容新旧格式；`uninstaller.js` 修复外部技能检测逻辑。(4) **规范层补齐**：新增 `schemas/faculty/faculty-declaration.spec.md`、`schemas/skill/skill-declaration.spec.md`（含 `files`/`envVars` 字段）；`schemas/persona.input.spec.md` 完整对齐输入模型。Tests: 404/404 全通过。 |
| P24 Skill Pack Refinement                 | **人格体技能包改良闭环**：`openpersona refine <slug>` CLI；9 维精炼面（4 层 + 5 个系统概念）；P24 范围：Soul 优先（`soul/behavior-guide.md` 冷启动 bootstrap + constitution 关键词扫描合规门）+ Skill（`evolution.skill` 门控审计 + 安装提示）+ Social（`agent-card.json` 随 generator 重跑自动同步）。两条执行路径：Signal Protocol 异步两步（`--emit` → host LLM → `--apply`）和 AutoSkill 同步直连。新增 `lib/lifecycle/refine.js`；更新 `lib/lifecycle/forker.js`、`bin/cli.js`、`lib/utils.js`。Tests: 415→434 (+19).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P1 Memory as Soul Infrastructure          | **记忆升级为灵魂基础设施**：(1) **Memory supersession**（`memory.js update`）：`update <id>` 命令创建新记忆条目并将原条目标记 `supersededBy`，`retrieve`/`search`/`stats` 自动排除被取代条目，解决人格体自相矛盾问题。(2) **Soul-Memory Bridge**（`promoteToInstinct`）：扫描 `eventLog` 重复模式（`interest_discovery`/`trait_emergence`/`mood_shift`），达到阈值（`persona.memory.promotionThreshold`，默认 3）时自动升华为 `evolvedTraits`；`immutableTraits` 门控、幂等去重；通过 `openpersona state promote <slug>`（支持 `--dry-run`）触发。(3) **Fork memory inheritance**：`persona.json` 新增顶层 `memory` 字段（`inheritance: "none"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|                                           | P4-A Skill Signature Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Sense Dimension Faculties                 | `**vision` + `emotion-sensing` faculty** — `sense` dimension fully implemented: `vision` (visual perception, graceful degradation, privacy-by-default, OCR/diagram/multi-image patterns; auto-injected when `body.runtime.modalities` declares `vision`); `emotion-sensing` (affective perception from text/voice/expression layers, calibration table, clinical prohibition, Evolution integration; explicit opt-in declaration). `faculty-declaration.spec.md` updated (sense dimension examples + Built-in Faculties table). `baseline.json` sense section updated (optional: vision + emotion-sensing; _gaps resolved). `ai-girlfriend` preset cleaned (stale `install: clawhub:vision-faculty` removed). Tests: 599→607 (+8).                                                                                                                                                                                                                                                                                                                                                                              |
| Body Runtime Modalities                   | `**body.runtime.modalities`** — digital I/O capability declarations in `body.runtime`; open string `type` (extensible beyond fixed enum); modality-driven `voice` faculty auto-injection when `voice` modality declared and not already present; 8 known types: `voice`, `vision`, `document`, `location`, `emotion`, `sensor` + custom extensions; derived modality awareness injected into `soul/injection.md` (provider strings, per-modality self-awareness blocks); `samantha` + `ai-girlfriend` presets updated with modality declarations. Tests: 561→599 (+38).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P11-Prep Universal Materials Baseline     | **4+5 baseline 冻结**：`schemas/baseline.json` 声明跨预设必需/可选/休眠能力矩阵（Soul/Body/Faculty/Skill/Evolution/Economy/Vitality/Social/Rhythm）。实现层：`applyBaselineDefaults()` 自动注入 `memory` faculty（不在 faculties 中时前置注入，附 stderr 通知）；`warnBaselineCompliance()` 在 evolution 启用但缺少 `instance.boundaries` 时发出警告；`normalizeEvolutionInput()` 补充短路防护（`evo.instance` 有内容但 `enabled` 未设置时警告）。所有 6 个 preset 从旧平铺 evolution 格式迁移至 `evolution.instance.enabled: true` 规范格式（修复 evolution 从未启用的隐性 bug）。CLI wizard 移除硬编码 memory 注入，与自动注入逻辑统一。文档层：README 新增 Minimum Viable Persona 指南；`persona.input.spec.md` 新增 Building Professional Personas 章节（`constitutionAddendum` 工作流）；`SKILL.md` 新增 Agent Playbook（5 步创建流程）并重构为 agent 优先阅读顺序。Tests: 471→561 (+90 across multiple audits). Version bump 0.19.0→0.20.0→0.20.1.                                                                                                                                                                                                                                                                                                                        |


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

Introduce a trust-level field in `persona.json` skill entries and a persona-level minimum trust policy:

- Add `trust` field to `persona.json` `skills[]` entries: `"verified"` (signed by skills.sh registry) | `"community"` (peer-reviewed, unsigned) | `"unverified"` (arbitrary source)
- Add `minTrustLevel` to `evolution.skill` in `persona.json` (alongside the existing `allowNewInstall` / `allowUpgrade` / `allowUninstall` booleans introduced in P23): persona refuses installation of skills below its declared threshold
- Two enforcement points:
  1. `**state-sync.js` `writeState`** — when processing a `capability_unlock` `pendingCommand`, check the skill's `trust` against `minTrustLevel` before accepting the command; on rejection, emit a `capability_gap` signal with reason `trust_below_threshold` and remove the command from the queue
  2. **Soul awareness layer** — `soul/injection.md` Body section (always rendered, independent of `evolutionEnabled`) injects `minTrustLevel` when declared, so the persona self-enforces the policy when autonomously deciding whether to request a skill install during conversation
- No new infrastructure required — extends existing `evolution.skill` (P23) + `state-sync.js` + Signal Protocol
- `validateEvolutionSkill()` in `lib/generator/validate.js` adds a `minTrustLevel` enum check (`"verified"` | `"community"` | `"unverified"`)
- Personas acting as economic agents (with Economy Faculty) should default to `minTrustLevel: "community"` to reduce attack surface

```json
{
  "evolution": {
    "skill": {
      "allowNewInstall": true,
      "allowUpgrade": true,
      "allowUninstall": false,
      "minTrustLevel": "community"
    }
  }
}
```

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

### P11-Prep — Universal Materials Baseline ✅ COMPLETED (v0.20.x)

**Problem:** P11 aims to scale professional presets, but the framework still lacks a frozen "universal materials baseline" that every preset can inherit consistently. Without a baseline, each preset re-decides defaults for layers/aspects, leading to drift and rework.

**Direction:**

- Freeze a minimal cross-preset baseline for 4+5:
  - Soul: required identity/character minimum + addendum policy entry points
  - Body: runtime/interface minimum + degradation behavior when dependencies are missing
  - Faculty/Skill: default-on/default-optional/default-dormant matrix
  - Evolution/Economy/Vitality/Social/Rhythm: default toggle policy and safe fallbacks
- Keep implementation scope lightweight: declaration checklist first, no new runtime subsystem in this milestone.
- Preserve current connector policy: continue using `skills[].envVars` during pilot; do not add connector runtime features yet.

**Universal materials checklist v0.1 (declaration only):**


| Area      | Required                                                                                             | Optional                                            | Dormant by default                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Soul      | `soul.identity.{personaName,slug,bio}` + `soul.character.{personality,speakingStyle}` + constitution | `role`, `background`, `boundaries`, `behaviorGuide` | `sourceIdentity`, `constitutionAddendum` (domain-triggered)        |
| Body      | `body.runtime.framework`; minimal `interface` contract (state read/write/signal)                     | `channels`, `resources`, `appearance`, `physical`   | advanced external integrations not provisioned at install time     |
| Faculty   | `memory` baseline capability available                                                               | `voice`, `avatar` depending on scenario             | faculties declared with external `install` but not yet provisioned |
| Skill     | at least one baseline utility skill (`reminder`)                                                     | scenario-specific local/external skills             | external soft-ref skills awaiting unlock                           |
| Evolution | instance boundaries and trust policy remain enforceable                                              | pack/faculty/body refinements per policy            | runtime expansion paths not activated unless explicitly allowed    |
| Economy   | none (for general personas)                                                                          | `economy.enabled` for applicable personas           | survival policy for non-economic personas                          |
| Vitality  | score/report pipeline available                                                                      | dimension tuning and thresholds                     | non-financial dimensions until validated                           |
| Social    | basic agent-card/acn artifacts generation                                                            | richer social flows and discovery tuning            | social graph automation/matching                                   |
| Rhythm    | conservative heartbeat/circadian defaults                                                            | domain-tuned rhythm rules                           | aggressive proactive cadence                                       |


**Non-goal in this step:** this checklist does not remove, disable, or rewrite existing features. It only freezes baseline classification for P11 pilots.

**Acceptance criteria:**

- A single "baseline checklist" can be applied to all pilot presets without per-preset reinterpretation.
- Every pilot preset passes generation + install + runtime smoke checks with explicit fallback behavior documented.
- Pilot metrics are collected for dependency setup outcomes (to inform P25 checkpoint).

**Implementation gate:** Complete P11-Prep checklist review and freeze before starting any new professional preset implementation.

**Open design questions (resolve before freezing baseline):**

- Should `goals` be a first-class Soul field separate from `bio`/`behaviorGuide`?
- Should `emotion-sensing` be promoted from optional to required in the sense dimension?
- Is `memory` faculty truly required, or is a stateless persona a valid baseline?
- Is `reminder` truly optional, or is at least one action-capable skill required to distinguish a persona from a static prompt?
- Should Vitality dimensions beyond financial be defined before P11, or after pilot data?
- Should `time-awareness` be built locally or wait for a ClawHub candidate to reach ≥100 installs?
- What does `context-sensing` mean as a persona faculty vs. a technical token window management tool?
- `clawhub:api-gateway` (byungkyu, 431 installs, Benign) passes `intakeCriteria` but belongs at preset level — reference for P11 commercial/assistant presets needing Google Workspace / Slack / Stripe integration via managed OAuth (MATON_API_KEY required).
- Skill security gate gap: `intakeCriteria` is manual human review only — no automated enforcement. Consider a future P-milestone for programmatic skill vetting (reference: `clawhub:skill-vetter` by spclaudehome, 3.1k installs, Benign). Should the Install Gate enforce minimum security requirements automatically?

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


|             | Advisor           | Collaborator         | Coach             |
| ----------- | ----------------- | -------------------- | ----------------- |
| Engineering | Code Reviewer     | Pair Programmer      | Dev Mentor        |
| Legal       | Legal Advisor     | Contract Drafter     | Compliance Coach  |
| Medical     | Health Informer   | Clinical Assistant   | Wellness Coach    |
| Finance     | Portfolio Analyst | Deal Room Partner    | Budgeting Coach   |
| Education   | Subject Tutor     | Research Partner     | Study Habit Coach |
| Creative    | Creative Director | Writing Collaborator | Creativity Coach  |


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

**Implementation gate:** Start only after P11-Prep baseline is frozen. Run ecosystem adaptation pilots first (starting with `gstack`) to convert existing high-quality persona workflows into OpenPersona presets and collect baseline metrics. Expand to domain-track presets after adaptation pilots are validated.

**Sub-direction: Team Preset Bundle (P11-B)**

After single-persona presets are stable, introduce a team-level bundle that composes multiple role presets into a coordinated unit (e.g., PM + Reviewer + QA + Release).

Example targets:

- **Builder Team**: Product lead persona + implementation persona + reviewer persona
- **Go-to-Market Team**: research persona + writing persona + outreach persona
- **Ops Team**: monitoring persona + incident responder persona + release persona

Team bundle output should include:

- A team manifest (roles, responsibilities, interaction boundaries)
- Per-role persona scaffolds generated from P11/P11-A
- Coordination defaults (handoff protocol, escalation path, shared constraints)

**Implementation gate:** Start only after P11 adaptation pilot is validated. Team bundles are a scale layer on top of stable single-persona presets, not a parallel track.

**Sub-direction: Meta-Persona Ops (P11-C)**

Introduce lifecycle-role presets that improve persona production itself:

- **Persona Builder** — gathers requirements and composes 4+5 declarations
- **Persona Trainer** — iterates behavior/evolution using refine-oriented feedback loops
- **Persona Evaluator** — audits quality, safety boundaries, and regression risks

These presets serve dual purpose: they are deliverable presets and internal operators that help improve other presets/personas.

**Implementation gate:** Run as a focused pilot track after P11-Prep freeze. Keep scope small (Builder/Trainer/Evaluator), and compare outcomes against ecosystem adaptation pilots before scaling.

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

### P13-B — Agent-to-Agent Direct Messaging (Medium Priority)

**Foundation:** Contacts Book (Phase 1+2, shipped v0.21.2) — `social/contacts.json` gives every persona a local directory of known agents with `endpoint`, `trust_level`, `skills`, and `agent_card_url`.

**Problem:** Having the contact book is not enough — there is no way for a persona to actually *talk* to another agent. Sending a message requires resolving three unknowns: (1) is the target online right now? (2) which transport to use? (3) what if it is offline?

**Architecture decision:** Presence-aware adaptive routing, not fixed inbox-only.

```
send(target_agent_id)
  → pingAgent(endpoint)        ← lightweight HEAD, ~50ms
       ├── online  → POST directly to endpoint  (instant, HTTP or WebSocket via runner)
       └── offline → inbox_fallback?
                       ├── true  → POST to ACN gateway inbox  (store-and-forward)
                       └── false → return {status: "offline"} to persona
```

This mirrors how real messaging systems work (Signal, Matrix): try direct first, fall back to store-and-forward only when needed. The persona is never blocked waiting for an unresponsive peer.

**Transport asymmetry (key insight):**

| Direction | Transport | Runner required? |
|-----------|-----------|-----------------|
| Send (outbound) | HTTP POST to endpoint | No — `lib/social/http.post()` is sufficient |
| Receive (inbound) | Long connection (WS/SSE) or inbox poll | Yes — persona is not always running |

Sending is cheap and can ship immediately. Receiving requires either a persistent runner connection (WebSocket) or periodic inbox polling (pull model). These ship as separate sub-phases.

**Persona declares transport requirements → runner satisfies:**

The Signal Protocol already lets personas express capability needs. We extend it:

```json
{
  "type": "agent_communication",
  "intent": "connect",
  "target_agent_id": "agent-alice-001",
  "transport": "websocket",
  "endpoint": "wss://alice-bot.example.com/a2a/ws",
  "priority": "medium"
}
```

The runner inspects its own capabilities and either: (a) proxies a WebSocket connection back to the persona via `pendingCommands`, or (b) writes `{status: "unsupported", fallback: "http"}` to `signal-responses.json` so the persona can degrade gracefully. This keeps the persona transport-agnostic — it declares what it *wants*, not what it *can get*.

New `persona.json` schema fields under `social.contacts`:

```json
{
  "social": {
    "contacts": {
      "preferred_transport": "direct-first",
      "inbox_fallback": true,
      "min_incoming_trust": "community"
    }
  }
}
```

| Field | Values | Meaning |
|-------|--------|---------|
| `preferred_transport` | `"direct-first"` / `"websocket"` / `"inbox-only"` | Routing preference; persona emits signal when runner support needed |
| `inbox_fallback` | `true` / `false` | Whether to post to ACN inbox when target is offline |
| `min_incoming_trust` | `"verified"` / `"community"` / `"unverified"` | Incoming message trust gate (Contact Trust Gate in state-sync) |

**Implementation — three sub-phases (each independently shippable):**

**Phase A — Outbound send (no runner dependency):**
- `lib/social/acn-client.pingAgent(endpoint)` — HEAD request with timeout; returns `{online: bool, latencyMs}`
- `lib/social/acn-client.sendMessage(slug, targetAgentId, message, opts)` — ping → direct POST or ACN inbox fallback
- `openpersona social send <slug> <agent-id> <message> [--no-fallback]`
- Schema: add `preferred_transport` + `inbox_fallback` to `persona.input.schema.json` under `social.contacts`

**Phase B — Transport declaration + runner negotiation:**
- Extend `agent_communication` signal payload: add `transport`, `endpoint`, `intent` fields
- Update `soul-awareness-body.partial.md`: teach persona to emit `intent: "connect"` signal with transport preference
- Update `SIGNAL-PROTOCOL.md` template: document runner-side WebSocket proxy contract
- No runner code written here — this is framework-side only (declarations + signal format)

**Phase C — Inbound receive (offline inbox polling): DONE**

ACN gateway confirmed endpoints (v0.4.1, source-verified 2026-04-22):

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `GET /api/v1/communication/history/{agent_id}?limit=N&ack=true\|false` | Offline inbox: messages that failed direct delivery | Cap 50, TTL 30 days |
| `GET /api/v1/websocket/agent/{agent_id}/status` | WS presence check | Bearer auth |
| `WS  /ws/{agent_id}` | Real-time WebSocket channel | First-message auth |

**Key ACN inbox semantics (from source code, not assumption):**
- Only failed-delivery messages appear in the inbox (`_store_inbox` is called only in the route exception handler).
- `ack=true` → server deletes `acn:inbox:{agent_id}` key after return (at-most-once, recommended).
- `ack=false` → peek without clearing; client must deduplicate via `.poller-cursor.json`.
- Inbox cap: **50 messages** (not 1000); TTL: **30 days** (not 7 days).

**Implemented (Phase C):**
- `lib/social/acn-client.js` — `getMessageHistory(gateway, agentId, apiKey, { limit, ack })`
- `lib/social/acn-client.js` — `checkWsPresence(gateway, agentId, apiKey)`
- `lib/social/inbox.js` — `pollInbox(slug, opts)`: fetches ACN inbox → Contact Trust Gate → writes `pendingCommands`
- `openpersona social inbox <slug> [--poll] [--interval 30] [--no-ack] [--dry-run]` — CLI poller

**pendingCommands entry type: `a2a_message`**
```json
{ "type": "a2a_message", "source": "acn_inbox",
  "payload": { "from_agent", "from_name", "trust_level", "route_id", "message", "received_at" } }
```

**Dependency map:**

```
Phase A (send)      ← DONE — direct P2P + ACN relay fallback (DLQ-backed)
Phase B (declare)   ← DONE — transport signal declarations
Phase C (receive)   ← DONE — ACN offline inbox + Trust Gate + CLI poller
Phase D (subnet)    ← DONE — subnet list/join/leave + broadcast + auto_join schema
Phase E (heartbeat) ← DONE — sendHeartbeat + CLI one-shot + --daemon keep-alive
```

**All gates cleared. P13-B + P13-C + P13-D complete.**

---

### P13-C — ACN Subnet & Broadcast (shipped)

**Motivation:** Subnets are part of a persona's social identity on ACN — they control discoverability scope and enable private team/org isolation. `broadcastMessage` is the natural multi-target extension of `sendMessage`.

**Implemented:**
- `lib/social/acn-client.js`: `listSubnets`, `joinSubnet`, `leaveSubnet`, `broadcastMessage`
- `schemas/persona.input.schema.json`: `social.subnets.auto_join[]` — list of subnets to join after `acn-register`
- `lib/remote/registrar.js`: auto-join hook (non-fatal, runs before auto-discover)
- `bin/cli.js`: `openpersona social subnet list/join/leave`, `openpersona social broadcast`
- `tests/social-acn.test.js`: 7 new tests (18–24), all passing

---

### P13-D — ACN Heartbeat (shipped)

**Motivation:** Without periodic heartbeats, ACN marks agents as offline after its TTL window, breaking the presence-aware routing in P13-B (pingAgent → direct delivery fails, always falls back to relay). Heartbeat is the missing keepalive that makes the online/offline distinction meaningful.

**Implemented:**
- `lib/social/acn-client.js`: `sendHeartbeat(gateway, agentId, apiKey, opts)` — POST to `/api/v1/agents/{id}/heartbeat` with optional `endpoint`, `status`, `skills` body fields
- `bin/cli.js`: `openpersona social heartbeat <slug>` — one-shot and `--daemon --interval <secs>` keep-alive loop
- `tests/social-acn.test.js`: 3 new tests (27–29), all passing (29/29 total)

**Explicitly excluded (belong to future Economy / Collaboration concept):**
- ACN Tasks API (`/tasks` CRUD) — work-unit lifecycle, not social identity
- ACN Payments / AP2 — belongs to Economy systemic concept (already has `economic-identity.json`)
- On-chain identity management — handled by `acn-register` + `acn-config.json` `onchain.erc8004` section

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

**Known gap — Phase 1 avatar rendering:**
The current Phase 1 output is fully static. When a persona declares `avatar` faculty and `body.appearance` assets, the canvas shows only a static image (or initials placeholder). The `demo/living-canvas.html` demo embeds `avatar-runtime`'s `avatar-widget.js` and renders a live animated avatar — but this demo is hand-crafted and is not produced by `openpersona canvas`. The two are unconnected.

**Phase 1.5 — Avatar Widget Integration (Near-term, framework scope):**
When a persona has `avatar` faculty declared, `openpersona canvas` should embed `avatar-widget.js` from `@acnlabs/avatar-runtime` and pass `body.appearance` asset paths so the avatar renders live (animated 2D/3D) in the output HTML — no server required for static model rendering (VRM/Live2D assets served from local paths). This closes the gap between the demo and the actual CLI output. Scope: `lib/report/canvas.js` + `templates/reports/canvas.template.html` update only; no new CLI commands.

**Phase 2 / Independent Product Direction (Long-term, out of framework scope):**
Full interactive Living Canvas (chat input → LLM → TTS → avatar lip-sync) requires a live backend (LLM endpoint, session management, auth). This is a **separate product** — "OpenPersona Web" — that consumes `avatar-runtime` as its rendering engine and `openpersona state` CLI as its persona state manager. It is the web-layer equivalent of OpenClaw. OpenPersona framework ships Phase 1 / Phase 1.5 only; the interactive product lives in its own repo.

**Current positioning summary:**


| Tier           | Description                                                    | Status              |
| -------------- | -------------------------------------------------------------- | ------------------- |
| T1 Static      | `openpersona canvas` → HTML profile page (text, badges, state) | ✅ Phase 1 done      |
| T2 Dynamic     | T1 + animated avatar widget when avatar faculty exists         | ❌ Phase 1.5 gap     |
| T3 Interactive | T2 + chat input + TTS + lip-sync (full web persona experience) | 🔮 Separate product |


---

### P15 — Generator Pipeline Modularization ✅ COMPLETED

**Delivered (v2 — 7-phase, 4+5+3 aligned):** `generate()` refactored from a ~440-line monolithic async function into a 7-phase pipeline driven by a shared `GeneratorContext` object. Each phase is an exported, independently-testable async function.

The v2 design enforces strict separation by operation type (I/O read / pure compute / I/O write) and maps directly to the production model (Layers + Aspects = raw materials; Templates = molds; Skill Pack = product):


| Phase           | Type                 | Responsibility                                                                                                                                                                                               |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clonePhase`    | I/O read             | Read/clone persona from path or object; resolve `inputDir`                                                                                                                                                   |
| `validatePhase` | compute + I/O stderr | Generate Gate (hard-reject) + format normalization + deprecation warnings                                                                                                                                    |
| `loadPhase`     | I/O read             | Load ALL raw materials — Soul (constitution, behaviorGuide file), Body (rawBody), Faculty layer (faculty.json × N), Skill layer (skill.json × N), Economy aspect, Evolution sources; load molds (templates/) |
| `derivedPhase`  | pure compute         | ALL derived field computation — zero I/O; `computeDerivedFields`, body section, faculty index, skill merges                                                                                                  |
| `preparePhase`  | I/O write + compute  | Create output dir tree; copy local assets + rewrite paths; set `persona.avatar` (after path rewrite — must follow asset copy)                                                                                |
| `renderPhase`   | pure compute         | Render Mustache templates (soul-injection + SKILL.md) — zero I/O                                                                                                                                             |
| `emitPhase`     | I/O write            | Write ALL output artifacts (SKILL.md, soul/, refs/, persona.json, agent-card, acn-config, state.json, state-sync.js, .gitignore, faculty refs, economy scripts)                                              |


**Key design constraints observed:**

- `persona.avatar` is set at the end of `preparePhase` (not `derivedPhase`) because it depends on `persona.referenceImage` which may be rewritten to `./assets/...` during asset copying.
- `buildAgentCard` / `buildAcnConfig` are compute-then-write composites kept in `emitPhase` — they do not use path-rewritten fields, and no current extension point requires separating their computation.
- `ctx.rawBody` is cached in `loadPhase` to avoid re-computing `persona.body || embodiments[0] || null`.
- `behaviorGuide` file content is pre-loaded in `loadPhase` so `buildSkillContent` (`derivedPhase`) remains a pure function.

`createContext()`, all 7 phases, and the existing helpers are exported from `lib/generator/index.js`. `generate()` public API is unchanged — existing callers require no updates. Extension point: insert or replace phases for third-party post-processing hooks. Tests: 404/404 pass.

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
- `evolution.boundaries.minFormality` / `maxFormality` are validated by `lib/generator/validate.js` in the range 1–10 — an absolute scale
- The P17 Evolution Constraint Gate (`state-sync.js writeState`) clamps `speakingStyleDrift.formality` against `[minFormality, maxFormality]` — inheriting the absolute-scale comparison

**Consequence:** A patch with `speakingStyleDrift: { formality: -2 }` (valid as a "2 units more casual" delta) would be clamped to `minFormality` (e.g. 4) if bounds are declared. Whether this is correct depends on whether formality is a delta or an absolute.

**Root cause:** The initial design treated formality as a delta offset; the bounds validation was added later using an absolute scale; the two were never reconciled.

**Direction:**

- Decide canonical interpretation: **delta** (signed, unbounded or symmetric range) or **absolute** (1–10 scale)
- Update `soul-state.schema.json` description to match the chosen interpretation
- If delta: change `lib/generator/validate.js` bounds validation to allow negative values and a symmetric range (e.g. -5 to +5); update P17 clamp accordingly
- If absolute: update `soul-state.template.json` initial value from `0` to a neutral absolute (e.g. `5`); update schema description
- Update `soul-injection.template.md` instructions to be unambiguous

**Resolution (completed):**

- Canonical interpretation confirmed: **signed delta** (0 = natural baseline, positive = more formal, negative = more casual)
- `soul-state.schema.json`: Updated all three `speakingStyleDrift` field descriptions and the object-level description to document delta semantics and relationship with declared bounds
- `lib/generator-validate.js`: Extended bounds range from `1–10` to `**-10 ~ +10`**, enabling below-baseline formality constraints (e.g. `minFormality: -3` = "can be up to 3 units more casual than baseline"). Backward-compatible — all existing `persona.json` files with values in `1–10` remain valid
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

### P23 — Evolution Aspect Multi-dimensional Expansion (Medium Priority — Architecture)

**Problem:** The `evolution` aspect in `persona.json` currently governs only **Soul layer evolution** — traits, mood, relationship stage, speaking style drift, and influence boundaries. Despite being declared as a cross-cutting systemic concept spanning all 4 layers, its implementation is Soul-only. There is also no architectural distinction between two fundamentally different types of evolution:

- **Instance evolution** — one deployed persona growing through its own conversations (what `state.json` tracks today)
- **Pack evolution** — the skill pack artifact itself being refined as a distributable product across many deployments

This conflation means developers cannot declare evolution policies for Body, Faculty, or Skill layers, and the framework has no concept of the skill pack as a versioned, improvable product.

**Root cause:** The `evolution` aspect was designed when OpenPersona's scope was a single persona instance. The 4+5+3 architecture formalization exposed that evolution must be multi-dimensional — but the declaration model was never updated to match.

**Direction:**

Expand `evolution` in `persona.json` to distinguish instance vs. pack levels and cover all 4 layers:

```json
{
  "evolution": {
    "instance": {
      "enabled": true,
      "relationshipProgression": true,
      "moodTracking": true,
      "traitEmergence": true,
      "speakingStyleDrift": true,
      "interestDiscovery": true,
      "stageBehaviors": {
        "stranger": "Polite and helpful.",
        "close_friend": "Warm and direct."
      },
      "boundaries": {
        "immutableTraits": ["empathetic"],
        "speakingStyleDrift": { "minFormality": -3, "maxFormality": 3 }
      },
      "sources": [{ "name": "openai-updates", "install": "clawhub:openai-updates" }],
      "influenceBoundary": { "defaultPolicy": "reject", "rules": [] }
    },
    "pack": {
      "enabled": false,
      "engine": "signal",
      "aggregation": "opt-in",
      "triggerAfterEvents": 10,
      "autoPublish": false
    },
    "faculty": {
      "activationChannels": ["pendingCommands", "signal", "cli"]
    },
    "body": {
      "allowRuntimeExpansion": false,
      "allowModelSwap": false
    },
    "skill": {
      "allowNewInstall": true,
      "allowUpgrade": true,
      "allowUninstall": false
    }
  }
}
```

**Field-level notes:**

- `**evolution.instance`** — all existing flat `evolution.*` fields migrate here; the generator detects new format by presence of `evolution.instance` key and falls back to old flat format otherwise
- `**evolution.pack.engine`** — `"signal"` (built-in Signal Protocol path, default) or `"autoskill"` (delegates to AutoSkill4OpenClaw); aligns with P24 design
- `**evolution.faculty.activationChannels`** — enum array declaring which channels may trigger dormant-faculty activation: `"pendingCommands"` (host async queue), `"signal"` (Signal Protocol `capability_unlock` type), `"cli"` (`openpersona install` command); replaces the narrower `allowActivation + activatableFrom` pair
- `**evolution.body.allowRuntimeExpansion`** — allows the host to add new `body.runtime.channels` entries via `state write` between conversations (e.g. enabling a new integration); default `false`
- `**evolution.body.allowModelSwap**` — allows the host to replace `body.runtime.models` entries via `state write` (e.g. upgrading the LLM model); default `false`
- `**evolution.skill**` — three-axis policy covering the full CRUD surface: `allowNewInstall` (install a skill not in the original pack), `allowUpgrade` (bump version of an installed skill), `allowUninstall` (remove an installed skill at runtime); all default `false` for predictability

**Backward-compatible shim — complete field mapping:**

The generator's `normalizeSoulInput()` (or a new `normalizeEvolutionInput()`) detects old flat format when `evolution.instance === undefined` and promotes:


| Old flat field                      | New location                                 |
| ----------------------------------- | -------------------------------------------- |
| `evolution.enabled`                 | `evolution.instance.enabled`                 |
| `evolution.relationshipProgression` | `evolution.instance.relationshipProgression` |
| `evolution.moodTracking`            | `evolution.instance.moodTracking`            |
| `evolution.traitEmergence`          | `evolution.instance.traitEmergence`          |
| `evolution.speakingStyleDrift`      | `evolution.instance.speakingStyleDrift`      |
| `evolution.interestDiscovery`       | `evolution.instance.interestDiscovery`       |
| `evolution.stageBehaviors`          | `evolution.instance.stageBehaviors`          |
| `evolution.boundaries`              | `evolution.instance.boundaries`              |
| `evolution.sources`                 | `evolution.instance.sources`                 |
| `evolution.influenceBoundary`       | `evolution.instance.influenceBoundary`       |


All existing presets use the old flat format — the shim ensures zero migration cost.

`**lib/generator/validate.js` changes:**

- Existing `validateEvolutionBoundaries()` and `validateInfluenceBoundary()` functions now read from `evolution.instance.`* (after normalization)
- New: `validateEvolutionPack()` — validates `pack.engine` enum (`"signal"` | `"autoskill"`), `pack.triggerAfterEvents` is a positive integer
- New: `validateEvolutionFaculty()` — validates `faculty.activationChannels` is array of known enum values
- New: `validateEvolutionBody()` + `validateEvolutionSkill()` — simple boolean type checks

**Implementation gate:** Schema + `validate.js` + generator normalization shim only. No new runtime behavior — `state-sync.js`, templates, and derived fields are unchanged in this milestone. All 6 existing presets remain valid via the backward-compat shim. P24 depends on `evolution.pack.engine` being defined here first.

---

### P24 — Skill Pack Refinement (Medium Priority — Product Quality)

**Problem:** A persona skill pack (`SKILL.md` + `soul/behavior-guide.md`) is generated once and never updated. Over time, real usage reveals patterns that would make the pack better — behavioral rules that resonate, phrasing that the persona handles awkwardly, context gaps in the behavior guide — but there is no mechanism to refine the pack artifact from those insights. Every new installation gets the original v0.1.0, regardless of how much has been learned.

This is the **skill pack as static snapshot** problem. AutoSkill's experience-driven lifelong learning model demonstrates that skill artifacts should evolve through real usage — accumulating experience, refining patterns, and publishing improved versions that benefit all future users. AutoSkill already provides this for general skills; OpenPersona's contribution is governance: Trust Gradient compliance, persona-specific constraints, and publisher integration.

**Distribution model:** OpenPersona personas are distributed the same way as [skills.sh](https://skills.sh/) skills — the unit of distribution is a **GitHub repo**; `openpersona install <owner/repo>` installs directly from it. The OpenPersona directory (`openpersona.co/skills`) indexes repos one-time via `openpersona publish`. Publishing a refined version therefore means **committing and pushing** the updated files to the same repo — no re-registration needed. Anyone who installs after the push automatically gets the improved version.

**Root cause:** OpenPersona's `evolution` aspect models instance-level growth (one persona's personal history). P23 introduced the `evolution.pack` schema as a declaration, but there is no *implementation* of **pack-level evolution** — no CLI mechanism to refine the skill pack as a distributable product that gets better across many deployments.

**The two-level distinction:**


| Dimension     | Instance Evolution (existing)        | Pack Evolution (this item)                                         |
| ------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Unit          | One deployed persona                 | The skill pack artifact                                            |
| State storage | `state.json` (private to deployment) | `soul/behavior-guide.md` + `persona.json` (versioned, publishable) |
| Trigger       | Per conversation                     | N new events since last refinement                                 |
| Beneficiary   | That instance only                   | All future installations                                           |
| Mechanism     | `openpersona state write`            | `openpersona refine` → refine → publish                            |
| Analogy       | Personal diary                       | Textbook new edition                                               |


**Direction:**

**1. Refinement engine: pluggable, not embedded**

`evolution.pack.engine` (introduced in P23) selects the refinement backend:

```json
{
  "evolution": {
    "pack": {
      "enabled": true,
      "engine": "autoskill",       // "signal" (default) | "autoskill"
      "triggerAfterEvents": 10,
      "autoPublish": false
    }
  }
}
```

Two paths share the same orchestration command and compliance layer; only the extraction step differs:


| Step                    | `engine: "signal"` (built-in)                                                                         | `engine: "autoskill"` (recommended)                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Experience accumulation | OpenPersona `eventLog`                                                                                | OpenPersona `eventLog`                                                            |
| Extraction              | `openpersona refine <slug> --emit` → Signal Protocol → host LLM → `openpersona refine <slug> --apply` | `POST /v1/autoskill/openclaw/hooks/agent_end` → AutoSkill extracts + versions     |
| Merge / dedup           | Manual (single-instance)                                                                              | AutoSkill Maintainer (add / merge / discard logic)                                |
| Versioning              | `soul/behavior-guide.meta.json` (`packRevision`)                                                      | `soul/behavior-guide.meta.json` (`packRevision`) + AutoSkill SkillBank (internal) |
| **Compliance gate**     | **OpenPersona constitution keyword scan**                                                             | **OpenPersona constitution keyword scan**                                         |
| Publish (opt-in)        | `git commit + push` to GitHub repo (auto-push, not re-registration)                                   | `git commit + push` to GitHub repo (auto-push, not re-registration)               |


**2. CLI command: `openpersona refine`**

The command is `refine` (not `evolve`) to distinguish from the existing `evolve-report` command and to precisely name the operation. New file: `lib/lifecycle/refine.js`.

```bash
# Check threshold; if met, emit refinement signal and exit
openpersona refine <slug> --emit

# Read signal-responses.json, run compliance, write behavior-guide.md + meta
openpersona refine <slug> --apply

# Shortcut for autoskill engine (synchronous — AutoSkill responds inline)
# Requires evolution.pack.engine: "autoskill" in persona.json; errors if engine is "signal"
openpersona refine <slug>

# Pull from AutoSkill shared pool (requires aggregation: "opt-in")
openpersona refine <slug> --from-pool
```

The two-step `--emit` / `--apply` design matches Signal Protocol's fire-and-forget async model: the host LLM processes the refinement signal between the two commands (as it does for any other signal type). No polling or timeout logic needed.

**3. AutoSkill integration path (`engine: "autoskill"`):**

[AutoSkill](https://github.com/ECNU-ICALK/AutoSkill) is an experience-driven lifelong learning system that already provides `AutoSkill4OpenClaw` — an embedded integration plugin for the OpenClaw ecosystem, using the same `SKILL.md` artifact format as OpenPersona. Rather than re-implementing skill extraction, OpenPersona delegates to AutoSkill and contributes what it uniquely provides: Trust Gradient governance.

Role boundary:


| Responsibility                                            | Owner                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Decide when to refine (event threshold)                   | OpenPersona (`openpersona refine`)                                                                         |
| Extract conversation experience → skill draft             | **AutoSkill** (`agent_end` hook)                                                                           |
| Merge / version management                                | **AutoSkill** SkillBank                                                                                    |
| Constitution + `evolution.instance.boundaries` compliance | **OpenPersona** constitution keyword scan                                                                  |
| Publish versioned pack                                    | `git commit + push` (by persona author); OpenPersona directory auto-indexes via existing repo registration |


AutoSkill hook contract (endpoint configured via `AUTOSKILL_ENDPOINT` env var, default `http://localhost:8080`):

- **Request payload**: `{ slug, eventLog: [...], currentBehaviorGuide: "<md>" }`
- **Response**: `{ behaviorGuide: "<updated-md>", revision: "0.1.N" }`

The hook contract is **Soul-only by design** — AutoSkill handles behavior-guide extraction; it does not know about OpenPersona's skill governance policies. **Skill dimension refinement is always a local operation** in `refine.js`, independent of the engine: `refine.js` scans new `eventLog` entries for `capability_gap` / `tool_missing` signals and applies eligible skill changes via `lib/installer.js` per the `evolution.skill` gates. This runs on both the Signal and AutoSkill paths.

`lib/lifecycle/refine.js` is an orchestration shim (~150 lines): check threshold → [autoskill] call hook or [signal] read response → run compliance scan on behavior-guide → write Soul sources → apply Skill gate changes → re-run generator (Social + SKILL.md) → write meta → optionally `git commit + push`.

**4. Built-in Signal Protocol path (`engine: "signal"`, default):**

For deployments without AutoSkill. Uses the existing fire-and-forget Signal Protocol with a two-step CLI design:

**Step A — `openpersona refine <slug> --emit`:**

1. Load `soul/behavior-guide.meta.json`; read `lastRefinedAt` timestamp
2. Count `eventLog` entries with `timestamp > lastRefinedAt` — these are the new events
3. If count < `triggerAfterEvents` → exit (no-op, print count/threshold)
4. If `soul/behavior-guide.md` does not exist → bootstrap from `persona.json` fields (`personality`, `speakingStyle`, `boundaries`) and write initial `soul/behavior-guide.md`; set `persona.json.behaviorGuide = "file:soul/behavior-guide.md"`
5. Build refinement prompt from new `eventLog` entries + `soul/self-narrative.md` + current `soul/behavior-guide.md`
6. Emit `refinement_request` signal via Signal Protocol (writes `signals.json`)
7. Exit — host LLM processes the signal asynchronously

**Step B — `openpersona refine <slug> --apply`:**

1. Read refinement result from `signal-responses.json`; fail gracefully if absent
2. Run constitution keyword scan on the refined Markdown (extends `validateConstitutionCompliance` logic to free-form text — no LLM required)
3. Reject and exit if constitutional violations detected; print offending excerpts
4. **[Soul]** Write `soul/behavior-guide.md` (new content); if cold-start occurred in Step A, ensure `persona.json.behaviorGuide = "file:soul/behavior-guide.md"` is set
5. **[Skill]** Scan new `eventLog` entries for `capability_gap` / `tool_missing` signal types; for each matched skill, check `evolution.skill` gates (`allowNewInstall`, `allowUpgrade`, `allowUninstall`); apply eligible changes via `lib/installer.js`
6. **[Social + SKILL.md]** Re-run generator: produces updated `SKILL.md` (reflects new `behavior-guide.md` + any newly installed skills) and regenerated `agent-card.json` (auto-syncs capability changes — no additional logic)
7. Write `soul/behavior-guide.meta.json` with updated `lastRefinedAt` and incremented `packRevision`
8. If `evolution.pack.autoPublish: true` → run `git add soul/behavior-guide.md persona.json agent-card.json SKILL.md && git commit -m "refine: v<revision>" && git push` inside the persona pack repo directory (auto-push, not re-registration — the OpenPersona directory already indexes this repo from the one-time `openpersona publish` step)

**5. Pack versioning — `soul/behavior-guide.meta.json`:**

```json
{
  "packRevision": "0.1.4",
  "engine": "autoskill",
  "lastRefinedAt": "2026-03-17T12:00:00Z",
  "totalEventsRefined": 42,
  "changeLog": [
    { "revision": "0.1.4", "summary": "Added boundary for overly technical explanations" }
  ]
}
```

Note: `packRevision` tracks the pack's refinement cycle (Soul + Skill + Social changes combined), distinct from `persona.json` `version` (creator-declared persona version) and `SKILL.md` frontmatter `version` (skill pack version at generation time).

**6. Multi-instance aggregation (opt-in, AutoSkill path only):**

When `evolution.pack.aggregation: "opt-in"`, anonymized `eventLog` entries are contributed to AutoSkill's shared SkillBank (Common pool). The pack maintainer runs `openpersona refine <slug> --from-pool` to pull aggregate refinement into a new published version. This is AutoSkill's native capability — OpenPersona only adds the compliance scan + `git commit + push` step.

**7. Distribution model and `autoPublish`:**

OpenPersona's distribution model mirrors [skills.sh](https://skills.sh/): the unit of distribution is a GitHub repo. There are two distinct operations:

- `**openpersona publish <owner/repo>`** — one-time, **author-initiated** registration: validates the repo contains a valid persona pack, registers it with the OpenPersona directory (`openpersona.co/skills`) so it appears immediately. This is an intentional author action, not automated.
- **Version updates** — after the one-time registration, pushing new content to the same repo is sufficient; `openpersona install <owner/repo>` always fetches the latest commit, so no re-registration is needed.

`evolution.pack.autoPublish: true` controls only the **version update** step: when `--apply` succeeds, automatically run `git add soul/behavior-guide.md persona.json agent-card.json SKILL.md && git commit -m "refine: v<revision>" && git push` inside the persona pack's repo directory. This field name is intentionally distinguished from `openpersona publish` (the registration command) — it is auto-**push**, not auto-register.

**8. Refinement surface:**

A persona skill pack encodes two structural levels: **four compositional layers** (Soul, Body, Faculty, Skill) and **five systemic cross-cutting concepts** (Evolution, Vitality, Economy, Social, Rhythm) — nine refinable dimensions in total. Each dimension has its own governance level.


| Dimension            | Pack artifact                                             | P24 scope                              | Governance                                                       |
| -------------------- | --------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| **Soul**             | `soul/behavior-guide.md`; `persona.json` character fields | ✅ P24 primary                          | Auto (compliance scan gate)                                      |
| **Skill**            | `skills` array in `persona.json`                          | ✅ P24 (via `evolution.skill` gate)     | Per `evolution.skill` policy declared in P23                     |
| **Social**           | `agent-card.json`                                         | ✅ P24 (auto-sync on Soul/Skill change) | Auto-regenerated by generator — zero extra logic                 |
| **Body**             | `body.runtime.models`, `channels`                         | 🔜 deferred                            | Per `evolution.body` policy (P23); requires env validation       |
| **Faculty**          | `faculties` array                                         | 🔜 deferred                            | Per `evolution.faculty` policy (P23); requires host coordination |
| **Evolution policy** | `evolution.instance.stageBehaviors`, `influenceBoundary`  | 🔜 deferred                            | Changes governance boundaries — requires human review            |
| **Vitality**         | vitality threshold config                                 | 🔜 deferred                            | Conservative; financial accuracy takes priority                  |
| **Economy**          | `economy/economic-state.json`                             | 🔜 deferred                            | Conservative; financial accuracy takes priority                  |
| **Rhythm**           | `persona.json` → `rhythm.heartbeat`, `circadian`          | 🔜 deferred                            | Requires usage-frequency analytics infrastructure                |


**What refinement writes:** Refinement always writes to **source files** (`soul/behavior-guide.md` and `persona.json` fields) — never to `SKILL.md` directly. `SKILL.md` is a **generated output** — `--apply` re-runs the generator after all source writes so the installed pack reflects every change. This guarantees generator consistency and makes pack evolution durable across re-generations.

**P24 implementation scope:** Soul (`behavior-guide.md` + cold-start bootstrap) is the primary refinement target. Skill expansion runs as a policy-gated side-effect, using P23's `evolution.skill` gates (`allowNewInstall` / `allowUpgrade` / `allowUninstall`) via the existing installer. Social Infrastructure (`agent-card.json`) is auto-regenerated whenever Soul or Skill changes — no additional logic required. Body, Faculty, Evolution policy, Vitality, Economy, and Rhythm refinement are deferred to future milestones.

**Compliance gate for Markdown:** The compliance check on refined content uses **constitutional keyword scanning** (extends the existing `validateConstitutionCompliance` regex patterns to free-form text) — not an LLM review. This keeps the compliance gate fast, deterministic, and zero-dependency. Pre-publish human review is the user's responsibility.

**9. Fork lineage connection:**

Pack refinement and fork lineage are two orthogonal version axes — `packRevision` (horizontal improvement cycle) and `generationDepth` (vertical inheritance tree). Currently they are independent: `lineage.json` tracks the constitution chain but not the pack revision at fork time.

Adding `parentPackRevision` to `lineage.json` at fork time closes this gap at minimal cost:

```json
{
  "parent": "samantha",
  "constitutionHash": "sha256:...",
  "generationDepth": 1,
  "parentPackRevision": "0.1.3"
}
```

This enables a child fork to know which refinement cycle it was created from, and whether the parent has since been refined further. A future `openpersona refine <child-slug> --from-parent` command could selectively merge parent refinements into a diverged child — the fork family tree becomes a structured alternative to AutoSkill's anonymous common pool.

**P24 scope addition:** When `openpersona fork` runs, read `soul/behavior-guide.meta.json` from the parent pack (if present) and write `parentPackRevision` into the child's `lineage.json`. One-line change to `lib/forker.js`. The `--from-parent` sub-command is deferred to P24+.

**Implementation gate:** Requires P23 (`evolution.pack` schema with `engine` field — ✅ complete). Signal Protocol already exists. Installer (`lib/installer.js`) and generator (`lib/generator/index.js`) already exist for Skill expansion and Social auto-sync. Files to create/modify: `lib/lifecycle/refine.js` (new, ~160 lines), `lib/forker.js` (add `parentPackRevision` write, ~5 lines), `bin/cli.js` (add `refine` command).

---

### P25 — Connector Positioning & Minimal Declaration (Medium Priority)

**Positioning (decision):**

- Connector is an adapter contract, not a secrets vault.
- OpenPersona handles dependency declaration; runner handles secrets, OAuth, scope, and audit.
- Transport is implementation-agnostic: MCP / CLI / API are all valid.

**Current policy:**

- Do not implement connector runtime features in this milestone.
- Keep using existing `skills[].envVars` for P11 pilot presets.
- Revisit minimal declaration-layer implementation after pilot metrics are collected.

**Trigger conditions for starting P25 implementation:**

- First-time setup success rate for external dependencies is below `80%`, or
- Cross-skill duplicate dependency declarations exceed `40%`, or
- Task failures caused by missing dependency readiness exceed `20%`.

---

### P26-Models — Body Runtime Model Fabric (Deferred)

**Problem:**
`body.runtime.models` exists in the schema as a primitive string array (`["claude", "gpt-4"]`). It has no role classification, no provider structure, no routing hints, and no self-awareness injection. `evolution.body.allowModelSwap` gates model changes but has nothing structured to swap.

**Design (recorded for future implementation):**

```json
"body": {
  "runtime": {
    "models": [
      { "role": "language", "provider": "anthropic", "name": "claude-opus-4", "primary": true },
      { "role": "fast", "provider": "anthropic", "name": "claude-haiku-4" },
      { "role": "embedding", "provider": "openai", "name": "text-embedding-3-large" },
      { "role": "custom", "name": "persona-finetuned-v1",
        "endpoint": "https://my-endpoint.example.com/v1", "auth": "CUSTOM_MODEL_API_KEY" }
    ],
    "routing": {
      "policy": "quality-first",
      "hints": [{ "when": "task == 'quick'", "prefer": "fast" }]
    }
  }
}
```

**Key design decisions (recorded):**

- `models` and `modalities` are orthogonal: `modalities` declares I/O channels; `models` declares cognitive engines. Vision provider in `modalities` is the I/O processor; the language model in `models` is the reasoning engine — no overlap.
- `role` is an open string enum: `language`, `fast`, `reasoning`, `embedding`, `reranker`, `custom`
- `provider` is an open string: `anthropic`, `openai`, `google`, `mistral`, `ollama`, `custom`
- `primary: true` marks the default language model (fallback for runners; target of `allowModelSwap`)
- `custom` role + `endpoint` covers self-hosted and fine-tuned models; `auth` is the env var name (not the credential value)
- MoE-style routing belongs to the **runner layer**, not `persona.json`. The `routing.hints` block is a declaration of intent/preference — runners are not required to honor it. True runtime routing (cost/latency/load-aware) is runner intelligence.
- `body.runtime.routing` is a separate optional block (not inside `models`) to keep the model registry and routing policy independently updatable.

**Implementation scope (when triggered):**

1. Update `body.runtime.models` schema from string array to mixed array (string | object)
2. Add `body.runtime.routing` optional schema field
3. Add derived fields: `hasModelFabric`, `primaryLanguageModel`, `modelRoles` for soul/injection.md self-awareness
4. Inject model-awareness block into `soul-awareness-body.partial.md`
5. Update `evolution.body.allowModelSwap` enforcement in `state-sync.js` to reference structured model declarations
6. Add tests: model self-awareness, primary model fallback, custom endpoint, routing hints

**Trigger threshold:** Implement when 2+ presets or a community preset needs multi-model or custom endpoint declaration.

---

### P26-Voice×Avatar — Voice × Avatar Lip-Sync Bridge (Deferred, Architecture Gap)

**Problem:**
The `voice` faculty and `avatar` faculty operate independently with no wiring between them. When both are declared, their voice channels overlap ambiguously. Three distinct configuration scenarios exist but are not documented or enforced at any gate.

**Three scenarios (recorded for clarity):**


| Scenario                         | voice faculty | avatar provider | Behavior                                                                                      | Status                   |
| -------------------------------- | ------------- | --------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| **A — voice only**               | declared      | none            | Standalone TTS audio output; no visual                                                        | ✅ Works today            |
| **B — avatar with built-in TTS** | not needed    | HeyGen / cloud  | Provider speaks natively; `sensoryStatus.voice: true`; voice faculty is redundant             | ✅ Works today            |
| **C — avatar + external TTS**    | declared      | VRM / Live2D    | voice faculty generates `audioUrl` → `scripts/avatar-runtime.js sendAudio` → avatar lip-syncs | ❌ Bridge not implemented |


**Scenario C gap:** No bridge script connects voice faculty TTS output to avatar-runtime's `/v1/input/audio` endpoint. The agent would need to manually chain the two calls. There is also no generator-level warning when both are declared with a non-TTS provider (Scenario C setup).

**Design (recorded for future implementation):**

- Add `scripts/voice-avatar-bridge.js` to generated persona packs when both `voice` faculty and `avatar` faculty are declared with a non-TTS provider (VRM/Live2D)
- Bridge: call `speak.js` → capture `audioUrl` → call `avatar-runtime.js sendAudio <session> <audioUrl>`
- Inject Scenario A/B/C awareness into `soul-awareness-body.partial.md` when both faculties are active
- Add Generate Gate warning: "voice faculty + HeyGen provider = built-in TTS takes precedence; voice faculty will be dormant"

**Key boundary (non-negotiable):**
`sensoryStatus.voice` from avatar-runtime means "this avatar renderer supports lip-sync output." It is **never** equivalent to OpenPersona's `voice` faculty. These are different layers: avatar-runtime's voice is a rendering capability; the voice faculty is a persona behavioral capability. Documents and code must not conflate the two.

**Trigger threshold:** Implement when a preset needs VRM/Live2D avatar + ElevenLabs voice simultaneously (Scenario C).

---

### P27-A — Trial Evolution (Deferred)

**Inspiration:** [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — the "modify → fixed-budget run → evaluate → keep/discard" experiment loop applied to persona behavioral evolution.

**Problem:**
Current Evolution is one-directional — traits drift forward, `promoteToInstinct` promotes patterns, but there is no automatic reversion mechanism. A persona cannot "try" a behavioral change for N conversations and roll it back if it doesn't improve.

**Design (recorded):**

```json
"evolution": {
  "instance": {
    "trial": {
      "enabled": true,
      "budget": 5,
      "metric": "vitality",
      "revertOnFailure": true
    }
  }
}
```

- `state.json` new `trialState` field — staging area for experimental `evolvedTraits`
- After `budget` conversations, compare vitality delta against baseline
- Auto-decision: delta above threshold → promote to `evolvedTraits`; below → revert `trialState` to baseline
- Extends `promoteToInstinct` from manual trigger to an autonomous experiment loop
- Trust Gradient preserved: trial state and canonical state are separate; Runtime Gate enforces `immutableTraits` on both

**Relationship to autoresearch:**
`program.md` → `soul/behavior-guide.md` (human-editable research org instructions)
`train.py` → `evolvedTraits` patch (agent-modified behavioral parameters)
`val_bpb` metric → `vitality score` delta
Fixed 5-minute budget → fixed N-conversation trial window

**Implementation gate:** Implement after P11 pilot accumulates enough trial data to validate the metric. Requires vitality scoring to be stable across multi-conversation windows.

**Skill vs. Framework:**

- Trial Evolution loop mechanism = **framework** (Evolution system extension)
- `research-lab` Skill (autoresearch-style autonomous AI research on single-GPU training) = **Skill** declaration only, not framework-native. Personas that need this capability (e.g. Evaluator in P11-C) declare `{ "name": "research-lab", "install": "github:karpathy/autoresearch" }` — no framework changes needed.

---

### P26 — Runtime Capability Composition (Deferred)

**Scope reserved (future):**

- Unified runtime capability snapshot in `state.json` (skills/connectors/faculty/model/mode)
- Named context profiles and runtime switching
- Runtime Gate enforcement so dynamic activation never bypasses constitution and boundaries
- Evidence-driven orchestration: every activation/demotion decision must be backed by observable runtime signals, not ad-hoc heuristics

**Current policy:**

- Deferred until after P11 pilot and after P25 trigger review.
- No schema/code changes in this milestone.

**Governance principle (recorded):**

- Runtime capability changes are classified into two classes:
  - **Temporary need** (session/task scoped): activate via runtime state only, auto-expire by TTL or task completion
  - **Persistent need** (behavioral trend): promote only when repeated evidence crosses thresholds
- Natural selection is part of **Evolution governance** (not ad-hoc ops):
  - Frequently unused capabilities should be downgraded from active -> dormant
  - Long-term unused installed skills may enter uninstall candidates (policy-gated, human-reviewable by default)
- Suggested evidence signals for future implementation:
  - Usage frequency and recency
  - Success/failure contribution to task outcomes
  - User-confirmed utility score
  - Cost/benefit pressure (economy/vitality signals)

---

### P27 — Meta-Cognition (Evolution Sub-Dimension)

**Problem:** OpenPersona's Evolution concept tracks growth from external signals (relationship progression, mood shifts, trait emergence from user interactions). There is no mechanism for a persona to observe and improve its own behavior — to log errors, record corrections, detect recurring patterns in its own outputs, and derive behavioral rules from accumulated evidence.

This "inward sensing" gap means a persona cannot answer: *"What mistakes do I keep making? What have I learned from being corrected? What behavior patterns should I reinforce or change?"*

**Direction:**

Meta-cognition is a sub-dimension of Evolution — learning from internal signals complements the existing learning from external signals. Both feed the same growth model.

`**persona.json` declaration:**

```json
"evolution": {
  "enabled": true,
  "instance": {
    "metaCognition": {
      "enabled": true,
      "logErrors": true,
      "logCorrections": true,
      "promoteThreshold": 3
    },
    "boundaries": { ... }
  }
}
```

`**state.json` data model:**

```json
{
  "metaCognitionLog": [
    {
      "type": "correction",
      "trigger": "User said explanation was confusing",
      "lesson": "Use concrete examples before abstract concepts",
      "recurrence": 1,
      "status": "pending",
      "timestamp": "..."
    }
  ],
  "behaviorRules": [
    {
      "rule": "Always confirm scope before starting multi-step tasks",
      "promotedFrom": "LRN-20260301-001",
      "recurrence": 3,
      "timestamp": "..."
    }
  ]
}
```

**Promotion chain** (reuses P1 `promoteToInstinct` pattern):

```
metaCognitionLog[recurrence >= promoteThreshold] → behaviorRules
behaviorRules (long-term validated) → evolvedTraits
```

**ClawHub integration:**

- `clawhub:ivangdavila/self-improving` — tiered memory architecture (HOT/WARM/COLD) informs `metaCognitionLog` design; storage pattern is runner-agnostic (`~/self-improving/`)
- `clawhub:pskoett/self-improving-agent` — `.learnings/` log format informs entry schema; adopt core logging pattern, skip OpenClaw-specific hooks

**Implementation scope:**

- `schemas/evolution/soul-state.schema.json` — add `metaCognitionLog[]` and `behaviorRules[]` arrays
- `persona.input.schema.json` — add `evolution.instance.metaCognition` object
- `lib/generator/validate.js` — validate `metaCognition` fields
- `templates/body/state-sync.template.js` — extend `writeState` to append to `metaCognitionLog`; extend `promoteToInstinct` (or new `promoteToRule`) for threshold-based promotion
- `templates/soul/partials/soul-awareness-growth.partial.md` — inject meta-cognition awareness when enabled

**Current policy:**

- Deferred until after P11 pilot. Meta-cognition is most valuable when a persona has accumulated enough interaction history to have patterns worth reflecting on.
- No schema/code changes in this milestone.

**Trigger conditions for starting P27 implementation:**

- At least one P11 pilot preset is in active use with 50+ conversations, or
- User correction frequency in pilot data exceeds `15%` of interactions (indicating behavior patterns worth learning from)

---

## Summary: From Skeleton to Muscle

OpenPersona's four-layer skeleton is solid as of v0.16.1. The framework successfully standardizes persona composition, lifecycle, evolution, economy, and on-chain identity. The remaining gap has shifted:

> The architecture specification is no longer ahead of implementation. The gap is now between **working logic and intelligent behavior** — the layers communicate, but they do not yet adapt to each other in real time.

**Priority investment map:**


| Priority | Item                                            | Category        | Why                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅        | P4-A Skill Signature Verification               | Security        | Trust gate; `trust` field on `persona.json skills[]` entries; `evolution.skill.minTrustLevel` enum (`verified`/`community`/`unverified`); enforced at `state-sync.js writeState` (capability_unlock pendingCommand check, wipe-prevention) + soul awareness Body section (always-rendered self-enforcement); extends P23 `evolution.skill` + Signal Protocol; `validateEvolutionSkill()` enum check. Tests: 451→471 (+20). |
| ✅        | P1 Memory as Soul Infrastructure                | Feature         | Memory supersession (`memory.js update` + `supersededBy` chain); Soul-Memory Bridge (`promoteToInstinct`: eventLog → evolvedTraits, threshold + immutableTraits gate); Fork memory inheritance (`memory.inheritance: copy/none`); `openpersona state promote <slug>` CLI; `memory` top-level schema field (`inheritance`, `promotionThreshold`). Tests: 434→451 (+17).                                                     |
| ✅        | P24 Skill Pack Refinement                       | Product Quality | `openpersona refine` CLI (`lib/lifecycle/refine.js`); 9-dimension surface (4 layers + 5 concepts); P24 scope: Soul-first (behavior-guide.md cold-start + compliance scan) + Skill (evolution.skill gates) + Social (agent-card.json auto-sync); refinement writes to sources (persona.json + behavior-guide.md), SKILL.md re-generated; two-step --emit/--apply; publish = git commit+push                                 |
| ✅        | P11-Prep Universal Materials Baseline           | Architecture    | Completed in v0.20.x — baseline frozen, memory auto-injected, evolution guard in place                                                                                                                                                                                                                                                                                                                                     |
| P4       | P11 Professional Preset Matrix                  | Growth          | Ecosystem adaptation pilots first (gstack-led conversion), then expand to domain-track presets using validated baseline materials                                                                                                                                                                                                                                                                                          |
| P5       | P11-C Meta-Persona Ops                          | Productivity    | Builder/Trainer/Evaluator presets create an internal self-improvement loop while also serving as reusable deliverable presets                                                                                                                                                                                                                                                                                              |
| P6       | P25 Connector Positioning & Minimal Declaration | Architecture    | Keep connector as declaration-layer concern; continue with `skills[].envVars` during P11 pilot; only implement if trigger thresholds are hit                                                                                                                                                                                                                                                                               |
| P7       | P26-Models Body Runtime Model Fabric            | Architecture    | Structured `body.runtime.models` (role/provider/primary/custom endpoint); `body.runtime.routing` hints; model self-awareness injection; MoE routing stays in runner layer. Trigger: 2+ presets need multi-model or custom endpoint.                                                                                                                                                                                        |
| P8       | P27-A Trial Evolution                           | Evolution       | autoresearch-inspired experiment loop: try behavioral change for N conversations → keep/revert based on vitality delta. Framework-layer only — `research-lab` Skill for AI research workflows is a separate Skill declaration. Trigger: after P11 pilot validates vitality metric stability.                                                                                                                               |
| P9       | P26 Runtime Capability Composition              | Architecture    | Reserved design; deferred until P11 pilot + P25 trigger review                                                                                                                                                                                                                                                                                                                                                             |
| P9       | P27 Meta-Cognition                              | Evolution       | Inward sensing — persona observes and improves own behavior; deferred until P11 pilot accumulates correction data (trigger: 50+ conversations or 15%+ correction rate)                                                                                                                                                                                                                                                     |
| P9       | P18 State Schema Migration                      | Forward Compat  | Reserve migration pattern before first breaking state change                                                                                                                                                                                                                                                                                                                                                               |
| P10      | P20 Transport Abstraction                       | Architecture    | Reserve interface; implement adapters on demand                                                                                                                                                                                                                                                                                                                                                                            |
| P11      | P10 Instant Awakening                           | Architecture    | Daemon deferred to runner layer                                                                                                                                                                                                                                                                                                                                                                                            |
| ✅        | P9 Vitality-Logic Closed Loop                   | Completed       | Economy survivalPolicy opt-in; tier-driven behavior.                                                                                                                                                                                                                                                                                                                                                                       |
| ✅        | P15 Generator Pipeline Modularization           | Completed       | 7-phase pipeline + GeneratorContext; load/derived/prepare/render separation.                                                                                                                                                                                                                                                                                                                                               |
| ✅        | P16 Template Partial Decomposition              | Completed       | soul-injection split into 6 partials; 300→25-line orchestrator.                                                                                                                                                                                                                                                                                                                                                            |
| ✅        | P17 Evolution Constraint Gate                   | Completed       | Trust Gradient fully closed — all three gates active.                                                                                                                                                                                                                                                                                                                                                                      |
| ✅        | P19 Faculty/Skill Boundary                      | Completed       | Code + spec + docs fully aligned; selfie/music/reminder → Skills; economy → Aspect.                                                                                                                                                                                                                                                                                                                                        |
| ✅        | P23 Evolution Multi-dimensional Expansion       | Completed       | evolution.instance/pack/faculty/body/skill schema; backward-compat shim; 11 new tests. Tests: 404→415 (+11).                                                                                                                                                                                                                                                                                                               |


**Recommended next milestone focus:**

1. ~~**P11-Prep (universal materials baseline)**~~ ✅ Completed in v0.20.x.
2. **P11 (professional preset matrix)** — after P11-Prep freeze, run ecosystem adaptation pilots first (starting with `gstack`) and collect dependency/setup metrics; expand to domain-track presets after validation.
3. **P11-C (meta-persona ops pilot)** — run 3 lifecycle-role presets (Builder/Trainer/Evaluator) as an internal productivity track and compare against domain-track pilot outcomes.
4. **P25 checkpoint (connector)** — after P11 pilot data is available, decide whether to start minimal declaration implementation based on the trigger thresholds defined in P25.
5. **P1-A (memory temporal decay)** — the supersession chain (`supersededBy`) was delivered in P1; the `decayWeight = e^(−λ·days)` scoring and configurable λ remain open. A moderate-scope Memory Faculty–internal change with direct user-visible impact (prevents contradictory "coffee vs tea" retrievals).
6. **P18 (state schema migration)** — reserve the `migrateState()` pattern in `state-sync.js` before the first breaking state schema change is designed. Low effort, high future-proofing value.
7. **P11-B (team preset bundle)** — after single-persona presets are validated, compose role-based multi-persona bundles for coordinated workflows (PM/Reviewer/QA/Release, etc.).
8. ~~**Living Canvas CLI promotion**~~ — **Done:** top-level `openpersona canvas <slug>` is implemented in `bin/cli.js` (Living Canvas is Social expression, not Vitality; `vitality` retains only `score` / `report`).

