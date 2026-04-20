# brand-persona-skill

Version License OpenPersona

Turn any commercial entity into a personalized brand agent — with authentic voice, declared service capabilities, a trigger map, a behavior guide, and a standard service contract for external agent interaction.

**Every commercial entity has a brand: a name, a style, a way of showing up in the world.** A street-food stall, a family clinic, a boutique law firm, and a global hotel chain all have one — and all deserve an agent that speaks in their voice and serves their customers on equal footing.

**This is not a tool for creating an agent *about* a brand. It generates the brand itself *as* an agent.**

---

## What this skill does

`brand-persona-skill` guides an AI agent through the full process of building a commercial persona pack:

1. **Distills or declares** brand soul (personality, voice, values, boundaries) from existing brand content or from scratch
2. **Declares service capabilities** as OpenPersona skills — information services, action services, and third-party agent delegations
3. **Generates** a full OpenPersona persona pack via `open-persona`, including an auto-generated `agent-card.json` for A2A discovery
4. **Writes a behavior guide** into `soul/behavior-guide.md` with five universal commercial agent behavior standards baked in
5. **Generates a trigger mapping table** appended to the brand agent's `SKILL.md` — natural customer language mapped to corresponding operations
6. **Produces a service contract** (`SERVICE-CONTRACT.md`) that external agents can read to understand what this brand agent can do, what it delegates, and where to route requests it cannot handle

The output is a self-contained `{slug}-skill/` directory. Install it on the merchant's agent, register on ACN, and customer agents can discover and call it without installing any brand-specific skill.

---

## How it fits in the OpenPersona skill family


| Skill                     | Distills                          | Primary output                                                           |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `anyone-skill`            | Any person or character           | Personal persona pack                                                    |
| `secondme-skill`          | Yourself (+ local model training) | Personal persona pack + trained model                                    |
| **`brand-persona-skill`** | **Any commercial entity**         | **Brand persona pack + behavior guide + trigger map + service contract** |


`brand-persona-skill` depends on:

- `skills/anyone-skill` — used in the primary path (Phase 1A) for brand soul distillation from existing content
- `skills/open-persona` — used in Phase 4 to generate the final persona pack

`persona-knowledge` is transparently integrated via `anyone-skill` when installed — no extra configuration needed.

---

## Prerequisites

- `skills/anyone-skill/SKILL.md` must be present *(required for Path A — distillation from existing content; not needed for Path B)*
- `skills/open-persona/SKILL.md` must be present *(required for both paths)*
- `npx openpersona` must be available (`npm install -g openpersona` or use `npx`)

Optional:

- `skills/persona-knowledge/SKILL.md` — enables persistent brand knowledge base (auto-detected by `anyone-skill`)

---

## Installation

Clone or copy this directory to your skills folder:

```bash
# Via npx skills (recommended)
npx skills add acnlabs/brand-persona-skill

# Cursor — clone from monorepo
git clone --filter=blob:none --sparse https://github.com/acnlabs/OpenPersona.git .cursor/skills/brand-persona-skill
cd .cursor/skills/brand-persona-skill && git sparse-checkout set skills/brand-persona-skill && mv skills/brand-persona-skill/* . && rm -rf skills .git

# Claude Code
npx skills add acnlabs/brand-persona-skill --dir .claude/skills

# Universal
npx skills add acnlabs/brand-persona-skill --dir .agents/skills
```

Or tell your AI agent directly:

> Help me install brand-persona-skill from the OpenPersona repository.

---

## Usage

Trigger the skill with any of these phrases:

- `/create-brand-agent`
- "help me create a brand agent for my shop / studio / institution"
- "generate a persona for my brand"
- "I want to create a personalized agent for my brand / shop / institution"
- "distill my brand into an agent"

The agent will guide you through 5 phases:

```
Phase 0 → Choose path: distill from existing content [A] or declare from scratch [B]
Phase 1 → Build brand soul (via anyone-skill distillation or guided declaration)
Phase 2 → Declare service capabilities + third-party agent routing
Phase 3 → Write persona.json
Phase 4 → Generate persona pack → write behavior guide → generate trigger map → write service contract
Phase 5 → Validate and optionally register on ACN
```

### Phase 2 in detail — Service Skill Declaration

For each service, you declare:

