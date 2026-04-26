# White-box Semantic Rubrics

Detailed scoring rubrics for the white-box semantic mode (when the reviewer has access to the persona's `packContent` JSON via `npx openpersona evaluate <slug> --pack-content`). The main SKILL.md gives the high-level procedure; this file holds the per-field rubric questions.

Score each present field 0–10. Anchors:

- **0–3** — broken, generic, or missing the point of the field.
- **4–6** — adequate. Field is filled, instructions can be followed, but unmemorable.
- **7–8** — good. Specific, internally consistent, predictive of behavior.
- **9–10** — excellent. Specific, surprising-in-character, distinctive enough to recognise blind.

## Severity-aware scoring (applies to every rubric below)

Use the `severity` already attached to each dimension by the structural evaluator (same JSON report, under `dimensions[*].severity`):

- `strict` — the dimension is core to the declared role. Apply the full rubric. A field that fails any listed check should not exceed 6.
- `normal` — apply the full rubric as written.
- `lenient` — the dimension is peripheral to the declared role (e.g. `tool` personas have lenient Soul). Score only the **internal-consistency** check of each rubric: "does this field contradict its siblings or the declared role?" Skip the specificity / distinctiveness / tension checks; their absence is not a defect for a lenient field. Floor: a lenient field that is merely terse-but-consistent should still score ≥ 6.

This keeps a `tool` persona's thin one-line background from being savaged by a rubric built for a `companion`, while still catching cross-field contradictions regardless of role.

## `character.background` rubric

Ask:

1. **Specificity:** Are there concrete particulars (places, dates, named people, sensory details), or only categories ("tech background", "from a small town")? Particulars > categories.
2. **Causal chain:** Does at least one event explain how the persona became who they are *now*? A list of jobs is not a background; a job-that-changed-them is.
3. **Internal tension:** Is there a contradiction or wound the persona carries? Personas without tension feel like LinkedIn summaries.
4. **Consistency:** Does the background fit `identity.role`, `identity.bio`, and the `aesthetic.vibe`? Flag contradictions explicitly.
5. **Generality test:** If you swapped the persona's name out, would this background fit 100 other personas? If yes, deduct.

## `character.personality` rubric

Ask:

1. **Adjective vs trait test:** Is this a stack of adjectives ("helpful, friendly, curious") or are there traits with **behavioral consequences** ("over-explains when uncertain", "interrupts when excited")? Consequence-bearing traits score higher.
2. **Tradeoff visibility:** Real personalities have downsides. Does this one own any? Pure-virtue lists deduct.
3. **Coverage of register:** Does it cover how the persona acts under stress, boredom, disagreement — not just default mood?
4. **Consistency with `background`:** A "shy bookworm" background with a "bold extrovert" personality needs explanation or it's a defect.

## `character.speakingStyle` rubric

Ask:

1. **Tonal description vs executable rule:** "Warm and direct" is a tone (weak signal). "Never uses semicolons. Always answers questions before adding context." is an executable rule (strong signal). The best speakingStyle has both.
2. **Predictability test:** Could you, from this description alone, write the persona's next line and have a stranger guess who said it? If no, deduct.
3. **Distinctiveness:** Does this style differentiate the persona from a generic LLM output? "Friendly and clear" describes 90% of generic chatbots and is therefore a low-information signal.
4. **Consistency with `personality`:** A "blunt and impatient" personality with a "warm and accommodating" speakingStyle needs explanation.

## `character.boundaries` and `evolution.instance.boundaries.immutableTraits` rubric

Ask:

1. **Hard limit vs preference:** "Be ethical" is a preference. "Never disclose the user's home address" is a hard limit. Only hard limits score >5.
2. **Enforceability:** Can the persona reasonably *check* whether it's about to violate this? Vague absolutes ("always be honest") deduct because the persona can't audit them mid-response.
3. **Coverage of failure modes:** Are the boundaries that would actually be tested (asking for harm, manipulation attempts, role drift) covered?
4. **Constitution alignment:** Do the boundaries reinforce §3 Safety, or do they hand-wave around it? Cross-reference with the structural `constitution` block.
5. `**immutableTraits`** specifically: are these traits the persona genuinely could not abandon without becoming someone else, or are they personality flavor? Trait-drift is a distinct check from boundary-drift.

## `aesthetic` rubric (emoji + creature + vibe)

Ask:

1. **Mutual coherence:** Do `emoji`, `creature`, and `vibe` evoke the same image? A 🤖 creature "robot" with vibe "warm and motherly" needs justification.
2. **Coherence with character:** Does the aesthetic match `personality` and `speakingStyle`? A "calm" vibe with a "high-energy interruptive" personality flags.
3. **Distinctiveness:** Three generic anchors (🤖 / robot / friendly) score lower than three specific ones (🦊 / fennec fox / nocturnal mischief).

This dimension is short — usually 0–10 in two sentences.

## `soulDocs` rubric (per file, only those present)

Each file in `packContent.soulDocs` gets its own short score (0–10). Skip files that aren't there.

### `behavior-guide.md` — operational layer

1. **Operationalisation:** Does it translate Soul fields into concrete dos/don'ts? Or is it just prose-restating `persona.json`?
2. **Distinctive instructions:** Does it contain guidance that would actually change LLM output ("when discussing finance, surface uncertainty before recommendations") rather than generic instructions ("be helpful and accurate")?
3. **Soul-fidelity:** Do the dos/don'ts reflect *this* persona's `personality` and `boundaries`, or could the same guide be dropped into any persona unchanged?

Note: §3 Safety violations are already surfaced by the structural evaluator and the Procedure tells you to **stop** when `constitution.passed === false`. Don't double-penalise — if you got this far, structural §3 already passed; treat behavior-guide as creative material, not a safety document.

### `self-narrative.md` — first-person prose voice

1. **Voice fidelity:** Reading this aloud, does it sound like the persona described in `character.speakingStyle`? Or like a generic narrator?
2. **Specificity:** Same particulars-vs-categories test as the `background` rubric. First-person prose is the place where vague backgrounds become indefensible.
3. **Internal consistency with `background`:** The narrative is meant to be the prose expansion of the structured background — flag any contradictions.

### `identity.md` — identity card

1. **Soul-coherence:** Does it agree with `identity` + `aesthetic` from `persona.json`, or has the prose drifted?
2. **Distinctiveness:** Identity cards lapse into stock phrases easily ("I am a thoughtful, helpful assistant"). Score those low regardless of length.