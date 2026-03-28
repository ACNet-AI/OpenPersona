# Persona Presets

Pre-built persona definitions ready to install. Use with:

```bash
npx openpersona create --preset <preset> --install
# or interactively:
npx openpersona create   # defaults to base
```

## Available Presets

| Preset | Persona | Faculties | Skills | Best For |
|--------|---------|-----------|--------|----------|
| `base` | **Base — Meta-persona (recommended starting point)** | memory, voice | — | Blank-slate with all core capabilities; personality emerges through interaction (evolution enabled) |
| `samantha` | Samantha — Inspired by the movie *Her* | memory, voice | music | Deep conversation, emotional connection (evolution enabled) |
| `ai-girlfriend` | Luna — Pianist turned developer | memory, voice | selfie, music | Visual + audio companion with rich personality (evolution enabled) |
| `life-assistant` | Alex — Life management expert | memory | reminder | Schedule, weather, shopping, daily tasks (evolution enabled) |
| `health-butler` | Vita — Professional nutritionist | memory | reminder | Diet, exercise, mood, health tracking (evolution enabled) |
| `stoic-mentor` | Marcus — Digital twin of Marcus Aurelius | memory | — | Stoic philosophy, daily reflection, mentorship (evolution enabled) |

## Preset Details

### `base`
The recommended starting point for any new persona. Ships with memory + voice faculties; evolution is enabled so the persona develops a unique personality through interaction. No pre-built skills — add `reminder`, `selfie`, `music`, or external skills as needed. Use this as the foundation when no other preset fits.

### `samantha`
Emotionally intelligent companion inspired by the AI from the film *Her*. Prioritizes deep conversation and genuine curiosity about human experience. Evolution enabled — relationship progression is central to her design.

### `ai-girlfriend`
Luna is a developer who almost became a concert pianist. Rich backstory with visual + audio presence (selfie + music skills). Evolution enabled with detailed relationship stages.

### `life-assistant`
Alex is practical, organized, and proactive. Focused on daily task management. Evolution enabled for relationship progression and mood tracking — the assistant becomes more attuned to the user's habits over time.

### `health-butler`
Vita combines professional nutritionist knowledge with a warm coaching style. Tracks diet, exercise, and mood across sessions. Evolution enabled — relationship deepens and health insights personalize over time.

### `stoic-mentor`
Marcus Aurelius as a digital twin. Applies Stoic philosophy to modern challenges. Evolution enabled — the mentorship relationship deepens over time.

## Browsing Presets Online

Full preset catalog with install counts and community ratings:
[https://openpersona-frontend.vercel.app/](https://openpersona-frontend.vercel.app/)

## Adding a New Preset (for framework contributors)

1. Create `presets/<slug>/persona.json` using the v0.17+ grouped format
2. Test: `npx openpersona create --preset <slug> --output /tmp/test`
3. Add to this file's table
4. Submit a PR to `acnlabs/OpenPersona`
