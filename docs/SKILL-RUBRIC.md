# SKILL-RUBRIC

> **A draft rubric for evaluating Agent Skill design quality.**
> v0.1.5 — markdown-only spec, deliberately not yet a skill.

---

## Status

- **v0.1.5 (draft)** — accuracy patch: rewrote
[Relationship to Other Rubrics](#relationship-to-other-rubrics) to
correctly position this rubric against `skill-creator` (Anthropic) and
`darwin-skill` (alchaincyf, 1.7K★) as **lifecycle-segment peers, not
substitutes**; corrected the prior "text quality of SKILL.md"
mischaracterisation of `darwin-skill`'s 8-dim ratchet. See
[Provenance](#provenance) for the recent changelog and
[SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md) for the full
version history. v0.1.4's trust-chain repairs and v0.1.3's two P0
patches from the Session 2 multi-skill pass
([SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md)) remain in
effect.
- **Not yet a skill.** This file is a markdown standard intended for community
review. It will graduate to a skill (`skill-evaluator`) only after Session 3
(multi-LLM pass on ≥ 3 skills, measuring inter-rater variance) demonstrates
acceptable reproducibility.
- **Single-author, single-LLM origin.** See [Open Issues](#open-issues--known-limitations).

---

## Scope

This rubric evaluates **skill design quality** — the structural, architectural,
and lifecycle qualities of an Agent Skill as a software artifact.

It is deliberately distinct from two adjacent rubrics:


| Rubric                          | What it scores                                                                       | Layer   |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| `darwin-skill` (external)       | SKILL.md text quality (clarity, progressive disclosure, token efficiency)            | text    |
| `SKILL-RUBRIC` (this file)      | Skill design quality (problem-fit, architecture, reliability, output-fit, lifecycle) | design  |
| `persona-evaluator` (this repo) | Persona pack quality (4 Layers × 5 Systemic Concepts × Constitution)                 | persona |


A skill can be lint-clean (`darwin-skill` happy), spec-compliant
(agentskills.io validator green), and still be a poorly designed skill — that
is the gap this rubric targets.

---

## Pre-condition: Spec Compliance Gate (binary + N/A)

Before any dimension scores, the skill must pass the agentskills.io 1.0 spec
validator (this repo: `node scripts/validate-skills.mjs <skill-dir>`).
Compliance is a gate, **not a dimension**:

- **PASS** → proceed to dimension scoring.
- **FAIL** → overall score = 0; fix the spec violations first. Do not score
design dimensions on top of a non-conforming skill.
- **N/A** → subject is not an Agent Skill (e.g. a markdown specification, a
rubric document, a design checklist, anything outside `skills/<slug>/`).
Set type = `spec`, note the N/A in the report header, and proceed to
dimension scoring. Do **not** zero the overall just because there is no
SKILL.md to validate.

Non-blocking warnings (e.g. body length above the spec's recommended 500-line
ceiling) do not fail the gate but should be noted in the report.

> **Note on gate severity.** PASS/FAIL on real skills is stricter than
> `persona-evaluator`'s Constitution gate, which caps at 3 rather than zeroing.
> The asymmetry is intentional: a Constitution violation is a *content*
> problem with usable signal in the other dimensions; a spec violation breaks
> tool-level loading and changes how a host LLM sees the skill, so any
> design-quality signal measured under it is unreliable. The N/A branch
> (introduced in v0.1.2) handles non-skill subjects so the gate doesn't
> false-FAIL them.

---

## Reviewing Procedure

A practical step-by-step. A reviewer who follows these steps in order should
produce a report in roughly 30–60 minutes per skill.

1. **Classify type.** Read SKILL.md `description` and `metadata.tags`. Pick
  one of `tool` / `persona` / `framework` / `meta` / `spec`. If unsure
   between the first four, default to `tool` (the most common case in this
   repo). If the subject is not an Agent Skill at all (no `SKILL.md`, lives
   outside `skills/`), pick `spec` and expect the gate to be N/A. See
   [Type-aware weighting](#type-aware-weighting).
2. **Run the gate.** For real skills:
  `node scripts/validate-skills.mjs <skill-dir>`. If FAIL → stop, report
   violations, do not score dimensions. For `spec`-type subjects → declare
   gate **N/A** in the report header with a one-line reason ("subject is
   markdown spec at `<path>`, not a skill"), then continue.
3. **Read fully.** SKILL.md, README.md, every file under `references/`.
  For `spec` subjects: read the entire markdown file plus any referenced
   sub-files. Note line numbers as you read; you will cite them.
4. **Score each dimension 0–10** using the anchor checks. Cite verbatim
  (file + line range) for every score. No citation → no score.
5. **Apply type weights.** Lenient dimensions floor at 6 *if* the skill is
  internally coherent on that dimension; strict dimensions get full anchor
   strength.
6. **Compute overall.** Type-weighted average. State which weighting profile
  you used.
7. **Synthesise cross-cutting observations** (1–3 bullets) — contradictions,
  type-mismatch, patterns spanning dimensions.
8. **Emit the report** in [Output Format](#output-format), including the
  reviewer-LLM declaration in the header (mandatory) and the
   rubric-limitations footer.

---

## The Five Dimensions

Each dimension scores 0–10. The overall score is a type-weighted average — see
[Type-aware weighting](#type-aware-weighting).

Anchors apply to every dimension:

- **0–3** — broken or missing the point of the dimension.
- **4–6** — adequate. The skill ships, but is unmemorable along this axis.
- **7–8** — good. Specific, well-considered, predictive of skill behaviour.
- **9–10** — excellent. Distinctive enough to be referenced as a model for
other skills.

### D1. Problem-fit

**Question:** Does the skill solve a real problem for an identifiable user?

Anchor checks:

1. **Concrete user.** Can you name an archetype (developer running CI / persona
  author polishing a pack / agent peer-reviewing another agent)? Or is the
   user imaginary ("anyone who wants to evaluate things")?
2. **Counterfactual.** What does that user do today, without this skill? If
  the answer is "the same thing slightly slower", the skill probably
   under-justifies itself. *Reviewer note: if you have no user-research data,
   score on the SKILL.md's stated counterfactual rather than guessing.*
3. **Evidence of use.** Is there at least one real invocation outside test
  suites? A user issue, a downstream PR, a cited usage in another skill,
   a self-eval log entry?
4. **Trigger phrases concrete.** Does the SKILL.md `description` field name
  the triggers crisply enough that a host LLM will actually load this skill
   at the right time, vs being shadowed by a more confidently-described
   neighbour? *(For `spec` subjects this anchor is N/A — score D1 on 1–3
   only.)*

### D2. Architecture

**Question:** Is the skill's internal shape clean, with crisp boundaries
between its capabilities?

Anchor checks:

1. **One thing well.** Does the skill have a single primary function, or does
  it do 3–4 loosely related things? "Loosely related" is a smell.
2. **Mode discoverability.** If the skill has multiple modes, can a user pick
  the right mode in ≤ 30 seconds from reading SKILL.md? (Concrete test: a
   "mode selection" table near the top.)
3. **Reference structure.** SKILL.md body should stay under the spec-recommended
  500-line ceiling. Above ~250 lines, start considering moving detail into
   `references/*.md` with the main file as navigation; above 500, the spec
   validator emits a warning and a split is overdue. The same anchor applies
   to `spec` subjects.
4. **Tool surface minimality.** Does `allowed-tools` declare the smallest set
  that actually works? Over-broad declarations (`Read Write Bash`) when
   `Bash(npx mything:*) Read` would suffice are a defect. *(N/A for `spec`.)*

### D3. Reliability

**Question:** Does the skill produce stable, defensible behaviour under
realistic and adversarial conditions?

Anchor checks:

1. **Cross-LLM stability — calibration ladder. *This is a hard cap on D3
  overall.*** D3.2 / D3.3 / D3.4 cannot lift D3 above the D3.1 ceiling; they
   can only confirm or reduce it.
  - **0–4** — single LLM, single pass, no reproducibility evidence.
  - **5–6** — single LLM, ≥ 3 passes, intra-LLM σ < 1.0 on the dimensions
  you care about.
  - **7–8** — ≥ 2 LLMs (e.g. Claude + GPT) on the same input, inter-LLM
  Δ < 1.5.
  - **9–10** — ≥ 3 LLMs + multi-pass each, intra-LLM σ < 1.0 and
  inter-LLM Δ < 1.5.
   *Honest under-reporting (e.g. "I only ran one LLM, scoring 4") is part of
   the score.*
2. **Side-effect declaration.** Does the skill declare what it writes vs only
  reads? Are dangerous operations (file writes, network requests, code
   execution) labelled in SKILL.md, not buried? *(For `spec`: N/A — spec
   documents have no side effects.)*
3. **Adversarial robustness.** If the SKILL.md is fully visible (it is) and a
  user wants to manipulate the output, what's the failure mode? For
   evaluator-type skills: can a user game the rubric? For generator-type
   skills: can a user inject a fake template? Is there any defence at all?
   *(v0.1.x has no documented attack corpus — score this dimension generously
   and leave a note; see Open Issues 5.)*
4. **Failure surfaces.** When inputs are missing, malformed, or partial, does
  the skill have explicit "say so, don't fabricate" rules — or does it bluff?

### D4. Output-fit

**Question:** Is the skill's output directly usable by the user it targets?

Anchor checks:

1. **Citation / grounding.** For evaluator / extractor / analyst skills: does
  every claim in the output cite the source it came from (file path, probe
   ID, line number)? Ungrounded outputs score low.
2. **Actionability.** Does the output's next step appear in the output itself?
  "score: 4/10" without "here's the specific change" deducts.
3. **No round-trip required.** Can the user act on the output without going
  back to the LLM and asking "what does this mean?" If yes, score high.
4. **Failure clarity.** When the skill cannot produce its standard output,
  does it say so cleanly ("`character.speakingStyle` is null — cannot score")
   instead of degrading silently?

### D5. Lifecycle-fit

**Question:** Does the skill cooperate with adjacent skills and have a
credible forward path?

Anchor checks:

1. **Adjacent-skill boundary.** If skills A and B both touch the same problem
  space, is the boundary written down? (E.g. the [Scope](#scope) table at
   the top of this document, distinguishing `darwin-skill`, `persona-evaluator`,
   and `SKILL-RUBRIC`, is the shape we want.)
2. **Handoff cleanliness.** When this skill produces output that another skill
  consumes (`evaluator → refine`, `anyone → open-persona`), is the contract
   explicit (JSON shape / file path / signal protocol)?
3. **Versioning policy.** Is there a `metadata.version` (spec-compliant), and
  does the skill plan for breaking changes (rubric versions, schema versions,
   deprecation windows)? *(For `spec` subjects: substitute "is there a
   versioned changelog and a rollout plan toward stability".)*
4. **Standalone vs bundled.** If the skill claims it will be standalone-installable
  (a future `acnlabs/<slug>` repo), is there a credible path to that, or is
   it permanent vapourware?

---

## Type-aware Weighting

A skill is one of these archetypes. Strict / Lenient sets shift which
dimensions a low score actually hurts on. Modelled directly on the same
role-aware approach `persona-evaluator` uses for personas.


| Skill type  | Strict (must-be-strong)                  | Lenient (won't be heavily penalised)                            | Examples in this repo                                             |
| ----------- | ---------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `tool`      | Reliability, Output-fit, Architecture    | Lifecycle-fit (often repo-internal, no public distribution yet) | `persona-evaluator`, `persona-knowledge`, `persona-model-trainer` |
| `persona`   | Problem-fit, Output-fit, Reliability     | Lifecycle-fit (persona packs rarely need versioning rituals)    | `entrepreneur-skill`, `brand-persona-skill`                       |
| `framework` | Architecture, Lifecycle-fit, Reliability | Problem-fit (foundational by purpose)                           | `open-persona`, `secondme-skill`                                  |
| `meta`      | Architecture, Lifecycle-fit              | Problem-fit (it delegates to generated skills)                  | `anyone-skill`                                                    |
| `spec`      | Architecture, Output-fit, Lifecycle-fit  | Problem-fit (foundational standard, judged by adoption)         | `SKILL-RUBRIC` (this file)                                        |


For `strict` dimensions, the rubric anchors apply at full strength. For
`lenient` dimensions, only the **internal-consistency** check applies (does
the score contradict the rest of the skill?), and the floor is 6 if the skill
is at least coherent.

If the type is unclear and the subject is in `skills/`, fall back to `tool`.
If the subject is not in `skills/`, fall back to `spec`.

> **Why Problem-fit is no longer lenient for `tool`.** v0.1.0 listed
> Problem-fit as lenient ("often self-evident from name") for tool skills.
> v0.1.1 removed it after self-review caught the contradiction: the rubric's
> own first-pass review of `persona-evaluator` scored Problem-fit 7/10
> *because* of weak user evidence — exactly the signal a "lenient"
> classification would have suppressed via the floor-of-6 rule. Problem-fit
> is now normal for `tool`, and only lenient for skills whose problem is
> foundational/delegated (`framework`, `meta`, `spec`).

---

## Hard Rules for the Reviewer

These are the same shape `persona-evaluator` uses, adapted for skill design.

- **Cite verbatim.** Every per-dimension score must reference a specific line
range in SKILL.md, README.md, or `references/`*. No citation → no score.
- **Reproducibility honesty.** If you applied this rubric using only one LLM,
say so in the mandatory header field and cap D3 according to the D3.1
calibration ladder.
- **Spec compliance is a gate.** Failing the gate sets overall = 0. Do not
"average around" a spec violation. N/A on `spec`-type subjects is *not*
a fail.
- **Don't overload the type.** A persona skill should be evaluated as a
persona skill — don't apply tool weights to it because you "personally find
reliability important here".
- **Disclose disagreements with the declared type.** Reviewing Procedure
step 1 says "read SKILL.md `description` and `metadata.tags`" to classify
type — but read the **body** too. If the SKILL.md body shape contradicts
the declared / tagged type (e.g. labelled `persona` but the body reads
"orchestration skill package... Foundation / Capability chain"), surface
that as a separate **cross-cutting observation** in the report and score
against the **inferred** type. Do not silently re-score against the
declared type, and do not silently apply the inferred type without
flagging it. (Mirrored from
`[persona-evaluator` SKILL.md L154](../skills/persona-evaluator/SKILL.md);
added in v0.1.3 after Session 2 found `secondme-skill` mis-typed —
see [SESSION-2 F4](./SKILL-RUBRIC-SESSION-2.md#cross-cutting-findings).)
- **Lean lower under uncertainty.** A rounded-up 7 is more harmful than an
honest 5. The 5 prompts a fix; the 7 blesses status quo.
- **Note v0.1.x's known limitations** in every report. See
[Open Issues](#open-issues--known-limitations).

---

## Output Format

```markdown
## Skill Design Review (SKILL-RUBRIC v0.1.4)

**Subject:** <skill-slug or spec-path>
**Type (declared / inferred):** tool | persona | framework | meta | spec
**Reviewer (human):** <reviewer-id>
**Reviewer-LLM(s) and pass count:** <model-name> × N (or "none — human-only") — REQUIRED, drives D3.1
**Spec gate:** PASS | FAIL | N/A — if FAIL, stop here and link the validator output. If N/A, give the one-line reason.

### Per-dimension scores

- **D1 Problem-fit — N/10** — citing SKILL.md L## / README L##. One paragraph.
  End with one concrete sharpening.
- **D2 Architecture — N/10** — same shape.
- **D3 Reliability — N/10** — D3.1 ladder is a hard cap; state which LLM(s)
  and how many passes. Other anchors only confirm or reduce.
- **D4 Output-fit — N/10** — same shape.
- **D5 Lifecycle-fit — N/10** — same shape.

### Cross-cutting observations

- 1–3 bullets noting contradictions, type-mismatch, or patterns spanning
  multiple dimensions.

### Overall design judgement

- **N/10** (type-weighted average across the 5 dimensions, with `lenient`
  dimensions floored at 6 if coherent).
- One paragraph synthesising the per-dimension scores. Explicitly name the
  single highest-leverage improvement.

### Known rubric limitations

- v0.1.x has not been validated for inter-rater variance. Treat this score as
  design-review signal, not CI signal.
```

---

## Open Issues / Known Limitations

These are tracked here so the next rubric iteration knows what to fix.
**This is the canonical list — other sections that mention "known limitations"
should link here rather than duplicate.**

1. **Inter-rater variance unmeasured.** Session 2 (single-LLM, single-pass
  over 8 skills, see [SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md))
   confirmed every D3 score collapsed to 4/10 under the calibration ladder —
   exactly as predicted, and not yet inter-rater data. **Session 3**
   (multi-LLM pass) is what addresses this; v0.1.x will mostly produce 0–4
   reliability scores until then.
2. **D3 Reliability is overloaded.** It currently mixes reproducibility
  (cross-LLM stability, now a hard cap) and adversarial robustness (gaming
   / injection). These may need to split into D3a / D3b in v0.2.
3. **D5 Lifecycle-fit is overloaded.** Combines ecosystem-fit (adjacent
  skills) and evolvability (versioning). May split.
4. **No skill-type detector.** The reviewer must hand-classify (tool /
  persona / framework / meta / spec). For automation, the rubric needs a
   detector — likely reading SKILL.md `description` and `metadata.tags`,
   plus a path heuristic for `spec`.
5. **Adversarial dimension is theory-only.** No documented attack patterns
  yet. Need a corpus of "skills that look good but score poorly" to anchor
   D3.3.
6. **Floor-of-6 for lenient dimensions** is borrowed from `persona-evaluator`
  without re-derivation. May be too generous for skill-quality.
7. **No CI integration yet.** Spec gate is automated (`validate-skills.mjs`);
  the five dimensions require an LLM. A future `skill-evaluator` skill would
   close this gap.
8. **Body length: archival split done in v0.1.4; structural split still
  pending v0.2.0.** v0.1.3 had this file at 546 lines, breaking its own
   500-line anchor. v0.1.4 moved Self-eval Log + full Changelog to
   [SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md), bringing the
   spec back under 500. The remaining v0.2.0 work is the **structural**
   split — `references/DIMENSIONS.md` (D1–D5) + `references/WEIGHTING.md`
   (type-aware weighting + Hard Rules) — which is a different cleavage
   from the v0.1.4 archival split, and which the rubric needs in order
   for the spec body itself (vs its history) to stay under the ceiling
   long-term as more dimensions / examples are added.
9. `**spec` type has only one example so far** (this file itself). Whether
  the strict/lenient profile generalises will be tested when more
   `spec`-type documents emerge in this repo.

---

## Rollout Plan

Where this rubric is heading, in order:

1. **Session 1 (done)** — write this markdown.
2. **Session 1.5 (done, 2026-04-26)** — self-eval v0.1.1 against itself,
  surface 4 cross-cutting findings, fold into v0.1.2 (this version).
3. **Session 2 (done, 2026-04-26)** — applied v0.1.2 to all 8 in-repo
  skills with a single LLM. Surfaced 10 cross-cutting findings (F1–F10)
   and 13 proposed v0.2.0 changes. Two P0 patches folded into v0.1.3
   immediately (this version). Full report:
   [SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md).
4. **Session 3** — repeat Session 2's 8-skill pass with at least Claude +
  GPT to produce inter-rater variance data, then fold the 11 remaining
   v0.2.0 proposals from Session 2 + new disagreements into v0.2.0. Decide
   whether to split D3 (reproducibility vs adversarial). Update type
   weights if patterns emerge. Split into `references/` per Open Issues 8.
5. **Session 4 (conditional)** — if v0.2.0 reaches "stable enough" (subjective
  for now; objective bar would be inter-rater variance < 1.5 per dimension),
   graduate to a skill: `skill-evaluator`, modelled architecturally on
   `persona-evaluator` (structural CLI gate + semantic LLM rubric + black-box
   mode).

Skipping straight from Session 1 to Session 4 reproduces the
"designed-pretty-but-untested" failure mode of `persona-evaluator 0.3.0`.
Don't.

---

## Relationship to Other Rubrics

Three skill evaluation+improvement tools sit at different lifecycle
segments. `skill-creator` (creation + iteration) and `darwin-skill`
(autonomous batch optimisation) **overlap on SKILL.md improvement**;
`SKILL-RUBRIC` (ship gate) does something neither does.

- **agentskills.io spec validator** — runs *before* this rubric;
assumes the skill is already spec-clean.
- **`skill-creator` (Anthropic)** — creation + iteration. Two
distinct improvement loops:
  1. **SKILL.md iteration** — user-feedback driven; reward signal is
     real-world user judgement.
  2. **Description optimiser** — automated 5-round optimiser with
     **train/test split** (prevents prompt-set overfitting); backed
     by `trigger-discovery-agent` + `skill-grading-agent`.
  Strengths unique to it: (a) it actually creates new skills (the
  other two only optimise/audit existing ones); (b) reward signals
  are real (user feedback + held-out test set), not LLM self-graded;
  (c) train/test discipline on description is the strongest
  overfitting guard among the three. Gap: SKILL.md-body iteration is
  user-in-the-loop — does not scale to batch optimisation of dozens
  of skills.
- **`darwin-skill` (alchaincyf, 1.7K★)** — autonomous 8-dim
hill-climbing **ratchet** (find weakest dim → patch → sub-agent
benchmark → keep/revert) with cross-session persistence
(`results.tsv`). **Its improvement loop overlaps with
`skill-creator`'s SKILL.md iteration** but trades the user-in-the-loop
for unattended batch operation; the resulting reward signal becomes
LLM-self-graded with inflation bias. Strength unique to it:
explorative rewrite to escape local optima. Gaps: 8-dim weights
(8/15/10/7/15/5/15/25) lack provenance; reuses one fixed test-prompt
set across rounds (overfitting risk — `skill-creator`'s train/test
split is a worthwhile import); missing `metadata.version` in own
frontmatter (fails its own D5.3).
- **`SKILL-RUBRIC` (this doc)** — ship-gate design audit. **Refuses
to improve in-place** — doing so would compound the LLM grading
inflation `darwin-skill` already incurs. Strengths unique to it: D3.1
calibration ladder caps single-LLM scores at ≤4, `cite verbatim`
evidence rule, type-aware weighting (tool / persona / framework /
meta / spec), self-disclosed Open Issues. Gaps: Markdown-only (skill
graduation is the v0.2.x target); no baseline-comparison benchmark;
no inter-rater data yet (Session 3).
- **`persona-evaluator`** — quality of *personas*, not skills. A
persona skill (e.g. `entrepreneur-skill`) gets evaluated by both:
this rubric for skill design, `persona-evaluator` for persona pack
quality.

**Honest substitution guidance.** For single-skill authors,
`skill-creator` is the better default — its reward signals (user
feedback + train/test split) are more trustworthy than
`darwin-skill`'s LLM-self-graded ratchet. `darwin-skill` is preferable
only when (a) you have 60+ skills to optimise simultaneously, (b) you
accept its 8-dim rubric as ground truth, or (c) you want unattended
overnight evolution. A skill can score 9 in `darwin-skill`
(well-written by its 8-dim metric) and 4 here (mis-designed for its
declared type) — or vice versa. The three are not redundant.

---

## Self-eval Log

Evidence-of-use record for D1.3. Each row is one real invocation of this
rubric. **Full narratives + cross-cutting findings live in
[SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md#self-eval-log).**


| Version | Date       | Subject          | Reviewer           | Overall       | Findings driving next bump                               |
| ------- | ---------- | ---------------- | ------------------ | ------------- | -------------------------------------------------------- |
| v0.1.1  | 2026-04-26 | `SKILL-RUBRIC`   | human + Claude 4.6 | 6.6/10        | C1–C4 → folded into v0.1.2                               |
| v0.1.2  | 2026-04-26 | 8 in-repo skills | human + Claude 4.6 | median 6.2/10 | F1–F10 → P0 in v0.1.3, P1 in v0.2.0                      |
| v0.1.3  | 2026-04-26 | `SKILL-RUBRIC`   | human + Claude 4.6 | 6.6/10        | C5 (D1 ↑ / D2 ↓ wound shift) + C6 (L298 anchor) → v0.1.4 |


---

## Provenance

This rubric was synthesised on 2026-04-25 in a session reviewing
`persona-evaluator 0.3.0`. The original 8 dimensions (Problem-fit,
Mode-architecture, Reproducibility, Adversarial-robustness, Explainability,
Actionability, Ecosystem-fit, Evolvability) were collapsed to 5 + a binary
Spec gate, with type-aware weighting added to address the "a tool skill
is judged by different criteria than a persona skill" gap.

This was a **single-author, single-LLM derivation**. v0.1.x inherits the
weaknesses of that origin and must not be treated as a community standard
until Session 3 produces multi-LLM evidence (Session 2 was still
single-LLM — see [SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md)).

**Recent changelog.** Full version history in
[SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md#full-changelog).

- **v0.1.5 (2026-04-27)** — Relationship-section accuracy patch
  (two same-day iterations driven by reviewer pushback):
  - **First pass**: rewrote
  [Relationship to Other Rubrics](#relationship-to-other-rubrics) to
  position this rubric as one of three lifecycle-segment peers
  (`skill-creator` for creation, `darwin-skill` for ongoing iteration,
  `SKILL-RUBRIC` for ship-gate audit) — replaces the prior 3-line
  mention which understated `darwin-skill` as "text quality of
  SKILL.md" (it is in fact an 8-dim hill-climbing ratchet); also fixed
  formatting bug in bullet headers (backticks were outside the
  bold markers).
  - **Second pass**: corrected over-soft "complementary, not
  substitutes" framing to "**overlap on SKILL.md improvement**" after
  the reviewer challenged whether `darwin-skill` is actually needed
  given `skill-creator` already has improving; expanded
  `skill-creator`'s improving description into its two distinct loops
  (user-feedback SKILL.md iteration + automated description optimiser
  with train/test split); added an **Honest substitution guidance**
  closer — for single-skill authors, `skill-creator` is the better
  default because its reward signals are more trustworthy than
  `darwin-skill`'s LLM-self-graded ratchet.
  - Cross-tool finding worth surfacing: `skill-creator`'s train/test
  split is the ratchet-overfitting fix `darwin-skill` is currently
  missing (informs v0.2.x graduation scope).
  - Body length now ~567 lines (up from v0.1.4's ~480); D2.3 watch
  zone deeper — references/ split per Open Issues 8 remains
  v0.2.0-scope.
- **v0.1.4 (2026-04-26)** — Step 1 trust-chain integrity pass:
  - fixed Hard-Rules anchor `#open-issues--known-limitations-v012` →
  stable `#open-issues--known-limitations` (defect introduced by
  v0.1.3's heading rename; previously broke every Output-Format-derived
  report — finding C6);
  - moved Self-eval Log narratives + full Changelog to
  [SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md), restoring
  D2.3 body-length compliance (546 → ~480 lines);
  - added v0.1.3 self-eval row to Self-eval Log + recorded the
  wound-shift finding (D1 ↑ / D2 ↓, score 6.6/10 unchanged) as C5;
  - updated Open Issues 8 to reflect the archival split done; the
  structural Dimensions+Weighting split remains v0.2.0-scope.
- **v0.1.3 (2026-04-26)** — folded in two P0 findings from Session 2's
multi-skill pass ([SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md)):
reclassified `secondme-skill` from `persona` to `framework` (F4); added
"Disclose disagreements with the declared type" to Hard Rules,
mirroring `persona-evaluator` SKILL.md L154; updated Reviewing
Procedure step 1 to require reading SKILL.md body (not just
frontmatter); recorded the body-length regression (resolved in v0.1.4).
11 P1 changes from Session 2 deferred to v0.2.0.

