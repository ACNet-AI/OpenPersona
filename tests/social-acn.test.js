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
 * 12. sendMessage falls back to ACN relay (/api/v1/communication/send) when offline
 * 13. sendMessage returns {status:'offline'} when offline + inboxFallback:false
 * 14. sendMessage includes sender_agent_id in envelope when provided
 * 15. checkWsPresence returns true when ACN reports connected:true
 * 16. checkWsPresence returns false when ACN reports connected:false
 * 17. getMessageHistory returns messages array from ACN
 * 18. listSubnets returns subnets array from ACN
 * 19. joinSubnet calls POST /api/v1/agents/{id}/subnets/{sid} with API key
 * 20. joinSubnet throws on error response
 * 21. leaveSubnet calls DELETE via httpLib.del (5 MB cap path, not _deleteRequest)
 * 22. leaveSubnet throws on error response
 * 23. broadcastMessage calls POST /api/v1/messages/broadcast with subnet_id
 * 24. broadcastMessage calls POST /api/v1/messages/broadcast with target_agents list
 * 25. broadcastMessage throws when neither subnetId nor targetIds provided
 * 26. http.del sends DELETE with correct headers and parses JSON response
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

  it('sendMessage falls back to ACN relay when target is offline', async () => {
    // Simulate ACN gateway handling POST /api/v1/communication/send
    const http = require('http');
    let relayBody = null;
    let relayPath = null;
    const relayServer = http.createServer((req, res) => {
      relayPath = req.url;
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => { relayBody = JSON.parse(data); res.writeHead(200); res.end('{}'); });
    });
    await new Promise((resolve) => relayServer.listen(0, '127.0.0.1', resolve));
    const { port } = relayServer.address();

    const { sendMessage } = require('../lib/social/acn-client');
    const result = await sendMessage(
      `http://127.0.0.1:${port}`,
      'offline-agent',
      'http://127.0.0.1:1/dead-endpoint', // unreachable → offline
      { type: 'task', text: 'do something' },
      { inboxFallback: true, senderAgentId: 'sender-001', apiKey: 'key-abc' }
    );
    relayServer.close();

    assert.equal(result.status, 'relayed');
    // Must hit the correct ACN relay endpoint
    assert.equal(relayPath, '/api/v1/communication/send');
    // Relay body must carry from_agent / target_agent / message
    assert.equal(relayBody.from_agent, 'sender-001');
    assert.equal(relayBody.target_agent, 'offline-agent');
    assert.equal(relayBody.message.text, 'do something');
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

  it('checkWsPresence returns true when ACN reports connected:true', async () => {
    const http = require('http');
    let capturedPath = null;
    let capturedAuth = null;
    const server = http.createServer((req, res) => {
      capturedPath = req.url;
      capturedAuth = req.headers.authorization;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agent_id: 'agent-xyz', connected: true }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { checkWsPresence } = require('../lib/social/acn-client');
    const connected = await checkWsPresence(
      `http://127.0.0.1:${port}`, 'agent-xyz', 'my-api-key'
    );
    server.close();

    assert.equal(connected, true);
    assert.equal(capturedPath, '/api/v1/websocket/agent/agent-xyz/status');
    assert.equal(capturedAuth, 'Bearer my-api-key');
  });

  it('checkWsPresence returns false when ACN reports connected:false', async () => {
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agent_id: 'agent-xyz', connected: false }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { checkWsPresence } = require('../lib/social/acn-client');
    const connected = await checkWsPresence(
      `http://127.0.0.1:${port}`, 'agent-xyz', 'my-api-key'
    );
    server.close();

    assert.equal(connected, false);
  });

  it('getMessageHistory returns messages array from ACN', async () => {
    const http = require('http');
    const fakeMessages = [
      { route_id: 'r1', from_agent: 'alice', to_agent: 'bob', timestamp: '2026-01-01T00:00:00Z' },
      { route_id: 'r2', from_agent: 'charlie', to_agent: 'bob', timestamp: '2026-01-02T00:00:00Z' },
    ];
    let capturedPath = null;
    let capturedAuth = null;
    const server = http.createServer((req, res) => {
      capturedPath = req.url;
      capturedAuth = req.headers.authorization;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agent_id: 'bob', messages: fakeMessages, count: 2 }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { getMessageHistory } = require('../lib/social/acn-client');
    const msgs = await getMessageHistory(
      `http://127.0.0.1:${port}`, 'bob', 'my-api-key', { limit: 50 }
    );
    server.close();

    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].route_id, 'r1');
    assert.equal(capturedPath, '/api/v1/communication/history/bob?limit=50');
    assert.equal(capturedAuth, 'Bearer my-api-key');
  });

  // -------------------------------------------------------------------------
  // Subnet tests (18-24)
  // -------------------------------------------------------------------------

  it('listSubnets returns subnets array from ACN', async () => {
    const http = require('http');
    const fakeSubnets = [
      { subnet_id: 'public', name: 'Public', agent_count: 42 },
      { subnet_id: 'team-alpha', name: 'Team Alpha', agent_count: 5 },
    ];
    let capturedPath;
    const server = http.createServer((req, res) => {
      capturedPath = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ subnets: fakeSubnets }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { listSubnets } = require('../lib/social/acn-client');
    const subnets = await listSubnets(`http://127.0.0.1:${port}`);
    server.close();

    assert.equal(subnets.length, 2);
    assert.equal(subnets[0].subnet_id, 'public');
    assert.equal(capturedPath, '/api/v1/subnets');
  });

  it('joinSubnet calls POST /api/v1/agents/{id}/subnets/{sid} with API key', async () => {
    const http = require('http');
    let capturedMethod;
    let capturedPath;
    let capturedAuth;
    const server = http.createServer((req, res) => {
      capturedMethod = req.method;
      capturedPath   = req.url;
      capturedAuth   = req.headers.authorization;
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'joined' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { joinSubnet } = require('../lib/social/acn-client');
    const result = await joinSubnet(`http://127.0.0.1:${port}`, 'agent-001', 'team-alpha', 'my-api-key');
    server.close();

    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedPath, '/api/v1/agents/agent-001/subnets/team-alpha');
    assert.equal(capturedAuth, 'Bearer my-api-key');
    assert.equal(result.joined, true);
    assert.equal(result.subnetId, 'team-alpha');
  });

  it('joinSubnet throws on error response', async () => {
    const http = require('http');
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'subnet not found' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { joinSubnet } = require('../lib/social/acn-client');
    await assert.rejects(
      () => joinSubnet(`http://127.0.0.1:${port}`, 'agent-001', 'missing-subnet', 'key'),
      /subnet not found|HTTP 404/
    );
    server.close();
  });

  it('leaveSubnet calls DELETE via httpLib.del (5 MB cap path, not _deleteRequest)', async () => {
    const http = require('http');
    let capturedMethod;
    let capturedPath;
    let capturedAuth;
    const server = http.createServer((req, res) => {
      capturedMethod = req.method;
      capturedPath   = req.url;
      capturedAuth   = req.headers.authorization;
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'left' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { leaveSubnet } = require('../lib/social/acn-client');
    const result = await leaveSubnet(`http://127.0.0.1:${port}`, 'agent-001', 'team-alpha', 'my-api-key');
    server.close();

    assert.equal(capturedMethod, 'DELETE');
    assert.equal(capturedPath, '/api/v1/agents/agent-001/subnets/team-alpha');
    assert.equal(capturedAuth, 'Bearer my-api-key');
    assert.equal(result.left, true);
    assert.equal(result.subnetId, 'team-alpha');
  });

  it('leaveSubnet throws on error response', async () => {
    const http = require('http');
    const server = http.createServer((req, res) => {
      req.resume();
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'not a member' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { leaveSubnet } = require('../lib/social/acn-client');
    await assert.rejects(
      () => leaveSubnet(`http://127.0.0.1:${port}`, 'agent-001', 'team-alpha', 'key'),
      /not a member|HTTP 403/
    );
    server.close();
  });

  it('broadcastMessage calls POST /api/v1/messages/broadcast with subnet_id', async () => {
    const http = require('http');
    let capturedBody;
    let capturedAuth;
    const server = http.createServer((req, res) => {
      capturedAuth = req.headers.authorization;
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        capturedBody = JSON.parse(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ delivered: 3, failed: 0 }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { broadcastMessage } = require('../lib/social/acn-client');
    const result = await broadcastMessage(
      `http://127.0.0.1:${port}`,
      'sender-001',
      'my-api-key',
      { type: 'greeting', text: 'hello everyone' },
      { subnetId: 'public' }
    );
    server.close();

    assert.equal(result.delivered, 3);
    assert.equal(result.failed, 0);
    assert.equal(capturedBody.subnet_id, 'public');
    assert.equal(capturedBody.from_agent, 'sender-001');
    assert.equal(capturedBody.message.text, 'hello everyone');
    assert.equal(capturedAuth, 'Bearer my-api-key');
  });

  it('broadcastMessage calls POST /api/v1/messages/broadcast with target_agents list', async () => {
    const http = require('http');
    let capturedBody;
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        capturedBody = JSON.parse(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ delivered: 2, failed: 0 }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const { broadcastMessage } = require('../lib/social/acn-client');
    const result = await broadcastMessage(
      `http://127.0.0.1:${port}`,
      'sender-001',
      'my-api-key',
      { type: 'ping', text: 'hello' },
      { targetIds: ['agent-a', 'agent-b'] }
    );
    server.close();

    assert.equal(result.delivered, 2);
    assert.deepEqual(capturedBody.target_agents, ['agent-a', 'agent-b']);
    assert.equal(capturedBody.subnet_id, undefined);
  });

  it('broadcastMessage throws when neither subnetId nor targetIds provided', async () => {
    const { broadcastMessage } = require('../lib/social/acn-client');
    await assert.rejects(
      () => broadcastMessage('http://localhost', 'sender', 'key', { text: 'hi' }, {}),
      /subnetId|targetIds/
    );
  });

  it('http.del sends DELETE with correct headers and parses JSON response', async () => {
    const http = require('http');
    let capturedMethod;
    let capturedPath;
    let capturedAuth;
    const server = http.createServer((req, res) => {
      capturedMethod = req.method;
      capturedPath   = req.url;
      capturedAuth   = req.headers.authorization;
      req.resume();
      res.writeHead(204, { 'Content-Type': 'application/json' });
      res.end('');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const httpLib = require('../lib/social/http');
    const result = await httpLib.del(
      `http://127.0.0.1:${port}/api/v1/test`,
      { Authorization: 'Bearer testkey' }
    );
    server.close();

    assert.equal(capturedMethod, 'DELETE');
    assert.equal(capturedPath, '/api/v1/test');
    assert.equal(capturedAuth, 'Bearer testkey');
    assert.equal(result.status, 204);
  });
});
