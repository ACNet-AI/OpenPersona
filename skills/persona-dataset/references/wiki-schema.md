# Wiki Schema

> Maintenance rules for the persona wiki. LLM agents must follow these rules when updating pages.

## Architecture

The wiki is a **derived artifact** — MemPalace is the source of truth for raw data, and the wiki is a structured, human-readable knowledge layer built on top of it. When in doubt, query MemPalace for authoritative data.

## Page structure

Every content page follows this template:

```markdown
# {Title}

> One-sentence scope of this page.

## Content

{Structured content with [L?:source] evidence tags and [[backlinks]]}

## Sources

- {source_file}: {what was extracted} [L?]

## See also

- [[related_page]]
```

## Evidence levels

Each factual claim should be tagged with an evidence level:

| Level | Tag | Meaning | Example |
|-------|-----|---------|---------|
| L1 | `[L1:whatsapp-2024]` | Direct quote, traceable to specific message | "I always drink black coffee" [L1:whatsapp-2024] |
| L2 | `[L2]` | Reported/paraphrased, verifiable from context | Prefers morning meetings [L2] |
| L3 | `[L3:inferred]` | Reasonably inferred from multiple signals | Likely introverted — avoids large gatherings [L3:inferred] |
| L4 | `[L4:inspired]` | Impression-based, subjective interpretation | Seems to have a dry, self-deprecating humor [L4:inspired] |

Higher evidence levels (L1, L2) are preferred. A page should have at least 2 evidence tags to be considered "populated."

## Content pages

| Page | Hall source | Scope |
|------|-------------|-------|
| `identity.md` | hall_facts | Name, age, background, career, education, location |
| `voice.md` | hall_voice | Vocabulary, sentence length, rhythm, tone, humor style, emotional temperature |
| `values.md` | hall_preferences | Core beliefs, preferences, dealbreakers, opinions, boundaries |
| `thinking.md` | hall_discoveries | Mental models, decision heuristics, problem-solving patterns |
| `relationships.md` | Knowledge Graph | Key people, relationship types, dynamics (KG-generated) |
| `timeline.md` | Knowledge Graph | Life events in chronological order (KG-generated) |

Additional pages can be created for specific topics (e.g., `career.md`, `hobbies.md`, `health.md`).

## System pages

| Page | Purpose |
|------|---------|
| `_schema.md` | This file — maintenance rules (do not modify unless schema changes) |
| `_contradictions.md` | Conflicting data points across sources, with both sides cited |
| `_changelog.md` | Record of every wiki update: date, pages, action, source |
| `_evidence.md` | Evidence tag counts per content page |

## Update protocol

### Adding new information

1. Identify which page(s) the new information belongs on
2. Write the content with appropriate evidence tags
3. Add `[[backlinks]]` to related pages
4. Update `_changelog.md` with: date, page(s), action ("added"/"updated"/"resolved"), source
5. Update evidence counts in `_evidence.md`

### Handling contradictions

1. **Do not overwrite** — add the new claim alongside the existing one
2. Create an entry in `_contradictions.md`:
   ```
   ## {Topic}
   - Claim A: {text} [L?:source_a]
   - Claim B: {text} [L?:source_b]
   - Status: unresolved / resolved ({reasoning})
   ```
3. When resolved, move resolution back to the content page and mark contradiction as resolved

### KG-driven page regeneration

`relationships.md` and `timeline.md` are regenerated from the Knowledge Graph after each ingestion:

1. Query KG for current entities and relationships
2. Format into the page template
3. Preserve any manually-added evidence tags or annotations from previous versions
4. Log update in `_changelog.md`

## Wikilink syntax

- Use `[[page_name]]` (without `.md` extension) for internal links
- Pages are in the same directory — no path prefixes needed
- Example: "Their [[values]] strongly influence [[thinking]] patterns"

## Quality bar

A wiki is considered "healthy" when:

- All content pages have at least 2 evidence-tagged entries
- No unresolved contradictions older than 1 ingestion cycle
- Every content page has at least 1 `[[backlink]]`
- `_changelog.md` has entries for every ingestion
- `_evidence.md` counts are current
