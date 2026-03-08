'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const SCRIPT = path.resolve(__dirname, '../layers/faculties/avatar/scripts/avatar-control.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function run(args) {
  const { spawnSync } = require('node:child_process');
  const out = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  if (out.error) throw out.error;
  return {
    exitCode: out.status,
    stdout:   out.stdout,
    stderr:   out.stderr,
    json:     () => JSON.parse(out.stdout)
  };
}

// ── script existence ──────────────────────────────────────────────────────────

describe('avatar-control.js: script', () => {
  test('script file exists', () => {
    assert.ok(fs.existsSync(SCRIPT), 'avatar-control.js must exist');
  });

  test('usage printed when no args', () => {
    const r = run([]);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes('avatar-control.js'));
  });
});

// ── preset output structure ───────────────────────────────────────────────────

describe('avatar-control.js: preset', () => {
  function assertControlShape(c, label) {
    assert.ok(c && typeof c === 'object', `${label}: output must be object`);
    // avatar sub-tree
    assert.ok(c.avatar, `${label}: must have avatar`);
    assert.ok(c.avatar.face, `${label}: must have avatar.face`);
    assert.ok(c.avatar.emotion, `${label}: must have avatar.emotion`);
    assert.ok('body' in c.avatar, `${label}: must have avatar.body`);
    assert.ok('scene' in c, `${label}: must have scene`);
    // face fields
    const face = c.avatar.face;
    assert.ok(face.pose, `${label}: face.pose missing`);
    assert.ok(face.eyes, `${label}: face.eyes missing`);
    assert.ok(face.brows, `${label}: face.brows missing`);
    assert.ok(face.mouth, `${label}: face.mouth missing`);
    assert.equal(typeof face.source, 'string', `${label}: face.source must be string`);
    // emotion fields
    const emotion = c.avatar.emotion;
    assert.equal(typeof emotion.label,    'string', `${label}: emotion.label must be string`);
    assert.equal(typeof emotion.valence,  'number', `${label}: emotion.valence must be number`);
    assert.equal(typeof emotion.arousal,  'number', `${label}: emotion.arousal must be number`);
    assert.equal(typeof emotion.intensity,'number', `${label}: emotion.intensity must be number`);
  }

  for (const name of ['calm', 'focus', 'joy']) {
    test(`preset ${name} has correct structure`, () => {
      const r = run(['preset', name]);
      assert.equal(r.exitCode, 0, `exit 0 for preset ${name}`);
      assertControlShape(r.json(), `preset:${name}`);
    });
  }

  test('preset calm: emotion.label is relaxed', () => {
    const c = run(['preset', 'calm']).json();
    assert.equal(c.avatar.emotion.label, 'relaxed');
  });

  test('preset joy: emotion.label is happy', () => {
    const c = run(['preset', 'joy']).json();
    assert.equal(c.avatar.emotion.label, 'happy');
  });

  test('preset joy: face.mouth.smile > 0', () => {
    const c = run(['preset', 'joy']).json();
    assert.ok(c.avatar.face.mouth.smile > 0, 'joy should have positive smile');
  });

  test('preset focus: emotion.label is neutral', () => {
    const c = run(['preset', 'focus']).json();
    assert.equal(c.avatar.emotion.label, 'neutral');
  });

  test('preset calm: face.eyes.blinkL defaults to 1 (open)', () => {
    const c = run(['preset', 'calm']).json();
    assert.equal(c.avatar.face.eyes.blinkL, 1);
    assert.equal(c.avatar.face.eyes.blinkR, 1);
  });

  test('preset source tag includes preset name', () => {
    const c = run(['preset', 'joy']).json();
    assert.ok(c.avatar.face.source.includes('joy'), 'face.source should include preset name');
    assert.ok(c.avatar.emotion.source.includes('joy'), 'emotion.source should include preset name');
  });

  test('unknown preset falls back to calm shape', () => {
    const c = run(['preset', 'nonexistent']).json();
    assert.equal(c.avatar.emotion.label, 'relaxed');
  });
});

// ── map command ───────────────────────────────────────────────────────────────

