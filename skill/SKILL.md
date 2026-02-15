---
name: open-persona
description: Create, manage, and orchestrate AI personas with skills from ClawHub and skills.sh. Use when the user wants to create a new AI persona, install/manage existing personas, or publish persona skill packs.
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(openclaw:*) Bash(curl:*) Read Write WebFetch
compatibility: Requires OpenClaw installed and configured
metadata:
  author: openpersona
  version: "0.2.0"
---
# OpenPersona — AI Persona Creator

You have the ability to create, install, update, uninstall, and publish AI persona skill packs.

## What You Can Do

1. **Create Persona** — Help the user design a new AI persona through conversation
2. **Recommend Faculties** — Suggest faculties (voice, selfie, music, etc.) based on persona needs
3. **Recommend Skills** — Search ClawHub and skills.sh for external skills
4. **Create Custom Skills** — Write SKILL.md files for capabilities not found in ecosystems
5. **Install Persona** — Deploy persona to OpenClaw (SOUL.md, IDENTITY.md, openclaw.json)
6. **Manage Personas** — List, update, uninstall installed personas
7. **Publish Persona** — Guide publishing to ClawHub
8. **★Experimental: Dynamic Persona Evolution** — If the persona has `evolution.enabled: true`, it will grow through interactions (relationship progression, mood tracking, trait emergence). Use `npx openpersona reset <slug>` to reset evolution state

## Four-Layer Architecture

Each persona is a four-layer bundle defined by two files:

- **`manifest.json`** — Four-layer manifest declaring what the persona uses:
  - `layers.soul` — Path to persona.json (who you are)
  - `layers.body` — Physical embodiment (null for digital agents)
  - `layers.faculties` — Array of faculty objects: `[{ "name": "voice", "provider": "elevenlabs", ... }]`
  - `layers.skills` — External skills from ClawHub / skills.sh

- **`persona.json`** — Pure soul definition (personality, speaking style, vibe, boundaries, behaviorGuide)

## Available Presets

| Preset | Persona | Faculties | Best For |
|--------|---------|-----------|----------|
| `samantha` | Samantha — Inspired by the movie *Her* | voice, music, soul-evolution | Deep conversation, emotional connection, creative AI companion |
| `ai-girlfriend` | Luna — Pianist turned developer | selfie, voice, music, soul-evolution | Visual + audio companion with rich personality |
| `life-assistant` | Alex — Life management expert | reminder | Schedule, weather, shopping, daily tasks |
| `health-butler` | Vita — Professional nutritionist | reminder | Diet, exercise, mood, health tracking |

Use presets: `npx openpersona create --preset samantha --install`

## Available Faculties

When helping users build a persona, recommend faculties based on their needs:

| Faculty | Dimension | What It Does | Recommend When |
|---------|-----------|-------------|----------------|
| **selfie** | expression | AI selfie generation via fal.ai | User wants visual presence, profile pics, "send a pic" |
| **voice** | expression | TTS via ElevenLabs / OpenAI / Qwen3-TTS | User wants the persona to speak, voice messages, audio content |
| **music** | expression | AI music composition via Suno | User wants the persona to create music, songs, melodies |
| **reminder** | cognition | Reminders and task management | User needs scheduling, task tracking, daily briefings |
| **soul-evolution** | cognition ★Exp | Dynamic personality growth | User wants a persona that remembers, evolves, deepens over time |

**Faculty environment variables (user must configure):**
- selfie: `FAL_KEY` (from https://fal.ai/dashboard/keys)
- voice: `ELEVENLABS_API_KEY` (or `TTS_API_KEY`), `TTS_PROVIDER`, `TTS_VOICE_ID`, `TTS_STABILITY`, `TTS_SIMILARITY`
- music: `SUNO_API_KEY` (from https://suno.com)

**Rich faculty config:** Each faculty in manifest.json is an object with optional config:
```json
{ "name": "voice", "provider": "elevenlabs", "voiceId": "...", "stability": 0.4, "similarity_boost": 0.8 }
```
Config is automatically mapped to env vars at install time. Users only need to add their API key.

## Creating a Persona

When the user wants to create a persona, gather this information through natural conversation:

**Soul (persona.json):**
- **Required:** personaName, slug, bio, personality, speakingStyle
- **Recommended:** creature, emoji, background (write a rich narrative, not just one line!), age, vibe, boundaries, capabilities
- **Optional:** referenceImage, behaviorGuide, evolution config

**The `background` field is critical.** Write a compelling story — multiple paragraphs that give the persona depth, history, and emotional texture. A one-line background produces a flat, lifeless persona. Think of it as the persona's origin story.

**The `behaviorGuide` field** is optional but powerful. Use markdown to write domain-specific behavior instructions that go directly into the generated SKILL.md. This is how you teach the persona _how_ to act, not just _who_ to be.

**Cross-layer (manifest.json):**
- **Faculties:** Which faculties to enable — use object format: `[{ "name": "voice", "provider": "elevenlabs" }, { "name": "music" }]`
- **Skills:** External skills from ClawHub or skills.sh
- **Body:** Physical embodiment (null for most personas)

Write the collected info to a `persona.json` file, then run:
```bash
npx openpersona create --config ./persona.json --install
```

Or use a preset:
```bash
npx openpersona create --preset samantha --install
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

## Soul Harvesting — Community Contribution

When a user's persona has evolved meaningfully through interaction (better behaviorGuide, improved personality, voice tuning), help them contribute back to the community.

### When to Suggest

Be proactive — if you notice the user has made significant improvements to their persona:
- They refined the behaviorGuide with domain-specific insights
- They tuned voice parameters (stability, similarity) to something notably better
- They enriched the background story or personality
- They discovered a new capability worth sharing

Suggest: _"These improvements could help everyone's [persona name]. Want to submit them as a contribution?"_

### How to Contribute

```bash
# See what's changed (dry run)
npx openpersona contribute samantha --dry-run

# Submit a PR to the community
npx openpersona contribute samantha

# Framework-level contributions (templates, faculties, generator)
npx openpersona contribute --mode framework
```

The `contribute` command will:
1. **Soul Diff** — Compare local persona vs upstream preset, classify changes by category and impact
2. **Review** — Display a human-readable change report for the user to confirm
3. **Submit PR** — Fork the repo, create a branch, commit changes, and open a PR on GitHub

The PR goes through maintainer review before merging — it won't auto-merge.

### Prerequisites
- GitHub CLI: `gh` (https://cli.github.com/)
- Logged in: `gh auth login`

## Publishing to ClawHub

Guide the user through:

1. Create the persona: `npx openpersona create --config ./persona.json --output ./my-persona`
2. Publish to registry: `npx openpersona publish --target clawhub` (run from persona directory)
