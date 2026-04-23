/**
 * OpenPersona - ACN Client
 *
 * HTTP client for interacting with an ACN gateway.
 * Used by 'openpersona social search', 'openpersona social sync', and 'openpersona social send'.
 *
 * Read operations: fetchAgent, searchAgents, syncContacts, autoDiscover, pingAgent.
 * Write operations: sendMessage (posts to peer endpoint or ACN inbox).
 * Registration write operations remain in lib/remote/registrar.js.
 *
 * Messaging architecture — presence-aware adaptive routing:
 *   sendMessage(slug, targetAgentId, message)
 *     → pingAgent(endpoint)         ← HEAD request, fast
 *          ├── online  → POST directly to endpoint  (instant)
 *          └── offline → inbox_fallback?
 *                           ├── true  → POST to ACN gateway inbox
 *                           └── false → return {status: 'offline'}
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
 * Send a message to another agent using presence-aware adaptive routing.
 *
 * Routing order:
 *   1. pingAgent(endpoint)
 *   2. If online → POST directly to endpoint
 *   3. If offline + inboxFallback → POST to ACN gateway inbox
 *   4. If offline + !inboxFallback → return {status: 'offline'}
 *
 * @param {string} gateway - ACN gateway base URL
 * @param {string} targetAgentId - ACN agent UUID of the recipient
 * @param {string} endpoint - Recipient's A2A endpoint URL (from contacts.json)
 * @param {object} message - Message payload (will be JSON-serialised)
 * @param {object} [opts]
 * @param {boolean} [opts.inboxFallback=true] - Whether to fall back to ACN inbox on offline
 * @param {string} [opts.senderAgentId] - Sender's ACN agent UUID (added to message envelope)
 * @param {string} [opts.apiKey] - Sender's ACN API key (for inbox POST auth)
 * @returns {Promise<{ status: 'sent'|'inbox'|'offline', latencyMs: number }>}
 */
async function sendMessage(gateway, targetAgentId, endpoint, message, opts = {}) {
  const { inboxFallback = true, senderAgentId, apiKey } = opts;

  const envelope = {
    ...message,
    ...(senderAgentId && { sender_agent_id: senderAgentId }),
    sent_at: new Date().toISOString(),
  };

  // Step 1: presence check
  const { online, latencyMs } = endpoint
    ? await pingAgent(endpoint)
    : { online: false, latencyMs: 0 };

  // Step 2: direct send
  if (online && endpoint) {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    try {
      const res = await httpLib.post(endpoint, envelope, headers);
      if (res.status >= 200 && res.status < 300) {
        return { status: 'sent', latencyMs };
      }
      // Non-2xx from live server — fall through to inbox if enabled
    } catch {
      // Network error mid-send — fall through
    }
  }

  // Step 3: inbox fallback
  if (inboxFallback && gateway) {
    const inboxUrl = `${gateway}/api/v1/agents/${encodeURIComponent(targetAgentId)}/inbox`;
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    try {
      const res = await httpLib.post(inboxUrl, envelope, headers);
      if (res.status >= 200 && res.status < 300) {
        return { status: 'inbox', latencyMs };
      }
      throw new Error(`ACN inbox returned HTTP ${res.status}`);
    } catch (e) {
      throw new Error(`Failed to deliver message via ACN inbox: ${e.message}`);
    }
  }

  // Step 4: offline, no fallback
  return { status: 'offline', latencyMs };
}

module.exports = { fetchAgent, searchAgents, syncContacts, autoDiscover, pingAgent, sendMessage };
