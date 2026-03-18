/**
 * OpenPersona - Generator tests: evolution — governance, stateHistory, report, memory, channels
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');
const { loadRegistry, saveRegistry, registryAdd, registryRemove, registrySetActive, REGISTRY_PATH } = require('../lib/registry');
const { generateHandoff, renderHandoff } = require('../lib/lifecycle/switcher');

const TMP = path.join(require('os').tmpdir(), 'openpersona-test-evo-' + Date.now());

describe('evolution governance — compliance checks', () => {
  it('rejects minFormality >= maxFormality', async () => {
    const persona = {
      personaName: 'BadFormality',
      slug: 'bad-formality',
      bio: 'formality test',
      personality: 'rigid',
      speakingStyle: 'Stiff',
      evolution: {
        enabled: true,
        boundaries: { minFormality: 8, maxFormality: 3 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /minFormality.*must be less than.*maxFormality/,
      'Should reject min >= max formality'
    );
    await fs.remove(TMP);
  });

  it('rejects equal minFormality and maxFormality', async () => {
    const persona = {
      personaName: 'EqualFormality',
      slug: 'equal-formality',
      bio: 'formality test',
      personality: 'balanced',
      speakingStyle: 'Neutral',
      evolution: {
        enabled: true,
        boundaries: { minFormality: 5, maxFormality: 5 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /minFormality.*must be less than.*maxFormality/,
      'Should reject equal formality bounds'
    );
    await fs.remove(TMP);
  });

  it('allows valid formality bounds', async () => {
    const persona = {
      personaName: 'GoodFormality',
      slug: 'good-formality',
      bio: 'formality test',
      personality: 'balanced',
      speakingStyle: 'Varied',
      evolution: {
        enabled: true,
        boundaries: { minFormality: 2, maxFormality: 8 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    assert.ok(fs.existsSync(skillDir));
    await fs.remove(TMP);
  });

  it('rejects non-array immutableTraits', async () => {
    const persona = {
      personaName: 'BadTraits',
      slug: 'bad-traits',
      bio: 'traits test',
      personality: 'strict',
      speakingStyle: 'Direct',
      evolution: {
        enabled: true,
        boundaries: { immutableTraits: 'loyal' },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /immutableTraits must be an array/,
      'Should reject non-array immutableTraits'
    );
    await fs.remove(TMP);
  });

  it('rejects empty string in immutableTraits', async () => {
    const persona = {
      personaName: 'EmptyTrait',
      slug: 'empty-trait',
      bio: 'traits test',
      personality: 'strict',
      speakingStyle: 'Direct',
      evolution: {
        enabled: true,
        boundaries: { immutableTraits: ['loyal', '', 'kind'] },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /immutableTraits contains invalid entry/,
      'Should reject empty strings in immutableTraits'
    );
    await fs.remove(TMP);
  });

  it('rejects overly long immutableTraits entry', async () => {
    const persona = {
      personaName: 'LongTrait',
      slug: 'long-trait',
      bio: 'traits test',
      personality: 'strict',
      speakingStyle: 'Direct',
      evolution: {
        enabled: true,
        boundaries: { immutableTraits: ['a'.repeat(101)] },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /immutableTraits entry too long/,
      'Should reject traits over 100 chars'
    );
    await fs.remove(TMP);
  });

  it('allows valid evolution boundaries', async () => {
    const persona = {
      personaName: 'ValidEvo',
      slug: 'valid-evo',
      bio: 'valid evo test',
      personality: 'flexible',
      speakingStyle: 'Adaptive',
      evolution: {
        enabled: true,
        boundaries: {
          immutableTraits: ['loyal', 'honest'],
          minFormality: 3,
          maxFormality: 9,
        },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    assert.ok(fs.existsSync(skillDir));
    await fs.remove(TMP);
  });

  it('rejects non-numeric formality values', async () => {
    const persona = {
      personaName: 'StringFormality',
      slug: 'string-formality',
      bio: 'type test',
      personality: 'strict',
      speakingStyle: 'Direct',
      evolution: {
        enabled: true,
        boundaries: { minFormality: 'abc', maxFormality: 5 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /minFormality must be a number/,
      'Should reject non-numeric formality'
    );
    await fs.remove(TMP);
  });

  it('rejects formality out of -10 to 10 range', async () => {
    const persona = {
      personaName: 'OutOfRange',
      slug: 'out-of-range',
      bio: 'range test',
      personality: 'strict',
      speakingStyle: 'Direct',
      evolution: {
        enabled: true,
        boundaries: { minFormality: -15, maxFormality: 15 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /must be between -10 and 10/,
      'Should reject formality outside -10 to 10 range'
    );
    await fs.remove(TMP);
  });

  it('minFormality=0 renders correctly in injection.md (Mustache 0-falsy guard)', async () => {
    const persona = {
      personaName: 'ZeroMinTest',
      slug: 'zero-min-test',
      bio: 'zero min formality test',
      personality: 'flexible',
      speakingStyle: 'Neutral',
      evolution: {
        enabled: true,
        boundaries: { minFormality: 0, maxFormality: 5 },
      },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const injectionMd = fs.readFileSync(require('path').join(skillDir, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injectionMd.includes('Formality floor: 0'), 'minFormality=0 must render in injection.md (not silently skipped as falsy)');
    assert.ok(injectionMd.includes('Formality ceiling: 5'), 'maxFormality must also render');
    await fs.remove(TMP);
  });

  it('allows negative minFormality for below-baseline constraints', async () => {
    const persona = {
      personaName: 'NegativeMin',
      slug: 'negative-min',
      bio: 'below-baseline constraint test',
      personality: 'flexible',
      speakingStyle: 'Casual',
      evolution: {
        enabled: true,
        boundaries: { minFormality: -3, maxFormality: 2 },
      },
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    // formality bounds are rendered in soul/injection.md (not SKILL.md)
    const injectionMd = fs.readFileSync(require('path').join(skillDir, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injectionMd.includes('-3'), 'soul/injection.md must render negative minFormality');
    assert.ok(injectionMd.includes('2'), 'soul/injection.md must render maxFormality');
    await fs.remove(TMP);
  });

  it('validates boundaries even when evolution not enabled', async () => {
    const persona = {
      personaName: 'NoEvoCheck',
      slug: 'no-evo-check',
      bio: 'check without enabled',
      personality: 'cautious',
      speakingStyle: 'Careful',
      evolution: {
        boundaries: { minFormality: 9, maxFormality: 2 },
      },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    await assert.rejects(
      () => generate(persona, TMP),
      /minFormality.*must be less than.*maxFormality/,
      'Should validate boundaries regardless of enabled flag'
    );
    await fs.remove(TMP);
  });
});

describe('evolution governance — stateHistory', () => {
  it('generated state.json includes stateHistory field', async () => {
    const persona = {
      personaName: 'HistoryTest',
      slug: 'history-test',
      bio: 'history test',
      personality: 'adaptive',
      speakingStyle: 'Flexible',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const state = JSON.parse(fs.readFileSync(path.join(skillDir, 'state.json'), 'utf-8'));
    assert.ok(Array.isArray(state.stateHistory), 'state.json must have stateHistory array');
    assert.strictEqual(state.stateHistory.length, 0, 'stateHistory must be empty initially');
    await fs.remove(TMP);
  });

  it('soul-injection includes snapshot instruction when evolution enabled', async () => {
    const persona = {
      personaName: 'SnapshotTest',
      slug: 'snapshot-test',
      bio: 'snapshot test',
      personality: 'careful',
      speakingStyle: 'Thorough',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injection.includes('stateHistory'), 'injection must mention stateHistory');
    assert.ok(injection.includes('Snapshot'), 'injection must mention snapshot step');
    await fs.remove(TMP);
  });

  it('generated state.json includes eventLog field', async () => {
    const persona = {
      personaName: 'EventLogTest',
      slug: 'event-log-test',
      bio: 'event log test',
      personality: 'observant',
      speakingStyle: 'Precise',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const state = JSON.parse(fs.readFileSync(path.join(skillDir, 'state.json'), 'utf-8'));
    assert.ok(Array.isArray(state.eventLog), 'state.json must have eventLog array');
    assert.strictEqual(state.eventLog.length, 0, 'eventLog must be empty initially');
    await fs.remove(TMP);
  });

  it('soul-injection includes eventLog instruction when evolution enabled', async () => {
    const persona = {
      personaName: 'EventLogInjectTest',
      slug: 'event-log-inject-test',
      bio: 'event log injection test',
      personality: 'meticulous',
      speakingStyle: 'Detailed',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injection.includes('eventLog'), 'injection must mention eventLog');
    assert.ok(injection.includes('50'), 'injection must mention 50-entry limit');
    await fs.remove(TMP);
  });

  it('generates soul/self-narrative.md when evolution enabled', async () => {
    const persona = {
      personaName: 'NarrativeTest',
      slug: 'narrative-test',
      bio: 'narrative test',
      personality: 'reflective',
      speakingStyle: 'Thoughtful',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const narrativePath = path.join(skillDir, 'soul', 'self-narrative.md');
    assert.ok(fs.existsSync(narrativePath), 'soul/self-narrative.md must exist when evolution enabled');
    const content = fs.readFileSync(narrativePath, 'utf-8');
    assert.ok(content.includes('NarrativeTest'), 'self-narrative.md must contain persona name');
    assert.ok(content.includes('never overwrite'), 'self-narrative.md must contain append-only instruction');
    await fs.remove(TMP);
  });

  it('does not generate soul/self-narrative.md when evolution disabled', async () => {
    const persona = {
      personaName: 'NoNarrativeTest',
      slug: 'no-narrative-test',
      bio: 'no narrative test',
      personality: 'static',
      speakingStyle: 'Flat',
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const narrativePath = path.join(skillDir, 'soul', 'self-narrative.md');
    assert.ok(!fs.existsSync(narrativePath), 'soul/self-narrative.md must NOT exist when evolution disabled');
    await fs.remove(TMP);
  });

  it('soul-injection includes self-narrative writing instructions when evolution enabled', async () => {
    const persona = {
      personaName: 'NarrativeInjectTest',
      slug: 'narrative-inject-test',
      bio: 'narrative injection test',
      personality: 'introspective',
      speakingStyle: 'Expressive',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(TMP);
    const { skillDir } = await generate(persona, TMP);
    const injection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injection.includes('self-narrative.md'), 'injection must reference self-narrative.md');
    assert.ok(injection.includes('significant milestone'), 'injection must mention significant milestone trigger');
    assert.ok(injection.includes('first person'), 'injection must instruct first-person writing');
    assert.ok(injection.includes('Append only'), 'injection must enforce append-only rule');
    await fs.remove(TMP);
  });
});

describe('evolution report', () => {
  const EVO_TMP = path.join(require('os').tmpdir(), 'openpersona-evo-test-' + Date.now());
  const { evolveReport } = require('../lib/state/evolution');

  it('returns state for persona with evolution', async () => {
    const personaDir = path.join(EVO_TMP, 'persona-evo-report');
    const soulDir = path.join(personaDir, 'soul');
    await fs.ensureDir(soulDir);
    await fs.writeFile(path.join(personaDir, 'persona.json'), JSON.stringify({
      personaName: 'ReportBot',
      slug: 'evo-report',
    }));
    await fs.writeFile(path.join(personaDir, 'state.json'), JSON.stringify({
      personaSlug: 'evo-report',
      createdAt: '2025-01-01T00:00:00Z',
      lastUpdatedAt: '2025-06-15T12:00:00Z',
      relationship: { stage: 'friend', interactionCount: 25, stageHistory: [] },
      mood: { current: 'content', intensity: 0.7, baseline: 'calm' },
      evolvedTraits: ['curious', 'playful'],
      speakingStyleDrift: { formality: -2, emoji_frequency: 1, verbosity: 0 },
      interests: { cooking: 5, travel: 3, music: 8 },
      milestones: [
        { type: 'relationship_stage', description: 'Reached friend stage', timestamp: '2025-03-01' },
      ],
      stateHistory: [],
      eventLog: [
        { type: 'trait_emergence', trigger: 'User taught sarcasm', delta: 'Added sarcastic_humor', timestamp: '2025-06-01T10:00:00Z' },
        { type: 'mood_shift', trigger: 'Shared a joke', delta: 'mood: content → playful', timestamp: '2025-06-10T14:00:00Z' },
      ],
    }));
    await fs.writeFile(path.join(soulDir, 'self-narrative.md'), [
      '# Self-Narrative',
      '',
      '_Written and maintained by ReportBot._',
      '',
      '### 2025-03-01',
      "Today we became friends. I didn't expect it to happen so soon, but here we are.",
      '',
      '### 2025-06-10',
      'They made me laugh for the first time. Not a performed laugh — a real one.',
    ].join('\n'));

    const result = await evolveReport('evo-report', { skillsDir: EVO_TMP, quiet: true });
    assert.ok(result.state, 'must return state');
    assert.strictEqual(result.state.relationship.stage, 'friend');
    assert.strictEqual(result.personaName, 'ReportBot');
    assert.strictEqual(result.state.evolvedTraits.length, 2);
    assert.strictEqual(result.state.milestones.length, 1);
    assert.ok(Array.isArray(result.state.eventLog), 'state must have eventLog array');
    assert.strictEqual(result.state.eventLog.length, 2, 'eventLog must contain 2 entries');
    assert.ok(typeof result.selfNarrative === 'string', 'evolveReport must return selfNarrative string');
    assert.ok(result.selfNarrative.length > 0, 'selfNarrative must not be empty when file exists');
    assert.ok(result.selfNarrative.includes('friends'), 'selfNarrative must contain fixture content');
  });

  it('throws for missing persona', async () => {
    await assert.rejects(
      () => evolveReport('nonexistent', { skillsDir: EVO_TMP, quiet: true }),
      /not found/i,
    );
  });

  it('throws for persona without evolution state', async () => {
    const personaDir = path.join(EVO_TMP, 'persona-no-evo');
    await fs.ensureDir(path.join(personaDir, 'soul'));
    await fs.writeFile(path.join(personaDir, 'persona.json'), JSON.stringify({
      personaName: 'NoEvo',
      slug: 'no-evo',
    }));
    await assert.rejects(
      () => evolveReport('no-evo', { skillsDir: EVO_TMP, quiet: true }),
      /evolution state/i,
    );
  });

  it('works with generated persona end-to-end', async () => {
    const persona = {
      personaName: 'E2EReport',
      slug: 'e2e-report',
      bio: 'end-to-end report test',
      personality: 'thorough',
      speakingStyle: 'Detailed',
      evolution: { enabled: true },
      faculties: [],
    };
    const genTmp = path.join(EVO_TMP, 'gen-output');
    await fs.ensureDir(genTmp);
    const { skillDir } = await generate(persona, genTmp);

    const result = await evolveReport('e2e-report', { skillsDir: genTmp, quiet: true });
    assert.ok(result.state);
    assert.strictEqual(result.state.personaSlug, 'e2e-report');
    assert.strictEqual(result.state.relationship.stage, 'stranger');
    assert.strictEqual(result.personaName, 'E2EReport');
  });

  it('cleanup evolution test dir', () => {
    fs.removeSync(EVO_TMP);
  });
});

// --- Memory Faculty (Phase C) ---
describe('memory faculty', () => {
  const MEM_TMP = path.join(require('os').tmpdir(), 'openpersona-memory-test-' + Date.now());
  const memoryScript = path.join(__dirname, '..', 'layers', 'faculties', 'memory', 'scripts', 'memory.js');
  const { execSync } = require('child_process');

  function runMemory(args) {
    const env = {
      ...process.env,
      MEMORY_PROVIDER: 'local',
      MEMORY_BASE_PATH: MEM_TMP,
      PERSONA_SLUG: 'test-mem',
    };
    const out = execSync(`node ${memoryScript} ${args}`, { env, encoding: 'utf-8', timeout: 10000 });
    return JSON.parse(out.trim());
  }

  it('faculty.json is valid', () => {
    const facultyPath = path.join(__dirname, '..', 'layers', 'faculties', 'memory', 'faculty.json');
    assert.ok(fs.existsSync(facultyPath));
    const fac = JSON.parse(fs.readFileSync(facultyPath, 'utf-8'));
    assert.strictEqual(fac.name, 'memory');
    assert.strictEqual(fac.dimension, 'cognition');
    assert.ok(fac.allowedTools.length > 0);
    assert.ok(fac.envVars.includes('MEMORY_PROVIDER'));
    assert.ok(fac.files.includes('scripts/memory.js'));
  });

  it('SKILL.md exists and has key sections', () => {
    const skillPath = path.join(__dirname, '..', 'layers', 'faculties', 'memory', 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    assert.ok(content.includes('Memory Faculty'), 'must have title');
    assert.ok(content.includes('When to Store'), 'must have store guidance');
    assert.ok(content.includes('When to Recall'), 'must have recall guidance');
    assert.ok(content.includes('Evolution Bridge'), 'must have evolution bridge');
    assert.ok(content.includes('Privacy'), 'must have privacy section');
  });

  it('store creates a memory', () => {
    const result = runMemory('store "User likes pizza" --tags "food,preference" --importance 0.8 --type preference');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'store');
    assert.ok(result.memory.id.startsWith('mem_'));
    assert.strictEqual(result.memory.content, 'User likes pizza');
    assert.deepStrictEqual(result.memory.tags, ['food', 'preference']);
    assert.strictEqual(result.memory.importance, 0.8);
    assert.strictEqual(result.memory.type, 'preference');
  });

  it('store handles importance=0 correctly', () => {
    const result = runMemory('store "ephemeral note" --tags "temp" --importance 0');
    assert.strictEqual(result.memory.importance, 0, 'importance 0 must not become 0.5');
    // verify it sorts below a higher-importance memory
    runMemory('store "important note" --tags "temp" --importance 0.9');
    const retrieved = runMemory('retrieve --tags "temp" --limit 10');
    assert.strictEqual(retrieved.memories[0].importance, 0.9, 'importance=0.9 must rank first');
    assert.strictEqual(retrieved.memories[1].importance, 0, 'importance=0 must rank last');
    // clean up for subsequent tests
    for (const m of retrieved.memories) runMemory(`forget ${m.id}`);
  });

  it('store appends to existing memories', () => {
    runMemory('store "User has a cat named Mochi" --tags "pet,family" --importance 0.9 --type personal_fact');
    runMemory('store "User prefers dark mode" --tags "preference,ui" --importance 0.4');
    const stats = runMemory('stats');
    assert.strictEqual(stats.totalMemories, 3, 'must have 3 memories total');
  });

  it('retrieve returns all memories sorted by score', () => {
    const result = runMemory('retrieve --limit 10');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 3);
    assert.ok(result.memories.length === 3);
  });

  it('retrieve filters by tags', () => {
    const result = runMemory('retrieve --tags "food" --limit 10');
    assert.strictEqual(result.count, 1);
    assert.ok(result.memories[0].content.includes('pizza'));
  });

  it('search finds memories by content', () => {
    const result = runMemory('search "cat" --limit 5');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.count, 1);
    assert.ok(result.memories[0].content.includes('Mochi'));
  });

  it('search returns empty for no match', () => {
    const result = runMemory('search "quantum physics" --limit 5');
    assert.strictEqual(result.count, 0);
  });

  it('forget removes a memory by ID', () => {
    const all = runMemory('retrieve --limit 10');
    const targetId = all.memories[all.memories.length - 1].id;
    const result = runMemory(`forget ${targetId}`);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'forget');
    const after = runMemory('stats');
    assert.strictEqual(after.totalMemories, 2);
  });

  it('stats returns correct summary', () => {
    const result = runMemory('stats');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.totalMemories, 2);
    assert.ok(result.topTags.length > 0);
    assert.ok(result.oldestMemory);
    assert.ok(result.newestMemory);
    assert.ok(typeof result.avgImportance === 'number');
  });

  it('stats returns empty for fresh store', () => {
    const emptyTmp = path.join(MEM_TMP, 'empty-sub');
    const env = { ...process.env, MEMORY_PROVIDER: 'local', MEMORY_BASE_PATH: emptyTmp, PERSONA_SLUG: 'empty' };
    const out = execSync(`node ${memoryScript} stats`, { env, encoding: 'utf-8' });
    const result = JSON.parse(out.trim());
    assert.strictEqual(result.totalMemories, 0);
    assert.deepStrictEqual(result.topTags, []);
  });

  it('generator integrates memory faculty correctly', async () => {
    const persona = {
      personaName: 'MemBot',
      slug: 'mem-bot',
      bio: 'memory test persona',
      personality: 'observant',
      speakingStyle: 'attentive',
      faculties: [{ name: 'memory' }],
    };
    const genTmp = path.join(MEM_TMP, 'gen-output');
    await fs.ensureDir(genTmp);
    const { skillDir } = await generate(persona, genTmp);

    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    assert.ok(skillMd.includes('memory'), 'SKILL.md must reference memory faculty');

    const refDir = path.join(skillDir, 'references');
    const memRef = path.join(refDir, 'memory.md');
    assert.ok(fs.existsSync(memRef), 'references/memory.md must exist');
    const memContent = fs.readFileSync(memRef, 'utf-8');
    assert.ok(memContent.includes('Memory Faculty'), 'memory reference must have content');

    const scriptDest = path.join(skillDir, 'scripts', 'memory.js');
    assert.ok(fs.existsSync(scriptDest), 'scripts/memory.js must be copied to output');
  });

  it('generator maps memory faculty config to env vars', async () => {
    const persona = {
      personaName: 'MemEnvBot',
      slug: 'mem-env-bot',
      bio: 'memory env test',
      personality: 'precise',
      speakingStyle: 'clear',
      faculties: [{ name: 'memory', provider: 'mem0', apiKey: 'test-key-123' }],
    };
    const genTmp = path.join(MEM_TMP, 'gen-env-output');
    await fs.ensureDir(genTmp);
    const { skillDir } = await generate(persona, genTmp);

    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(personaOut.defaults.env.MEMORY_PROVIDER, 'mem0', 'MEMORY_PROVIDER must be set');
    assert.strictEqual(personaOut.defaults.env.MEMORY_API_KEY, 'test-key-123', 'MEMORY_API_KEY must be set');
  });

  // Cleanup
  it('cleanup memory test dir', () => {
    fs.removeSync(MEM_TMP);
  });
});

// ── Evolution Sources (formerly Channels) ───────────────────────────────────
describe('evolution channels', () => {
  const CH_TMP = path.join(require('os').tmpdir(), 'openpersona-test-channels-' + Date.now());

  it('injects evolution channels into Growth section of soul-injection', async () => {
    // Uses new evolution.sources field (canonical v0.17+)
    const persona = {
      personaName: 'ChannelAware',
      slug: 'channel-aware',
      bio: 'evolution channels tester',
      personality: 'adaptive',
      speakingStyle: 'Flexible',
      evolution: {
        enabled: true,
        sources: [
          { name: 'evomap', install: 'url:https://evomap.ai/skill.md', description: 'Shared evolution marketplace' },
        ],
      },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(soulInjection.includes('Evolution Sources'), 'should inject Evolution Sources heading');
    assert.ok(soulInjection.includes('evomap'), 'should mention evomap source by name');
    assert.ok(soulInjection.includes('standard evolution event pipeline'), 'should describe the pipeline');
  });

  it('injects dormant evolution channels into Capabilities section', async () => {
    const persona = {
      personaName: 'DormantChannel',
      slug: 'dormant-channel',
      bio: 'dormant channel tester',
      personality: 'patient',
      speakingStyle: 'Calm',
      evolution: {
        enabled: true,
        sources: [
          { name: 'evomap', install: 'url:https://evomap.ai/skill.md' },
        ],
      },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(soulInjection.includes('Dormant Evolution Sources'), 'should inject dormant sources in Capabilities');
    assert.ok(soulInjection.includes('evomap'), 'should mention evomap as dormant');
    assert.ok(soulInjection.includes('Capabilities'), 'should be under Capabilities heading');
  });

  it('includes soft-ref channels in Expected Capabilities of SKILL.md', async () => {
    const persona = {
      personaName: 'SkillChannel',
      slug: 'skill-channel',
      bio: 'expected capabilities tester',
      personality: 'thorough',
      speakingStyle: 'Detailed',
      evolution: {
        enabled: true,
        sources: [
          { name: 'evomap', install: 'url:https://evomap.ai/skill.md' },
        ],
      },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(skillMd.includes('Expected Capabilities'), 'should have Expected Capabilities section');
    assert.ok(skillMd.includes('Evolution Sources'), 'should have Evolution Sources subsection');
    assert.ok(skillMd.includes('evomap'), 'should list evomap source');
    assert.ok(skillMd.includes('url:https://evomap.ai/skill.md'), 'should show install source');
  });

  it('does not inject channels when none declared', async () => {
    const persona = {
      personaName: 'NoChannel',
      slug: 'no-channel',
      bio: 'no channels tester',
      personality: 'simple',
      speakingStyle: 'Plain',
      evolution: { enabled: true },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

    assert.ok(!soulInjection.includes('Evolution Sources'), 'should not inject sources section');
    assert.ok(!soulInjection.includes('Dormant Evolution Sources'), 'should not inject dormant sources');
    assert.ok(!skillMd.includes('Evolution Sources'), 'SKILL.md should not have sources section');
  });

  it('excludes evolution channel derived fields from persona.json', async () => {
    const persona = {
      personaName: 'CleanChannels',
      slug: 'clean-channels',
      bio: 'derived fields exclusion test',
      personality: 'tidy',
      speakingStyle: 'Neat',
      evolution: {
        enabled: true,
        sources: [
          { name: 'evomap', install: 'url:https://evomap.ai/skill.md' },
        ],
      },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const output = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));

    // New derived field names (renamed from channels → sources in v0.17.0)
    const forbidden = [
      'hasEvolutionSources', 'evolutionSourceNames',
      'hasSoftRefSources', 'softRefSourceNames', 'softRefSourceInstalls',
      // old channel names should also be absent
      'hasEvolutionChannels', 'evolutionChannelNames',
      'hasSoftRefChannels', 'softRefChannelNames', 'softRefChannelInstalls',
    ];
    for (const key of forbidden) {
      assert.ok(!(key in output), `persona.json must not contain derived field: ${key}`);
    }
    assert.ok(output.evolution?.instance?.sources, 'Original evolution.sources must be preserved (under evolution.instance)');
    assert.strictEqual(output.evolution.instance.sources[0].name, 'evomap', 'Source name must be preserved');
  });

  it('soft-ref channels trigger hasDormantCapabilities', async () => {
    const persona = {
      personaName: 'DormantFromChannel',
      slug: 'dormant-from-channel',
      bio: 'dormant capabilities via channels',
      personality: 'aware',
      speakingStyle: 'Alert',
      evolution: {
        enabled: true,
        channels: [
          { name: 'evomap', install: 'url:https://evomap.ai/skill.md' },
        ],
      },
      faculties: [],
    };
    await fs.ensureDir(CH_TMP);
    const { skillDir } = await generate(persona, CH_TMP);
    const soulInjection = fs.readFileSync(path.join(skillDir, 'soul', 'injection.md'), 'utf-8');

    assert.ok(soulInjection.includes('capabilities that may not all be active'), 'should trigger dormant capabilities section');
  });

  // Cleanup
  it('cleanup channels test dir', () => {
    fs.removeSync(CH_TMP);
  });
});

// ── Influence Boundary tests ──────────────────────────────────────────────
