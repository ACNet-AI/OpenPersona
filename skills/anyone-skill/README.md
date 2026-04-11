# anyone-skill

**Distill anyone into a runnable OpenPersona skill pack** — real or fictional, personal or public, living or historical.

[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-1.0-blue)](https://agentskills.io/specification)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![OpenPersona](https://img.shields.io/badge/OpenPersona-compatible-purple)](https://github.com/acnlabs/openpersona)

## What it does

anyone-skill is a **distillation front-end** for OpenPersona. It guides an AI agent through:

1. Collecting source material (chat logs, documents, public content, creative works)
2. Extracting a 4-dimension persona (Procedure · Interaction · Memory · Personality)
3. Grading evidence (L1 direct quote → L4 inspired)
4. Generating a full OpenPersona persona pack via `skills/open-persona`

The output is a portable, evolvable persona you can install and run with any OpenPersona-compatible agent.

## Subject types

| Type | Examples |
|------|---------|
| Yourself | digital self-archive |
| Someone you know | colleague, friend, family, partner, ex |
| Public figure | entrepreneur, artist, athlete, politician |
| Fictional character | game, anime, novel, film, series |
| Historical figure | relies on documents and biographies |
| Archetype | composite persona, no single real subject |

## Install

```bash
npx skills add acnlabs/anyone-skill
```

Or clone manually:

```bash
git clone https://github.com/acnlabs/anyone-skill .claude/skills/create-anyone
```

## Usage

In Claude Code, type `/create-anyone` or use natural language:

```
distill Elon Musk into a skill
create a persona for Geralt of Rivia
I want to talk to my old colleague Alex as an AI
```

## Distillation pipeline

```
Phase 0  Classify subject (6 types)
Phase 1  Ethics & copyright check         → references/ethics.md
Phase 2  3-question intake
Phase 3  Collect source material
Phase 4  4-dimension extraction
         Procedure · Interaction · Memory · Personality
Phase 5  Evidence grading (L1–L4)
Phase 6  Generate OpenPersona skill pack  → references/output-format.md
         via skills/open-persona + openpersona create
Phase 7  Evolve (add data · correct · rollback)
```

## Supported data sources

| Source | How |
|--------|-----|
| iMessage, WhatsApp, Telegram, Signal | Export + `scripts/preprocess.py` |
| Slack, Discord | Export + `scripts/preprocess.py` |
| Email (.eml / .mbox) | `scripts/preprocess.py` |
| Twitter/X, Instagram archives | `scripts/preprocess.py` |
| WeChat, Feishu, DingTalk | Export + `scripts/preprocess.py` |
| Public figures / historical figures | WebSearch (automatic) |
| PDF, images, documents | Claude Code `Read` tool (native) |

## Output

```
{slug}-skill/                   ← Full OpenPersona pack
├── SKILL.md                    ← Invocable via /{slug}
├── persona.json
├── state.json
├── soul/
│   ├── injection.md
│   └── constitution.md
├── agent-card.json
└── scripts/state-sync.js
```

## Requirements

- Python 3.8+ (for `scripts/preprocess.py`)
- Claude Code or any Agent Skills–compatible agent
- `openpersona` CLI for final pack generation

## How anyone-skill relates to other distillation skills

anyone-skill distills the common methodology behind the distillation skill ecosystem into a universal framework. Specialized skills go deeper in their domain; anyone-skill goes broader.

| Skill | Specialization | Relationship |
|-------|----------------|--------------|
| colleague-skill | Colleague (Feishu/DingTalk) | Specialized version |
| yourself-skill | Self (WeChat/social) | Specialized version |
| ex-skill | Ex-partner | Specialized version |
| boss-skills | Boss + entrepreneur archetypes | Specialized version |
| immortal-skill | 7 real-person types | Complementary — anyone-skill adds fictional/historical/archetype |

## License

MIT
