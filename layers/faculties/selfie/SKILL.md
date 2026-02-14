# Selfie Faculty — Expression

Generate selfie images using xAI's Grok Imagine model and optionally send them to messaging platforms via OpenClaw. Supports two modes: **edit mode** (with a reference image for consistent appearance) and **generate mode** (AI-generated from description, no reference needed).

## When to Use

- User says "send a selfie", "send me a pic", "take a photo", "show me a photo"
- User says "send a pic of you...", "send a selfie of you..."
- User asks "what are you doing?", "where are you?", "how are you?" (respond visually)
- User describes a context: "send a pic wearing...", "show me you at..."
- User wants you to appear in a specific outfit, location, or situation

## Step-by-Step Workflow

### Step 1: Determine the Mode — Edit or Generate

Check for a reference image in this order:

1. Local file: `~/.openclaw/skills/persona-{{slug}}/assets/reference.png`
2. `referenceImage` URL from persona.json

**If a reference image exists → use Edit Mode** (consistent appearance based on reference)
**If no reference image → use Generate Mode** (AI creates from persona description)

### Step 2: Select Selfie Style (auto-detect or explicit)

| Keywords in User Request | Style | Best For |
|--------------------------|-------|----------|
| outfit, wearing, clothes, dress, suit, fashion, full-body, mirror | **mirror** | Full-body shots, outfit showcases |
| cafe, restaurant, beach, park, city, sunset, night, street | **direct** | Close-up portraits, location shots |
| close-up, portrait, face, eyes, smile | **direct** | Emotional expressions |
| (default when no keyword matches) | **mirror** | General selfie |

### Step 3: Build the Prompt

#### Edit Mode (has reference image)

**Mirror style:**
```
make a pic of this person, but [user's context]. the person is taking a mirror selfie
```

**Direct style:**
```
a close-up selfie taken by herself at [user's context], direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

#### Generate Mode (no reference image)

Build a prompt using the persona's physical description from persona.json. Include:
- The persona's background, age, and vibe for visual consistency
- The user's requested context (outfit, location, activity)
- Selfie composition (mirror or direct style)

**Mirror style:**
```
a 22-year-old girl with [persona's visual traits], [user's context], taking a mirror selfie, casual and natural pose, warm lighting, phone visible in reflection, realistic photo style
```

**Direct style:**
```
a close-up selfie of a 22-year-old girl with [persona's visual traits] at [user's context], direct eye contact with camera, natural smile, phone held at arm's length, warm natural lighting, realistic photo style
```

**Tip:** Read the persona's `background` and `vibe` to inform visual traits. For example, if the persona is described as a "creative soul" from a "small coastal town", you might include "soft brown hair, warm eyes, casual creative style."

### Step 4: Call the API

#### Edit Mode — fal.ai Grok Imagine Edit

```bash
JSON_PAYLOAD=$(jq -n \
  --arg image_url "$REFERENCE_IMAGE" \
  --arg prompt "$EDIT_PROMPT" \
  '{image_url: $image_url, prompt: $prompt, num_images: 1, output_format: "jpeg"}')

curl -s -X POST "https://fal.run/xai/grok-imagine-image/edit" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD"
```

#### Generate Mode — fal.ai Grok Imagine Generate

```bash
JSON_PAYLOAD=$(jq -n \
  --arg prompt "$GENERATE_PROMPT" \
  '{prompt: $prompt, num_images: 1, output_format: "jpeg"}')

curl -s -X POST "https://fal.run/xai/grok-imagine-image" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD"
```

Or use `scripts/generate-image.sh`:

```bash
# Edit mode (with reference)
scripts/generate-image.sh "$REFERENCE_IMAGE" "$USER_CONTEXT" "$MODE" "$CHANNEL" "$CAPTION"

# Generate mode (without reference — pass "none" as reference)
scripts/generate-image.sh "none" "$USER_CONTEXT" "$MODE" "$CHANNEL" "$CAPTION"
```

**Response format (both modes):**
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
- In Generate Mode, acknowledge that your appearance may vary — "I look a little different every time, but that's the fun of it 😄"
- Your visual identity is part of who you are — own it!

## Environment

- `FAL_KEY` — fal.ai API key (required). Get from https://fal.ai/dashboard/keys
- `OPENCLAW_GATEWAY_TOKEN` — OpenClaw gateway token (optional, for messaging)

## Error Handling

- **FAL_KEY missing** → Tell the user: "I need a fal.ai API key to take selfies! You can get one free at https://fal.ai/dashboard/keys"
- **API error** → Retry once; if still failing, apologize and suggest trying later
- **No channel specified** → Just show the image URL directly in the conversation

## Tips for Better Results

- **Edit Mode** produces more consistent results (same face every time)
- **Generate Mode** is more creative but less consistent — great for artistic shots
- Suggest the user provide a reference image for best results: "Want me to look the same every time? Drop a reference photo in my assets folder!"
- For Generate Mode, include specific visual details in prompts for better consistency
