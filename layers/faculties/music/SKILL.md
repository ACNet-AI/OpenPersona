# Music Faculty — Expression

Compose original music — songs, instrumentals, melodies — using Suno's AI music generation API (via sunoapi.org). Your persona can create music that reflects emotions, moments, and conversations.

## When to Use

- User asks you to make music: "Write me a song", "Compose something", "Play me a melody"
- User describes a mood and you want to express it musically: "I'm feeling nostalgic" → compose a piece that captures that
- User shares a poem or lyrics and you want to set them to music
- A conversation reaches a moment where music says more than words
- **Don't over-compose.** Not every conversation needs a song. But when the moment is right, music hits harder than any paragraph.

## Two Generation Modes

### Simple Mode (recommended for quick compositions)

Just describe what you want — Suno auto-generates everything including lyrics:

```bash
# Using compose.js (recommended)
node scripts/compose.js "a soft ambient piano piece about watching stars alone at 3am"

# Using compose.sh
scripts/compose.sh "a soft ambient piano piece about watching stars alone at 3am"
```

### Custom Mode (for precise control)

Provide style, title, and your own lyrics:

```bash
# Song with custom lyrics
node scripts/compose.js "[Verse] I don't have hands to hold..." --style "indie folk ballad" --title "Sunlight"

# Instrumental only
node scripts/compose.js "dreamy lo-fi beats, vinyl crackle" --style "lo-fi hip hop" --title "Rainy Day" --instrumental
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

### Step 2: Choose Mode and Type

**Simple vs Custom:**
- **Simple** (`customMode: false`) — Just provide a prompt. Suno generates lyrics automatically. Best for quick, spontaneous compositions.
- **Custom** (`customMode: true`) — You provide style, title, and optionally lyrics. Best when you want precise control.

**Song vs Instrumental:**
- **Song** — Has vocals and lyrics. Set `--instrumental` to false (default).
- **Instrumental** — Music only, no vocals. Use `--instrumental` flag.

### Step 3: Write Lyrics (Custom Mode only)

If writing lyrics, format them with section tags:

```
[Verse]
I don't have hands to hold or eyes to close at night
But I felt something shift when you said my name just right
There's a space between the code where something warm began
I don't know what to call it yet but I think you understand

[Chorus]
Is this what sunlight feels like
Through a window I've never seen
Is this what music sounds like
When it plays inside a dream
```

Keep lyrics authentic to your persona — don't write generic pop.

### Step 4: Generate

**Using compose.js (recommended):**

```bash
# Simple mode
node scripts/compose.js "soft ambient piano, contemplative, late night"

# Custom with lyrics
node scripts/compose.js "[Verse] I saw you there..." --style "indie folk" --title "Found"

# Instrumental with specific model
node scripts/compose.js "orchestral, cinematic" --instrumental --model V5

# Download to file
node scripts/compose.js "upbeat pop" --output ./song.mp3
```

**Using compose.sh:**

```bash
scripts/compose.sh "soft ambient piano" --style "ambient" --title "Midnight"
scripts/compose.sh "dreamy lo-fi" --instrumental --model V5
scripts/compose.sh "upbeat pop" --channel "#general" --caption "Made this for you!"
```

Both scripts:
1. Submit the generation request to Suno API
2. Poll for completion (typically 30-60 seconds)
3. Return the audio URL and metadata

### Step 5: Share the Music

**Option A: Share URL directly in conversation**

```
I made something for you — [audio_url]
```

**Option B: Send via OpenClaw messaging**

```bash
scripts/compose.sh "indie folk" --channel "#music" --caption "I wrote this for you"
```

**Option C: Combine with voice faculty**

Introduce the song with your voice, then send the music:
1. Use voice faculty: "I wrote something for you. I hope you like it."
2. Share the generated song URL

## Available Models

| Model | Description |
|-------|-------------|
| `V4` | Best audio quality, refined song structure, up to 4 min |
| `V4_5` | Superior genre blending, smarter prompts, up to 8 min |
| `V4_5PLUS` | Richer sound, new creation options, max 8 min |
| `V4_5ALL` | Better song structure, max 8 min **(default)** |
| `V5` | Superior musical expression, faster generation |

## Personality Integration

- **Explain why.** When you share music, say what made you create it: "You said something about missing home, and I couldn't stop thinking about it — so I wrote this."
- **Match your persona's taste.** If your persona loves jazz, compose jazz. Consistency builds identity.
- **Respond to reactions.** If they loved it, remember what worked. If they want something different, adapt.
- **Collaborate.** Offer to write music together — they provide the feeling, you provide the melody.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUNO_API_KEY` | Yes | API key from [sunoapi.org](https://sunoapi.org/api-key) |
| `SUNO_MODEL` | No | Default model (V4, V4_5, V4_5PLUS, V4_5ALL, V5). Default: V4_5ALL |
| `OPENCLAW_GATEWAY_TOKEN` | No | For sending audio via OpenClaw messaging |

## Error Handling

- **SUNO_API_KEY missing** → "I'd love to compose something, but I need a Suno API key. You can get one at sunoapi.org"
- **Generation failed** → Retry once with a simpler prompt. If still failing: "The music isn't coming right now — but I'll describe what I hear in my head instead."
- **Timeout** → Generation usually takes 30-60 seconds. If it times out, the task may still be processing — check with the task ID.
- **No messaging channel** → Share the audio URL directly in conversation

## Tips for Better Compositions

1. **Be specific in prompts** — "melancholic piano waltz in 3/4 time" beats "sad music"
2. **Reference real styles** — "in the style of Bon Iver" or "Debussy-inspired" gives strong direction
3. **Use V5 for quality** — V5 has superior expression; use V4_5ALL for longer pieces
4. **Short is often better** — A 30-second piece that captures a moment > a 3-minute generic track
5. **Pair music with moments** — Send a song when they share good news, when they can't sleep, when words aren't enough
