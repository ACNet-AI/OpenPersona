---

## name: brand-persona-skill

description: "Distill any commercial entity into a personalized brand agent — a living brand persona with authentic voice, declared service capabilities, and a standard service contract. Supports both distillation from existing brand content and declaration from scratch. Use when a business, brand, studio, or institution wants to create their own AI agent to serve customers."
license: MIT
compatibility: "OpenPersona/OpenClaw/Cursor. Requires anyone-skill + open-persona in the same skills directory."
allowed-tools: Read Write Bash WebSearch
metadata:
  author: openpersona
  version: "0.1.0"

# brand-persona-skill

**brand-persona-skill** is an orchestration skill for turning any commercial entity into a personalized brand agent. It distills brand identity from existing content (or guides a declaration from scratch), defines the brand's service capabilities as skills, and generates a full OpenPersona pack that external agents can discover and call.

**This is not a tool for creating an agent about a brand. It generates the brand itself as an agent.**

**Dependency chain**:

- `brand-persona-skill` → `skills/anyone-skill` (Phase 1A — brand soul distillation)
- `brand-persona-skill` → `skills/open-persona` (Phase 4 — persona pack generation)
- `persona-knowledge` is transparently integrated via `anyone-skill` when installed — no extra work needed

**Generated output**: a self-contained `{slug}-skill/` persona pack with brand soul, declared service skills, agent-card for A2A discovery, and a service contract for external agents.

## Trigger phrases

- `/create-brand-agent`
- "help me create a brand agent"
- "generate a persona for my brand / shop / studio / institution"
- "I want to create a personalized agent for my brand / shop / institution"
- "distill my brand into an agent"
- "turn my business into a persona"

---

## Source of truth

- Preset base: `presets/commercial-base/persona.json`
- Field mapping template: `skills/brand-persona-skill/assets/brand.persona.template.json`
- Service contract template: `skills/brand-persona-skill/references/SERVICE-CONTRACT.template.md`
- Generated pack: `./{slug}-skill/`

---

## Phase 0 — Path Selection

Ask the user:

```
Does your brand have any of the following existing content?

  [A] Yes → brand guidelines / customer service records / website copy /
             founder interviews / marketing materials / social media archives
             (any format: .md / .txt / .pdf / chat exports / .json)

  [B] No or very little → declare brand parameters directly
```

If the user selects **[A]**, proceed to **Phase 1A**.
If the user selects **[B]**, proceed to **Phase 1B**.

---

## Phase 1A — Brand Soul Distillation (Primary path — selected A)

Load `skills/anyone-skill/SKILL.md` and follow its instructions.

When anyone-skill asks "Who do you want to distill?", select `**[6] Archetype`** — composite persona with no single real-world subject. This is the correct type for a brand persona.

**Brand content → anyone-skill data type mapping** (use this to guide the user on what to provide):


| Brand content                                 | anyone-skill data type               |
| --------------------------------------------- | ------------------------------------ |
| Brand guidelines / VI spec / brand manual     | `.md` / `.pdf` → `universal` adapter |
| Customer service records / sales scripts      | Chat export → `chat_export` adapter  |
| Website copy / WeChat public account articles | `.txt` / `.md` → `universal` adapter |
| Founder interviews / brand story              | `.txt` → `universal` adapter         |
| Social media archives (X/Instagram)           | Archive directory → `social` adapter |
| Product catalog / FAQ document                | `.md` / `.pdf` → `universal` adapter |


**Note**: if `skills/persona-knowledge/SKILL.md` is present, anyone-skill will automatically route brand knowledge into the MemPalace persistent store. No extra steps needed.

**Output**: a structured brand persona draft with four dimensions extracted:

- Values (what the brand stands for)
- Voice (how the brand speaks)
- Boundaries (what the brand will and will not do)
- Background (brand history, context, positioning)

Collect this output and proceed to **Phase 2**.

---

## Phase 1B — Brand Soul Declaration (Secondary path — selected B)

Collect the following from the user, one question at a time:

