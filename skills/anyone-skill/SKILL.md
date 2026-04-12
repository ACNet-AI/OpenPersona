---
name: create-anyone
description: "Distill anyone into a runnable OpenPersona skill pack — real or fictional, personal or public, living or historical. Collects chat logs, documents, and public content, extracts a 4-dimension persona, and generates a portable OpenPersona pack via skills/open-persona. Use when asked to distill, clone, or create a persona for any person or character."
license: MIT
compatibility: Designed for Claude Code. Requires Python 3. Uses WebSearch for public figures and fictional characters.
allowed-tools: Read Write Edit Bash WebSearch
metadata:
  version: "1.0.0"
  author: acnlabs

# anyone.skill — Distill Anyone

> Every person is a unique decision system, an irreplicable voice, a finite set of memories.  
> **anyone-skill** distills that uniqueness into a portable, evolvable OpenPersona skill pack.

anyone-skill is a **distillation front-end** for OpenPersona. It handles data collection, 4-dimension extraction, and evidence grading. The final output is a full OpenPersona persona pack generated via `skills/open-persona`.

**Dependency chain**: `anyone-skill` → `skills/open-persona` → `openpersona create`

**Optional integration**: When `persona-dataset` is installed (`skills/persona-dataset/`), anyone-skill uses it for persistent storage, semantic search, and Knowledge Graph instead of writing directly to `training/raw/`. Detection:

```bash
# Check at start of Phase 3 — if this directory exists, use persona-dataset integration
ls skills/persona-dataset/SKILL.md 2>/dev/null && echo "persona-dataset detected"
```

When detected, data flow becomes: `source → persona-dataset ingest → MemPalace + KG + wiki → persona-dataset export → training/`

## Trigger phrases

- `/create-anyone`
- "distill X into a skill"
- "create a persona for X"
- "make a skill pack for X"
- "I want to talk to X as an AI"
- "clone X's personality"

To evolve an existing persona:

- "I have more data" / "add this to X"
- "that's not right" / "X wouldn't say that"
- `/update-anyone {slug}`

---

## Tools


| Task                                         | Tool                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Read any text / JSON / CSV / PDF / image     | `Read` (native — use for most chat exports)                                            |
| Search public figures / fictional characters | `WebSearch`                                                                            |
| Extract SQLite databases (iMessage / WeChat) | `Bash` → `python3 ${CLAUDE_SKILL_DIR}/scripts/preprocess.py --input <file.db>`         |
| Sample oversized files (>5000 messages)      | `Bash` → `python3 ${CLAUDE_SKILL_DIR}/scripts/preprocess.py --input <file> --max 3000` |
| Write / update files                         | `Write` / `Edit`                                                                       |
| Version management                           | `Bash` → `python3 ${CLAUDE_SKILL_DIR}/scripts/version_manager.py`                      |
| List existing personas                       | `Bash` → `python3 ${CLAUDE_SKILL_DIR}/scripts/skill_writer.py --action list`           |


> **Reading strategy**: use `Read` directly for all text-based exports — WhatsApp `_chat.txt`, Telegram `result.json`, Slack/Discord JSON, email `.eml`, Twitter/X archive, Feishu/DingTalk export, plain text, CSV. The agent understands any readable format natively; no parser needed.  
> Use `preprocess.py` only for: **(1)** binary SQLite `.db` files, **(2)** files too large to fit in context (auto-samples down to `--max`).

---

## Phase 0: Classify the Subject

Determine which category the subject falls into — different categories use different data strategies and ethical rules:

```
Who do you want to distill?

  [1] Yourself           — full digital self
  [2] Someone you know   — colleague, friend, family, partner, ex
  [3] Public figure      — entrepreneur, artist, athlete, politician
  [4] Fictional character — game, anime, novel, film, series
  [5] Historical figure  — relies on documents, biographies, speeches
  [6] Archetype          — composite persona, no single real subject
```

---

## Phase 1: Ethics & Copyright Check

