# Source Formats

> Supported data source formats and adapter details for persona-knowledge.

## Adapter overview

Three adapters cover all supported source formats:

| Adapter | Module | Auto-detected by |
|---------|--------|------------------|
| Universal | `adapters/universal.py` | File extension, directory structure |
| Chat export | `adapters/chat_export.py` | File pattern / JSON schema / SQLite |
| Social | `adapters/social.py` | Archive directory structure |

## Universal adapter

Handles all pure file reading — markdown directories, text, CSV, PDF, JSON, JSONL.

### Obsidian vault

**Format**: Obsidian vault directory

```
vault/
  .obsidian/         ← config (confirms this is an Obsidian vault)
  daily/
    2024-01-15.md
  notes/
    topic.md
```

**Detection**: Directory containing `.obsidian/` subdirectory, or a directory of `.md` files.

**Parsing**: Reads all `.md` files, extracts YAML frontmatter (tags, created date), strips `[[wikilinks]]` for content, preserves full text. Respects `.gitignore` and `.obsidianignore` if present.

**Filtering**: `--since` flag filters by frontmatter `date`/`created` field or file modification time.

### GBrain export directory

**Format**: Output of `gbrain export --dir ./export/`

```
export/
  people/
    john.md           ← markdown page with frontmatter
    .raw/
      john.json       ← raw data sidecar
  companies/
    acme.md
    .raw/
      acme.json
```

**Detection**: Directory containing `.raw/` sidecar subdirectories alongside markdown files.

**Parsing**: Reads all `.md` files (same as Obsidian), automatically associates `.raw/*.json` sidecar data as metadata. Source type is set to `gbrain-export`.

### GBrain JSON export

**Format**: JSON file with `memories` key or array of memory objects

```json
{"memories": [{"content": "...", "timestamp": "...", "tags": [...]}]}
```

**Usage**: `--adapter universal --entity "Person Name"` or auto-detected from `memories` key.

**Parsing**: Extracts content from flexible field names (`content`, `text`, `message`, `body`, `memory`). All entries are marked as `assistant` role.

### Markdown (.md)

Single markdown file with optional YAML frontmatter. Stripped of wikilinks. Source type: `markdown`.

### Plaintext (.txt)

Full text split into paragraphs by double newline. Each paragraph (≥ 20 chars) becomes one entry.

### CSV (.csv)

Auto-detects speaker/content columns by name (`speaker`/`sender`/`from`, `content`/`text`/`message`). Each row becomes one message. Role detection uses `--persona-name` to identify assistant turns.

### PDF (.pdf)

Text extraction via `pdfplumber` (preferred) or `PyPDF2`. Requires: `pip install pdfplumber`.

### JSONL (.jsonl)

One JSON object per line. Supports flexible field naming:
- Role: `role`, `speaker`, `from`, `sender`, `author`
- Content: `content`, `text`, `message`, `body`, `value`
- Timestamp: `timestamp`, `date`, `time`, `datetime`, `created_at`, `ts`

### JSON (.json)

JSON array of objects (same field conventions as JSONL) or single object wrapped in array.

## Chat export adapter

Handles formats that require special timestamp parsing or binary database reading.

### WhatsApp

**Format**: `.txt` file exported from WhatsApp

```
1/15/24, 9:41 AM - John: Hey, how are you?
1/15/24, 9:42 AM - Jane: I'm doing great, thanks!
```

**Detection**: Lines matching `\d+/\d+/\d+, \d+:\d+ [AP]M - .+: .+`

**Parsing**: Splits on timestamp pattern, extracts sender and message. Multi-line messages are concatenated.

### Telegram

**Format**: `result.json` exported from Telegram Desktop

```json
{
  "chats": {
    "list": [{
      "name": "Contact Name",
      "messages": [
        {"from": "John", "text": "Hello", "date": "2024-01-15T09:41:00"}
      ]
    }]
  }
}
```

**Detection**: JSON with top-level `chats` key containing `list` array.

### Signal

**Format**: JSON export from Signal Desktop (via signal-export tool)

```json
[
  {"sender": "John", "body": "Hello", "timestamp": 1705305660000}
]
```

**Detection**: JSON array with objects containing `sender` and `body` keys.

### iMessage

**Format**: SQLite database at `~/Library/Messages/chat.db`

**Detection**: SQLite file with `message` and `handle` tables.

**Parsing**: The `chat_export` adapter reads the SQLite database directly using Python's built-in `sqlite3` module — no external preprocessing needed.

**Note**: macOS may require Full Disk Access permission.

## Social adapter

Handles social media archives that use JavaScript wrappers or special directory structures.

### X / Twitter

**Format**: Twitter archive download (Settings → Your Account → Download an archive)

```
twitter-archive/
  data/
    tweets.js        ← main tweets file
    like.js          ← liked tweets (optional)
    direct-messages.js ← DMs (optional)
```

**Detection**: Directory containing `data/tweets.js`.

**Parsing**: Strips JavaScript wrapper (`window.YTD.tweets.part0 = `), parses JSON array. Extracts `full_text`, `created_at`, filters for original tweets and replies (excludes pure retweets unless quote-tweeted).

### Instagram

**Format**: Instagram data download (Settings → Your activity → Download your information → JSON format)

```
instagram-archive/
  content/
    posts_1.json     ← posts
  messages/
    inbox/           ← DM conversations
```

**Detection**: Directory containing `content/posts_1.json`.

**Parsing**: Extracts post captions and comment texts.

## Unified output format

All adapters produce the same internal format:

```python
{
    "role": "user" | "assistant",  # speaker role (target persona = assistant)
    "content": str,                 # message text
    "timestamp": str | None,        # ISO 8601 or None
    "source_file": str,             # original file path
    "source_type": str,             # adapter name
    "metadata": {}                  # adapter-specific extra fields
}
```

The `role` assignment:
- Messages **from** the target persona → `"assistant"`
- Messages **to** the target persona → `"user"`
- Monologue / essays / posts → `"assistant"` (the persona speaking)

## Interop with anyone-skill preprocess.py

`anyone-skill/scripts/preprocess.py` outputs a different schema (`{time, sender, content, platform}`) designed for direct agent reading, not for persona-knowledge ingestion. When feeding preprocess.py output into persona-knowledge, the `universal` adapter handles the mapping automatically:

| preprocess.py field | persona-knowledge field | Mapping |
|---|---|---|
| `sender` | `role` | Matched against `--persona-name`; persona → `assistant`, others → `user` |
| `content` | `content` | Direct |
| `time` | `timestamp` | Direct (ISO 8601 compatible) |
| `platform` | `source_type` | Mapped to adapter-specific type |

To ingest preprocess.py output: save as `.json` and pass to `ingest.py --adapter universal`.
