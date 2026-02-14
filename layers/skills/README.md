# Skill Layer — Shared Modules

Pre-built skill templates and scaffolds for persona capabilities.

## MVP Status

Currently empty. The Skill layer primarily integrates external skills from [ClawHub](https://clawhub.com) and [skills.sh](https://skills.sh) via `manifest.json` references.

## Roadmap

- **Skill templates** — Scaffolds for common skill patterns (e.g., data-tracking, API-integration)
- **Skill bundles** — Curated skill combinations for specific persona types (e.g., "companion-bundle", "assistant-bundle")

## How Skills Work

Skills are declared in `presets/*/manifest.json` under `layers.skills`:

```json
{
  "layers": {
    "skills": {
      "clawhub": ["some-skill-slug"],
      "skillssh": ["owner/repo"]
    }
  }
}
```

The installer automatically runs `npx clawhub install` or `npx skills add` for each declared skill.

## Contributing

To add a shared skill template, create a directory here with a SKILL.md and any supporting files.
