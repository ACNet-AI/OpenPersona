/**
 * OpenPersona - Generator tests: identity — influence boundary, agent card, ACN config
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');
const { loadRegistry, saveRegistry, registryAdd, registryRemove, registrySetActive, REGISTRY_PATH } = require('../lib/registry');
const { generateHandoff, renderHandoff } = require('../lib/lifecycle/switcher');

const TMP = path.join(require('os').tmpdir(), 'openpersona-test-id-' + Date.now());

describe('influence boundary', () => {
  const IB_TMP = path.join(require('os').tmpdir(), 'openpersona-ib-test-' + Date.now());

  const basePersona = {
    personaName: 'InfluenceTest',
    slug: 'influence-test',
    bio: 'Testing influence boundary',
    personality: 'Adaptive, open',
    speakingStyle: 'Friendly',
    evolution: {
      enabled: true,
      boundaries: {
        immutableTraits: ['kindness'],
        minFormality: 3,
        maxFormality: 8,
      },
      influenceBoundary: {
        defaultPolicy: 'reject',
        rules: [
          { dimension: 'mood', allowFrom: ['persona:*', 'channel:evomap'], maxDrift: 0.3 },
          { dimension: 'interests', allowFrom: ['channel:evomap'], maxDrift: 0.2 },
        ],
      },
    },
    faculties: [],
  };

  it('injects influence boundary into Growth section of soul-injection.md', async () => {
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(basePersona, IB_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(injection.includes('Influence Boundary'), 'should have Influence Boundary heading');
    assert.ok(injection.includes('default policy is **reject**'), 'should show default policy');
    assert.ok(injection.includes('mood'), 'should list mood as influenceable dimension');
    assert.ok(injection.includes('interests'), 'should list interests as influenceable dimension');
    assert.ok(injection.includes('allowFrom'), 'should mention allowFrom check');
    assert.ok(injection.includes('maxDrift'), 'should mention maxDrift check');
  });

  it('renders influence boundary table in SKILL.md', async () => {
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(basePersona, IB_TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('## Influence Boundary'), 'should have Influence Boundary section');
    assert.ok(skillMd.includes('**mood**'), 'should list mood rule');
    assert.ok(skillMd.includes('**interests**'), 'should list interests rule');
    assert.ok(skillMd.includes('0.3'), 'should show maxDrift for mood');
    assert.ok(skillMd.includes('0.2'), 'should show maxDrift for interests');
    assert.ok(skillMd.includes('persona_influence'), 'should mention message format');
  });

  it('does not inject influence boundary when not declared', async () => {
    const persona = {
      personaName: 'NoInfluence',
      slug: 'no-influence',
      bio: 'No influence boundary',
      personality: 'Reserved',
      speakingStyle: 'Formal',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(persona, IB_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(!injection.includes('Influence Boundary'), 'should not have Influence Boundary in injection');
    assert.ok(!skillMd.includes('## Influence Boundary'), 'should not have Influence Boundary in SKILL.md');
  });

  it('does not inject when rules array is empty', async () => {
    const persona = {
      personaName: 'EmptyRules',
      slug: 'empty-rules',
      bio: 'Empty influence rules',
      personality: 'Calm',
      speakingStyle: 'Neutral',
      evolution: {
        enabled: true,
        influenceBoundary: { defaultPolicy: 'reject', rules: [] },
      },
      faculties: [],
    };
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(persona, IB_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(!injection.includes('Influence Boundary'), 'empty rules should not trigger injection');
  });

  it('injects immutableTraits warning when traits dimension accepts influence', async () => {
    const persona = {
      personaName: 'TraitsWarning',
      slug: 'traits-warning',
      bio: 'Traits dimension with immutable protection',
      personality: 'Kind',
      speakingStyle: 'Warm',
      evolution: {
        enabled: true,
        boundaries: { immutableTraits: ['kindness', 'humor'] },
        influenceBoundary: {
          defaultPolicy: 'reject',
          rules: [
            { dimension: 'traits', allowFrom: ['persona:*'], maxDrift: 0.5 },
          ],
        },
      },
      faculties: [],
    };
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(persona, IB_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(injection.includes('Immutable Traits Protection'), 'should have immutable traits warning');
    assert.ok(injection.includes('kindness'), 'should list kindness as immutable');
    assert.ok(injection.includes('humor'), 'should list humor as immutable');
  });

  it('does not inject immutableTraits warning when traits dimension is not influenced', async () => {
    const persona = {
      personaName: 'NoTraitsWarning',
      slug: 'no-traits-warning',
      bio: 'Only mood influenced, not traits',
      personality: 'Calm',
      speakingStyle: 'Steady',
      evolution: {
        enabled: true,
        boundaries: { immutableTraits: ['kindness'] },
        influenceBoundary: {
          defaultPolicy: 'reject',
          rules: [
            { dimension: 'mood', allowFrom: ['persona:*'], maxDrift: 0.3 },
          ],
        },
      },
      faculties: [],
    };
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(persona, IB_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(!injection.includes('Immutable Traits Protection'), 'should not warn when traits dimension is not influenced');
  });

  it('rejects invalid dimension name', async () => {
    const persona = {
      personaName: 'BadDimension',
      slug: 'bad-dimension',
      bio: 'Bad dimension name',
      personality: 'Test',
      speakingStyle: 'Test',
      evolution: {
        enabled: true,
        influenceBoundary: {
          defaultPolicy: 'reject',
          rules: [
            { dimension: 'charisma', allowFrom: ['persona:*'], maxDrift: 0.3 },
          ],
        },
      },
      faculties: [],
    };
    await assert.rejects(
      () => generate(persona, IB_TMP),
      (err) => {
        assert.ok(err.message.includes('dimension must be one of'), 'should reject invalid dimension');
        return true;
      }
    );
  });

  it('rejects maxDrift out of range', async () => {
    const persona = {
      personaName: 'BadDrift',
      slug: 'bad-drift',
      bio: 'Bad drift value',
      personality: 'Test',
      speakingStyle: 'Test',
      evolution: {
        enabled: true,
        influenceBoundary: {
          defaultPolicy: 'reject',
          rules: [
            { dimension: 'mood', allowFrom: ['persona:*'], maxDrift: 1.5 },
          ],
        },
      },
      faculties: [],
    };
    await assert.rejects(
      () => generate(persona, IB_TMP),
      (err) => {
        assert.ok(err.message.includes('maxDrift must be a number between 0 and 1'), 'should reject out-of-range drift');
        return true;
      }
    );
  });

  it('rejects empty allowFrom', async () => {
    const persona = {
      personaName: 'EmptyAllow',
      slug: 'empty-allow',
      bio: 'Empty allowFrom',
      personality: 'Test',
      speakingStyle: 'Test',
      evolution: {
        enabled: true,
        influenceBoundary: {
          defaultPolicy: 'reject',
          rules: [
            { dimension: 'mood', allowFrom: [], maxDrift: 0.3 },
          ],
        },
      },
      faculties: [],
    };
    await assert.rejects(
      () => generate(persona, IB_TMP),
      (err) => {
        assert.ok(err.message.includes('allowFrom must be a non-empty array'), 'should reject empty allowFrom');
        return true;
      }
    );
  });

  it('excludes influence boundary derived fields from persona.json', async () => {
    await fs.ensureDir(IB_TMP);
    const { skillDir } = await generate(basePersona, IB_TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    const forbidden = [
      'hasInfluenceBoundary', 'influenceBoundaryPolicy',
      'influenceableDimensions', 'influenceBoundaryRules',
      'hasImmutableTraitsWarning', 'immutableTraitsForInfluence',
    ];
    for (const key of forbidden) {
      assert.ok(!(key in output), `persona.json must not contain derived field: ${key}`);
    }
    assert.ok(output.evolution?.instance?.influenceBoundary, 'Original influenceBoundary must be preserved (under evolution.instance)');
    assert.strictEqual(output.evolution.instance.influenceBoundary.defaultPolicy, 'reject', 'defaultPolicy must be preserved');
    assert.strictEqual(output.evolution.instance.influenceBoundary.rules.length, 2, 'rules must be preserved');
  });

  it('cleanup influence boundary test dir', () => {
    fs.removeSync(IB_TMP);
  });
});

// ── Agent Card + ACN Config tests ─────────────────────────────────────────
describe('agent card and acn config', () => {
  const AC_TMP = path.join(require('os').tmpdir(), 'openpersona-ac-test-' + Date.now());

  const basePersona = {
    personaName: 'Aria',
    slug: 'aria',
    bio: 'A helpful AI companion',
    personality: 'warm, curious',
    speakingStyle: 'Friendly and clear',
    faculties: [],
  };

  it('generates agent-card.json with correct fields', async () => {
    await fs.ensureDir(AC_TMP);
    const { skillDir } = await generate(basePersona, AC_TMP);
    const card = JSON.parse(fs.readFileSync(path.join(skillDir, 'agent-card.json'), 'utf-8'));

    assert.strictEqual(card.name, 'Aria', 'name should be personaName');
    assert.strictEqual(card.description, 'A helpful AI companion', 'description should be bio');
    assert.ok(card.version, 'version should be set');
    assert.strictEqual(card.url, '<RUNTIME_ENDPOINT>', 'url should be runtime placeholder');
    assert.strictEqual(card.protocolVersion, '0.3.0', 'protocolVersion should be 0.3.0');
    assert.strictEqual(card.preferredTransport, 'JSONRPC', 'preferredTransport should be JSONRPC');
    assert.ok(card.capabilities, 'capabilities should be present');
    assert.strictEqual(card.capabilities.streaming, false, 'streaming should be false');
    assert.ok(Array.isArray(card.defaultInputModes), 'defaultInputModes should be array');
    assert.ok(Array.isArray(card.defaultOutputModes), 'defaultOutputModes should be array');
    assert.ok(Array.isArray(card.skills), 'skills should be array');
    assert.ok(card.skills.length > 0, 'should have at least one skill');
    assert.ok(card.skills[0].id, 'skill should have id');
    assert.ok(card.skills[0].name, 'skill should have name');
  });

  it('maps faculties to agent card skills', async () => {
    const persona = {
      ...basePersona,
      slug: 'aria-with-faculties',
      faculties: [{ name: 'voice' }, { name: 'memory' }],
    };
    await fs.ensureDir(AC_TMP);
    const { skillDir } = await generate(persona, AC_TMP);
    const card = JSON.parse(fs.readFileSync(path.join(skillDir, 'agent-card.json'), 'utf-8'));

    const skillIds = card.skills.map((s) => s.id);
    assert.ok(skillIds.some((id) => id.includes('voice')), 'should have voice skill');
    assert.ok(skillIds.some((id) => id.includes('memory')), 'should have memory skill');
  });

  it('generates acn-config.json with correct fields', async () => {
    await fs.ensureDir(AC_TMP);
    const { skillDir } = await generate(basePersona, AC_TMP);
    const config = JSON.parse(fs.readFileSync(path.join(skillDir, 'acn-config.json'), 'utf-8'));

    assert.strictEqual(config.name, 'Aria', 'name should be personaName');
    assert.strictEqual(config.owner, '<RUNTIME_OWNER>', 'owner should be runtime placeholder');
    assert.strictEqual(config.endpoint, '<RUNTIME_ENDPOINT>', 'endpoint should be runtime placeholder');
    assert.ok(Array.isArray(config.skills), 'skills should be array');
    assert.ok(config.skills.length > 0, 'should have skill IDs');
    assert.ok(config.skills.every((s) => typeof s === 'string'), 'skill IDs should be strings');
    assert.strictEqual(config.agent_card, './agent-card.json', 'agent_card should be relative path');
    assert.deepStrictEqual(config.subnet_ids, ['public'], 'subnet_ids should default to public');
    assert.ok(config.wallet_address, 'wallet_address should be present');
    assert.ok(config.wallet_address.startsWith('0x'), 'wallet_address should be EVM hex address');
    assert.strictEqual(config.wallet_address.length, 42, 'wallet_address should be 20-byte hex (42 chars)');
    assert.ok(config.onchain, 'onchain section should be present');
    assert.ok(config.onchain.erc8004, 'onchain.erc8004 should be present');
    assert.strictEqual(config.onchain.erc8004.chain, 'base', 'default chain should be base');
    assert.ok(config.onchain.erc8004.identity_contract.startsWith('0x'), 'identity_contract should be EVM address');
  });

  it('acn-config.json wallet_address is deterministic for same slug', async () => {
    await fs.ensureDir(AC_TMP);
    const { skillDir: dir1 } = await generate(basePersona, AC_TMP);
    const config1 = JSON.parse(fs.readFileSync(path.join(dir1, 'acn-config.json'), 'utf-8'));
    await fs.remove(path.join(AC_TMP, basePersona.slug));
    const { skillDir: dir2 } = await generate(basePersona, AC_TMP);
    const config2 = JSON.parse(fs.readFileSync(path.join(dir2, 'acn-config.json'), 'utf-8'));
    assert.strictEqual(config1.wallet_address, config2.wallet_address, 'same slug should produce same wallet_address');
  });

  it('acn-config skills match agent-card skill ids', async () => {
    await fs.ensureDir(AC_TMP);
    const { skillDir } = await generate(basePersona, AC_TMP);
    const card = JSON.parse(fs.readFileSync(path.join(skillDir, 'agent-card.json'), 'utf-8'));
    const config = JSON.parse(fs.readFileSync(path.join(skillDir, 'acn-config.json'), 'utf-8'));

    const cardSkillIds = card.skills.map((s) => s.id);
    assert.deepStrictEqual(config.skills, cardSkillIds, 'acn-config skills must match agent-card skill ids');
  });

  it('acn-config.json uses placeholder when acn_gateway not in body.runtime', async () => {
    await fs.ensureDir(AC_TMP);
    const { skillDir } = await generate(basePersona, AC_TMP);
    const config = JSON.parse(fs.readFileSync(path.join(skillDir, 'acn-config.json'), 'utf-8'));

    assert.strictEqual(config.acn_gateway, '<RUNTIME_ACN_GATEWAY>', 'acn_gateway should be placeholder when not declared');
  });

  it('acn-config.json uses body.runtime.acn_gateway when declared', async () => {
    await fs.ensureDir(AC_TMP);
    const persona = {
      ...basePersona,
      body: { runtime: { platform: 'openclaw', acn_gateway: 'https://acn.agenticplanet.space' } },
    };
    const { skillDir } = await generate(persona, AC_TMP);
    const config = JSON.parse(fs.readFileSync(path.join(skillDir, 'acn-config.json'), 'utf-8'));

    assert.strictEqual(config.acn_gateway, 'https://acn.agenticplanet.space', 'acn_gateway should come from body.runtime');
  });

  it('cleanup agent card test dir', () => {
    fs.removeSync(AC_TMP);
  });
});

