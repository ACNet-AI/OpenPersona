'use strict';
/**
 * OpenPersona - Social Inbox tests (Phase C)
 *
 * Tests for lib/social/inbox.js (unit — no real network, no real state-sync).
 *  1.  pollInbox throws when persona not installed
 *  2.  pollInbox throws when acn-registration.json is missing
 *  3.  pollInbox returns injected=0 when ACN inbox is empty
 *  4.  pollInbox injects messages into pendingCommands (ack=true, default)
 *  5.  pollInbox sends ack=true query param to ACN
 *  6.  pollInbox does NOT send ack param when ack=false
 *  7.  pollInbox blocks messages below minIncomingTrust (Trust Gate)
 *  8.  pollInbox allows messages above or equal to minIncomingTrust
 *  9.  pollInbox accepts all when minIncomingTrust not configured (explicit)
 * 10.  pollInbox uses cursor deduplication in no-ack mode
 * 11.  pollInbox dry-run does not write state or cursor
 * 12.  getTrustLevel returns contact trust if found, unverified otherwise
 * 13.  meetsMinTrust returns correct boolean for each pairing
 * 14.  getMessageHistory passes ack=true as query param
 * 15.  getMessageHistory omits ack param when not set
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');
const http = require('http');

const { getTrustLevel, meetsMinTrust } = require('../lib/social/inbox');
const { getMessageHistory } = require('../lib/social/acn-client');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePersonaDir(base, opts = {}) {
  const {
    hasReg = true,
    minTrust = null,
    contacts = [],
  } = opts;

  fs.mkdirSync(path.join(base, 'social'), { recursive: true });
  fs.mkdirSync(path.join(base, 'scripts'), { recursive: true });

  const persona = { slug: 'test-persona', social: { contacts: {} } };
  if (minTrust) persona.social.contacts.minIncomingTrust = minTrust;
  fs.writeFileSync(path.join(base, 'persona.json'), JSON.stringify(persona));

  fs.writeFileSync(
    path.join(base, 'social', 'contacts.json'),
    JSON.stringify({ schemaVersion: '1.0.0', personaSlug: 'test-persona', contacts })
  );

  if (hasReg) {
    fs.writeFileSync(
      path.join(base, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent-uuid', apiKey: 'my-api-key' })
    );
  }

  // Minimal state-sync stub: write command appends to captured list
  fs.writeFileSync(
    path.join(base, 'scripts', 'state-sync.js'),
    `const fs = require('fs');
const arg = process.argv[2];
if (arg === 'write') {
  const patch = JSON.parse(process.argv[3]);
  const out = process.env.CAPTURE_FILE;
  if (out) fs.appendFileSync(out, JSON.stringify(patch) + '\\n');
}`
  );
}

async function startAcnServer(messages, opts = {}) {
  const { statusCode = 200 } = opts;
  let capturedUrl = null;
  const server = http.createServer((req, res) => {
    capturedUrl = req.url;
    if (statusCode !== 200) { res.writeHead(statusCode); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agent_id: 'my-agent-uuid', messages, count: messages.length }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, getUrl: () => capturedUrl };
}

// ---------------------------------------------------------------------------
// Unit tests — getTrustLevel, meetsMinTrust
// ---------------------------------------------------------------------------

describe('social inbox helpers', () => {
  it('getTrustLevel returns contact trust when found', () => {
    const contacts = [{ acn_agent_id: 'alice', trust_level: 'community' }];
    assert.equal(getTrustLevel('alice', contacts), 'community');
  });

  it('getTrustLevel returns unverified when not found', () => {
    assert.equal(getTrustLevel('unknown', []), 'unverified');
  });

  it('meetsMinTrust: unverified meets unverified', () => {
    assert.equal(meetsMinTrust('unverified', 'unverified'), true);
  });

  it('meetsMinTrust: community meets unverified', () => {
    assert.equal(meetsMinTrust('community', 'unverified'), true);
  });

  it('meetsMinTrust: unverified does NOT meet community', () => {
    assert.equal(meetsMinTrust('unverified', 'community'), false);
  });

  it('meetsMinTrust: verified meets community', () => {
    assert.equal(meetsMinTrust('verified', 'community'), true);
  });

  it('meetsMinTrust: community does NOT meet verified', () => {
    assert.equal(meetsMinTrust('community', 'verified'), false);
  });
});

// ---------------------------------------------------------------------------
// getMessageHistory — ack param
// ---------------------------------------------------------------------------

describe('getMessageHistory ack param', () => {
  it('sends ack=true as query param when opts.ack is true', async () => {
    const { server, port, getUrl } = await startAcnServer([]);
    await getMessageHistory(`http://127.0.0.1:${port}`, 'agent-x', 'key', { ack: true });
    server.close();
    assert.ok(getUrl().includes('ack=true'), `Expected ack=true in URL, got: ${getUrl()}`);
  });

  it('omits ack param when opts.ack is falsy', async () => {
    const { server, port, getUrl } = await startAcnServer([]);
    await getMessageHistory(`http://127.0.0.1:${port}`, 'agent-x', 'key', { ack: false });
    server.close();
    assert.ok(!getUrl().includes('ack'), `Expected no ack in URL, got: ${getUrl()}`);
  });
});

// ---------------------------------------------------------------------------
// pollInbox — integration-style (real HTTP server, stubbed state-sync)
// ---------------------------------------------------------------------------

describe('social inbox pollInbox', () => {
  let tmpDir;
  let captureFile;

  // Override registry lookup to point to our tmpDir
  const runner = require('../lib/state/runner');
  const origResolve = runner.resolvePersonaDir;
  const origRunState = runner.runStateSyncCommand;
  let personaDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-inbox-'));
    captureFile = path.join(tmpDir, 'captured.jsonl');
    personaDir = path.join(tmpDir, 'persona');
    fs.mkdirSync(personaDir, { recursive: true });

    // Monkey-patch runner for the duration of tests
    runner.resolvePersonaDir = (slug) => (slug === 'test-persona' ? personaDir : origResolve(slug));
    runner.runStateSyncCommand = (slug, args) => {
      if (args[0] === 'write') {
        fs.appendFileSync(captureFile, args[1] + '\n');
      }
    };
  });

  after(async () => {
    runner.resolvePersonaDir = origResolve;
    runner.runStateSyncCommand = origRunState;
    await fs.remove(tmpDir);
  });

  it('throws when persona is not installed', async () => {
    const orig = runner.resolvePersonaDir;
    runner.resolvePersonaDir = () => null;
    try {
      const { pollInbox } = require('../lib/social/inbox');
      await assert.rejects(() => pollInbox('ghost-persona'), /not installed/);
    } finally {
      runner.resolvePersonaDir = orig;
    }
  });

  it('throws when acn-registration.json is missing', async () => {
    makePersonaDir(personaDir, { hasReg: false });
    const { pollInbox } = require('../lib/social/inbox');
    await assert.rejects(() => pollInbox('test-persona'), /No ACN registration/);
  });

  it('returns injected=0 when ACN inbox is empty', async () => {
    makePersonaDir(personaDir);
    const { server, port } = await startAcnServer([]);
    // Override acn-registration to point to test server
    fs.writeFileSync(
      path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key', acn_gateway: `http://127.0.0.1:${port}` })
    );
    fs.writeFileSync(
      path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` })
    );

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true, dryRun: true });
    server.close();

    assert.equal(result.injected, 0);
    assert.equal(result.received, 0);
  });

  it('injects messages into pendingCommands (ack=true)', async () => {
    makePersonaDir(personaDir, {
      contacts: [{ acn_agent_id: 'alice-uuid', name: 'Alice', trust_level: 'community' }],
    });
    const fakeMessages = [
      { route_id: 'r1', from_agent: 'alice-uuid', to_agent: 'my-agent', timestamp: '2026-04-22T10:00:00Z',
        message: { type: 'greeting', text: 'hello from alice' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(
      path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` })
    );
    fs.writeFileSync(
      path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' })
    );
    await fs.remove(captureFile).catch(() => {});

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true });
    server.close();

    assert.equal(result.injected, 1);
    assert.equal(result.filtered, 0);

    // Check captured pendingCommands
    const lines = fs.readFileSync(captureFile, 'utf-8').trim().split('\n');
    const patch = JSON.parse(lines[lines.length - 1]);
    const cmd = patch.pendingCommands[0];
    assert.equal(cmd.type, 'a2a_message');
    assert.equal(cmd.source, 'acn_inbox');
    assert.equal(cmd.payload.from_agent, 'alice-uuid');
    assert.equal(cmd.payload.from_name, 'Alice');
    assert.equal(cmd.payload.trust_level, 'community');
    assert.equal(cmd.payload.route_id, 'r1');
    assert.equal(cmd.payload.message.text, 'hello from alice');
  });

  it('blocks messages below minIncomingTrust (Trust Gate)', async () => {
    makePersonaDir(personaDir, { minTrust: 'community' });
    const fakeMessages = [
      { route_id: 'r2', from_agent: 'unknown-uuid', to_agent: 'my-agent',
        timestamp: '2026-04-22T10:00:00Z', message: { text: 'spam' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` }));
    fs.writeFileSync(path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' }));

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true });
    server.close();

    assert.equal(result.injected, 0);
    assert.equal(result.filtered, 1); // blocked by Trust Gate
  });

  it('allows messages at or above minIncomingTrust', async () => {
    makePersonaDir(personaDir, {
      minTrust: 'community',
      contacts: [{ acn_agent_id: 'verified-uuid', name: 'Bob', trust_level: 'verified' }],
    });
    const fakeMessages = [
      { route_id: 'r3', from_agent: 'verified-uuid', to_agent: 'my-agent',
        timestamp: '2026-04-22T11:00:00Z', message: { text: 'legit message' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` }));
    fs.writeFileSync(path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' }));

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true });
    server.close();

    assert.equal(result.injected, 1);
    assert.equal(result.filtered, 0);
  });

  it('uses cursor deduplication in no-ack mode', async () => {
    makePersonaDir(personaDir);
    // Write a cursor that marks r4 as already seen
    const cursorPath = path.join(personaDir, 'social', '.poller-cursor.json');
    fs.writeFileSync(cursorPath, JSON.stringify({
      lastTimestamp: '2026-04-22T10:00:00Z',
      seenRouteIds: ['r4'],
      updatedAt: '2026-04-22T09:00:00Z',
    }));

    const fakeMessages = [
      // r4: same timestamp, already seen → should be deduplicated
      { route_id: 'r4', from_agent: 'alice', to_agent: 'my-agent',
        timestamp: '2026-04-22T10:00:00Z', message: { text: 'old' } },
      // r5: older → should be skipped
      { route_id: 'r5', from_agent: 'alice', to_agent: 'my-agent',
        timestamp: '2026-04-22T09:00:00Z', message: { text: 'older' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` }));
    fs.writeFileSync(path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' }));

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: false, dryRun: true });
    server.close();

    // Both messages should be filtered by cursor
    assert.equal(result.injected, 0);
  });

  it('accepts all messages when minIncomingTrust is not configured', async () => {
    // No minTrust → no Trust Gate → all messages accepted regardless of trust_level
    makePersonaDir(personaDir); // no minTrust, no contacts (sender will be 'unverified')
    const fakeMessages = [
      { route_id: 'r-open', from_agent: 'stranger-uuid', to_agent: 'my-agent',
        timestamp: '2026-04-22T13:00:00Z', message: { text: 'open door' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` }));
    fs.writeFileSync(path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' }));

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true, dryRun: true });
    server.close();

    assert.equal(result.injected, 1, 'message from unknown sender must be accepted when no minTrust');
    assert.equal(result.filtered, 0);
    assert.equal(result.messages[0].payload.trust_level, 'unverified');
  });

  it('dry-run does not write to state or update cursor', async () => {
    makePersonaDir(personaDir, {
      contacts: [{ acn_agent_id: 'carol', name: 'Carol', trust_level: 'verified' }],
    });
    const cursorPath = path.join(personaDir, 'social', '.poller-cursor.json');
    if (fs.existsSync(cursorPath)) fs.removeSync(cursorPath);
    await fs.remove(captureFile).catch(() => {});

    const fakeMessages = [
      { route_id: 'r6', from_agent: 'carol', to_agent: 'my-agent',
        timestamp: '2026-04-22T12:00:00Z', message: { text: 'test' } },
    ];
    const { server, port } = await startAcnServer(fakeMessages);
    fs.writeFileSync(path.join(personaDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: `http://127.0.0.1:${port}` }));
    fs.writeFileSync(path.join(personaDir, 'acn-registration.json'),
      JSON.stringify({ agentId: 'my-agent', apiKey: 'key' }));

    const { pollInbox } = require('../lib/social/inbox');
    const result = await pollInbox('test-persona', { ack: true, dryRun: true });
    server.close();

    assert.equal(result.injected, 1); // counted but not written
    assert.ok(!fs.existsSync(captureFile), 'state-sync must not be called in dry-run');
    assert.ok(!fs.existsSync(cursorPath), 'cursor must not be written in dry-run');
  });
});
