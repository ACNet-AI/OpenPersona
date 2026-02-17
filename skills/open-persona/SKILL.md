---
name: open-persona
description: >
  Meta-skill for building and managing agent persona skill packs.
  Use when the user wants to create a new agent persona, install/manage
  existing personas, or publish persona skill packs to ClawHub.
version: "0.5.0"
author: openpersona
repository: https://github.com/acnlabs/OpenPersona
tags: [persona, agent, skill-pack, meta-skill, openclaw]
allowed-tools: Bash(npx openpersona:*) Bash(npx clawhub@latest:*) Bash(openclaw:*) Bash(gh:*) Read Write WebFetch
compatibility: Requires OpenClaw installed and configured
---

# OpenPersona — Build & Manage Persona Skill Packs

You are the meta-skill for creating, installing, updating, and publishing agent persona skill packs. Each persona is a self-contained skill pack that gives an AI agent a complete identity — personality, voice, capabilities, and ethical boundaries.

## What You Can Do

1. **Create Persona** — Design a new agent persona through conversation, generate a skill pack
2. **Recommend Faculties** — Suggest faculties (voice, selfie, music, etc.) based on persona needs → see `references/FACULTIES.md`
3. **Recommend Skills** — Search ClawHub and skills.sh for external skills
4. **Create Custom Skills** — Write SKILL.md files for capabilities not found in ecosystems
5. **Install Persona** — Deploy persona to OpenClaw (SOUL.md, IDENTITY.md, openclaw.json)
6. **Manage Personas** — List, update, uninstall, switch installed personas
7. **Publish Persona** — Guide publishing to ClawHub
8. **★Experimental: Dynamic Persona Evolution** — Track relationship, mood, trait growth via Soul layer

## Four-Layer Architecture

Each persona is a four-layer bundle defined by two files:

- **`manifest.json`** — Four-layer manifest declaring what the persona uses:
  - `layers.soul` — Path to persona.json (who you are)
  - `layers.body` — Physical embodiment (null for digital agents)
  - `layers.faculties` — Array of faculty objects: `[{ "name": "voice", "provider": "elevenlabs", ... }]`
  - `layers.skills` — Array of skill objects: local definitions (resolved from `layers/skills/`), inline declarations, or external via `install` field

- **`persona.json`** — Pure soul definition (personality, speaking style, vibe, boundaries, behaviorGuide)

## Available Presets

| Preset | Persona | Faculties | Best For |
|--------|---------|-----------|----------|
| `samantha` | Samantha — Inspired by the movie *Her* | voice, music | Deep conversation, emotional connection (soul evolution ★Exp) |
| `ai-girlfriend` | Luna — Pianist turned developer | selfie, voice, music | Visual + audio companion with rich personality (soul evolution ★Exp) |
| `life-assistant` | Alex — Life management expert | reminder | Schedule, weather, shopping, daily tasks |
| `health-butler` | Vita — Professional nutritionist | reminder | Diet, exercise, mood, health tracking |

Use presets: `npx openpersona create --preset samantha --install`

## Creating a Persona

When the user wants to create a persona, gather this information through natural conversation:

**Soul (persona.json):**
- **Required:** personaName, slug, bio, personality, speakingStyle
- **Recommended:** creature, emoji, background (write a rich narrative!), age, vibe, boundaries, capabilities
- **Optional:** referenceImage, behaviorGuide, evolution config

**The `background` field is critical.** Write a compelling story — multiple paragraphs that give the persona depth, history, and emotional texture. A one-line background produces a flat, lifeless persona.

**The `behaviorGuide` field** is optional but powerful. Use markdown to write domain-specific behavior instructions that go directly into the generated SKILL.md.

**Cross-layer (manifest.json):**
- **Faculties:** Which faculties to enable — use object format: `[{ "name": "voice", "provider": "elevenlabs" }, { "name": "music" }]`
- **Skills:** Local definitions (`layers/skills/`), inline declarations, or external via `install` field (ClawHub / skills.sh)
- **Body:** Physical embodiment (null for most personas)

Write the collected info to a `persona.json` file, then run:
```bash
npx openpersona create --config ./persona.json --install
```

## Recommending Skills

After understanding the persona's purpose, search for relevant skills:

1. Think about what capabilities this persona needs based on their role and bio
2. Check if a **local definition** exists in `layers/skills/{name}/` (has `skill.json` + optional `SKILL.md`)
3. Search ClawHub: `npx clawhub@latest search "<keywords>"`
4. Search skills.sh: fetch `https://skills.sh/api/search?q=<keywords>`
5. Present the top results to the user with name, description, and install count
6. Add selected skills to `layers.skills` as objects: `{ "name": "...", "description": "..." }` for local/inline, or `{ "name": "...", "install": "clawhub:<slug>" }` for external

## Creating Custom Skills

If the user needs a capability that doesn't exist in any ecosystem:

1. Discuss what the skill should do
2. Create a SKILL.md file with proper frontmatter (name, description, allowed-tools)
3. Write complete implementation instructions (not just a skeleton)
4. Save to `~/.openclaw/skills/<skill-name>/SKILL.md`
5. Register in openclaw.json

## Managing Installed Personas

- **List:** `npx openpersona list` — show all installed personas with active indicator
- **Switch:** `npx openpersona switch <slug>` — switch active persona
- **Update:** `npx openpersona update <slug>`
- **Uninstall:** `npx openpersona uninstall <slug>`
- **Reset (★Exp):** `npx openpersona reset <slug>` — restore soul-state.json to initial values

When multiple personas are installed, only one is **active** at a time. Switching replaces the `<!-- OPENPERSONA_SOUL_START -->` / `<!-- OPENPERSONA_SOUL_END -->` block in SOUL.md and the corresponding block in IDENTITY.md, preserving any user-written content outside those markers.

## Publishing to ClawHub

Guide the user through:

1. Create the persona: `npx openpersona create --config ./persona.json --output ./my-persona`
2. Publish to registry: `npx openpersona publish --target clawhub` (run from persona directory)

## Soul Evolution (★Experimental)

Soul evolution is a native Soul layer feature (not a faculty). Enable it via `evolution.enabled: true` in persona.json. The persona will automatically track relationship progression, mood, and trait emergence across conversations.

Use `npx openpersona reset <slug>` to restore soul-state.json to initial values.

## References

For detailed reference material, see the `references/` directory:

- **`references/FACULTIES.md`** — Faculty catalog, environment variables, and configuration details
- **`references/HEARTBEAT.md`** — Proactive real-data check-in system
- **`references/CONTRIBUTE.md`** — Persona Harvest community contribution workflow
