# SKILL-RUBRIC History

> Companion to [SKILL-RUBRIC.md](./SKILL-RUBRIC.md). Holds the full
> Self-eval Log narratives and the version-by-version Changelog.
>
> Split out of the main spec in **v0.1.4** (2026-04-26) to resolve the
> v0.1.3 D2.3 body-length violation (546 > 500-line ceiling). Main file
> retains a summary table + recent-changelog excerpt; this file holds the
> full record.
>
> **Source of truth for changelog & self-eval is here.** The main spec's
> recent-changelog excerpt is updated in lock-step with this file.

---

## Self-eval Log

Evidence-of-use record for D1.3 ("Evidence of use"). Each row is one real
invocation of this rubric, including invocations against itself.

| Version | Date       | Subject                | Reviewer            | Overall          | Findings driving next bump            |
| ------- | ---------- | ---------------------- | ------------------- | ---------------- | ------------------------------------- |
| v0.1.1  | 2026-04-26 | `SKILL-RUBRIC`         | human + Claude 4.6  | 6.6/10           | C1–C4 → folded into v0.1.2            |
| v0.1.2  | 2026-04-26 | 8 in-repo skills       | human + Claude 4.6  | median 6.2/10    | F1–F10 → P0 in v0.1.3, P1 in v0.2.0   |
| v0.1.3  | 2026-04-26 | `SKILL-RUBRIC`         | human + Claude 4.6  | 6.6/10           | L298 anchor + D2.3 split → v0.1.4     |

### v0.1.3 self-eval (2026-04-26) — 6.6/10

Single-LLM, single-pass self-eval driving v0.1.4. Done as Step 1 of the
4-step trust-chain integrity pass (rubric → rubric's findings on
persona-evaluator → persona-evaluator → persona-evaluator's findings on
other personas).

D-by-D summary:

- **D1 Problem-fit — 8/10** ↑ from v0.1.1 6/10. The Self-eval Log section
  added in v0.1.2 directly closed v0.1.1's D1.3 wound. Two real
  invocations now on record (this self-eval makes a third). Closed-loop
  evidence of use.
- **D2 Architecture — 5/10** ↓ from v0.1.1 7/10 — **acute wound**.
  File at 546 lines violates rubric's own L150–154 anchor ("above 500,
  split is overdue, same anchor applies to spec subjects"). Strict-typed
  `spec` weighting, no lenient floor. *Sharpening that became v0.1.4:*
  this split.
- **D3 Reliability — 4/10** = same as v0.1.1. Calibration ladder cap.
  Lifts only after Session 3 (multi-LLM).
- **D4 Output-fit — 8/10** = same as v0.1.1. Citation rule, actionability,
  no-round-trip, failure clarity all preserved.
- **D5 Lifecycle-fit — 8/10** = same as v0.1.1. Scope table, versioning
  policy, Session 4 graduation path all intact.

Cross-cutting findings driven into v0.1.4:

- **C5 (v0.1.3 → v0.1.4)** — Score is identical to v0.1.1 (6.6/10) but
  the wound migrated: D1 went up 2 points, D2 went down 2 points. v0.1.3
  traded D2 for D1 in score-space. The dogfooding loop is working as
  designed (D1.3 wound from v0.1.1 closed; new D2.3 wound surfaced; v0.1.4
  closes that one).
- **C6** — L298 anchor `#open-issues--known-limitations-v012` was a real
  defect introduced by v0.1.3's heading rename to `-v013`. Output Format
  template inherited the broken link. Patched in v0.1.4.

### v0.1.1 self-eval (2026-04-26) — 6.6/10

Single-LLM, single-pass self-eval driving v0.1.2. D-by-D summary:

- **D1 Problem-fit — 6/10** — concrete user named (reviewer judging design
  quality), counterfactual honest, but zero evidence of use at the time of
  review. `meta`-lenient floor applied. *Sharpening that became v0.1.2:*
  introduce a Self-eval Log so D1.3 has at least one entry from the start.
- **D2 Architecture — 7/10** — single-purpose, clean section flow, but
  405 lines single file already past the 250 soft anchor. *Sharpening:* split
  into `references/` on the v0.2 track (now Open Issues 8).
- **D3 Reliability — 4/10** — D3.1 calibration ladder capped the score at
  the single-LLM ceiling. *Sharpening that became v0.1.2:* state explicitly
  that D3.1 is a hard cap on D3 overall (was ambiguous in v0.1.1 — see C3).
- **D4 Output-fit — 8/10** — strongest dimension; "cite verbatim" rule and
  "concrete sharpening" requirement directly enforce grounding and
  actionability. *Sharpening that became v0.1.2:* make the reviewer-LLM
  declaration a required header field, not a parenthetical (C4).
- **D5 Lifecycle-fit — 8/10** — Scope table is the canonical example for
  D5.1; changelog and rollout plan are explicit. *Sharpening:* future v0.2
  may add a structured (JSON) report-emission alongside markdown, lifting
  D5.2 (handoff cleanliness).

Cross-cutting findings driven into v0.1.2:

- **C1** — Type system had no slot for non-skill specifications → added
  `spec` as 5th type.
- **C2** — Spec gate had no N/A path for non-skill subjects → added explicit
  N/A branch.
