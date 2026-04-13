---
name: persona-knowledge
description: "Persistent, incremental, searchable persona knowledge base. Ingests data from Obsidian vaults, chat exports, X/Twitter archives, and more into a MemPalace-backed store with a Karpathy LLM Wiki knowledge layer. Exports training/ directories for persona-model-trainer."
license: MIT
compatibility: "Designed for Claude Code, Cursor, or OpenClaw. Requires Python 3.11+ and mempalace >= 3.1.0."
allowed-tools: Read Write Bash WebSearch
metadata:
  version: "0.2.0"
  author: acnlabs
  requires: "python >= 3.11, mempalace >= 3.1.0 (pip install mempalace)"
  optional: "anyone-skill (distillation integration), persona-model-trainer (consumes training/ export)"
---

# persona-knowledge

Persistent, incremental, searchable persona knowledge base — the **data layer** between raw sources and persona training.

**Architecture**: MemPalace (storage + search) + Knowledge Graph (relationships + timeline) + Karpathy LLM Wiki (knowledge accumulation)

**Dependency chain**: `data sources` → `persona-knowledge` → `anyone-skill` / `persona-model-trainer`

---

## When to use this skill

Trigger phrases:

- "create a dataset for this persona"
- "add data to the dataset"
- "import my Obsidian vault"
- "import my Twitter archive"
- "build a knowledge base for X"
- "export training data"
- "search the persona dataset"

**Not suitable when:**

- User wants a quick one-shot distillation without persistent storage (use anyone-skill alone)
- User only has < 50 messages of data (too little to warrant a dataset)

---

## Phase 1: Init

Create a new persona dataset:

```bash
python scripts/init_dataset.py --slug {slug} --name "Display Name"
```

This creates `~/.openpersona/datasets/{slug}/` with:

```
~/.openpersona/datasets/{slug}/
  dataset.json                 # metadata: slug, name, created_at, stats
  .mempalace/                  # MemPalace local data (per-dataset isolation via palace_path)
    palace/                    # MemPalace internal store (ChromaDB + KG)
  sources/                     # immutable source file backups
    .source-index.json         # per-file metadata: hash, import time, line count, PII flags
  wiki/                        # Karpathy wiki (LLM-maintained derived artifact)
    _schema.md                 # wiki maintenance rules
    identity.md
    voice.md
    values.md
    thinking.md
    relationships.md           # generated from Knowledge Graph
    timeline.md                # generated from Knowledge Graph
    _contradictions.md
    _changelog.md
    _evidence.md
```

MemPalace palace structure:
- One Wing per persona (named by slug)
- Halls mapped to 5 persona dimensions:
  - `hall_facts` — Identity (background, career, education)
  - `hall_events` — Memory (key events, turning points)
  - `hall_preferences` — Personality (values, preferences, boundaries)
  - `hall_discoveries` — Procedure (mental models, decision heuristics)
  - `hall_voice` — Interaction (vocabulary, rhythm, humor, emotional temperature)

**Gate**: Confirm slug and display name with the user before proceeding.

---

## Phase 2: Ingest

Import data sources into the dataset. Can be called multiple times for incremental ingestion.

```bash
python scripts/ingest.py --slug {slug} --source <path> [--adapter <name>] [--since <date>]
```

**Three adapters** cover all supported formats:

| Source | Adapter | Detection |
|--------|---------|-----------|
| Obsidian vault | `universal` | Directory containing `.obsidian/` or `*.md` files |
| GBrain export dir | `universal` | Markdown directory with `.raw/` sidecar dirs |
| `.md` / `.txt` / `.csv` / `.pdf` | `universal` | File extension |
| `.jsonl` / `.json` | `universal` | File extension |
| GBrain JSON export | `universal` | `.json` with `memories` key or `--entity` flag |
| WhatsApp `.txt` export | `chat_export` | Matches WhatsApp timestamp pattern |
| Telegram `result.json` | `chat_export` | JSON with `chats` key |
| Signal export | `chat_export` | JSON with Signal message format |
| iMessage `.db` | `chat_export` | SQLite with `message` + `handle` tables |
| X (Twitter) archive | `social` | Directory containing `data/tweets.js` |
| Instagram archive | `social` | Directory containing `content/posts_1.json` |


**Ingest pipeline** (per source):

