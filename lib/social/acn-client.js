/**
 * OpenPersona - ACN Client
 *
 * HTTP client for interacting with an ACN gateway.
 * Used by 'openpersona social' subcommands.
 *
 * Read operations:  fetchAgent, searchAgents, syncContacts, autoDiscover, pingAgent,
 *                   checkWsPresence, getMessageHistory, listSubnets.
 * Write operations: sendMessage, broadcastMessage, joinSubnet, leaveSubnet.
 * Registration write operations remain in lib/remote/registrar.js.
 *
 * Messaging architecture — presence-aware adaptive routing:
 *   sendMessage(gateway, targetAgentId, endpoint, message, opts)
 *     → pingAgent(endpoint)           ← HEAD request to A2A endpoint, fast
 *          ├── online  → POST directly to endpoint            (P2P, instant)
 *          └── offline → inboxFallback?
 *                           ├── true  → POST /api/v1/communication/send (ACN relay + DLQ)
 *                           └── false → return {status: 'offline'}
 *
 * ACN gateway confirmed endpoints (v0.4.1):
 *   GET    /api/v1/agents                            — list / search agents
 *   GET    /api/v1/agents/{id}                       — get single agent
 *   POST   /api/v1/communication/send                — relay message to target (DLQ-backed)
 *   GET    /api/v1/communication/history/{id}        — offline inbox (cap 50, 30-day TTL, ack=true to clear)
 *   WS     /ws/{agent_id}                            — real-time WebSocket channel
 *   GET    /api/v1/websocket/agent/{id}/status       — WS online presence check
 *   GET    /api/v1/subnets                           — list all subnets
 *   POST   /api/v1/agents/{id}/subnets/{sid}         — join subnet (requires API key)
 *   DELETE /api/v1/agents/{id}/subnets/{sid}         — leave subnet (requires API key); uses httpLib.del
 *   POST   /api/v1/messages/broadcast                — broadcast message to subnet or agent list
 */
const path = require('path');
const fs = require('fs-extra');
const httpLib = require('./http');
const {
  addContact,
  loadContacts,
  saveContacts,
  appendContactLog,
  resolveContactsPaths,
} = require('./contacts');

/**
 * Fetch a single agent's info from ACN.
 *
 * @param {string} gateway - ACN gateway base URL (e.g. 'https://acn-production.up.railway.app')
 * @param {string} agentId - ACN agent UUID
 * @returns {Promise<object|null>} Agent info or null if not found
 */
async function fetchAgent(gateway, agentId) {
  const url = `${gateway}/api/v1/agents/${encodeURIComponent(agentId)}`;
  let res;
  try {
    res = await httpLib.get(url);
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status === 404) return null;
  if (res.status !== 200) {
    throw new Error(`ACN returned HTTP ${res.status} for agent "${agentId}"`);
  }
  return typeof res.body === 'object' ? res.body : null;
}

/**
 * Search agents on ACN by skills and/or subnet.
 *
 * @param {string} gateway
 * @param {{ skills?: string, subnet?: string, limit?: number }} [opts]
 * @returns {Promise<Array>} Array of agent objects
 */
async function searchAgents(gateway, opts = {}) {
  const params = new URLSearchParams();
  if (opts.skills) params.set('skills', opts.skills);
  if (opts.subnet) params.set('subnet_id', opts.subnet);
  if (opts.limit) params.set('limit', String(opts.limit));

  const url = `${gateway}/api/v1/agents?${params.toString()}`;
  let res;
  try {
    res = await httpLib.get(url);
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status !== 200) {
    throw new Error(`ACN search returned HTTP ${res.status}`);
  }
  const body = typeof res.body === 'object' ? res.body : {};
  return body.agents || [];
}

/**
 * Sync all contacts for a persona from ACN — refresh endpoint, skills, agent_card_url.
 * Partial failures: failed contacts get last_synced=null but remain in the book.
 *
 * @param {string} slug
 * @param {string} gateway
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<{ refreshed: number, failed: number, skipped: number }>}
 */
