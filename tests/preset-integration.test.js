/**
 * OpenPersona — Preset Integration Tests
 *
 * Generates every shipped preset and verifies the output pack contains the
 * invariants that were broken by the evolution-never-enabled bug (v0.20.1).
 *
 * Each test generates a full skill pack from the preset persona.json and checks:
 *   1. evolution.instance.enabled === true  in the output persona.json
 *   2. memory faculty present              in the output persona.json
 *   3. evolution.instance.boundaries      preserved in the output persona.json
 *   4. SKILL.md generated                 (non-empty)
 *   5. state.json generated               (Body nervous system present)
 *   6. scripts/state-sync.js generated    (Runtime Gate present)
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');

const PRESETS_DIR = path.join(__dirname, '..', 'presets');
const PRESET_SLUGS = ['base', 'samantha', 'ai-girlfriend', 'life-assistant', 'health-butler', 'stoic-mentor'];

// Presets that declare body.runtime.modalities and the types expected
const PRESET_MODALITIES = {
  'samantha': ['voice'],
  'ai-girlfriend': ['voice', 'vision'],
};

for (const slug of PRESET_SLUGS) {
  describe(`Preset: ${slug}`, () => {
    let tmpDir;
    let packDir;
    let personaJson;
    let skillMd;

    before(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `op-preset-${slug}-`));
      const presetInput = await fs.readJson(path.join(PRESETS_DIR, slug, 'persona.json'));
      const { skillDir } = await generate(presetInput, tmpDir);
      packDir = skillDir;
      personaJson = await fs.readJson(path.join(packDir, 'persona.json'));
      skillMd = await fs.readFile(path.join(packDir, 'SKILL.md'), 'utf8');
    });

    after(async () => {
      await fs.remove(tmpDir);
    });

    it('evolution.instance.enabled is true in generated persona.json', () => {
      assert.strictEqual(
        personaJson.evolution?.instance?.enabled,
        true,
        `${slug}: evolution must be enabled in the generated pack`
      );
    });

    it('evolution.instance.boundaries preserved in generated persona.json', () => {
      const boundaries = personaJson.evolution?.instance?.boundaries;
      assert.ok(boundaries, `${slug}: evolution.instance.boundaries must be present`);
      assert.ok(
        Array.isArray(boundaries.immutableTraits) && boundaries.immutableTraits.length > 0,
        `${slug}: immutableTraits must be a non-empty array`
      );
      assert.ok(
        typeof boundaries.minFormality === 'number' && typeof boundaries.maxFormality === 'number',
        `${slug}: minFormality and maxFormality must be numbers`
      );
      assert.ok(
        boundaries.minFormality < boundaries.maxFormality,
        `${slug}: minFormality must be less than maxFormality`
      );
    });

    it('memory faculty present in generated persona.json', () => {
      const faculties = personaJson.faculties || [];
      const hasMemory = faculties.some(f => (typeof f === 'string' ? f : f.name) === 'memory');
      assert.ok(hasMemory, `${slug}: memory faculty must be present in generated persona.json`);
    });

    it('SKILL.md is generated and non-empty', () => {
      assert.ok(skillMd && skillMd.length > 100, `${slug}: SKILL.md must be generated and non-empty`);
    });

    it('SKILL.md references Evolution', () => {
      assert.ok(
        skillMd.includes('Evolution') || skillMd.includes('evolution'),
        `${slug}: SKILL.md must reference evolution`
      );
    });

    it('state.json is generated', async () => {
      const stateExists = await fs.pathExists(path.join(packDir, 'state.json'));
      assert.ok(stateExists, `${slug}: state.json must be generated`);
    });

    it('scripts/state-sync.js is generated', async () => {
      const syncExists = await fs.pathExists(path.join(packDir, 'scripts', 'state-sync.js'));
      assert.ok(syncExists, `${slug}: scripts/state-sync.js must be generated`);
    });

    it('soul/injection.md is generated', async () => {
      const injectionExists = await fs.pathExists(path.join(packDir, 'soul', 'injection.md'));
      assert.ok(injectionExists, `${slug}: soul/injection.md must be generated`);
    });

    if (PRESET_MODALITIES[slug]) {
      it(`body.runtime.modalities declared in input persona.json`, async () => {
        const inputPersona = await fs.readJson(path.join(PRESETS_DIR, slug, 'persona.json'));
        const modalities = inputPersona.body?.runtime?.modalities;
        assert.ok(Array.isArray(modalities) && modalities.length > 0,
          `${slug}: body.runtime.modalities must be declared`);
      });

      for (const modalityType of PRESET_MODALITIES[slug]) {
        it(`modality "${modalityType}" declared in input persona.json`, async () => {
          const inputPersona = await fs.readJson(path.join(PRESETS_DIR, slug, 'persona.json'));
          const modalities = inputPersona.body?.runtime?.modalities || [];
          const hasType = modalities.some(
            m => (typeof m === 'string' ? m : m && m.type) === modalityType
          );
          assert.ok(hasType, `${slug}: modalities must include "${modalityType}"`);
        });
      }

      if (PRESET_MODALITIES[slug].includes('voice')) {
        it('voice faculty present in generated persona.json (modality-driven injection)', () => {
          const faculties = personaJson.faculties || [];
          const hasVoice = faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice');
          assert.ok(hasVoice, `${slug}: voice faculty must be present (declared in faculties or injected from modalities)`);
        });
      }
    }
  });
}
