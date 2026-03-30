# Body Layer — Declaration Spec

The Body is the substrate of existence — the complete environment that makes a persona possible. It is declared in `persona.json` under the `body` field.

> **Body is never null.** Every digital agent has a virtual body (runtime dimension only). "Digital-only" is not the absence of a body — it is a runtime-only body with no physical form.

---

## Declaration Format

```json
{
  "body": {
    "runtime": {
      "framework": "openclaw",
      "host": "clawi",
      "models": ["claude", "chatgpt"],
      "channels": ["whatsapp", "telegram"],
      "credentials": [
        { "scope": "elevenlabs", "envVar": "TTS_API_KEY", "shared": false },
        { "scope": "openai", "envVar": "OPENAI_API_KEY", "shared": true }
      ],
      "resources": ["filesystem", "network"]
    },
    "appearance": {
      "avatar": "./assets/avatar/avatar.png",
      "model3d": "./assets/avatar/model.vrm",
      "style": "anime"
    },
    "interface": {
      "signals": {
        "enabled": true,
        "allowedTypes": ["tool_missing", "capability_gap", "resource_limit"]
      },
      "pendingCommands": {
        "enabled": true,
        "allowedTypes": ["capability_unlock", "trait_nudge", "context_inject"]
      }
    }
  }
}
```

---

## Four Dimensions

### 1. `runtime` — Required (minimum viable body)

Every digital agent must have a runtime. If `body` is omitted from `persona.json`, the generator treats the persona as having a default digital runtime.

| Field | Required | Description |
|-------|----------|-------------|
| `framework` | Recommended | Agent runner framework (e.g. `openclaw`, `zeroclaw`, `cursor`, `codex`, `any`). Replaces deprecated `platform` |
| `host` | No | Deployment platform (e.g. `clawi`, `self-hosted`, `cloud`, `local`, `desktop`) |
| `models` | No | AI models this persona is intended to use (e.g. `["claude", "chatgpt", "gemini"]`) |
| `modalities` | No | Digital I/O modalities the runtime supports. Mixed array of strings or objects. See below |
| `compatibility` | No | Other frameworks the persona can run on (e.g. `["zeroclaw", "cursor"]`) |
| `channels` | No | Communication channels available (e.g. `["whatsapp", "telegram", "slack"]`) |
| `credentials` | No | Credential declarations — not the secrets themselves, but what the persona requires. See below |
| `resources` | No | System resources available (e.g. `["filesystem", "network", "browser", "cron"]`) |

#### `runtime.modalities`

Declares which digital I/O modalities the runtime supports. Each entry is a shorthand string or a structured object with a technology provider declaration. The `type` field is an **open string — not a closed enum** — custom values beyond the known set are allowed.

```json
"modalities": [
  "text",
  { "type": "voice", "provider": "elevenlabs", "inputProvider": "whisper" },
  { "type": "vision", "provider": "claude-vision" },
  "document",
  "location"
]
```

**Object entry fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Modality type (open string). Known values listed below |
| `provider` | No | Primary technology provider (output/perception direction) |
| `inputProvider` | No | Input-direction provider when different from output (mainly voice STT) |
| `outputProvider` | No | Output-direction provider when declared separately |
| `direction` | No | `"input"` \| `"output"` \| `"both"` (default: `"both"`) |
| `config` | No | Provider-specific configuration object |

**Known `type` values (open set — custom values supported):**

| Type | Description | Generator behavior |
|------|-------------|-------------------|
| `text` | Text I/O — always baseline, usually omitted | No injection |
| `voice` | TTS output + STT input via software services | **Auto-injects `voice` faculty** if not already declared; injects voice self-awareness |
| `vision` | Image/video understanding via AI model | **Auto-injects `vision` faculty** if not already declared; injects vision self-awareness |
| `document` | PDF / Office structured document parsing | Injects document self-awareness |
| `location` | Geolocation via OS/API | Injects location self-awareness |
| `emotion` | Affective sensing via software API | Injects emotion self-awareness |
| `sensor` | Digital API sensor data (health, weather, etc.) | Injects sensor self-awareness |
| *(custom)* | Any other string | Injects generic "supports [type] modality" awareness |

**Dimension boundary — what does NOT belong here:**

| Capability | Correct location | Reason |
|------------|-----------------|--------|
| `motion` (physical) | `body.physical.capabilities` | Hardware actuators — already covered |
| `haptic` (physical) | `body.physical.capabilities` | Hardware touch — already covered |
| Hardware sensors (temp, gyro) | `body.physical.capabilities` | Embedded hardware — already covered |
| Avatar/3D visual display | `body.appearance` + `avatar` faculty | Visual assets, not I/O modality |

**Common provider values:**

| Modality | Provider examples |
|---------|------------------|
| `voice` (TTS) | `elevenlabs`, `openai-tts`, `qwen3-tts` |
| `voice` (STT via `inputProvider`) | `whisper`, `openai-stt`, `deepgram` |
| `vision` | `claude-vision`, `gpt-4v`, `gemini-vision` |
| `document` | `pdf-parse`, `markitdown`, `docling`, `llama-parse` |
| `location` | `gps`, `ip-geolocation`, `w3c-geolocation` |

**Generated behavior:** When `modalities` is declared, the generator:
1. Auto-injects `voice` faculty if `voice` type is present and not already declared
2. Auto-injects `vision` faculty if `vision` type is present and not already declared
3. Derives boolean flags (`hasVoiceModality`, `hasVisionModality`, etc.) used in `soul/injection.md` template
3. Injects a "Modality Awareness" section into `soul/injection.md` describing each supported I/O channel

#### `runtime.credentials`

Each credential is a declaration of a required secret, not the secret itself. Secrets are stored in the host's credential directory.