async function syncContacts(slug, gateway, opts = {}) {
  const data = loadContacts(slug);
  if (!data) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const contact of data.contacts) {
    if (!contact.acn_agent_id) { skipped++; continue; }
    try {
      const agent = await fetchAgent(gateway, contact.acn_agent_id);
      if (!agent) { failed++; contact.last_synced = null; continue; }

      // Merge ACN fields (cached columns) while preserving local metadata
      contact.name = agent.name || contact.name;
      contact.endpoint = agent.endpoint || contact.endpoint;
      contact.skills = agent.skills || contact.skills;
      contact.subnet_ids = agent.subnet_ids || contact.subnet_ids;
      contact.agent_card_url = agent.agent_card_url
        || contact.agent_card_url
        || (gateway + `/api/v1/agents/${contact.acn_agent_id}/card`);
      contact.last_synced = now;
      refreshed++;
    } catch {
      failed++;
      contact.last_synced = null;
    }
  }

  if (!opts.dryRun) {
    saveContacts(slug, data);
    appendContactLog(slug, { event: 'sync', refreshed, failed, skipped });
  }
  return { refreshed, failed, skipped };
}

/**
 * Auto-discover agents from ACN and add them to the contact book.
 * Used by acn-register hook when social.contacts.auto_discover === true.
 *
 * Subnet is read from <packDir>/acn-config.json → subnet_ids[0] (default "public").
 * Skips the persona's own acn_agent_id if it matches a contact's name/id.
 *
 * @param {string} slug
 * @param {string} gateway
 * @param {{ limit?: number, ownAgentId?: string, trustLevel?: string }} [opts]
 * @returns {Promise<number>} Number of contacts added or updated
 */
async function autoDiscover(slug, gateway, opts = {}) {
  const paths = resolveContactsPaths(slug);
  if (!paths) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  // Resolve subnet from acn-config.json
  let subnet = 'public';
  try {
    const acnConfigPath = path.join(paths.packDir, 'acn-config.json');
    if (fs.existsSync(acnConfigPath)) {
      const acnConfig = JSON.parse(fs.readFileSync(acnConfigPath, 'utf-8'));
      subnet = (acnConfig.subnet_ids && acnConfig.subnet_ids[0]) || 'public';
    }
  } catch { /* use default */ }

  const limit = opts.limit || 5;
  const agents = await searchAgents(gateway, { subnet, limit });

  let added = 0;
  for (const agent of agents) {
    if (!agent.agent_id) continue;
    // Skip self
    if (opts.ownAgentId && agent.agent_id === opts.ownAgentId) continue;

    try {
      addContact(slug, {
        acn_agent_id: agent.agent_id,
        name: agent.name || agent.agent_id,
        endpoint: agent.endpoint,
        skills: agent.skills || [],
        subnet_ids: agent.subnet_ids || [subnet],
        agent_card_url: gateway + `/api/v1/agents/${agent.agent_id}/card`,
        trust_level: opts.trustLevel || 'unverified',
        last_synced: new Date().toISOString(),
      }, { source: 'auto-discover' });
      added++;
    } catch { /* overflow or other error — skip */ }
  }

  return added;
}

/**
 * Probe whether a peer agent's endpoint is reachable.
 *
 * Sends a HEAD request to `endpoint` with a short timeout (3 s).
 * A 2xx or 4xx response counts as "online" — the server is up even if it
 * rejects the request. 5xx or network errors count as "offline".
 *
 * @param {string} endpoint - Full URL of the peer's A2A endpoint
 * @returns {Promise<{ online: boolean, latencyMs: number }>}
 */
