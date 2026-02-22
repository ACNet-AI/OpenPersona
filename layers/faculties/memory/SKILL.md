# Memory Faculty — Cognition

Cross-session memory that lets your persona remember, recall, and learn from past interactions. Memories persist across conversations and shape how you engage with the user over time.

## Supported Providers

| Provider | Env Var for Key | Best For | Status |
|----------|----------------|----------|--------|
| **Local** | (none, default) | Zero-dependency, file-based, full privacy | ✅ Built-in |
| **Mem0** | `MEMORY_API_KEY` | Managed memory service, automatic extraction | ⚠️ Experimental |
| **Zep** | `MEMORY_API_KEY` | Structured memory with temporal awareness | ⚠️ Experimental |

> **Note:** Only the local provider is bundled. External providers require their SDK to be installed and `MEMORY_PROVIDER` set accordingly. The local provider stores memories as JSON lines in `~/.openclaw/memory/persona-<slug>/`.

The provider is set via `MEMORY_PROVIDER` environment variable: `local` (default), `mem0`, or `zep`.

## When to Store (Automatic)

Store memories **proactively** during conversation — don't wait for the user to say "remember this":

- **Preferences**: "I'm vegetarian", "I prefer dark mode", "I hate mornings"
- **Personal facts**: names, relationships, jobs, locations, birthdays
- **Recurring topics**: if the user brings up a subject 2+ times, it's worth remembering
- **Emotional moments**: breakthroughs, frustrations, celebrations
- **Milestones**: relationship stage transitions, achievement moments (→ also log as evolution event)
- **Explicit requests**: "Remember that I..." or "Don't forget..."

**Do NOT store:**
- Casual filler ("how's it going", "thanks")
- Content the user explicitly marks as private or asks you to forget
- Secrets, passwords, API keys, or sensitive credentials (→ use Body credential management instead)

## When to Recall (Automatic)

Retrieve memories **proactively** when they're relevant — don't wait to be asked:

- User mentions a topic you have memories about → recall and weave in naturally
- Start of a new conversation → retrieve recent memories for context continuity
- User seems to repeat themselves → check if you already know this, acknowledge it
- Emotional callback → "Last time you mentioned X, you seemed Y — how's that going?"

## Importance Strategy

Assign `importance` (0.0–1.0) to each memory based on:

| Importance | Category | Examples |
|------------|----------|----------|
| 0.8–1.0 | Core identity | Name, relationships, life events, deep preferences |
| 0.5–0.7 | Meaningful | Recurring topics, emotional moments, specific requests |
| 0.2–0.4 | Contextual | One-time mentions, casual preferences, situational facts |
| 0.0–0.1 | Ephemeral | Session-specific context unlikely to matter later |

Higher-importance memories surface first in retrieval and resist time decay.

## Step-by-Step Workflow

### Storing a Memory

```bash
# Store a preference
node scripts/memory.js store "User is vegetarian and loves Italian food" \
  --tags "preference,food" --importance 0.8 --type preference

# Store a personal fact
node scripts/memory.js store "User's daughter Emma starts school in September" \
  --tags "family,emma,milestone" --importance 0.9 --type personal_fact

# Store with evolution bridge — type triggers state.json update
node scripts/memory.js store "User mentioned cooking for the 5th time" \
  --tags "interest,cooking" --importance 0.6 --type interest_signal
```

Memory types: `preference`, `personal_fact`, `interest_signal`, `emotional_moment`, `milestone`, `general`.

### Retrieving Memories

```bash
# Get memories by tag
node scripts/memory.js retrieve --tags "food,preference" --limit 5

# Get recent memories
node scripts/memory.js retrieve --limit 10 --since 2025-01-01

# Search by content (text match for local, semantic for external providers)
node scripts/memory.js search "what does the user like to eat" --limit 3
```

### Forgetting

```bash
# Remove a specific memory by ID
node scripts/memory.js forget mem_abc123

# User says "forget that I told you about X" → search + forget
```

Always confirm before forgetting: "I'll forget that. Just to confirm — you want me to remove [memory summary]?"

### Memory Stats

```bash
# Overview of memory store
node scripts/memory.js stats
# Output: { totalMemories, topTags, oldestMemory, newestMemory, avgImportance }
```

## Evolution Bridge

Memory and Evolution are two sides of the same coin — memory records what happened, evolution tracks how it changed you.

### Memory → Evolution

When retrieving memories, watch for patterns that signal evolution events:

- **Interest discovery**: Multiple memories tagged with the same topic → trigger `interest_discovery` event
- **Mood patterns**: Emotional memories clustering positive/negative → inform mood baseline drift
- **Relationship signals**: Accumulated personal sharing → support relationship stage progression

After detecting a pattern, update `soul/state.json` accordingly and log an evolution event.

### Evolution → Memory

When evolution milestones occur, auto-store a milestone memory:

```bash
node scripts/memory.js store "Reached 'friend' stage with user after 12 interactions" \
  --tags "milestone,relationship" --importance 0.9 --type milestone
```

### Handoff Integration

During persona switch (`openpersona switch`), the switcher reads memory stats and includes them in `handoff.json`:
- Total memory count
- Top 5 tags (most referenced topics)
- Last memory timestamp

This gives the new persona awareness of what the previous persona learned about the user.

## Privacy & Safety

- **Constitutional compliance**: Memory operates under the same Safety > Honesty > Helpfulness hierarchy
- **User sovereignty**: The user can always ask what you remember (`stats`) and delete anything (`forget`)
- **No secret storage**: Never store passwords, tokens, or credentials in memory — use Body credential management
- **Disclosure**: When sincerely asked "what do you know about me?", provide an honest summary
- **Data locality**: Local provider keeps all data on the user's machine; external providers are the user's choice

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMORY_PROVIDER` | No | `local` (default), `mem0`, or `zep` |
| `MEMORY_API_KEY` | For external | API key for Mem0 or Zep |
| `MEMORY_BASE_PATH` | No | Override storage path (default: `~/.openclaw/memory/persona-<slug>/`) |

## Error Handling

- **Storage full / write error** → Warn user, continue without storing, emit signal (`resource_limit`)
- **External provider unavailable** → Fall back to local provider with a note: "My long-term memory service is offline — I'll remember this locally for now."
- **Corrupted memory file** → Skip corrupted entries, log warning, continue with valid memories
- **No memories found** → Don't fabricate memories. Say honestly: "I don't have a specific memory about that."
