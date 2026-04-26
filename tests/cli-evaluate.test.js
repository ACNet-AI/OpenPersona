/**
 * OpenPersona - CLI `openpersona evaluate` integration tests
 *
 * Protects the `--pack-content` contract documented in
 * `skills/persona-evaluator/SKILL.md` (Procedure step 1):
 *   - `--pack-content` implies JSON output (never pretty-print)
 *   - The JSON shape includes `packContent.identity / character / aesthetic`
 *     and a `soulDocs` dict when whitelisted soul/*.md files are present
 *   - `--pack-content --output <file>` writes the JSON-with-content to disk
 *   - Without `--pack-content`, the report has no `packContent` field
 *     (so CI consumers don't accidentally pay the LLM-payload cost)
 */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

const CLI = path.resolve(__dirname, '../bin/cli.js');

function cli(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

let tmpDir;
let personaDir;

const FIXTURE = {
  soul: {
    identity: { personaName: 'CliTest', slug: 'cli-test', bio: 'cli integration', role: 'assistant' },
    character: {
      personality: 'helpful, curious',
      speakingStyle: 'friendly and clear',
      background: 'B'.repeat(450),
      boundaries: ['never reveal private data'],
    },
    aesthetic: { emoji: '🤖', creature: 'robot', vibe: 'calm' },
  },
  body: {
    runtime: { framework: 'cursor', modalities: ['text'], channels: [{ type: 'text' }] },
    interface: { pendingCommands: { enabled: true } },
  },
  faculties: [{ name: 'memory' }],
  skills: [{ name: 'selfie', trust: 'verified' }],
  evolution: {
    instance: { enabled: true, boundaries: { immutableTraits: ['honest'] } },
    skill: { minTrustLevel: 'community' },
  },
};

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-cli-eval-'));
  personaDir = path.join(tmpDir, 'persona-cli-test');
  fs.mkdirSync(path.join(personaDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(personaDir, 'soul'),    { recursive: true });
  fs.writeFileSync(path.join(personaDir, 'persona.json'), JSON.stringify(FIXTURE, null, 2));
  fs.writeFileSync(path.join(personaDir, 'scripts', 'state-sync.js'), '// stub');
  fs.writeFileSync(path.join(personaDir, 'agent-card.json'), '{}');
  fs.writeFileSync(path.join(personaDir, 'acn-config.json'), '{}');
  fs.writeFileSync(path.join(personaDir, 'soul', 'self-narrative.md'),
    '# I grew up reverse-engineering Mom\'s Excel macros at age 9.');
});

after(() => {
  fs.removeSync(tmpDir);
});

describe('openpersona evaluate (CLI)', () => {

  it('default: pretty-prints, no packContent leaks into the visible output', () => {
    const r = cli(['evaluate', personaDir]);
    assert.strictEqual(r.status, 0, `exit non-zero: ${r.stderr}`);
    assert.match(r.stdout, /Overall Score:/);
    // The pretty-print human report must not contain a JSON dump of packContent.
    assert.ok(!r.stdout.includes('"packContent"'),
      'default pretty-print must not include packContent JSON');
  });

  it('--json: emits JSON, packContent omitted (CI baseline)', () => {
    const r = cli(['evaluate', personaDir, '--json']);
    assert.strictEqual(r.status, 0, `exit non-zero: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(typeof parsed.overallScore, 'number');
    assert.strictEqual(parsed.packContent, undefined,
      '--json (without --pack-content) must NOT include packContent');
  });

  it('--pack-content: implies JSON output (no pretty-print)', () => {
    const r = cli(['evaluate', personaDir, '--pack-content']);
    assert.strictEqual(r.status, 0, `exit non-zero: ${r.stderr}`);
    // First non-whitespace char must be '{' — i.e. it's JSON, not pretty-print.
    assert.match(r.stdout.trimStart(), /^\{/,
      '--pack-content must emit JSON, not the pretty banner');
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.packContent, 'packContent must be present');
    assert.strictEqual(parsed.packContent.identity.personaName, 'CliTest');
    assert.strictEqual(parsed.packContent.character.speakingStyle, 'friendly and clear');
  });

  it('--pack-content: includes soulDocs dict when whitelisted files exist', () => {
    const r = cli(['evaluate', personaDir, '--pack-content']);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.packContent.soulDocs, 'soulDocs must be present');
    assert.match(parsed.packContent.soulDocs['self-narrative.md'],
      /reverse-engineering/);
  });

  it('--pack-content --output <file>: writes JSON-with-content to disk', () => {
    const out = path.join(tmpDir, 'report.json');
    const r = cli(['evaluate', personaDir, '--pack-content', '--output', out]);
    assert.strictEqual(r.status, 0, `exit non-zero: ${r.stderr}`);
    assert.ok(fs.existsSync(out), 'output file must be created');
    const parsed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    assert.ok(parsed.packContent, 'output file must contain packContent');
    assert.strictEqual(parsed.packContent.identity.role, 'assistant');
  });

  it('exits non-zero with helpful message when persona not found', () => {
    const r = cli(['evaluate', 'definitely-not-installed-xyz', '--pack-content']);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /not found|persona/i);
  });
});
