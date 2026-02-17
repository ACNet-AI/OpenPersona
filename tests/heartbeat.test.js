/**
 * OpenPersona - Heartbeat sync tests
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { syncHeartbeat } = require('../lib/utils');

const TMP = path.join(require('os').tmpdir(), 'openpersona-heartbeat-test-' + Date.now());

describe('syncHeartbeat', () => {
  it('syncs heartbeat when manifest has enabled heartbeat', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      name: 'samantha',
      heartbeat: {
        enabled: true,
        strategy: 'smart',
        maxDaily: 5,
        quietHours: [0, 7],
        sources: ['workspace-digest', 'context-aware'],
      },
    }));

    const config = {};
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, true);
    assert.strictEqual(result.heartbeat.strategy, 'smart');
    assert.strictEqual(result.heartbeat.maxDaily, 5);
    assert.strictEqual(config.heartbeat.enabled, true);
    assert.strictEqual(config.heartbeat.strategy, 'smart');
    assert.deepStrictEqual(config.heartbeat.quietHours, [0, 7]);
    await fs.remove(TMP);
  });

  it('disables heartbeat when manifest has no heartbeat block', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      name: 'life-assistant',
      layers: { soul: './persona.json' },
    }));

    const config = { heartbeat: { enabled: true, strategy: 'old-strategy' } };
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.heartbeat, null);
    assert.strictEqual(config.heartbeat.enabled, false);
    assert.strictEqual(config.heartbeat.strategy, undefined, 'old strategy must be cleared');
    await fs.remove(TMP);
  });

  it('disables heartbeat when manifest heartbeat.enabled is false', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({
      name: 'silent',
      heartbeat: { enabled: false, strategy: 'none' },
    }));

    const config = {};
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(result.heartbeat, null);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(TMP);
  });

  it('disables heartbeat when manifest.json does not exist', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'nonexistent-manifest.json');

    const config = { heartbeat: { enabled: true, strategy: 'leftover' } };
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(TMP);
  });

  it('handles malformed manifest.json gracefully', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'manifest.json');
    await fs.writeFile(manifestPath, '{ this is not valid json }}}');

    const config = {};
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, false);
    assert.strictEqual(config.heartbeat.enabled, false);
    await fs.remove(TMP);
  });

  it('falls back to persona.json when manifest has no heartbeat', async () => {
    await fs.ensureDir(TMP);
    // manifest.json exists but has no heartbeat
    const manifestPath = path.join(TMP, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify({ name: 'fallback-test' }));
    // persona.json in same directory has heartbeat
    const personaPath = path.join(TMP, 'persona.json');
    await fs.writeFile(personaPath, JSON.stringify({
      personaName: 'FallbackTest',
      heartbeat: { enabled: true, strategy: 'fallback', maxDaily: 2 },
    }));

    const config = {};
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, true);
    assert.strictEqual(result.heartbeat.strategy, 'fallback');
    assert.strictEqual(config.heartbeat.maxDaily, 2);
    await fs.remove(TMP);
  });

  it('falls back to persona.json when manifest.json does not exist', async () => {
    await fs.ensureDir(TMP);
    const manifestPath = path.join(TMP, 'manifest.json');
    // No manifest.json — only persona.json
    const personaPath = path.join(TMP, 'persona.json');
    await fs.writeFile(personaPath, JSON.stringify({
      personaName: 'NoManifest',
      heartbeat: { enabled: true, strategy: 'persona-only', maxDaily: 1 },
    }));

    const config = {};
    const result = syncHeartbeat(config, manifestPath);

    assert.strictEqual(result.synced, true);
    assert.strictEqual(result.heartbeat.strategy, 'persona-only');
    await fs.remove(TMP);
  });

  it('switches heartbeat correctly between personas', async () => {
    await fs.ensureDir(TMP);

    // First persona: emotional heartbeat
    const manifest1 = path.join(TMP, 'manifest1.json');
    await fs.writeFile(manifest1, JSON.stringify({
      heartbeat: { enabled: true, strategy: 'emotional', maxDaily: 8 },
    }));

    // Second persona: rational heartbeat
    const manifest2 = path.join(TMP, 'manifest2.json');
    await fs.writeFile(manifest2, JSON.stringify({
      heartbeat: { enabled: true, strategy: 'rational', maxDaily: 3 },
    }));

    const config = {};

    // Switch to persona 1
    syncHeartbeat(config, manifest1);
    assert.strictEqual(config.heartbeat.strategy, 'emotional');
    assert.strictEqual(config.heartbeat.maxDaily, 8);

    // Switch to persona 2
    syncHeartbeat(config, manifest2);
    assert.strictEqual(config.heartbeat.strategy, 'rational');
    assert.strictEqual(config.heartbeat.maxDaily, 3);

    await fs.remove(TMP);
  });
});
