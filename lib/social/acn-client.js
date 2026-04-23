/**
 * OpenPersona - ACN Client
 *
 * HTTP client for reading Agent data from an ACN gateway.
 * Used by 'openpersona social search' and 'openpersona social sync'.
 *
 * All functions are read-only (GET). Write operations (acn-register) remain in lib/remote/registrar.js.
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

module.exports = { fetchAgent, searchAgents, syncContacts, autoDiscover };
