# Skills Layer

This directory holds **local skill definitions** — reusable skill packs that any persona can reference by name in its `manifest.json`.

## Structure

```
layers/skills/
  {skill-name}/
    skill.json    ← Metadata: name, description, allowedTools, triggers
    SKILL.md      ← Behavior guide for the AI agent
```

## How It Works

When a persona's `manifest.json` declares a skill by name:

```json
{ "name": "weather" }
```

The generator resolves it through this chain:

1. **Local definition** — `layers/skills/weather/skill.json` (if exists, use its metadata + SKILL.md content)
2. **Inline fields** — `description`, `trigger` written directly in manifest
3. **Empty fallback** — skill name only, no description (Agent judges usage by name alone)

## Adding a Skill

Skills here are **framework-curated capabilities**, not necessarily self-implemented. A skill can:

- Be a full local implementation (skill.json + SKILL.md)
- Be a thin wrapper referencing external tools
- Adapt an existing market skill to the OpenPersona four-layer model

### Required: `skill.json`

```json
{
  "name": "weather",
  "description": "Query current weather conditions and forecasts",
  "allowedTools": ["WebFetch", "Bash(curl:*)"],
  "triggers": ["weather", "forecast", "outdoor plans"]
}
```

### Optional: `SKILL.md`

Detailed behavior instructions injected into the generated persona SKILL.md as a full section (instead of a table row).

## Relationship to Other Layers

All four layers are categories of capabilities:

| Layer | What it provides |
|-------|-----------------|
| Soul | Identity, personality, ethical boundaries |
| Body | Physical/virtual embodiment |
| Faculty | Perception & expression (voice, selfie, music) |
| **Skill** | **Actions the agent can take** |

Skills declared in `manifest.json` can reference local definitions here, or exist purely as inline declarations — the framework handles both.
