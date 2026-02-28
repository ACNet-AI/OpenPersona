'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const os     = require('os');
const fs     = require('fs-extra');

const { buildReportData, renderVitalityHtml } = require('../lib/vitality-report');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempPersonaDir(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-vitality-test-'));
  fs.mkdirpSync(path.join(dir, 'soul'));

  const persona = Object.assign({
    personaName: 'TestBot',
    slug:        'testbot',
    role:        'assistant',
    bio:         'A test persona for unit tests.',
  }, overrides.persona || {});

  fs.writeJsonSync(path.join(dir, 'soul', 'persona.json'), persona);

  if (overrides.state) {
    fs.writeJsonSync(path.join(dir, 'soul', 'state.json'), overrides.state);
  }
  if (overrides.acnConfig) {
    fs.writeJsonSync(path.join(dir, 'acn-config.json'), overrides.acnConfig);
  }

  return dir;
}

// ─── buildReportData ──────────────────────────────────────────────────────────

describe('lib/vitality-report buildReportData', () => {

  test('returns safe defaults when no state or AgentBooks data', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildReportData(dir, 'testbot');
      assert.equal(data.personaName, 'TestBot');
      assert.equal(data.slug,        'testbot');
      assert.equal(data.role,        'assistant');
      assert.equal(data.vitalityTier, 'uninitialized');
      assert.equal(data.vitalityScore, 0);
      assert.equal(data.walletAddress, '—');
      assert.equal(data.relationshipStage, 'stranger');
      assert.equal(data.interactionCount, 0);
      assert.equal(data.daysTogether, 0);
      assert.equal(data.hasPendingCommands, false);
      assert.equal(data.hasEvolvedTraits,   false);
      assert.equal(data.hasRecentEvents,    false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('personaInitial is first letter of personaName', () => {
    const dir = makeTempPersonaDir({ persona: { personaName: 'Samantha', slug: 'samantha', role: 'companion', bio: '' } });
    try {
      const data = buildReportData(dir, 'samantha');
      assert.equal(data.personaInitial, 'S');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('bioExcerpt truncates long bio to 80 chars', () => {
    const longBio = 'A'.repeat(120);
    const dir = makeTempPersonaDir({ persona: { personaName: 'Bot', slug: 'bot', role: 'assistant', bio: longBio } });
    try {
      const data = buildReportData(dir, 'bot');
      assert.ok(data.bioExcerpt.length <= 80, `bioExcerpt too long: ${data.bioExcerpt.length}`);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('walletAddress formatted as 0x1234...abcd', () => {
    const dir = makeTempPersonaDir({
      acnConfig: { wallet_address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' },
    });
    try {
      const data = buildReportData(dir, 'testbot');
      assert.match(data.walletAddress, /^0x.{4}\.{3}.{4}$/);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('reads state.json relationship, evolvedTraits, eventLog, pendingCommands', () => {
    const state = {
      relationship: {
        stage: 'close_friend',
        interactionCount: 42,
        firstInteraction: new Date(Date.now() - 10 * 86400000).toISOString(),
        lastInteraction:  new Date().toISOString(),
      },
      mood: { current: 'joyful', intensity: 0.8, baseline: 'warm' },
      evolvedTraits: [{ trait: 'warmth', delta: 0.2 }, { trait: 'curiosity', delta: 0.1 }],
      eventLog: [
        { type: 'relationship_signal', trigger: 'User shared personal goal', timestamp: new Date().toISOString() },
        { type: 'trait_emergence',     trigger: 'warmth intensified',        timestamp: new Date().toISOString() },
      ],
      pendingCommands: [
        { type: 'capability_unlock', payload: { skill: 'web_search' }, source: 'host' },
      ],
    };
    const dir = makeTempPersonaDir({ state });
    try {
      const data = buildReportData(dir, 'testbot');
      assert.equal(data.relationshipStage, 'close friend');
      assert.equal(data.interactionCount, 42);
      assert.ok(data.daysTogether >= 9 && data.daysTogether <= 11);
      assert.equal(data.moodCurrent, 'joyful');
      assert.equal(data.hasEvolvedTraits, true);
      assert.equal(data.evolvedTraits.length, 2);
      assert.equal(data.evolvedTraits[0].name, 'warmth');
      assert.equal(data.evolvedTraits[0].delta, '+0.2');
      assert.equal(data.hasRecentEvents, true);
      assert.equal(data.hasPendingCommands, true);
      assert.equal(data.pendingCommandsCount, 1);
      assert.equal(data.pendingCommands[0].type, 'capability_unlock');
      assert.equal(data.heartbeatStatus, 'active');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('heartbeatFrequency and heartbeatStrategy read from persona.json', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        heartbeat: { frequency: 'every 6 hours', strategy: 'reactive' },
      },
    });
    try {
      const data = buildReportData(dir, 'bot');
      assert.equal(data.heartbeatFrequency, 'every 6 hours');
      assert.equal(data.heartbeatStrategy,  'reactive');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('heartbeatFrequency defaults to — when not configured', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildReportData(dir, 'testbot');
      assert.equal(data.heartbeatFrequency, '—');
      assert.equal(data.heartbeatStrategy,  '—');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('weeklyConversations shows 0, not —, when no recent events', () => {
    const dir = makeTempPersonaDir({ state: { eventLog: [] } });
    try {
      const data = buildReportData(dir, 'testbot');
      assert.equal(data.weeklyConversations, 0);
      assert.equal(data.tasksAssisted, 0);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('financialTier falls back to uninitialized for unknown tier values', () => {
    // Without AgentBooks data, financialTier should be uninitialized (not gray)
    const dir = makeTempPersonaDir();
    try {
      const data = buildReportData(dir, 'testbot');
      assert.equal(data.financialTier, 'uninitialized');
    } finally {
      fs.removeSync(dir);
    }
  });

});

// ─── renderVitalityHtml ───────────────────────────────────────────────────────

describe('lib/vitality-report renderVitalityHtml', () => {

  test('returns a non-empty HTML string', () => {
    const dir = makeTempPersonaDir();
    try {
      const html = renderVitalityHtml(dir, 'testbot');
      assert.ok(typeof html === 'string' && html.length > 0);
      assert.ok(html.includes('<!DOCTYPE html>'));
    } finally {
      fs.removeSync(dir);
    }
  });

  test('injects personaName into rendered HTML', () => {
    const dir = makeTempPersonaDir({ persona: { personaName: 'UniqueTestName', slug: 'utname', role: 'assistant', bio: '' } });
    try {
      const html = renderVitalityHtml(dir, 'utname');
      assert.ok(html.includes('UniqueTestName'), 'personaName not found in HTML output');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('pending commands card omitted when no pending commands', () => {
    const dir = makeTempPersonaDir({ state: { pendingCommands: [] } });
    try {
      const html = renderVitalityHtml(dir, 'testbot');
      assert.ok(!html.includes('PENDING COMMANDS'), 'pending commands section should be hidden');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('pending commands card shown when commands present', () => {
    const state = { pendingCommands: [{ type: 'trait_nudge', payload: 'be bolder', source: 'host' }] };
    const dir = makeTempPersonaDir({ state });
    try {
      const html = renderVitalityHtml(dir, 'testbot');
      assert.ok(html.includes('trait_nudge'), 'pending command type not found in HTML');
    } finally {
      fs.removeSync(dir);
    }
  });

});
