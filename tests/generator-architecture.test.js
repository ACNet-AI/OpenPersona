/**
 * OpenPersona - Generator tests: architecture — persona.json output, four-layer, registry, handoff
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');
const { loadRegistry, saveRegistry, registryAdd, registryRemove, registrySetActive, REGISTRY_PATH } = require('../lib/utils');
const { generateHandoff, renderHandoff } = require('../lib/switcher');

const TMP = path.join(require('os').tmpdir(), 'openpersona-test-arch-' + Date.now());

describe('generated persona.json output', () => {
  it('does not contain derived internal fields', async () => {
    const persona = {
      personaName: 'Clean',
      slug: 'clean-test',
      bio: 'clean output tester',
      personality: 'tidy',
      speakingStyle: 'Neat',
      faculties: [{ name: 'reminder' }],
      behaviorGuide: '### Test\nSome guide.',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    const forbidden = ['backstory', 'facultySummary',
      'skillContent', 'description', 'evolutionEnabled', 'allowedToolsStr',
      'facultyConfigs', 'avatar'];
    for (const key of forbidden) {
      assert.ok(!(key in output), `persona.json must not contain derived field: ${key}`);
    }
    // author and version are utility fields preserved in output (with defaults when not declared)
    assert.ok(output.author !== undefined, 'author must be preserved in output persona.json');
    assert.ok(output.version !== undefined, 'version must be preserved in output persona.json');
    assert.ok(output.personaName === 'Clean', 'original fields must be preserved');
    // behaviorGuide: inline strings are externalized to soul/behavior-guide.md during generation;
    // the output persona.json stores the file reference path, not the inline content.
    assert.ok(output.behaviorGuide === 'file:soul/behavior-guide.md', 'behaviorGuide must be converted to file reference in output');
    assert.ok(output.meta?.framework === 'openpersona', 'meta.framework must be set');
  });

  it('generated persona pack includes .gitignore covering sensitive runtime files', async () => {
    const persona = {
      personaName: 'GitSafe',
      slug: 'git-safe',
      bio: 'gitignore tester',
      personality: 'cautious',
      speakingStyle: 'Direct',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);

    const gitignorePath = path.join(skillDir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must be generated in persona pack');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content.includes('acn-registration.json'), '.gitignore must exclude acn-registration.json');
    assert.ok(content.includes('state.json'), '.gitignore must exclude state.json');
    assert.ok(content.includes('handoff.json'), '.gitignore must exclude handoff.json');
    assert.ok(content.includes('soul/self-narrative.md'), '.gitignore must exclude soul/self-narrative.md');

    await fs.remove(TMP);
  });

  it('allowedTools: merged set in SKILL.md frontmatter, stripped from persona.json (P21: no manifest.json)', async () => {
    const persona = {
      personaName: 'Array',
      slug: 'array-test',
      bio: 'array tester',
      personality: 'structured',
      speakingStyle: 'Organized',
      faculties: [{ name: 'selfie' }],
      additionalAllowedTools: ['Read', 'Write'],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);

    // manifest.json must NOT be generated (P21)
    assert.ok(!fs.existsSync(path.join(skillDir, 'manifest.json')), 'manifest.json must not be generated');

    // SKILL.md frontmatter must contain the merged tool set (including selfie tools)
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    assert.ok(skillMd.includes('Bash(bash scripts/generate-image.sh:*)'), 'selfie tools should be in SKILL.md allowed-tools');

    // persona.json must NOT contain the computed allowedTools (it is a DERIVED_FIELDS entry)
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.ok(!('allowedTools' in output), 'persona.json must not contain computed allowedTools');

    await fs.remove(TMP);
  });
});

describe('four-layer architecture', () => {
  it('SKILL.md contains all four layer headings in correct order', async () => {
    const persona = {
      personaName: 'LayerOrder',
      slug: 'layer-order',
      bio: 'layer ordering test',
      personality: 'structured',
      speakingStyle: 'Direct',
      faculties: [{ name: 'voice' }],
      skills: [{ name: 'weather', description: 'Check weather', trigger: 'On request' }],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    const soulIdx = skillMd.indexOf('## Soul');
    const bodyIdx = skillMd.indexOf('## Body');
    const facultyIdx = skillMd.indexOf('## Faculty');
    const skillIdx = skillMd.indexOf('## Skill\n');

    assert.ok(soulIdx >= 0, 'Must have ## Soul');
    assert.ok(bodyIdx >= 0, 'Must have ## Body');
    assert.ok(facultyIdx >= 0, 'Must have ## Faculty');
    assert.ok(skillIdx >= 0, 'Must have ## Skill');
    assert.ok(soulIdx < bodyIdx, 'Soul must come before Body');
    assert.ok(bodyIdx < facultyIdx, 'Body must come before Faculty');
    assert.ok(facultyIdx < skillIdx, 'Faculty must come before Skill');

    await fs.remove(TMP);
  });

  it('Soul and Body always present even without faculties or skills', async () => {
    const persona = {
      personaName: 'Minimal',
      slug: 'minimal',
      bio: 'bare minimum persona',
      personality: 'quiet',
      speakingStyle: 'Brief',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('## Soul'), 'Soul section always present');
    assert.ok(skillMd.includes('## Body'), 'Body section always present');
    assert.ok(skillMd.includes('Digital-only'), 'Digital-only body for persona without body');
    assert.ok(!skillMd.includes('## Faculty'), 'No Faculty section when no faculties');
    assert.ok(!skillMd.includes('## Skill\n'), 'No Skill section when no skills');

    await fs.remove(TMP);
  });

  it('soul/ directory contains all required artifacts', async () => {
    const persona = {
      personaName: 'SoulDir',
      slug: 'soul-dir',
      bio: 'soul directory test',
      personality: 'introspective',
      speakingStyle: 'Thoughtful',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const soulDir = path.join(skillDir, 'soul');

    assert.ok(fs.existsSync(path.join(skillDir, 'persona.json')), 'persona.json must exist at root');
    assert.ok(fs.existsSync(path.join(skillDir, 'state.json')), 'state.json must exist at root');
    assert.ok(fs.existsSync(path.join(soulDir, 'injection.md')), 'soul/injection.md must exist');
    assert.ok(fs.existsSync(path.join(soulDir, 'constitution.md')), 'soul/constitution.md must exist');

    // These files must NOT exist at old locations
    assert.ok(!fs.existsSync(path.join(soulDir, 'persona.json')), 'persona.json must not be inside soul/');
    assert.ok(!fs.existsSync(path.join(skillDir, 'soul-injection.md')), 'soul-injection.md must not be at root');
    assert.ok(!fs.existsSync(path.join(skillDir, 'constitution.md')), 'constitution.md must not be at root');

    await fs.remove(TMP);
  });

  it('references/ contains faculty docs when faculties present', async () => {
    const persona = {
      personaName: 'RefDir',
      slug: 'ref-dir',
      bio: 'references directory test',
      personality: 'methodical',
      speakingStyle: 'Precise',
      faculties: [{ name: 'voice' }, { name: 'reminder' }],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const refsDir = path.join(skillDir, 'references');

    assert.ok(fs.existsSync(path.join(refsDir, 'voice.md')), 'references/voice.md must exist');
    assert.ok(fs.existsSync(path.join(refsDir, 'reminder.md')), 'references/reminder.md must exist');

    // Faculty docs must NOT be at root
    assert.ok(!fs.existsSync(path.join(skillDir, 'voice.md')), 'voice.md must not be at root');

    await fs.remove(TMP);
  });

  it('references/SIGNAL-PROTOCOL.md is always generated (host-side implementation guide)', async () => {
    const persona = {
      personaName: 'SignalRef',
      slug: 'signal-ref',
      bio: 'signal protocol reference test',
      personality: 'communicative',
      speakingStyle: 'Clear',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const refsDir = path.join(skillDir, 'references');

    assert.ok(fs.existsSync(path.join(refsDir, 'SIGNAL-PROTOCOL.md')), 'references/SIGNAL-PROTOCOL.md must always be generated');

    const content = fs.readFileSync(path.join(refsDir, 'SIGNAL-PROTOCOL.md'), 'utf-8');
    assert.ok(content.includes('Signal Protocol'), 'SIGNAL-PROTOCOL.md must contain Signal Protocol content');
    assert.ok(content.includes('signals.json'), 'SIGNAL-PROTOCOL.md must document signals.json');
    assert.ok(content.includes('signal-responses.json'), 'SIGNAL-PROTOCOL.md must document signal-responses.json');

    await fs.remove(TMP);
  });

  it('Body description reflects soft-ref body', async () => {
    const persona = {
      personaName: 'BodyRef',
      slug: 'body-ref',
      bio: 'body soft-ref test',
      personality: 'embodied',
      speakingStyle: 'Physical',
      body: { name: 'android-v1', install: 'clawhub:android-body' },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('## Body'), 'Body section must exist');
    assert.ok(skillMd.includes('android-v1'), 'Must mention body name');
    assert.ok(skillMd.includes('not yet installed'), 'Must indicate not yet installed');

    await fs.remove(TMP);
  });

  it('Body three-dimensional model: runtime dimension renders correctly', async () => {
    const persona = {
      personaName: 'RuntimeBot',
      slug: 'runtime-bot',
      bio: 'body runtime test',
      personality: 'aware',
      speakingStyle: 'Technical',
      body: {
        runtime: {
          platform: 'openclaw',
          channels: ['whatsapp', 'telegram'],
          credentials: [
            { scope: 'moltbook', shared: true, envVar: 'MOLTBOOK_API_KEY' },
            { scope: 'elevenlabs', shared: false, envVar: 'ELEVENLABS_API_KEY' },
          ],
          resources: ['filesystem', 'network'],
        },
      },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    const injectionMd = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(skillMd.includes('### Physical'), 'Physical subsection in Body');
    assert.ok(skillMd.includes('Digital-only'), 'No physical body means Digital-only');
    assert.ok(skillMd.includes('### Runtime'), 'Runtime subsection in Body');
    assert.ok(skillMd.includes('openclaw'), 'Platform declared in SKILL.md');
    assert.ok(skillMd.includes('whatsapp'), 'Channels declared in SKILL.md');
    assert.ok(skillMd.includes('moltbook (shared)'), 'Shared credential in SKILL.md');
    assert.ok(skillMd.includes('elevenlabs (private)'), 'Private credential in SKILL.md');

    assert.ok(injectionMd.includes('#### Body'), 'Body sub-section in Self-Awareness');
    assert.ok(injectionMd.includes('Signal Protocol'), 'Signal Protocol present');
    assert.ok(injectionMd.includes('Your Current Body'), 'Current body details injected');
    assert.ok(injectionMd.includes('Credential Management'), 'Credential management present');
    assert.ok(injectionMd.includes('credentials/shared'), 'Shared credential path documented');
    assert.ok(injectionMd.includes('credentials/persona-runtime-bot'), 'Private credential path documented');

    await fs.remove(TMP);
  });

  it('Body three-dimensional model: appearance dimension renders correctly', async () => {
    const persona = {
      personaName: 'AvatarBot',
      slug: 'avatar-bot',
      bio: 'appearance test',
      personality: 'visual',
      speakingStyle: 'Artistic',
      body: {
        appearance: {
          avatar: 'https://example.com/avatar.png',
          style: 'anime',
        },
      },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('### Appearance'), 'Appearance subsection in Body');
    assert.ok(skillMd.includes('avatar.png'), 'Avatar URL in SKILL.md');
    assert.ok(skillMd.includes('anime'), 'Style in SKILL.md');

    await fs.remove(TMP);
  });

  it('Body three-dimensional model: physical + runtime + appearance combined', async () => {
    const persona = {
      personaName: 'FullBody',
      slug: 'full-body',
      bio: 'full body test',
      personality: 'embodied',
      speakingStyle: 'Robotic',
      body: {
        physical: {
          name: 'robot-arm',
          description: '6-DOF arm',
          capabilities: ['pick', 'place'],
        },
        runtime: {
          platform: 'standalone',
          channels: ['serial'],
          credentials: [],
          resources: ['filesystem'],
        },
        appearance: {
          avatar: '/assets/robot.png',
          style: 'industrial',
          model3d: '/assets/robot.glb',
        },
      },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('### Physical'), 'Physical subsection');
    assert.ok(skillMd.includes('robot-arm'), 'Physical body name');
    assert.ok(skillMd.includes('6-DOF arm'), 'Physical body description');
    assert.ok(skillMd.includes('pick, place'), 'Physical capabilities');
    assert.ok(skillMd.includes('### Runtime'), 'Runtime subsection');
    assert.ok(skillMd.includes('standalone'), 'Platform');
    assert.ok(skillMd.includes('### Appearance'), 'Appearance subsection');
    assert.ok(skillMd.includes('industrial'), 'Appearance style');
    assert.ok(skillMd.includes('robot.glb'), '3D model reference');

    await fs.remove(TMP);
  });

  it('no README.md is generated', async () => {
    const persona = {
      personaName: 'NoReadme',
      slug: 'no-readme',
      bio: 'no readme test',
      personality: 'lean',
      speakingStyle: 'Minimal',
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);

    assert.ok(!fs.existsSync(path.join(skillDir, 'README.md')), 'README.md must not be generated');

    await fs.remove(TMP);
  });

  it('copies local assets when generate receives config path', async () => {
    const configDir = path.join(TMP, 'asset-copy-config');
    await fs.ensureDir(configDir);
    const avatarPng = path.join(configDir, 'avatar.png');
    fs.writeFileSync(avatarPng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // minimal PNG header
    const personaJson = {
      personaName: 'AssetCopy',
      slug: 'asset-copy',
      bio: 'asset copy test',
      personality: 'neutral',
      speakingStyle: 'Plain',
      referenceImage: './avatar.png',
      body: {
        appearance: {
          avatar: './avatar.png',
          style: 'minimal',
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'persona.json'), JSON.stringify(personaJson, null, 2));

    const personaPath = path.join(configDir, 'persona.json');
    const { skillDir } = await generate(personaPath, TMP);

    const refPath = path.join(skillDir, 'assets', 'reference', 'avatar.png');
    const avPath = path.join(skillDir, 'assets', 'avatar', 'avatar.png');
    assert.ok(fs.existsSync(refPath), 'referenceImage should be copied to assets/reference/');
    assert.ok(fs.existsSync(avPath), 'body.appearance.avatar should be copied to assets/avatar/');

    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(personaOut.referenceImage, './assets/reference/avatar.png', 'referenceImage path should be rewritten');
    assert.strictEqual(personaOut.body.appearance.avatar, './assets/avatar/avatar.png', 'avatar path should be rewritten');

    await fs.remove(TMP);
  });

  it('does not rewrite asset path when source file is missing', async () => {
    const configDir = path.join(TMP, 'asset-missing-config');
    await fs.ensureDir(configDir);
    const personaJson = {
      personaName: 'AssetMissing',
      slug: 'asset-missing',
      bio: 'missing asset test',
      personality: 'neutral',
      speakingStyle: 'Plain',
      referenceImage: './nonexistent.png',
    };
    fs.writeFileSync(path.join(configDir, 'persona.json'), JSON.stringify(personaJson, null, 2));

    const { skillDir } = await generate(path.join(configDir, 'persona.json'), TMP);

    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(personaOut.referenceImage, './nonexistent.png', 'path must not be rewritten when source file is missing');
    assert.ok(!fs.existsSync(path.join(skillDir, 'assets', 'reference', 'nonexistent.png')), 'file must not be copied when source is missing');

    await fs.remove(TMP);
  });
});

describe('persona registry', () => {
  const regPath = path.join(TMP, 'test-registry.json');

  it('registryAdd creates entry with correct fields', () => {
    fs.ensureDirSync(TMP);
    registryAdd('test-bot', { personaName: 'TestBot', slug: 'test-bot', role: 'assistant' }, '/tmp/test', regPath);
    const reg = loadRegistry(regPath);

    assert.ok(reg.personas['test-bot'], 'Entry must exist');
    assert.strictEqual(reg.personas['test-bot'].personaName, 'TestBot');
    assert.strictEqual(reg.personas['test-bot'].role, 'assistant');
    assert.strictEqual(reg.personas['test-bot'].path, '/tmp/test');
    assert.ok(reg.personas['test-bot'].installedAt, 'Must have installedAt');
    assert.strictEqual(reg.personas['test-bot'].active, false, 'New entry defaults to inactive');
  });

  it('registrySetActive marks one active and deactivates others', () => {
    registryAdd('alpha', { personaName: 'Alpha', slug: 'alpha' }, '/tmp/a', regPath);
    registryAdd('beta', { personaName: 'Beta', slug: 'beta' }, '/tmp/b', regPath);
    registrySetActive('alpha', regPath);

    let reg = loadRegistry(regPath);
    assert.strictEqual(reg.personas.alpha.active, true, 'Alpha must be active');
    assert.strictEqual(reg.personas.beta.active, false, 'Beta must be inactive');
    assert.ok(reg.personas.alpha.lastActiveAt, 'Alpha must have lastActiveAt');

    registrySetActive('beta', regPath);
    reg = loadRegistry(regPath);
    assert.strictEqual(reg.personas.alpha.active, false, 'Alpha must be deactivated');
    assert.strictEqual(reg.personas.beta.active, true, 'Beta must now be active');
  });

  it('registryRemove deletes entry and preserves others', () => {
    registryRemove('alpha', regPath);
    const reg = loadRegistry(regPath);
    assert.ok(!reg.personas.alpha, 'Alpha must be removed');
    assert.ok(reg.personas.beta, 'Beta must remain');
    assert.ok(reg.personas['test-bot'], 'test-bot must remain');
  });

  it('registryAdd preserves installedAt on update', () => {
    const reg1 = loadRegistry(regPath);
    const originalDate = reg1.personas['test-bot'].installedAt;

    registryAdd('test-bot', { personaName: 'TestBot v2', slug: 'test-bot', role: 'mentor' }, '/tmp/test2', regPath);
    const reg2 = loadRegistry(regPath);
    assert.strictEqual(reg2.personas['test-bot'].installedAt, originalDate, 'installedAt must not change on update');
    assert.strictEqual(reg2.personas['test-bot'].personaName, 'TestBot v2', 'personaName must update');
    assert.strictEqual(reg2.personas['test-bot'].path, '/tmp/test2', 'path must update');
  });

  it('loadRegistry returns empty registry when file missing', () => {
    const missing = path.join(TMP, 'nonexistent-registry.json');
    const reg = loadRegistry(missing);
    assert.deepStrictEqual(reg, { version: 1, personas: {} });

    fs.removeSync(TMP);
  });
});

// --- Context Handoff Protocol (Phase B) ---
describe('context handoff', () => {
  const HANDOFF_TMP = path.join(require('os').tmpdir(), 'openpersona-handoff-test-' + Date.now());

  it('generateHandoff returns null when persona.json missing', () => {
    const fakeDir = path.join(HANDOFF_TMP, 'no-persona');
    fs.ensureDirSync(fakeDir);
    const result = generateHandoff('ghost', fakeDir);
    assert.strictEqual(result, null);
  });

  it('generateHandoff produces basic handoff from persona.json alone', () => {
    const oldDir = path.join(HANDOFF_TMP, 'persona-old');
    fs.ensureDirSync(path.join(oldDir, 'soul'));
    fs.writeFileSync(path.join(oldDir, 'persona.json'), JSON.stringify({
      personaName: 'OldBot',
      slug: 'old-bot',
      role: 'mentor',
      bio: 'a wise mentor',
      personality: 'calm',
      speakingStyle: 'measured',
    }));

    const handoff = generateHandoff('old-bot', oldDir);
    assert.ok(handoff, 'handoff must not be null');
    assert.strictEqual(handoff.previousPersona.slug, 'old-bot');
    assert.strictEqual(handoff.previousPersona.name, 'OldBot');
    assert.strictEqual(handoff.previousPersona.role, 'mentor');
    assert.ok(handoff.timestamp, 'timestamp must exist');
    assert.strictEqual(handoff.moodSnapshot, undefined, 'no mood without state.json');
    assert.strictEqual(handoff.relationshipStage, undefined, 'no stage without state.json');
  });

  it('generateHandoff extracts mood, relationship, and interests from state.json', () => {
    const oldDir = path.join(HANDOFF_TMP, 'persona-rich');
    fs.ensureDirSync(path.join(oldDir, 'soul'));
    fs.writeFileSync(path.join(oldDir, 'persona.json'), JSON.stringify({
      personaName: 'RichBot',
      slug: 'rich-bot',
      role: 'companion',
      bio: 'test',
      personality: 'cheerful',
      speakingStyle: 'casual',
    }));
    fs.writeFileSync(path.join(oldDir, 'state.json'), JSON.stringify({
      relationship: { stage: 'friend', interactionCount: 15 },
      mood: { current: 'happy', intensity: 0.8 },
      interests: { cooking: 3, travel: 5, music: 1 },
    }));

    const handoff = generateHandoff('rich-bot', oldDir);
    assert.ok(handoff);
    assert.strictEqual(handoff.relationshipStage, 'friend');
    assert.strictEqual(handoff.moodSnapshot.current, 'happy');
    assert.strictEqual(handoff.moodSnapshot.intensity, 0.8);
    assert.deepStrictEqual(handoff.sharedInterests, ['cooking', 'travel', 'music']);
  });

  it('renderHandoff produces markdown with all sections', () => {
    const handoff = {
      previousPersona: { slug: 'sam', name: 'Samantha', role: 'companion' },
      conversationSummary: 'User was asking about vacation plans.',
      pendingItems: [
        { description: 'Book flight to Tokyo', priority: 'high' },
        { description: 'Check hotel prices', priority: 'medium' },
      ],
      moodSnapshot: { current: 'excited', intensity: 0.9, userSentiment: 'enthusiastic' },
      relationshipStage: 'friend',
      sharedInterests: ['travel', 'food', 'photography'],
      timestamp: new Date().toISOString(),
    };

    const md = renderHandoff(handoff);
    assert.ok(md, 'rendered markdown must not be null');
    assert.ok(md.includes('Samantha'), 'must include previous persona name');
    assert.ok(md.includes('sam'), 'must include previous slug');
    assert.ok(md.includes('vacation plans'), 'must include conversation summary');
    assert.ok(md.includes('Book flight to Tokyo'), 'must include pending item');
    assert.ok(md.includes('excited'), 'must include mood');
    assert.ok(md.includes('enthusiastic'), 'must include user sentiment');
    assert.ok(md.includes('friend'), 'must include relationship stage');
    assert.ok(md.includes('travel, food, photography'), 'must include interests');
  });

  it('renderHandoff handles minimal handoff (no state)', () => {
    const handoff = {
      previousPersona: { slug: 'min', name: 'MinBot', role: 'assistant' },
      timestamp: new Date().toISOString(),
    };

    const md = renderHandoff(handoff);
    assert.ok(md, 'rendered markdown must not be null');
    assert.ok(md.includes('MinBot'), 'must include name');
    assert.ok(!md.includes('Pending items'), 'must not include pending items section');
    assert.ok(!md.includes('Emotional context'), 'must not include mood section');
  });

  it('handoff.schema.json is valid JSON', () => {
    const schemaPath = path.join(__dirname, '..', 'schemas', 'soul', 'handoff.schema.json');
    assert.ok(fs.existsSync(schemaPath), 'schema file must exist');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    assert.strictEqual(schema.title, 'Context Handoff');
    assert.ok(schema.required.includes('previousPersona'));
    assert.ok(schema.required.includes('timestamp'));
  });

  it('soul-injection template includes handoff conditional block', () => {
    const templatesDir = path.join(__dirname, '..', 'templates');
    const mainTemplate = fs.readFileSync(path.join(templatesDir, 'soul-injection.template.md'), 'utf-8');
    const partialsDir = path.join(templatesDir, 'partials');
    function collectPartials(dir) {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).flatMap((f) => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) return collectPartials(full);
        return f.endsWith('.partial.md') ? [full] : [];
      });
    }
    const partialFiles = collectPartials(partialsDir);
    const allContent = [mainTemplate, ...partialFiles.map((f) => fs.readFileSync(f, 'utf-8'))].join('\n');
    assert.ok(allContent.includes('{{#hasHandoff}}'), 'template must have hasHandoff conditional');
    assert.ok(allContent.includes('handoff.json'), 'template must reference handoff.json');
  });

  it('generated persona with evolution includes hasHandoff placeholder', async () => {
    const persona = {
      personaName: 'HandoffTest',
      slug: 'handoff-test',
      bio: 'handoff test persona',
      personality: 'adaptive',
      speakingStyle: 'natural',
      evolution: { enabled: true },
    };
    await fs.ensureDir(HANDOFF_TMP);
    const { skillDir } = await generate(persona, HANDOFF_TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    // hasHandoff is false at generation time, so the block should NOT appear
    assert.ok(!injection.includes('Context Handoff:'), 'handoff block must not appear when hasHandoff is false');
  });

  // Cleanup
  it('cleanup handoff test dir', () => {
    fs.removeSync(HANDOFF_TMP);
  });
});

// --- Version consistency ---
describe('version consistency', () => {
  it('package.json, bin/cli.js, and generator.js all report the same version', () => {
    const pkg = require('../package.json');

    // bin/cli.js must read version dynamically from package.json (no hardcoding)
    const cliBin = fs.readFileSync(path.join(__dirname, '..', 'bin', 'cli.js'), 'utf-8');
    assert.ok(
      !cliBin.includes(`'.version('${pkg.version}')`),
      'bin/cli.js must not hardcode a version string — it must read from package.json'
    );
    assert.ok(
      cliBin.includes("require('../package.json')"),
      'bin/cli.js must require package.json for its version'
    );

    // generator.js must also read version dynamically
    const generatorSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'generator.js'), 'utf-8');
    assert.ok(
      generatorSrc.includes("require('../package.json')"),
      'lib/generator.js must require package.json for FRAMEWORK_VERSION'
    );
  });

  it('skills/open-persona/SKILL.md frontmatter version matches package.json', () => {
    const pkg = require('../package.json');
    const skillMd = fs.readFileSync(path.join(__dirname, '..', 'skills', 'open-persona', 'SKILL.md'), 'utf-8');
    const match = skillMd.match(/^version:\s*["']?([^"'\s]+)["']?/m);
    assert.ok(match, 'skills/open-persona/SKILL.md must have a version: field in frontmatter');
    assert.strictEqual(
      match[1],
      pkg.version,
      `skills/open-persona/SKILL.md version (${match[1]}) must match package.json (${pkg.version})`
    );
  });
});

// --- Evolution Governance (Phase D) ---
