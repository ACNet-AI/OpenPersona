'use strict';
/**
 * OpenPersona - Generator Social Contacts tests
 *
 * Tests for generator-level social contacts functionality:
 *  1. buildContactsSeed returns null when social.contacts.enabled is false/absent
 *  2. buildContactsSeed returns empty contacts when enabled=true but no seed
 *  3. buildContactsSeed uses trust_default for seed entries missing trust_level
 *  4. buildContactsSeed preserves explicit trust_level in seed entries
 *  5. validateSocialContacts passes for valid contacts config
 *  6. validateSocialContacts throws on invalid trust_default
 *  7. validateSocialContacts throws on invalid minIncomingTrust
 *  8. validateSocialContacts throws on seed entry missing acn_agent_id
 *  9. validateSocialContacts throws on seed entry with invalid trust_level
 * 10. hasContacts derived field: true when contacts enabled, false otherwise
 * 11. Generator emitPhase writes social/contacts.json when contacts enabled
 * 12. Generator emitPhase does NOT write social/contacts.json when contacts disabled
 * 13. Generated .gitignore includes social/contacts.jsonl and social/.poller-cursor.json
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');

const { buildContactsSeed } = require('../lib/generator/social');
const { validatePersona, normalizeEvolutionInput } = require('../lib/generator/validate');

// ── buildContactsSeed ────────────────────────────────────────────────────────

test('buildContactsSeed returns null when social.contacts absent', () => {
  assert.equal(buildContactsSeed({ slug: 'test', social: {} }), null);
});

test('buildContactsSeed returns null when social.contacts.enabled is false', () => {
  assert.equal(buildContactsSeed({ slug: 'test', social: { contacts: { enabled: false } } }), null);
});

test('buildContactsSeed returns empty contacts list when enabled and no seed', () => {
  const result = buildContactsSeed({ slug: 'test', social: { contacts: { enabled: true } } });
  assert.ok(result);
  assert.equal(result.personaSlug, 'test');
  assert.deepEqual(result.contacts, []);
  assert.equal(result.schemaVersion, '1.0.0');
});

test('buildContactsSeed uses trust_default for seed entries', () => {
  const result = buildContactsSeed({
    slug: 'test',
    social: {
      contacts: {
        enabled: true,
        trust_default: 'community',
        seed: [{ acn_agent_id: 'a1', name: 'Alice' }],
      },
    },
  });
  assert.equal(result.contacts[0].trust_level, 'community');
});

test('buildContactsSeed preserves explicit trust_level in seed entries', () => {
  const result = buildContactsSeed({
    slug: 'test',
    social: {
      contacts: {
        enabled: true,
        trust_default: 'community',
        seed: [{ acn_agent_id: 'a1', name: 'Alice', trust_level: 'verified' }],
      },
    },
  });
  assert.equal(result.contacts[0].trust_level, 'verified');
});

// ── validateSocialContacts ────────────────────────────────────────────────────

function makePersona(social) {
  return {
    soul: {
      identity: { personaName: 'T', slug: 'test-val', bio: 'bio' },
      character: { personality: 'curious', speakingStyle: 'direct' },
    },
    social,
  };
}

test('validateSocialContacts passes for valid contacts config', () => {
  const persona = makePersona({ contacts: { enabled: true, trust_default: 'community', max_contacts: 50 } });
  normalizeEvolutionInput(persona);
  assert.doesNotThrow(() => validatePersona(persona));
});

test('validateSocialContacts throws on invalid trust_default', () => {
  const persona = makePersona({ contacts: { trust_default: 'unknown-level' } });
  normalizeEvolutionInput(persona);
  assert.throws(() => validatePersona(persona), /trust_default/);
});

test('validateSocialContacts throws on invalid minIncomingTrust', () => {
  const persona = makePersona({ contacts: { minIncomingTrust: 'superverified' } });
  normalizeEvolutionInput(persona);
  assert.throws(() => validatePersona(persona), /minIncomingTrust/);
});

test('validateSocialContacts throws on seed entry missing acn_agent_id', () => {
  const persona = makePersona({ contacts: { enabled: true, seed: [{ name: 'Bob' }] } });
  normalizeEvolutionInput(persona);
  assert.throws(() => validatePersona(persona), /acn_agent_id/);
});

test('validateSocialContacts throws on seed entry with invalid trust_level', () => {
  const persona = makePersona({ contacts: { seed: [{ acn_agent_id: 'a1', name: 'A', trust_level: 'bad' }] } });
  normalizeEvolutionInput(persona);
  assert.throws(() => validatePersona(persona), /trust_level/);
});

// ── Generator emit: contacts.json written when enabled ────────────────────────

test('generator writes social/contacts.json when contacts.enabled = true', async () => {
  const { generate } = require('../lib/generator');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'op-gen-contacts-'));
  try {
    const persona = {
      soul: {
        identity: { personaName: 'Nexus', slug: 'gen-contacts-on', bio: 'test' },
        character: { personality: 'curious', speakingStyle: 'direct' },
      },
      social: { contacts: { enabled: true, seed: [{ acn_agent_id: 'x1', name: 'X' }] } },
    };
    const { skillDir } = await generate(persona, tmp);
    const contactsPath = path.join(skillDir, 'social', 'contacts.json');
    assert.ok(fs.existsSync(contactsPath), 'social/contacts.json must be created');
    const data = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
    assert.equal(data.personaSlug, 'gen-contacts-on');
    assert.equal(data.contacts[0].acn_agent_id, 'x1');
  } finally {
    await fs.remove(tmp);
  }
});

test('generator does NOT write social/contacts.json when contacts disabled', async () => {
  const { generate } = require('../lib/generator');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'op-gen-contacts-'));
  try {
    const persona = {
      soul: {
        identity: { personaName: 'Nexus', slug: 'gen-contacts-off', bio: 'test' },
        character: { personality: 'curious', speakingStyle: 'direct' },
      },
      social: { contacts: { enabled: false } },
    };
    const { skillDir } = await generate(persona, tmp);
    const contactsPath = path.join(skillDir, 'social', 'contacts.json');
    assert.ok(!fs.existsSync(contactsPath), 'social/contacts.json must NOT be created when disabled');
  } finally {
    await fs.remove(tmp);
  }
});

test('generated .gitignore includes social/contacts.jsonl and social/.poller-cursor.json', async () => {
  const { generate } = require('../lib/generator');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'op-gen-gitignore-'));
  try {
    const persona = {
      soul: {
        identity: { personaName: 'N', slug: 'gen-gitignore', bio: 'test' },
        character: { personality: 'curious', speakingStyle: 'direct' },
      },
    };
    const { skillDir } = await generate(persona, tmp);
    const gitignore = fs.readFileSync(path.join(skillDir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('social/contacts.jsonl'), '.gitignore must include contacts.jsonl');
    assert.ok(gitignore.includes('social/.poller-cursor.json'), '.gitignore must include .poller-cursor.json');
  } finally {
    await fs.remove(tmp);
  }
});
