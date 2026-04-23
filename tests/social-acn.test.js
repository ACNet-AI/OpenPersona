'use strict';
/**
 * OpenPersona - Social ACN Client tests
 *
 * Tests for lib/social/acn-client.js (unit — no real network).
 *  1. fetchAgent returns null for 404
 *  2. fetchAgent throws on non-200 (non-404)
 *  3. fetchAgent returns agent object on 200
 *  4. searchAgents returns agents array
 *  5. syncContacts refreshes endpoint and skills
 *  6. syncContacts tolerates 404 for individual contacts (partial failure)
 *  7. autoDiscover skips self (ownAgentId match)
 *  8. autoDiscover adds agents up to limit
 *  9. pingAgent returns online:true when endpoint responds
 * 10. pingAgent returns online:false on timeout/error
 * 11. sendMessage delivers directly when online
 * 12. sendMessage falls back to ACN inbox when offline + inboxFallback:true
 * 13. sendMessage returns {status:'offline'} when offline + inboxFallback:false
 * 14. sendMessage includes sender_agent_id in envelope when provided
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');

// Intercept http requests used by acn-client.js:
// acn-client uses `httpLib.get` (not destructured), so we patch httpLib
const httpLib = require('../lib/social/http');

const runner = require('../lib/state/runner');
const contacts = require('../lib/social/contacts');

describe('social acn-client', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-social-acn-'));
    await fs.writeFile(
      path.join(tmpDir, 'persona.json'),
      JSON.stringify({ slug: 'acn-test', social: { contacts: { max_contacts: 100 } } })
    );
    await fs.ensureDir(path.join(tmpDir, 'social'));
    await fs.writeFile(
      path.join(tmpDir, 'social', 'contacts.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        personaSlug: 'acn-test',
        contacts: [
          {
            acn_agent_id: 'old-agent',
            name: 'Old Agent',
            endpoint: 'http://old.example.com',
            skills: ['old-skill'],
            subnet_ids: ['public'],
            trust_level: 'unverified',
            source: 'manual',
            first_seen: '2025-01-01T00:00:00.000Z',
            last_seen: '2025-01-01T00:00:00.000Z',
            last_synced: null,
            interaction_count: 0,
          }
        ],
      })
    );
    await fs.writeFile(
      path.join(tmpDir, 'acn-config.json'),
      JSON.stringify({ acn_gateway: 'http://fake-acn', subnet_ids: ['testnet'] })
    );
    runner._origResolve = runner.resolvePersonaDir;
    runner.resolvePersonaDir = (slug) => (slug === 'acn-test' ? tmpDir : null);
  });

  after(async () => {
    runner.resolvePersonaDir = runner._origResolve;
    await fs.remove(tmpDir);
  });

  it('fetchAgent returns null for 404', async () => {
    const origGet = httpLib.get;
    httpLib.get = async () => ({ status: 404, body: {} });
    const { fetchAgent } = require('../lib/social/acn-client');
    const result = await fetchAgent('http://fake-acn', 'nonexistent');
    assert.equal(result, null);
    httpLib.get = origGet;
  });

  it('fetchAgent throws on non-200 non-404', async () => {
    const origGet = httpLib.get;
    httpLib.get = async () => ({ status: 500, body: 'error' });
    const { fetchAgent } = require('../lib/social/acn-client');
    await assert.rejects(
      () => fetchAgent('http://fake-acn', 'some-id'),
      /ACN returned HTTP 500/
    );
    httpLib.get = origGet;
  });

  it('fetchAgent returns agent on 200', async () => {
    const origGet = httpLib.get;
    const fakeAgent = { agent_id: 'real-agent', name: 'Real', endpoint: 'http://real.example.com', skills: ['chat'] };
    httpLib.get = async () => ({ status: 200, body: fakeAgent });
    const { fetchAgent } = require('../lib/social/acn-client');
    const result = await fetchAgent('http://fake-acn', 'real-agent');
    assert.deepEqual(result, fakeAgent);
    httpLib.get = origGet;
  });

  it('searchAgents returns agents array', async () => {
    const origGet = httpLib.get;
    httpLib.get = async () => ({
      status: 200,
      body: { agents: [{ agent_id: 'a1', name: 'Agent1' }] },
    });
    const { searchAgents } = require('../lib/social/acn-client');
    const agents = await searchAgents('http://fake-acn', { skills: 'chat', limit: 5 });
    assert.equal(agents.length, 1);
    assert.equal(agents[0].agent_id, 'a1');
    httpLib.get = origGet;
  });

  it('syncContacts refreshes endpoint and skills', async () => {
    const origGet = httpLib.get;
    httpLib.get = async (url) => {
      if (url.includes('old-agent')) {
        return {
          status: 200,
          body: { agent_id: 'old-agent', name: 'Old Agent Updated', endpoint: 'http://new.example.com', skills: ['new-skill'] },
        };
      }
      return { status: 404, body: {} };
    };
    const { syncContacts } = require('../lib/social/acn-client');
    const result = await syncContacts('acn-test', 'http://fake-acn');
    assert.equal(result.refreshed, 1);
    assert.equal(result.failed, 0);

    const data = contacts.loadContacts('acn-test');
    assert.equal(data.contacts[0].endpoint, 'http://new.example.com');
    assert.deepEqual(data.contacts[0].skills, ['new-skill']);
    assert.ok(data.contacts[0].last_synced);
    httpLib.get = origGet;
  });

  it('syncContacts tolerates 404 for individual contacts', async () => {
    const origGet = httpLib.get;
    httpLib.get = async () => ({ status: 404, body: {} });
    const { syncContacts } = require('../lib/social/acn-client');
    const result = await syncContacts('acn-test', 'http://fake-acn');
    assert.equal(result.failed, 1);
    assert.equal(result.refreshed, 0);
    httpLib.get = origGet;
  });

  it('autoDiscover skips self', async () => {
    const origGet = httpLib.get;
    const agents = [{ agent_id: 'self-id', name: 'Self' }];
    httpLib.get = async () => ({ status: 200, body: { agents } });
    const { autoDiscover } = require('../lib/social/acn-client');
    const added = await autoDiscover('acn-test', 'http://fake-acn', { ownAgentId: 'self-id' });
    assert.equal(added, 0, 'self must be skipped');
    httpLib.get = origGet;
  });

  it('autoDiscover adds agents up to limit', async () => {
    const origGet = httpLib.get;
    const agents = [
      { agent_id: 'disco-1', name: 'D1', skills: ['a'] },
      { agent_id: 'disco-2', name: 'D2', skills: ['b'] },
    ];
    httpLib.get = async () => ({ status: 200, body: { agents } });
    const { autoDiscover } = require('../lib/social/acn-client');
    const added = await autoDiscover('acn-test', 'http://fake-acn', { limit: 10 });
    assert.equal(added, 2);
    httpLib.get = origGet;
  });

  // ── pingAgent ────────────────────────────────────────────────────────────

  it('pingAgent returns online:true when endpoint responds', async () => {
    // Spin up a minimal HTTP server that accepts HEAD requests
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { pingAgent } = require('../lib/social/acn-client');
    const result = await pingAgent(`http://127.0.0.1:${port}/a2a`);
    server.close();

    assert.equal(result.online, true);
    assert.ok(result.latencyMs >= 0);
  });

  it('pingAgent returns online:false when endpoint unreachable', async () => {
    const { pingAgent } = require('../lib/social/acn-client');
    // Port 1 is typically unavailable / refused
    const result = await pingAgent('http://127.0.0.1:1/a2a');
    assert.equal(result.online, false);
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  it('sendMessage delivers directly when target is online', async () => {
    const http = require('http');
    let receivedBody = null;
    const server = http.createServer((req, res) => {
      // pingAgent uses HEAD; sendMessage uses POST — handle both
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => { receivedBody = JSON.parse(data); res.writeHead(200); res.end(); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const endpoint = `http://127.0.0.1:${port}/a2a`;

    const { sendMessage } = require('../lib/social/acn-client');
    const result = await sendMessage(
      'http://fake-acn', 'target-agent', endpoint,
      { type: 'greeting', text: 'hello' },
      { senderAgentId: 'sender-001', inboxFallback: false }
    );
    server.close();

    assert.equal(result.status, 'sent');
    assert.equal(receivedBody.sender_agent_id, 'sender-001');
    assert.equal(receivedBody.text, 'hello');
    assert.ok(receivedBody.sent_at);
  });

  it('sendMessage falls back to ACN inbox when target is offline', async () => {
    // Set up an inbox server (simulates ACN gateway inbox endpoint)
    const http = require('http');
    let inboxBody = null;
    const inboxServer = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => { inboxBody = JSON.parse(data); res.writeHead(200); res.end(); });
    });
    await new Promise((resolve) => inboxServer.listen(0, '127.0.0.1', resolve));
    const { port } = inboxServer.address();

    const { sendMessage } = require('../lib/social/acn-client');
    const result = await sendMessage(
      `http://127.0.0.1:${port}`,
      'offline-agent',
      'http://127.0.0.1:1/dead-endpoint', // unreachable → offline
      { type: 'task', text: 'do something' },
      { inboxFallback: true }
    );
    inboxServer.close();

    assert.equal(result.status, 'inbox');
    assert.equal(inboxBody.text, 'do something');
  });

  it('sendMessage returns offline when target offline and inboxFallback false', async () => {
    const { sendMessage } = require('../lib/social/acn-client');
    const result = await sendMessage(
      'http://fake-acn',
      'offline-agent',
      'http://127.0.0.1:1/dead-endpoint',
      { type: 'greeting', text: 'hi' },
      { inboxFallback: false }
    );
    assert.equal(result.status, 'offline');
  });

  it('sendMessage includes sender_agent_id in envelope', async () => {
    const http = require('http');
    let captured = null;
    const server = http.createServer((req, res) => {
      if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => { captured = JSON.parse(data); res.writeHead(200); res.end(); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { sendMessage } = require('../lib/social/acn-client');
    await sendMessage(
      'http://fake-acn', 'tgt', `http://127.0.0.1:${port}/a2a`,
      { text: 'hi' },
      { senderAgentId: 'my-agent-id', inboxFallback: false }
    );
    server.close();

    assert.equal(captured.sender_agent_id, 'my-agent-id');
  });
});