```json
{
  "scope": "elevenlabs",
  "envVar": "TTS_API_KEY",
  "shared": false,
  "description": "ElevenLabs API key for voice synthesis"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `scope` | Yes | Scope identifier (e.g. `elevenlabs`, `openai`, `github`). Used for directory namespacing |
| `envVar` | Yes | Expected environment variable name (e.g. `TTS_API_KEY`) |
| `shared` | No | If `true`, credential is shared across all personas (stored in `credentials/shared`). Default: `false` (persona-private) |
| `description` | No | Human-readable description of what this credential is for |

**Generated behavior:** When `credentials` are declared, the generator injects credential management guidance into `soul/injection.md` — where to find the credential file, how to handle missing secrets, and whether to prompt for shared or private storage.

---

### 2. `appearance` — Optional

Visual identity assets. For conceptual aesthetic descriptions (color palette, visual style preferences), use `soul.aesthetic` instead.

| Field | Description |
|-------|-------------|
| `avatar` | Path or URL to a 2D avatar image. Use `./assets/avatar/...` for bundled files |
| `model3d` | Path or URL to a 3D model (`.vrm`, `.model3.json`, `.glb`). For XR/metaverse/avatar faculty |
| `style` | Visual style label (e.g. `anime`, `photorealistic`, `pixel-art`, `3d-cartoon`) |

**Generated pack:** Files referenced by `avatar` and `model3d` are copied to `assets/avatar/` in the pack. These assets are owned by **Body > Appearance** — distinct from `assets/reference/` which is owned by the Selfie Skill (AI image generation reference images).

---

### 3. `interface` — Optional

The static policy declaration for the persona's nervous system — the Lifecycle Protocol's runtime contract with its host. Declared here; implemented by `scripts/state-sync.js`.

> `body.interface` is a *declaration* of what is permitted. Lifecycle Protocol is the *runtime expression* of that declaration. If `interface` is not declared, all signal types and command types are permitted (open policy).

#### `interface.signals`

Controls which signal types the persona is allowed to emit to its host.

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | If `false`, the Signal Protocol channel is disabled entirely — no signals will be emitted |
| `allowedTypes` | *(all)* | Whitelist of permitted signal types. If omitted, all types are allowed |

Valid signal types: `scheduling`, `file_io`, `tool_missing`, `capability_gap`, `resource_limit`, `agent_communication`

#### `interface.pendingCommands`

Controls which host-to-persona command types the persona will process from the `pendingCommands` queue in `state.json`.

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | If `false`, the persona ignores `pendingCommands` entirely |
| `allowedTypes` | *(all)* | Whitelist of permitted command types. If omitted, all types are allowed |

Reserved command types: `capability_unlock`, `context_inject`, `trait_nudge`, `relationship_update`, `system_message`. Custom types are supported.

---

### 4. `physical` — Optional (robots / IoT only)

For personas with a physical embodiment. Omit for all digital-only agents.

| Field | Description |
|-------|-------------|
| `name` | Unique identifier for the physical body (e.g. `"ros2-arm-v2"`) |
| `description` | Human-readable description of the hardware |
| `capabilities` | Array of hardware capability strings (e.g. `["arm-motion", "camera", "speaker"]`) |
| `install` | External driver/package install reference (marks physical body as a soft-ref) |
| `hardwareRef.platform` | Hardware platform (e.g. `"ros2"`, `"arduino"`) |
| `hardwareRef.package` | Driver or package reference |

---

## Soft-Ref Body

A body package with an `install` field at the `body` root level is a soft-ref — the generator classifies the body as not locally available:

```json
{
  "body": {
    "install": "clawhub:robot-arm-body",
    "runtime": { "framework": "ros2" }
  }
}
```

The generator injects dormant body awareness into `soul/injection.md` with graceful degradation guidance, and lists the body package under "Expected Capabilities" in `SKILL.md`.

---

## Dimension Responsibilities

| Dimension | Owns | Distinct from |
|-----------|------|---------------|
| `runtime` | Framework, channels, credentials, resources — *how the persona is deployed and connected* | `social` (network identity, ACN registration) |
| `appearance` | Visual asset files (avatar image, 3D model) | `soul.aesthetic` (personality-driven visual preferences) |
| `interface` | Signal and pending command **policy** | Lifecycle Protocol (runtime *implementation* of this policy) |
| `physical` | Hardware substrate for embodied agents | `runtime` (the digital runtime that coexists with physical bodies) |

---

## Generated Pack Impact

| `body` field | Generated pack output |
|---|---|
| `runtime.framework` | Injected into `soul/injection.md` "Your Current Body" section |
| `runtime.channels` | Injected into `soul/injection.md` "Your Current Body" section |
| `runtime.credentials` | Injected into `soul/injection.md` "Credential Management" section |
| `runtime.resources` | Injected into `soul/injection.md` "Your Current Body" section |
| `appearance.avatar` | File copied to `assets/avatar/`; path written to `persona.json` |
| `appearance.model3d` | File copied to `assets/avatar/`; path written to `persona.json` |
| `interface.signals` | Injected into `soul/injection.md` "Your Interface Contract" section; enforced at Runtime Gate in `scripts/state-sync.js` |
| `interface.pendingCommands` | Injected into `soul/injection.md` "Your Interface Contract" section; enforced at Runtime Gate in `scripts/state-sync.js` |
| `physical` | Referenced in `soul/injection.md`; if `install` present, injected as soft-ref dormant capability |

---

## Deprecated Fields

| Deprecated | Replacement | Notes |
|---|---|---|
| `body.runtime.platform` | `body.runtime.framework` | Still accepted by generator for backward compat; stripped from output |
| `body.runtime.acn_gateway` | `social.acn.gateway` | Moved to `social` cross-cutting concept |
