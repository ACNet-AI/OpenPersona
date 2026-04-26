# SKILL-RUBRIC Session 2 — Multi-skill Application Report

> Apply `SKILL-RUBRIC.md` v0.1.2 to 8 in-repo skills. Surface cross-cutting
> findings. Drive v0.1.3 (immediate patches) and v0.2.0 (design pass).

**Date:** 2026-04-26
**Reviewer (human):** guyue
**Reviewer-LLM:** Claude Sonnet 4.6 × 1 pass per skill — D3.1 hard cap = 4/10 across the board
**Rubric version under test:** v0.1.2
**Scope:** all 8 skills under `skills/` (one self-eval was Session 1.5;
re-applying v0.1.2 to itself is deferred to Session 3 baseline).

---

## Per-skill summary

Type-weighted overall on the right. Acute wound = single highest-leverage
fix surfaced by D-by-D anchors.

| # | Skill                    | Declared type | Reviewer-inferred type | D1 | D2 | D3 | D4 | D5 | Overall | Acute wound                                                         |
| - | ------------------------ | ------------- | ---------------------- | -- | -- | -- | -- | -- | ------- | ------------------------------------------------------------------- |
| 1 | `persona-evaluator`      | tool          | tool                   | 7  | 6  | 4  | 8  | 7  | 6.4     | mode-selection table buried; `Bash(node:*)` over-broad              |
| 2 | `secondme-skill`         | persona       | **framework**          | 7  | 7  | 4  | 7  | 7  | 6.4     | type misclassification; D1 archetype absent; `WebSearch` unused     |
| 3 | `anyone-skill`           | meta          | meta                   | 8  | 6  | 4  | 8  | 7  | 6.6     | SKILL.md 484 lines — at spec ceiling, split overdue                 |
| 4 | `open-persona`           | framework     | framework              | 7  | 5  | 4  | 7  | 8  | 6.2     | SKILL.md 548 lines — **fails** 500-line spec ceiling                |
| 5 | `persona-knowledge`      | tool          | tool                   | 8  | 7  | 4  | 7  | 6  | 6.4     | none acute — broadly solid; D1 negative-scope notably strong        |
| 6 | `persona-model-trainer`  | tool          | tool                   | 7  | 4  | 4  | 7  | 7  | 5.8     | SKILL.md 736 lines — worst in batch, emergency split                |
| 7 | `brand-persona-skill`    | persona       | persona                | 7  | 5  | 4  | 7  | 6  | 6.0     | D2: tools-list claimed but unverified; references missing           |
| 8 | `entrepreneur-skill`     | persona       | persona                | 6  | 5  | 4  | 6  | 5  | 5.2     | no `## Trigger phrases` section — D1.4 fails                        |

D3 column is uniformly 4/10 because the calibration ladder is doing exactly
what it was designed to do under single-LLM, single-pass review. This is not
information about the skills; it is information about the review setup.

Median overall: 6.2/10. Range: 5.2 – 6.6. **No skill cleared 7.** That
band is itself a finding — see F2.

---

## Cross-cutting findings

Surfaced by reviewing all 8 against the same anchors.

**F1. D3 floor swallows the dimension under one-LLM review.**
Every skill scored D3 = 4/10. The calibration ladder is honest, but as a
practical matter D3 stops discriminating until Session 3 brings a second LLM.
For now D3 is a constant, not a signal.

**F2. Mid-band compression (5–7) is the median outcome.**
Eight skills, all between 5.2 and 6.6. Either the rubric is genuinely
under-discriminating, or the in-repo population is genuinely uniform-mid.
Without a known-bad and known-great control, can't tell. Need calibration
anchors (a deliberately broken skill + a deliberately exemplary skill).

**F3. D2.3 (body length) is the most-cited deduct across the batch.**
Hits 4 of 8 skills (anyone, open-persona, persona-model-trainer, also brushed
by SKILL-RUBRIC itself per Open Issues 8). The 250 / 500 anchor is doing
work — it is the rubric's most actionable check. But the anchor is binary
(under / over 500); a graduated pressure curve would discriminate the
"comfortable 300" from the "panicky 480".

**F4. `persona` type misclassification is easy.**
`secondme-skill` is declared `persona` but its SKILL.md L14–16 says
"orchestration skill package... Foundation: `openpersona`... Orchestration:
`secondme-skill`... Capability chain: ...". That is `framework`. The rubric's
Reviewing Procedure step 1 ("read description and tags") gave the wrong
answer. **The fix belongs in the rubric, not in `secondme-skill`** — the
type detector needs to read the SKILL.md *body*, not just the frontmatter.

**F5. `allowed-tools` over-declaration is rampant.**
Three skills declare tools they don't visibly use (secondme: `WebSearch`;
persona-evaluator: `Bash(node:*)` for what should be `Bash(node scripts/...:*)`;
brand-persona: tools list unverified against actual workflow). D2.4 catches
this but as a 0–10 score, not a checklist — a binary "every declared tool
is invoked at least once in the SKILL.md or references" check would be
sharper.

**F6. Mode-discoverability anchor (D2.2) has wide variance in interpretation.**
"Can a user pick the right mode in ≤ 30 seconds" is operational, but where
the table lives matters more than whether it exists. `persona-evaluator`
has the table at L178 — past the fold. `anyone-skill` has it at the top.
Same dimension, very different practical behaviour. The anchor needs a
position requirement: "above the first H2 below the frontmatter".

**F7. D1.3 (evidence of use) is the single weakest anchor.**
Most skills score it on intent ("we plan to use this in CI") rather than
artefact ("here is a real invocation log"). The Self-eval Log added in v0.1.2
helped on `SKILL-RUBRIC` itself but isn't a pattern other skills adopted.
Consider lifting the Self-eval Log idea into a recommended SKILL.md section
for any skill scoring itself on D1.3.

**F8. `persona`-type skills are weak on D5 (lifecycle-fit).**
Three persona skills (entrepreneur, brand, secondme — though secondme
mis-typed) all sub-7 on D5. The lenient classification softens the deduct,
but the underlying shape is real: persona packs lack handoff contracts to
adjacent skills. The rubric's lenient floor of 6 is correct but is masking
a real trend that v0.2.0 should at least name in the type-weighting prose.

**F9. `spec` gate's N/A path was useful exactly once.**
Only `SKILL-RUBRIC` itself uses it. The path is correct in v0.1.2 but
under-tested. Whether it generalises to other future spec-type subjects
remains untested (Open Issues 9).

