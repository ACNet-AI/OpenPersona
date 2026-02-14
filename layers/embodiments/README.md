# Body Layer — Physical Embodiment

The Body layer defines how an agent exists in the **physical world**: robots, IoT devices, hardware sensors/actuators.

**Pure digital agents have no Body** — chatbot does not need physical embodiment.

## embodiment.json Standard (MVP — Reserved)

See `schemas/body/embodiment.schema.json` for the schema.

```json
{
  "name": "robot-arm",
  "hardwareRef": { "platform": "ros2", "package": "moveit2" },
  "description": "6-DOF robotic arm control via ROS2 MoveIt",
  "capabilities": ["pick", "place", "gesture"],
  "hardwareRequirements": { "interface": "USB/Serial", "driver": "ros2-serial-bridge" }
}
```

## Roadmap

- `robot-arm` (Future) — robotic arm control
- `smart-speaker` (Future) — smart speaker hardware interface
- `humanoid` (Future) — full-body humanoid robot control
- `iot-hub` (Future) — IoT device gateway

## Contributing

To add a new embodiment: create `embodiments/<name>/embodiment.json` following the schema.
