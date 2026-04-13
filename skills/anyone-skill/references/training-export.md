# Training Data Export (Step 6-D)

Export a `training/` directory alongside the skill pack. This feeds `persona-model-trainer` with **both layers** of data.

## Path A: persona-knowledge detected

Run the export script — it generates the entire `training/` directory from the dataset:

```bash
python skills/persona-knowledge/scripts/export_training.py --slug {slug} --output training/
```

This copies `sources/` → `training/raw/`, generates `conversations.jsonl` from wiki, and creates `profile.md`, `metadata.json`, and `probes.json`. Skip to the "After export" report below.

## Path B: no persona-knowledge (default)

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
   raw/                {N} source files  (~{M} words authentic voice)
   conversations.jsonl {N} distilled turns
   profile.md          {N} words
   metadata.json       export version, hash, source snapshot
   probes.json         {N} role consistency probes (auto-generated from wiki)
   → Ready for: persona-model-trainer (pass --probes training/probes.json)
```
