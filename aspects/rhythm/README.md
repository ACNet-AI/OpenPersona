# Rhythm — Systemic Concept

Rhythm is one of the **five systemic concepts** in OpenPersona's 4+5+3 architecture. It governs the persona's temporal behavior — proactive outreach cadence and time-of-day modulation.

## Role

Rhythm crosses two structural layers:
- **Soul**: declares the strategy (`rhythm.heartbeat.strategy`, `rhythm.circadian`) — the persona's intent and character expression in time
- **Body**: runtime reads `rhythm.heartbeat` and `rhythm.circadian` from `persona.json` to schedule proactive conversations

## Two Sub-Dimensions

| Sub-dimension | Field | Description |
|---------------|-------|-------------|
| Heartbeat | `rhythm.heartbeat` | Proactive outreach cadence — how often the persona initiates contact |
| Circadian | `rhythm.circadian` | Time-of-day behavior modulation — energy, tone, topics shift by time |

## Declaration

```json
{
  "rhythm": {
    "heartbeat": {
      "enabled": true,
      "strategy": "emotional",
      "maxDaily": 3,
      "quietHours": [0, 8]
    },
    "circadian": {
      "morning": { "energy": "high", "topics": ["goals", "planning"] },
      "night":   { "energy": "low",  "topics": ["reflection", "wind-down"] }
    }
  }
}
```

> Note: The flat top-level `heartbeat` field is deprecated — use `rhythm.heartbeat`.

## Implementation Files

| File | Location | Role |
|------|----------|------|
| `soul-awareness-body.partial.md` | `templates/partials/` | Heartbeat awareness injection |
| Heartbeat sync logic | `lib/generator-derived.js` | `_heartbeatConfig` derived field |
| `syncHeartbeat()` | `lib/switcher.js` | Syncs heartbeat config to runner on install/switch |

## Future

When Rhythm has standalone source assets (e.g. circadian behavior templates, heartbeat scheduling scripts), they will be added to this directory.
