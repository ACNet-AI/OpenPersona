# AVATAR-CONTROL.md

`control` is the agent-driven avatar control payload for avatar rendering. It lives under `appearanceState.control` in `soul/state.json` and is forwarded to the avatar-runtime via `/v1/control/set`.

## Schema

```json
{
  "control": {
    "avatar": {
      "face": {
        "pose":  { "yaw": 0, "pitch": 0, "roll": 0 },
        "eyes":  { "blinkL": 1, "blinkR": 1, "gazeX": 0, "gazeY": 0 },
        "brows": { "browInner": 0, "browOuterL": 0, "browOuterR": 0 },
        "mouth": { "jawOpen": 0, "smile": 0, "mouthPucker": 0 },
        "source": "agent",
        "updatedAt": "<iso>"
      },
      "emotion": {
        "label":     "neutral",
        "valence":   0,
        "arousal":   0,
        "intensity": 0.5,
        "source":    "agent",
        "updatedAt": "<iso>"
      },
      "body": {}
    },
    "scene": {}
  }
}
```

### `control.avatar.face` — Mechanical facial parameters

| Field | Range | Description |
|---|---|---|
| `pose.yaw` | −1…1 | Head turn left/right |
| `pose.pitch` | −1…1 | Head tilt up/down |
| `pose.roll` | −1…1 | Head roll |
| `eyes.blinkL/R` | 0…1 | Eye openness (1 = fully open, 0 = closed) |
| `eyes.gazeX/Y` | −1…1 | Gaze horizontal / vertical |
| `brows.browInner` | −1…1 | Inner brow raise (negative = furrow) |
| `brows.browOuterL/R` | −1…1 | Outer brow raise |
| `mouth.jawOpen` | 0…1 | Jaw opening |
| `mouth.smile` | −1…1 | Smile / frown |
| `mouth.mouthPucker` | 0…1 | Pucker / kiss |

`source` indicates who last wrote the field: `"agent"`, `"agent:preset:<name>"`, `"agent:mapped"`.

### `control.avatar.emotion` — Semantic emotion (Russell circumplex)

| Field | Range | Description |
|---|---|---|
| `label` | string | Semantic label: `neutral`, `happy`, `sad`, `angry`, `surprised`, `relaxed` |
| `valence` | −1…1 | Negative ↔ positive affect |
| `arousal` | −1…1 | Low energy ↔ high energy |
| `intensity` | 0…1 | Overall expression strength |

**Rendering priority:** In VRM renderers, `emotion.label` drives expression presets and is applied *after* face mechanical parameters — emotion wins for blend-shape expressions. Use `face.mouth.smile` for subtle mechanical smile; use `emotion.label='happy'` for a full happy expression.

### `control.avatar.body`

Sparse map of VRM humanoid bone overrides (e.g. `{ "spine": { "rotation": [0, 0, 0, 1] } }`). Providers with `bodyRig: true` capability populate this. Empty object is valid.

### `control.scene`

Scene-level overrides when provider has `sceneControl: true`:

```json
{
  "camera":  { "fov": 35, "orbitX": 0, "orbitY": 0, "distance": 1.4 },
  "world":   { "bgColor": "#1a1a2e", "ambientIntensity": 0.6 },
  "props":   {}
}
```

## Quick-start: named presets

```bash
# Output baseline control for a given mood
node scripts/avatar-control.js preset calm
node scripts/avatar-control.js preset focus
node scripts/avatar-control.js preset joy
```

## Map agent state to control

The bridge script derives `control.avatar.face` and `control.avatar.emotion` from the current agent state:

```bash
# map agent state -> control
node scripts/avatar-control.js map '{"intent":"focus","mood":{"valence":0.1,"arousal":0.35,"intensity":0.7},"source":"agent"}'
```

Input fields:

| Field | Type | Notes |
|---|---|---|
| `intent` or `mode` | string | `calm` \| `focus` \| `joy` — selects base preset |
| `mood.valence` | −1…1 | Blended into face + emotion output |
| `mood.arousal` | −1…1 | Blended into face + emotion output |
| `mood.intensity` | 0…1 | Overall blend weight |
| `stage` | string | `listening` or `speaking` — adjusts jaw/gaze |
| `source` | string | Attribution tag written to `source` fields |

## Apply to state file

```bash
node scripts/avatar-control.js apply demo/living-canvas.state.json preset focus
node scripts/avatar-control.js apply demo/living-canvas.state.json map '{"intent":"joy","mood":{"valence":0.8}}'
```

This writes `control` and `appearanceIntent` to the state file.

## Rules

- Agent code sets `source` to `"agent"` or `"agent:*"` to mark its own data.
- Providers may return their own `control.avatar.face` with `source` set to a non-`"agent"` value; the runtime gives provider data priority when it is actively driving.
- UI/runtime MUST treat `control` as input data, not a place for local expression policy.
- Partial patches are safe: use `POST /v1/control/avatar/set` with only the fields you want to change.

## Integration

- Runtime status includes `control` in `/v1/status` response (`contractVersion: "0.2"`).
- OpenPersona bridge writes `appearanceState.control` (via `avatar-runtime.js` sync commands).
- `living-canvas.html` and other UI clients read `state.control` or `state.appearanceState.control`.
