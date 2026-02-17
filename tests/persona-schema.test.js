/**
 * OpenPersona - persona.json & manifest.json schema tests
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');

const PRESETS_DIR = path.join(__dirname, '..', 'presets');

describe('persona schema', () => {
  const required = ['personaName', 'slug', 'bio', 'personality', 'speakingStyle'];

  for (const preset of ['ai-girlfriend', 'life-assistant', 'health-butler', 'samantha']) {
    it(`${preset} has required persona fields`, () => {
      const p = path.join(PRESETS_DIR, preset, 'persona.json');
      assert.ok(fs.existsSync(p), `preset ${preset}/persona.json not found`);
      const persona = JSON.parse(fs.readFileSync(p, 'utf-8'));
      for (const k of required) {
        assert.ok(persona[k], `${preset} missing required field: ${k}`);
      }
      assert.ok(typeof persona.slug === 'string');
      assert.ok(/^[a-z0-9-]+$/.test(persona.slug), `slug must be kebab-case: ${persona.slug}`);
    });

    it(`${preset} has valid manifest.json`, () => {
      const m = path.join(PRESETS_DIR, preset, 'manifest.json');
      assert.ok(fs.existsSync(m), `preset ${preset}/manifest.json not found`);
      const manifest = JSON.parse(fs.readFileSync(m, 'utf-8'));
      assert.ok(manifest.name, `${preset} manifest missing name`);
      assert.ok(manifest.layers, `${preset} manifest missing layers`);
      assert.ok(manifest.layers.soul, `${preset} manifest missing layers.soul`);
      assert.ok(Array.isArray(manifest.layers.faculties), `${preset} manifest.layers.faculties must be array`);

      // Validate faculties: each must be { name: string, ...config }
      for (const f of manifest.layers.faculties) {
        assert.strictEqual(typeof f, 'object', `${preset} faculty must be object, got: ${JSON.stringify(f)}`);
        assert.ok(f.name, `${preset} faculty object missing name`);
      }

      // Validate skills: must be array of { name, description, ... }
      assert.ok(Array.isArray(manifest.layers.skills), `${preset} manifest.layers.skills must be array`);
      for (const s of manifest.layers.skills) {
        assert.strictEqual(typeof s, 'object', `${preset} skill must be object`);
        assert.ok(s.name, `${preset} skill missing name`);
        assert.ok(s.description, `${preset} skill missing description`);
      }
    });
  }
});
