/**
 * OpenPersona - A2A Inbox Poller (Phase C)
 *
 * Polls the ACN gateway's offline inbox for a persona and injects new messages
 * into state.json pendingCommands via the state-sync write pathway.
 *
 * ACN inbox semantics (confirmed v0.4.1):
 *   - Only stores messages that FAILED direct delivery (agent offline/no endpoint).
 *   - Successful deliveries go straight to the A2A endpoint and never appear here.
 *   - Cap: 50 messages per agent; TTL: 30 days.
 *   - ack=true (default): server deletes inbox after return → at-most-once, no cursor needed.
 *   - ack=false: server keeps inbox → requires client-side deduplication (--no-ack mode).
 *
 * Trust hierarchy: verified > community > unverified
 *   minIncomingTrust is read from persona.json social.contacts.minIncomingTrust.
 *   Messages from senders below the threshold are logged and dropped.
 *
 * pendingCommands entry type: 'a2a_message'
 *   { type: 'a2a_message', source: 'acn_inbox', payload: { from_agent, from_name,
 *     trust_level, route_id, message, received_at } }
 */
'use strict';

const path = require('path');
const fs = require('fs-extra');
const { getMessageHistory } = require('./acn-client');
const { loadContacts } = require('./contacts');
// Use module reference (not destructured) so tests can monkey-patch these
const runner = require('../state/runner');

const TRUST_ORDER = ['unverified', 'community', 'verified'];
const CURSOR_MAX_IDS = 200; // ring-buffer size for seenRouteIds in --no-ack mode

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read gateway + credentials from an installed persona's runtime files.
 * Returns null if the persona is not installed or has no ACN registration.
 *
 * @param {string} packDir - Absolute path to persona pack directory
 * @returns {{ gateway: string, agentId: string, apiKey: string }|null}
 */
function readAcnCredentials(packDir) {
  // Gateway from acn-config.json
  let gateway = 'https://acn-production.up.railway.app';
  try {
    const cfgPath = path.join(packDir, 'acn-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (cfg.acn_gateway && !cfg.acn_gateway.startsWith('<')) {
        gateway = cfg.acn_gateway;
      }
    }
  } catch { /* use default */ }

  // Agent ID + API key from acn-registration.json (camelCase, tolerate snake_case)
  const regPath = path.join(packDir, 'acn-registration.json');
  if (!fs.existsSync(regPath)) return null;
  try {
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
    const agentId = reg.agentId || reg.agent_id;
    const apiKey  = reg.apiKey  || reg.api_key;
    if (!agentId || !apiKey) return null;
    return { gateway, agentId, apiKey };
  } catch {
    return null;
  }
}

/**
 * Read the minimum incoming trust level from persona.json.
 * Returns null if not configured (accept all).
 *
 * @param {string} packDir
 * @returns {string|null} 'verified' | 'community' | 'unverified' | null
 */
function readMinIncomingTrust(packDir) {
  try {
    const personaPath = path.join(packDir, 'persona.json');
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    return persona?.social?.contacts?.minIncomingTrust || null;
  } catch {
    return null;
  }
}

/**
 * Look up a sender's trust level in the local contacts book.
 * Returns 'unverified' if not found.
 *
 * @param {string} fromAgentId
 * @param {Array} contacts - Array of contact objects from contacts.json
 * @returns {string} trust level
 */
function getTrustLevel(fromAgentId, contacts) {
  const contact = contacts.find((c) => c.acn_agent_id === fromAgentId);
  return (contact && contact.trust_level) || 'unverified';
}

/**
 * Return true if actualTrust meets or exceeds requiredTrust.
 *
 * @param {string} actual   - e.g. 'community'
 * @param {string} required - e.g. 'verified'
 * @returns {boolean}
 */
function meetsMinTrust(actual, required) {
  const actualIdx   = TRUST_ORDER.indexOf(actual);
  const requiredIdx = TRUST_ORDER.indexOf(required);
  if (actualIdx < 0 || requiredIdx < 0) return true; // unknown value → allow
  return actualIdx >= requiredIdx;
}

// ---------------------------------------------------------------------------
// Cursor (used only when opts.ack === false)
// ---------------------------------------------------------------------------

/**
 * @param {string} packDir
 * @returns {{ lastTimestamp: string|null, seenRouteIds: string[] }}
 */
function readCursor(packDir) {
  try {
    const p = path.join(packDir, 'social', '.poller-cursor.json');
    if (fs.existsSync(p)) {
      const c = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return {
        lastTimestamp: c.lastTimestamp || null,
        seenRouteIds:  Array.isArray(c.seenRouteIds) ? c.seenRouteIds : [],
      };
    }
  } catch { /* corrupt cursor → start fresh */ }
  return { lastTimestamp: null, seenRouteIds: [] };
}