describe('avatar-control.js: map', () => {
  test('map with high positive valence yields happy label', () => {
    const input = JSON.stringify({ intent: 'calm', mood: { valence: 0.8, arousal: 0.4, intensity: 0.8 } });
    const c = run(['map', input]).json();
    assert.equal(c.avatar.emotion.label, 'happy');
  });

  test('map with negative valence + positive arousal yields angry label', () => {
    const input = JSON.stringify({ mood: { valence: -0.6, arousal: 0.5 } });
    const c = run(['map', input]).json();
    assert.equal(c.avatar.emotion.label, 'angry');
  });

  test('map with negative valence + negative arousal yields sad label', () => {
    const input = JSON.stringify({ mood: { valence: -0.5, arousal: -0.4 } });
    const c = run(['map', input]).json();
    assert.equal(c.avatar.emotion.label, 'sad');
  });

  test('map with positive valence + negative arousal yields relaxed label', () => {
    const input = JSON.stringify({ mood: { valence: 0.6, arousal: -0.2 } });
    const c = run(['map', input]).json();
    assert.equal(c.avatar.emotion.label, 'relaxed');
  });

  test('map propagates custom source tag', () => {
    const input = JSON.stringify({ mood: {}, source: 'agent:test' });
    const c = run(['map', input]).json();
    assert.equal(c.avatar.face.source,    'agent:test');
    assert.equal(c.avatar.emotion.source, 'agent:test');
  });

  test('map: intent=joy activates joy face preset', () => {
    const input = JSON.stringify({ intent: 'joy', mood: { valence: 0, arousal: 0 } });
    const c = run(['map', input]).json();
    assert.ok(c.avatar.face.mouth.smile > 0.3, 'joy intent should produce notable smile');
  });

  test('map: stage=speaking raises jawOpen', () => {
    const base  = run(['map', JSON.stringify({ mood: {} })]).json();
    const speak = run(['map', JSON.stringify({ mood: {}, stage: 'speaking' })]).json();
    assert.ok(speak.avatar.face.mouth.jawOpen >= 0.18,
      'speaking stage should raise jawOpen to at least 0.18');
    assert.ok(speak.avatar.face.mouth.jawOpen >= base.avatar.face.mouth.jawOpen);
  });

  test('map exits 1 when no arg given', () => {
    const r = run(['map']);
    assert.equal(r.exitCode, 1);
  });

  test('map exits 1 on invalid JSON', () => {
    const r = run(['map', '{bad json}']);
    assert.equal(r.exitCode, 1);
  });
});

// ── apply command (write to state file) ───────────────────────────────────────

describe('avatar-control.js: apply', () => {
  let tmpFile;

  before(() => {
    tmpFile = path.join(os.tmpdir(), `avatar-control-test-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ existing: true }), 'utf8');
  });

  test('apply preset writes control to state file', () => {
    const r = run(['apply', tmpFile, 'preset', 'joy']);
    assert.equal(r.exitCode, 0);
    const result = r.json();
    assert.ok(result.ok, 'should return ok:true');
    assert.ok(result.control, 'should return control in output');
    assert.equal(result.control.avatar.emotion.label, 'happy');

    const written = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.ok(written.control, 'state file must contain control key');
    assert.equal(written.control.avatar.emotion.label, 'happy');
    assert.ok(written.existing, 'existing keys must be preserved');
    assert.ok(written.appearanceIntent, 'appearanceIntent must be written');
  });

  test('apply map writes control derived from agent state', () => {
    const agentState = JSON.stringify({ mood: { valence: 0.9, arousal: 0.5 } });
    run(['apply', tmpFile, 'map', agentState]);
    const written = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.equal(written.control.avatar.emotion.label, 'happy');
  });

  test('apply exits 1 with unknown mode', () => {
    const r = run(['apply', tmpFile, 'badmode']);
    assert.equal(r.exitCode, 1);
  });
});

// ── derived field quality ─────────────────────────────────────────────────────

describe('avatar-control.js: value ranges', () => {
  test('all face numeric fields are within expected range', () => {
    for (const preset of ['calm', 'focus', 'joy']) {
      const face = run(['preset', preset]).json().avatar.face;
      for (const axis of ['yaw', 'pitch', 'roll']) {
        const v = face.pose[axis];
        assert.ok(v >= -1 && v <= 1, `${preset} pose.${axis}=${v} out of [-1,1]`);
      }
      for (const eye of ['blinkL', 'blinkR']) {
        const v = face.eyes[eye];
        assert.ok(v >= 0 && v <= 1, `${preset} eyes.${eye}=${v} out of [0,1]`);
      }
      assert.ok(face.mouth.jawOpen >= 0 && face.mouth.jawOpen <= 1,
        `${preset} jawOpen out of [0,1]`);
      assert.ok(face.mouth.smile >= -1 && face.mouth.smile <= 1,
        `${preset} smile out of [-1,1]`);
    }
  });

  test('emotion numeric fields are within expected range', () => {
    for (const preset of ['calm', 'focus', 'joy']) {
      const emotion = run(['preset', preset]).json().avatar.emotion;
      assert.ok(emotion.valence  >= -1 && emotion.valence  <= 1,  `${preset} valence out of range`);
      assert.ok(emotion.arousal  >= -1 && emotion.arousal  <= 1,  `${preset} arousal out of range`);
      assert.ok(emotion.intensity >= 0 && emotion.intensity <= 1, `${preset} intensity out of range`);
    }
  });
});
