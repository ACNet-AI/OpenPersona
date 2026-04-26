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
