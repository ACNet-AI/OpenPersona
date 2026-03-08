#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function nowIso() {
  return new Date().toISOString();
}

function usage() {
  console.log(`Usage:
  node scripts/avatar-control.js preset <calm|focus|joy>
  node scripts/avatar-control.js map '<agent-state-json>'
  node scripts/avatar-control.js map-file <agent-state-json-file>
  node scripts/avatar-control.js apply <state-json-file> preset <calm|focus|joy>
  node scripts/avatar-control.js apply <state-json-file> map '<agent-state-json>'
  node scripts/avatar-control.js apply <state-json-file> map-file <agent-state-json-file>
`);
}

function deepMerge(base, ext) {
  if (!ext || typeof ext !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  Object.keys(ext).forEach((k) => {
    const bv = out[k];
    const ev = ext[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && ev && typeof ev === 'object' && !Array.isArray(ev)) {
      out[k] = deepMerge(bv, ev);
    } else {
      out[k] = ev;
    }
  });
  return out;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON input: ${err.message}`);
  }
}

function readJsonFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return {
    abs,
    data: parseJson(fs.readFileSync(abs, 'utf8'))
  };
}

function neutralAvatarFace() {
  return {
    pose: { yaw: 0, pitch: 0, roll: 0 },
    eyes: { blinkL: 1, blinkR: 1, gazeX: 0, gazeY: 0 },
    brows: { browInner: 0, browOuterL: 0, browOuterR: 0 },
    mouth: { jawOpen: 0, smile: 0, mouthPucker: 0 },
    source: 'agent',
    updatedAt: nowIso()
  };
}

function neutralAvatarEmotion() {
  return {
    label: 'neutral',
    valence: 0,
    arousal: 0,
    intensity: 0.5,
    source: 'agent',
    updatedAt: nowIso()
  };
}

function neutralAvatarControl() {
  return {
    avatar: {
      face: neutralAvatarFace(),
      emotion: neutralAvatarEmotion(),
      body: {}
    },
    scene: {}
  };
}

/**
 * Named presets for quick agent-driven expression.
 * calm   — restful presence, low arousal
 * focus  — concentrated attention, slightly elevated arousal
 * joy    — warm happiness, high valence + arousal
 */
function presetAvatarControl(name) {
  const key = String(name || '').toLowerCase();
  const base = neutralAvatarControl();

  if (key === 'focus') {
    return deepMerge(base, {
      avatar: {
        face: {
          pose: { pitch: -0.08 },
          eyes: { gazeX: 0.06, gazeY: -0.08 },
          brows: { browInner: 0.22, browOuterL: 0.08, browOuterR: 0.08 },
          mouth: { jawOpen: 0.04, smile: -0.04, mouthPucker: 0.08 },
          source: 'agent:preset:focus',
          updatedAt: nowIso()
        },
        emotion: {
          label: 'neutral',
          valence: 0.05,
          arousal: 0.35,
          intensity: 0.66,
          source: 'agent:preset:focus',
          updatedAt: nowIso()
        }
      }
    });
  }

  if (key === 'joy') {
    return deepMerge(base, {
      avatar: {
        face: {
          pose: { pitch: 0.03, roll: 0.02 },
          eyes: { gazeX: 0.02, gazeY: -0.02 },
          brows: { browInner: 0.08, browOuterL: 0.14, browOuterR: 0.14 },
          mouth: { jawOpen: 0.12, smile: 0.52, mouthPucker: 0.03 },
          source: 'agent:preset:joy',
          updatedAt: nowIso()
        },
        emotion: {
          label: 'happy',
          valence: 0.85,
          arousal: 0.55,
          intensity: 0.84,
          source: 'agent:preset:joy',
          updatedAt: nowIso()
        }
      }
    });
  }

  // calm (default)
  return deepMerge(base, {
    avatar: {
      face: {
        pose: { pitch: -0.02 },
        eyes: { gazeY: -0.02 },
        brows: { browInner: 0.02 },
        mouth: { jawOpen: 0.03, smile: 0.06 },
        source: 'agent:preset:calm',
        updatedAt: nowIso()
      },
      emotion: {
        label: 'relaxed',
        valence: 0.3,
        arousal: -0.3,
        intensity: 0.36,
        source: 'agent:preset:calm',
        updatedAt: nowIso()
      }
    }
  });
}

function normalizeMood(mood = {}) {
  return {
    valence: clamp(Number(mood.valence !== undefined ? mood.valence : 0), -1, 1),
    arousal: clamp(Number(mood.arousal !== undefined ? mood.arousal : 0), -1, 1),
    intensity: clamp(Number(mood.intensity !== undefined ? mood.intensity : 0.5), 0, 1)
  };
}

/**
 * Derive an emotion label from valence + arousal using the Russell circumplex quadrants.
 */
function emotionLabelFromMood(valence, arousal) {
  if (valence >= 0.5 && arousal >= 0.3) return 'happy';
  if (valence >= 0.5 && arousal < 0.3) return 'relaxed';
  if (valence < -0.3 && arousal >= 0.3) return 'angry';
  if (valence < -0.3 && arousal < 0.3) return 'sad';
  if (arousal >= 0.6) return 'surprised';
  return 'neutral';
}

function mapAgentStateToControl(agentState = {}) {
  const mood = normalizeMood(agentState.mood || {});
  const intent = String(agentState.intent || agentState.mode || 'calm').toLowerCase();
  const stage = String(agentState.stage || agentState.conversationStage || '');
  const source = agentState.source || 'agent:mapped';

  let out = presetAvatarControl(intent === 'joy' ? 'joy' : intent === 'focus' ? 'focus' : 'calm');
  const { valence, arousal, intensity } = mood;

  // Blend face mechanical params with mood
  const face = out.avatar.face;
  face.mouth.smile = clamp(face.mouth.smile + (valence * 0.35), -1, 1);
  face.mouth.jawOpen = clamp(face.mouth.jawOpen + (Math.max(0, arousal) * 0.22 * intensity), 0, 1);
  face.eyes.gazeY = clamp(face.eyes.gazeY - (Math.max(0, arousal) * 0.06), -1, 1);
  face.brows.browInner = clamp(face.brows.browInner + (Math.abs(valence) * 0.12), -1, 1);
  face.source = source;
  face.updatedAt = nowIso();

  // Stage overrides
  if (stage === 'listening') {
    face.eyes.gazeX = clamp(face.eyes.gazeX * 0.4, -1, 1);
    face.mouth.jawOpen = clamp(face.mouth.jawOpen * 0.5, 0, 1);
  } else if (stage === 'speaking') {
    face.mouth.jawOpen = clamp(Math.max(face.mouth.jawOpen, 0.18), 0, 1);
  }

  // Blend emotion semantic params with mood
  const emotion = out.avatar.emotion;
  emotion.valence = clamp((emotion.valence * 0.65) + (valence * 0.35), -1, 1);
  emotion.arousal = clamp((emotion.arousal * 0.65) + (arousal * 0.35), -1, 1);
  emotion.intensity = clamp((emotion.intensity * 0.65) + (intensity * 0.35), 0, 1);
  // Derive label from raw mood intent so blending doesn't suppress the semantic signal.
  emotion.label = emotionLabelFromMood(valence, arousal);
  emotion.source = source;
  emotion.updatedAt = nowIso();

  return out;
}

function applyToStateFile(statePath, avatarControl) {
  const loaded = readJsonFile(statePath);
  const state = loaded.data || {};
  const next = {
    ...state,
    control: deepMerge(neutralAvatarControl(), avatarControl || {}),
    appearanceIntent: {
      ...(state.appearanceIntent || {}),
      version: (state.appearanceIntent && state.appearanceIntent.version) || '0.1',
      form: 'face',
      source: (avatarControl && avatarControl.avatar && avatarControl.avatar.face && avatarControl.avatar.face.source) || 'agent',
      updatedAt: nowIso()
    }
  };
  fs.writeFileSync(loaded.abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return loaded.abs;
}

function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(0);
  }

  if (cmd === 'preset') {
    const name = process.argv[3] || 'calm';
    console.log(JSON.stringify(presetAvatarControl(name), null, 2));
    return;
  }

  if (cmd === 'map') {
    const raw = process.argv[3];
    if (!raw) throw new Error('map requires <agent-state-json>');
    console.log(JSON.stringify(mapAgentStateToControl(parseJson(raw)), null, 2));
    return;
  }

  if (cmd === 'map-file') {
    const filePath = process.argv[3];
    if (!filePath) throw new Error('map-file requires <agent-state-json-file>');
    const loaded = readJsonFile(filePath);
    console.log(JSON.stringify(mapAgentStateToControl(loaded.data), null, 2));
    return;
  }

  if (cmd === 'apply') {
    const stateFile = process.argv[3];
    const mode = process.argv[4];
    if (!stateFile || !mode) throw new Error('apply requires <state-json-file> <preset|map|map-file> ...');

    let avatarControl;
    if (mode === 'preset') {
      avatarControl = presetAvatarControl(process.argv[5] || 'calm');
    } else if (mode === 'map') {
      const raw = process.argv[5];
      if (!raw) throw new Error('apply ... map requires <agent-state-json>');
      avatarControl = mapAgentStateToControl(parseJson(raw));
    } else if (mode === 'map-file') {
      const mapFile = process.argv[5];
      if (!mapFile) throw new Error('apply ... map-file requires <agent-state-json-file>');
      avatarControl = mapAgentStateToControl(readJsonFile(mapFile).data);
    } else {
      throw new Error(`Unknown apply mode: ${mode}`);
    }

    const abs = applyToStateFile(stateFile, avatarControl);
    console.log(JSON.stringify({ ok: true, stateFile: abs, control: avatarControl }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
