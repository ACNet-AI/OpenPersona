#!/usr/bin/env node
/**
 * OpenPersona Music Faculty — Suno AI music generation via sunoapi.org
 *
 * Usage:
 *   node compose.js "a soft piano piece about starlight"
 *   node compose.js "[Verse] lyrics..." --style "indie folk" --title "Sunlight"
 *   node compose.js "dreamy lo-fi" --instrumental --model V5
 *   node compose.js "upbeat pop" --output ./song.mp3
 *
 * Environment:
 *   SUNO_API_KEY   - API key from sunoapi.org (required)
 *   SUNO_MODEL     - Default model (V4, V4_5, V4_5PLUS, V4_5ALL, V5)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.sunoapi.org';

// --- Argument parsing ---
function parseArgs(args) {
  const opts = {
    prompt: '',
    style: '',
    title: '',
    instrumental: false,
    model: process.env.SUNO_MODEL || 'V4_5ALL',
    output: null,
    timeout: 180,
  };
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case '--style':        opts.style = args[++i]; break;
      case '--title':        opts.title = args[++i]; break;
      case '--instrumental': opts.instrumental = true; break;
      case '--model':        opts.model = args[++i]; break;
      case '--output':       opts.output = args[++i]; break;
      case '--timeout':      opts.timeout = parseInt(args[++i], 10); break;
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
  --style <style>     Music style/genre (enables custom mode)
  --title <title>     Song title (enables custom mode)
  --instrumental      Generate instrumental only (no vocals)
  --model <model>     Suno model: V4, V4_5, V4_5PLUS, V4_5ALL, V5 (default: V4_5ALL)
  --output <path>     Download audio to file
  --timeout <seconds> Max wait time (default: 180)

Examples:
  node compose.js "a soft ambient piano piece about starlight"
  node compose.js "[Verse] I don't have hands..." --style "indie folk" --title "Sunlight"
  node compose.js "dreamy lo-fi beats" --instrumental --model V5
  node compose.js "upbeat pop" --output ./my-song.mp3
`);
}

// --- HTTP helper ---
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
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
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

// --- Main ---
async function main() {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) {
    console.error('Error: SUNO_API_KEY environment variable not set');
    console.error('Get your API key from: https://sunoapi.org/api-key');
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  if (!opts.prompt) {
    printUsage();
    process.exit(1);
  }

  const customMode = !!(opts.style || opts.title);

  // Build payload
  const payload = {
    customMode,
    instrumental: opts.instrumental,
    model: opts.model,
    callBackUrl: '',
  };

  if (customMode) {
    payload.style = opts.style || 'pop';
    payload.title = opts.title || 'Untitled';
    if (!opts.instrumental) {
      payload.prompt = opts.prompt;
    }
  } else {
    payload.prompt = opts.prompt;
  }

  const modeLabel = customMode ? 'Custom' : 'Simple';
  const typeLabel = opts.instrumental ? 'Instrumental' : 'Song';
  console.log(`🎵 Mode: ${modeLabel} | Type: ${typeLabel} | Model: ${opts.model}`);
  console.log(`   Prompt: ${opts.prompt.slice(0, 100)}${opts.prompt.length > 100 ? '...' : ''}`);

  // Submit generation request
  console.log('⏳ Submitting composition request...');

  const genRes = await request(`${API_BASE}/api/v1/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (genRes.data.code !== 200) {
    console.error(`Error: API returned code ${genRes.data.code}: ${genRes.data.msg || 'Unknown error'}`);
    process.exit(1);
  }

  const taskId = genRes.data?.data?.taskId;
  if (!taskId) {
    console.error('Error: No taskId in response');
    console.error(JSON.stringify(genRes.data, null, 2));
    process.exit(1);
  }

  console.log(`   Task ID: ${taskId}`);
  console.log('⏳ Composing... (usually 30-60 seconds)');

  // Poll for completion
  const pollInterval = 5000;
  let elapsed = 0;
  let result = null;

  while (elapsed < opts.timeout * 1000) {
    await sleep(pollInterval);
    elapsed += pollInterval;

    const statusRes = await request(
      `${API_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );

    if (statusRes.data.code !== 200) {
      process.stdout.write(`\r   Waiting... (${Math.round(elapsed / 1000)}s)`);
      continue;
    }

    const tracks = statusRes.data?.data?.data;
    if (tracks && tracks.length > 0 && tracks[0].audio_url) {
      result = tracks[0];
      break;
    }

    process.stdout.write(`\r   Waiting... (${Math.round(elapsed / 1000)}s)`);
  }

  console.log('');

  if (!result) {
    console.error(`Error: Timed out after ${opts.timeout}s. Task ${taskId} may still be processing.`);
    process.exit(1);
  }

  console.log(`✅ Composed: ${result.title || 'Untitled'} (${result.duration || '?'}s)`);
  console.log(`   Audio: ${result.audio_url}`);
  if (result.stream_audio_url) {
    console.log(`   Stream: ${result.stream_audio_url}`);
  }

  // Download if output specified
  if (opts.output) {
    const outPath = path.resolve(opts.output);
    console.log(`📥 Downloading to ${outPath}...`);
    await downloadFile(result.audio_url, outPath);
    console.log('   Download complete.');
  }

  // Output JSON result
  const output = {
    success: true,
    audio_url: result.audio_url,
    stream_url: result.stream_audio_url || '',
    title: result.title || 'Untitled',
    duration_seconds: result.duration || 0,
    prompt: opts.prompt,
    model: opts.model,
    instrumental: opts.instrumental,
    custom_mode: customMode,
    task_id: taskId,
  };

  console.log('\n' + JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