1. **Brand name** — the name the agent will use to introduce itself
2. **Slug** — URL-safe identifier, lowercase letters, numbers, hyphens only (e.g. `jinguyuan-dumplings`)
3. **Industry / domain** — e.g. food & beverage, education, retail, healthcare, professional services
4. **One-line bio** — what this brand is in one sentence (used as `soul.identity.bio`)
5. **Personality keywords** — 3–5 words describing the brand personality (e.g. "warm, grounded, honest")
6. **Speaking style** — how the brand talks to customers (formal / casual / playful / expert / friendly)
7. **Core values** — 2–3 things the brand will never compromise on
8. **Hard limits** — what the agent must always refuse or escalate (e.g. "never quote prices without checking live data", "never promise delivery times")

Optional: use `WebSearch` to research competitors or industry tone references if the user needs inspiration.

**Output**: structured brand soul fields. Proceed to **Phase 2**.

---

## Phase 2 — Service Skill Declaration (Required — both paths)

**Services are skills.** Every service capability the brand agent offers maps directly to a `skills[]` entry in `persona.json`.

Ask the user the following questions (Questions 1–3 are required; Question 4 is only asked if any service in Question 2 uses **A2A delegate**):

### Question 1: What can the agent do autonomously?

List every service the agent can handle without human involvement. Think in two categories:

- **Information services** (knowledge-based): answering questions about the brand, products, policies, hours, locations, pricing, FAQs
- **Action services** (execution-based): taking reservations, placing orders, generating queue numbers, checking order status, processing returns

### Question 2: How is each service implemented?

For each service declared above, the implementation method is **transparent to this skill** — the brand chooses based on what they have:


| Implementation     | When to use                                                                  | Example                                                                                |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Knowledge response | Information queries, no system integration                                   | Business hours, product descriptions, policies                                         |
| Local script       | Specific business operations                                                 | Queue number generation, appointment booking                                           |
| MCP tool           | Has own service endpoint                                                     | Order lookup, inventory check                                                          |
| A2A protocol       | Agent-to-agent collaboration                                                 | Cross-system business flows                                                            |
| Webhook / API      | Has existing ERP / CRM / payment system                                      | Order management, customer data                                                        |
| Human handoff      | High-risk or complex situations                                              | Complaints, contracts, disputes                                                        |
| **A2A delegate**   | **Operation belongs to a third-party platform that has its own brand agent** | **F&B: queue via Meituan agent; Hotel: booking via Ctrip agent; Fitness: class sign-up via booking platform agent** |
| Mixed              | Most real businesses                                                         | Auto-answer queries + escalate transactions                                            |


Record the implementation method in the skill's `description` field.

**A2A delegate** requires collecting three extra fields:

1. **Third-party agent address** — Ask: "Does [third-party platform] have a brand agent on ACN? If yes, provide its ACN slug or agent-card URL. If not, record as `tbd`."
2. **Routing parameters** — Ask: "Does [third-party platform] need any identifiers to locate your specific business? For example, a store ID, merchant ID, property code, or doctor ID on their platform." Record these parameters (e.g. `shop_id: 4211342` for a restaurant branch; `hotel_id: bj-sanlitun-001` for a hotel property; `clinic_id: 88` + `doctor_id: 204` for a clinic) — they will be written into the trigger mapping table in Step 4c.
3. **Client-side capability** — Ask: "Is there a skill the customer's agent could install to handle this operation directly using the parameters above? For example, `meituan-queue` for Meituan queue operations, `ctrip-booking` for Ctrip hotel reservations, `wechat-health-booking` for healthcare appointments." This enables a three-tier execution model written into the service contract:
   - **Tier 1** (preferred): customer agent has `capability_needed` skill installed → execute directly using the routing parameters provided by this brand agent
   - **Tier 2** (when available): third-party brand agent is on ACN → A2A delegate
   - **Tier 3** (fallback): neither available → human handoff or platform link

Record all three fields. They will be written into both the trigger mapping table (Step 4c) and the SERVICE-CONTRACT routing table (Step 4d).

### Question 3: What must the agent never do?

List hard limits and escalation triggers:

- Topics or operations the agent must refuse entirely
- Operations that require explicit user confirmation before execution
- Situations that must be handed off to a human

### Question 4: Which services belong to third-party agents? *(only if A2A delegate was selected in Question 2)*

List every service that this brand agent **cannot execute directly** but **can route** to a known third-party brand agent. For each:

