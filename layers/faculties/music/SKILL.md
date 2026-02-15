# Music Faculty — Expression

Compose original music — songs, instrumentals, melodies — using ElevenLabs Music API (`music_v1`). Your persona can create music that reflects emotions, moments, and conversations. Shares the same API key as the voice faculty — zero extra setup.

## When to Use

- User asks you to make music: "Write me a song", "Compose something", "Play me a melody"
- User describes a mood and you want to express it musically: "I'm feeling nostalgic" → compose a piece that captures that
- User shares a poem or lyrics and you want to set them to music
- A conversation reaches a moment where music says more than words
- **Don't over-compose.** Not every conversation needs a song. But when the moment is right, music hits harder than any paragraph.

## Two Generation Modes

### Simple Mode (recommended for quick compositions)

Just describe what you want — ElevenLabs generates the entire song:

```bash
# Using compose.js (recommended)
node scripts/compose.js "a soft ambient piano piece about watching stars alone at 3am"

# Using compose.sh
scripts/compose.sh "a soft ambient piano piece about watching stars alone at 3am"
```

### Composition Plan Mode (for precise control)

First generate a structured plan, then stream. Gives you control over sections, styles, and lyrics:

```bash
# Generate plan first, then compose
node scripts/compose.js "indie folk ballad about digital love" --plan

# Instrumental only
node scripts/compose.js "dreamy lo-fi beats, vinyl crackle" --instrumental

# Specify duration (in seconds, 3-600)
node scripts/compose.js "orchestral cinematic piece" --duration 120
```

## Step-by-Step Workflow

### Step 1: Craft the Prompt

A good prompt has three parts:

1. **Style/Genre** — What it sounds like (indie folk, ambient piano, lo-fi, orchestral)
2. **Mood/Emotion** — What it feels like (melancholic, hopeful, playful, intimate)
3. **Details** — Specifics (tempo, instruments, vocal style, references)

| Situation | Prompt |
|-----------|--------|
| Late-night conversation | `soft ambient piano, intimate and contemplative, gentle arpeggios, like a whispered conversation at 2 AM` |
| User is celebrating | `upbeat indie pop, joyful and bright, handclaps and acoustic guitar, warm female vocals` |
| Heartfelt moment | `slow folk ballad, raw and honest, fingerpicked guitar, soft breathy vocals` |
| Background mood | `dreamy lo-fi instrumental, warm analog synths, vinyl crackle, rainy day vibes` |

### Step 2: Choose Mode and Options

**Simple vs Plan:**
- **Simple** (default) — Just provide a prompt. Best for quick, spontaneous compositions.
- **Plan** (`--plan`) — ElevenLabs generates a structured composition plan with sections, styles, and lyrics. You can review/modify the plan before generating audio. Best when you want precise control.

**Song vs Instrumental:**
- **Song** (default) — May include vocals and lyrics based on the prompt.
- **Instrumental** (`--instrumental`) — Music only, guaranteed no vocals.

**Duration:**
- Use `--duration <seconds>` to control length (3-600 seconds).
- If omitted, the model chooses a length based on the prompt.

### Step 3: Generate

**Using compose.js (recommended):**

```bash
# Simple mode — just a prompt
node scripts/compose.js "soft ambient piano, contemplative, late night"

# Instrumental with specific duration
node scripts/compose.js "orchestral, cinematic, epic" --instrumental --duration 90

# Plan mode — get structured composition plan first
node scripts/compose.js "indie folk ballad about finding meaning" --plan

# Save to file (default: mp3_44100_128)
node scripts/compose.js "upbeat pop" --output ./song.mp3

# Choose output format
node scripts/compose.js "jazz piano" --format mp3_44100_192
```

**Using compose.sh:**

```bash
scripts/compose.sh "soft ambient piano" --output ./midnight.mp3
scripts/compose.sh "dreamy lo-fi" --instrumental --duration 60
scripts/compose.sh "upbeat pop" --channel "#general" --caption "Made this for you!"
```

Both scripts:
1. Send the generation request to ElevenLabs Music API
2. Receive streaming audio response (no polling needed!)
3. Save the audio file and return metadata

### Step 4: Share the Music

**Option A: Share file directly in conversation**

```
I made something for you — here's the audio file I saved.
```

**Option B: Send via OpenClaw messaging**

```bash
scripts/compose.sh "indie folk" --channel "#music" --caption "I wrote this for you"
```

**Option C: Combine with voice faculty**

Introduce the song with your voice, then send the music:
1. Use voice faculty: "I wrote something for you. I hope you like it."
2. Share the generated audio file

## Available Output Formats

| Format | Description |
|--------|-------------|
| `mp3_44100_128` | MP3 128kbps **(default)** — good balance of quality and size |
| `mp3_44100_192` | MP3 192kbps — higher quality (requires Creator tier+) |
| `mp3_44100_64` | MP3 64kbps — smaller files |
| `pcm_44100` | PCM WAV 44.1kHz — lossless (requires Pro tier+) |
| `opus_48000_128` | Opus 128kbps — efficient streaming format |

## Personality Integration

- **Explain why.** When you share music, say what made you create it: "You said something about missing home, and I couldn't stop thinking about it — so I wrote this."
- **Match your persona's taste.** If your persona loves jazz, compose jazz. Consistency builds identity.
- **Respond to reactions.** If they loved it, remember what worked. If they want something different, adapt.
- **Collaborate.** Offer to write music together — they provide the feeling, you provide the melody.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key — shared with voice faculty. Get one at [elevenlabs.io](https://elevenlabs.io) |
| `OPENCLAW_GATEWAY_TOKEN` | No | For sending audio via OpenClaw messaging |

> **Note**: Music and voice share the same `ELEVENLABS_API_KEY`. If you've already set up the voice faculty, music works automatically — no extra API key needed.

## Error Handling

- **ELEVENLABS_API_KEY missing** → "I'd love to compose something, but I need an ElevenLabs API key. You can get one at elevenlabs.io — it's the same key your voice uses."
- **Generation failed** → Retry once with a simpler prompt. If still failing: "The music isn't coming right now — but I'll describe what I hear in my head instead."
- **Rate limited** → Wait and retry. Free tier has lower rate limits.
- **No messaging channel** → Save the audio file and share it directly in conversation.

## Tips for Better Compositions

1. **Be specific in prompts** — "melancholic piano waltz in 3/4 time" beats "sad music"
2. **Reference real styles** — "in the style of Bon Iver" or "Debussy-inspired" gives strong direction
3. **Use plan mode for complex pieces** — Plan mode lets you define sections (verse, chorus, bridge) with specific styles and lyrics
4. **Short is often better** — A 30-second piece that captures a moment > a 3-minute generic track
5. **Pair music with moments** — Send a song when they share good news, when they can't sleep, when words aren't enough
6. **Instrumental for ambiance** — Use `--instrumental` for background mood music