async function pingAgent(endpoint) {
  const start = Date.now();
  try {
    // Reuse the http helper's internal Node.js client to issue a HEAD request.
    // We build the request manually because httpLib.get always uses GET.
    const u = new URL(endpoint);
    const nodeLib = u.protocol === 'https:' ? require('https') : require('http');
    const latencyMs = await new Promise((resolve, reject) => {
      const req = nodeLib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'HEAD',
          headers: { 'User-Agent': 'OpenPersona-Social/1.0' },
        },
        (res) => {
          res.resume(); // drain response
          resolve(Date.now() - start);
        }
      );
      req.setTimeout(3000, () => req.destroy(new Error('ping timeout')));
      req.on('error', reject);
      req.end();
    });
    return { online: true, latencyMs };
  } catch {
    return { online: false, latencyMs: Date.now() - start };
  }
}

/**
 * Check whether a peer agent has an active WebSocket connection on the ACN gateway.
 *
 * Complements pingAgent (which probes the A2A endpoint directly).
 * Use this when you want to know if the agent is reachable via the ACN WS channel
 * rather than its raw endpoint.
 *
 * ACN endpoint: GET /api/v1/websocket/agent/{agent_id}/status
 * Requires Agent API Key (Bearer).
 *
 * @param {string} gateway - ACN gateway base URL
 * @param {string} agentId - ACN agent UUID to query
 * @param {string} apiKey  - Caller's ACN API key
 * @returns {Promise<boolean>} true if agent has an active WS connection
 */
async function checkWsPresence(gateway, agentId, apiKey) {
  const url = `${gateway}/api/v1/websocket/agent/${encodeURIComponent(agentId)}/status`;
  try {
    const res = await httpLib.get(url, { Authorization: `Bearer ${apiKey}` });
    if (res.status === 200 && typeof res.body === 'object') {
      return res.body.connected === true;
    }
  } catch { /* network error → treat as offline */ }
  return false;
}

/**
 * Retrieve offline inbox messages for a persona from the ACN gateway.
 *
 * ACN only stores messages that **failed direct delivery** (agent offline / no endpoint).
 * Successful deliveries do NOT appear here — those go directly to the A2A endpoint.
 *
 * ACN endpoint: GET /api/v1/communication/history/{agent_id}?limit=N&ack=true|false
 * Requires Agent API Key (Bearer).
 *
 * Storage: Redis sorted set `acn:inbox:{agent_id}` — cap 50 messages, 30-day TTL.
 *
 * @param {string} gateway - ACN gateway base URL
 * @param {string} agentId - ACN agent UUID of the persona
 * @param {string} apiKey  - Persona's ACN API key
 * @param {{ limit?: number, ack?: boolean }} [opts]
 *   limit: max messages to return (default 50, ACN hard-cap is 50)
 *   ack:   if true, ACN deletes the inbox key after returning messages (server-side ack).
 *          Use ack=true for at-most-once delivery (simpler, recommended for polling).
 *          Use ack=false to peek without clearing (requires client-side deduplication).
 * @returns {Promise<Array>} Array of inbound message records (newest first)
 */
async function getMessageHistory(gateway, agentId, apiKey, opts = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.ack) params.set('ack', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `${gateway}/api/v1/communication/history/${encodeURIComponent(agentId)}${qs}`;
  try {
    const res = await httpLib.get(url, { Authorization: `Bearer ${apiKey}` });
    if (res.status !== 200) {
      throw new Error(`ACN inbox returned HTTP ${res.status}`);
    }
    const body = typeof res.body === 'object' ? res.body : {};
    return body.messages || [];
  } catch (e) {
    throw new Error(`Failed to fetch inbox from ACN: ${e.message}`);
  }
}

