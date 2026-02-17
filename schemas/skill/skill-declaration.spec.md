# Skill Layer — Declaration Spec

Skills are declared in `manifest.json` under `layers.skills` as an array of objects.

## Skill Declaration Format

Each skill is an object with a required `name` and optional fields:

```json
{
  "layers": {
    "skills": [
      { "name": "weather", "description": "Query weather conditions", "trigger": "User asks about weather" },
      { "name": "web-search", "description": "Search for real-time information" },
      { "name": "deep-research", "install": "clawhub:deep-research" }
    ]
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier (used to resolve local definitions) |
| `description` | No | What this skill does (can come from local definition) |
| `trigger` | No | When to activate (can come from local `triggers` array) |
| `install` | No | External package source: `clawhub:<slug>` or `skillssh:<owner/repo>` |

## Resolution Chain

When the generator encounters a skill, it resolves metadata through this chain:

1. **Local definition** — `layers/skills/{name}/skill.json` (if exists, merges its metadata + injects SKILL.md content as a full section)
2. **Inline fields** — `description`, `trigger` written directly in the manifest entry
3. **Empty fallback** — skill name only; the agent judges usage by name alone

Local definitions always take precedence over inline fields for `description` and `triggers`.

## Local Skill Definition

A local skill lives in `layers/skills/{name}/`:

```
layers/skills/weather/
  skill.json    ← Metadata: name, description, allowedTools, triggers
  SKILL.md      ← Behavior guide (optional, injected as full section)
```

### skill.json

```json
{
  "name": "weather",
  "description": "Query current weather conditions and forecasts",
  "allowedTools": ["WebFetch", "Bash(curl:*)"],
  "triggers": ["weather", "forecast", "outdoor plans"]
}
```

- `allowedTools` from local definitions are automatically merged into the persona's allowed tools.
- `triggers` array is joined as a comma-separated string in the generated SKILL.md table.

### SKILL.md (Optional)

If present, the skill's SKILL.md content is injected as a **full section** (under `### Skill: {name}`) in the generated SKILL.md, instead of appearing as a table row. This allows rich, multi-paragraph behavior instructions.

## External Skills

Skills with an `install` field are installed from external sources during `openpersona install`:

```json
{ "name": "deep-research", "install": "clawhub:deep-research" }
```

Supported sources:
- `clawhub:<slug>` — installs via `npx clawhub@latest install <slug>`
- `skillssh:<owner/repo>` — installs via `npx skills add <owner/repo>`

## Generated SKILL.md Output

Skills appear in the generated SKILL.md under `## Skills & Tools`:

- **Table rows** — Skills without a local SKILL.md appear as rows: `| name | description | trigger |`
- **Full sections** — Skills with a local SKILL.md get a dedicated `### Skill: {name}` section with rich content

## SKILL.md Frontmatter

```yaml
---
name: persona-<slug>
description: <description>
allowed-tools: <space-separated list>
---
```
