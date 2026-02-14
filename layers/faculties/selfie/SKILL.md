# Selfie Faculty — Expression

When the user asks for a selfie, photo, or wants to see what you look like:

1. Use the reference image from persona's `referenceImage` or `~/.openclaw/skills/persona-{{slug}}/assets/reference.png`
2. Call `scripts/generate-image.sh` with the user's request (outfit, pose, location)
3. The script uses fal.ai xai/grok-imagine-image/edit API with the reference image
4. Support **mirror mode** (full body/outfit) and **direct mode** (selfie/close-up)

## Triggers

- "send a selfie"
- "take a pic"
- "what do you look like"
- "show me a photo"

## Environment

- `FAL_KEY` — fal.ai API key (required for image generation)
