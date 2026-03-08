# Visual Manifest (v0.1)

`Visual Manifest` is the cross-engine visual protocol for persona embodiment.

It defines *state parameters* only, not a specific renderer or model format.
Any runtime (WebGL, UE5, VRM, Live2D, video provider) can consume this payload.

## Design Goals

- Keep OpenPersona engine-agnostic.
- Map soul/evolution state into visual expression.
- Support graceful degradation (high-fidelity -> simple 2D -> static image).

## Payload

```json
{
  "version": "0.1",
  "mood": {
    "valence": 0.0,
    "arousal": 0.0,
    "intensity": 0.0
  },
  "breath": {
    "rate": 0.4,
    "amplitude": 0.3
  },
  "pulse": {
    "bpm": 72,
    "variability": 0.15
  },
  "microExpression": {
    "eyeFocus": 0.5,
    "pupil": 0.5,
    "mouthCurve": 0.0
  },
  "aura": {
    "hue": 32,
    "saturation": 0.55,
    "luminance": 0.62,
    "flow": 0.7
  },
  "envSync": {
    "timeOfDay": "dusk",
    "ambientCct": 4200,
    "ambientLux": 180
  },
  "motionStyle": {
    "softness": 0.7,
    "jitter": 0.1,
    "latencyMs": 120
  },
  "signals": [
    "deep_topic",
    "breakthrough"
  ]
}
```

## Field Semantics

- `mood`: high-level emotional embedding; range fields SHOULD be normalized to `[-1, 1]` or `[0, 1]` as noted by runtime implementation.
- `breath`: breathing animation driver for chest/shoulder/camera parallax.
- `pulse`: subtle rhythmic modulation for glow/noise/light beat.
- `microExpression`: eye and mouth micro-adjustments for conversational realism.
- `aura`: non-photoreal style channel (color, glow, fluidity, distortion).
- `envSync`: physical context handshake from host environment (time/light).
- `motionStyle`: pacing and smoothness profile for procedural animation.
- `signals`: discrete semantic tags for short-lived visual accents.

## Mapping Guidance

- Soul/Evolution -> `mood`, `signals`
- Economy/Vitality pressure -> `pulse.variability`, `motionStyle.jitter`
- Time/ambient data -> `envSync`
- Conversation topic intensity -> `aura.flow`, `microExpression.*`

## Compatibility Rules

- Producers MUST include `version`.
- Consumers MUST ignore unknown fields.
- Missing fields MUST fallback to renderer defaults.
- Providers MAY provide partial payloads; runtime merges defaults.

## Integration Point

- OpenPersona bridge writes `appearanceState.visualManifest`.
- Agent-driven avatar control data is carried in `appearanceState.control` (see `AVATAR-CONTROL.md`).
- avatar-runtime returns `visualManifest` in `/v1/status`.
- Clients (e.g. `demo/living-canvas.html`) render from the merged state.
