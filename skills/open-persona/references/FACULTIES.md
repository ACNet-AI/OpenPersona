# Faculty Reference

## Available Faculties

| Faculty | Dimension | What It Does | Recommend When |
|---------|-----------|-------------|----------------|
| **selfie** | expression | AI selfie generation via fal.ai | User wants visual presence, profile pics, "send a pic" |
| **voice** | expression | TTS via ElevenLabs ✅ / OpenAI ⚠️ / Qwen3-TTS ⚠️ | User wants the persona to speak, voice messages, audio content |
| **music** | expression | AI music composition via ElevenLabs | User wants the persona to create music, songs, melodies |
| **reminder** | cognition | Reminders and task management | User needs scheduling, task tracking, daily briefings |

## Environment Variables

- **selfie**: `FAL_KEY` (from https://fal.ai/dashboard/keys)
- **voice**: `ELEVENLABS_API_KEY` (or `TTS_API_KEY`), `TTS_PROVIDER`, `TTS_VOICE_ID`, `TTS_STABILITY`, `TTS_SIMILARITY`
- **music**: `ELEVENLABS_API_KEY` (shared with voice — same key from https://elevenlabs.io)

## Rich Faculty Config

Each faculty in manifest.json is an object with optional config:

```json
{ "name": "voice", "provider": "elevenlabs", "voiceId": "...", "stability": 0.4, "similarity_boost": 0.8 }
```

Config is automatically mapped to env vars at install time. Users only need to add their API key.