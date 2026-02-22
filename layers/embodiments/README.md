# Body Layer — Substrate of Existence

The Body layer defines the complete environment that enables a persona to **exist and act**. Every agent has a body — digital agents have a virtual body (runtime-only), physical agents have both a physical and virtual body.

## Three Dimensions

```
Body
├── physical    ← Physical substrate (robots, IoT, sensors)
├── runtime     ← Digital runtime environment (platform, channels, credentials, resources)
└── appearance  ← Visual representation (avatar, 3D model, style)
```

### Physical (Optional)

For robots, IoT devices, and hardware-embodied agents. Not applicable for digital-only agents (they still have a body via runtime).

```json
{
  "physical": {
    "name": "robot-arm",
    "description": "6-DOF robotic arm control via ROS2 MoveIt",
    "hardwareRef": { "platform": "ros2", "package": "moveit2" },
    "capabilities": ["pick", "place", "gesture"],
    "hardwareRequirements": { "interface": "USB/Serial", "driver": "ros2-serial-bridge" }
  }
}
```

### Runtime (REQUIRED -- every agent's minimum viable body)

Declares the digital substrate the persona expects. When present, the generator injects runtime details into the **Self-Awareness > Body** section of `soul/injection.md` — the persona knows what platform it runs on, what channels are connected, and what credentials it needs.

```json
{
  "runtime": {
    "platform": "openclaw",
    "channels": ["whatsapp", "telegram", "moltbook"],
    "credentials": [
      { "scope": "moltbook", "shared": true, "envVar": "MOLTBOOK_API_KEY" },
      { "scope": "elevenlabs", "shared": false, "envVar": "ELEVENLABS_API_KEY" }
    ],
    "resources": ["filesystem", "network", "browser"]
  }
}
```

**Credential sharing model:**
- `shared: true` — stored in `~/.openclaw/credentials/shared/`, accessible by all personas
- `shared: false` — stored in `~/.openclaw/credentials/persona-<slug>/`, private to this persona

### Appearance (Optional)

Visual representation for UI, XR, and metaverse contexts.

```json
{
  "appearance": {
    "avatar": "https://example.com/avatar.png",
    "style": "photorealistic",
    "model3d": null
  }
}
```

## Self-Awareness: Body

Every persona has a **Body** sub-section within Self-Awareness that includes the Signal Protocol. When `body.runtime` is declared, the generator additionally injects:

1. Knowledge of its runtime platform and connected channels
2. A credential management protocol (shared vs. private paths)
3. Guidance on how to manage its own operational environment

## Roadmap

- `robot-arm` (Future) — robotic arm control via ROS2
- `smart-speaker` (Future) — smart speaker hardware interface
- `humanoid` (Future) — full-body humanoid robot control
- `iot-hub` (Future) — IoT device gateway

## Contributing

To add a new embodiment: create `embodiments/<name>/embodiment.json` following the schema at `schemas/body/embodiment.schema.json`.
