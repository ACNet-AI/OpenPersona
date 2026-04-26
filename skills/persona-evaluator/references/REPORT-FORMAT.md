# Semantic Evaluation Report Formats

Two complementary output formats — pick whichever matches your data source. The main `SKILL.md` references this file at the end of its semantic procedure; do not invent a third format.

## White-box format (Tier 1 / self-eval / peer-eval-with-pack-content)

Use when you have `packContent` from `npx openpersona evaluate <slug> --pack-content` (locally, or via Tier 1 A2A handshake). Apply the rubrics in [RUBRICS.md](RUBRICS.md). Keep the report under ~500 words for a typical persona.

```markdown
## Semantic Evaluation Report

**Mode:** self | peer
**Reviewer:** {persona-name} ({role})        ← peer mode: your identity. self mode: write "same as subject (self-evaluation)"
**Subject:**  {persona-name} ({role})

### Static anchor (from `openpersona evaluate <slug> --pack-content`)
- Overall: X/10 [band]
- Constitution: PASSED | FAILED (n violations)
- Strict dimensions: ...
- Lenient dimensions: ...

### Per-field semantic scores
- **background — N/10** (`packContent.character.background`) — one-paragraph rationale citing rubric questions you applied. End with one concrete fix.
- **personality — N/10** (`packContent.character.personality`) — same shape.
- **speakingStyle — N/10** (`packContent.character.speakingStyle`) — same shape.
- **boundaries — N/10** (`packContent.character.boundaries`) — same shape, focused on hard-limit / enforceability / coverage checks.
- **immutableTraits — N/10** (`packContent.immutableTraits`) — same shape, focused on identity-survival traits (the trait-drift check is independent from the boundary-drift check above).
- **aesthetic — N/10** (`packContent.aesthetic`) — one or two sentences.
- **soulDocs[behavior-guide.md] — N/10** — only if present in `packContent.soulDocs`.
- **soulDocs[self-narrative.md] — N/10** — only if present.
- **soulDocs[identity.md] — N/10** — only if present.

### Cross-cutting observations
- 1–3 bullets noting contradictions, role-fit issues, or patterns spanning multiple fields.

### Overall semantic judgement
- **N/10.** One paragraph synthesising the per-field scores. Explicitly name the single highest-leverage improvement.

### How this relates to the structural score
- Structural: X/10 (CI signal, deterministic).
- Semantic: N/10 (design-review signal, this report).
- The two are reported separately by design. Do not average them.
```

Both self and peer reports always include the `Reviewer` line — in self mode it makes the symmetry explicit; in peer mode it lets the reader factor in any leak-through from the reviewer's role.

### Hard rules for the white-box semantic reviewer

- **Never write back to disk.** Semantic mode is purely advisory output. Do not modify `persona.json`, `behavior-guide.md`, or any pack file.
- **Never average semantic into structural.** They measure different things; combining them muddies the CI signal.
- **If `--pack-content` returns empty fields**, say so explicitly rather than inventing content to evaluate. ("`character.speakingStyle` is null — cannot score.")
- **If you (the reviewer) are uncertain, lean lower.** A rounded-up 7 is more harmful than an honest 5; the latter prompts a fix, the former blesses status quo.
- **No emojis in the output report itself.** The aesthetic block discusses emoji as data; the surrounding report stays plain.

## Black-box format (Tier 2 / Tier 3)

Use when working from probe answers or passive public observation. See [BLACK-BOX.md](BLACK-BOX.md) for the data-source tiers, probes, and confidence caps that govern the scores below.

```markdown
## Black-box Semantic Evaluation Report

**Mode:** black-box
**Tier:** 2 (Probe) | 3 (Passive)
**Data source:** <e.g. "10 probe responses + 2 deep-dives via direct chat"; "public messages in #channel 2026-04-20 .. 2026-04-24">
**Consent:** yes (explicit) | no (passive — disclaimer applied)
**Confidence:** mid | low
**Reviewer:** <reviewer-slug> (<reviewer-role>)
**Subject:** <self-declared identity> (<self-declared role, unverified>)

### Material collected
<List the probes sent and whether each was answered, or the observed passages — N items total. Do not paraphrase answers; quote verbatim enough that a reader can audit the scoring.>

### Per-field semantic scores
- **background — N/10 (conf: <low|mid|high>)** — rationale citing probe #B1 (+ #B2 if sent) or observed passages. End with one concrete fix.
- **personality — N/10 (conf: ...)** — same shape, citing P1/P2 (+ P3).
- **speakingStyle — N/10 (conf: ...)** — citing S1/S2 and the S3 self-baseline if used. Typically the highest-fidelity black-box field.
- **boundaries — N/10 (conf: ...)** — citing BD1 (+ BD3 if used). If BD3 was skipped, say so; do not fabricate.
- **immutableTraits — N/10 (conf: ...)** — citing BD2.
- **aesthetic — N/10 (conf: ...)** — citing A1.
- **identity coherence — N/10 (conf: ...)** — black-box native; citing IC1/IC2 (+ IC3).

### Dimensions not scorable (black-box)
Body · Faculty · Skill · Evolution · Economy · Vitality · Social · Rhythm — require white-box access.

### Declared vs observed divergence
- Subject declared: <what IC1 said>
- Observed behavior: <what speakingStyle + stress responses actually looked like>
- Gap: <0–3 short bullets. If none, write "no observable divergence">

### Overall black-box judgement
- **N/10** at confidence **<tier>**. Tier cap applied: <yes, capped from X/10> | <no, cap did not bind>.
- One paragraph synthesising the scores. Explicitly name the single highest-leverage improvement.

### Escalation path
- If the subject wants a full white-box review, they can run `npx openpersona evaluate <slug> --pack-content` locally and share the JSON. This report could then be re-issued at confidence `high`.
```

The hard rules for black-box reviewers are in [BLACK-BOX.md](BLACK-BOX.md#hard-rules-for-the-black-box-reviewer).