1. **Parse** — adapter converts source to unified `[{role, content, timestamp, source_file, source_type}]`
2. **PII scan** — flag SSN, credit card, email, password patterns
3. **Hash dedup** — SHA-256 content hash, skip already-ingested entries
4. **Write sources/** — save parsed data as JSONL backup (immutable, one file per source)
5. **Store in MemPalace** — verbatim text into ChromaDB via palace wing/hall structure
6. **Extract KG triples** — detect entities and relationships, write to Knowledge Graph with temporal validity
7. **Report** — print source name, message count, assistant turns, PII flags, new KG entities

After each source is ingested, report:

```
✅ whatsapp-2024.txt → 1,247 messages (892 assistant turns)
   PII: none detected
   KG: +3 entities, +7 relationships
   → sources/whatsapp-2024.jsonl
```

---

## Phase 3: Wiki Build (agent task — not a script)

After ingesting new data, the agent reads MemPalace content and Knowledge Graph relationships, then builds or updates the wiki pages following the Karpathy LLM Wiki pattern.

> This phase is driven by agent intelligence (SKILL.md instructions), not by automated scripts. The LLM decides which pages to update, how to phrase entries, and how to tag evidence.

### Ingest operation (after each Phase 2 run)

1. Read new data from MemPalace (search the wing for recently added entries)
2. For each relevant wiki page, check if the new data adds, contradicts, or refines existing content
3. Update 5-15 wiki pages with new information, using evidence tags:
   - `[L1:source]` — direct quote, traceable
   - `[L2]` — reported/paraphrased, verifiable
   - `[L3:inferred]` — reasonably inferred from multiple signals
   - `[L4:inspired]` — impression-based
4. Add backlinks between related pages using `[[page]]` wikilink syntax
5. Record contradictions in `_contradictions.md` with both sides cited
6. Append entry to `_changelog.md`
7. Update counts in `_evidence.md`

### Query operation

When the user asks a question about the persona:

1. Search MemPalace semantically for relevant memories
2. Navigate wiki pages for structured knowledge
3. Synthesize an answer
4. If the query reveals new insights, write them back to the appropriate wiki page

### Lint operation

Run periodically or before export:

```bash
python scripts/lint_wiki.py --slug {slug}
```

Checks:
- Broken `[[links]]` (referenced page doesn't exist)
- Empty pages (created but never populated)
- Contradictions without resolution notes
- Evidence coverage (pages with < 2 evidence tags)
- Source coverage (MemPalace entries not reflected in any wiki page)

### Wiki page structure (see `references/wiki-schema.md` for full spec)

Each page follows this template:

```markdown
# {Page Title}

> One-sentence summary of this page's scope.

## Content

{Structured content with [L?:source] evidence tags and [[backlinks]]}

## Sources

- {source_file}: {what was extracted} [L?]

## See also

- [[related_page]]
```

### Knowledge Graph–driven pages

`relationships.md` and `timeline.md` are generated from the Knowledge Graph, not written freehand:

```python
from mempalace.knowledge_graph import KnowledgeGraph
kg = KnowledgeGraph(palace_path)
kg.timeline(slug)           # → chronological event list for timeline.md
kg.query_entity(slug)       # → current relationships for relationships.md
```

After generating, the agent may annotate with evidence tags and additional context.

---

## Phase 4: Export

Generate a `training/` directory compatible with persona-model-trainer:

```bash
python scripts/export_training.py --slug {slug} --output training/
```

Each export is automatically versioned (`v1`, `v2`, …). Override with `--version`:

```bash
python scripts/export_training.py --slug {slug} --output training/ --version v3
```

List export history:

```bash
python scripts/export_training.py --slug {slug} --list
# v1  2026-04-01 10:00  142 turns  sha256:a3f9c2d1  3 sources
# v2  2026-04-10 14:22  198 turns  sha256:c7d2e1f3  4 sources
```

Output:

```
training/
  raw/                      # copied from sources/ (authentic voice, unmodified)
  conversations.jsonl       # generated from wiki pages (structured Q-A pairs)
  profile.md                # summarized from wiki identity/voice/values
  metadata.json             # slug, source count, turn count, export version + hash
```

**How each file is built:**

- `training/raw/` — direct copy of `sources/*.jsonl` and `sources/*.txt` files
- `training/conversations.jsonl` — the agent reads wiki pages and generates distilled user/assistant turn pairs representing the persona's voice, knowledge, and values
- `training/profile.md` — 300-500 word character sheet derived from `identity.md`, `voice.md`, `values.md`
- `training/metadata.json` — `slug`, `name`, `subject_type`, `created_at`, `source_count`, `total_words`, `distilled_turns`, `raw_files` + versioning fields:
  - `export_version` — version tag (e.g. `"v2"`)
  - `export_hash` — SHA-256 of `conversations.jsonl` (e.g. `"sha256:c7d2e1f3..."`)
  - `source_snapshot` — `{filename: sha256_hash}` dict of all source files at export time

Export history is appended to `dataset.json` → `export_history[]` after each run.

**Downstream traceability:** `persona-model-trainer`'s `pipeline.sh` reads `export_version` and `export_hash` from `metadata.json` and injects them as `dataset_version` / `dataset_export_hash` into `training_summary.json`, forming a complete provenance chain from source data to trained model adapter.

This output is directly consumable by `persona-model-trainer`'s `prepare_data.py` — no changes needed downstream.

**→ Next step — train a local persona model:**

```bash
bash skills/persona-model-trainer/scripts/pipeline.sh \
  --slug {slug} \
  --model google/gemma-4-E4B-it \
  --source ./training \
  --method mlx \       # or: unsloth (NVIDIA GPU) / colab (no GPU)
  --preset gemma4 \
  --probes ./training/probes.json
```

> Full guide: [`persona-model-trainer/references/pipeline-guide.md`](../persona-model-trainer/references/pipeline-guide.md)

---

## Phase 5: Search

Query the dataset using MemPalace's semantic search and Knowledge Graph:

```bash
# Semantic search across all stored memories
mempalace search "how does this person handle conflict" --wing {slug}

# Knowledge Graph: look up an entity's relationships
python scripts/query_kg.py --slug {slug} --entity "Tom"

# Knowledge Graph: shortest path between two entities
python scripts/query_kg.py --slug {slug} --path "Tom" "Alice"

# Knowledge Graph: overall statistics
python scripts/query_kg.py --slug {slug} --stats

# Knowledge Graph: JSON output (for programmatic use)
python scripts/query_kg.py --slug {slug} --entity "Tom" --json

# Wake-up summary (~170 tokens)
mempalace wake-up --wing {slug}
```

The agent can also search programmatically during wiki build or distillation:

```python
from mempalace.searcher import search_memories
results = search_memories("vocabulary patterns", palace_path="~/.openpersona/datasets/{slug}/.mempalace/palace")
```

---

## Phase 6: Maintain

Ongoing dataset management:

- **Add new source**: run Phase 2 (Ingest) again with new files → triggers wiki update
- **Remove source**: delete from `sources/` + re-index → run wiki lint to flag orphaned content
- **Wiki lint**: `python scripts/lint_wiki.py --slug {slug}` — health check
- **Dataset stats**: `python scripts/init_dataset.py --slug {slug} --stats` — show current stats
- **List datasets**: `ls ~/.openpersona/datasets/` — all available datasets

---

## Tools

| Tool | Purpose |
|------|---------|
| `Bash` | Run init, ingest, export, lint scripts; MemPalace CLI commands |
| `Read` | Load source files, wiki pages, dataset.json |
| `Write` | Update wiki pages, write training exports |
| `WebSearch` | Fetch public figure data for ingestion |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/init_dataset.py` | Initialize dataset directory + MemPalace wing + KG |
| `scripts/ingest.py` | Unified ingestion: adapter dispatch + PII scan + dedup + MemPalace + KG |
| `scripts/export_training.py` | Export sources/ + wiki → training/ directory |
| `scripts/lint_wiki.py` | Wiki health check: broken links, contradictions, coverage gaps |
| `scripts/query_kg.py` | Knowledge Graph query: entity lookup, shortest path, statistics |

## Adapters

| Adapter | Sources | Format |
|---------|---------|--------|
| `universal` | Obsidian vault, GBrain export, .md, .txt, .csv, .pdf, .jsonl, .json | All pure file reading |
| `chat_export` | WhatsApp / Telegram / Signal / iMessage | .txt / JSON / SQLite (special parsing) |
| `social` | X (Twitter) / Instagram archive | JS wrapper stripping + archive dirs |

---

## References

- `references/wiki-schema.md` — Karpathy wiki structure specification and maintenance rules
- `references/source-formats.md` — supported data source formats and adapter details