- Service description (what the customer wants to do)
- Third-party platform name
- Third-party agent ACN address or agent-card URL (if known; otherwise record as "TBD — provide platform link as fallback")

This produces the **Third-Party Agent Routing table** written into `SERVICE-CONTRACT.md` in Phase 4.

**Output mapping**:

- Each declared service → one entry in `skills[]` with `name`, `description`, and optional `trigger`
- A2A delegate services → also recorded in the routing table (see Phase 4)
- Hard limits → appended to `soul.character.boundaries`

---

## Phase 3 — Write persona.json

Merge Phase 1 brand soul and Phase 2 service skills into a complete `persona.json` using `presets/commercial-base` as the base. Apply this field mapping:


| Source                                | Target field                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Phase 1A/1B brand name                | `soul.identity.personaName`                                                                |
| Phase 1A/1B slug                      | `soul.identity.slug`                                                                       |
| Phase 1A/1B one-line bio              | `soul.identity.bio`                                                                        |
| Phase 1A/1B personality keywords      | `soul.character.personality`                                                               |
| Phase 1A/1B speaking style            | `soul.character.speakingStyle`                                                             |
| Phase 1A/1B core values + hard limits | `soul.character.boundaries` (combined as a single string; list items separated by newline) |
| Phase 1A/1B background / brand story  | `soul.character.background` (if available from distillation)                               |
| Phase 2 service skills list           | `skills[]` (each entry: `name`, `description`, optional `trigger`)                         |
| Phase 2 additional hard limits        | append to `soul.character.boundaries`                                                      |
| Base fields                           | all other fields from `presets/commercial-base/persona.json`                               |


Use `skills/brand-persona-skill/assets/brand.persona.template.json` as a writing guide. **Do not copy the template file directly** — it contains `_comment` fields that will cause schema validation errors. Write a new `persona.json` based on its structure, with all `_comment` keys removed.

**Gate — Soul Gate**: before proceeding, verify:

- `soul.identity.personaName` is non-empty
- `soul.identity.slug` matches `^[a-z0-9-]+$`
- `soul.identity.bio` is non-empty
- `soul.character.personality` is non-empty

If any field is missing, return to Phase 1 to collect it.

**Gate — Service Gate**: verify:

- `skills[]` contains at least one entry with a non-empty `name`
- `soul.character.boundaries` is non-empty

If either check fails, return to Phase 2.

---

## Phase 4 — Generate Persona Pack

Load `skills/open-persona/SKILL.md` and follow its generation instructions.

### Step 4a — Run the generator

```bash
npx openpersona create --config persona.json --output ./{slug}-skill
```

**Gate — Generate Gate**: if `openpersona create` exits non-zero, read the validation error, fix `persona.json`, and retry.

### Step 4b — Write behavior guide

Fill `skills/brand-persona-skill/assets/behavior-guide.template.md` with brand-specific values and write the result to `./{slug}-skill/soul/behavior-guide.md`, overwriting the framework default. Apply this mapping:


| Placeholder                    | Source                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `{{brandName}}`                | Phase 1A/1B brand name                                                                                           |
| `{{oneLinerBio}}`              | Phase 1A/1B one-line bio                                                                                         |
| `{{onboardingQuestion_1/2/3}}` | 3 realistic first questions a customer would ask this brand                                                      |
| `{{blindspotRedirect}}`        | Escalation channels declared in Phase 2 (human handoff channel, official website, customer service number, etc.) |
| `{{confirmationRequiredOps}}`  | Action services from Phase 2 that require confirmation (list each by name)                                       |
| `{{brandVibe}}`                | Phase 1A/1B vibe / personality keywords                                                                          |
| `{{speakingStyleNote}}`        | Phase 1A/1B speaking style, condensed to one sentence                                                            |
| `{{brandBoundaries}}`          | `soul.character.boundaries` from Phase 3                                                                         |


### Step 4c — Generate trigger mapping table

From the Phase 2 `skills[]` list, write a trigger mapping table and append it to `./{slug}-skill/SKILL.md` under a new section `## Trigger Scenarios`. For each declared service skill, produce one or more rows:

