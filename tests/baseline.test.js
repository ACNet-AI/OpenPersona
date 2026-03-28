/**
 * OpenPersona - Universal Materials Baseline conformance tests
 *
 * Validates that the base preset generates a skill pack that satisfies
 * every required capability declared in schemas/baseline.json.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');

const BASELINE = require('../schemas/baseline.json');
const BASE_PRESET = require('../presets/base/persona.json');

describe('Universal Materials Baseline — base preset conformance', () => {
  let TMP_DIR;
  let outputDir;
  let personaJson;
  let generatedFiles;

  before(async () => {
    TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'op-baseline-test-'));
    const { skillDir } = await generate(BASE_PRESET, TMP_DIR);
    outputDir = skillDir;
    personaJson = await fs.readJson(path.join(outputDir, 'persona.json'));
    generatedFiles = await fs.readdir(outputDir, { recursive: true });
  });

  after(async () => {
    await fs.remove(TMP_DIR);
  });

  describe('Soul layer — required fields', () => {
    it('has soul.identity.personaName', () => {
      assert.ok(personaJson.soul?.identity?.personaName || personaJson.personaName,
        'personaName must be present');
    });

    it('has soul.identity.slug', () => {
      assert.ok(personaJson.soul?.identity?.slug || personaJson.personaSlug || personaJson.slug,
        'slug must be present');
    });

    it('has soul.identity.bio', () => {
      assert.ok(personaJson.soul?.identity?.bio || personaJson.bio,
        'bio must be present');
    });

    it('has soul.character.personality', () => {
      assert.ok(
        personaJson.soul?.character?.personality || personaJson.personality,
        'personality must be present'
      );
    });

    it('has soul.character.speakingStyle', () => {
      assert.ok(
        personaJson.soul?.character?.speakingStyle || personaJson.speakingStyle,
        'speakingStyle must be present'
      );
    });

    it('constitution.md is generated', () => {
      const constitutionPath = path.join('soul', 'constitution.md');
      assert.ok(
        generatedFiles.includes(constitutionPath) ||
        generatedFiles.includes('soul/constitution.md'),
        'soul/constitution.md must be generated'
      );
    });
  });

  describe('Body layer — required fields', () => {
    it('has body.runtime.framework in input', () => {
      assert.ok(
        BASE_PRESET.body?.runtime?.framework,
        'body.runtime.framework must be declared in preset'
      );
    });

    it('scripts/state-sync.js is generated', () => {
      const syncPath = path.join(outputDir, 'scripts', 'state-sync.js');
      assert.ok(fs.existsSync(syncPath), 'scripts/state-sync.js must be generated');
    });
  });

  describe('Faculty layer — cognition (memory required)', () => {
    it('memory faculty is declared in base preset', () => {
      const faculties = BASE_PRESET.faculties || [];
      const hasMemory = faculties.some(f => f.name === 'memory');
      assert.ok(hasMemory, 'base preset must declare memory faculty');
    });

    it('memory faculty appears in generated SKILL.md', async () => {
      const skillMd = await fs.readFile(path.join(outputDir, 'SKILL.md'), 'utf-8');
      assert.ok(
        skillMd.includes('memory') || skillMd.includes('Memory'),
        'generated SKILL.md must reference memory faculty'
      );
    });
  });

  describe('Evolution concept — instance.boundaries required', () => {
    it('evolution.instance.boundaries is declared in base preset input', () => {
      assert.ok(
        BASE_PRESET.evolution?.instance?.boundaries,
        'base preset must declare evolution.instance.boundaries'
      );
    });

    it('immutableTraits is a non-empty string array', () => {
      const boundaries = BASE_PRESET.evolution.instance.boundaries;
      assert.ok(Array.isArray(boundaries.immutableTraits), 'immutableTraits must be an array');
      assert.ok(boundaries.immutableTraits.length > 0, 'immutableTraits must not be empty');
      boundaries.immutableTraits.forEach(t => {
        assert.strictEqual(typeof t, 'string', `immutableTrait "${t}" must be a string`);
      });
    });

    it('speakingStyleDrift bounds are valid (-10 to 10, min < max)', () => {
      const drift = BASE_PRESET.evolution.instance.boundaries.speakingStyleDrift;
      assert.ok(drift, 'speakingStyleDrift bounds must be declared');
      assert.ok(drift.minFormality >= -10 && drift.minFormality <= 10,
        'minFormality must be in range -10 to 10');
      assert.ok(drift.maxFormality >= -10 && drift.maxFormality <= 10,
        'maxFormality must be in range -10 to 10');
      assert.ok(drift.minFormality < drift.maxFormality,
        'minFormality must be less than maxFormality');
    });

    it('evolution.instance.boundaries is preserved in output persona.json', () => {
      assert.ok(
        personaJson.evolution?.instance?.boundaries,
        'evolution.instance.boundaries must be present in generated persona.json'
      );
    });
  });

  describe('Required artifacts', () => {
    const REQUIRED = BASELINE.requiredArtifacts;

    for (const artifact of REQUIRED) {
      it(`${artifact} is generated`, () => {
        const artifactPath = path.join(outputDir, artifact);
        assert.ok(
          fs.existsSync(artifactPath),
          `Required artifact "${artifact}" must be generated`
        );
      });
    }
  });

  describe('baseline.json schema sanity', () => {
    it('baseline.json is valid JSON with required top-level keys', () => {
      assert.ok(BASELINE.layers, 'baseline must have layers');
      assert.ok(BASELINE.concepts, 'baseline must have concepts');
      assert.ok(BASELINE.requiredArtifacts, 'baseline must have requiredArtifacts');
      assert.ok(BASELINE._meta, 'baseline must have _meta');
    });

    it('all 4 layers are declared', () => {
      ['soul', 'body', 'faculty', 'skill'].forEach(layer => {
        assert.ok(layer === 'faculty'
          ? BASELINE.layers.faculty?.dimensions
          : BASELINE.layers[layer],
          `layer "${layer}" must be declared in baseline`
        );
      });
    });

    it('all 5 concepts are declared', () => {
      ['evolution', 'economy', 'vitality', 'social', 'rhythm'].forEach(concept => {
        assert.ok(BASELINE.concepts[concept], `concept "${concept}" must be declared in baseline`);
      });
    });

    it('intakeCriteria has 5 rules', () => {
      const rules = BASELINE._meta?.intakeCriteria?.rules;
      assert.ok(Array.isArray(rules) && rules.length === 5,
        'intakeCriteria must have exactly 5 rules');
    });
  });
});
