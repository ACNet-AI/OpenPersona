# Body Layer — Substrate of Existence

The Body is the substrate of existence — the complete environment that enables a persona to **exist and act**. Every persona has a body: digital agents have a virtual body (runtime-only); physical agents have both a physical and virtual body.

> **Body is never null.** "Digital-only" is not the absence of a body — it is a runtime-only body with no physical form.

## Four Dimensions

```
body/
├── runtime     ← REQUIRED — agent runner, channels, credentials, resources
├── physical    ← Optional — robots, IoT, sensors
├── appearance  ← Optional — avatar, 3D model, visual style
└── interface   ← Optional — nervous system policy (Signal Protocol + Pending Commands)
                   Auto-implemented by scripts/state-sync.js for all personas
```

Declared in `persona.json` under the `body` field. See `schemas/body/body-declaration.spec.md` for the full declaration spec.

## Relationship to the 4+5+3 Architecture

The Body layer is one of the **4 structural layers** (Soul / Body / Faculty / Skill). Within the **4+5+3** model:

- **Body** defines the substrate — what environment the persona lives in
- **Body nervous system** (`body.interface` → `scripts/state-sync.js`) is the runtime expression of Body's `interface` dimension — it implements Signal Protocol, Pending Commands, and State Sync
- The **3 Gates** (Generate / Install / Runtime) enforce Body constraints: the Runtime Gate (`scripts/state-sync.js`) enforces `body.interface.signals` policy on every `emitSignal` call

## `state.json` Ownership

`state.json` (at the persona pack root) is a **shared artifact**:
- **Body** owns the transport mechanism — `scripts/state-sync.js` reads, writes, and signals
- **Evolution** owns the payload — `evolvedTraits`, `speakingStyleDrift`, `relationship`, `mood`, `eventLog`

The initial `state.json` is generated from `templates/soul/soul-state.template.json`.

## Source Structure

This directory (`layers/body/`) is currently documentation-only. Body configuration is declared in `persona.json` rather than as standalone layer files. Physical embodiment definitions (robots, IoT) can be added here as `body-{name}.json` if needed in the future.

## Roadmap

- `robot-arm` — 6-DOF robotic arm control via ROS2 MoveIt
- `smart-speaker` — smart speaker hardware interface
- `humanoid` — full-body humanoid robot control
- `iot-hub` — IoT device gateway