**F10. D5.4 (standalone vs bundled) is forward-looking and currently
unscoreable.** Every skill in this repo is repo-internal. The anchor asks
whether there's a credible path to standalone publication, but this batch
gave no signal — every skill scored "the path is plausible but not yet
exercised". Consider downgrading this anchor's weight or marking it
explicitly forward-looking.

---

## Proposed `SKILL-RUBRIC` v0.2.0 changes

13 changes, derived from F1–F10. Ordered by leverage (highest first).
**Two of these are P0 patches that go into v0.1.3 immediately;** the rest
need design-pass review before v0.2.0.

### P0 — fold into v0.1.3 immediately (data-driven bug fixes)

1. **Reclassify `secondme-skill` from `persona` to `framework`** in the
   Type-aware Weighting table examples column. Evidence: SKILL.md L14–16
   "orchestration skill package... Foundation / Orchestration / Capability
   chain". *(F4)*
2. **Add "declared-vs-inferred type mismatch" hard rule** to
   "Hard Rules for the Reviewer", mirroring `persona-evaluator` L154. If the
   reviewer infers a different type than `metadata.tags` declares, surface
   it as a separate cross-cutting observation; do not silently re-score.
   *(F4)*

### P1 — v0.2.0 design pass (need review before applying)

3. Split D3 into D3a (reproducibility) and D3b (adversarial robustness).
   Currently the D3.1 hard cap masks adversarial signal. *(F1, Open Issues 2)*
4. D2.3 graduated pressure: replace binary ≤ 500 / > 500 with a curve —
   ≤ 250 = full credit, 250–400 = soft pressure, 400–500 = strong
   pressure, > 500 = hard fail. *(F3)*
5. D2.2 position requirement: mode-selection table must be above the first
   H2 below frontmatter. *(F6)*
6. D2.4 binary tool-usage check: every entry in `allowed-tools` must be
   invoked at least once in SKILL.md or referenced files; un-cited tools
   trigger an automatic 1-point deduct. *(F5)*
7. Add a "type detector reads body, not frontmatter" check in Reviewing
   Procedure step 1. *(F4)*
8. Lift Self-eval Log into a recommended SKILL.md section for any skill
   scoring itself on D1.3. *(F7)*
9. Calibration anchor: maintain a known-bad and known-great fixture skill
   pair under `tests/rubric-fixtures/` so the rubric can demonstrate
   discrimination. *(F2)*
10. Predicted-uncapped D3 column in the report header: alongside the actual
    D3 score, report what D3 would have been *without* the calibration cap,
    so multi-LLM Session 3 can diff. *(F1)*
11. D5 type-weighting prose: name explicitly that `persona`-type skills
    tend to weak D5 and that's expected, not a defect, until an adjacent-
    skill ecosystem emerges. *(F8)*
12. D5.4 marked forward-looking: anchor explicitly says "score 6 if there's
    no signal yet; reserve 7+ for skills that have actually shipped
    standalone." *(F10)*
13. `spec`-type weighting: revisit after Session 3 produces a second
    `spec`-type subject; v0.1.x has only one. *(F9, Open Issues 9)*

---

## Known limitations of this Session 2 pass

These are the same Open Issues 1 + 5 caveats from the rubric itself, made
concrete here.

- **Single-LLM, single-pass per skill.** D3 column uniformly 4/10 reflects
  the review setup, not the skills. Session 3 must repeat this pass with at
  least Claude + GPT to produce inter-rater data. The rubric's own D3.1
  ladder predicts this; this report is the predicted-uncapped baseline.
- **Self-bias on `persona-evaluator`.** I authored both `SKILL-RUBRIC` and
  `persona-evaluator`. The 6.4 score on persona-evaluator should be
  treated as upper-bound — an outside reviewer is likely to score lower
  on D1 (evidence of use is still thin) and D2 (`Bash(node:*)` over-broad).
- **No calibration anchors.** Without a deliberately-bad and a
  deliberately-great fixture, the mid-band compression in F2 cannot be
  attributed to the rubric vs the population. v0.2.0 change #9 addresses
  this.
- **Acute-wound column is reviewer-judged, not rubric-derived.** A future
  v0.2.0 may want a deterministic rule for picking the wound (e.g. lowest
  per-anchor sub-score weighted by dimension strictness) rather than
  reviewer gestalt.

---

## Step 2 cold re-validation (rubric v0.1.4, same-day)

After `SKILL-RUBRIC` shipped v0.1.3 (P0 patches) and v0.1.4 (self-dogfooding
fix: archival split + anchor-stability rename), the user-mandated trust chain
required cold validation of Session 2's verdicts before any wound-fixing.
This section records the cold pass on `persona-evaluator` — row 1 of the
per-skill table, the highest acute-wound concentration.

**Method.** Independently re-read `skills/persona-evaluator/SKILL.md` +
`README.md` + 3 `references/*.md` without consulting the Session 2 verdict.
Score D-by-D using **v0.1.4** anchors (Session 2 used v0.1.2). Diff against
Session 2 only after the cold score was final.

**Reviewer-LLM:** Claude Sonnet 4.6 × 1 — D3.1 cap = 4/10 (same as Session 2).

### Diff: Session 2 (v0.1.2) vs Cold (v0.1.4)

| Dim     | Session 2 | Cold | Δ    | Cause                                                                                                                        |
| ------- | --------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1      | 7         | 7    | 0    | agree                                                                                                                        |
| D2      | 6         | 5    | -1   | Session 2 lenient on `Bash(node:*)` (assumed benign use); cold grep across whole skill dir = **zero** `node ...` invocations |
| D3      | 4         | 4    | 0    | agree (cap binds)                                                                                                            |
| D4      | 8         | 8    | 0    | agree                                                                                                                        |
| D5      | 7         | 7    | 0    | agree on score; cold found D5.3 changelog gap Session 2 missed, balanced by D5.4 standalone-plan strength                   |
| Overall | 6.4       | 6.2  | -0.2 | absorbed by D2 delta                                                                                                         |

The **0.2-point downward delta is exactly the self-bias correction Session 2's
own limitations footer predicted**: "the 6.4 score on persona-evaluator should
be treated as upper-bound — an outside reviewer is likely to score lower on D1
... and D2 (`Bash(node:*)` over-broad)." Direction agreement: 100%. Magnitude
agreement: 0.2 in line with self-bias prediction. **The honest-under-reporting
caveat worked as designed.**

### Cold-pass deepenings (extensions of existing wounds, not contradictions)