/**
 * @param {string} packDir
 * @param {{ lastTimestamp: string, seenRouteIds: string[] }} cursor
 */
function writeCursor(packDir, cursor) {
  const ids = cursor.seenRouteIds.slice(-CURSOR_MAX_IDS); // keep newest N
  const data = { lastTimestamp: cursor.lastTimestamp, seenRouteIds: ids, updatedAt: new Date().toISOString() };
  const p = path.join(packDir, 'social', '.poller-cursor.json');
  const tmp = p + '.tmp';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Poll the ACN offline inbox for a persona and inject new messages into
 * state.json via state-sync write.
 *
 * @param {string} slug - Persona slug
 * @param {object} [opts]
 * @param {boolean} [opts.ack=true]      - Server-side ack (clear inbox after read). Use false for --no-ack mode.
 * @param {number}  [opts.limit=50]      - Max messages to fetch per poll (ACN hard-cap: 50)
 * @param {boolean} [opts.dryRun=false]  - Print without writing to state
 * @returns {Promise<{ received: number, filtered: number, injected: number, messages: Array }>}
 */
async function pollInbox(slug, opts = {}) {
  const { ack = true, limit = 50, dryRun = false } = opts;

  const packDir = runner.resolvePersonaDir(slug);
  if (!packDir) {
    throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);
  }

  const creds = readAcnCredentials(packDir);
  if (!creds) {
    throw new Error(
      `No ACN registration found for "${slug}". Register first with: openpersona social register ${slug}`
    );
  }

  // Load contacts for trust lookup
  const contactsData = loadContacts(slug);
  const contacts = (contactsData && contactsData.contacts) || [];

  const minTrust = readMinIncomingTrust(packDir);

  // Cursor (only relevant in no-ack mode)
  let cursor = ack ? { lastTimestamp: null, seenRouteIds: [] } : readCursor(packDir);

  // Fetch from ACN
  const messages = await getMessageHistory(creds.gateway, creds.agentId, creds.apiKey, { limit, ack });

  let filtered = 0;
  const accepted = [];

  for (const msg of messages) {
    const routeId   = msg.route_id || '';
    const timestamp = msg.timestamp || '';
    const fromAgent = msg.from_agent || '';

    // Deduplication (no-ack mode only)
    if (!ack) {
      if (
        cursor.lastTimestamp &&
        timestamp < cursor.lastTimestamp
      ) continue;
      if (
        timestamp === cursor.lastTimestamp &&
        cursor.seenRouteIds.includes(routeId)
      ) continue;
    }

    // Contact Trust Gate
    const trustLevel = getTrustLevel(fromAgent, contacts);
    if (minTrust && !meetsMinTrust(trustLevel, minTrust)) {
      filtered++;
      continue;
    }

    // Look up display name
    const contact = contacts.find((c) => c.acn_agent_id === fromAgent);
    const fromName = (contact && contact.name) || fromAgent;

    accepted.push({
      routeId,
      timestamp,
      fromAgent,
      fromName,
      trustLevel,
      rawMessage: msg.message || msg,
    });
  }

  // Update cursor in no-ack mode
  if (!ack && accepted.length > 0) {
    const newest = accepted[0]; // ACN returns newest-first
    const newSeenIds = [
      ...cursor.seenRouteIds,
      ...accepted.filter((m) => m.timestamp === newest.timestamp).map((m) => m.routeId),
    ];
    cursor = { lastTimestamp: newest.timestamp, seenRouteIds: newSeenIds };
    if (!dryRun) writeCursor(packDir, cursor);
  }

  if (accepted.length === 0) {
    return { received: messages.length, filtered, injected: 0, messages: [] };
  }

  // Build pendingCommands patch
  const pendingCommands = accepted.map((m) => ({
    type: 'a2a_message',
    source: 'acn_inbox',
    payload: {
      from_agent:   m.fromAgent,
      from_name:    m.fromName,
      trust_level:  m.trustLevel,
      route_id:     m.routeId,
      message:      m.rawMessage,
      received_at:  m.timestamp,
    },
  }));

  if (!dryRun) {
    runner.runStateSyncCommand(slug, ['write', JSON.stringify({ pendingCommands })]);
  }

  return {
    received: messages.length,
    filtered,
    injected: pendingCommands.length,
    messages: pendingCommands,
  };
}

module.exports = { pollInbox, readAcnCredentials, readMinIncomingTrust, getTrustLevel, meetsMinTrust };