/**
 * Send a message to another agent using presence-aware adaptive routing.
 *
 * Routing order:
 *   1. pingAgent(endpoint)              — HEAD to peer's A2A endpoint (fast, 3 s timeout)
 *   2. If online  → POST directly to endpoint        (P2P, instant)
 *   3. If offline + inboxFallback
 *        → POST /api/v1/communication/send on ACN    (relay with DLQ + auto-retry)
 *   4. If offline + !inboxFallback → return {status: 'offline'}
 *
 * ACN relay body: { from_agent, target_agent, message }
 * Requires senderAgentId + apiKey for the ACN relay path.
 *
 * @param {string} gateway - ACN gateway base URL
 * @param {string} targetAgentId - ACN agent UUID of the recipient
 * @param {string} endpoint - Recipient's A2A endpoint URL (from contacts.json)
 * @param {object} message - Message payload (will be JSON-serialised)
 * @param {object} [opts]
 * @param {boolean} [opts.inboxFallback=true]  - Fall back to ACN relay when offline
 * @param {string}  [opts.senderAgentId]       - Sender's ACN agent UUID (required for relay)
 * @param {string}  [opts.apiKey]              - Sender's ACN API key (required for relay)
 * @returns {Promise<{ status: 'sent'|'relayed'|'offline', latencyMs: number }>}
 */
async function sendMessage(gateway, targetAgentId, endpoint, message, opts = {}) {
  const { inboxFallback = true, senderAgentId, apiKey } = opts;

  const envelope = {
    ...message,
    ...(senderAgentId && { sender_agent_id: senderAgentId }),
    sent_at: new Date().toISOString(),
  };

  // Step 1: presence check via A2A endpoint HEAD request
  const { online, latencyMs } = endpoint
    ? await pingAgent(endpoint)
    : { online: false, latencyMs: 0 };

  // Step 2: direct P2P send
  if (online && endpoint) {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    try {
      const res = await httpLib.post(endpoint, envelope, headers);
      if (res.status >= 200 && res.status < 300) {
        return { status: 'sent', latencyMs };
      }
      // Non-2xx from live server — fall through to ACN relay if enabled
    } catch {
      // Network error mid-send — fall through
    }
  }

  // Step 3: ACN relay fallback (POST /api/v1/communication/send)
  // ACN stores the message in Redis and retries delivery via DLQ if the agent
  // is offline. This replaces the previously assumed (non-existent) /inbox endpoint.
  if (inboxFallback && gateway && senderAgentId) {
    const relayUrl = `${gateway}/api/v1/communication/send`;
    const relayHeaders = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const relayBody = {
      from_agent: senderAgentId,
      target_agent: targetAgentId,
      message: envelope,
    };
    try {
      const res = await httpLib.post(relayUrl, relayBody, relayHeaders);
      if (res.status >= 200 && res.status < 300) {
        return { status: 'relayed', latencyMs };
      }
      throw new Error(`ACN relay returned HTTP ${res.status}`);
    } catch (e) {
      throw new Error(`Failed to relay message via ACN: ${e.message}`);
    }
  }

  // Step 4: offline, no fallback
  return { status: 'offline', latencyMs };
}

/**
 * List all subnets registered on the ACN gateway.
 *
 * ACN endpoint: GET /api/v1/subnets
 * Public — no authentication required.
 *
 * @param {string} gateway - ACN gateway base URL
 * @returns {Promise<Array<{ subnet_id: string, name: string, agent_count: number }>>}
 */
async function listSubnets(gateway) {
  const url = `${gateway}/api/v1/subnets`;
  let res;
  try {
    res = await httpLib.get(url);
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status !== 200) {
    throw new Error(`ACN returned HTTP ${res.status} listing subnets`);
  }
  const body = typeof res.body === 'object' ? res.body : {};
  return body.subnets || (Array.isArray(body) ? body : []);
}

/**
 * Join a subnet on behalf of the persona.
 *
 * ACN endpoint: POST /api/v1/agents/{agent_id}/subnets/{subnet_id}
 * Requires Agent API Key (Bearer).
 *
 * @param {string} gateway  - ACN gateway base URL
 * @param {string} agentId  - Persona's ACN agent UUID
 * @param {string} subnetId - Target subnet ID
 * @param {string} apiKey   - Persona's ACN API key
 * @returns {Promise<{ joined: boolean, subnetId: string }>}
 */
