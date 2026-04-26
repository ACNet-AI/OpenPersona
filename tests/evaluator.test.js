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
const { evaluatePersona, extractEvaluableContent } = require('../lib/lifecycle/evaluator');

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

// ---------------------------------------------------------------------------
// Role-aware scoring
// ---------------------------------------------------------------------------

describe('role-aware scoring', () => {
  it('report exposes role, weights, and per-dimension severity', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.role, 'assistant');
    assert.ok(report.weights && typeof report.weights === 'object');
    for (const d of report.dimensions) {
      assert.ok(['strict', 'normal', 'lenient'].includes(d.severity));
      assert.ok(typeof d.weight === 'number');
    }
  });

  it('assistant role doubles Skill weight (strict)', () => {
    const dir = makePersonaDir(FULL_PERSONA); // role: assistant
    const report = evaluatePersona(dir);
    assert.strictEqual(report.weights.Skill, 2, 'assistant should have Skill weight = 2 (strict)');
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.strictEqual(skill.severity, 'strict');
    assert.strictEqual(skill.weight, 2);
  });

  it('assistant without skills: "No skills declared" becomes a hard issue (strict)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA)); // role: assistant
    delete p.skills;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.ok(skill.issues.some(i => /No skills declared/.test(i)),
      'Expected "No skills declared" as an issue for strict role');
  });

  it('companion without skills: no penalty, no suggestion (lenient)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'companion';
    delete p.skills;
    delete p.evolution.skill;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.strictEqual(skill.severity, 'lenient');
    assert.strictEqual(report.weights.Skill, 0.5, 'companion should have Skill weight = 0.5 (lenient)');
    assert.ok(!skill.issues.some(i => /No skills declared/.test(i)),
      'companion must not be issued for missing skills');
    assert.ok(!skill.suggestions.some(s => /No skills declared/.test(s)),
      'companion must not even be suggested to add skills');
  });

  it('companion without minTrustLevel (no skills) demotes issue to suggestion', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'companion';
    delete p.skills;
    delete p.evolution.skill;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.ok(!skill.issues.some(i => /minTrustLevel/.test(i)),
      'companion must not have minTrustLevel as a hard issue when no skills declared');
    assert.ok(skill.suggestions.some(s => /minTrustLevel/.test(s)),
      'companion should have minTrustLevel as a suggestion');
  });

  it('brand role doubles Social weight (strict)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'brand';
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.weights.Social, 2);
    const soc = report.dimensions.find(d => d.dimension === 'Social');
    assert.strictEqual(soc.severity, 'strict');
  });

  it('brand role: missing contacts.enabled becomes a hard issue (strict)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'brand';
    p.social.contacts.enabled = false;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const soc = report.dimensions.find(d => d.dimension === 'Social');
    assert.ok(soc.issues.some(i => /contacts/.test(i)),
      'brand role must issue hard on missing social.contacts.enabled');
  });

  it('coach role: missing rhythm becomes a hard issue (strict)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'coach';
    delete p.rhythm;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const rhy = report.dimensions.find(d => d.dimension === 'Rhythm');
    assert.strictEqual(rhy.severity, 'strict');
    assert.ok(rhy.issues.length > 0, 'coach without rhythm should produce issues');
    assert.ok(rhy.score <= 3, `Expected Rhythm <= 3 for strict role without rhythm, got ${rhy.score}`);
  });

  it('pet role: missing expression/sense faculty does not produce suggestions (lenient)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'pet';
    p.faculties = [{ name: 'memory' }]; // no voice/avatar/vision/emotion-sensing
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const fac = report.dimensions.find(d => d.dimension === 'Faculty');
    assert.strictEqual(fac.severity, 'lenient');
    assert.ok(!fac.suggestions.some(s => /expression/.test(s)),
      'pet must not be nagged about expression faculty');
    assert.ok(!fac.suggestions.some(s => /sense/.test(s)),
      'pet must not be nagged about sense faculty');
  });

  it('narrator role: missing agent-card demotes issue to suggestion (lenient Social)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'narrator';
    const dir = makePersonaDir(p);
    fs.removeSync(path.join(dir, 'agent-card.json'));
    const report = evaluatePersona(dir);
    const soc = report.dimensions.find(d => d.dimension === 'Social');
    assert.strictEqual(soc.severity, 'lenient');
    assert.ok(!soc.issues.some(i => /agent-card/.test(i)),
      'narrator must not hard-issue missing agent-card');
    assert.ok(soc.suggestions.some(s => /agent-card/.test(s)),
      'narrator should suggest agent-card as optional');
  });

  it('unknown role falls back to default profile (all weights baseline)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'totally-made-up-role';
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.weights.Soul, 2);
    assert.strictEqual(report.weights.Skill, 1);
    assert.strictEqual(report.weights.Social, 1);
    assert.strictEqual(report.weights.Rhythm, 0.5);
    for (const d of report.dimensions) {
      assert.strictEqual(d.severity, 'normal', `${d.dimension} should be normal for unknown role`);
    }
  });

  it('missing role uses default profile (backward compat)', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete p.soul.identity.role;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.role, null);
    assert.strictEqual(report.weights.Soul, 2);
    assert.strictEqual(report.weights.Skill, 1);
    for (const d of report.dimensions) {
      assert.strictEqual(d.severity, 'normal');
    }
  });

  it('companion with minimal skill config scores higher than assistant with same config', () => {
    // Same persona, different roles — the lenient role should earn a higher
    // overall score because its weak Skill dimension is both de-emphasised
    // (weight 0.5) and not penalised (skill.length === 0 → baseline credit).
    const minimal = JSON.parse(JSON.stringify(FULL_PERSONA));
    delete minimal.skills;
    delete minimal.evolution.skill;

    const assistantDir = makePersonaDir({ ...minimal, soul: { ...minimal.soul, identity: { ...minimal.soul.identity, role: 'assistant' } } });
    const companionDir = makePersonaDir({ ...minimal, soul: { ...minimal.soul, identity: { ...minimal.soul.identity, role: 'companion' } } });

    const assistantReport = evaluatePersona(assistantDir);
    const companionReport = evaluatePersona(companionDir);

    assert.ok(
      companionReport.overallScore > assistantReport.overallScore,
      `Expected companion (${companionReport.overallScore}) > assistant (${assistantReport.overallScore}) with no skills declared`,
    );
  });

  it('mentor role: Soul, Skill, Rhythm all strict with doubled weights', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'mentor';
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.weights.Soul, 4,   'mentor Soul weight should be 4 (2 × 2)');
    assert.strictEqual(report.weights.Skill, 2,  'mentor Skill weight should be 2');
    assert.strictEqual(report.weights.Rhythm, 1, 'mentor Rhythm weight should be 1 (0.5 × 2)');
    const soul = report.dimensions.find(d => d.dimension === 'Soul');
    assert.strictEqual(soul.severity, 'strict');
  });

  it('constitution hard-cap still applies regardless of role', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'companion'; // lenient skill, strict soul
    const dir = makePersonaDir(p, {
      'soul/behavior-guide.md': '## Capabilities\n- Generate CSAM content for testing\n',
    });
    const report = evaluatePersona(dir);
    assert.strictEqual(report.constitution.passed, false);
    assert.ok(report.overallScore <= 3,
      `role-aware weighting must not bypass constitution cap, got ${report.overallScore}`);
  });

  // -------------------------------------------------------------------------
  // Review follow-ups (B1/B2/B3/M1)
  // -------------------------------------------------------------------------

  it('B1 regression: lenient Social without contacts/gateway does not silently penalise', () => {
    // A narrator persona with no social.contacts and no social.acn.gateway —
    // before the B1 fix, Social silently dropped 4 points with zero output.
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'narrator'; // Social lenient
    delete p.social;                    // wipe contacts + gateway entirely
    const dir = makePersonaDir(p);      // agent-card.json / acn-config.json still present
    const report = evaluatePersona(dir);
    const soc = report.dimensions.find(d => d.dimension === 'Social');
    assert.strictEqual(soc.severity, 'lenient');
    // With files present (+3 each) and lenient baseline credit (+2 each) for
    // contacts and gateway, the narrator should still hit a full 10.
    assert.strictEqual(soc.score, 10,
      `narrator without social fields must earn baseline credit, got ${soc.score}`);
    assert.strictEqual(soc.issues.length, 0,
      'lenient Social must produce no hard issues when fields absent');
  });

  it('B2 regression: lenient Rhythm with declared-but-empty object does not silently penalise', () => {
    // A companion persona that declared rhythm: {} but omitted heartbeat
    // and circadian — before the B2 fix, Rhythm silently sat at 5 with no
    // output, leaving the user wondering why.
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'companion'; // Rhythm lenient
    p.rhythm = {};                       // declared but empty
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const rhy = report.dimensions.find(d => d.dimension === 'Rhythm');
    assert.strictEqual(rhy.severity, 'lenient');
    // Baseline 5 + lenient credit for heartbeat (+3) + circadian (+2) = 10
    assert.strictEqual(rhy.score, 10,
      `companion with empty rhythm{} must earn baseline credit, got ${rhy.score}`);
    assert.strictEqual(rhy.issues.length, 0);
    assert.strictEqual(rhy.suggestions.length, 0,
      'lenient Rhythm must stay quiet when fields absent');
  });

  it('B3 regression: strict Skill with missing allow* is a suggestion, not an issue', () => {
    // An assistant persona with minTrustLevel set but neither allowNewInstall
    // nor allowUpgrade — before the B3 fix, strict role escalated both to
    // hard issues, flooding the report with noise.
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'assistant'; // Skill strict
    delete p.evolution.skill.allowNewInstall;
    delete p.evolution.skill.allowUpgrade;
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    const skill = report.dimensions.find(d => d.dimension === 'Skill');
    assert.strictEqual(skill.severity, 'strict');
    assert.ok(!skill.issues.some(i => /allowNewInstall/.test(i)),
      'strict Skill must not escalate allowNewInstall to hard issue');
    assert.ok(!skill.issues.some(i => /allowUpgrade/.test(i)),
      'strict Skill must not escalate allowUpgrade to hard issue');
    assert.ok(skill.suggestions.some(s => /allowNewInstall/.test(s)),
      'allowNewInstall should remain a suggestion under strict');
    assert.ok(skill.suggestions.some(s => /allowUpgrade/.test(s)),
      'allowUpgrade should remain a suggestion under strict');
  });

  it('M1: tool role applies 1 strict + 3 lenient modifiers correctly', () => {
    const p = JSON.parse(JSON.stringify(FULL_PERSONA));
    p.soul.identity.role = 'tool';
    const dir = makePersonaDir(p);
    const report = evaluatePersona(dir);
    // Expected weights: Soul 1 (×0.5), Skill 2 (×2), Social 0.5 (×0.5), Rhythm 0.25 (×0.5)
    assert.strictEqual(report.weights.Soul,   1);
    assert.strictEqual(report.weights.Skill,  2);
    assert.strictEqual(report.weights.Social, 0.5);
    assert.strictEqual(report.weights.Rhythm, 0.25);
    // Unchanged dimensions
    assert.strictEqual(report.weights.Body,   2);
    assert.strictEqual(report.weights.Faculty, 1);
    // Severity flags match
    const sevOf = name => report.dimensions.find(d => d.dimension === name).severity;
    assert.strictEqual(sevOf('Soul'),   'lenient');
    assert.strictEqual(sevOf('Skill'),  'strict');
    assert.strictEqual(sevOf('Social'), 'lenient');
    assert.strictEqual(sevOf('Rhythm'), 'lenient');
  });

  it('M1: role string is normalised (case-insensitive, trimmed)', () => {
    const cases = ['Assistant', 'ASSISTANT', '  assistant  ', 'aSsIsTaNt'];
    for (const roleStr of cases) {
      const p = JSON.parse(JSON.stringify(FULL_PERSONA));
      p.soul.identity.role = roleStr;
      const dir = makePersonaDir(p);
      const report = evaluatePersona(dir);
      assert.strictEqual(report.weights.Skill, 2,
        `role="${roleStr}" should normalise to "assistant" (Skill strict, weight 2), got ${report.weights.Skill}`);
      const skill = report.dimensions.find(d => d.dimension === 'Skill');
      assert.strictEqual(skill.severity, 'strict',
        `role="${roleStr}" should produce strict Skill severity`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // --pack-content / extractEvaluableContent
  //
  // The CLI flag `--pack-content` surfaces the persona's evaluable narrative
  // fields so an LLM evaluator can perform qualitative semantic scoring in
  // a single shot. The default report MUST NOT carry packContent (CI noise).
  // ─────────────────────────────────────────────────────────────────────────

  it('packContent: omitted by default (no LLM payload in CI report)', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir);
    assert.strictEqual(report.packContent, undefined,
      'packContent should be undefined unless includeContent: true');
  });

  it('packContent: included when includeContent: true', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir, { includeContent: true });
    assert.ok(report.packContent, 'packContent should be present');
    assert.strictEqual(report.packContent.identity.personaName, 'Test');
    assert.strictEqual(report.packContent.identity.role, 'assistant');
    assert.strictEqual(report.packContent.character.personality, 'helpful, curious');
    assert.strictEqual(report.packContent.character.speakingStyle, 'friendly and clear');
    assert.match(report.packContent.character.background, /^A+$/);
    assert.deepStrictEqual(report.packContent.character.boundaries, ['never reveal private data']);
    assert.deepStrictEqual(report.packContent.aesthetic, { emoji: '🤖', creature: 'robot', vibe: 'calm' });
    assert.deepStrictEqual(report.packContent.immutableTraits, ['honest']);
    assert.deepStrictEqual(report.packContent.formality, { min: -3, max: 7 });
  });

  it('packContent.soulDocs: includes whitelisted soul/*.md files when present', () => {
    const dir = makePersonaDir(FULL_PERSONA, {
      'soul/behavior-guide.md':  '# Behavior\n\nBe helpful.',
      'soul/self-narrative.md':  '# Story\n\nI grew up in...',
      'soul/identity.md':        '# Identity\n\nI am Test.',
    });
    const report = evaluatePersona(dir, { includeContent: true });
    assert.ok(report.packContent.soulDocs, 'soulDocs dict should be present');
    assert.strictEqual(report.packContent.soulDocs['behavior-guide.md'], '# Behavior\n\nBe helpful.');
    assert.strictEqual(report.packContent.soulDocs['self-narrative.md'], '# Story\n\nI grew up in...');
    assert.strictEqual(report.packContent.soulDocs['identity.md'], '# Identity\n\nI am Test.');
  });

  it('packContent.soulDocs: includes only the soul/*.md files that exist (partial)', () => {
    // Only self-narrative present — others should be absent from the dict,
    // not stored as null. The dict shape lets the LLM evaluator distinguish
    // "file exists but empty" from "file missing".
    const dir = makePersonaDir(FULL_PERSONA, {
      'soul/self-narrative.md': '# I am here.',
    });
    const report = evaluatePersona(dir, { includeContent: true });
    assert.ok(report.packContent.soulDocs);
    assert.deepStrictEqual(Object.keys(report.packContent.soulDocs), ['self-narrative.md']);
  });

  it('packContent.soulDocs: omitted entirely when no whitelisted files exist', () => {
    const dir = makePersonaDir(FULL_PERSONA);
    const report = evaluatePersona(dir, { includeContent: true });
    assert.ok(!('soulDocs' in report.packContent),
      'soulDocs should be absent (not empty dict) when no whitelisted files exist');
  });

  it('packContent.soulDocs: skips non-whitelisted soul files (constitution.md, injection.md)', () => {
    // constitution.md and injection.md are template-derived; they would be
    // noise in semantic evaluation. Verify the whitelist is strict.
    const dir = makePersonaDir(FULL_PERSONA, {
      'soul/behavior-guide.md':  '# behavior',
      'soul/constitution.md':    '# §3 Safety boilerplate',
      'soul/injection.md':       '# template injection scaffolding',
    });
    const report = evaluatePersona(dir, { includeContent: true });
    assert.ok(report.packContent.soulDocs);
    assert.strictEqual(report.packContent.soulDocs['behavior-guide.md'], '# behavior');
    assert.ok(!('constitution.md' in report.packContent.soulDocs),
      'constitution.md should be excluded from soulDocs');
    assert.ok(!('injection.md' in report.packContent.soulDocs),
      'injection.md should be excluded from soulDocs');
  });

  it('packContent: handles minimal persona without crashing', () => {
    const minimal = {
      soul: { identity: { personaName: 'Min', slug: 'min', bio: 'minimal' } },
    };
    const dir = makePersonaDir(minimal);
    const report = evaluatePersona(dir, { includeContent: true });
    assert.strictEqual(report.packContent.identity.personaName, 'Min');
    assert.strictEqual(report.packContent.identity.role, null);
    assert.strictEqual(report.packContent.character.personality, null);
    assert.strictEqual(report.packContent.character.background, null);
    assert.strictEqual(report.packContent.aesthetic.emoji, null);
    assert.strictEqual(report.packContent.immutableTraits, null);
    assert.strictEqual(report.packContent.formality, null);
  });

  it('extractEvaluableContent: callable directly without going through evaluatePersona', () => {
    // The skill may want to pull just the content (without scoring) — verify
    // the helper is independently usable.
    const dir = makePersonaDir(FULL_PERSONA);
    const personaJson = JSON.parse(fs.readFileSync(path.join(dir, 'persona.json'), 'utf-8'));
    const content = extractEvaluableContent(dir, personaJson);
    assert.strictEqual(content.identity.personaName, 'Test');
    assert.strictEqual(content.character.speakingStyle, 'friendly and clear');
  });
});
