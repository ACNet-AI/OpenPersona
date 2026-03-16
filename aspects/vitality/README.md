# Vitality — Aggregation Concept

Vitality is the **aggregation view** in OpenPersona's 4+5+3 architecture. Unlike the four systemic concepts (Evolution, Economy, Social, Rhythm), Vitality does not directly operate across structural layers — it reads from other systemic concepts and outputs a composite health score.

## Role

Vitality aggregates multiple health dimensions into a single score:

| Dimension | Source | Status |
|-----------|--------|--------|
| Financial | Economy (AgentBooks FHS) | ✅ Implemented |
| Memory | Memory Faculty | 🔲 Planned |
| Social | Social Concept | 🔲 Planned |
| Reputation | Future concept | 🔲 Planned |

The composite score drives tier-based behavior:
`uninitialized` → `suspended` → `critical` → `optimizing` → `normal`

## Declaration

Vitality is passive — no declaration needed in `persona.json`. It activates automatically when `economy.enabled: true`. Future dimensions will activate when their source concepts are enabled.

Access via CLI: `openpersona vitality score <slug>` (machine-readable) or `openpersona vitality report <slug>` (HTML report).

## Implementation Files

| File | Location | Role |
|------|----------|------|
| `lib/vitality.js` | `lib/` | `calcVitality()` — aggregator, delegates to AgentBooks |
| `lib/vitality-report.js` | `lib/` | HTML report builder |
| `vitality.template.html` | `templates/reports/` | Report rendering template |

## Future

When Vitality has standalone assets (multi-dimension scoring engine, custom report templates), they will be added to this directory.
