#!/usr/bin/env node
'use strict';

const DEFAULT_BASE_URL = process.env.AVATAR_RUNTIME_URL || 'http://127.0.0.1:3721';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function usage() {
  console.log(`Usage:
  node scripts/avatar-runtime.js health
  node scripts/avatar-runtime.js start [personaId] [form]
  node scripts/avatar-runtime.js text <sessionId> <text>
  node scripts/avatar-runtime.js audio <sessionId> <audioUrlOrBase64>
  node scripts/avatar-runtime.js form <sessionId> <image|3d|motion|voice>
  node scripts/avatar-runtime.js status [sessionId]
  node scripts/avatar-runtime.js sync-state <slug> [sessionId] [--persist-model]
  node scripts/avatar-runtime.js sync-loop <slug> [sessionId] [intervalSec] [maxTicks]
`);
}

function candidatePersonaDirs(slug) {
  return [
    path.join(os.homedir(), '.openpersona', 'personas', `persona-${slug}`),
    path.join(os.homedir(), '.openclaw', 'skills', `persona-${slug}`),
    path.join(os.homedir(), '.openclaw', `persona-${slug}`)
  ];
}

function loadJsonSafe(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

function parsePersonaModel3Url(personaJson) {
  if (!personaJson || typeof personaJson !== 'object') return '';
  return (
    personaJson?.appearance?.defaultModel3Url ||
    personaJson?.appearance?.model3Url ||
    personaJson?.body?.appearance?.defaultModel3Url ||
    personaJson?.body?.appearance?.model3Url ||
    personaJson?.avatar?.defaultModel3Url ||
    personaJson?.avatar?.model3Url ||
    ''
  );
}

function toModel3Url(raw, personaDir) {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const rel = String(raw).replace(/^\.?\//, '');
  const abs = path.resolve(personaDir || process.cwd(), rel);
  if (!fs.existsSync(abs)) return '';
  // We keep local file as file:// for traceability; caller may still override with HTTP.
  return `file://${abs}`;
}

/**
 * Lightweight model URL resolver: only checks env var override and persona.json.
 * Does NOT fall back to chitose — callers that need zero-config defaults should
 * use the full resolveModel3Source() instead.
 */
function resolvePersonaModel3Url(slug) {
  const envOverride = process.env.LIVING_CANVAS_MODEL3_URL || process.env.PERSONA_MODEL3_URL || '';
  if (envOverride) return envOverride;
  for (const dir of candidatePersonaDirs(slug)) {
    const personaJson = loadJsonSafe(path.join(dir, 'soul', 'persona.json'));
    const declared = parsePersonaModel3Url(personaJson);
    if (!declared) continue;
    const resolved = toModel3Url(declared, dir) || declared;
    if (resolved) return resolved;
  }
  return '';
}

function resolveModel3Source(slug) {
  const localOverride = process.env.LIVING_CANVAS_MODEL3_URL || process.env.PERSONA_MODEL3_URL || '';
  if (localOverride) {
    return { model3Url: localOverride, source: 'persona-local' };
  }

  for (const dir of candidatePersonaDirs(slug)) {
    const personaJson = loadJsonSafe(path.join(dir, 'soul', 'persona.json'));
    const declared = parsePersonaModel3Url(personaJson);
    if (!declared) continue;
    const resolved = toModel3Url(declared, dir) || declared;
    if (resolved) return { model3Url: resolved, source: 'persona-pack' };
  }

  const providerOverride = process.env.LIVE2D_PROVIDER_MODEL3_URL || process.env.LIVE2D_MODEL3_URL || '';
  if (providerOverride) {
    return { model3Url: providerOverride, source: 'provider' };
  }

  const runtimeDefault = process.env.AVATAR_RUNTIME_DEFAULT_MODEL3_URL || '';
  if (runtimeDefault) {
    return { model3Url: runtimeDefault, source: 'runtime-default' };
  }

  // Slot 5: bridge auto default — check local filesystem for the bundled placeholder.
  // This enables a zero-config startup: if the file exists and will be served by the
  // static HTTP server, return its well-known URL path so the renderer can attempt it.
  const defaultSlotDir = path.resolve(__dirname, '../../../../packages/avatar-runtime/assets/live2d/slot');
  const cubism4Default = path.join(defaultSlotDir, 'default.model3.json');
  const cubism2Default = path.join(defaultSlotDir, 'chitose', 'chitose.model.json');
  if (fs.existsSync(cubism4Default)) {
    // Return relative URL — the static server must be rooted at the repo root.
    return { model3Url: '/packages/avatar-runtime/assets/live2d/slot/default.model3.json', source: 'bridge-default-slot-cubism4' };
  }
  if (fs.existsSync(cubism2Default)) {
    return { model3Url: '/packages/avatar-runtime/assets/live2d/slot/chitose/chitose.model.json', source: 'bridge-default-slot-cubism2' };
  }

  return { model3Url: '', source: 'fallback' };
}

async function request(path, method = 'GET', payload) {
  const url = `${DEFAULT_BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });
  const body = await res.text();
  let parsed;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    parsed = { raw: body };
  }
  if (!res.ok) {
    const err = new Error(`avatar-runtime ${res.status} ${path}`);
    err.details = parsed;
    throw err;
  }
  return parsed;
}

function toSensoryStatus(runtimeStatus) {
  const caps = runtimeStatus?.capabilities || {};
  return {
    image: !!caps.image,
    model3d: !!caps.model3d,
    motion: !!caps.motion,
    voice: !!caps.voice,
    hearing: !!caps.hearing,
    worldSense: !!caps.worldSense
  };
}

function toAppearancePatch(runtimeStatus) {
  const session = runtimeStatus?.session || {};
  const media = runtimeStatus?.media || {};
  const visualManifest = runtimeStatus?.visualManifest || { version: '0.1' };
  const providerCapabilities = runtimeStatus?.providerCapabilities || {
    faceRig: false,
    lipSync: false,
    gaze: false,
    blink: false,
    bodyMotion: false,
    streaming: false,
    bodyRig: false,
    sceneControl: false
  };
  const faceProfile = runtimeStatus?.faceProfile || {
    seed: session.personaId || 'persona-default',
    jawWidth: 1,
    eyeSpacing: 1,
    noseLength: 1,
    mouthWidth: 1,
    browTilt: 0,
    cheekFullness: 1
  };
  const control = runtimeStatus?.control || null;
  const appearanceIntent = runtimeStatus?.appearanceIntent || {
    version: '0.1',
    form: 'auto',
    style: 'default',
    transition: 'smooth',
    priority: 'agent',
    lockSeconds: 0,
    reason: '',
    source: 'agent',
    updatedAt: new Date().toISOString()
  };
  return {
    appearanceState: {
      provider: runtimeStatus?.provider || 'unknown',
      mode: session.form || 'image',
      available: !!runtimeStatus?.available,
      sensory: toSensoryStatus(runtimeStatus),
      media: {
        livekitUrl: media.livekitUrl || null,
        livekitAccessToken: media.livekitAccessToken ? '<redacted>' : null,
        realtimeEndpoint: media.realtimeEndpoint || null,
        avatarImage: media.avatarImage || null,
        avatarVideo: media.avatarVideo || null,
        viewerUrl: media.viewerUrl || null,
        model3Url: media.model3Url || null
      },
      visualManifest,
      providerCapabilities,
      faceProfile,
      control,
      appearanceIntent,
      updatedAt: new Date().toISOString()
    }
  };
}

function runAndCapture(cmd, args) {
  const out = spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  return {
    ok: !out.error && out.status === 0,
    status: out.status,
    error: out.error ? out.error.message : null,
    stdout: out.stdout || '',
    stderr: out.stderr || ''
  };
}

function writeStatePatch(slug, patch) {
  const payload = JSON.stringify(patch);

  // First try runner-level CLI (works from any directory when OpenPersona is installed).
  const viaCli = runAndCapture('openpersona', ['state', 'write', slug, payload]);
  if (viaCli.ok) {
    return {
      method: 'openpersona state write',
      output: viaCli.stdout.trim()
    };
  }

  // Fallback #1: local persona script when running inside persona pack root.
  const localScriptPath = path.join(process.cwd(), 'scripts', 'state-sync.js');
  if (fs.existsSync(localScriptPath)) {
    const local = runAndCapture(process.execPath, [localScriptPath, 'write', payload]);
    if (local.ok) {
      return {
        method: 'node scripts/state-sync.js write',
        output: local.stdout.trim()
      };
    }
  }

  // Fallback #2: installed persona pack script resolved by slug.
  const candidateDirs = [
    path.join(os.homedir(), '.openpersona', 'personas', `persona-${slug}`),
    path.join(os.homedir(), '.openclaw', 'skills', `persona-${slug}`),
    path.join(os.homedir(), '.openclaw', `persona-${slug}`)
  ];
  for (const dir of candidateDirs) {
    const scriptPath = path.join(dir, 'scripts', 'state-sync.js');
    if (!fs.existsSync(scriptPath)) continue;
    const installed = spawnSync(process.execPath, [scriptPath, 'write', payload], {
      cwd: dir,
      encoding: 'utf8'
    });
    if (!installed.error && installed.status === 0) {
      return {
        method: `node ${scriptPath} write`,
        output: (installed.stdout || '').trim()
      };
    }
  }

  // If no write target is available, do not fail the runtime polling path.
  // Return a skipped marker so callers can still consume statePatch.
  return {
    method: 'none',
    skipped: true,
    reason: 'No state writer available (openpersona CLI not found, local state-sync missing, installed persona pack not found).'
  };
}

function writeDemoCanvasState(slug, patch, runtimeStatus) {
  const target = process.env.LIVING_CANVAS_STATE_PATH;
  if (!target) {
    return { skipped: true, reason: 'LIVING_CANVAS_STATE_PATH not set' };
  }
  const sensory = patch?.appearanceState?.sensory || {};
  const media = patch?.appearanceState?.media || {};
  const visualManifest = patch?.appearanceState?.visualManifest || { version: '0.1' };
  const providerCapabilities = patch?.appearanceState?.providerCapabilities || {};
  const faceProfile = patch?.appearanceState?.faceProfile || {
    seed: slug,
    jawWidth: 1,
    eyeSpacing: 1,
    noseLength: 1,
    mouthWidth: 1,
    browTilt: 0,
    cheekFullness: 1
  };
  const control = patch?.appearanceState?.control || null;
  const appearanceIntent = patch?.appearanceState?.appearanceIntent || {
    version: '0.1',
    form: 'auto',
    style: 'default',
    transition: 'smooth',
    priority: 'agent',
    lockSeconds: 0,
    reason: '',
    source: 'agent',
    updatedAt: new Date().toISOString()
  };
  const payload = {
    personaName: process.env.LIVING_CANVAS_PERSONA_NAME || slug,
    role: process.env.LIVING_CANVAS_ROLE || 'companion',
    avatar: process.env.LIVING_CANVAS_AVATAR || '',
    avatarVideo: process.env.LIVING_CANVAS_AVATAR_VIDEO || '',
    avatarViewer: process.env.LIVING_CANVAS_AVATAR_VIEWER || '',
    avatarModel3Url: resolvePersonaModel3Url(slug),
    render: {
      displayMode: process.env.LIVING_CANVAS_DISPLAY_MODE || 'provider',
      quality: process.env.LIVING_CANVAS_QUALITY || 'medium',
      autoQuality: String(process.env.LIVING_CANVAS_AUTO_QUALITY || 'true') === 'true'
    },
    faceProfile: {
      seed: process.env.LIVING_CANVAS_FACE_SEED || faceProfile.seed || slug,
      jawWidth: Number(process.env.LIVING_CANVAS_JAW_WIDTH || faceProfile.jawWidth || 1),
      eyeSpacing: Number(process.env.LIVING_CANVAS_EYE_SPACING || faceProfile.eyeSpacing || 1),
      noseLength: Number(process.env.LIVING_CANVAS_NOSE_LENGTH || faceProfile.noseLength || 1),
      mouthWidth: Number(process.env.LIVING_CANVAS_MOUTH_WIDTH || faceProfile.mouthWidth || 1),
      browTilt: Number(process.env.LIVING_CANVAS_BROW_TILT || faceProfile.browTilt || 0),
      cheekFullness: Number(process.env.LIVING_CANVAS_CHEEK_FULLNESS || faceProfile.cheekFullness || 1)
    },
    control: control ? { ...control } : null,
    visualManifest: {
      ...visualManifest
    },
    providerCapabilities: {
      ...providerCapabilities
    },
    appearanceIntent: {
      ...appearanceIntent,
      form: process.env.LIVING_CANVAS_FORM || appearanceIntent.form || 'face',
      style: process.env.LIVING_CANVAS_STYLE || appearanceIntent.style || 'default',
      transition: process.env.LIVING_CANVAS_TRANSITION || appearanceIntent.transition || 'smooth',
      lockSeconds: process.env.LIVING_CANVAS_LOCK_SECONDS
        ? Number(process.env.LIVING_CANVAS_LOCK_SECONDS)
        : (appearanceIntent.lockSeconds || 0),
      source: process.env.LIVING_CANVAS_INTENT_SOURCE || appearanceIntent.source || 'agent',
      updatedAt: process.env.LIVING_CANVAS_INTENT_UPDATED_AT || appearanceIntent.updatedAt || new Date().toISOString()
    },
    livekit: {
      url: process.env.LIVING_CANVAS_LIVEKIT_URL || '',
      token: process.env.LIVING_CANVAS_LIVEKIT_TOKEN || ''
    },
    sensory: {
      image: !!sensory.image,
      model3d: !!sensory.model3d,
      motion: !!sensory.motion,
      voice: !!sensory.voice,
      hearing: !!sensory.hearing,
      worldSense: !!sensory.worldSense
    }
  };
  // Fill from runtime-derived patch when env vars are not explicitly provided.
  if (!payload.livekit.url) {
    payload.livekit.url = media.livekitUrl || '';
  }
  if (!payload.avatar && media.avatarImage) {
    payload.avatar = media.avatarImage;
  }
  if (!payload.avatarVideo && media.avatarVideo) {
    payload.avatarVideo = media.avatarVideo;
  }
  if (!payload.avatarViewer && media.viewerUrl) {
    payload.avatarViewer = media.viewerUrl;
  }
  if (!payload.avatarModel3Url && media.model3Url) {
    payload.avatarModel3Url = media.model3Url;
  }
  // Token is sensitive: only allow runtime token write when explicitly enabled for local demo.
  const allowRuntimeToken = String(process.env.LIVING_CANVAS_ALLOW_RUNTIME_TOKEN || 'false') === 'true';
  if (!payload.livekit.token && allowRuntimeToken) {
    payload.livekit.token = runtimeStatus?.media?.livekitAccessToken || '';
  }
  const abs = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return {
    skipped: false,
    path: abs,
    livekitUrl: !!payload.livekit.url,
    livekitToken: !!payload.livekit.token
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSyncLoop(slug, sessionId, intervalSec, maxTicks) {
  const intervalMs = Math.max(1, Number(intervalSec || 5)) * 1000;
  const max = maxTicks ? Math.max(1, Number(maxTicks)) : null;
  let stop = false;
  let tick = 0;

  const stopHandler = () => {
    stop = true;
  };
  process.on('SIGINT', stopHandler);
  process.on('SIGTERM', stopHandler);

  try {
    while (!stop) {
      tick += 1;
      const path = sessionId ? `/v1/status?sessionId=${encodeURIComponent(sessionId)}` : '/v1/status';
      try {
        const out = await request(path);
        const patch = toAppearancePatch(out);
        const persisted = writeStatePatch(slug, patch);
        const demoFile = writeDemoCanvasState(slug, patch, out);
        console.log(JSON.stringify({
          tick,
          ok: true,
          sensoryStatus: patch.appearanceState.sensory,
          persisted,
          demoFile
        }, null, 2));
      } catch (err) {
        console.error(JSON.stringify({
          tick,
          ok: false,
          error: err.message
        }));
      }

      if (max && tick >= max) break;
      await sleep(intervalMs);
    }
  } finally {
    process.off('SIGINT', stopHandler);
    process.off('SIGTERM', stopHandler);
  }
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(0);
  }

  try {
    if (cmd === 'health') {
      const out = await request('/health');
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'start') {
      const personaId = process.argv[3] || process.env.PERSONA_SLUG || 'unknown';
      const form = process.argv[4] || 'image';
      const model3 = resolveModel3Source(personaId);
      const out = await request('/v1/session/start', 'POST', {
        personaId,
        form,
        model3Url: model3.model3Url || undefined
      });
      if (model3.model3Url) {
        out.model3 = { source: model3.source, model3Url: model3.model3Url };
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'text') {
      const sessionId = process.argv[3];
      const text = process.argv.slice(4).join(' ');
      if (!sessionId || !text) throw new Error('text requires <sessionId> <text>');
      const out = await request('/v1/input/text', 'POST', { sessionId, text });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'audio') {
      const sessionId = process.argv[3];
      const input = process.argv[4];
      if (!sessionId || !input) throw new Error('audio requires <sessionId> <audioUrlOrBase64>');
      const payload = input.startsWith('http')
        ? { sessionId, audioUrl: input }
        : { sessionId, audioBase64: input };
      const out = await request('/v1/input/audio', 'POST', payload);
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'form') {
      const sessionId = process.argv[3];
      const form = process.argv[4];
      if (!sessionId || !form) throw new Error('form requires <sessionId> <form>');
      const out = await request('/v1/form/switch', 'POST', { sessionId, form });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'status') {
      const sessionId = process.argv[3];
      const path = sessionId ? `/v1/status?sessionId=${encodeURIComponent(sessionId)}` : '/v1/status';
      const out = await request(path);
      const patch = toAppearancePatch(out);
      console.log(JSON.stringify({
        runtimeStatus: out,
        sensoryStatus: patch.appearanceState.sensory,
        statePatch: patch
      }, null, 2));
      return;
    }

    if (cmd === 'sync-state') {
      const slug = process.argv[3];
      const persistModel = process.argv.includes('--persist-model');
      // sessionId is the first positional arg after slug (ignore flags)
      const sessionId = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : undefined;
      if (!slug) throw new Error('sync-state requires <slug> [sessionId] [--persist-model]');
      const reqPath = sessionId ? `/v1/status?sessionId=${encodeURIComponent(sessionId)}` : '/v1/status';
      const out = await request(reqPath);
      const patch = toAppearancePatch(out);
      const persisted = writeStatePatch(slug, patch);
      const demoFile = writeDemoCanvasState(slug, patch, out);

      let modelPersisted = null;
      if (persistModel) {
        const model3Url = (patch?.appearanceState?.media?.model3Url) || resolvePersonaModel3Url(slug) || '';
        if (model3Url) {
          let personaJsonPath = null;
          for (const dir of candidatePersonaDirs(slug)) {
            const candidate = path.join(dir, 'soul', 'persona.json');
            if (fs.existsSync(candidate)) {
              personaJsonPath = candidate;
              break;
            }
          }
          if (!personaJsonPath) {
            modelPersisted = { skipped: true, reason: `persona not found for slug: ${slug}` };
          } else {
            const personaJson = loadJsonSafe(personaJsonPath) || {};
            if (!personaJson.appearance) personaJson.appearance = {};
            personaJson.appearance.defaultModel3Url = model3Url;
            fs.writeFileSync(personaJsonPath, JSON.stringify(personaJson, null, 2) + '\n', 'utf8');
            modelPersisted = { written: personaJsonPath, model3Url };
          }
        } else {
          modelPersisted = { skipped: true, reason: 'no model3Url available from runtime or persona.json' };
        }
      }

      const result = { runtimeStatus: out, statePatch: patch, persisted, demoFile };
      if (modelPersisted !== null) result.modelPersisted = modelPersisted;
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (cmd === 'sync-loop') {
      const slug = process.argv[3];
      const sessionId = process.argv[4];
      const intervalSec = process.argv[5] || '5';
      const maxTicks = process.argv[6] || '';
      if (!slug) throw new Error('sync-loop requires <slug> [sessionId] [intervalSec] [maxTicks]');
      await runSyncLoop(slug, sessionId, intervalSec, maxTicks);
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } catch (err) {
    console.error(err.message);
    if (err.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
});
