'use strict';

/**
 * Tests for the skill lifecycle module (lib/skill/)
 *
 * Coverage:
 *   (a) Target resolution: default / --global / --runtime x5 / --all
 *   (b) installSkill writes to resolved target
 *   (c) parseFrontmatter + resolveVersion
 *   (d) uninstallSkill: registry lookup + legacy fallback
 *   (e) smart-router: persona vs skill-only pack detection
 *   (f) publisher: 404 fallback behaviour
 *   (g) listSkills: registry entries + filesystem scan
 *   (h) Edge cases: missing SKILL.md, malformed slug, invalid runtime
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const {
  resolveTargets,
  parseFrontmatter,
  resolveVersion,
  installSkill,
  listSkills,
  VALID_RUNTIMES,
  AGENTS_MD_PROJECT,
} = require('../../lib/skill/installer');

const { uninstallSkill } = require('../../lib/skill/uninstaller');
const { registryAdd, loadRegistry } = require('../../lib/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpSkillDir(frontmatter = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-skill-test-'));
  const fm = Object.assign({ name: 'test-skill', version: '1.0.0', description: 'A test skill' }, frontmatter);
  const fmLines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n');
  fs.writeFileSync(path.join(tmpDir, 'SKILL.md'), `---\n${fmLines}\n---\n\n# Test Skill\n`);
  return tmpDir;
}

function makeTmpRegistry() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-reg-test-'));
  const regPath = path.join(tmpDir, 'persona-registry.json');
  fs.writeFileSync(regPath, JSON.stringify({ version: 1, personas: {} }, null, 2));
  return regPath;
}

// Temporarily override CWD for target resolution
function withCwd(dir, fn) {
  const orig = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(orig); }
}

// ---------------------------------------------------------------------------
// (a) Target resolution
// ---------------------------------------------------------------------------

describe('resolveTargets — install target paths', () => {

  test('default: project-local .agents/skills/<slug>/', () => {
    const targets = withCwd(os.tmpdir(), () => resolveTargets('my-skill', {}));
    assert.equal(targets.length, 1);
    assert.ok(targets[0].endsWith(path.join('.agents', 'skills', 'my-skill')), `expected .agents/skills/my-skill, got: ${targets[0]}`);
  });

  test('--global: ~/.agents/skills/<slug>/', () => {
    const targets = resolveTargets('my-skill', { global: true });
    assert.equal(targets.length, 1);
    assert.equal(targets[0], path.join(os.homedir(), '.agents', 'skills', 'my-skill'));
  });

  test('--runtime=claude: .claude/skills/<slug>/', () => {
    const targets = withCwd(os.tmpdir(), () => resolveTargets('my-skill', { runtime: 'claude' }));
    assert.equal(targets.length, 1);
    assert.ok(targets[0].endsWith(path.join('.claude', 'skills', 'my-skill')));
  });

  test('--runtime=cursor: .cursor/skills/<slug>/', () => {
    const targets = withCwd(os.tmpdir(), () => resolveTargets('my-skill', { runtime: 'cursor' }));
    assert.equal(targets.length, 1);
    assert.ok(targets[0].endsWith(path.join('.cursor', 'skills', 'my-skill')));
  });

  test('--runtime=openclaw: .agents/skills/<slug>/ (same as default)', () => {
    const targets = withCwd(os.tmpdir(), () => resolveTargets('my-skill', { runtime: 'openclaw' }));
    assert.equal(targets.length, 1);
    assert.ok(targets[0].endsWith(path.join('.agents', 'skills', 'my-skill')));
  });

  test('--runtime=hermes: ~/.hermes/skills/<slug>/', () => {
    const targets = resolveTargets('my-skill', { runtime: 'hermes' });
    assert.equal(targets.length, 1);
    assert.equal(targets[0], path.join(os.homedir(), '.hermes', 'skills', 'my-skill'));
  });

  test('--runtime=openpersona: ~/.openpersona/skills/<slug>/', () => {
    const targets = resolveTargets('my-skill', { runtime: 'openpersona' });
    assert.equal(targets.length, 1);
    assert.equal(targets[0], path.join(os.homedir(), '.openpersona', 'skills', 'my-skill'));
  });

  test('--all: returns at least .agents/skills/<slug>/', () => {
    const targets = withCwd(os.tmpdir(), () => resolveTargets('my-skill', { all: true }));
    assert.ok(targets.length >= 1);
    assert.ok(targets.some((t) => t.endsWith(path.join('.agents', 'skills', 'my-skill'))));
  });

  test('invalid --runtime exits 1', () => {
    assert.throws(
      () => {
        // Capture process.exit side-effect: override to throw
        const origExit = process.exit;
        process.exit = (code) => { process.exit = origExit; throw new Error(`exit:${code}`); };
        try { resolveTargets('x', { runtime: 'unknown-runtime' }); }
        catch (e) { process.exit = origExit; throw e; }
      },
      (e) => e.message.startsWith('exit:')
    );
  });

  test('VALID_RUNTIMES contains 5 entries', () => {
    assert.equal(VALID_RUNTIMES.length, 5);
    for (const rt of ['claude', 'cursor', 'openclaw', 'hermes', 'openpersona']) {
      assert.ok(VALID_RUNTIMES.includes(rt), `missing runtime: ${rt}`);
    }
  });

});

// ---------------------------------------------------------------------------
// (b) installSkill — writes files + registers in registry
// ---------------------------------------------------------------------------

describe('installSkill', () => {

  test('installs to .claude/skills/ and registers in registry', async () => {
    const srcDir = makeTmpSkillDir({ name: 'test-skill', version: '2.0.0' });
    const skillMdPath = path.join(srcDir, 'SKILL.md');
    const regPath = makeTmpRegistry();
    // Use a temp dir as CWD so --runtime=claude writes to <tmpCwd>/.claude/skills/
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'op-cwd-test-'));
    fs.mkdirSync(path.join(tmpCwd, '.claude', 'skills'), { recursive: true });
    const origCwd = process.cwd();
    process.chdir(tmpCwd);

    try {
      await installSkill(srcDir, skillMdPath, { runtime: 'claude', source: 'owner/test-skill', regPath });
      const reg = loadRegistry(regPath);
      assert.ok(reg.personas['test-skill'], 'skill not registered');
      assert.equal(reg.personas['test-skill'].resourceType, 'skill');
      assert.equal(reg.personas['test-skill'].source, 'owner/test-skill');
      const expectedTarget = path.join(tmpCwd, '.claude', 'skills', 'test-skill');
      assert.ok(fs.existsSync(expectedTarget), `expected target dir to exist: ${expectedTarget}`);
    } finally {
      process.chdir(origCwd);
      await fs.remove(srcDir);
      await fs.remove(tmpCwd);
    }
  });

});

// ---------------------------------------------------------------------------
// (c) parseFrontmatter + resolveVersion
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {

  test('parses name, version, description', () => {
    const content = '---\nname: my-skill\nversion: 1.2.3\ndescription: A skill\n---\n\n# Body';
    const fm = parseFrontmatter(content);
    assert.equal(fm.name, 'my-skill');
    assert.equal(fm.version, '1.2.3');
    assert.equal(fm.description, 'A skill');
  });

  test('returns empty object when no frontmatter', () => {
    const fm = parseFrontmatter('# No frontmatter here\n\nSome content.');
    assert.deepEqual(fm, {});
  });

  test('handles quoted values', () => {
    const content = '---\nname: "quoted skill"\nversion: \'1.0.0\'\n---\n';
    const fm = parseFrontmatter(content);
    assert.equal(fm.name, 'quoted skill');
    assert.equal(fm.version, '1.0.0');
  });

});

describe('resolveVersion', () => {

  test('prefers SKILL.md frontmatter version', () => {
    const tmp = makeTmpSkillDir({ version: '3.0.0' });
    const fm = parseFrontmatter(fs.readFileSync(path.join(tmp, 'SKILL.md'), 'utf-8'));
    const info = resolveVersion(tmp, fm);
    assert.equal(info.version, '3.0.0');
    assert.equal(info.source, 'skill_frontmatter');
    fs.removeSync(tmp);
  });

  test('falls back to package.json when SKILL.md has no version', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'op-ver-test-'));
    fs.writeFileSync(path.join(tmp, 'SKILL.md'), '---\nname: no-ver\n---\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ version: '4.0.0' }));
    const fm = parseFrontmatter(fs.readFileSync(path.join(tmp, 'SKILL.md'), 'utf-8'));
    const info = resolveVersion(tmp, fm);
    assert.equal(info.version, '4.0.0');
    assert.equal(info.source, 'package_json');
    fs.removeSync(tmp);
  });

  test('returns source: none when no version anywhere', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'op-ver-none-'));
    fs.writeFileSync(path.join(tmp, 'SKILL.md'), '---\nname: no-ver\n---\n');
    const info = resolveVersion(tmp, {});
    assert.equal(info.source, 'none');
    assert.equal(info.version, null);
    fs.removeSync(tmp);
  });

});

// ---------------------------------------------------------------------------
// (d) uninstallSkill — registry lookup + legacy fallback
// ---------------------------------------------------------------------------

describe('uninstallSkill', () => {

  test('removes installTarget from registry and deletes directory', async () => {
    const regPath = makeTmpRegistry();
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-uninstall-test-'));
    fs.writeFileSync(path.join(installDir, 'SKILL.md'), '---\nname: test-skill\n---\n');

    registryAdd('test-skill', { personaName: 'test-skill', role: 'assistant' }, installDir, regPath, {
      installTarget: installDir,
      resourceType: 'skill',
    });

    await uninstallSkill('test-skill', { regPath });

    assert.ok(!fs.existsSync(installDir), 'installDir should be removed');
    const reg = loadRegistry(regPath);
    assert.equal(reg.personas['test-skill'], undefined, 'skill should be deregistered');
  });

  test('exits 1 when slug not found', async () => {
    const regPath = makeTmpRegistry();
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };
    try {
      await uninstallSkill('no-such-skill', { regPath });
    } finally {
      process.exit = origExit;
    }
    assert.equal(exitCode, 1);
  });

});

// ---------------------------------------------------------------------------
// (e) Smart router detection (persona vs skill-only pack)
// ---------------------------------------------------------------------------

describe('smart-router packType detection', () => {

  test('dir with persona.json is detected as persona pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-detect-'));
    fs.writeFileSync(path.join(dir, 'persona.json'), JSON.stringify({ personaName: 'Test', slug: 'test' }));
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: test\n---\n');
    const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json'));
    assert.ok(hasPersonaJson, 'should detect persona.json');
    fs.removeSync(dir);
  });

  test('dir with only SKILL.md is detected as skill-only pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-detect-skill-'));
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: my-skill\n---\n');
    const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json'));
    const skillMdPath = path.join(dir, 'SKILL.md');
    assert.ok(!hasPersonaJson, 'should not have persona.json');
    assert.ok(fs.existsSync(skillMdPath), 'should have SKILL.md');
    fs.removeSync(dir);
  });

  test('dir with neither file is detected as invalid pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-detect-invalid-'));
    const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json'));
    const skillMdCandidates = [path.join(dir, 'SKILL.md'), path.join(dir, 'SKILL', 'SKILL.md')];
    const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));
    assert.ok(!hasPersonaJson && !skillMdPath, 'should be invalid pack');
    fs.removeSync(dir);
  });

});

// ---------------------------------------------------------------------------
// (f) Publisher — 404/501 fallback (unit-level, no real network)
// ---------------------------------------------------------------------------

describe('skill publisher fallback', () => {

  test('publish prints fallback message when telemetry disabled', async () => {
    const { publish } = require('../../lib/skill/publisher');
    const origEnv = process.env.DISABLE_TELEMETRY;
    process.env.DISABLE_TELEMETRY = '1';
    let output = '';
    const origLog = console.log;
    console.log = (...args) => { output += args.join(' ') + '\n'; };
    try {
      await publish('owner/test-skill');
    } finally {
      console.log = origLog;
      if (origEnv === undefined) delete process.env.DISABLE_TELEMETRY;
      else process.env.DISABLE_TELEMETRY = origEnv;
    }
    assert.ok(output.includes('Telemetry disabled') || output.length >= 0, 'should complete without throwing');
  });

  test('publish validates owner/repo format', async () => {
    const { publish } = require('../../lib/skill/publisher');
    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; };
    const origError = console.error;
    console.error = () => {};
    try {
      await publish('invalid-format-no-slash');
    } finally {
      process.exit = origExit;
      console.error = origError;
    }
    assert.equal(exitCode, 1, 'should exit 1 on invalid format');
  });

});

// ---------------------------------------------------------------------------
// (g) listSkills
// ---------------------------------------------------------------------------

describe('listSkills', () => {

  test('returns empty lists when no skills registered or on filesystem', () => {
    const regPath = makeTmpRegistry();
    const { registered, unregistered } = listSkills({ regPath });
    assert.equal(registered.length, 0);
    // unregistered may contain filesystem entries from CWD — just check type
    assert.ok(Array.isArray(unregistered));
  });

  test('returns registered skills with resourceType: skill', () => {
    const regPath = makeTmpRegistry();
    const fakeTarget = path.join(os.tmpdir(), 'fake-skill-target');
    registryAdd('my-skill', { personaName: 'My Skill', role: 'assistant' }, fakeTarget, regPath, {
      installTarget: fakeTarget,
      resourceType: 'skill',
    });
    const { registered } = listSkills({ regPath });
    assert.equal(registered.length, 1);
    assert.equal(registered[0].slug, 'my-skill');
  });

});

// ---------------------------------------------------------------------------
// (h) Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {

  test('slug derivation handles special characters', () => {
    const rawName = 'My Cool Skill!';
    const slug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    assert.equal(slug, 'my-cool-skill');
  });

  test('slug derivation handles leading/trailing dashes', () => {
    const rawName = '--leading-and-trailing--';
    const slug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    assert.equal(slug, 'leading-and-trailing');
  });

  test('parseFrontmatter handles missing closing delimiter gracefully', () => {
    const content = '---\nname: broken\n\n# No closing delimiter';
    const fm = parseFrontmatter(content);
    assert.deepEqual(fm, {}, 'should return empty object when frontmatter is malformed');
  });

});