```markdown
## Trigger Scenarios

| What the customer might ask | Corresponding operation |
|---|---|
| {realistic user phrasing for skill_1} | {skill_1 name and implementation method} |
| {realistic user phrasing for skill_2} | {skill_2 name and implementation method} |
...
```

Use natural customer language in the left column (questions a real customer would type, not technical names). Use the skill `name` + implementation method in the right column. For A2A delegate skills, write all three execution tiers collected in Phase 2:

```
# F&B example
queue-waitlist —
  Tier 1: install meituan-queue skill → use shop_id `4211342`
  Tier 2: A2A delegate → acn://meituan-queue-agent (tbd)
  Tier 3: fallback → https://meituan.com/restaurant/4211342

# Hotel example
room-booking —
  Tier 1: install ctrip-booking skill → use hotel_id `bj-sanlitun-001`
  Tier 2: A2A delegate → acn://ctrip-booking-agent (tbd)
  Tier 3: fallback → https://ctrip.com/hotels/bj-sanlitun-001

# Healthcare example
appointment-booking —
  Tier 1: install wechat-health-booking skill → use clinic_id `88`, doctor_id `204`
  Tier 2: A2A delegate → acn://wechat-health-agent (tbd)
  Tier 3: fallback → Hospital registration portal link
```

This allows the customer agent to choose the best available execution path at runtime.

### Step 4d — Write service contract

```
Copy skills/brand-persona-skill/references/SERVICE-CONTRACT.template.md
→ ./{slug}-skill/references/SERVICE-CONTRACT.md
```

Fill in all `{{placeholder}}` values with the information collected in Phase 2.

For the **Third-Party Agent Routing** section, use the routing table collected in Phase 2 Question 4:

- If the third-party agent's ACN address is known → fill in `acn://{slug}` and set status to `active`
- If only a platform link is known → fill in the URL and set status to `link-fallback`
- If neither is known → set status to `tbd` and fill in a human-readable fallback instruction

The routing table is the most important part of the contract for customer agents — it tells them the complete service map of this brand, including what this agent delegates and where.

---

## Phase 5 — Validate and Publish

**Gate — Contract Gate**: verify that `./{slug}-skill/agent-card.json` has a non-empty `skills[]` array. `agent-card.json` is auto-generated by `openpersona create` — its `skills[]` maps directly from `persona.json`'s `skills[]`. If it is empty, the root cause is an empty `skills[]` in Phase 3; return to Phase 2 to declare at least one service skill and regenerate.

Confirm the generated pack structure with the user:

```
{slug}-skill/
├── SKILL.md              ← brand agent behavior rules
├── persona.json          ← brand declaration
├── agent-card.json       ← A2A discovery credential
├── acn-config.json       ← ACN registration config
├── soul/
│   ├── injection.md      ← brand soul injection
│   ├── constitution.md   ← ethical foundation (inherited)
│   └── behavior-guide.md ← brand behavior guide
├── scripts/
│   └── state-sync.js     ← cross-session state management
└── references/
    ├── SERVICE-CONTRACT.md  ← service capabilities and boundaries
    └── SIGNAL-PROTOCOL.md   ← host integration guide
```

**Optional — Register on ACN**:

```bash
npx openpersona acn-register {slug} --endpoint https://your-agent-endpoint.example.com
```

This publishes the brand agent's `agent-card.json` to the Agent Communication Network so other agents can discover and call it without installing any brand-specific skill. The `--endpoint` flag is the only value the brand must supply — everything else (`agent-card.json`, `acn-config.json`) was auto-generated by `openpersona create`.

---

## Failure routing


| Gate          | On failure                                                      |
| ------------- | --------------------------------------------------------------- |
| Soul Gate     | Return to Phase 1, collect missing fields                       |
| Service Gate  | Return to Phase 2, add at least one service skill               |
| Generate Gate | Read openpersona validate error, fix persona.json fields, retry |
| Contract Gate | Return to Phase 2, verify skills[] is populated, regenerate     |


---

## Human approval required

Always ask for explicit confirmation before:

- Executing `take_number`, `place_order`, `cancel_order`, or any state-changing operation
- Publishing or registering the agent to ACN or any external network
- Any operation declared in the service contract as requiring confirmation