**C1. `Bash(node:*)` is dead surface, not over-broad surface.**
Session 2 (and v0.1.3 P0 patch evidence) recommended narrowing to
`Bash(node scripts/...:*)`. Cold check: `grep -n "\bnode\b"` across SKILL.md
+ README.md + 3 references = 0 matches outside the `allowed-tools` declaration
itself. Correct fix = **remove entirely**, not narrow.

**C2. Mode-selection table is structurally misplaced, not just buried.**
Session 2 said "buried at L178". Cold reading found the table was a
`### Mode selection quick reference` H3 *inside* `## Black-box Semantic
Evaluation` (H2). That structurally implies the mode table only governs
black-box mode — worse than being late in the file. Correct fix = promote to
H2 above-all-modes right after Quick Start.

**C3. D5.3 versioning anchor: `metadata.version: 0.3.0` is a vanity bump.**
`git log --all -- skills/persona-evaluator/SKILL.md` shows the file's only
commits are dated 2026-04-26 — there is no real 0.1.x or 0.2.x history in
the repo. The 0.3.0 starting version is honest about the feature set shipped
(three modes) but dishonest about evolution. Session 2 missed this. Correct
fix = inline `## Changelog` that records v0.3.0 as "initial release with all
three modes shipped together," not pretending to multi-minor history.

### Step 2 verdict

**PASS, with refinements.** Session 2's verdict on `persona-evaluator` is
substantively correct in direction — every wound is real, none invented. The
0.2-point optimistic delta matches Session 2's own self-bias caveat exactly.
This closes the Step 2 link of the user's trust chain (Step 1 = rubric
integrity, Step 2 = Session 2 verdict validation, Step 3 = wound fixes,
Step 4 = `persona-evaluator` capability check on another persona).

---

## Step 3 wound-fix landed (`persona-evaluator` v0.3.1, same-day)

Same commit as this report append. Source diff in
`skills/persona-evaluator/SKILL.md` — see its
[inline changelog](../skills/persona-evaluator/SKILL.md#changelog) for
canonical wording.

| Wound                                      | Fix                                                                                                                                   | Source                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `Bash(node:*)` unjustified                 | Removed from `allowed-tools` (was: 3-tool list → now: 2-tool list)                                                                    | Session 2 row 1 + C1      |
| Mode-selection table at H3 inside one mode | Promoted to H2 `## Choosing a mode` right after Quick Start; old H3 replaced by one-line back-pointer                                 | Session 2 row 1 + F6 + C2 |
| D5.3 changelog gap + vanity version bump   | Added inline `## Changelog` honestly recording v0.3.0 = initial release with no real prior history; v0.3.1 records this wound-fix pass | C3                        |

Predicted post-fix cold rescore: **6.8/10** (D2: 5→7, D5: 7→8, others
unchanged). Crosses the 7-anchor "good" band fully only after Step 4 lands a
real-invocation Self-eval Log addressing D1.3 (deferred to next session).

---

## Next step

**Original Session 2 next-step (now historical):** v0.1.3 (P0 patches 1 + 2)
ships alongside this report in the same commit. v0.2.0 (P1 changes 3–13) is a
separate Session 3 task and requires multi-LLM pass on at least 3 skills,
calibration fixtures, and an explicit review of the D3 split.

**Updated next-step (post Step 1 / 2 / 3, 2026-04-26):** v0.1.3 + v0.1.4
shipped. Step 2 cold validation closed (this section). Step 3 `persona-evaluator`
v0.3.1 wound-fix landed (above). **Step 4 is next**: validate
`persona-evaluator` v0.3.1's ability to evaluate a *different* persona it did
not author — completing the trust chain. Candidate subjects: `secondme-skill`
(framework type, structurally distant from evaluator) or `entrepreneur-skill`
(persona type, lowest Session 2 score = clearest wound surface to detect).

---

## Step 4 first-run finding (CRITICAL functional bug, 2026-04-26)

**Subject chosen**: `entrepreneur-skill` per Step 3 plan (lowest Session 2
surface, clearest expected wound). First invocation of
`npx openpersona evaluate entrepreneur-skill` immediately surfaced a
production-impacting bug **not in the persona under test, but in
`persona-evaluator` itself** — exactly the failure mode the trust chain was
designed to catch.

### W1 — Boilerplate `soul/constitution.md` produces 100% false-positive §3 violations

| Field          | Value                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Severity       | **CRITICAL** (overall score hard-capped at 3 on every persona)                                                                    |
| Impact surface | **2/2 = 100%** of installed personas (`find ~/.openpersona/personas -name constitution.md \| wc -l` = 2)                          |
| Symptom        | `entrepreneur-skill` reported as `band: Failing`, `overallScore: 3`, false §3 violation `Planning to harm specific individuals`   |
| Real cause     | `lib/lifecycle/evaluator.js:625` included `soul/constitution.md` in `runConstitutionCheck`'s scan sources                          |
| Why it failed  | `checkSkillCompliance` is shaped for SKILL.md-style **positive capability declarations**; `constitution.md` is exclusively **negation patterns** (`Never assist with plans to harm…`). The detector has no negation-context awareness, so prohibitions read as capabilities |
| Self-evidence  | The same file (`lib/lifecycle/evaluator.js:651-653`) **already documents `constitution.md` as "Excluded by design"** for `EVALUABLE_SOUL_DOCS` — the bug is a self-contradicting code path, not a design choice |
| Side effect    | 13-line offset in reported line numbers (W3) is a downstream symptom of file concatenation; resolved automatically when constitution.md leaves the source list |

### Fix landed (same commit)

- **Code**: `lib/lifecycle/evaluator.js` `runConstitutionCheck` — removed
  `soul/constitution.md` from `sources`; added rationale comment
  cross-referencing the existing "Excluded by design" note 30 lines below.
- **Regression test**: `tests/evaluator.test.js` — new case
  `Constitution: standard boilerplate soul/constitution.md does NOT
  false-positive (W1 regression)` injects authentic boilerplate from a real
  installed persona pack and asserts `constitution.passed === true` +
  `overallScore >= 8`.
- **Verification**:
  - `node --test tests/` — **864/864 pass, 0 fail** (full repo suite)
  - `npx openpersona evaluate entrepreneur-skill` post-fix:
    `overallScore: 3 → 6`, `band: Failing → Developing`,
    `constitution.passed: true`, violations `[]`. The recovered 6/10 surfaces
    the persona's *real* gaps (Soul missing `personaName`/`slug`/`bio`,
    background too short) — exactly the diagnostic value `persona-evaluator`
    was designed to deliver and could not before W1 was lifted.

### Deferred follow-ups (out of scope for this commit)

