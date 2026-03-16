# Economy — Systemic Concept

Economy is one of the **five systemic concepts** in OpenPersona's 4+5+3 architecture. It governs financial tracking, cost recording, and survival policy for autonomous economic agents.

## Role

Economy is a thin wrapper around the **[AgentBooks](https://github.com/acnlabs/agentbooks)** npm package. Financial logic lives entirely in AgentBooks; this aspect only maps OpenPersona env vars and provides lifecycle hooks.

Economy crosses two structural layers:
- **Body**: runtime cost recording via `scripts/economy-hook.js` (post-conversation)
- **Soul**: `economy.survivalPolicy: true` enables tier-driven behavior that modifies how the persona responds based on financial health

## Declaration

```json
{
  "economy": {
    "enabled": true,
    "survivalPolicy": false
  }
}
```

- `enabled: true` — activates economy scripts in the generated pack
- `survivalPolicy: false` (default) — silent tracking only; set `true` for autonomous agents that act on financial health

## Implementation Files

| File | Role |
|------|------|
| `scripts/economy.js` | All management commands → delegates to `agentbooks/cli/economy` |
| `scripts/economy-guard.js` | Outputs `FINANCIAL_HEALTH_REPORT` → delegates to `agentbooks/cli/economy-guard` |
| `scripts/economy-hook.js` | Post-conversation cost recorder → delegates to `agentbooks/cli/economy-hook` |
| `SKILL.md` | Behavior guide: how the persona uses economy scripts and responds to vitality tiers |

## Activation

When `economy.enabled: true`, the generator:
1. Copies `scripts/economy*.js` to the generated pack
2. Generates `economy/economic-identity.json` and `economy/economic-state.json`
3. Injects Survival Policy guidance into `soul/injection.md` (if `survivalPolicy: true`)

## Note

Economy is **not a Faculty** — it does not follow the `faculty.json` contract and does not appear in the Faculty table in `SKILL.md`. It is loaded via `loadEconomy()` in the generator, not `loadFaculty()`.
