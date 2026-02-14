#!/usr/bin/env node
/**
 * OpenPersona Voice Faculty — ElevenLabs TTS via official SDK
 *
 * Usage: node speak.js <text> [--voice <voice_id>] [--output <path>] [--play] [--model <model_id>]
 *
 * Environment variables:
 *   ELEVENLABS_API_KEY  - ElevenLabs API key (required)
 *   TTS_VOICE_ID        - Default voice ID (optional, overridden by --voice)
 *
 * Install dependency first:
 *   npm install @elevenlabs/elevenlabs-js
 */

const fs = require('fs');
const path = require('path');

// --- Parse arguments ---
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.log(`
Usage: node speak.js <text> [options]

Options:
  --voice <id>      Voice ID (default: JBFqnCBsd6RMkjVDRZzb / George)
  --output <path>   Save audio to file (default: /tmp/openpersona-voice-{timestamp}.mp3)
  --play            Play audio directly after generation
  --model <id>      Model ID (default: eleven_multilingual_v2)
  --stability <n>   Voice stability 0-1 (default: 0.5)
  --similarity <n>  Similarity boost 0-1 (default: 0.75)

Environment:
  ELEVENLABS_API_KEY  API key (or set in OpenClaw config)
  TTS_VOICE_ID        Default voice ID
  TTS_API_KEY         Fallback API key (if ELEVENLABS_API_KEY not set)

Examples:
  node speak.js "Hello, how are you?" --play
  node speak.js "I wrote you a poem" --voice Rachel --output poem.mp3
  node speak.js "The first move is what sets everything in motion." --play --stability 0.3
  `);
  process.exit(0);
}

function parseArgs(args) {
  const opts = {
    text: '',
    voice: null,
    output: null,
    play: false,
    model: 'eleven_multilingual_v2',
    stability: parseFloat(process.env.TTS_STABILITY) || 0.5,
    similarity: parseFloat(process.env.TTS_SIMILARITY) || 0.75,
  };
  let i = 0;

  // First non-flag argument is text
  if (args[0] && !args[0].startsWith('--')) {
    opts.text = args[0];
    i = 1;
  }

  while (i < args.length) {
    switch (args[i]) {
      case '--voice':   opts.voice = args[++i]; break;
      case '--output':  opts.output = args[++i]; break;
      case '--play':    opts.play = true; break;
      case '--model':   opts.model = args[++i]; break;
      case '--stability':  opts.stability = parseFloat(args[++i]); break;
      case '--similarity': opts.similarity = parseFloat(args[++i]); break;
      default:
        if (!opts.text) opts.text = args[i];
    }
    i++;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(args);

  if (!opts.text) {
    console.error('[ERROR] No text provided');
    process.exit(1);
  }

  // Resolve API key
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    console.error('[ERROR] ELEVENLABS_API_KEY or TTS_API_KEY required');
    console.error('  Set in environment or OpenClaw config: "env": { "ELEVENLABS_API_KEY": "your_key" }');
    process.exit(1);
  }

  // Dynamic import of SDK
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

  // Resolve voice ID
  const voiceId = opts.voice || process.env.TTS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

  console.log(`[INFO] Voice: ${voiceId}`);
  console.log(`[INFO] Model: ${opts.model}`);
  console.log(`[INFO] Text: ${opts.text.slice(0, 80)}${opts.text.length > 80 ? '...' : ''}`);

  try {
    // Generate audio
    const audio = await client.textToSpeech.convert(voiceId, {
      text: opts.text,
      modelId: opts.model,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: opts.stability,
        similarityBoost: opts.similarity,
      },
    });

    // Save to file if output path specified
    const outputPath = opts.output || `/tmp/openpersona-voice-${Date.now()}.mp3`;

    // Collect stream into buffer
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    fs.writeFileSync(outputPath, buffer);
    const fileSize = buffer.length;
    console.log(`[INFO] Audio saved: ${outputPath} (${fileSize} bytes)`);

    // Play directly if requested
    if (opts.play) {
      console.log('[INFO] Playing audio...');
      // Re-read as stream for play()
      const { Readable } = require('stream');
      const playStream = Readable.from(buffer);
      await play(playStream);
    }

    // Output result JSON
    console.log(JSON.stringify({
      success: true,
      audio_file: outputPath,
      provider: 'elevenlabs',
      voice_id: voiceId,
      model: opts.model,
      size_bytes: fileSize,
    }));
  } catch (err) {
    console.error(`[ERROR] TTS generation failed: ${err.message}`);
    if (err.statusCode) {
      console.error(`[ERROR] Status: ${err.statusCode}`);
    }
    process.exit(1);
  }
}

main();
