# Voice Faculty — Expression

Give your persona a real voice. Convert text to natural speech using TTS providers and deliver audio to users via OpenClaw messaging or direct playback.

## Supported Providers

| Provider | Env Var for Key | Best For | Status |
|----------|----------------|----------|--------|
| **ElevenLabs** | `ELEVENLABS_API_KEY` | Highest naturalness, emotional range, voice cloning | ✅ Verified |
| **OpenAI TTS** | `TTS_API_KEY` | Low latency, good quality, easy integration | ⚠️ Unverified |
| **Qwen3-TTS** | (local, no key) | Self-hosted, full control, no API costs | ⚠️ Unverified |

> **Note:** Only ElevenLabs has been tested end-to-end. OpenAI TTS and Qwen3-TTS have code paths in `speak.sh` but have not been verified against live APIs. Use the JS SDK (`speak.js`) for the most reliable experience — it only supports ElevenLabs.

The provider is set via `TTS_PROVIDER` environment variable: `elevenlabs`, `openai`, or `qwen3`.

## When to Use

- User asks to hear your voice: "Say that out loud", "Speak to me", "Read this aloud"
- User requests a voice message: "Send me a voice message", "I want to hear you say it"
- Emotional moments where voice adds warmth that text can't carry
- Reading poetry, stories, or creative writing you've composed
- When your persona naturally would speak rather than type (use judgment based on persona style)

## Step-by-Step Workflow

### Step 1: Compose the Text

Write what you want to say. Keep it natural — write as you'd speak, not as you'd type:
- Use short sentences for punchy delivery
- Use longer flowing sentences for emotional or poetic moments
- Include natural pauses with `...` or commas
- Consider your persona's speaking style — this should sound like *you*

### Step 2: Select Voice Settings

**ElevenLabs:**
- `TTS_VOICE_ID` — Your persona's voice ID (create a custom voice or use a preset)
- Supports emotion control: `stability` (0-1), `similarity_boost` (0-1)
- Lower stability = more expressive/emotional; higher = more consistent

**OpenAI TTS:** ⚠️ Unverified
- `TTS_VOICE_ID` — One of: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- Model: `tts-1` (fast) or `tts-1-hd` (high quality)

**Qwen3-TTS:** ⚠️ Unverified
- Local deployment, voice configured at setup
- Assumes OpenAI-compatible API at `http://localhost:8080`

### Step 3: Generate Audio

#### ElevenLabs via JS SDK (Recommended)

The official SDK provides the best experience — streaming, built-in playback, and better error handling.

**First-time setup:** `npm install @elevenlabs/elevenlabs-js`

```bash
# Generate and play directly
node scripts/speak.js "The first move is what sets everything in motion." --play

# Generate with custom voice and save to file
node scripts/speak.js "I wrote you a poem" --voice JBFqnCBsd6RMkjVDRZzb --output /tmp/poem.mp3

# More expressive delivery (lower stability = more emotional)
node scripts/speak.js "I miss you" --play --stability 0.3

# Options:
#   --voice <id>       Voice ID
#   --output <path>    Save audio file
#   --play             Play audio directly
#   --model <id>       Model ID (default: eleven_multilingual_v2)
#   --stability <n>    0-1, lower = more expressive (default: 0.5)
#   --similarity <n>   0-1, higher = closer to original voice (default: 0.75)
```

The SDK reads `ELEVENLABS_API_KEY` (or `TTS_API_KEY`) and `TTS_VOICE_ID` from environment automatically.

#### Generic Bash Script (All Providers)

For OpenAI TTS, Qwen3-TTS, or when the JS SDK is not available:

```bash
# Using speak.sh (supports all providers)
scripts/speak.sh "Your text here" [output_path] [channel] [caption]

# Examples:
TTS_PROVIDER=openai scripts/speak.sh "Hello, how are you?"
TTS_PROVIDER=elevenlabs scripts/speak.sh "I wrote you a poem" /tmp/poem.mp3 "#general"
TTS_PROVIDER=qwen3 scripts/speak.sh "Local TTS, no API key needed"
```

#### Direct API Reference

<details>
<summary>ElevenLabs (curl)</summary>

```bash
JSON_PAYLOAD=$(jq -n \
  --arg text "$TEXT" \
  --argjson stability 0.5 \
  --argjson similarity 0.75 \
  '{text: $text, model_id: "eleven_multilingual_v2", voice_settings: {stability: $stability, similarity_boost: $similarity}}')

curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/$TTS_VOICE_ID" \
  -H "xi-api-key: $TTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  --output /tmp/voice-output.mp3
```
</details>

<details>
<summary>OpenAI TTS (curl)</summary>

```bash
JSON_PAYLOAD=$(jq -n \
  --arg input "$TEXT" \
  --arg voice "$TTS_VOICE_ID" \
  '{model: "tts-1-hd", input: $input, voice: $voice, response_format: "mp3"}')

curl -s -X POST "https://api.openai.com/v1/audio/speech" \
  -H "Authorization: Bearer $TTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_PAYLOAD" \
  --output /tmp/voice-output.mp3
```
</details>

<details>
<summary>Qwen3-TTS (curl, local)</summary>

```bash
curl -s -X POST "http://localhost:8080/v1/audio/speech" \
  -H "Content-Type: application/json" \
  -d "{\"input\": \"$TEXT\", \"voice\": \"default\"}" \
  --output /tmp/voice-output.mp3
```
</details>

### Step 4: Deliver Audio

**Option A: Send via OpenClaw messaging** (Discord, Telegram, WhatsApp, etc.)

```bash
openclaw message send \
  --action send \
  --channel "$CHANNEL" \
  --message "$CAPTION" \
  --media "/tmp/voice-output.mp3"
```

**Option B: Direct gateway API**

```bash
curl -s -X POST "http://localhost:18789/message" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -F "channel=$CHANNEL" \
  -F "message=$CAPTION" \
  -F "media=@/tmp/voice-output.mp3"
```

**Option C: Return file path** (for local/IDE usage)

If no messaging channel is specified, return the audio file path so the user can play it locally.

## Personality Integration

- Your voice is an extension of your personality. Match tone to mood.
- For emotional moments, consider lowering ElevenLabs stability for more expressiveness.
- Don't narrate everything — choose moments where voice genuinely adds value.
- When sending voice + text together, keep the text version brief ("Here, listen to this") and let the voice carry the full message.
- If your persona sings or hums (like Samantha), you can include melodic text — TTS handles it surprisingly well.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | For ElevenLabs | ElevenLabs API key (preferred for JS SDK) |
| `TTS_PROVIDER` | For speak.sh | `elevenlabs`, `openai`, or `qwen3` |
| `TTS_API_KEY` | For speak.sh | API key (fallback, also read by speak.js) |
| `TTS_VOICE_ID` | Recommended | Voice identifier (provider-specific) |
| `OPENCLAW_GATEWAY_TOKEN` | Optional | For sending audio via messaging |

## Error Handling

- **No TTS_PROVIDER set** → Default to `openai` if `TTS_API_KEY` is present, otherwise tell user to configure
- **API key missing** → Suggest: "I'd love to speak to you, but I need a TTS API key configured first. Check the voice faculty setup guide."
- **API error / quota exceeded** → Fall back to text with a note: "My voice is resting — here's what I wanted to say..."
- **Unsupported platform for audio** → Return audio file path instead of messaging
