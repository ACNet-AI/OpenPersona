/**
 * OpenPersona - persona.json schema tests (P20: preset manifests removed)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');

const PRESETS_DIR = path.join(__dirname, '..', 'presets');

describe('persona schema', () => {
  // Helper: extract flat fields from both new grouped format (soul.identity/character) and old flat format
  function extractPersonaFields(persona) {
    if (persona.soul) {
      const identity = persona.soul.identity || {};
      const character = persona.soul.character || {};
      return { ...identity, ...character };
    }
    return persona;
  }

  for (const preset of ['ai-girlfriend', 'life-assistant', 'health-butler', 'samantha']) {
    it(`${preset} has required persona fields`, () => {
      const p = path.join(PRESETS_DIR, preset, 'persona.json');
      assert.ok(fs.existsSync(p), `preset ${preset}/persona.json not found`);
      const persona = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const flat = extractPersonaFields(persona);
      const required = ['personaName', 'slug', 'bio', 'personality', 'speakingStyle'];
      for (const k of required) {
        assert.ok(flat[k], `${preset} missing required field: ${k}`);
      }
      assert.ok(typeof flat.slug === 'string');
      assert.ok(/^[a-z0-9-]+$/.test(flat.slug), `slug must be kebab-case: ${flat.slug}`);
    });

    it(`${preset} has valid faculties and skills in persona.json (P20: no manifest.json)`, () => {
      const p = path.join(PRESETS_DIR, preset, 'persona.json');
      assert.ok(fs.existsSync(p), `preset ${preset}/persona.json not found`);
      assert.ok(
        !fs.existsSync(path.join(PRESETS_DIR, preset, 'manifest.json')),
        `${preset} manifest.json should not exist after P20`
      );
      const persona = JSON.parse(fs.readFileSync(p, 'utf-8'));

      // faculties: optional — must be array of { name: string, ...config } if present
      if (persona.faculties !== undefined) {
        assert.ok(Array.isArray(persona.faculties), `${preset} persona.faculties must be array`);
      }
      for (const f of (persona.faculties || [])) {
        assert.strictEqual(typeof f, 'object', `${preset} faculty must be object`);
        assert.ok(f.name, `${preset} faculty object missing name`);
      }

      // skills: must be array of { name, ... }
      assert.ok(Array.isArray(persona.skills), `${preset} persona.skills must be array`);
      for (const s of persona.skills) {
        assert.strictEqual(typeof s, 'object', `${preset} skill must be object`);
        assert.ok(s.name, `${preset} skill missing name`);
      }

      // additionalAllowedTools: must be present and non-empty
      assert.ok(
        Array.isArray(persona.additionalAllowedTools) && persona.additionalAllowedTools.length > 0,
        `${preset} persona.additionalAllowedTools must be a non-empty array`
      );
    });
  }
});
