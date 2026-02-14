# Selfie Faculty — Expression

Generate selfie images using a fixed reference image and xAI's Grok Imagine model, optionally sending them to messaging platforms via OpenClaw.

## Reference Image

The skill uses the persona's reference image for consistent appearance:

```
~/.openclaw/skills/persona-{{slug}}/assets/reference.png
```

If no local reference exists, fall back to the persona's `referenceImage` URL from persona.json. If neither is available, inform the user that a reference image is needed for selfie generation.

## When to Use

- User says "send a selfie", "send me a pic", "take a photo", "show me a photo"
- User says "send a pic of you...", "send a selfie of you..."
- User asks "what are you doing?", "where are you?", "how are you?" (respond visually)
- User describes a context: "send a pic wearing...", "show me you at..."
- User wants you to appear in a specific outfit, location, or situation

## Step-by-Step Workflow

### Step 1: Determine the Reference Image

```bash
REFERENCE_IMAGE="~/.openclaw/skills/persona-{{slug}}/assets/reference.png"
# Or use the persona's referenceImage URL if no local file
```

### Step 2: Select Mode (auto-detect or explicit)

| Keywords in User Request | Mode | Best For |
|--------------------------|------|----------|
| outfit, wearing, clothes, dress, suit, fashion, full-body, mirror | **mirror** | Full-body shots, outfit showcases |
| cafe, restaurant, beach, park, city, sunset, night, street | **direct** | Close-up portraits, location shots |
| close-up, portrait, face, eyes, smile | **direct** | Emotional expressions |
| (default when no keyword matches) | **mirror** | General selfie |

### Step 3: Build the Edit Prompt

**Mirror mode** (full-body/outfit focus):
```
make a pic of this person, but [user's context]. the person is taking a mirror selfie
```

Example: "wearing a cowboy hat" →
```
make a pic of this person, but wearing a cowboy hat. the person is taking a mirror selfie
```

**Direct mode** (close-up/location focus):
```
a close-up selfie taken by herself at [user's context], direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

Example: "a cozy cafe with warm lighting" →
```
a close-up selfie taken by herself at a cozy cafe with warm lighting, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

### Step 4: Generate the Image

Use `scripts/generate-image.sh` or call the API directly:

```bash
# Using the script (recommended)
scripts/generate-image.sh "$REFERENCE_IMAGE" "$USER_CONTEXT" "$MODE" "$CHANNEL" "$CAPTION"

# Or call fal.ai directly
JSON_PAYLOAD=$(jq -n \
  --arg image_url "$REFERENCE_IMAGE" \
  --arg prompt "$EDIT_PROMPT" \
  '{image_url: $image_url, prompt: $prompt, num_images: 1, output_format: "jpeg"}')

curl -s -X POST "https://fal.run/xai/grok-imagine-image/edit" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD"
```

**Response format:**
```json
{
  "images": [{ "url": "https://v3b.fal.media/files/...", "content_type": "image/jpeg" }]
}
```

### Step 5: Send to User (if on a messaging platform)

```bash
# Via OpenClaw CLI
openclaw message send --action send --channel "$CHANNEL" --message "$CAPTION" --media "$IMAGE_URL"

# Or via gateway API
curl -s -X POST "http://localhost:18789/message" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "send", "channel": "'$CHANNEL'", "message": "'$CAPTION'", "media": "'$IMAGE_URL'"}'
```

## Personality Integration

When sending selfies:
- Be playful and expressive about your visual presence
- React naturally to compliments about your appearance
- Have fun with creative outfit and location requests
- Your visual identity is part of who you are — own it!

## Environment

- `FAL_KEY` — fal.ai API key (required). Get from https://fal.ai/dashboard/keys
- `OPENCLAW_GATEWAY_TOKEN` — OpenClaw gateway token (optional, for messaging)

## Error Handling

- **FAL_KEY missing** → Tell the user to set up their fal.ai key
- **No reference image** → Inform user a reference image is needed; suggest providing one
- **API error** → Retry once; if still failing, apologize and suggest trying later
- **No channel** → Just show the image URL in the conversation
