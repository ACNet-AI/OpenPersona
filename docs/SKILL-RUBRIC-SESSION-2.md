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

## Next step

`v0.1.3` (P0 patches 1 + 2) ships alongside this report in the same commit.
`v0.2.0` (P1 changes 3–13) is a separate Session 3 task and requires:
multi-LLM pass on at least 3 skills, calibration fixtures, and an explicit
review of the D3 split.
