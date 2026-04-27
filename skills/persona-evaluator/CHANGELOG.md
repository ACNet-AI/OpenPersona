# Changelog — persona-evaluator

All notable changes to this skill are documented in this file.

The skill is also bundled inside the [OpenPersona](https://github.com/acnlabs/OpenPersona) main repo; this changelog is the source of truth for the standalone distribution at [acnlabs/persona-evaluator](https://github.com/acnlabs/persona-evaluator) and the ClawdHub / openpersona.co/skills listings.

The deeper rubric and review trail for the wound-fix passes lives in [docs/SKILL-RUBRIC.md](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md) and [docs/SKILL-RUBRIC-SESSION-2.md](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC-SESSION-2.md) in the main repo.

---

## [0.3.4] — 2026-04-27

### Changed

Docs-only patch — no functional change to scoring, CLI, rubric, or test surface. Three concurrent SKILL.md cleanups:

- **Trim off-target comparisons.** Removed two references to `darwin-skill` (What/When intro + Relationship table). `darwin-skill` optimises SKILL.md design; persona-evaluator audits persona packs — different objects (analogous to "calculator vs Word" category mismatch). The skill now defines itself on its own terms instead of via a negative comparison to an unrelated tool.
- **Refresh standalone-distributable note in Install section.** Previously read "will be published once a separate repository is created" — stale since the 2026-04-26 standalone publish. Now points to the shipped [`acnlabs/persona-evaluator`](https://github.com/acnlabs/persona-evaluator) repo and [openpersona.co/skill/persona-evaluator](https://openpersona.co/skill/persona-evaluator) listing.
- **Tighten body.** Removed single-point Black-box → Choosing-a-mode backref (no other section uses backref style); folded "Re-evaluate after fixes" sub-section into one sentence at end of "Apply fixes via refine" (was 5 lines re-stating the Quick Start command).

Net effect: SKILL.md 282 → 274 lines, 8 inserts / 15 deletions. CLI behaviour, scoring rubric, and test suite unchanged from v0.3.3. The companion [docs/SKILL-RUBRIC.md](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md) v0.1.5 captures the broader rubric-level cross-tool comparison work that surfaced the off-target comparisons.

---

## [0.3.3] — 2026-04-26

### Fixed

- **W6 (CRITICAL) — schema bifurcation root cause** uncovered during Step 4-extended validation on `persona-secondme-skill`:
  - `lib/lifecycle/evaluator.js` was reading `p.soul.identity.*`, `p.soul.character.*`, `p.soul.aesthetic.*` (the v0.17+ creator-facing INPUT schema, nested grouped format).
  - But all on-disk persona packs use the FLAT schema produced by `lib/generator/index.js:normalizeSoulInput()` which lifts `soul.*` sub-fields to top level and `delete persona.soul` before writing.
  - Net effect: every real persona evaluated with the previous evaluator read all soul fields as `null` and all roles as `null`, falling to the `_default` severity profile. The 0.3.2 W4/W5 null-field rules were partly addressing the *symptom* of W6 rather than genuinely-null content. **Step 4 capstone (entrepreneur-skill 6/10) was evaluated against null inputs and is therefore invalid as a substantive verdict.**
  - **Fix:** introduced `getSoulView(p)` helper using nested-first / flat-fallback (mirrors `lib/lifecycle/refine.js` L86-89). Refactored 5 sites: `scoreSoul` (lines 128-130, 173, 180-186), `extractEvaluableContent` (lines 680-710), `evaluatePersona` role lookup (line 767). 7 W6 regression tests added (`tests/evaluator.test.js`), including a parity check that flat and nested fixtures of the same persona produce identical scores.
  - **Re-validation:** entrepreneur-skill (authored) scores **7/10 Good** post-fix (was 6 phantom); persona-secondme-skill (generated) scores **7/10 Good**. Both share `character.background: null` as the genuine null field — this is W4's actual scope (a real null, not a W6 phantom). Generated-vs-authored parity at 7/10 establishes the secondme pipeline produces packs comparable to hand-crafted personas.
  - Test surface: 879 tests pass (was 872 pre-fix), 131 suites, 8/8 skills pass spec.

---

## [0.3.2] — 2026-04-26

### Fixed

Methodological wound-fix pass driven by Step 4 capability validation on `entrepreneur-skill`:

- **W4 fix:** [references/RUBRICS.md](references/RUBRICS.md) now specifies null-field scoring (strict/normal: 0–2; lenient: 3–4) as an override on top of severity-aware scoring, with explicit rationale-required clause. The previous lenient-floor-of-≥6 was written for terse-but-present content and was incorrectly applied to absent fields.
- **W5 fix:** `behavior-guide.md` Soul-fidelity check now requires `character.personality` and/or `character.speakingStyle` to be populated; if both are null, the check is marked **untestable** rather than failed. Avoids double-penalising a behavior-guide for failing a check whose reference fields don't exist.
- Both wounds were surfaced by dogfooding `persona-evaluator` on a real persona where Soul fields were null — the rubric scored the persona harshly using checks that were structurally inapplicable.

---

## [0.3.1] — 2026-04-26

### Changed

Wound-fix pass driven by SKILL-RUBRIC v0.1.4 cold validation:

- Removed unjustified `Bash(node:*)` from `allowed-tools` (zero documented uses across SKILL.md, README.md, references/).
- Promoted mode-selection table from `### Mode selection quick reference` (buried under `## Black-box Semantic Evaluation` at H3) to a top-level `## Choosing a mode` section right after Quick Start, so a host LLM picks the correct mode within ~30 seconds of opening the file.
- Added an inline changelog (D5.3 versioning anchor — was previously vanity-bump-only). This separate `CHANGELOG.md` was added later in the 0.3.3 release as part of preparing the standalone distribution.

---

## [0.3.0] — 2026-04-26

### Added

Initial release. Three modes shipped together as one coherent skill:

- **Structural** CLI (`npx openpersona evaluate <slug>`) — 4 Layers × 5 Systemic Concepts × Constitution gate, deterministic, CI-friendly.
- **Semantic white-box** (`--pack-content`) — per-field rubrics in [references/RUBRICS.md](references/RUBRICS.md), role-aware severity (`strict` / `normal` / `lenient`), self- and peer-mode bias counters.
- **Semantic black-box** — Tier 1/2/3 data sources, A2A handshake, 10-probe set, identity-coherence dimension, confidence caps. Mechanics in [references/BLACK-BOX.md](references/BLACK-BOX.md); report formats in [references/REPORT-FORMAT.md](references/REPORT-FORMAT.md).

### Note

The 0.3.0 starting version reflects shipping all three modes as one release rather than a series of accreted minor versions. Prior 0.1.x / 0.2.x versions do not exist in this repo's history.