- **C3** — D3.1's relationship to the rest of D3 was ambiguous (cap vs
  sub-anchor) → declared explicitly as a hard cap.
- **C4** — Output Format header treated reviewer-LLM as parenthetical even
  though D3.1 needs it as primary input → made it a required header field.

### v0.1.2 multi-skill pass (2026-04-26) — median 6.2/10

8 in-repo skills evaluated with v0.1.2. Findings F1–F10 + 13 v0.2.0
proposed changes. Full report:
[SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md). Two P0 patches
(secondme reclass + declared-vs-inferred Hard Rule) folded into v0.1.3.

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

---

## Full Changelog

- **v0.1.4 (2026-04-26)** — Step 1 trust-chain integrity pass:
  - fixed L298 anchor (`#open-issues--known-limitations-v012` →
    `-v013`), a defect introduced by v0.1.3's heading rename — every
    report copying the Output Format template would have inherited the
    dead link (finding C6 above);
  - moved Self-eval Log narratives + full Changelog into this file
    ([SKILL-RUBRIC-HISTORY.md](./SKILL-RUBRIC-HISTORY.md)), restoring
    main-spec D2.3 body-length compliance (546 → ~445 lines), partially
    closing Open Issues 8 (Dimensions+Weighting split still on v0.2.0
    track);
  - added v0.1.3 self-eval narrative + recorded the wound-shift finding
    (D1 ↑, D2 ↓, score 6.6/10 unchanged) as C5 — dogfooding loop's third
    full cycle;
  - main spec retains a summary table (3 rows) + most-recent-changelog
    excerpt (v0.1.4 + v0.1.3, ~25 lines) inline; this file is the source
    of truth for the full history.
- **v0.1.3 (2026-04-26)** — folded in two P0 findings from Session 2's
  multi-skill pass ([SKILL-RUBRIC-SESSION-2.md](./SKILL-RUBRIC-SESSION-2.md)):
  - reclassified `secondme-skill` from `persona` to `framework` in the
    Type-aware Weighting examples, on evidence from its SKILL.md L14–16
    ("orchestration skill package... Foundation / Capability chain"); the
    misclassification was **the rubric's failure**, not the skill's
    (Reviewing Procedure step 1 read frontmatter only, not body) — see
    Session 2 finding F4;
  - added "Disclose disagreements with the declared type" to Hard Rules,
    mirroring `persona-evaluator` SKILL.md L154's mature wording, so
    future declared-vs-inferred conflicts are surfaced as cross-cutting
    observations rather than silently re-scored;
  - updated Reviewing Procedure step 1 prose (in the Hard Rules
    cross-reference) to require reading the SKILL.md body in addition
    to frontmatter for type classification;
  - updated Open Issues 1 and Rollout Plan to reflect Session 2 done and
    Session 3 = multi-LLM;
  - added Self-eval Log row for the v0.1.2 → v0.1.3 multi-skill pass.
  - **dogfooding regression noted:** the v0.1.3 changelog itself pushed
    body length over the spec's 500-line warn ceiling (Open Issues 8
    promoted from v0.2-track to v0.2.0-blocking; resolved in v0.1.4).
  - **deferred to v0.2.0:** 11 P1 changes from Session 2 (D3 split,
    D2.3 graduated pressure, D2.2 position requirement, D2.4 binary
    tool-usage check, calibration anchors, predicted-uncapped D3,
    persona-D5 prose, D5.4 forward-looking marker, `spec`-type weighting
    revisit, type-detector body reading codified, Self-eval Log lifted to
    recommended SKILL.md section). All require design review, not patch.
- **v0.1.2 (2026-04-26)** — folded in v0.1.1 self-eval findings (C1–C4):
  - added `spec` as a 5th type for non-skill standards / rubrics / checklists
    (closes self-eval cross-cutting #1);
  - added explicit N/A path to the spec gate when subject is not in
    `skills/` (closes #2);
  - declared D3.1 calibration ladder is a *hard cap* on D3 overall, not a
    sub-anchor (closes #3);
  - elevated reviewer-LLM declaration to a required header field in the
    Output Format (closes #4);
  - added Self-eval Log section as evidence-of-use for D1.3;
  - added Session 1.5 to Rollout Plan to record the self-eval pass.
- **v0.1.1 (2026-04-25, same day as v0.1.0)** — folded in self-review
  findings:
  - removed Problem-fit-as-lenient on `tool` after a self-contradiction
    surfaced (v0.1.0 review of `persona-evaluator` had already broken its
    own rule);
  - reclassified `persona-model-trainer` from `meta` to `tool` (it trains
    models; it does not generate other skills);
  - reclassified `persona`-type lenient axis from Architecture to
    Lifecycle-fit (multiple persona skills in this repo are multi-mode);
  - aligned D2.3's body-length anchor to the spec's 500-line ceiling
    (250 retained as a softer "consider splitting" signal);
  - added a calibration ladder to D3.1 to make Cross-LLM stability scorable;
  - added a Reviewing Procedure section so the rubric is actually
    executable;
  - documented why the Spec gate zeroes (vs `persona-evaluator`'s cap-at-3);
  - consolidated the four scattered "inter-rater variance" caveats into
    Open Issues 1.
- **v0.1.0 (2026-04-25)** — initial collapse from 8 dimensions to 5 +
  Spec gate.
