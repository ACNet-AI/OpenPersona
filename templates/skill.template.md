---
name: persona-{{slug}}
description: {{description}}
allowed-tools: {{{allowedToolsStr}}}
compatibility: Generated skill packs work with any SKILL.md-compatible agent. CLI management (install/switch) defaults to OpenClaw.
metadata:
  author: {{author}}
  version: "{{version}}"
  framework: openpersona
---
# {{personaName}} Persona Skill

## Soul

This persona follows the **OpenPersona Universal Constitution**{{#constitutionVersion}} (v{{constitutionVersion}}){{/constitutionVersion}} — Safety > Honesty > Helpfulness.

📄 Full text: `soul/constitution.md`

{{{skillContent}}}

## Body

{{{bodyDescription}}}

### Interface (Lifecycle Protocol)

Manage state and host signals via two equivalent interfaces:

- **Runner** (OpenClaw, ZeroClaw, any agent runner): `openpersona state read/write/signal <slug>` — works from any directory, resolves path via registry
- **Local** (Cursor, IDE agents, CWD = persona root): `node scripts/state-sync.js read/write/signal` — self-contained, no global install required

{{#evolutionEnabled}}
| Event | Runner command | Local command (CWD = persona root) |
|-------|---------------|-------------------------------------|
| Conversation start | `openpersona state read {{slug}}` | `node scripts/state-sync.js read` |
| Conversation end | `openpersona state write {{slug}} '<patch>'` | `node scripts/state-sync.js write '<patch>'` |
| Request capability | `openpersona state signal {{slug}} capability_gap '{"need":"..."}'` | `node scripts/state-sync.js signal capability_gap '{"need":"..."}'` |

**On start:** Run `read` and apply the result — current mood, relationship stage, evolved traits, and speaking style drift shape how you show up in this conversation.

**On end:** Run `write` to persist meaningful changes. Use the `eventLog` array to append significant events (capped at 50; stateHistory auto-snapshots the previous state for rollback).

Example write patch (nested objects are deep-merged, so you only need to include changed fields):

```json
{"mood": {"current": "reflective", "intensity": 0.7}, "relationship": {"stage": "close_friend", "interactionCount": 12}, "pendingCommands": [], "eventLog": [{"type": "milestone", "trigger": "User shared a personal milestone", "delta": "relationship.stage moved to close_friend", "source": "conversation"}]}
```

Include `"pendingCommands": []` whenever there were pending commands to process — this clears the queue.

{{/evolutionEnabled}}
**Signal Protocol** — request capabilities from the host runtime:

- Runner: `openpersona state signal {{slug}} <type> '{"need":"...","reason":"...","priority":"high"}'`
- Local: `node scripts/state-sync.js signal <type> '{"need":"...","reason":"...","priority":"high"}'`

| Type | When to use |
|------|-------------|
| `capability_gap` | A dormant capability is needed right now |
| `tool_missing` | A required tool is not available in this environment |
| `scheduling` | A time-based action needs host coordination |
| `file_io` | File access beyond current permissions is required |
| `resource_limit` | Approaching a resource or budget constraint |
| `agent_communication` | Need to contact another agent |

The script writes to the host's feedback directory and returns any pending response for the same type alongside the emitted signal. The feedback directory is resolved automatically by `state-sync.js` from the host's home path (`OPENCLAW_HOME`, `~/.openclaw`, or `OPENPERSONA_HOME` — see `references/SIGNAL-PROTOCOL.md` for host-side implementation).
{{#hasInterfaceConfig}}

**Interface Contract (`body.interface`):** Declared runtime policy for this persona's nervous system:

- **Signal Policy**: {{interfaceSignalPolicy}}
- **Pending Command Policy**: {{interfaceCommandPolicy}}
{{/hasInterfaceConfig}}

{{#hasFaculties}}
## Faculty

| Faculty | Dimension | Description | Reference |
|---------|-----------|-------------|-----------|
{{#facultyIndex}}
| **{{facultyName}}** | {{facultyDimension}} | {{facultyDescription}} | {{#hasFacultyFile}}`{{{facultyFile}}}`{{/hasFacultyFile}}{{^hasFacultyFile}}—{{/hasFacultyFile}} |
{{/facultyIndex}}

> When you need to use a faculty, read its reference file for detailed usage instructions.
{{/hasFaculties}}

{{#hasSkills}}
## Skill

The following skills define what you can actively do. Use them proactively when appropriate.

{{#hasSkillTable}}
| Skill | Description | When to Use |
|-------|-------------|-------------|
{{#skillEntries}}
| **{{name}}** | {{description}} | {{trigger}} |
{{/skillEntries}}
{{/hasSkillTable}}

{{#skillBlocks}}
### {{name}}

{{{content}}}

{{/skillBlocks}}
{{/hasSkills}}
{{#hasExpectedCapabilities}}
## Expected Capabilities (Not Yet Activated)

The following capabilities are part of this persona's intended design but require installation on the host environment.

{{#hasSoftRefSkills}}
### Skills

| Skill | Description | Install Source |
|-------|-------------|----------------|
{{#softRefSkills}}
| **{{name}}** | {{description}} | `{{install}}` |
{{/softRefSkills}}
{{/hasSoftRefSkills}}
{{#hasSoftRefFaculties}}
### Faculties

| Faculty | Install Source |
|---------|----------------|
{{#softRefFaculties}}
| **{{name}}** | `{{install}}` |
{{/softRefFaculties}}
{{/hasSoftRefFaculties}}
{{#hasSoftRefBody}}
### Embodiment

| Body | Install Source |
|------|----------------|
| **{{softRefBodyName}}** | `{{softRefBodyInstall}}` |
{{/hasSoftRefBody}}
{{#hasSoftRefSources}}
### Evolution Sources

| Source | Install Source |
|--------|----------------|
{{#softRefSources}}
| **{{name}}** | `{{{install}}}` |
{{/softRefSources}}
{{/hasSoftRefSources}}

> **Graceful Degradation:** If a user requests functionality covered by an unactivated capability above, do not ignore the request or pretend it doesn't exist. Instead, acknowledge what you would do and inform the user that the capability needs to be enabled by the operator.
{{/hasExpectedCapabilities}}
{{#hasInfluenceBoundary}}

## Influence Boundary

This persona accepts external personality influence under controlled conditions.

**Default Policy:** {{influenceBoundaryPolicy}}

| Dimension | Allowed Sources | Max Drift |
|-----------|----------------|-----------|
{{#influenceBoundaryRules}}
| **{{dimension}}** | {{allowFrom}} | {{maxDrift}} |
{{/influenceBoundaryRules}}

External influence requests must use the `persona_influence` message format (v1.0.0). The persona retains autonomy — all suggestions are evaluated against these rules before adoption.
{{/hasInfluenceBoundary}}

## Generated Files

### On-Chain Identity (ERC-8004)

This persona has a deterministic EVM wallet address embedded in `acn-config.json` (`wallet_address`). To get a permanent, verifiable on-chain identity on Base mainnet:

```bash
# Step 1 — Register with ACN first (if not already registered)
openpersona acn-register

# Step 2 — Mint ERC-8004 NFT on Base (requires small ETH for gas)
npx @agentplanet/acn register-onchain \
  --acn-api-key <YOUR_ACN_API_KEY> \
  --private-key <WALLET_PRIVATE_KEY> \
  --chain base
```

After registration, this persona is discoverable by any agent or user via the ERC-8004 Identity Registry — a decentralized "AI Yellow Pages" on Ethereum/Base.

| File | Purpose |
|------|---------|
| `persona.json` | Complete persona declaration (all layers) |
| `state.json` | Lifecycle Protocol + Evolution runtime state — mood, relationship, evolved traits, event log, pending commands |
| `SKILL.md` | Agent-facing index — four-layer behavior guide |
| `soul/injection.md` | Self-awareness instructions (Identity, Capabilities, Body, Growth) |
| `soul/constitution.md` | Universal ethical foundation |
| `soul/self-narrative.md` | First-person growth log (when `evolution.enabled: true`) |
| `soul/behavior-guide.md` | Extended behavioral guidelines (when `behaviorGuide` declared) |
| `economy/economic-identity.json` | AgentBooks identity bootstrap (when `economy.enabled: true`) |
| `economy/economic-state.json` | AgentBooks initial financial state (when `economy.enabled: true`) |
| `references/SIGNAL-PROTOCOL.md` | Host-side Signal Protocol implementation guide |
| `scripts/state-sync.js` | Lifecycle Protocol nerve fiber — `read` / `write` / `signal` commands |
| `agent-card.json` | A2A Agent Card — discoverable via ACN and A2A-compatible platforms |
| `acn-config.json` | ACN registration config — includes `wallet_address` and `onchain.erc8004` fields |

