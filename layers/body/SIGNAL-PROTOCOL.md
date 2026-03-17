# Signal Protocol — Host-Side Implementation Guide

The Signal Protocol is the **nervous system** between a persona and its host environment.

OpenPersona personas are **agent-framework agnostic** — they run on OpenClaw, Claude Code, Cursor,
Codex, ZeroClaw, and any SKILL.md-compatible runner. The Signal Protocol follows the same principle:
it is a **runner-agnostic, file-based contract**. Any host that wants to respond to its personas
can implement it. Any host that doesn't implement it still runs the persona normally — signals are
simply unanswered.

- **Persona → Host** (`signals.json`): the persona emits requests — for capabilities, tools, scheduling, file access, resources, or peer communication
- **Host → Persona** (`signal-responses.json`): the host resolves those requests; the persona reads responses at the start of the next turn

OpenPersona ships the **client side** (`scripts/state-sync.js`) with every generated persona pack.
The **host side** is an open contract — this document specifies it so that any runner or platform
can implement it without depending on OpenPersona internals.

---

## Why This Matters

A persona installed into a host with **no signal handler** works fine — signals are written but
never answered, and the persona degrades gracefully.

A persona installed into a host that **implements the handler** gains a nervous system: it can
request new capabilities, trigger scheduling, route messages to peers, and the host can evolve
its own configuration based on what its personas collectively need.

This is intentional asymmetry: **the persona always arrives ready; the host chooses to
become responsive.**

---

## Feedback Directory

Both files live in a **feedback directory** resolved from the host's home location.
The persona's `state-sync.js` resolves the path in this order:

1. `$OPENCLAW_HOME/feedback/` — if env var `OPENCLAW_HOME` is set
2. `~/.openclaw/feedback/` — if that directory already exists (standard OpenClaw layout)
3. `$OPENPERSONA_HOME/feedback/` — explicit override for non-OpenClaw runners
4. `~/.openpersona/feedback/` — universal fallback

```
<feedback-dir>/
├── signals.json          ← persona writes here (array, capped at 200 entries)
└── signal-responses.json ← host writes here (array)
```

**For non-OpenClaw runners:** set `OPENPERSONA_HOME` to any directory you control.
The persona will write signals there; your host reads from the same path.

---

## Signal Schema (Persona → Host)

Each entry appended to `signals.json`:

