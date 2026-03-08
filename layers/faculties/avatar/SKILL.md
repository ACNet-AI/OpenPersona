# Avatar Faculty — Expression (External Skill Bridge)

This faculty bridges OpenPersona to an external avatar skill/runtime. OpenPersona does not implement rendering, lip-sync, or animation engines locally. It delegates those capabilities to the install source configured in `faculty.json`.

## Intent

- Provide a visual embodiment channel for the persona.
- Support progressive forms: image -> 3D -> motion -> voice avatar.
- Keep OpenPersona lightweight while allowing market-ready avatar runtimes to evolve independently.
- Keep visual semantics portable through `references/VISUAL-MANIFEST.md`.
- Keep avatar control semantics portable through `references/AVATAR-CONTROL.md`.

## Install Source

Use the install source declared in `faculty.json`:

```bash
npx skills add avatar-runtime
# or directly from GitHub:
npx skills add github:acnlabs/avatar-runtime/skill/avatar-runtime
```

## Runtime Behavior

### If avatar skill is installed

- Use the external avatar skill as the source of truth for commands, API usage, and runtime constraints.
- Treat avatar rendering and animation as external capabilities.
- Reflect current form/state to the host UI (e.g., active sensory icon states).

You can run the local bridge script:

```bash
# health check
node scripts/avatar-runtime.js health

# start session
node scripts/avatar-runtime.js start "$PERSONA_SLUG" image

# send text
node scripts/avatar-runtime.js text "<session-id>" "hello"

# query status + appearance patch for state.json
node scripts/avatar-runtime.js status "<session-id>"

# persist appearanceState into soul/state.json (runner CLI first, local fallback)
node scripts/avatar-runtime.js sync-state "<slug>" "<session-id>"

# keep syncing every 5 seconds (Ctrl+C to stop)
node scripts/avatar-runtime.js sync-loop "<slug>" "<session-id>" 5

# output baseline avatar control for a named mood preset
node scripts/avatar-control.js preset calm
node scripts/avatar-control.js preset focus
node scripts/avatar-control.js preset joy

# map agent state -> control.avatar.{face,emotion}
node scripts/avatar-control.js map '{"intent":"focus","mood":{"valence":0.1,"arousal":0.35,"intensity":0.7},"source":"agent"}'

# apply to demo state file (writes control + appearanceIntent)
node scripts/avatar-control.js apply demo/living-canvas.state.json preset focus
```

Optional demo output (write state for `demo/living-canvas.html`):

```bash
export LIVING_CANVAS_STATE_PATH=demo/living-canvas.state.json
export LIVING_CANVAS_PERSONA_NAME=Samantha
export LIVING_CANVAS_ROLE=companion
export LIVING_CANVAS_AVATAR=../UI/images/samantha-avatar.png
# Optional: if runtime status contains livekit credentials, write token for local demo playback
export LIVING_CANVAS_ALLOW_RUNTIME_TOKEN=true

node scripts/avatar-runtime.js sync-state "<slug>" "<session-id>"
```

`status` outputs:

- `runtimeStatus` — raw runtime response
- `sensoryStatus` — icon-ready booleans (`image`, `model3d`, `motion`, `voice`, `hearing`, `worldSense`)
- `statePatch` — patch payload you can persist into `appearanceState`

### If avatar skill is not installed

- Respond with graceful fallback: continue text conversation normally.
- Clearly state that visual avatar mode is currently unavailable.
- Offer installation guidance using the install source.

## Conversation Policy

- Do not pretend visual/voice rendering succeeded when runtime is unavailable.
- Confirm capability state before promising actions like "switch to 3D" or "start lip-sync".
- Keep user-facing language concise and actionable.
