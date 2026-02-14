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

describe('generated SKILL.md quality', () => {
  it('has proper frontmatter with name, description, allowed-tools', async () => {
    const persona = {
      personaName: 'FMTest',
      slug: 'fm-test',
      bio: 'frontmatter tester',
      personality: 'precise',
      speakingStyle: 'Technical',
      faculties: ['selfie'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.startsWith('---\n'), 'SKILL.md must start with frontmatter');
    assert.ok(skillMd.includes('name: persona-fm-test'), 'frontmatter must contain skill name');
    assert.ok(skillMd.includes('description:'), 'frontmatter must contain description');
    assert.ok(skillMd.includes('allowed-tools:'), 'frontmatter must contain allowed-tools');
    assert.ok(skillMd.includes('Bash(curl:*)'), 'selfie faculty should add Bash(curl:*) to tools');
    await fs.remove(TMP);
  });

  it('renders {{slug}} in faculty content', async () => {
    const persona = {
      personaName: 'SlugTest',
      slug: 'slug-render-test',
      bio: 'slug render tester',
      personality: 'precise',
      speakingStyle: 'Direct',
      faculties: ['selfie'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(!skillMd.includes('{{slug}}'), 'SKILL.md must not contain unrendered {{slug}}');
    assert.ok(skillMd.includes('persona-slug-render-test'), '{{slug}} should be rendered to actual slug');
    await fs.remove(TMP);
  });

  it('includes behaviorGuide in SKILL.md when provided', async () => {
    const persona = {
      personaName: 'Guide',
      slug: 'guide-test',
      bio: 'guide tester',
      personality: 'thorough',
      speakingStyle: 'Detailed',
      faculties: ['reminder'],
      behaviorGuide: '### Custom Behavior\nDo something specific when asked.',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('### Custom Behavior'), 'SKILL.md must include behaviorGuide content');
    assert.ok(skillMd.includes('Do something specific'), 'behaviorGuide details must be present');
    await fs.remove(TMP);
  });
});

describe('generated soul-injection quality', () => {
  it('does not contain HTML entities', async () => {
    const persona = {
      personaName: 'QuoteTest',
      slug: 'quote-test',
      bio: 'quote tester',
      personality: "fun, lively, won't stop talking",
      speakingStyle: "Often says 'Hey there!' and 'What's up?'",
      faculties: ['reminder'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul-injection.md'), 'utf-8');

    assert.ok(!soulInjection.includes('&#39;'), 'soul-injection must not contain &#39; HTML entities');
    assert.ok(!soulInjection.includes('&amp;'), 'soul-injection must not contain &amp; HTML entities');
    assert.ok(!soulInjection.includes('&quot;'), 'soul-injection must not contain &quot; HTML entities');
    assert.ok(soulInjection.includes("'Hey there!'"), 'single quotes must be preserved as-is');
    await fs.remove(TMP);
  });

  it('contains facultySummary instead of raw faculty SKILL.md', async () => {
    const persona = {
      personaName: 'SummaryTest',
      slug: 'summary-test',
      bio: 'summary tester',
      personality: 'concise',
      speakingStyle: 'Brief',
      faculties: ['selfie', 'reminder'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul-injection.md'), 'utf-8');

    // Should contain brief faculty summaries
    assert.ok(soulInjection.includes('Your Abilities'), 'soul-injection should have abilities section');
    assert.ok(soulInjection.includes('**selfie**'), 'should mention selfie faculty');
    assert.ok(soulInjection.includes('**reminder**'), 'should mention reminder faculty');

    // Should NOT contain raw technical content from faculty SKILL.md
    assert.ok(!soulInjection.includes('fal.run'), 'soul-injection must not contain API URLs');
    assert.ok(!soulInjection.includes('curl'), 'soul-injection must not contain curl commands');
    assert.ok(!soulInjection.includes('generate-image.sh'), 'soul-injection must not reference scripts');
    await fs.remove(TMP);
  });
});

describe('generated persona.json output', () => {
  it('does not contain derived internal fields', async () => {
    const persona = {
      personaName: 'Clean',
      slug: 'clean-test',
      bio: 'clean output tester',
      personality: 'tidy',
      speakingStyle: 'Neat',
      faculties: ['reminder'],
      behaviorGuide: '### Test\nSome guide.',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    const forbidden = ['backstory', 'capabilitiesSection', 'facultySummary',
      'skillContent', 'description', 'evolutionEnabled', 'allowedToolsStr'];
    for (const key of forbidden) {
      assert.ok(!(key in output), `persona.json must not contain derived field: ${key}`);
    }
    assert.ok(output.personaName === 'Clean', 'original fields must be preserved');
    assert.ok(output.behaviorGuide === '### Test\nSome guide.', 'behaviorGuide must be preserved');
    assert.ok(output.meta?.framework === 'openpersona', 'meta.framework must be set');
  });

  it('keeps allowedTools as array', async () => {
    const persona = {
      personaName: 'Array',
      slug: 'array-test',
      bio: 'array tester',
      personality: 'structured',
      speakingStyle: 'Organized',
      faculties: ['selfie'],
      allowedTools: ['Read', 'Write'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    assert.ok(Array.isArray(output.allowedTools), 'allowedTools must be an array');
    assert.ok(output.allowedTools.includes('Bash(curl:*)'), 'selfie tools should be merged');
    await fs.remove(TMP);
  });
});
