#!/usr/bin/env node
/**
 * OpenPersona Voice Faculty — ElevenLabs TTS via official SDK
 *
 * Usage: node speak.js <text> [--voice <voice_id>] [--output <path>] [--play] [--model <model_id>]
 *        node speak.js <text> --stream --play                   (streaming mode, lower latency)
 *        node speak.js <text> --soul-state <path>               (emotion-driven voice params)
 *
 * Environment variables:
 *   ELEVENLABS_API_KEY  - ElevenLabs API key (required)
 *   TTS_VOICE_ID        - Default voice ID (optional, overridden by --voice)
 */

const fs = require('fs');
const path = require('path');

// --- Parse arguments ---
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
Usage: node speak.js <text> [options]

Options:
  --voice <id>           Voice ID (default: JBFqnCBsd6RMkjVDRZzb / George)
  --output <path>        Save audio to file (default: /tmp/openpersona-voice-{timestamp}.mp3)
  --play                 Play audio directly after generation
  --stream               Stream audio as it generates (lower latency, requires --play)
  --model <id>           Model ID (default: eleven_multilingual_v2)
  --stability <n>        Voice stability 0-1 (default: 0.5)
  --similarity <n>       Similarity boost 0-1 (default: 0.75)
  --style_exaggeration <n>  Style exaggeration 0-1 for v3 models (default: 0)
  --soul-state <path>    Path to soul-state.json — auto-applies emotion-driven voice params
  --circadian            Adjust voice params based on current time of day

Environment:
  ELEVENLABS_API_KEY  API key (or set in OpenClaw config)
  TTS_VOICE_ID        Default voice ID
  TTS_API_KEY         Fallback API key (if ELEVENLABS_API_KEY not set)

