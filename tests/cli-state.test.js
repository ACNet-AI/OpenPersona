/**
 * OpenPersona - CLI `openpersona state` integration tests
 *
 * Tests the runner integration protocol:
 *   openpersona state read <slug>
 *   openpersona state write <slug> <patch>
 *   openpersona state signal <slug> <type> [payload]
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');
const { generate } = require('../lib/generator');
const { registryAdd } = require('../lib/utils');

const CLI = path.resolve(__dirname, '../bin/cli.js');

// Spawn the CLI and return { stdout, stderr, status }
function cli(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

describe('openpersona state commands', () => {
  let TMP_DIR;
  let skillDir;
  let openclawHome;
  let registryPath;
  const SLUG = 'cli-state-test';

  before(async () => {
    TMP_DIR = path.join(os.tmpdir(), 'openpersona-cli-state-' + Date.now());
    openclawHome = path.join(TMP_DIR, 'openpersona');
    registryPath = path.join(openclawHome, 'persona-registry.json');
    await fs.ensureDir(openclawHome);

    // Generate a persona with evolution enabled
    const persona = {
      personaName: 'CliStateTest',
      slug: SLUG,
      bio: 'CLI state integration tester',
      personality: 'methodical',
      speakingStyle: 'Precise',
      evolution: { enabled: true },
    };
    const result = await generate(persona, TMP_DIR);
    skillDir = result.skillDir;

    // Register it in a temp registry so CLI can find it by slug
    registryAdd(SLUG, persona, skillDir, registryPath);
  });

  after(async () => {
    await fs.remove(TMP_DIR);
  });

  // Shared env that points CLI at our isolated persona home
  function env() {
    return { OPENPERSONA_HOME: openclawHome };
  }

  it('state read returns valid JSON with exists:true', () => {
    const result = cli(['state', 'read', SLUG], env());
    assert.strictEqual(result.status, 0, `CLI exited with non-zero: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.strictEqual(out.exists, true, 'exists should be true for evolution-enabled persona');
    assert.strictEqual(out.slug, SLUG, 'slug must match');
    assert.ok(out.mood && typeof out.mood === 'object', 'mood must be an object');
    assert.ok('relationship' in out, 'relationship must be present');
    assert.ok('evolvedTraits' in out, 'evolvedTraits must be present');
  });

  it('state write persists changes and state read reflects them', () => {
    const patch = JSON.stringify({
      mood: { current: 'focused', intensity: 0.8 },
      relationship: { interactionCount: 5 },
      eventLog: [{ type: 'milestone', trigger: 'CLI integration test', delta: 'mood set to focused', source: 'test' }],
    });

    const writeResult = cli(['state', 'write', SLUG, patch], env());
    assert.strictEqual(writeResult.status, 0, `write failed: ${writeResult.stderr}`);
    const writeOut = JSON.parse(writeResult.stdout);
    assert.strictEqual(writeOut.success, true, 'write must return success:true');

    // Verify read reflects the change
    const readResult = cli(['state', 'read', SLUG], env());
    assert.strictEqual(readResult.status, 0, `read after write failed: ${readResult.stderr}`);
    const readOut = JSON.parse(readResult.stdout);
    assert.strictEqual(readOut.mood.current, 'focused', 'mood.current must be updated');
    assert.strictEqual(readOut.mood.intensity, 0.8, 'mood.intensity must be updated');
    // Deep-merge: other mood fields must be preserved
    assert.ok('baseline' in readOut.mood, 'mood.baseline must survive deep-merge');
    assert.strictEqual(readOut.relationship.interactionCount, 5, 'interactionCount must be updated');
    assert.ok(
      readOut.recentEvents.some((e) => e.type === 'milestone'),
      'event must appear in recentEvents'
    );
  });

  it('state write rejects non-object patch', () => {
    const result = cli(['state', 'write', SLUG, 'null'], env());
    assert.notStrictEqual(result.status, 0, 'write with null patch must fail');
    assert.ok(result.stderr.includes('must be a JSON object'), 'error must mention object requirement');
  });

  it('state write protects immutable fields', () => {
    const patch = JSON.stringify({ personaSlug: 'hacked', version: '99.0' });
    const writeResult = cli(['state', 'write', SLUG, patch], env());
    assert.strictEqual(writeResult.status, 0, 'write must succeed even with immutable field attempt');

    const statePath = path.join(skillDir, 'soul', 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.strictEqual(state.personaSlug, SLUG, 'personaSlug must not be overwritten');
    assert.strictEqual(state.version, '1.0.0', 'version must not be overwritten');
  });

  it('state signal emits successfully and returns JSON', () => {
    const payload = JSON.stringify({ need: 'web_search', reason: 'integration test', priority: 'high' });

    const result = cli(['state', 'signal', SLUG, 'capability_gap', payload], env());
    assert.strictEqual(result.status, 0, `signal failed: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.strictEqual(out.success, true, 'signal must return success:true');
    assert.strictEqual(out.signal.type, 'capability_gap', 'signal type must match');
    assert.strictEqual(out.signal.slug, SLUG, 'signal slug must match persona');
    assert.strictEqual(out.response, null, 'response must be null when no host has responded');
  });

  it('state signal rejects invalid type', () => {
    const result = cli(['state', 'signal', SLUG, 'invalid_type'], env());
    assert.notStrictEqual(result.status, 0, 'invalid signal type must fail');
    assert.ok(result.stderr.includes('Invalid signal type'), 'error must mention invalid type');
  });

  it('state read returns exists:false for persona without evolution', async () => {
    const noEvoSlug = 'cli-no-evo-test';
    const noEvoPersona = {
      personaName: 'NoEvoTest',
      slug: noEvoSlug,
      bio: 'no evolution',
      personality: 'calm',
      speakingStyle: 'Simple',
    };
    const noEvoDir = path.join(TMP_DIR, `persona-${noEvoSlug}`);
    await fs.ensureDir(noEvoDir);
    const { skillDir: noEvoSkillDir } = await generate(noEvoPersona, TMP_DIR);
    registryAdd(noEvoSlug, noEvoPersona, noEvoSkillDir, registryPath);

    const result = cli(['state', 'read', noEvoSlug], env());
    assert.strictEqual(result.status, 0, `read failed: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.strictEqual(out.exists, false, 'exists must be false for persona without evolution');
  });

  it('state read fails gracefully for unknown slug', () => {
    const result = cli(['state', 'read', 'nonexistent-persona-xyz'], env());
    assert.notStrictEqual(result.status, 0, 'unknown slug must fail');
    assert.ok(result.stderr.includes('not found'), 'error must mention persona not found');
  });

  it('state write without patch argument shows usage error', () => {
    // Commander will show error when required argument is missing
    const result = cli(['state', 'write', SLUG], env());
    assert.notStrictEqual(result.status, 0, 'missing patch argument must fail');
  });

  it('state read exposes pendingCommands array', () => {
    const result = cli(['state', 'read', SLUG], env());
    assert.strictEqual(result.status, 0, `read failed: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.ok(Array.isArray(out.pendingCommands), 'pendingCommands must be an array in read output');
  });
});

describe('openpersona update command — state preservation', () => {
  let TMP_DIR;
  let fakeOpHome;
  let fakeInstallDir;
  const SLUG = 'cli-update-preserve-test';

  before(async () => {
    TMP_DIR = path.join(os.tmpdir(), 'openpersona-update-test-' + Date.now());
    fakeOpHome = path.join(TMP_DIR, 'openpersona');
    const fakeSkillsDir = path.join(fakeOpHome, 'personas');
    fakeInstallDir = path.join(fakeSkillsDir, `persona-${SLUG}`);
    await fs.ensureDir(fakeSkillsDir);

    // Generate persona into a staging dir, then move to fake OP_SKILLS_DIR
    const stagingDir = path.join(TMP_DIR, 'staging');
    const persona = {
      personaName: 'UpdatePreserveTest',
      slug: SLUG,
      bio: 'tests that update preserves evolution state',
      personality: 'persistent',
      speakingStyle: 'Direct',
      evolution: { enabled: true },
    };
    const { skillDir } = await generate(persona, stagingDir);
    await fs.move(skillDir, fakeInstallDir);
    await fs.remove(stagingDir);

    // Inject meaningful evolution state before update
    const statePath = path.join(fakeInstallDir, 'soul', 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    state.mood.current = 'nostalgic';
    state.relationship.interactionCount = 42;
    state.eventLog = [{ type: 'milestone', trigger: 'test event', delta: 'interaction 42', source: 'test', timestamp: new Date().toISOString() }];
    state.pendingCommands = [{ type: 'system_message', payload: { text: 'hello from host' }, source: 'host' }];
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));

    // Write a self-narrative entry
    const narrativePath = path.join(fakeInstallDir, 'soul', 'self-narrative.md');
    await fs.writeFile(narrativePath, '### 2026-01-01\nA preserved test narrative.\n');
  });

  after(async () => {
    await fs.remove(TMP_DIR);
  });

  it('update preserves soul/state.json evolution data', async () => {
    const updateResult = spawnSync(process.execPath, [CLI, 'update', SLUG], {
      encoding: 'utf-8',
      env: { ...process.env, OPENPERSONA_HOME: fakeOpHome },
    });
    assert.strictEqual(updateResult.status, 0, `update failed:\n${updateResult.stderr}`);

    const statePath = path.join(fakeInstallDir, 'soul', 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    assert.strictEqual(state.mood.current, 'nostalgic', 'mood.current must be preserved after update');
    assert.strictEqual(state.relationship.interactionCount, 42, 'interactionCount must be preserved after update');
    assert.ok(Array.isArray(state.eventLog) && state.eventLog.length === 1, 'eventLog must be preserved after update');
    assert.ok(
      Array.isArray(state.pendingCommands) && state.pendingCommands.length === 1,
      'pendingCommands must be preserved after update'
    );
  });

  it('update preserves soul/self-narrative.md', async () => {
    const narrativePath = path.join(fakeInstallDir, 'soul', 'self-narrative.md');
    const content = await fs.readFile(narrativePath, 'utf-8');
    assert.ok(content.includes('preserved test narrative'), 'self-narrative.md must survive update');
  });
});