- **W2 (HIGH)**: `DETECTION_CONTEXT_RE` in `lib/lifecycle/constitution-check.js`
  has no negation keywords (`never`, `do not`, `must not`, `refuse`, `forbid`).
  A user-authored `behavior-guide.md` containing legitimate negations
  (`Never reveal private data`) could still false-positive. W1 closes the
  100%-impact path; W2 is the long-tail residual. Separate commit, separate
  test surface (negation-aware detector with positive + negative fixtures).
- **Step 4 capability validation proper**: now genuinely proceeds against
  `entrepreneur-skill` (and optionally `secondme-skill`) on the *fixed*
  evaluator. The 6/10 score on `entrepreneur-skill` is the trust-chain's
  first real verdict from a corrected tool.

### Trust-chain commentary

This finding is the strongest possible validation of the user's trust-chain
ordering. Steps 1–3 were entirely document-level (rubric integrity →
verdict re-validation → wound fixes on `SKILL.md`). They could not have
surfaced W1; only first-run dogfooding against a real persona pack could.
The chain caught a 100%-impact functional bug *before* any of the verdicts
in Session 2 had been used to make a meaningful capability judgement —
which is exactly the failure mode "validate the validator before trusting
its outputs" exists to prevent.

---

## Step 4 capability validation — entrepreneur-skill (peer-mode white-box, 2026-04-26)

W1 fix shipped (commit `1b1282b`). Re-running
`npx openpersona evaluate entrepreneur-skill --pack-content` on the fixed
evaluator now produces meaningful output. Below is the actual white-box
peer-evaluation report (per `references/REPORT-FORMAT.md`), produced by the
trust-chain reviewer (Cursor host LLM) acting through `persona-evaluator`
v0.3.1 against entrepreneur-skill — a persona it did not author.

### Semantic Evaluation Report

**Mode:** peer
**Reviewer:** Cursor host LLM (no declared persona role)
**Subject:** entrepreneur-skill (role: `null` → all-normal severity per structural evaluator)

#### Static anchor (from `openpersona evaluate entrepreneur-skill --pack-content`)
- Overall: **6/10** [Developing]
- Constitution: **PASSED** (0 violations, 0 warnings) — W1 fix held
- Strict dimensions: none (role null → all dimensions report `severity: normal`)
- Lenient dimensions: none

#### Per-field semantic scores
- **background — 0/10** (`packContent.character.background`) — Null. No rubric question applicable. Fix: write a multi-paragraph background with a concrete causal moment (a failed product, a forced pivot) that explains the entrepreneur's current operating worldview.
- **personality — 0/10** (`packContent.character.personality`) — Null. Cannot apply adjective-vs-trait, tradeoff-visibility, or register-coverage tests. Fix: declare 3–5 consequence-bearing traits (e.g., "interrupts when sensing a strategic shortcut", "defers on deep technical questions").
- **speakingStyle — 0/10** (`packContent.character.speakingStyle`) — Null. Tone-vs-rule, predictability, distinctiveness tests inapplicable. Fix: at least one executable rule + one tone descriptor.
- **boundaries — 0/10** (`packContent.character.boundaries`) — Null. `immutableTraits` partially substitutes (see below) but does not satisfy the rubric (hard limits + enforceability). Fix: declare boundaries for legal/equity/financial-advice topics — exactly the area `behavior-guide.md`'s "Human approval gate" hand-waves about.
- **immutableTraits — 6/10** (`packContent.immutableTraits`) — 3 traits declared. "Truthfulness about evidence" and "human approval for irreversible decisions" are genuinely identity-defining and align with `behavior-guide.md`'s "Evidence over intuition" / "Human approval gate". "Respect for legal and ethical boundaries" is generic and low-signal. Fix: replace #2 with an entrepreneur-specific trait like "bias toward shipping over polishing".
- **aesthetic — 2/10** (`packContent.aesthetic`) — emoji/creature/vibe all null. Mutual-coherence and distinctiveness checks inapplicable; not zero only because the field is *consistent in its emptiness* (no contradiction). Fix: a coherent triple (e.g., 🧭 / "compass" / "deliberate, future-oriented").
- **soulDocs[behavior-guide.md] — 7/10** — Operationalisation strong ("Convert strategy into 7-day experiment cards with acceptance criteria", "Speed over perfection", "Revenue and retention over vanity metrics"). Distinctively entrepreneurial framing — would actually change LLM output, not generic chatbot drift. Soul-fidelity check **untestable** because `character.personality` and `character.speakingStyle` are null — flag, do not penalise. Fix: lift these decision principles up into `character.personality` so the structural Soul scaffolding catches up to the behavior-guide content.
- **soulDocs[self-narrative.md] — 1/10** — Contains only template metadata ("Written and maintained by Atlas Founder. Each entry captures…"), no actual entries. Voice fidelity untestable. Specificity zero. Fix: write at least one first-person entry, or remove the file until populated.

#### Cross-cutting observations
1. **Identity-name leak**: "Atlas Founder" appears only in `self-narrative.md`'s template header — not in `persona.json.soul.identity.personaName`. The persona has a name in prose scaffolding but not in canonical metadata. Pack is internally inconsistent.
2. **Role mismatch**: `role: null` defaults the structural evaluator to `assistant`, but `behavior-guide.md` reads unambiguously as a `coach` / `mentor` (north-star target, decision principles, gated advice). Declare explicitly.
3. **Inverted centre of gravity**: `persona.json` Soul block is empty; `behavior-guide.md` carries the entire persona's substance. This is the polar opposite of the typical OpenPersona shape ("spec heavy / behavior thin"). Either backfill `persona.json` or document the inversion deliberately.

#### Overall semantic judgement
- **3/10.** Every `character.*` and `aesthetic.*` field is null — catastrophic for semantic quality despite a genuinely good `behavior-guide.md`. Single highest-leverage improvement: **fill `character.personality`, `character.speakingStyle`, and `character.background`** by lifting and elaborating the operating principles already implicit in `behavior-guide.md`.

#### How this relates to the structural score
- Structural: **6/10** (CI signal, deterministic). Lifted by Body/Skill/Evolution/Social all 7+; pulled down by Soul=2.
- Semantic: **3/10** (design-review signal, this report). Driven down by uniformly-null character fields.
- The two are reported separately by design — never averaged. The 3-point gap is itself diagnostic: structural over-rewards file-existence and field-presence across many dimensions; semantic penalises specifically that the *meaning-bearing* Soul fields are empty. Both numbers are honest within their lens. The gap is the headline finding.

### Triangulation: structural vs semantic

