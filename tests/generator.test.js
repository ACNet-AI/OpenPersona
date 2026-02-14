/**
 * OpenPersona - Generator tests
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');

const TMP = path.join(require('os').tmpdir(), 'openpersona-test-' + Date.now());

describe('generator', () => {
  it('generates persona from config', async () => {
    const persona = {
      personaName: 'Test',
      slug: 'test-persona',
      bio: 'a test companion',
      personality: 'friendly',
      speakingStyle: 'Casual tone',
      faculties: ['reminder'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    assert.ok(fs.existsSync(skillDir));
    assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(skillDir, 'persona.json')));
    assert.ok(fs.existsSync(path.join(skillDir, 'soul-injection.md')));
    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(personaOut.personaName, 'Test');
    assert.strictEqual(personaOut.slug, 'test-persona');
    await fs.remove(TMP);
  });

  it('adds soul-evolution when evolution.enabled', async () => {
    const persona = {
      personaName: 'Evo',
      slug: 'evo-test',
      bio: 'evolving',
      personality: 'adaptive',
      speakingStyle: 'Flexible',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    assert.ok(fs.existsSync(path.join(skillDir, 'soul-state.json')));
    const soulState = JSON.parse(fs.readFileSync(path.join(skillDir, 'soul-state.json'), 'utf-8'));
    assert.strictEqual(soulState.personaSlug, 'evo-test');
    assert.strictEqual(soulState.relationship.stage, 'stranger');
    await fs.remove(TMP);
  });
});