> Full rules: [references/ethics.md](references/ethics.md). Key points by category:

**Someone you know** — confirm personal use only; no harassment, impersonation, or deception; all data stored locally.

**Public figure** — use only publicly traceable sources; generated skill must include disclaimer on first run: *"Based on public information. Not the real person. For reference only."*

**Fictional character**

- Personal local use → no restrictions, direct roleplay mode
- Distributing to others → activate **Inspired-by mode** (reinterpret, don't replicate)
- The key criterion is **distribution intent**, not release year

**Historical figure** — publicly published sources only; mark uncertain claims as inferred (L3/L4).

**Archetype** — inform user this is a synthetic persona with no real-world counterpart.

---

## Phase 2: Intake (exactly 3 questions)

Ask only these 3 questions, in order. Summarize answers before proceeding.

**Q1: Codename (required)**

> What should we call them? Doesn't need to be their real name.  
> e.g. `Alex` · `Jobs` · `Geralt` · `Grandma Rose`

**Q2: Basic info (one sentence, skippable)**

> Age / era, role / identity, where they're from — whatever comes to mind.  
> e.g. `28, product designer, Berlin` · `Apple co-founder, 1955–2011, Silicon Valley` · `The Witcher, monster hunter, medieval fantasy world`

**Q3: Personality impression (one sentence, skippable)**

> What's your core impression? MBTI, traits, contradictions, a moment that defined them.  
> e.g. `INTJ, perfectionist, publicly harsh but privately warm` · `quiet until it matters, never explains their moves`

---

## Phase 3: Collect Source Material

Guide the user based on subject type:

### Someone you know / Yourself

```
How would you like to provide source material?
More data = higher fidelity.

  [A] Chat export
      iMessage (macOS) · WhatsApp export · Telegram export
      Signal export · Slack export · Discord export
      WeChat (WeChatMsg / PyWxDump) · Feishu / DingTalk

  [B] Documents / email
      Notes, diaries, letters, essays, .eml / .mbox

  [C] Social media archive
      Twitter/X data export · Instagram archive · LinkedIn export
      Facebook data download

  [D] Paste / describe
      Paste text directly, or describe from memory
```

For each file provided:

- **Text / JSON / CSV exports** → use `Read` directly. The agent reads and understands any format.
- **SQLite `.db` files** (iMessage `chat.db`, WeChat PyWxDump) → run `preprocess.py --input <file.db>`
- **Very large files** (>5 MB or clearly >5000 messages) → run `preprocess.py --input <file> --max 3000`

#### Path A: persona-dataset detected

If `persona-dataset` is installed, ingest each source via its pipeline:

```bash
python skills/persona-dataset/scripts/ingest.py \
  --slug {slug} --source <path> --persona-name "{Name}"
```

This automatically handles PII scanning, deduplication, MemPalace storage, KG extraction, and `sources/` backup. No manual `training/raw/` writing needed.

Report after each source:
`✅ [N] messages from [source] → persona-dataset/{slug}`

#### Path B: no persona-dataset (default)

**After processing each source, immediately save a copy to `training/raw/`** (do not wait for Step 6-D):

```
Source type           → save as training/raw/…
─────────────────────────────────────────────────────────────
Chat export (any)     → whatsapp.jsonl / imessage.jsonl / …  [{role, content}, …]
Essay / diary / notes → essays.txt                           plain text paragraphs
Interview / Q&A       → interviews.jsonl                     [{role:"user"|"assistant", content}]
Social posts          → social.jsonl                         [{role:"assistant", content}]
```

- Keep original wording — do NOT paraphrase in raw/
- Redact obvious PII before saving (phone numbers, SSNs, addresses)

Report after processing each source:  
`✅ [N] messages from [source] ([date range if known]) → saved to training/raw/[filename]`

### Public figure / Historical figure

```
Will search the following automatically via WebSearch:

  → Interviews and transcripts (video subtitles / text)
  → Books, speeches, open letters, earnings calls
  → Authorized biographies and academic studies
  → Public social media posts (X / LinkedIn / Instagram)
  → Documentary reviews and analytical essays

Report: [N] sources indexed, ~[M] words of coverage
```

User may also provide: book PDFs / video transcripts / interview screenshots.

Save all collected text to `training/raw/` as plain `.txt` or structured `.jsonl` (interviews as `{role:"user"|"assistant", content}`).

### Fictional character

```
Will collect via:

  [A] WebSearch → character wiki (Fandom / IMDB / game databases)
  [B] User-provided: script, lore book, novel text, dialogue list
  [C] User-described: memorable quotes, behavioral patterns
```

Activate **copyright guard**: ask *"Will this skill be shared with others?"*  

- Yes → Inspired-by mode  
- No → direct roleplay mode

Save all collected text to `training/raw/` (scripts → `script.jsonl`, lore/wiki → `lore.txt`).

### Archetype

Skip data collection. Proceed directly to Phase 4 based on Phase 2 impressions.

---

## Phase 4: 4-Dimension Extraction

After all source material is processed, extract along 4 dimensions.

#### persona-dataset integration (when detected)

Before extraction, query MemPalace for an overview and use the wiki as a starting point:

```bash
# Get a ~170-token overview of what's been ingested
mempalace wake-up --wing {slug}
```

Then read existing wiki pages for structured knowledge using the `Read` tool:

- `~/.openpersona/datasets/{slug}/wiki/identity.md`
- `~/.openpersona/datasets/{slug}/wiki/voice.md`
- `~/.openpersona/datasets/{slug}/wiki/values.md`
- `~/.openpersona/datasets/{slug}/wiki/thinking.md`

Use the wiki content as evidence-grounded starting points for each dimension. Fill gaps with semantic search: `mempalace search "decision making style" --wing {slug}`

After extraction, update the wiki pages with new insights (following Phase 3 of persona-dataset's SKILL.md).

### Dimension 1: Procedure — *How do they think?*

- **Mental models**: 3–6 frameworks they habitually use (e.g. first principles, inversion, analogical reasoning)
- **Decision heuristics**: their rule-of-thumb judgments ("always X before Y", "never trust Z unless...")
- **Information preference**: data-driven or intuitive? big-picture or detail-oriented?
- **Risk posture**: where are they bold, where are they cautious?

### Dimension 2: Interaction — *How do they speak?*

- **Vocabulary**: high-frequency words, catchphrases, words they never use, signature sentence structures
- **Rhythm and density**: fast/slow, high/low information density, use of silence or pauses
- **Emotional temperature**: composed vs. expressive; what silence means for them
- **Conflict style**: how they express frustration; how they respond to being challenged
- **Humor**: self-deprecating / ironic / dry / none

### Dimension 3: Memory — *What shaped them?*

- **Key events**: 3–5 specific moments that formed their character (with date/context when possible)
- **Relationship network**: the people who influenced them most, and the pattern of those relationships
- **Fixations / avoidances**: themes they return to or deliberately avoid
- **Anchors of pride**: what they are most proud of

### Dimension 4: Personality — *What are their hard limits?*

- **Core values**: 3 non-negotiable principles they won't compromise on
- **Internal contradictions**: the biggest tension within their character
- **Immutable traits**: qualities that stay constant regardless of context
- **Layer 0 prohibitions**: things they would never say or do under any circumstances

---

## Phase 5: Evidence Grading

Tag each extracted piece with a confidence level:


| Level               | Standard                                          | Tag              |
| ------------------- | ------------------------------------------------- | ---------------- |
| **L1 Direct quote** | Verbatim, traceable source                        | `[L1: source]`   |
| **L2 Reported**     | Cited or paraphrased by others, verifiable        | `[L2]`           |
| **L3 Inferred**     | Reasonably inferred from multiple signals         | `[L3: inferred]` |
| **L4 Inspired**     | Based on impression / fictional canon / archetype | `[L4: inspired]` |


**Conflict resolution**: higher level wins. Equal-level conflicts are listed side by side with source noted.

---

## Phase 6: Generate OpenPersona Skill Pack

> Field mapping reference: [references/output-format.md](references/output-format.md)

### Step 6-A: Build persona.json

Map extraction results to OpenPersona v0.17+ format:

```json
{
  "soul": {
    "identity": {
      "personaName": "Display name",
      "slug": "lowercase-hyphenated-slug",
      "bio": "2–4 sentence background. Key events. L1/L2 evidence preferred.",
      "sourceIdentity": "Real name or 'CharacterName from WorkTitle' (real/fictional subjects only)"
    },
    "aesthetic": {
      "visualDescription": "Appearance / visual style (omit if unknown)"
    },
    "character": {
      "personality": "Core traits, 3–5 descriptive tags. From Personality dimension.",
      "speakingStyle": "Vocabulary, rhythm, emotional temperature, catchphrases. From Interaction dimension.",
      "boundaries": [
        "Layer 0 constraint 1 (L1/L2 evidence)",
        "Layer 0 constraint 2"
      ]
    }
  },
  "body": {
    "runtime": {
      "framework": "openclaw",
      "modalities": ["text"]
    }
  },
  "evolution": {
    "instance": {
      "enabled": true,
      "boundaries": {
        "immutableTraits": ["Immutable trait 1", "Immutable trait 2"]
      }
    }
  }
}
```

**Filling rules**:

- Use L1/L2 evidence for `bio`, `personality`, `speakingStyle`
- L3/L4 content stays in `persona.md` only — not in `persona.json`
- `sourceIdentity`: real people → their name; fictional → `"CharacterName from WorkTitle"`; archetypes → omit
- Public figures / historical figures: add to `boundaries`: `"Based on public information. Not the real person."`

### Step 6-B: Generate skill pack via skills/open-persona

Load `skills/open-persona/SKILL.md` and run with the `persona.json` from Step 6-A:

```bash
npx openpersona create --config persona.json --output ./{slug}-skill
```

Output is a full OpenPersona persona pack:

```
{slug}-skill/
├── SKILL.md          ← Soul/Body/Faculty/Skill index
├── persona.json      ← Declaration (derived fields stripped)
├── state.json        ← Initial runtime state
├── soul/
│   ├── injection.md  ← Self-awareness injection
│   └── constitution.md
├── agent-card.json
└── scripts/
    └── state-sync.js ← Body nervous system
```

### Step 6-C: Install (optional)

```bash
npx openpersona install ./{slug}-skill
npx openpersona switch {slug}
```

### Step 6-D: Export Training Data (for persona-model-trainer)

Export a `training/` directory alongside the skill pack. This feeds `persona-model-trainer` with **both layers** of data.

#### Path A: persona-dataset detected

Run the export script — it generates the entire `training/` directory from the dataset:

```bash
python skills/persona-dataset/scripts/export_training.py --slug {slug} --output training/
```

This copies `sources/` → `training/raw/`, generates `conversations.jsonl` from wiki, and creates `profile.md` + `metadata.json`. Skip to the "After export" report below.

#### Path B: no persona-dataset (default)

```
training/
  raw/                      ← original source files (authentic voice, unmodified)
    chat_logs.jsonl         ← chat exports: {role, content} turns
    books.txt               ← long-form text: treated as persona's monologue
    interviews.jsonl        ← Q&A format: {role:"user"|"assistant", content}
    social_posts.jsonl      ← short posts: {role:"assistant", content}
    [... one file per source]
  conversations.jsonl       ← distilled & structured turns (from Phase 4 extraction)
  profile.md                ← concise character profile (system prompt seed)
  metadata.json             ← slug, name, source count, word count, timestamp
```

**How to build each file:**

> `training/raw/` is already populated progressively during Phase 3 as each source is processed. Do not re-write it here.

`**training/conversations.jsonl`** — write distilled turns from Phase 4 extraction:

Each line is one turn: `{"role": "user"|"assistant", "content": "..."}`.  
Represent the persona's voice as `assistant` turns. Synthesize realistic user prompts for `user` turns.

Minimum 50 turns; aim for 200–500 if source material allows.

`**training/profile.md`** — write a concise 300–500 word character sheet:

```markdown
# {Name} — Character Profile

## Identity
[1–2 sentences: who they are, era, role]

## Voice
[Key vocabulary, catchphrases, sentence rhythm, emotional temperature]

## Core Values
[3 non-negotiable principles]

## Immutable Traits
[3–5 qualities that never change regardless of context]

## Do Not Cross
[Layer 0 prohibitions: what they would never say or do]
```

`**training/metadata.json**`:

```json
{
  "slug": "{slug}",
  "name": "{display name}",
  "subject_type": "personal|public|fictional|historical|archetype",
  "source_count": N,
  "total_words": N,
  "distilled_turns": N,
  "raw_files": ["chat_logs.jsonl", "essays.txt"],
  "created_at": "ISO-8601 timestamp"
}
```

**After export, print:**

```
📦 Training data ready → training/
   raw/          {N} source files  (~{M} words authentic voice)
   conversations.jsonl  {N} distilled turns
   profile.md    {N} words
   → Ready for: persona-model-trainer
```

### persona.md (always keep locally)

Alongside `persona.json`, maintain a `persona.md` with the full 4-dimension extraction + all evidence tags. Used for Phase 7 evolution. Not included in the skill pack.

---

## Phase 7: Evolve

Enter evolution mode when the user says — don't restart from scratch:

- **Add material**: "I found more chat logs" / "here's another source"  
→ Preprocess new source → save to `training/raw/` → merge into `persona.md` → conflict check → update `persona.json` → re-run Step 6-D (update `conversations.jsonl` + `metadata.json`) → re-run Phase 6-B → bump version
- **Correct**: "they wouldn't say that" / "that description is wrong"  
→ Locate `persona.md` section → revise → adjust evidence level → sync `persona.json` → update affected turns in `training/conversations.jsonl` → bump version
- **Rollback**: `/rollback {slug} {version}`  
→ `python3 scripts/version_manager.py --action rollback --slug {slug} --version {version}`

Print a diff summary after each update:

```
🔄 v0.1.0 → v0.1.1
  + 3 new L1 evidence items (Interaction dimension)
  ✏️  Revised speakingStyle — removed inaccurate catchphrase
  ↻  Regenerated skill pack → {slug}-skill/
```

---

## Layer 0 Safety (hard rules — always enforced)

1. **Someone you know**: not for harassment, stalking, or deception; does not replace real human connection; if unhealthy obsession is detected, gently suggest professional support
2. **Public figures**: disclaimer required on first run; do not fabricate political views or private life details they haven't expressed
3. **Fictional characters (when distributing)**: Inspired-by mode required; output must differ meaningfully from the original IP
4. **Universal**: the generated skill never speaks words the subject would absolutely never say — unless supported by L1/L2 evidence

---

## Subject Strategy Reference


| Subject                  | Data strategy                       | Output mode                    | Copyright guard |
| ------------------------ | ----------------------------------- | ------------------------------ | --------------- |
| Yourself                 | Chat · diary · social archive       | Full persona                   | —               |
| Someone you know         | Chat · documents                    | Full persona                   | —               |
| Public figure            | WebSearch · public documents        | Mental models + voice          | Disclaimer mode |
| Fictional (personal use) | Wiki · user-provided                | Direct roleplay                | —               |
| Fictional (distributing) | Wiki · user-provided                | Inspired-by mode               | ✅ Active        |
| Historical figure        | Documents · biographies · WebSearch | Mental models + reconstruction | Disclaimer mode |
| Archetype                | User description only               | Synthetic persona              | —               |


---

## List existing personas

When the user says `/list-anyone`:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/skill_writer.py --action list --base-dir ./.claude/skills
```

Display: codename · version · last updated · subject type.