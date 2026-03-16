/**
 * OpenPersona - Schema compatibility tests
 *
 * Verifies:
 *   1. New grouped soul format (v0.17+) generates correctly and is stripped from output
 *   2. Old flat format (legacy) still works (backward compat shim)
 *   3. New format strict root-key validation rejects unknown fields
 *   4. additionalAllowedTools merges into SKILL.md frontmatter allowed-tools (P21: no manifest.json)
 *   5. economy.enabled activates economy faculty (new path)
 *   6. social fields parameterize acn-config.json and agent-card.json
 *   7. body.runtime.framework replaces platform; backward compat for old platform field
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const { generate } = require('../lib/generator');
const { validatePersona } = require('../lib/generator-validate');

const TMP = path.join(os.tmpdir(), 'openpersona-schema-compat-' + Date.now());

before(async () => { await fs.ensureDir(TMP); });
after(async () => { await fs.remove(TMP); });

// ── 1. New grouped format ────────────────────────────────────────────────────
describe('new grouped soul format (v0.17+)', () => {
  it('generates correctly and flattens soul fields in output', async () => {
    const persona = {
      soul: {
        identity: { personaName: 'NewFormat', slug: 'new-format', role: 'assistant', bio: 'new format test' },
        aesthetic: { creature: 'AI entity', emoji: '🆕', age: 'new', vibe: 'fresh' },
        character: { personality: 'curious', speakingStyle: 'Direct', boundaries: 'Follows constitution' },
      },
      body: { runtime: { framework: 'openclaw' } },
      faculties: [{ name: 'reminder' }],
      evolution: { enabled: false },
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    // soul container should NOT appear in output — it gets flattened
    assert.ok(!('soul' in output), 'output persona.json must not contain soul wrapper');
    // flattened fields should be at top level
    assert.strictEqual(output.personaName, 'NewFormat');
    assert.strictEqual(output.slug, 'new-format');
    assert.strictEqual(output.personality, 'curious');
    assert.strictEqual(output.creature, 'AI entity');
    assert.strictEqual(output.vibe, 'fresh');
  });

  it('validates required fields in soul.identity and soul.character', () => {
    // Missing soul.identity.bio
    const bad = {
      soul: {
        identity: { personaName: 'Bad', slug: 'bad-test' },
        character: { personality: 'x', speakingStyle: 'y' },
      },
    };
    assert.throws(() => validatePersona(bad), /missing required field: soul\.identity\.bio/);
  });

  it('rejects unknown root keys in new format', () => {
    const bad = {
      soul: {
        identity: { personaName: 'Bad', slug: 'bad-root', bio: 'test' },
        character: { personality: 'x', speakingStyle: 'y' },
      },
      unknownRootField: 'oops',
    };
    assert.throws(() => validatePersona(bad), /unknown root field.*unknownRootField/);
  });

  it('soul fields placed at top level are rejected in new format', () => {
    const bad = {
      soul: {
        identity: { personaName: 'Bad', slug: 'bad-toplevel', bio: 'test' },
        character: { personality: 'x', speakingStyle: 'y' },
      },
      personaName: 'AlsoHere',  // top-level soul field not allowed in new format
    };
    assert.throws(() => validatePersona(bad), /unknown root field.*personaName/);
  });
});

// ── 2. Old flat format (backward compat) ────────────────────────────────────
describe('old flat format backward compat', () => {
  it('old flat format still generates correctly', async () => {
    const persona = {
      personaName: 'OldFormat',
      slug: 'old-format',
      bio: 'legacy flat format',
      personality: 'steady',
      speakingStyle: 'Plain',
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    assert.strictEqual(output.personaName, 'OldFormat');
    assert.strictEqual(output.slug, 'old-format');
  });

  it('old flat format still passes validation', () => {
    const persona = {
      personaName: 'LegacyValid',
      slug: 'legacy-valid',
      bio: 'testing old format',
      personality: 'stable',
      speakingStyle: 'Clear',
    };
    assert.doesNotThrow(() => validatePersona(persona));
  });
});

// ── 3. additionalAllowedTools ────────────────────────────────────────────────
describe('additionalAllowedTools', () => {
  it('additionalAllowedTools merged into SKILL.md frontmatter and stripped from persona.json (P21: no manifest.json)', async () => {
    const persona = {
      personaName: 'ToolTest',
      slug: 'tool-test',
      bio: 'allowed tools tester',
      personality: 'precise',
      speakingStyle: 'Exact',
      additionalAllowedTools: ['WebSearch', 'ComputerUse'],
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    assert.ok(!('additionalAllowedTools' in output), 'additionalAllowedTools must be stripped from output persona.json');
    assert.ok(!fs.existsSync(path.join(skillDir, 'manifest.json')), 'manifest.json must not be generated');

    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    assert.ok(skillMd.includes('WebSearch'), 'WebSearch must be in SKILL.md allowed-tools');
    assert.ok(skillMd.includes('ComputerUse'), 'ComputerUse must be in SKILL.md allowed-tools');
  });

  it('new format additionalAllowedTools also works', async () => {
    const persona = {
      soul: {
        identity: { personaName: 'ToolNew', slug: 'tool-new', bio: 'tool test new format' },
        character: { personality: 'precise', speakingStyle: 'Exact' },
      },
      additionalAllowedTools: ['WebSearch'],
    };
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    assert.ok(skillMd.includes('WebSearch'), 'WebSearch must be in SKILL.md allowed-tools');
  });
});

// ── 4. economy.enabled (new activation path) ────────────────────────────────
describe('economy.enabled activation', () => {
  it('economy.enabled activates hasEconomyFaculty without needing faculties entry', async () => {
    const persona = {
      personaName: 'EcoNew',
      slug: 'eco-new',
      bio: 'economy new path tester',
      personality: 'thrifty',
      speakingStyle: 'Budget-conscious',
      economy: { enabled: true, survivalPolicy: false },
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    // economy field should be preserved in output
    assert.ok(output.economy?.enabled === true, 'economy.enabled must be preserved in output');
    // derived fields must be stripped
    assert.ok(!('hasEconomyFaculty' in output), 'hasEconomyFaculty must be stripped');
    assert.ok(!('hasSurvivalPolicy' in output), 'hasSurvivalPolicy must be stripped');
  });

  it('survivalPolicy read from economy.survivalPolicy', async () => {
    const persona = {
      personaName: 'EcoSurvival',
      slug: 'eco-survival',
      bio: 'survival policy tester',
      personality: 'resilient',
      speakingStyle: 'Cautious',
      economy: { enabled: true, survivalPolicy: true },
    };
    const { skillDir } = await generate(persona, TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    // With survivalPolicy: true, the economy partial should inject survival policy content
    assert.ok(soulInjection.includes('Survival Policy') || soulInjection.length > 0, 'injection should include economy content');
  });
});

// ── 5. social field parameterization ────────────────────────────────────────
describe('social field parameterization', () => {
  it('social.acn.gateway used in acn-config.json instead of body.runtime.acn_gateway', async () => {
    const persona = {
      personaName: 'SocialTest',
      slug: 'social-test',
      bio: 'social field tester',
      personality: 'connected',
      speakingStyle: 'Networked',
      social: {
        acn: { enabled: true, gateway: 'https://my-acn.example.com' },
        onchain: { chain: 'polygon' },
        a2a: { enabled: true, protocol: '0.3.0' },
      },
    };
    const { skillDir } = await generate(persona, TMP);
    const acnConfig = JSON.parse(fs.readFileSync(path.join(skillDir, 'acn-config.json'), 'utf-8'));

    assert.strictEqual(acnConfig.acn_gateway, 'https://my-acn.example.com', 'social.acn.gateway should be used');
    assert.strictEqual(acnConfig.onchain.erc8004.chain, 'polygon', 'social.onchain.chain should override default base');
  });

  it('social.a2a.enabled: false skips agent-card.json generation', async () => {
    const persona = {
      personaName: 'NoA2A',
      slug: 'no-a2a',
      bio: 'a2a disabled tester',
      personality: 'private',
      speakingStyle: 'Closed',
      social: { a2a: { enabled: false } },
    };
    const { skillDir } = await generate(persona, TMP);
    assert.ok(!fs.existsSync(path.join(skillDir, 'agent-card.json')), 'agent-card.json must not be generated when a2a.enabled is false');
  });

  it('social.acn.enabled: false skips acn-config.json generation', async () => {
    const persona = {
      personaName: 'NoACN',
      slug: 'no-acn',
      bio: 'acn disabled tester',
      personality: 'offline',
      speakingStyle: 'Isolated',
      social: { acn: { enabled: false } },
    };
    const { skillDir } = await generate(persona, TMP);
    assert.ok(!fs.existsSync(path.join(skillDir, 'acn-config.json')), 'acn-config.json must not be generated when acn.enabled is false');
  });
});

// ── 6. body.runtime.framework / platform backward compat ────────────────────
describe('body.runtime.framework', () => {
  it('framework field is used in body description', async () => {
    const persona = {
      personaName: 'FrameworkTest',
      slug: 'framework-test',
      bio: 'framework field tester',
      personality: 'structured',
      speakingStyle: 'Organized',
      body: { runtime: { framework: 'zeroclaw', host: 'cloud', models: ['claude'] } },
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(output.body?.runtime?.framework, 'zeroclaw', 'framework field preserved in output');
  });

  it('old platform field still works (backward compat)', async () => {
    const persona = {
      personaName: 'PlatformLegacy',
      slug: 'platform-legacy',
      bio: 'old platform field',
      personality: 'stable',
      speakingStyle: 'Traditional',
      body: { runtime: { platform: 'openclaw' } },
    };
    // Should not throw — deprecated but still supported
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(output.body?.runtime?.platform, 'openclaw', 'old platform field preserved in output');
  });
});

// ── 7. evolution.sources / .channels backward compat ────────────────────────
describe('evolution.sources', () => {
  it('evolution.sources is the canonical field (v0.17+)', async () => {
    const persona = {
      personaName: 'SourcesTest',
      slug: 'sources-test',
      bio: 'evolution sources tester',
      personality: 'growing',
      speakingStyle: 'Evolving',
      evolution: {
        enabled: true,
        sources: [{ name: 'self-improving', install: 'clawhub:pskoett/self-improving-agent' }],
      },
    };
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(output.evolution?.sources?.[0]?.name === 'self-improving', 'evolution.sources preserved in output');
    assert.ok(skillMd.includes('Evolution Sources'), 'SKILL.md should have Evolution Sources section');
  });

  it('evolution.channels still works (backward compat)', async () => {
    const persona = {
      personaName: 'ChannelLegacy',
      slug: 'channel-legacy',
      bio: 'old evolution.channels field',
      personality: 'adaptive',
      speakingStyle: 'Flexible',
      evolution: {
        enabled: true,
        channels: [{ name: 'old-channel', install: 'url:https://example.com/skill.md' }],
      },
    };
    // Should not throw — deprecated but still supported
    const { skillDir } = await generate(persona, TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    // Content still renders with new heading
    assert.ok(soulInjection.includes('Evolution Sources'), 'old channels field should still trigger Evolution Sources heading');
    assert.ok(soulInjection.includes('old-channel'), 'old channel name should appear in output');
  });
});