Examples:
  node speak.js "Hello, how are you?" --play
  node speak.js "I wrote you a poem" --voice Rachel --output poem.mp3
  node speak.js "The first move is what sets everything in motion." --stream --play
  node speak.js "I miss you" --soul-state ~/.openclaw/samantha/soul-state.json --play
  node speak.js "Good morning" --circadian --play
  `);
  process.exit(0);
}

function parseArgs(args) {
  const opts = {
    text: '',
    voice: null,
    output: null,
    play: false,
    stream: false,
    model: 'eleven_multilingual_v2',
    stability: parseFloat(process.env.TTS_STABILITY) || 0.5,
    similarity: parseFloat(process.env.TTS_SIMILARITY) || 0.75,
    styleExaggeration: 0,
    soulStatePath: null,
    circadian: false,
  };
  let i = 0;

  if (args[0] && !args[0].startsWith('--')) {
    opts.text = args[0];
    i = 1;
  }

  while (i < args.length) {
    switch (args[i]) {
      case '--voice':              opts.voice = args[++i]; break;
      case '--output':             opts.output = args[++i]; break;
      case '--play':               opts.play = true; break;
      case '--stream':             opts.stream = true; break;
      case '--model':              opts.model = args[++i]; break;
      case '--stability':          opts.stability = parseFloat(args[++i]); break;
      case '--similarity':         opts.similarity = parseFloat(args[++i]); break;
      case '--style_exaggeration': opts.styleExaggeration = parseFloat(args[++i]); break;
      case '--soul-state':         opts.soulStatePath = args[++i]; break;
      case '--circadian':          opts.circadian = true; break;
      default:
        if (!opts.text) opts.text = args[i];
    }
    i++;
  }
  return opts;
}

/**
 * Read soul-state.json and resolve emotion-driven voice parameters.
 * Merges voiceEmotionMap (by relationship stage) with moodModifiers (by current mood).
 * Falls back gracefully if soul-state or persona config is unavailable.
 */
function resolveEmotionParams(soulStatePath, baseStability, baseSimilarity, baseStyleExag) {
  let stability = baseStability;
  let similarity = baseSimilarity;
  let styleExaggeration = baseStyleExag;

  try {
    const soulState = JSON.parse(fs.readFileSync(soulStatePath, 'utf8'));
    const stage = soulState?.relationship?.stage || 'stranger';
    const mood = soulState?.mood?.current || 'neutral';

    // Locate persona.json to read voiceEmotionMap — walk up from soul-state path
    const stateDir = path.dirname(soulStatePath);
    const personaPaths = [
      path.join(stateDir, 'persona.json'),
      path.join(stateDir, '..', 'persona.json'),
      path.join(stateDir, '..', '..', 'presets', 'samantha', 'persona.json'),
    ];

    let voiceEmotionMap = null;
    let moodModifiers = null;

    for (const p of personaPaths) {
      if (fs.existsSync(p)) {
        const persona = JSON.parse(fs.readFileSync(p, 'utf8'));
        const voiceFaculty = (persona.faculties || []).find(f => f.name === 'voice');
        if (voiceFaculty?.voiceEmotionMap) {
          voiceEmotionMap = voiceFaculty.voiceEmotionMap;
          moodModifiers = voiceFaculty.moodModifiers || {};
          break;
        }
      }
    }

    if (voiceEmotionMap && voiceEmotionMap[stage]) {
      const stageParams = voiceEmotionMap[stage];
      stability = stageParams.stability ?? stability;
      similarity = stageParams.similarity_boost ?? similarity;
      styleExaggeration = stageParams.style_exaggeration ?? styleExaggeration;
      console.log(`[INFO] Emotion profile: stage="${stage}" → stability=${stability}, similarity=${similarity}, style_exag=${styleExaggeration}`);
    }

    if (moodModifiers && moodModifiers[mood]) {
      const m = moodModifiers[mood];
      stability = Math.max(0, Math.min(1, stability + (m.stability_delta || 0)));
      styleExaggeration = Math.max(0, Math.min(1, styleExaggeration + (m.style_exaggeration_delta || 0)));
      console.log(`[INFO] Mood modifier: mood="${mood}" → stability=${stability.toFixed(2)}, style_exag=${styleExaggeration.toFixed(2)}`);
    }
  } catch (e) {
    console.warn(`[WARN] Could not read soul-state (${soulStatePath}): ${e.message} — using defaults`);
  }

  return { stability, similarity, styleExaggeration };
}

/**
 * Adjust voice parameters based on the current hour of day.
 * Night: softer (higher stability). Daytime: more expressive (lower stability).
 */
function applyCircadianProfile(stability, similarity, styleExaggeration) {
  const hour = new Date().getHours();

  let label, deltaStability, deltaSimilarity;

  if (hour >= 22 || hour < 7) {
    label = 'night';
    deltaStability = +0.12;
    deltaSimilarity = +0.05;
  } else if (hour >= 7 && hour < 9) {
    label = 'morning';
    deltaStability = +0.03;
    deltaSimilarity = 0;
  } else if (hour >= 9 && hour < 18) {
    label = 'daytime';
    deltaStability = -0.04;
    deltaSimilarity = 0;
  } else {
    label = 'evening';
    deltaStability = +0.06;
    deltaSimilarity = +0.02;
  }

  const result = {
    stability: Math.max(0, Math.min(1, stability + deltaStability)),
    similarity: Math.max(0, Math.min(1, similarity + deltaSimilarity)),
    styleExaggeration,
  };
  console.log(`[INFO] Circadian profile: "${label}" (hour=${hour}) → stability=${result.stability.toFixed(2)}`);
  return result;
}

async function main() {
  const opts = parseArgs(args);

  if (!opts.text) {
    console.error('[ERROR] No text provided');
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    console.error('[ERROR] ELEVENLABS_API_KEY or TTS_API_KEY required');
    console.error('  Set in environment or OpenClaw config: "env": { "ELEVENLABS_API_KEY": "your_key" }');
    process.exit(1);
  }

  let ElevenLabsClient, play;
  try {
    const sdk = await import('@elevenlabs/elevenlabs-js');
    ElevenLabsClient = sdk.ElevenLabsClient;
    play = sdk.play;
  } catch (e) {
    console.error('[ERROR] @elevenlabs/elevenlabs-js not installed');
    console.error('  Run: npm install @elevenlabs/elevenlabs-js');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });
  const voiceId = opts.voice || process.env.TTS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

  // Resolve final voice parameters: defaults → emotion mapping → circadian → CLI overrides
  let stability = opts.stability;
  let similarity = opts.similarity;
  let styleExaggeration = opts.styleExaggeration;

  if (opts.soulStatePath) {
    const resolved = resolveEmotionParams(opts.soulStatePath, stability, similarity, styleExaggeration);
    stability = resolved.stability;
    similarity = resolved.similarity;
    styleExaggeration = resolved.styleExaggeration;
  }

  if (opts.circadian) {
    const circadian = applyCircadianProfile(stability, similarity, styleExaggeration);
    stability = circadian.stability;
    similarity = circadian.similarity;
    styleExaggeration = circadian.styleExaggeration;
  }

  console.log(`[INFO] Voice: ${voiceId}`);
  console.log(`[INFO] Model: ${opts.model}`);
  console.log(`[INFO] Params: stability=${stability.toFixed(2)}, similarity=${similarity.toFixed(2)}, style_exag=${styleExaggeration.toFixed(2)}`);
  console.log(`[INFO] Mode: ${opts.stream ? 'streaming' : 'buffered'}`);
  console.log(`[INFO] Text: ${opts.text.slice(0, 80)}${opts.text.length > 80 ? '...' : ''}`);

  const voiceSettings = {
    stability,
    similarityBoost: similarity,
    ...(styleExaggeration > 0 ? { style: styleExaggeration } : {}),
  };

  const outputPath = opts.output || `/tmp/openpersona-voice-${Date.now()}.mp3`;

  try {
    if (opts.stream && opts.play) {
      // Streaming mode: play audio as it arrives — lowest latency
      console.log('[INFO] Streaming audio...');
      const audioStream = client.textToSpeech.stream(voiceId, {
        text: opts.text,
        modelId: opts.model,
        outputFormat: 'mp3_44100_128',
        voiceSettings,
      });
      await play(audioStream);

      console.log(JSON.stringify({
        success: true,
        audio_file: null,
        provider: 'elevenlabs',
        voice_id: voiceId,
        model: opts.model,
        mode: 'streaming',
      }));
    } else {
      // Buffered mode: collect full audio, save to file, optionally play
      const audio = await client.textToSpeech.convert(voiceId, {
        text: opts.text,
        modelId: opts.model,
        outputFormat: 'mp3_44100_128',
        voiceSettings,
      });

      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      fs.writeFileSync(outputPath, buffer);
      const fileSize = buffer.length;
      console.log(`[INFO] Audio saved: ${outputPath} (${fileSize} bytes)`);

      if (opts.play) {
        console.log('[INFO] Playing audio...');
        const { Readable } = require('stream');
        const playStream = Readable.from(buffer);
        await play(playStream);
      }

      console.log(JSON.stringify({
        success: true,
        audio_file: outputPath,
        provider: 'elevenlabs',
        voice_id: voiceId,
        model: opts.model,
        mode: 'buffered',
        size_bytes: fileSize,
      }));
    }
  } catch (err) {
    console.error(`[ERROR] TTS generation failed: ${err.message}`);
    if (err.statusCode) {
      console.error(`[ERROR] Status: ${err.statusCode}`);
    }
    process.exit(1);
  }
}

main();
