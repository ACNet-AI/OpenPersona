/**
 * Schema-drift detection tests.
 *
 * These tests assert that key enum values and required-field lists stay in sync
 * between two sources of truth:
 *   A) schemas/persona.input.schema.json  — the documentation / JSON Schema
 *   B) lib/generator/validate.js          — the runtime enforcement (JS Sets)
 *
 * If either side is updated without updating the other, these tests will fail
 * and point directly at the divergence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ── Load sources of truth ────────────────────────────────────────────────────

const schema = require(path.join(ROOT, 'schemas', 'persona.input.schema.json'));

// Expose internal Sets from validate.js by requiring the module.
// validate.js does NOT export the Sets, so we read the source and extract them.
const validateSrc = require('node:fs').readFileSync(
  path.join(ROOT, 'lib', 'generator', 'validate.js'),
  'utf-8'
);

/** Extract a Set literal `new Set([...])` by variable name from source text. */
function extractSet(src, varName) {
  const re = new RegExp(`const ${varName}\\s*=\\s*new Set\\(\\[([^\\]]+)\\]\\)`);
  const m = src.match(re);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const runtimeSkillTrustLevels   = extractSet(validateSrc, 'SKILL_TRUST_LEVELS');
const runtimePackEngines        = extractSet(validateSrc, 'EVOLUTION_PACK_ENGINES');
const runtimeActivationChannels = extractSet(validateSrc, 'EVOLUTION_ACTIVATION_CHANNELS');

// ── Extract enum values from the JSON Schema ─────────────────────────────────

const skillsSchema = schema.properties?.skills?.items?.properties;
const schemaTrustEnum = skillsSchema?.trust?.enum;

const evolutionProps = schema.properties?.evolution?.properties;
const schemaPackEngineEnum   = evolutionProps?.pack?.properties?.engine?.enum;
const schemaActivationEnum   = evolutionProps?.faculty?.properties?.activationChannels?.items?.enum;
const schemaMinTrustEnum     = evolutionProps?.skill?.properties?.minTrustLevel?.enum;

// ── Tests ────────────────────────────────────────────────────────────────────

test('schema-drift: SKILL_TRUST_LEVELS in validate.js matches schema trust enum (skills[].trust)', () => {
  assert.ok(runtimeSkillTrustLevels, 'SKILL_TRUST_LEVELS not found in validate.js');
  assert.ok(schemaTrustEnum, 'skills[].trust.enum not found in schema');
  assert.deepEqual(
    [...runtimeSkillTrustLevels].sort(),
    [...schemaTrustEnum].sort(),
    'SKILL_TRUST_LEVELS (validate.js) diverged from skills[].trust.enum (schema)'
  );
});

test('schema-drift: SKILL_TRUST_LEVELS in validate.js matches schema minTrustLevel enum (evolution.skill.minTrustLevel)', () => {
  assert.ok(runtimeSkillTrustLevels, 'SKILL_TRUST_LEVELS not found in validate.js');
  assert.ok(schemaMinTrustEnum, 'evolution.skill.minTrustLevel.enum not found in schema');
  assert.deepEqual(
    [...runtimeSkillTrustLevels].sort(),
    [...schemaMinTrustEnum].sort(),
    'SKILL_TRUST_LEVELS (validate.js) diverged from evolution.skill.minTrustLevel.enum (schema)'
  );
});

test('schema-drift: EVOLUTION_PACK_ENGINES in validate.js matches schema engine enum (evolution.pack.engine)', () => {
  assert.ok(runtimePackEngines, 'EVOLUTION_PACK_ENGINES not found in validate.js');
  assert.ok(schemaPackEngineEnum, 'evolution.pack.engine.enum not found in schema');
  assert.deepEqual(
    [...runtimePackEngines].sort(),
    [...schemaPackEngineEnum].sort(),
    'EVOLUTION_PACK_ENGINES (validate.js) diverged from evolution.pack.engine.enum (schema)'
  );
});

test('schema-drift: EVOLUTION_ACTIVATION_CHANNELS in validate.js matches schema activationChannels enum', () => {
  assert.ok(runtimeActivationChannels, 'EVOLUTION_ACTIVATION_CHANNELS not found in validate.js');
  assert.ok(schemaActivationEnum, 'evolution.faculty.activationChannels.items.enum not found in schema');
  assert.deepEqual(
    [...runtimeActivationChannels].sort(),
    [...schemaActivationEnum].sort(),
    'EVOLUTION_ACTIVATION_CHANNELS (validate.js) diverged from evolution.faculty.activationChannels.items.enum (schema)'
  );
});

test('schema-drift: soul required fields in schema include personaName, slug, bio', () => {
  const soulIdentityRequired = schema.properties?.soul?.properties?.identity?.required || [];
  assert.ok(soulIdentityRequired.includes('personaName'), 'soul.identity.required missing personaName');
  assert.ok(soulIdentityRequired.includes('slug'), 'soul.identity.required missing slug');
  assert.ok(soulIdentityRequired.includes('bio'), 'soul.identity.required missing bio');
});

test('schema-drift: soul.character required fields in schema include personality and speakingStyle', () => {
  const soulCharRequired = schema.properties?.soul?.properties?.character?.required || [];
  assert.ok(soulCharRequired.includes('personality'), 'soul.character.required missing personality');
  assert.ok(soulCharRequired.includes('speakingStyle'), 'soul.character.required missing speakingStyle');
});

// ── Social Contacts schema-drift ─────────────────────────────────────────────

const runtimeContactTrustLevels = extractSet(validateSrc, 'CONTACT_TRUST_LEVELS');
const runtimeContactSources     = extractSet(validateSrc, 'CONTACT_SOURCES');

const contactsSchema = schema.properties?.social?.properties?.contacts?.properties;
const schemaContactTrustDefault   = contactsSchema?.trust_default?.enum;
const schemaContactMinIncoming    = contactsSchema?.minIncomingTrust?.enum;

const contactsFileSchema = (() => {
  try {
    return require(path.join(ROOT, 'schemas', 'social', 'contacts.schema.json'));
  } catch { return null; }
})();
const contactDefTrustEnum  = contactsFileSchema?.definitions?.contact?.properties?.trust_level?.enum;
const contactDefSourceEnum = contactsFileSchema?.definitions?.contact?.properties?.source?.enum;

test('schema-drift: CONTACT_TRUST_LEVELS in validate.js matches social.contacts.trust_default enum in schema', () => {
  assert.ok(runtimeContactTrustLevels, 'CONTACT_TRUST_LEVELS not found in validate.js');
  assert.ok(schemaContactTrustDefault, 'social.contacts.trust_default.enum not found in schema');
  assert.deepEqual(
    [...runtimeContactTrustLevels].sort(),
    [...schemaContactTrustDefault].sort(),
    'CONTACT_TRUST_LEVELS (validate.js) diverged from social.contacts.trust_default.enum (schema)'
  );
});

test('schema-drift: CONTACT_TRUST_LEVELS matches contacts.schema.json trust_level enum', () => {
  assert.ok(runtimeContactTrustLevels, 'CONTACT_TRUST_LEVELS not found in validate.js');
  assert.ok(contactDefTrustEnum, 'trust_level.enum not found in contacts.schema.json');
  assert.deepEqual(
    [...runtimeContactTrustLevels].sort(),
    [...contactDefTrustEnum].sort(),
    'CONTACT_TRUST_LEVELS (validate.js) diverged from contacts.schema.json definitions.contact.trust_level.enum'
  );
});

test('schema-drift: CONTACT_SOURCES in validate.js matches contacts.schema.json source enum', () => {
  assert.ok(runtimeContactSources, 'CONTACT_SOURCES not found in validate.js');
  assert.ok(contactDefSourceEnum, 'source.enum not found in contacts.schema.json');
  assert.deepEqual(
    [...runtimeContactSources].sort(),
    [...contactDefSourceEnum].sort(),
    'CONTACT_SOURCES (validate.js) diverged from contacts.schema.json definitions.contact.source.enum'
  );
});

test('schema-drift: social.contacts.minIncomingTrust enum matches CONTACT_TRUST_LEVELS', () => {
  assert.ok(runtimeContactTrustLevels, 'CONTACT_TRUST_LEVELS not found in validate.js');
  assert.ok(schemaContactMinIncoming, 'social.contacts.minIncomingTrust.enum not found in schema');
  assert.deepEqual(
    [...runtimeContactTrustLevels].sort(),
    [...schemaContactMinIncoming].sort(),
    'CONTACT_TRUST_LEVELS (validate.js) diverged from social.contacts.minIncomingTrust.enum (schema)'
  );
});
