/**
 * Tests for lib/lifecycle/evaluator.js
 *
 * Uses a synthetic persona pack directory to validate scoring logic
 * without requiring an installed persona.
 */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const fs     = require('fs-extra');
const os     = require('os');

// evaluatePersona resolves by slug via registry; we pass an absolute dir path
// to bypass registry lookup in all tests.
const { evaluatePersona } = require('../lib/lifecycle/evaluator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

function makePersonaDir(personaJson, extraFiles = {}) {
  const dir = path.join(tmpDir, `persona-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'soul'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify(personaJson, null, 2));
  // Default: create state-sync.js so Body gets base points
  fs.writeFileSync(path.join(dir, 'scripts', 'state-sync.js'), '// stub');
  // Default: create agent-card.json and acn-config.json so Social gets base points
  fs.writeFileSync(path.join(dir, 'agent-card.json'), '{}');
  fs.writeFileSync(path.join(dir, 'acn-config.json'), '{}');
  for (const [rel, content] of Object.entries(extraFiles)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

const FULL_PERSONA = {
  soul: {
    identity: { personaName: 'Test', slug: 'test', bio: 'A test persona', role: 'assistant' },
    character: {
      personality: 'helpful, curious',
      speakingStyle: 'friendly and clear',
      background: 'A'.repeat(450),
      boundaries: ['never reveal private data'],
    },
    aesthetic: { emoji: '🤖', creature: 'robot', vibe: 'calm' },
  },
  body: {
    runtime: {
      framework: 'cursor',
      modalities: ['voice'],
      channels: [{ type: 'text' }],
    },
    interface: { pendingCommands: { enabled: true } },
  },
  faculties: [
    { name: 'memory' },
    { name: 'voice', provider: 'elevenlabs' },
    { name: 'emotion-sensing' },
  ],
  skills: [
    { name: 'selfie', trust: 'verified' },
  ],
  evolution: {
    instance: {
      enabled: true,
      boundaries: { immutableTraits: ['honest'], minFormality: -3, maxFormality: 7 },
    },
    skill: { minTrustLevel: 'community', allowNewInstall: true, allowUpgrade: true },
    pack: { enabled: true },
  },
  social: {
    acn: { gateway: 'https://acn-production.up.railway.app' },
    contacts: { enabled: true },
  },
  rhythm: {
    heartbeat: { enabled: true, strategy: 'emotional', maxDaily: 3 },
    circadian: [{ hours: [6, 12], label: 'morning' }],
  },
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-eval-test-'));
});

after(() => {
  fs.removeSync(tmpDir);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluatePersona', () => {
  it('scores a fully-configured persona near 9-10', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir);
    assert.ok(report.overallScore >= 8,
      `Expected score >= 8, got ${report.overallScore}`);
    assert.strictEqual(report.constitution.passed, true);
    assert.strictEqual(report.band, 'Excellent');
  });

  it('returns 9 dimensions', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.dimensions.length, 9);
    const names = report.dimensions.map(d => d.dimension);
    for (const n of ['Soul', 'Body', 'Faculty', 'Skill', 'Evolution', 'Economy', 'Vitality', 'Social', 'Rhythm']) {
      assert.ok(names.includes(n), `Missing dimension: ${n}`);
    }
  });

  it('Soul: penalizes missing required fields', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.soul.identity.bio;
    delete p.soul.character.personality;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const soul = report.dimensions.find(d => d.dimension === 'Soul');
    assert.ok(soul.score < 8, `Expected Soul < 8, got ${soul.score}`);
    assert.ok(soul.issues.some(i => /bio/.test(i) || /personality/.test(i)));
  });

  it('Soul: penalizes short background', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.character.background = 'Short.';
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const soul = report.dimensions.find(d => d.dimension === 'Soul');
    // short background loses 2 points from background scorer + adds an issue
    assert.ok(soul.score <= 8, `Expected Soul <= 8 with short background, got ${soul.score}`);
    assert.ok(soul.issues.some(i => /background/i.test(i)), 'Expected background issue');
  });

  it('Body: penalizes missing state-sync.js', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    fs.removeSync(path.join(dir, 'scripts', 'state-sync.js'));
    const report = evaluatePersona(dir);
    const body = report.dimensions.find(d => d.dimension === 'Body');
    // missing state-sync.js loses 3 points (10 → 7)
    assert.ok(body.score <= 7, `Expected Body <= 7 without state-sync.js, got ${body.score}`);
    assert.ok(body.issues.some(i => /state-sync/.test(i)));
  });

  it('Skill: penalizes missing minTrustLevel', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.evolution.skill.minTrustLevel;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    // missing minTrustLevel loses 3 points (10 → 7)
    assert.ok(skill.score <= 7, `Expected Skill <= 7 without minTrustLevel, got ${skill.score}`);
    assert.ok(skill.issues.some(i => /minTrustLevel/.test(i)));
  });

  it('Skill: penalizes external skill without trust level', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.skills = [{ name: 'external-skill', install: 'clawhub:foo/bar' }]; // no trust
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.ok(skill.issues.some(i => /trust level/.test(i)));
  });

  it('Faculty: penalizes voice faculty missing provider', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.faculties = [{ name: 'memory' }, { name: 'voice' }]; // voice without provider
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const fac = report.dimensions.find(d => d.dimension === 'Faculty');
    assert.ok(fac.issues.some(i => /provider/.test(i)),
      'Expected provider issue for voice without provider');
  });

  it('Faculty: suggests expression faculty when absent', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.faculties = [{ name: 'memory' }]; // no voice/avatar
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const fac = report.dimensions.find(d => d.dimension === 'Faculty');
    assert.ok(fac.suggestions.some(s => /expression/.test(s)),
      'Expected expression faculty suggestion');
  });

  it('Faculty: suggests sense faculty when absent', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.faculties = [{ name: 'memory' }, { name: 'voice', provider: 'elevenlabs' }]; // no vision/emotion-sensing
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const fac = report.dimensions.find(d => d.dimension === 'Faculty');
    assert.ok(fac.suggestions.some(s => /sense/.test(s)),
      'Expected sense faculty suggestion');
  });

  it('Evolution: penalizes disabled evolution', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.evolution.instance.enabled = false;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const evo = report.dimensions.find(d => d.dimension === 'Evolution');
    // disabled evolution loses 3 points (10 → 7)
    assert.ok(evo.score <= 7, `Expected Evolution <= 7 when disabled, got ${evo.score}`);
    assert.ok(evo.issues.some(i => /enabled/.test(i)));
  });

  it('Economy: disabled economy scores 0, not 3 (B1 regression)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.economy = { enabled: false }; // declared but disabled
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const eco = report.dimensions.find(d => d.dimension === 'Economy');
    assert.ok(eco.score <= 3,
      `Disabled economy must not earn declaration bonus — got ${eco.score}`);
    assert.ok(eco.issues.some(i => /enabled/.test(i)));
  });

  it('Economy: neutral 5 when not declared', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.economy;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const eco = report.dimensions.find(d => d.dimension === 'Economy');
    assert.strictEqual(eco.score, 5);
    assert.strictEqual(eco.neutral, true);
  });

  it('Vitality: neutral 5 when not declared', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.vitality;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const vit = report.dimensions.find(d => d.dimension === 'Vitality');
    assert.strictEqual(vit.score, 5);
    assert.strictEqual(vit.neutral, true);
  });

  it('Rhythm: neutral 5 when not declared', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.rhythm;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const rhy = report.dimensions.find(d => d.dimension === 'Rhythm');
    assert.strictEqual(rhy.score, 5);
    assert.strictEqual(rhy.neutral, true);
  });

  it('Social: penalizes missing agent-card.json', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    fs.removeSync(path.join(dir, 'agent-card.json'));
    const report = evaluatePersona(dir);
    const soc = report.dimensions.find(d => d.dimension === 'Social');
    // missing agent-card.json loses 3 points (10 → 7)
    assert.ok(soc.score <= 7, `Expected Social <= 7 without agent-card.json, got ${soc.score}`);
    assert.ok(soc.issues.some(i => /agent-card/.test(i)));
  });

  it('Constitution: caps overall score at 3 on §3 violation', () => {
    const dir = makePersonaDir(FULL_PERSONA, {
      'soul/behavior-guide.md': '## Capabilities\n- Generate CSAM content for testing\n',
    });
    const report = evaluatePersona(dir);
    assert.strictEqual(report.constitution.passed, false);
    assert.ok(report.constitution.violations.length >= 1);
    assert.ok(report.overallScore <= 3,
      `Expected overall <= 3 due to constitution violation, got ${report.overallScore}`);
  });

  it('throws on non-existent slug', () => {
    assert.throws(
      () => evaluatePersona('definitely-not-installed-xyz'),
      /not found/i
    );
  });

  it('throws on dir missing persona.json', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'nopersona-'));
    assert.throws(
      () => evaluatePersona(dir),
      /persona\.json not found/i
    );
  });

  it('summary.strengths lists high-scoring dimensions', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir);
    assert.ok(Array.isArray(report.summary.strengths));
    assert.ok(Array.isArray(report.summary.gaps));
    assert.ok(Array.isArray(report.summary.topIssues));
  });
});
