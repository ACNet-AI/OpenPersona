/**
 * OpenPersona - Heartbeat sync tests
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { syncHeartbeat, installExternal, installAllExternal } = require('../lib/utils');

const TMP = path.join(require('os').tmpdir(), 'openpersona-heartbeat-test-' + Date.now());

describe('syncHeartbeat', () => {
  // v0.18+ canonical path: persona.json rhythm.heartbeat
  it('syncs heartbeat from persona.json rhythm.heartbeat (v0.18+ canonical)', async () => {
    const dir = path.join(TMP, 'test-canonical');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), JSON.stringify({
      personaName: 'Samantha',
      rhythm: {
        heartbeat: { enabled: true, strategy: 'smart', maxDaily: 5, quietHours: [0, 7], sources: ['workspace-digest'] },
        circadian: [{ hours: [22, 24, 0, 7], label: 'night', verbosity_delta: -1 }],
      },
    }));

    const config = {};
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, true);
    assert.strictEqual(result.heartbeat.strategy, 'smart');
    assert.strictEqual(result.heartbeat.maxDaily, 5);
    assert.strictEqual(config.heartbeat.enabled, true);
    assert.deepStrictEqual(config.heartbeat.quietHours, [0, 7]);
    await fs.remove(dir);
  });

  it('rhythm.heartbeat takes priority over flat heartbeat', async () => {
    const dir = path.join(TMP, 'test-priority');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), JSON.stringify({
      personaName: 'Priority',
      heartbeat: { enabled: true, strategy: 'rational', maxDaily: 3 },  // flat (P19 interim)
      rhythm: { heartbeat: { enabled: true, strategy: 'emotional', maxDaily: 8 } },  // canonical wins
    }));

    const config = {};
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.heartbeat.strategy, 'emotional', 'rhythm.heartbeat must win');
    assert.strictEqual(result.heartbeat.maxDaily, 8);
    await fs.remove(dir);
  });

  // Backward compat: flat persona.heartbeat (P19 interim path)
  it('accepts flat persona.heartbeat (P19 interim backward compat)', async () => {
    const dir = path.join(TMP, 'test-flat');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), JSON.stringify({
      personaName: 'Flat',
      heartbeat: { enabled: true, strategy: 'wellness', maxDaily: 4 },
    }));

    const config = {};
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, true);
    assert.strictEqual(result.heartbeat.strategy, 'wellness');
    await fs.remove(dir);
  });

  it('disables heartbeat when no heartbeat in persona.json', async () => {
    const dir = path.join(TMP, 'test-silent');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), JSON.stringify({ personaName: 'Silent', rhythm: { circadian: [] } }));

    const config = { heartbeat: { enabled: true, strategy: 'old-strategy' } };
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.heartbeat, null);
    assert.strictEqual(config.heartbeat.enabled, false);
    assert.strictEqual(config.heartbeat.strategy, undefined, 'old strategy must be cleared');
    await fs.remove(dir);
  });

  it('disables heartbeat when rhythm.heartbeat.enabled is false', async () => {
    const dir = path.join(TMP, 'test-disabled');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), JSON.stringify({
      personaName: 'Quiet',
      rhythm: { heartbeat: { enabled: false, strategy: 'smart' } },
    }));

    const config = {};
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(dir);
  });

  it('disables heartbeat when no persona.json exists', async () => {
    const dir = path.join(TMP, 'test-empty-dir');
    await fs.ensureDir(dir);

    const config = { heartbeat: { enabled: true, strategy: 'leftover' } };
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(dir);
  });

  it('handles malformed persona.json gracefully', async () => {
    const dir = path.join(TMP, 'test-malformed');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'persona.json'), '{ not valid json }}}');

    const config = {};
    const result = syncHeartbeat(config, dir);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(dir);
  });

  it('switches heartbeat correctly between personas', async () => {
    const dir1 = path.join(TMP, 'persona-one');
    await fs.ensureDir(dir1);
    await fs.writeFile(path.join(dir1, 'persona.json'), JSON.stringify({
      personaName: 'One',
      rhythm: { heartbeat: { enabled: true, strategy: 'emotional', maxDaily: 8 } },
    }));

    const dir2 = path.join(TMP, 'persona-two');
    await fs.ensureDir(dir2);
    await fs.writeFile(path.join(dir2, 'persona.json'), JSON.stringify({
      personaName: 'Two',
      rhythm: { heartbeat: { enabled: true, strategy: 'rational', maxDaily: 3 } },
    }));

    const config = {};

    syncHeartbeat(config, dir1);
    assert.strictEqual(config.heartbeat.strategy, 'emotional');

    syncHeartbeat(config, dir2);
    assert.strictEqual(config.heartbeat.strategy, 'rational');

    await fs.remove(dir1);
    await fs.remove(dir2);
  });
});

describe('installExternal', () => {
  it('returns null when entry has no install field', () => {
    assert.strictEqual(installExternal({ name: 'weather' }, 'skill'), null);
  });

  it('returns null when entry is null', () => {
    assert.strictEqual(installExternal(null, 'skill'), null);
  });

  it('returns null when install has invalid package name', () => {
    assert.strictEqual(installExternal({ name: 'bad', install: 'clawhub:' }, 'skill'), null);
  });

  it('returns hint object for unknown source (no execution, just display)', () => {
    // Unknown source — still returns a hint for display; installAllExternal prints it as a comment
    const hint = installExternal({ name: 'x', install: 'unknown:pkg' }, 'skill');
    assert.ok(hint !== null, 'should return a hint object even for unknown source');
    assert.strictEqual(hint.source, 'unknown');
    assert.strictEqual(hint.pkg, 'pkg');
  });

  it('returns hint object for valid clawhub entry', () => {
    const hint = installExternal({ name: 'deep-research', install: 'clawhub:deep-research' }, 'skill');
    assert.ok(hint !== null, 'should return a hint object');
    assert.strictEqual(hint.pkg, 'deep-research');
    assert.strictEqual(hint.source, 'clawhub');
  });
});

describe('installAllExternal', () => {
  it('handles empty persona gracefully', () => {
    // Should not throw on empty/missing layers
    assert.doesNotThrow(() => installAllExternal({}));
    assert.doesNotThrow(() => installAllExternal({ faculties: [], skills: [] }));
    assert.doesNotThrow(() => installAllExternal({ body: null, faculties: [], skills: [] }));
  });

  it('skips entries without install field', () => {
    // Should not throw — entries without install are just declarations
    assert.doesNotThrow(() => installAllExternal({
      body: null,
      faculties: [{ name: 'voice' }],
      skills: [{ name: 'weather', description: 'Weather' }],
    }));
  });

  it('processes body object form', () => {
    // Body as string or null should be skipped without error
    assert.doesNotThrow(() => installAllExternal({ body: 'humanoid', faculties: [], skills: [] }));
    assert.doesNotThrow(() => installAllExternal({ body: null, faculties: [], skills: [] }));
    // Body as object without install — should not throw
    assert.doesNotThrow(() => installAllExternal({ body: { name: 'avatar' }, faculties: [], skills: [] }));
  });

  it('processes soul object form', () => {
    // Soul as string should be skipped without error
    assert.doesNotThrow(() => installAllExternal({ soul: './persona.json', faculties: [], skills: [] }));
    // Soul as object without install — should not throw
    assert.doesNotThrow(() => installAllExternal({ soul: { ref: './persona.json' }, faculties: [], skills: [] }));
  });
});
