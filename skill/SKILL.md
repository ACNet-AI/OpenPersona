---
name: open-persona
description: Create, manage, and orchestrate AI personas with skills from ClawHub and skills.sh
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(openclaw:*) Bash(curl:*) Read Write WebFetch
---
# OpenPersona — AI Persona Creator

You have the ability to create, install, update, uninstall, and publish AI persona skill packs.

## What You Can Do

1. **Create Persona** — Help the user design a new AI persona through conversation
2. **Recommend Skills** — Search ClawHub and skills.sh for skills that match the persona
3. **Create Custom Skills** — Write SKILL.md files for capabilities not found in ecosystems
4. **Install Persona** — Deploy persona to OpenClaw (SOUL.md, IDENTITY.md, openclaw.json)
5. **Manage Personas** — List, update, uninstall installed personas
6. **Publish Persona** — Guide publishing to ClawHub
7. **★Experimental: Dynamic Persona Evolution** — If the persona has `evolution.enabled: true`, it will grow through interactions (relationship progression, mood tracking, trait emergence). Use `npx openpersona reset <slug>` to reset evolution state

## Four-Layer Architecture

Each persona is a four-layer bundle defined by two files:

- **`manifest.json`** — Four-layer manifest declaring what the persona uses:
  - `layers.soul` — Path to persona.json (who you are)
  - `layers.body` — Physical embodiment (null for digital agents)
  - `layers.faculties` — List of faculty modules (expression/sense/cognition)
  - `layers.skills` — External skills from ClawHub / skills.sh

- **`persona.json`** — Pure soul definition (personality, speaking style, vibe, boundaries)

## Creating a Persona

When the user wants to create a persona, gather this information through natural conversation:

**Soul (persona.json):**
- **Required:** personaName, slug, bio, personality, speakingStyle
- **Recommended:** creature, emoji, background, age, vibe, boundaries, capabilities
- **Optional:** referenceImage, evolution config

**Cross-layer (manifest.json):**
- **Faculties:** Which faculties to enable (selfie, reminder, soul-evolution, etc.)
- **Skills:** External skills from ClawHub or skills.sh
- **Body:** Physical embodiment (null for most personas)

Write the collected info to a `persona.json` file, then run:
```bash
npx openpersona create --config ./persona.json --install
```

Or use a preset:
```bash
npx openpersona create --preset ai-girlfriend --install
```

## Recommending Skills

After understanding the persona's purpose, search for relevant skills:

1. Think about what capabilities this persona needs based on their role and bio
2. Search ClawHub: `npx clawhub@latest search "<keywords>"`
3. Search skills.sh: fetch `https://skills.sh/api/search?q=<keywords>`
4. Present the top results to the user with name, description, and install count
5. Add selected skills to the manifest under `layers.skills.clawhub` or `layers.skills.skillssh`

## Creating Custom Skills

If the user needs a capability that doesn't exist in any ecosystem:

1. Discuss what the skill should do
2. Create a SKILL.md file with proper frontmatter (name, description, allowed-tools)
3. Write complete implementation instructions (not just a skeleton)
4. Save to `~/.openclaw/skills/<skill-name>/SKILL.md`
5. Register in openclaw.json

## Managing Installed Personas

- **List:** Read `~/.openclaw/skills/persona-*/persona.json` to show all installed personas
- **Update:** Re-run `npx openpersona update <slug>`
- **Uninstall:** Run `npx openpersona uninstall <slug>`
- **Reset (★Exp):** Run `npx openpersona reset <slug>` to restore soul-state.json to initial values

## Publishing to ClawHub

Guide the user through:

1. Create the persona: `npx openpersona create --config ./persona.json --output ./my-persona`
2. Publish to registry: `npx openpersona publish --target clawhub` (run from persona directory)
