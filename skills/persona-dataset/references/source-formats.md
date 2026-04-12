# Source Formats

> Supported data source formats and adapter details for persona-dataset.

## Adapter overview

| Adapter | Module | Auto-detected by |
|---------|--------|------------------|
| Obsidian | `adapters/obsidian.py` | `.obsidian/` dir or `*.md` in directory |
| Chat export | `adapters/chat_export.py` | File pattern / JSON schema |
| Social | `adapters/social.py` | Archive directory structure |
| Plaintext | `adapters/plaintext.py` | `.txt` / `.csv` / `.pdf` extension |
| JSONL | `adapters/jsonl.py` | `.jsonl` / `.json` with `{role, content}` |
| GBrain | `adapters/gbrain.py` | Explicit `--adapter gbrain` flag |

## WhatsApp (chat_export)

**Format**: `.txt` file exported from WhatsApp

```
1/15/24, 9:41 AM - John: Hey, how are you?
1/15/24, 9:42 AM - Jane: I'm doing great, thanks!
```

**Detection**: Lines matching `\d+/\d+/\d+, \d+:\d+ [AP]M - .+: .+`

**Parsing**: Splits on timestamp pattern, extracts sender and message. Multi-line messages are concatenated.

## Telegram (chat_export)

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

## Signal (chat_export)

**Format**: JSON export from Signal Desktop (via signal-export tool)

```json
[
  {"sender": "John", "body": "Hello", "timestamp": 1705305660000}
]
```

**Detection**: JSON array with objects containing `sender` and `body` keys.

## iMessage (chat_export)

**Format**: SQLite database at `~/Library/Messages/chat.db`

**Detection**: SQLite file with `message` and `handle` tables.

**Parsing**: The `chat_export` adapter reads the SQLite database directly using Python's built-in `sqlite3` module — no external preprocessing needed.

**Note**: macOS may require Full Disk Access permission.

## X / Twitter (social)

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

## Instagram (social)

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

## Obsidian (obsidian)

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

## Plaintext (plaintext)

| Extension | Parsing |
|-----------|---------|
| `.txt` | Full text, paragraphs split by double newline |
| `.csv` | Auto-detect speaker/content columns, each row → message |
| `.pdf` | Text extraction (requires `pdfplumber` or `PyPDF2`) |

## JSONL / JSON (jsonl)

**Format**: One JSON object per line (JSONL) or JSON array

```jsonl
{"role": "user", "content": "What do you think about..."}
{"role": "assistant", "content": "I believe that..."}
```

**Detection**: File with `.jsonl` extension, or `.json` containing array of `{role, content}` objects.

**Alternate fields**: Also accepts `sender`/`text`, `from`/`message`, `speaker`/`body`.

## GBrain (gbrain)

**Format**: MCP tool calls to a running GBrain server

**Requires**: GBrain MCP server configured and running.

**Usage**: `--adapter gbrain --entity "Person Name"`

**Behavior**: Queries GBrain's memory store for all entries related to the entity, converts to unified message format.

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
