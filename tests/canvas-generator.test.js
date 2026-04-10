'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const os     = require('os');
const fs     = require('fs-extra');

const { buildCanvasData, renderCanvasHtml } = require('../lib/report/canvas');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempPersonaDir(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-canvas-test-'));
  fs.mkdirpSync(path.join(dir, 'soul'));

  const persona = Object.assign({
    personaName: 'TestBot',
    slug:        'testbot',
    role:        'assistant',
    bio:         'A test persona for unit tests.',
  }, overrides.persona || {});

  fs.writeJsonSync(path.join(dir, 'persona.json'), persona);

  if (overrides.state) {
    fs.writeJsonSync(path.join(dir, 'state.json'), overrides.state);
  }
  if (overrides.agentCard) {
    fs.writeJsonSync(path.join(dir, 'agent-card.json'), overrides.agentCard);
  }
  if (overrides.acnConfig) {
    fs.writeJsonSync(path.join(dir, 'acn-config.json'), overrides.acnConfig);
  }
  return dir;
}

// ─── buildCanvasData: identity ────────────────────────────────────────────────

describe('lib/canvas-generator buildCanvasData — identity', () => {

  test('returns basic identity fields', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.personaName,    'TestBot');
      assert.equal(data.slug,           'testbot');
      assert.equal(data.role,           'assistant');
      assert.equal(data.personaInitial, 'T');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('personaInitial is uppercase first letter', () => {
    const dir = makeTempPersonaDir({ persona: { personaName: 'Samantha', slug: 'samantha', role: 'companion', bio: '' } });
    try {
      const data = buildCanvasData(dir, 'samantha');
      assert.equal(data.personaInitial, 'S');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('bioExcerpt truncates to 200 chars', () => {
    const longBio = 'x'.repeat(250);
    const dir = makeTempPersonaDir({ persona: { personaName: 'Bot', slug: 'bot', role: 'assistant', bio: longBio } });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.ok(data.bioExcerpt.length <= 200, `bioExcerpt too long: ${data.bioExcerpt.length}`);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('referenceImage defaults to empty string', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.referenceImage,    '');
      assert.equal(data.hasReferenceImage, false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('hasReferenceImage true when referenceImage set', () => {
    const dir = makeTempPersonaDir({
      persona: { personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '', referenceImage: 'https://example.com/img.png' },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.hasReferenceImage, true);
      assert.equal(data.referenceImage, 'https://example.com/img.png');
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ─── buildCanvasData: safe defaults when files missing ───────────────────────

describe('lib/canvas-generator buildCanvasData — missing files graceful', () => {

  test('no state.json → safe defaults for soul fields', () => {
    const dir = makeTempPersonaDir();  // no state
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.moodCurrent,       'neutral');
      assert.equal(data.relationshipStage, 'stranger');
      assert.equal(data.interactionCount,  0);
      assert.equal(data.daysTogether,      0);
      assert.equal(data.hasEvolvedTraits,  false);
      assert.equal(data.hasRecentEvents,   false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('no agent-card.json → hasA2A false', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasA2A, false);
      assert.equal(data.a2aUrl, '');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('agent-card.json with placeholder url → hasA2A false', () => {
    const dir = makeTempPersonaDir({
      agentCard: { url: 'https://<RUNTIME_ENDPOINT>/a2a', name: 'TestBot' },
    });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasA2A, false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('agent-card.json with real url → hasA2A true', () => {
    const dir = makeTempPersonaDir({
      agentCard: { url: 'https://api.example.com/a2a', name: 'TestBot' },
    });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasA2A, true);
      assert.equal(data.a2aUrl, 'https://api.example.com/a2a');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('no acn-config.json → walletAddress is em-dash', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.walletAddress, '—');
      assert.equal(data.hasWallet,     false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('acn-config.json with wallet → walletAddress shortened', () => {
    const dir = makeTempPersonaDir({
      acnConfig: { wallet_address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12' },
    });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.ok(data.walletAddress.includes('...'), 'wallet should be shortened with ...');
      assert.equal(data.hasWallet, true);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('frameworkVersion falls back to package.json when not in persona.json meta', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.ok(data.frameworkVersion && data.frameworkVersion !== '—',
        'frameworkVersion should fall back to package.json version');
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ─── buildCanvasData: state fields ────────────────────────────────────────────

describe('lib/canvas-generator buildCanvasData — state fields', () => {

  test('reads mood, relationship, evolvedTraits from state.json', () => {
    const dir = makeTempPersonaDir({
      state: {
        mood:         { current: 'curious', intensity: 0.7 },
        relationship: { stage: 'friend', interactionCount: 42, firstInteraction: '2025-01-01T00:00:00Z' },
        evolvedTraits: [{ trait: 'warmth' }, { trait: 'directness' }],
        eventLog: [],
      },
    });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.moodCurrent,       'curious');
      assert.equal(data.relationshipStage, 'friend');
      assert.equal(data.interactionCount,  42);
      assert.ok(data.daysTogether > 0,     'daysTogether should be > 0 for past firstInteraction');
      assert.equal(data.hasEvolvedTraits,  true);
      assert.equal(data.evolvedTraits.length, 2);
      assert.equal(data.evolvedTraits[0].name, 'warmth');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('relationship stage underscore → space', () => {
    const dir = makeTempPersonaDir({
      state: { relationship: { stage: 'close_friend', interactionCount: 10 } },
    });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.relationshipStage, 'close friend');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('recentEvents from eventLog (last 5 newest first)', () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      type:      'relationship_signal',
      trigger:   `event ${i}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    }));
    const dir = makeTempPersonaDir({ state: { eventLog: events } });
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasRecentEvents,     true);
      assert.equal(data.recentEvents.length, 5);
      assert.equal(data.recentEvents[0].typeLabel, 'Relationship');
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ─── buildCanvasData: faculties & skills ──────────────────────────────────────

describe('lib/canvas-generator buildCanvasData — faculties and skills', () => {

  test('active faculty (no install field) → isDormant false', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        faculties: [{ name: 'voice', provider: 'elevenlabs' }],
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.hasFaculties, true);
      assert.equal(data.faculties[0].name,      'voice');
      assert.equal(data.faculties[0].isDormant, false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('dormant faculty (has install field) → isDormant true', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        faculties: [{ name: 'avatar', install: 'npx skills add github:org/avatar-skill' }],
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.faculties[0].isDormant,      true);
      assert.equal(data.faculties[0].installSource,  'npx skills add github:org/avatar-skill');
      assert.equal(data.hasDormantFaculties,         true);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('active skill (no install field) → isDormant false', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        skills: [{ name: 'web-search', description: 'Search the web.' }],
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.hasSkills,            true);
      assert.equal(data.skills[0].name,       'web-search');
      assert.equal(data.skills[0].isDormant,  false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('dormant skill (has install field) → isDormant true', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        skills: [{ name: 'deep-research', install: 'clawhub:deep-research' }],
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.skills[0].isDormant,     true);
      assert.equal(data.skills[0].installSource, 'clawhub:deep-research');
      assert.equal(data.hasDormantSkills,        true);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('no faculties or skills → flags false', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasFaculties, false);
      assert.equal(data.hasSkills,    false);
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ─── buildCanvasData: body layer ──────────────────────────────────────────────

describe('lib/canvas-generator buildCanvasData — body layer', () => {

  test('no body.runtime → hasBody false', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.equal(data.hasBody, false);
    } finally {
      fs.removeSync(dir);
    }
  });

  test('body.runtime present → hasBody true, bodyPlatform filled', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        body: { runtime: { platform: 'openclaw', acn_gateway: 'https://acn.example.com' } },
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.hasBody,      true);
      assert.equal(data.bodyPlatform, 'openclaw');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('rhythm.heartbeat.enabled true → heartbeatEnabled true', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        body: { runtime: { platform: 'openclaw' } },
        rhythm: { heartbeat: { enabled: true, strategy: 'smart' } },
      },
    });
    try {
      const data = buildCanvasData(dir, 'bot');
      assert.equal(data.heartbeatEnabled, true);
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ─── renderCanvasHtml ─────────────────────────────────────────────────────────

describe('lib/canvas-generator renderCanvasHtml', () => {

  test('returns non-empty HTML string', () => {
    const dir = makeTempPersonaDir();
    try {
      const html = renderCanvasHtml(dir, 'testbot');
      assert.ok(typeof html === 'string' && html.length > 100, 'should return HTML string');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('HTML contains personaName', () => {
    const dir = makeTempPersonaDir({ persona: { personaName: 'Athena', slug: 'athena', role: 'mentor', bio: 'test' } });
    try {
      const html = renderCanvasHtml(dir, 'athena');
      assert.ok(html.includes('Athena'), 'HTML should contain persona name');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('HTML contains four layer section labels', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: 'test',
        body: { runtime: { platform: 'openclaw' } },
        faculties: [{ name: 'voice' }],
        skills: [{ name: 'web-search', description: 'search' }],
      },
      state: { evolvedTraits: [{ trait: 'curiosity' }], eventLog: [] },
    });
    try {
      const html = renderCanvasHtml(dir, 'bot');
      assert.ok(html.includes('Soul'),    'HTML should contain Soul label');
      assert.ok(html.includes('Body'),    'HTML should contain Body label');
      assert.ok(html.includes('Faculty'), 'HTML should includes Faculty label');
      assert.ok(html.includes('Skill'),   'HTML should include Skill label');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('dormant skill shows install source in HTML', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        skills: [{ name: 'deep-research', install: 'clawhub:deep-research' }],
      },
    });
    try {
      const html = renderCanvasHtml(dir, 'bot');
      assert.ok(html.includes('clawhub:deep-research'), 'dormant skill install source should appear in HTML');
    } finally {
      fs.removeSync(dir);
    }
  });

  test('Talk button appears when hasA2A true', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Bot', slug: 'bot', role: 'assistant', bio: '',
        skills: [{ name: 'chat', description: 'chat skill' }],
      },
      agentCard: { url: 'https://api.example.com/a2a', name: 'Bot' },
    });
    try {
      const html = renderCanvasHtml(dir, 'bot');
      assert.ok(html.includes('btn-talk'),               'Talk button class should appear');
      assert.ok(html.includes('api.example.com/a2a'),    'A2A URL should appear in Talk button');
    } finally {
      fs.removeSync(dir);
    }
  });
});

// ── buildCanvasData: P14 Phase 1.5 — avatar widget ────────────────────────────

describe('lib/canvas-generator buildCanvasData — avatar widget (P14 Phase 1.5)', () => {
  const fs2 = require('fs-extra');

  test('no avatar faculty → hasAvatarFaculty false, hasAvatarModel3d false', () => {
    const dir = makeTempPersonaDir();
    try {
      const data = buildCanvasData(dir, 'testbot');
      assert.strictEqual(data.hasAvatarFaculty, false);
      assert.strictEqual(data.hasAvatarModel3d,  false);
      assert.strictEqual(data.avatarModel3Url,   '');
      assert.strictEqual(data.avatarWidgetInlineScript, '');
    } finally {
      fs2.removeSync(dir);
    }
  });

  test('avatar faculty with model3d → hasAvatarFaculty true, hasAvatarModel3d true, avatarModel3Url set', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Miku', slug: 'miku', role: 'companion', bio: '',
        faculties: ['avatar'],
        body: { appearance: { model3d: './assets/avatar/miku.model.json' } },
      },
    });
    try {
      const data = buildCanvasData(dir, 'miku');
      assert.strictEqual(data.hasAvatarFaculty, true);
      assert.strictEqual(data.hasAvatarModel3d,  true);
      assert.strictEqual(data.avatarModel3Url,   './assets/avatar/miku.model.json');
    } finally {
      fs2.removeSync(dir);
    }
  });

  test('avatar faculty without model3d → hasAvatarModel3d false, no widget script', () => {
    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Miku', slug: 'miku', role: 'companion', bio: '',
        faculties: ['avatar'],
        body: { appearance: {} },
      },
    });
    try {
      const data = buildCanvasData(dir, 'miku');
      assert.strictEqual(data.hasAvatarFaculty, true);
      assert.strictEqual(data.hasAvatarModel3d,  false);
      assert.strictEqual(data.avatarWidgetInlineScript, '', 'No widget script without model3d');
    } finally {
      fs2.removeSync(dir);
    }
  });

  test('avatar faculty + model3d → avatarWidgetInlineScript inlined when packages/avatar-runtime exists', () => {
    const WIDGET = path.resolve(__dirname, '..', 'packages', 'avatar-runtime', 'web', 'avatar-widget.js');
    const widgetExists = require('node:fs').existsSync(WIDGET);
    if (!widgetExists) return; // skip when packages/ not present

    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Hana', slug: 'hana', role: 'companion', bio: '',
        faculties: ['avatar'],
        body: { appearance: { model3d: './assets/avatar/hana.model.json' } },
      },
    });
    try {
      const data = buildCanvasData(dir, 'hana');
      assert.ok(data.avatarWidgetInlineScript.includes('AvatarWidget'),
        'Inlined script should contain AvatarWidget');
      assert.ok(data.avatarWidgetInlineScript.includes('ensureRegistry'),
        'Inlined script should contain ensureRegistry');
    } finally {
      fs2.removeSync(dir);
    }
  });

  test('HTML contains opAvatarMount div when hasAvatarModel3d', () => {
    const WIDGET = path.resolve(__dirname, '..', 'packages', 'avatar-runtime', 'web', 'avatar-widget.js');
    if (!require('node:fs').existsSync(WIDGET)) return;

    const dir = makeTempPersonaDir({
      persona: {
        personaName: 'Hana', slug: 'hana', role: 'companion', bio: '',
        faculties: ['avatar'],
        body: { appearance: { model3d: './assets/avatar/hana.model.json' } },
      },
    });
    try {
      const html = renderCanvasHtml(dir, 'hana');
      assert.ok(html.includes('opAvatarMount'),    'HTML should include #opAvatarMount div');
      assert.ok(html.includes('avatar-live-badge'), 'HTML should include live badge');
      assert.ok(html.includes('AvatarWidget'),      'HTML should contain inlined widget script');
      assert.ok(html.includes('hana.model.json'),   'HTML should include model3d URL in init script');
    } finally {
      fs2.removeSync(dir);
    }
  });

  test('HTML does NOT render opAvatarMount div when no avatar faculty', () => {
    const dir = makeTempPersonaDir();
    try {
      const html = renderCanvasHtml(dir, 'testbot');
      // CSS class names are always in <style>; check for the actual HTML elements
      assert.ok(!html.includes('<div id="opAvatarMount">'),        'Should not inject avatar mount div without avatar faculty');
      assert.ok(!html.includes('<span class="avatar-live-badge">'), 'Should not show live badge element without avatar faculty');
    } finally {
      fs2.removeSync(dir);
    }
  });
});
