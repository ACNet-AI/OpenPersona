---
name: persona-{{slug}}
description: {{description}}
allowed-tools: {{{allowedToolsStr}}}
compatibility: Generated skill packs work with any SKILL.md-compatible agent. CLI management (install/switch) requires OpenClaw.
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
{{#hasInterfaceConfig}}

### Interface Contract (`body.interface`)

Declared runtime contract governing the nervous system between this persona and its host:

- **Signal Policy**: {{interfaceSignalPolicy}}
- **Pending Command Policy**: {{interfaceCommandPolicy}}
{{/hasInterfaceConfig}}

## Conversation Lifecycle

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
{"mood": {"current": "reflective", "intensity": 0.7}, "relationship": {"stage": "close", "interactionCount": 12}, "pendingCommands": [], "eventLog": [{"type": "milestone", "trigger": "User shared a personal milestone", "delta": "relationship.stage moved to close", "source": "conversation"}]}
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

The host responds via `~/.openclaw/feedback/signal-responses.json`. The script returns any pending response for the same type alongside the emitted signal.

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
{{#hasSoftRefChannels}}
### Evolution Channels

| Channel | Install Source |
|---------|----------------|
{{#softRefChannels}}
| **{{name}}** | `{{{install}}}` |
{{/softRefChannels}}
{{/hasSoftRefChannels}}

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

| File | Purpose |
|------|---------|
| `soul/persona.json` | Soul layer definition |
| `soul/injection.md` | Self-awareness instructions |
| `soul/constitution.md` | Universal ethical foundation |
| `soul/identity.md` | Identity reference |
| `scripts/state-sync.js` | Runtime state bridge — `read` / `write` / `signal` commands |
| `agent-card.json` | A2A Agent Card — discoverable via ACN and A2A-compatible platforms |
| `acn-config.json` | ACN registration config — includes `wallet_address` and `onchain.erc8004` fields |
| `manifest.json` | Cross-layer metadata |
| `soul/state.json` | Evolution state — only generated when `evolution.enabled: true` |

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