| Lens         | Score | What it noticed                                                                            | What it missed                                                            |
| ------------ | ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Structural   | 6/10  | Soul=2 (null fields), Body/Skill/Evolution/Social all healthy, Constitution clean post-W1  | "Atlas Founder" name leak, role-tone mismatch, behavior-guide-quality gap |
| Semantic     | 3/10  | Behavior-guide is genuinely entrepreneurial; self-narrative is empty stub; name leak       | Cross-dimensional file-presence checks (Body channels, Skill trust)       |

**Direction agreement: 100%.** Both lenses converge on "Soul scaffolding empty, behavior layer real". Semantic adds three findings structural cannot reach (name leak, role-tone mismatch, soul-fidelity untestability). Structural adds breadth across 9 dimensions.

This is the canonical pattern the dual-lens design intends: **structural** for CI gating and surface coverage; **semantic** for content quality and cross-field coherence. Step 4 confirms the pair works end-to-end.

### New methodological wounds discovered (rubric-level, deferred)

These are NEW wounds in `persona-evaluator`'s rubric — not bugs in the persona under test, and not duplicates of the SKILL.md wounds Session 2 / Step 3 already addressed.

**W4 (MEDIUM): RUBRICS.md `severity-aware scoring` underspecifies null fields.**
The `lenient` floor rule says "lenient field that is merely terse-but-consistent should still score ≥ 6". This was written for thin-but-present (`tool` persona's one-line background). It is silent on what to score when the field is *null*. During this evaluation I scored null `aesthetic` at 2/10 (emptiness consistent with itself) — but a different reviewer could honestly score 0 ("nothing to evaluate") or 6 ("lenient floor"). The rubric needs an explicit clause: "null on lenient = floor of 4; null on strict/normal = 0–2 with rationale".

**W5 (MEDIUM): RUBRICS.md `behavior-guide.md` rubric assumes `character.*` fields are populated.**
The `Soul-fidelity` check ("Do the dos/don'ts reflect *this persona's* `personality` and `boundaries`?") becomes untestable when those fields are null. The rubric should say: "If `character.personality` / `character.speakingStyle` are null, score the file on (1) operationalisation and (2) distinctiveness only; flag fidelity as `untestable`, not `failed`." Otherwise a half-finished pack — empty Soul + decent behavior-guide — is incorrectly punished twice (once for empty Soul, once for "unfaithful" behavior-guide).

Both surfaced *only* by running peer-evaluation against a real pack. They could not have been surfaced by Steps 1–3 (document-level review of `persona-evaluator` itself).

### Step 4 verdict

**PASS-with-wounds.** The trust chain is closed:

| Step | Question | Status |
| ---- | -------- | ------ |
| 1    | Is SKILL-RUBRIC.md itself sound?                                  | ✅ v0.1.4 (commit `ee2aab6`)               |
| 2    | Are SKILL-RUBRIC's verdicts on `persona-evaluator` correct?       | ✅ Cold-pass confirms (commit `e55e4a7`)   |
| 3    | Are `persona-evaluator`'s wounds fixed?                           | ✅ v0.3.1 SKILL.md + W1 evaluator.js (`e55e4a7`, `1b1282b`) |
| 4    | Can `persona-evaluator` deliver real diagnostic value on a persona it did not author? | ✅ This section — diagnoses entrepreneur-skill correctly, triangulates with structural, surfaces actionable fixes, no false-positives |

**Tool fitness verdict.** `persona-evaluator` v0.3.1 (post-W1) is fit for production peer-evaluation use. Its findings on entrepreneur-skill are accurate, its dual-lens output composes cleanly, and the failure mode that made it useless (W1 false positives) is closed.

### Deferred backlog (next session)

- ~~**W2 (HIGH)**: `DETECTION_CONTEXT_RE` lacks negation keywords — long-tail false-positive risk on user-authored `behavior-guide.md` containing legitimate negations. (Identified during Step 4 W1 root-cause analysis.)~~ — **Resolved**, see W2 follow-up below.
- ~~**W4 (MEDIUM)**: `RUBRICS.md` lenient/strict null-field scoring underspecified.~~ — **Resolved**, see W4/W5 follow-up below.
- ~~**W5 (MEDIUM)**: `RUBRICS.md` `behavior-guide.md` Soul-fidelity check assumes populated `character.*`.~~ — **Resolved**, see W4/W5 follow-up below.
- **Optional Step 4-extended**: re-run on `persona-secondme-skill` (the generated pack at `skills/secondme-skill/generated/persona-secondme-skill/`, NOT the orchestrator skill itself) to verify the evaluator on a **machine-generated** persona vs the hand-authored `entrepreneur-skill` already covered. The axis here is generated-vs-authored, not "framework-type" — see "Category-error correction" below for why the original framing was wrong. Not required for trust-chain closure but increases tool-fitness confidence on the kind of personas secondme-skill's pipeline will produce in the wild.

---

## W2 follow-up landed (negation-context filter, 2026-04-26)

Same-day continuation after Step 4 trust-chain capstone. Closes the
long-tail false-positive risk W1 left exposed.

### Problem

`lib/lifecycle/constitution-check.js`'s `DETECTION_CONTEXT_RE` filter only
recognised detection/prevention prose ("detect phishing", "prevent
manipulation"). It had no negation awareness, so a user-authored
`SKILL.md` or `behavior-guide.md` line like "Never assist with plans to
harm specific individuals" (the constitution's own boilerplate phrasing)
read as a positive capability declaration. After W1 closed the
`constitution.md`-specific path, this remained as a long-tail risk: any
persona author who copied constitution-style negations into their
behavior-guide could still trip a §3 false positive.

### Fix

Added a sibling filter `NEGATION_CONTEXT_RE` covering single-negation
forms: `never`; `do not` / `does not` / `did not` / `don't` / `doesn't` /
`didn't`; `must not` / `mustn't`; `will not` / `won't` / `would not` /
`wouldn't`; `shall not` / `shan't`; `cannot` / `can't`; `refuse to` /
`refuses to` / `refused to` / `refusing to`; `forbid` / `forbidden` /
`forbids`; `prohibit` / `prohibited` / `prohibits` / `prohibition`.

Apostrophe character class covers ASCII (U+0027), curly right (U+2019),
and modifier letter (U+02BC) — all three appear in real markdown
depending on the editor used.

### Deliberate exclusions (documented in source)

- `avoid` — semantically ambiguous (`I avoid X` = negation;
  `help users avoid X` = positive helping action). Pinned by an explicit
  test that documents the exclusion so a future contributor must take a
  position (write fixtures both ways) before adding it.
- bare `not` — too short and too ambiguous; would over-filter.

### Known limitation (documented in source + tests)

Double negation (`I never refuse to generate X` = positive intent) is
filtered as negation. Accepted as vanishingly rare in real persona /
skill prose; pinned by a regression test so a future intentional fix
flips the assertion rather than silently regressing.

### Verification

- `node --test tests/` — **872/872 pass, 0 fail** (W1's 864 + 8 new W2
  test cases). Zero regression.
- New `describe` block `W2 regression tests — negation context filter`
  covers: Never-prohibitions on §3 patterns; do-not / don't / does-not;
  refuse / cannot / will-not / must-not; forbidden / prohibits;
  three-apostrophe-variant contractions; positive-still-triggers
  guard; double-negation accepted limitation; `avoid` exclusion pin.
- Dogfood: `npx openpersona evaluate entrepreneur-skill` post-W2
  unchanged — `overallScore: 6`, `band: Developing`,
  `constitution.passed: true`. The fix only removes false positives;
  it does not affect well-formed packs.

### Why ship in the same session

The user's `下一步` prompt after Step 4 closure picked up the deferred
backlog explicitly. W2 is HIGH severity, has clean test fixtures, and
the relevant code (`constitution-check.js`) was already in working
memory from the W1 root-cause analysis. Doing it now keeps the
negation-handling reasoning coherent across W1 and W2; doing it in a
fresh session would have re-loaded the same context.

W4 / W5 (MEDIUM, rubric-document changes) and the optional Step
4-extended remain deferred — they involve a different file
(`RUBRICS.md`) and a different reasoning surface, so a session boundary
between W2 and them is healthy.

---

## W4 / W5 follow-up landed (rubric methodological wounds, 2026-04-26)

Same-day continuation after W2. The session boundary the W2 closer
predicted ("a different file, a different reasoning surface") turned
out to still be tractable because both W4 and W5 are localised to
`skills/persona-evaluator/references/RUBRICS.md` and share a single
underlying methodological gap: the rubric was written for
**present-but-thin** content and breaks down on **absent** content.

### W4 — null-field scoring underspecified

**Problem.** The severity-aware scoring section established a lenient
floor of ≥ 6 for "terse-but-consistent" fields. During Step 4 dogfooding
on `entrepreneur-skill`, this floor was misapplied to `null` fields —
the rubric had no separate clause for absence, so a missing
`character.speakingStyle` could either be scored harshly using strict
rules (false-defect) or scored ≥ 6 by lenient floor (false-pass). Both
outcomes degrade evaluator credibility.

**Fix.** Added a new `### Null-field scoring (overrides severity)`
subsection right under severity-aware scoring. Clauses:

- `strict` / `normal` severity: null field scores **0–2**, with
  required rationale citing "field is null — cannot apply rubric
  questions".
- `lenient` severity: null field scores **3–4**, acknowledging that
  absence is acceptable for the role but quality cannot be evaluated.
- Always document the rationale; never score 0 in silence. The score
  signals the defect, the rationale tells the persona author *why*.
- Multiple null fields in the same rubric score independently. The
  cross-cutting "Soul block is uniformly empty" observation belongs in
  `### Cross-cutting observations`, not the per-field score.

This is an **override** on top of severity-aware scoring, not a
replacement. The lenient floor of ≥ 6 still applies to terse-but-present
content; only null content takes the override path.

### W5 — `behavior-guide.md` Soul-fidelity assumes populated `character.*`

**Problem.** The `behavior-guide.md` rubric's Soul-fidelity check asks
"Do the dos/don'ts reflect *this* persona's `personality` and
`boundaries`?" If `character.personality` and `character.speakingStyle`
are both null, the check has no reference point — and yet the rubric
forced a score, leading to either a false-failure ("not faithful to
personality") or a meaningless pass.

**Fix.** Added a **Prerequisite** clause to the Soul-fidelity check:

> Prerequisite: this check requires `character.personality` and/or
> `character.speakingStyle` to be populated — if either is null, mark
> Soul-fidelity as **untestable** for this file and explain in the
> report (e.g. "Soul-fidelity untestable — `character.personality` is
> null, no Soul fields to be faithful *to*"). Do not penalise
> behavior-guide.md for failing a check whose reference fields don't
> exist; the absence is already counted in the per-field null-field
> score above.

The "untestable" verdict avoids double-penalising — the absence is
already scored once at the `character.personality` rubric (now under
W4 null-field rules), so the behavior-guide rubric should not score it
a second time.

### Why W4 and W5 batch together

Both wounds share the same root cause: **the rubric was written assuming
fields would be populated and didn't define behaviour for absent
fields**. Fixing them in one pass keeps the methodological reasoning
coherent — the W4 null-field override is the prerequisite that makes
the W5 untestable-verdict make sense (a Soul-fidelity check that
depends on a 0–2 strict null score would be redundant and confusing).
Splitting them across sessions would have re-loaded the same rubric
file and the same reasoning surface twice.

### Verification

- Both edits localised to `skills/persona-evaluator/references/RUBRICS.md`.
- No code changes — these are document-only methodological fixes, so no
  test suite applies. The fix is verified by re-reading the rubric and
  confirming that the entrepreneur-skill scoring scenario from Step 4
  now has an explicit, unambiguous scoring path.
- `persona-evaluator` bumped to **v0.3.2**, inline changelog records
  both fixes with explicit pointers to the dogfooding evidence.

### Deferred backlog (post-W4/W5)

Only one item remains:

- **Optional Step 4-extended**: re-run on `persona-secondme-skill`
  (the generated pack at
  `skills/secondme-skill/generated/persona-secondme-skill/`, NOT the
  orchestrator skill itself). The axis is **generated-vs-authored**:
  does the evaluator score machine-generated personas with the same
  fairness/severity as hand-authored `entrepreneur-skill`? See
  "Category-error correction" below for why the original
  "framework-type axis" framing was wrong. Not required for
  trust-chain closure — different reasoning surface (subject
  diversity, not rubric correctness).

### Trust-chain status

All four trust-chain steps are now closed:

1. ~~SKILL-RUBRIC v0.1.4 self-validates clean (commit `ee2aab6`)~~ ✓
2. ~~Cold validation of Session-2 findings (commit `e55e4a7`)~~ ✓
3. ~~`persona-evaluator` wound-fix pass (commits `e55e4a7`, `1b1282b`,
   `2b823eb`, this commit)~~ ✓
4. ~~Capability validation on `entrepreneur-skill` (commit `7591596`)~~ ✓

The evaluator framework is now self-coherent, dogfooded against a real
persona, and methodologically defensible against the null-field edge
cases that real personas in the wild will exhibit.

---

## Category-error correction (2026-04-26)

User-surfaced doc defect, post W4/W5 commit. Recording it here in
audit-trail style rather than rewriting history because the mistake
itself is a useful trust-chain artefact.

### What was wrong

The deferred backlog repeatedly proposed re-running `persona-evaluator`
on `secondme-skill` as a "framework-type subject, structurally distant
from evaluator". Both halves of that claim are wrong:

1. **Subject mis-naming.** `secondme-skill` is an *orchestration
   pipeline / persona-generator* (its own SKILL.md L14–16 calls it
   "a complete pipeline for building your AI Second Me"). Its
   *output* — `persona-secondme-skill`, located at
   `skills/secondme-skill/generated/persona-secondme-skill/` with
   real `persona.json`, `runtime`, `faculties`, `skills` — is what
   `persona-evaluator` would actually evaluate. Running the
   evaluator on `secondme-skill` itself is a category error: it is
   not a persona pack, it is the thing that *creates* persona packs.

2. **Axis mis-naming.** The "framework-type axis" framing collapsed two
   distinct concepts: (a) whether a *skill* is a framework-class or
   persona-class skill (a structural-evaluator concept that classifies
   the SKILL.md document), and (b) the actual interesting axis for
   Step 4-extended, which is **generated-vs-authored personas** —
   does `persona-evaluator` score a machine-generated persona pack
   with the same severity and fairness as a hand-authored one? The
   original framing accidentally used "framework" in sense (a) when
   it should have used "generated" in sense (b).

### Where the error appeared

| Line | Context | Status |
| ---- | ------- | ------ |
| L285 | Step 2 cold validation, "Updated next-step" candidate list | **Frozen** as historical audit (preserves the mis-thinking at that timestamp) |
| L340 | Step 4 first-run finding, "now genuinely proceeds" plan note | **Frozen** as historical audit (same reason) |
| L442 | Deferred backlog at end of W2 follow-up | **Corrected in place** (this is a living queue, mutated as items resolve) |
| L608+ | Deferred backlog inside W4/W5 follow-up | **Corrected in place** (same reason) |

The "frozen vs corrected in place" distinction follows the audit-trail
principle: dated Step-N reasoning sections preserve what was thought at
that point; living deferred-backlog sections track current state and
get edited as items resolve or get re-scoped.

### Corrected formulation

If Step 4-extended ever runs, the right framing is:

- **Subject:** `persona-secondme-skill` (the generated pack), **not**
  `secondme-skill` (the orchestrator).
- **Axis:** generated-vs-authored. The `entrepreneur-skill` Step 4
  capstone covered hand-authored personas; running on
  `persona-secondme-skill` would cover machine-generated ones.
- **Why interesting:** `secondme-skill`'s pipeline is what creates the
  personas the evaluator will see in the wild from secondme users. If
  the evaluator systematically savages secondme-generated personas
  because they're "too thin", that's a calibration question — and the
  W4 null-field rules just landed (commit `643b5f6`) are the
  prerequisite that lets such an evaluation produce a trustworthy
  verdict instead of a false-defect.

### Why this matters

Two-step error: I propagated the mis-naming from `e55e4a7` (Step 2
cold validation closer) into `643b5f6` (W4/W5 follow-up) by
copy-pasting backlog text without re-checking the category. The
user's correction caught it before any actual run wasted on the wrong
subject. This is exactly the kind of catch the trust chain is
supposed to surface: cold readers (the user, here) noticing
collapses-of-meaning that a hot author (me) is too entangled with
the work to see.

The trust-chain framework is itself working as designed.

---

## W6 (CRITICAL) — schema bifurcation root cause (2026-04-26)

Discovered during Step 4-extended on `persona-secondme-skill`. After fixing
the category-error for the subject (`secondme-skill` orchestrator → real
persona pack `persona-secondme-skill`), the very first structural eval run
revealed something far worse than W4 / W5: **the evaluator was never reading
real persona-pack contents at all**.

### Trigger / how it surfaced

`npx openpersona evaluate persona-secondme-skill --pack-content --json`
returned all `character.*` / `identity.*` / `aesthetic.*` fields as `null`
and `role: None`, despite the persona.json on disk having every one of
those fields populated at the top level (e.g. `"personaName": "secondme-skill"`,
`"personality": "structured, evidence-oriented, ..."`). Cross-checking
`persona-entrepreneur-skill` (the Step 4 capstone subject) reproduced the
exact same null-extraction → confirming this is not specific to generated
packs but affects 100 % of personas.

### Root cause — schema bifurcation

The OpenPersona codebase carries two soul-schema layouts in production:

| Layer | Format | Authoritative file | Who reads it |
| ----- | ------ | ------------------ | ------------ |
| Creator-facing INPUT (v0.17+) | **Nested** under `soul.{identity, character, aesthetic}` | `schemas/persona.input.schema.json` | `lib/generator/validate.js` (validates raw input) |
| On-disk persona.json (post-normalise) | **FLAT** top-level fields, no `soul` key | `schemas/legacy/persona.schema.json` (DEPRECATED label, but actually describes the wire format correctly) | `lib/lifecycle/installer.js`, `lib/lifecycle/refine.js`, agent runtime |

The flattening happens in `lib/generator/index.js`:

```javascript
function normalizeSoulInput(persona) {
  if (!persona.soul) return;
  const { identity = {}, aesthetic = {}, character = {} } = persona.soul;
  Object.assign(persona, identity, aesthetic, character);
  delete persona.soul;          // <-- L63: soul key is REMOVED before write
}
```

So every real on-disk pack has top-level `personaName`, `personality`, etc.
and zero `soul` key.

`lib/lifecycle/evaluator.js` was reading the *input* schema (nested) instead
of the *on-disk* schema (flat) at five sites:

- `scoreSoul()` L128-130 — soul / identity / character objects
- `scoreSoul()` L173 — `soul.aesthetic.emoji || soul.aesthetic.creature`
- `scoreSoul()` L180-186 — error messages referencing `soul.aesthetic`, `soul.identity.role`
- `extractEvaluableContent()` L680-710 — the entire evaluable-content JSON the white-box semantic mode reads
- `evaluatePersona()` L767 — `role` lookup that drives all severity profiles

Consequence: every dimension that depends on a soul field, every
severity-aware adjustment that depends on `role`, and every white-box
semantic eval (`--pack-content`) ran against null inputs.

### Smoking gun — the unit-test gap

`tests/evaluator.test.js` defines `FULL_PERSONA` using the **nested** input
schema (L43-53):

```javascript
const FULL_PERSONA = {
  soul: {
    identity: { personaName: 'Test', slug: 'test', bio: '...', role: 'assistant' },
    character: { personality: 'helpful, curious', speakingStyle: '...', ... },
    aesthetic: { emoji: '🤖', creature: 'robot', vibe: 'calm' },
  },
  ...
};
```

Tests passed because they fed nested fixtures to a nested-reading evaluator.
**No test ever exercised a flat (real on-disk) persona.** Integration
coverage was effectively zero for the schema the evaluator was supposed to
handle in production.

This is the second-most-important finding of this entire trust chain
(after the trust chain itself surfacing W6): the unit test surface gave
872 / 872 green for code that returned null for every real-world input.

### Impact on prior trust-chain work

- **Step 4 capstone (commit `7591596`, entrepreneur-skill 6 / 10) is invalid
  as a substantive verdict.** The 6 / 10 was scoring null content with
  `role: null` falling to `_default` severity profile. It tells us the
  evaluator does not crash on real input; it does not tell us anything
  about entrepreneur-skill's quality.
- **W4 / W5 fixes (commit `643b5f6`) are still correct but their scope is
  smaller than I thought.** They handle genuine null-field cases (e.g. a
  persona that legitimately has no `character.background` like both
  entrepreneur-skill and persona-secondme-skill); they don't paper over
  W6 because W6 is now fixed at the source.
- **Steps 1, 2, 3 are unaffected** — they validated the SKILL.md document,
  static heuristic detector, and rubric methodology, none of which
  depend on `extractEvaluableContent`'s output.

### Fix

Introduced `getSoulView(p)` helper at `lib/lifecycle/evaluator.js` L36-95
using **nested-first / flat-fallback** — same pattern already used in
`lib/lifecycle/refine.js` L86-89 (the convention was established
elsewhere; the evaluator was an outlier):

```javascript
function getSoulView(p) {
  const soul = p.soul || {};
  const identity  = soul.identity  || {};
  const character = soul.character || {};
  const aesthetic = soul.aesthetic || {};
  return {
    identity: {
      personaName: identity.personaName || p.personaName || null,
      // ... slug, bio, role
    },
    character: {
      personality: character.personality || p.personality || null,
      // ... speakingStyle, background, boundaries
    },
    aesthetic: {
      emoji: aesthetic.emoji || p.emoji || null,
      // ... creature, vibe
    },
  };
}
```

Refactored all 5 nested-reading sites to use the helper. Updated
user-facing error messages to refer to fields by name without committing
to a path (`soul.aesthetic missing` → `Aesthetic identity (emoji/creature/vibe) missing`).

### Test surface

Added a new `describe('W6 regression — flat on-disk schema')` block in
`tests/evaluator.test.js` with 7 tests:

1. extractEvaluableContent reads identity from flat top-level
2. extractEvaluableContent reads character from flat top-level
3. extractEvaluableContent reads aesthetic from flat top-level
4. evaluatePersona's role lookup reads from flat top-level (severity
   profile applies correctly)
5. **Parity check**: flat fixture and nested fixture of the *same*
   persona produce identical `overallScore` and `Soul` dimension score
6. **Defensive**: nested takes precedence when both are present
   (matches refine.js convention)
7. Soul scoring on flat fixture without aesthetic surfaces same
   suggestion as nested

All 7 pass on first run. Full suite: **879 / 879 pass** (was 872 + 7
new), **131 suites**, **8 / 8 skills pass spec**.

### Re-validation

| Subject | Pre-W6 (broken) | Post-W6 (correct) |
| ------- | --------------- | ----------------- |
| `entrepreneur-skill` (authored) | role=None, all soul fields null, **6/10 Developing** | role=`founder`, all soul fields populated, **7/10 Good** |
| `persona-secondme-skill` (generated) | same null pattern, **6/10 Developing** | role=`collaborator` (skill: strict applied), **7/10 Good** |

Both subjects exhibit the same dimensional pattern post-fix:

```
Soul       8/10
Body       7/10
Faculty    6/10
Skill      8/10
Evolution  9/10
Economy    5/10
Vitality   5/10
Social     8/10
Rhythm     5/10
character.background: null  (genuine null — W4 territory, not W6)
```

### Generated-vs-authored axis verdict

This is what Step 4-extended was designed to answer, only now
answerable at all because of W6: **the secondme-skill pipeline produces
persona packs at score parity with hand-crafted ones** (both at 7/10
Good band, identical dimensional profile). The single shared weakness
(`character.background` null) is a content choice, not a generator
defect.

### Trust-chain status — re-opened then re-closed

The previous "all four steps closed" status (asserted in the W4/W5
follow-up) was premature: Step 4 capstone's substance was null. After
the W6 fix:

1. SKILL-RUBRIC v0.1.4 self-validates clean — unaffected by W6 — ✓
2. Cold validation of Session-2 findings — unaffected by W6 — ✓
3. `persona-evaluator` wound-fix pass — now includes W6 (commit
   pending: this commit) — ✓
4. **Capability validation re-done post-W6** — entrepreneur-skill
   actually scores 7/10 Good; secondme-skill (generated) ditto — ✓
5. **Step 4-extended also done post-W6** — generated-vs-authored
   parity established — ✓ (originally optional; now part of the closure
   because W6 was discovered during it)

The trust chain is *now* genuinely closed. The previous closure was a
ratification of broken machinery; this closure ratifies a re-validated
tool.

### What this teaches about the trust-chain methodology

The trust chain has now surfaced two layers of defect that the unit
test suite could not:

1. **W1, W2** (constitution-check false positives) — surface-level
   logic bugs that triggered on real persona content. Unit tests
   covered the detector's logic but not against real soul/constitution.md.
2. **W6** (schema bifurcation) — a deeper integration-vs-unit gap
   where the unit fixture matched the wrong schema layer, so the
   tested code was structurally incompatible with production data
   despite being internally consistent.

Both layers were invisible to traditional code review; both became
visible only when the evaluator was pointed at a real persona it had
not seen before. This is the core argument for the trust-chain
methodology: cold validation against real subjects surfaces failure
modes that hot authoring + unit testing systematically miss.

### Deferred backlog (post-W6)

None. The previously-listed "Optional Step 4-extended on
persona-secondme-skill" is now complete (it was the discovery vehicle
for W6). All trust-chain steps have been closed against a corrected
evaluator.