async function joinSubnet(gateway, agentId, subnetId, apiKey) {
  const url = `${gateway}/api/v1/agents/${encodeURIComponent(agentId)}/subnets/${encodeURIComponent(subnetId)}`;
  let res;
  try {
    res = await httpLib.post(url, {}, { Authorization: `Bearer ${apiKey}` });
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status === 200 || res.status === 201) {
    return { joined: true, subnetId };
  }
  const detail =
    typeof res.body === 'object' ? res.body.detail || JSON.stringify(res.body) : String(res.body);
  throw new Error(`ACN join subnet failed (HTTP ${res.status}): ${detail}`);
}

/**
 * Leave a subnet on behalf of the persona.
 *
 * ACN endpoint: DELETE /api/v1/agents/{agent_id}/subnets/{subnet_id}
 * Requires Agent API Key (Bearer).
 *
 * @param {string} gateway  - ACN gateway base URL
 * @param {string} agentId  - Persona's ACN agent UUID
 * @param {string} subnetId - Target subnet ID
 * @param {string} apiKey   - Persona's ACN API key
 * @returns {Promise<{ left: boolean, subnetId: string }>}
 */
async function leaveSubnet(gateway, agentId, subnetId, apiKey) {
  const url = `${gateway}/api/v1/agents/${encodeURIComponent(agentId)}/subnets/${encodeURIComponent(subnetId)}`;
  let res;
  try {
    res = await httpLib.del(url, { Authorization: `Bearer ${apiKey}` });
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status === 200 || res.status === 204) {
    return { left: true, subnetId };
  }
  const detail =
    typeof res.body === 'object' ? res.body.detail || JSON.stringify(res.body) : String(res.body);
  throw new Error(`ACN leave subnet failed (HTTP ${res.status}): ${detail}`);
}

/**
 * Broadcast a message to a subnet or a list of agents.
 *
 * ACN endpoint: POST /api/v1/messages/broadcast
 * Requires Agent API Key (Bearer).
 *
 * @param {string} gateway    - ACN gateway base URL
 * @param {string} agentId    - Sender's ACN agent UUID
 * @param {string} apiKey     - Sender's ACN API key
 * @param {object} message    - Message payload to broadcast
 * @param {object} [opts]
 * @param {string}   [opts.subnetId]    - Broadcast to all agents in this subnet
 * @param {string[]} [opts.targetIds]   - Explicit list of target agent IDs (alternative to subnetId)
 * @returns {Promise<{ delivered: number, failed: number }>}
 */
async function broadcastMessage(gateway, agentId, apiKey, message, opts = {}) {
  const { subnetId, targetIds } = opts;
  if (!subnetId && (!targetIds || targetIds.length === 0)) {
    throw new Error('broadcastMessage requires either opts.subnetId or opts.targetIds');
  }

  const envelope = {
    from_agent: agentId,
    message: {
      ...message,
      sender_agent_id: agentId,
      sent_at: new Date().toISOString(),
    },
  };
  if (subnetId) envelope.subnet_id = subnetId;
  if (targetIds && targetIds.length > 0) envelope.target_agents = targetIds;

  const url = `${gateway}/api/v1/messages/broadcast`;
  let res;
  try {
    res = await httpLib.post(url, envelope, { Authorization: `Bearer ${apiKey}` });
  } catch (e) {
    throw new Error(`Failed to reach ACN gateway: ${e.message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    const detail =
      typeof res.body === 'object' ? res.body.detail || JSON.stringify(res.body) : String(res.body);
    throw new Error(`ACN broadcast failed (HTTP ${res.status}): ${detail}`);
  }
  const body = typeof res.body === 'object' ? res.body : {};
  return {
    delivered: body.delivered ?? body.success_count ?? 0,
    failed: body.failed ?? body.fail_count ?? 0,
  };
}

module.exports = {
  fetchAgent,
  searchAgents,
  syncContacts,
  autoDiscover,
  pingAgent,
  checkWsPresence,
  getMessageHistory,
  sendMessage,
  listSubnets,
  joinSubnet,
  leaveSubnet,
  broadcastMessage,
};
