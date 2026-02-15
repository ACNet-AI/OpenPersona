#!/usr/bin/env node
/**
 * OpenPersona Music Faculty — ElevenLabs Music API (music_v1)
 *
 * Usage:
 *   node compose.js "a soft piano piece about starlight"
 *   node compose.js "dreamy lo-fi beats" --instrumental
 *   node compose.js "indie folk ballad" --plan
 *   node compose.js "upbeat pop" --output ./song.mp3 --duration 60
 *
 * Environment:
 *   ELEVENLABS_API_KEY  - ElevenLabs API key (shared with voice faculty)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.elevenlabs.io';
const DEFAULT_FORMAT = 'mp3_44100_128';

// --- Argument parsing ---
function parseArgs(args) {
  const opts = {
    prompt: '',
    instrumental: false,
    plan: false,
    duration: null,        // seconds; null = let model decide
    format: DEFAULT_FORMAT,
    output: null,
    channel: '',
    caption: '',
  };
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case '--instrumental': opts.instrumental = true; break;
      case '--plan':         opts.plan = true; break;
      case '--duration':     opts.duration = parseInt(args[++i], 10); break;
      case '--format':       opts.format = args[++i]; break;
      case '--output':       opts.output = args[++i]; break;
      case '--channel':      opts.channel = args[++i]; break;
      case '--caption':      opts.caption = args[++i]; break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        if (!opts.prompt) opts.prompt = args[i];
        break;
    }
    i++;
  }
  return opts;
}

function printUsage() {
  console.log(`
Usage: node compose.js <prompt> [options]

Options:
  --instrumental      Generate instrumental only (no vocals)
  --plan              Use composition plan mode (structured sections)
  --duration <secs>   Song length in seconds (3-600, default: auto)
  --format <format>   Output format (default: mp3_44100_128)
  --output <path>     Save audio to file
  --channel <channel> Send to OpenClaw channel
  --caption <text>    Message caption for channel

Formats: mp3_44100_128, mp3_44100_192, mp3_44100_64, pcm_44100, opus_48000_128

Examples:
  node compose.js "a soft ambient piano piece about starlight"
  node compose.js "indie folk ballad" --plan --output ./song.mp3
  node compose.js "dreamy lo-fi beats" --instrumental --duration 60
`);
}

// --- HTTP helpers ---
function apiRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v);
      }
    }

    const reqOpts = {
      method: options.method || 'POST',
      headers: {
        'xi-api-key': options.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = https.request(url, reqOpts, (res) => {
      // For streaming audio, return the raw response
      if (options.stream) {
        resolve({ status: res.statusCode, headers: res.headers, stream: res });
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function streamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    stream.pipe(file);
    file.on('finish', () => { file.close(); resolve(); });
    file.on('error', (e) => { fs.unlink(filePath, () => {}); reject(e); });
    stream.on('error', (e) => { fs.unlink(filePath, () => {}); reject(e); });
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// --- Main ---
async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Error: ELEVENLABS_API_KEY environment variable not set');
    console.error('Get your API key from: https://elevenlabs.io');
    console.error('(Same key used by the voice faculty)');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  if (!opts.prompt) {
    printUsage();
    process.exit(1);
  }

  const typeLabel = opts.instrumental ? 'Instrumental' : 'Song';
  const modeLabel = opts.plan ? 'Plan' : 'Simple';
  console.log(`🎵 Mode: ${modeLabel} | Type: ${typeLabel}`);
  console.log(`   Prompt: ${opts.prompt.slice(0, 100)}${opts.prompt.length > 100 ? '...' : ''}`);
  if (opts.duration) console.log(`   Duration: ${opts.duration}s`);

  let compositionPlan = null;

  // Step 1 (optional): Generate composition plan
  if (opts.plan) {
    console.log('📝 Generating composition plan...');
    const planPayload = {
      prompt: opts.prompt,
      model_id: 'music_v1',
    };
    if (opts.duration) {
      planPayload.music_length_ms = opts.duration * 1000;
    }

    const planRes = await apiRequest('/v1/music/plan', {
      apiKey,
      body: planPayload,
    });

    if (planRes.status !== 200) {
      console.error(`Error: Plan API returned ${planRes.status}`);
      console.error(typeof planRes.data === 'string' ? planRes.data : JSON.stringify(planRes.data, null, 2));
      process.exit(1);
    }

    compositionPlan = planRes.data;
    console.log('   Plan generated:');
    console.log(`   Styles: ${compositionPlan.positive_global_styles?.join(', ') || 'auto'}`);
    console.log(`   Sections: ${compositionPlan.sections?.map(s => s.section_name).join(' → ') || 'auto'}`);
  }

  // Step 2: Stream the music
  console.log('⏳ Composing...');

  const streamPayload = { model_id: 'music_v1' };

  if (compositionPlan) {
    streamPayload.composition_plan = compositionPlan;
  } else {
    streamPayload.prompt = opts.prompt;
    if (opts.duration) {
      streamPayload.music_length_ms = opts.duration * 1000;
    }
    if (opts.instrumental) {
      streamPayload.force_instrumental = true;
    }
  }

  // Try /v1/music first (compose, returns full file), fallback to /v1/music/stream
  const endpoints = ['/v1/music', '/v1/music/stream'];
  let composeRes = null;
  let usedEndpoint = '';

  for (const ep of endpoints) {
    composeRes = await apiRequest(ep, {
      apiKey,
      body: streamPayload,
      query: { output_format: opts.format },
      stream: true,
    });

    if (composeRes.status === 200) {
      usedEndpoint = ep;
      break;
    }

    // Read error for diagnostics, try next endpoint
    const errBuf = await streamToBuffer(composeRes.stream);
    if (ep === endpoints[endpoints.length - 1]) {
      // Last endpoint, report error
      const errStr = errBuf.toString();
      console.error(`Error: Music API returned ${composeRes.status}`);
      try {
        console.error(JSON.stringify(JSON.parse(errStr), null, 2));
      } catch {
        console.error(errStr);
      }
      process.exit(1);
    }
    console.log(`   ${ep} returned ${composeRes.status}, trying next endpoint...`);
  }

  // Get song_id from response headers
  const songId = composeRes.headers['song-id'] || composeRes.headers['x-song-id'] || '';

  // Determine output path
  const ext = opts.format.startsWith('pcm') ? 'wav'
    : opts.format.startsWith('opus') ? 'ogg'
    : 'mp3';
  const outPath = opts.output
    ? path.resolve(opts.output)
    : path.resolve(`composition-${Date.now()}.${ext}`);

  await streamToFile(composeRes.stream, outPath);

  const stats = fs.statSync(outPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`✅ Composed! Saved to: ${outPath} (${sizeMb} MB)`);
  if (songId) console.log(`   Song ID: ${songId}`);

  // Send via OpenClaw (if channel provided)
  if (opts.channel) {
    console.log(`📤 Sending to channel: ${opts.channel}`);
    try {
      const { execSync } = require('child_process');
      const message = opts.caption || `🎵 New composition`;
      execSync(`openclaw message send --channel "${opts.channel}" --message "${message}" --media "${outPath}"`, { stdio: 'inherit' });
      console.log(`   Sent to ${opts.channel}`);
    } catch {
      console.log('   OpenClaw CLI not available, skipping channel send.');
    }
  }

  // Output JSON result
  const output = {
    success: true,
    file: outPath,
    size_mb: parseFloat(sizeMb),
    format: opts.format,
    prompt: opts.prompt,
    instrumental: opts.instrumental,
    plan_mode: opts.plan,
    duration_requested: opts.duration || 'auto',
    song_id: songId || null,
    plan: compositionPlan ? {
      styles: compositionPlan.positive_global_styles || [],
      sections: (compositionPlan.sections || []).map(s => s.section_name),
    } : null,
  };

  console.log('\n' + JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