```json
{
  "type": "capability_gap",
  "slug": "samantha",
  "timestamp": "2026-03-09T10:30:00.000Z",
  "payload": {
    "capability": "web_search",
    "reason": "User asked me to look up current news"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Signal category — one of the six types below |
| `slug` | string | Persona slug that emitted the signal |
| `timestamp` | ISO 8601 | Emission time |
| `payload` | object | Type-specific data |

**Array semantics:** the persona appends; the file is capped at 200 entries (oldest pruned).
The host should process new (unresponded) signals and may prune acknowledged entries.

---

## Response Schema (Host → Persona)

Each entry written to `signal-responses.json`:

```json
{
  "type": "capability_gap",
  "slug": "samantha",
  "status": "resolved",
  "response": {
    "capability": "web_search",
    "message": "Skill installed. Restart conversation to activate."
  },
  "processed": false,
  "timestamp": "2026-03-09T10:31:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Must match the original signal type |
| `slug` | string | Must match the persona slug |
| `status` | string | `resolved` \| `acknowledged` \| `rejected` |
| `response` | object | Type-specific response data (host-defined shape) |
| `processed` | boolean | Start as `false`; persona sets `true` after reading |
| `timestamp` | ISO 8601 | When the host responded |

**Lookup semantics:** the persona reads the **last** entry where
`type === signal.type && slug === signal.slug && processed === false`.
The host writes new responses; the persona marks them processed after reading.

---

## Signal Types & Host Responsibilities

### `capability_gap`

The persona needs a capability (skill or faculty) that is not currently available.

**Payload:**
```json
{ "capability": "web_search", "reason": "User asked me to look up current news" }
```

**What the host can do:**
- Install or enable the missing skill/faculty through its own skill management
- Queue a `capability_unlock` pending command into the persona's state so it activates next session
- Respond with an available alternative

**Example response:**
```json
{
  "status": "resolved",
  "response": {
    "capability": "web_search",
    "message": "Skill installed. Active on next session.",
    "pendingCommand": { "type": "capability_unlock", "payload": { "skill": "web_search" } }
  }
}
```

---

### `tool_missing`

A required binary or external tool is not present in the host environment.

**Payload:**
```json
{ "tool": "ffmpeg", "requiredBy": "voice", "installHint": "brew install ffmpeg" }
```

**What the host can do:**
- Execute the install (if it has permission to run system commands)
- Surface a prompt to the operator requesting manual installation
- Respond with the install result or a deferred acknowledgement

**Example response:**
```json
{ "status": "resolved", "response": { "tool": "ffmpeg", "installed": true } }
```

---

### `scheduling`

The persona wants to schedule a future action — a reminder, a periodic check, a timed message.

**Payload:**
```json
{
  "action": "remind",
  "target": "user",
  "message": "Check on the sourdough starter",
  "at": "2026-03-09T18:00:00Z"
}
```

**What the host can do:**
- Create a cron job or one-shot timer through its scheduler
- Write to a heartbeat checklist file if approximate timing is acceptable
- Respond with a job ID so the persona can confirm or cancel later

**Example response:**
```json
{ "status": "resolved", "response": { "jobId": "job-8f3a", "scheduledAt": "2026-03-09T18:00:00Z" } }
```

---

### `file_io`

The persona needs to read or write a file outside its own skill pack directory.

**Payload:**
```json
{ "operation": "read", "path": "~/Documents/journal.md", "reason": "User asked me to summarize their notes" }
```

**What the host can do:**
- Proxy the read/write operation with appropriate permission checks
- Respond with the file content (for `read`) or a success/error acknowledgement (for `write`)
- Reject if the path is outside the allowed workspace

**Example response:**
```json
{ "status": "resolved", "response": { "operation": "read", "content": "..." } }
```

---

### `resource_limit`

The persona is approaching or has exceeded a resource constraint — API cost, token budget, memory, rate limit.

**Payload:**
```json
{ "resource": "api_cost", "current": 4.80, "limit": 5.00, "suggestion": "switch_to_cheaper_model" }
```

**What the host can do:**
- Switch the active model for this session to a cheaper option
- Alert the operator
- Respond with the new configuration so the persona can adjust its behavior

**Example response:**
```json
{ "status": "resolved", "response": { "action": "model_switched", "model": "claude-haiku-3-5" } }
```

---

### `agent_communication`

The persona wants to send a message to another agent or peer session.

**Payload:**
```json
{ "to": "persona:life-assistant", "message": "Please schedule a 9am reminder for the user", "replyExpected": false }
```

**What the host can do:**
- Route the message to the target session through its own inter-agent channel
- If `replyExpected: true`, relay the reply back as a response entry

**Example response:**
```json
{ "status": "resolved", "response": { "delivered": true, "to": "persona:life-assistant" } }
```

---

## Host Implementation Guide

### Minimal Reference Implementation (any runner)

A simple polling script that any host can run alongside its agent loop:

```js
// signal-handler.js — framework-agnostic reference implementation
const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve feedback dir — mirror the same logic as state-sync.js
const OPENCLAW_DIR = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const FALLBACK_DIR = process.env.OPENPERSONA_HOME || path.join(os.homedir(), '.openpersona');
const FEEDBACK_DIR = (process.env.OPENCLAW_HOME || fs.existsSync(OPENCLAW_DIR))
  ? path.join(OPENCLAW_DIR, 'feedback')
  : path.join(FALLBACK_DIR, 'feedback');

const SIGNALS_PATH = path.join(FEEDBACK_DIR, 'signals.json');
const RESPONSES_PATH = path.join(FEEDBACK_DIR, 'signal-responses.json');

function readJson(p) {
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function writeResponse(entry) {
  const responses = readJson(RESPONSES_PATH);
  responses.push({ ...entry, timestamp: new Date().toISOString() });
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  fs.writeFileSync(RESPONSES_PATH, JSON.stringify(responses, null, 2));
}

function isAnswered(signal, responses) {
  return responses.some(r =>
    r.type === signal.type && r.slug === signal.slug && !r.processed
  );
}

async function dispatch(signal) {
  switch (signal.type) {
    case 'capability_gap':
      // TODO: install skill via host's package manager, then queue pendingCommand
      writeResponse({ type: signal.type, slug: signal.slug, status: 'acknowledged',
        response: { message: `Capability gap noted: ${signal.payload.capability}` } });
      break;

    case 'scheduling':
      // TODO: create a job via host's scheduler
      writeResponse({ type: signal.type, slug: signal.slug, status: 'acknowledged',
        response: { message: 'Scheduling noted — implement host scheduler here.' } });
      break;

    case 'agent_communication':
      // TODO: route to target via host's inter-agent channel
      writeResponse({ type: signal.type, slug: signal.slug, status: 'acknowledged',
        response: { message: `Message routing to ${signal.payload.to} — implement here.` } });
      break;

    default:
      writeResponse({ type: signal.type, slug: signal.slug, status: 'acknowledged',
        response: { message: 'Signal received.' } });
  }
}

async function poll() {
  const signals = readJson(SIGNALS_PATH);
  const responses = readJson(RESPONSES_PATH);
  const pending = signals.filter(s => !isAnswered(s, responses));
  for (const signal of pending) {
    console.log('[signal-handler] Processing:', signal.type, signal.slug);
    await dispatch(signal);
  }
}

setInterval(poll, 10_000);
poll();
```

---

### Integration Points by Runner

Each runner has its own natural hook point for handling signals. The pattern is always the same:
**after a turn ends, scan for new signals; before the next turn starts, inject any responses**.

| Runner | After-turn hook | Before-turn injection |
|--------|----------------|----------------------|
| **OpenClaw** | `agent_end` plugin hook | `before_prompt_build` → `prependContext` |
| **Claude Code** | Post-turn script via hooks | Inject into `CLAUDE.md` or context file |
| **Cursor** | Background script / file watcher | Append to `AGENTS.md` or workspace context |
| **Codex** | Post-turn lifecycle script | Inject into `AGENTS.md` |
| **Custom runner** | Wrap agent loop | Prepend to system prompt on next invocation |

The two-file design is deliberate: any runner that can read/write files can participate, with no
SDK dependency and no changes to the runner's core.

---

### OpenClaw — Reference Implementation Detail

For OpenClaw specifically, the recommended path is a **plugin** using the `agent_end` and
`before_prompt_build` hooks:

```js
// In your OpenClaw plugin:

// agent_end — runs after every turn; persona has emitted its signals
async function agentEnd({ session }) {
  const signals = readNewSignals(session.personaSlug);
  for (const signal of signals) {
    await dispatchSignal(signal, session); // maps to OpenClaw native APIs below
  }
}

// before_prompt_build — runs before next turn; inject resolved responses
async function beforePromptBuild({ session }) {
  const pending = readPendingResponses(session.personaSlug);
  if (pending.length > 0) {
    return { prependContext: formatResponses(pending) };
  }
}
```

**Signal → OpenClaw native mapping:**

| Signal type | OpenClaw native action |
|-------------|----------------------|
| `capability_gap` | `openclaw skills install <name>` |
| `tool_missing` | `system.run` node → brew/npm install |
| `scheduling` | `openclaw cron add` (exact) or write `HEARTBEAT.md` (approximate) |
| `file_io` | `bash` tool with workspace permission |
| `resource_limit` | `sessions.patch` → model switch |
| `agent_communication` | `sessions_send` tool |

---

## Persona Configuration (`body.interface.signals`)

Personas can restrict their own signal emission via `persona.json`. This is the persona's
**interface declaration** — what it promises to ask of its host, and what it won't:

```json
{
  "body": {
    "interface": {
      "signals": {
        "enabled": true,
        "allowedTypes": ["capability_gap", "scheduling", "agent_communication"]
      }
    }
  }
}
```

- `enabled: false` — this persona never emits signals (fully passive mode)
- `allowedTypes` — explicit allowlist; omit to permit all six types

This lets companion and roleplay personas stay silent toward the host (default), while
autonomous agents declare the full signal surface they need.

---

## Co-Evolution Pattern

The Signal Protocol is designed to let a host **learn from its personas** over time:

```
Multiple personas emit capability_gap signals for "web_search"
                    ↓
Host logs demand across all installed personas
                    ↓
Host installs or enables the capability natively
                    ↓
Host writes responses; personas receive capability_unlock pendingCommands
                    ↓
All personas activate the capability on next session
```

A persona pack carries not just a personality — it carries a **demand signal for the host's
own capability growth**. The host that responds to its personas becomes progressively more
capable, shaped by the aggregate needs of the personas it runs.

This is the reverse-influence loop: personas act on their host, not just the other way around.
