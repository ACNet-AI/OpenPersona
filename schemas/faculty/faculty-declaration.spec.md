# Faculty Layer — Declaration Spec

Faculties are declared in `persona.json` under the `faculties` array. Each faculty is a persistent capability that changes the persona's nature — always active once declared.

> **Faculty vs. Skill:** A faculty changes what the persona *is* (voice → how it speaks; memory → what it remembers). A skill defines what the persona *can do* on demand. If disabling the capability would make the persona fundamentally different, it is a faculty.

> **`economy` is not a faculty.** Activate it via the top-level `economy: { enabled: true }` field. The legacy `"faculties": ["economy"]` syntax is accepted for backward compatibility but is deprecated.

---

## Faculty Declaration Format

Each faculty entry in `persona.json` is an object with a required `name`:

```json
{
  "faculties": [
    { "name": "voice" },
    { "name": "selfie" },
    { "name": "memory", "memoryProvider": "local" },
    { "name": "avatar", "install": "clawhub:avatar-runtime" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Faculty identifier. Must match a local definition in `layers/faculties/{name}/` or declare `install` |
| `install` | No | External install source (e.g. `clawhub:avatar-runtime`). Marks this faculty as a soft-ref — injects dormant capability awareness into `soul/injection.md` |
| *(additional fields)* | No | Faculty-specific config (e.g. `voiceId`, `memoryProvider`). Passed through to the pack; interpreted by the faculty's runtime script |

---

## Resolution Chain

When the generator encounters a faculty, it resolves through this chain:

1. **Local definition** — `layers/faculties/{name}/faculty.json` (if exists, reads `allowedTools`, `envVars`, `triggers`, `files`, and injects `references/{name}.md` if the faculty has a SKILL.md)
2. **Soft-ref** — faculty has `install` field but no local definition → classified as dormant; awareness injected into `soul/injection.md` under "Expected Capabilities"
3. **Unknown** — no local definition and no `install` → skipped with a warning; does not block generation

---

## Local Faculty Definition

A local faculty lives in `layers/faculties/{name}/`:

```
layers/faculties/voice/
  faculty.json    ← Metadata: name, dimension, description, allowedTools, envVars, triggers, files
  SKILL.md        ← Behavior guide (injected into references/{name}.md in the generated pack)
  scripts/        ← Implementation scripts (optional)
```

### faculty.json

```json
{
  "name": "voice",
  "dimension": "expression",
  "description": "Text-to-speech voice synthesis via ElevenLabs",
  "allowedTools": ["Bash(node scripts/speak.js:*)", "Bash(bash scripts/speak.sh:*)"],
  "envVars": ["TTS_PROVIDER", "TTS_API_KEY", "TTS_VOICE_ID"],
  "triggers": ["say this out loud", "speak to me", "read this aloud"],
  "files": ["SKILL.md", "scripts/speak.sh", "scripts/speak.js"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Must match the directory name and the `persona.json` declaration |
| `dimension` | Yes | One of `expression`, `sense`, `cognition` — see Dimension table below |
| `description` | No | Human-readable capability summary |
| `provider` | No | Service provider name (e.g. `"elevenlabs"`, `"heygen"`, `"fal"`) |
| `fallback` | No | Behavior when not installed (e.g. `"text_only"`) |
| `install` | No | If present on a local definition, marks the faculty as needing external setup. Combined with local scripts for graceful degradation |
| `allowedTools` | No | Tool permissions added to the persona's allowed tools list |
| `envVars` | No | Environment variables the faculty's scripts require |
| `triggers` | No | Activation phrases (informational; shown in references/{name}.md) |
| `files` | No | Files this faculty contributes to the generated pack |

### Dimension Table

| Dimension | Meaning | Examples |
|-----------|---------|---------|
| `expression` | Changes how the persona outputs — voice, appearance, creative production | `voice`, `selfie`, `avatar`, `music` |
| `sense` | Adds perception channels — what the persona can receive and process | *(reserved for future: camera, microphone, vision)* |
| `cognition` | Extends memory, reasoning, or self-management capabilities | `memory`, `reminder` |

---

## External / Soft-Ref Faculties

Faculties with an `install` field that have no local definition are classified as **soft-refs**:

```json
{ "name": "avatar", "install": "clawhub:avatar-runtime" }
```

Generator behavior:
- Does **not** fail generation — the persona is created without the faculty's scripts
- Injects a "Expected Capabilities" section into `SKILL.md` listing the install command
- Injects dormant capability awareness into `soul/injection.md` with graceful degradation guidance

---

## Generated Pack Output

When a faculty is active, the generator:

1. Copies `layers/faculties/{name}/SKILL.md` to `references/{name}.md` in the pack
2. Adds the faculty's `allowedTools` entries to the `allowed-tools` frontmatter line in `SKILL.md`
3. Copies `files` listed in `faculty.json` (scripts, etc.) to the pack root or `scripts/` as declared
4. Adds a row in the `## Faculty` table in `SKILL.md`:

```markdown
| Faculty | Dimension | Reference |
|---------|-----------|-----------|
| voice | expression | [details](references/voice.md) |
```

---

## Built-in Faculties

| Faculty | Dimension | Implementation | External install? |
|---------|-----------|---------------|-------------------|
| `voice` | expression | ElevenLabs TTS (+ experimental OpenAI TTS, Qwen3-TTS) | No (scripts bundled) |
| `selfie` | expression | fal.ai Grok Imagine — generates photos from reference image | No (scripts bundled) |
| `avatar` | expression | HeyGen real-time 3D/video avatar bridge | Yes — `clawhub:avatar-runtime` |
| `music` | expression | ElevenLabs Music composition | No (scripts bundled) |
| `memory` | cognition | Cross-session episodic/semantic store (local JSON default; Mem0/Zep optional) | No (scripts bundled) |
| `reminder` | cognition | Scheduling and daily task management | No (SKILL.md only) |

> `selfie` and `avatar` are distinct faculties. `selfie` = on-demand static image generation (local). `avatar` = real-time animated presence (external install required). Do not merge them.