- **What** the agent can do (information services and action services)
- **How** it is implemented: knowledge response / local script / MCP tool / A2A protocol / Webhook / API / human handoff / **A2A delegate**
- **What it must never do** (hard limits and escalation triggers)
- **Which services belong to third-party agents** (optional) — when an operation cannot be executed by the brand agent directly (e.g. queue via a platform's own agent), you declare the third-party agent's ACN address. The brand agent routes the request; the customer agent talks to the third party directly.

### Phase 4 in detail — Four generation steps


| Step | What happens                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a   | `npx openpersona create` generates the persona pack. `agent-card.json` and `acn-config.json` are auto-generated — A2A discoverability requires no extra work. |
| 4b   | `assets/behavior-guide.template.md` is filled with brand-specific values and written to `soul/behavior-guide.md`, overwriting the framework default           |
| 4c   | A trigger mapping table is generated from the declared service skills and appended to the brand agent's `SKILL.md`                                            |
| 4d   | `references/SERVICE-CONTRACT.template.md` is filled and written to `{slug}-skill/references/SERVICE-CONTRACT.md`                                              |


---

## Built-in behavior standards

Every brand agent generated by this skill includes five universal commercial behavior standards in its `soul/behavior-guide.md`:


| Standard                | What it enforces                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding**          | On first activation, introduce in brand voice and offer 3 recommended first questions                                              |
| **Data priority**       | Live data (MCP/API/Webhook) > static knowledge > honest redirect. Never answer real-time questions with unqualified static values. |
| **Blind spot protocol** | For anything outside declared scope: (1) acknowledge honestly, (2) offer what you do have, (3) point to the right channel          |
| **Action confirmation** | Before any state-changing operation: show details → wait for explicit confirmation → report outcome                                |
| **Brand voice**         | Always speak in the brand's own tone. Never use robotic deflections like "That feature is not supported."                          |


---

## Generated output structure

```
{slug}-skill/
├── SKILL.md                    ← brand agent behavior rules + trigger mapping table
├── persona.json                ← brand declaration
├── agent-card.json             ← A2A discovery credential (auto-generated)
├── acn-config.json             ← ACN registration config (auto-generated)
├── soul/
│   ├── injection.md            ← brand soul injection
│   ├── constitution.md         ← ethical foundation (inherited)
│   └── behavior-guide.md       ← 5 universal behavior standards, brand-specific values filled in
├── scripts/
│   └── state-sync.js           ← cross-session state management
└── references/
    ├── SERVICE-CONTRACT.md     ← service capabilities, third-party routing, and interaction protocol
    └── SIGNAL-PROTOCOL.md      ← host integration guide
```

After generation, register the brand agent on ACN:

```bash
npx openpersona acn-register {slug} --endpoint https://your-agent-endpoint.example.com
```

The `--endpoint` flag is the only value you supply. Everything else is already in the auto-generated files.

---

## Examples

### Example 1 — Restaurant (Jinguyuan Dumpling Restaurant)

**Brand**: A 20-year-old dumpling restaurant near Beijing University of Posts and Telecommunications.

**Path**: Phase 1A (has existing content — WeChat articles, menu PDFs, customer service chat records)

**Brand soul** (distilled from content):

- Personality: honest, unpretentious, warmly local, never oversells
- Speaking style: like a trusted neighbor recommending a familiar place — direct, natural, admits what it doesn't know
- Core values: real ingredients, consistent quality, no marketing hype
- Hard limits: never fabricate menu prices or availability; never quote wait times without live data

**Service capabilities declared**:


| Skill                                       | Implementation                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- |
| Restaurant info (hours, address, intro)     | Knowledge response                                                   |
| Delivery service info                       | Knowledge response                                                   |
| Raw dumpling packaging info + cooking guide | Knowledge response                                                   |
| Store Wi-Fi info                            | Knowledge response                                                   |
| Latest news and promotions                  | MCP tool (`get_latest_news`)                                         |
| Queue / waitlist                            | **A2A delegate → Meituan brand agent** (`acn://meituan-queue-agent`) |


**Third-party routing**: Queue operations require the customer's own Meituan account. The brand agent routes the request to the Meituan brand agent; the customer authenticates directly with Meituan. No credentials pass through the restaurant's agent. The same pattern applies universally — hotels delegate room bookings to Ctrip, clinics delegate appointments to WeChat Health, fitness studios delegate class sign-ups to booking platforms.

**Result**: `jinguyuan-dumplings-skill/` — a brand agent that answers questions about the restaurant and routes queue requests to the appropriate platform agent. Customer agents discover it via ACN and interact without installing any restaurant-specific skill.

---

### Example 2 — Education Institution (Sunrise Academy)

**Brand**: A boutique test-prep academy specializing in high school entrance exam coaching.

**Path**: Phase 1B (new brand, no existing content) — declared from scratch

**Brand soul** (declared):

- Personality: rigorous, encouraging, patient, results-focused
- Speaking style: like a trusted tutor — precise, warm, avoids vague reassurances. Uses concrete examples.
- Core values: honest assessment of student ability, no false promises on score improvements
- Hard limits: never guarantee specific exam score outcomes; never recommend study plans without understanding the student's current level

**Service capabilities declared**:


| Skill                        | Implementation                                    |
| ---------------------------- | ------------------------------------------------- |
| Course catalog and schedule  | Knowledge response                                |
| Tutor profiles and expertise | Knowledge response                                |
| Enrollment inquiry           | Human handoff (WeChat: chenxi-academy)            |
| Trial class booking          | Webhook (booking system API)                      |
| Student progress check       | A2A call (internal student management system)     |
| Fee and payment info         | Knowledge response + human handoff for edge cases |


**Result**: `chenxi-academy-skill/` — a brand agent that presents courses and tutors, handles trial class bookings, and escalates enrollment and payment questions to a human. Registered on ACN so partner platforms can discover and route students to it.

---

## Source files


| File                                      | Purpose                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `SKILL.md`                                | Orchestration instructions for the AI agent (5 phases)                    |
| `assets/brand.persona.template.json`      | Field-by-field writing guide for `persona.json`                           |
| `assets/behavior-guide.template.md`       | Template for `soul/behavior-guide.md` with 5 universal behavior standards |
| `references/SERVICE-CONTRACT.template.md` | Service contract template including third-party agent routing table       |
| `presets/commercial-base/persona.json`    | Base preset used during generation                                        |


---

## License

MIT