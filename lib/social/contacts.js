/**
 * OpenPersona - Social Contacts library
 *
 * Local contact book for personas: load, save, add, remove, lookup, list, and log.
 * Contacts are stored in <packDir>/social/contacts.json (runtime read/write).
 * The pack directory is resolved via resolvePersonaDir(slug) — same three-level
 * fallback used by the state commands (registry → default path → legacy path).
 *
 * contacts.json schema: see schemas/social/contacts.schema.json
 * contacts.jsonl: append-only log of contact events, ≤ 4 KB per line, atomic write.
 */
const path = require('path');
const fs = require('fs-extra');
const runner = require('../state/runner');

const TRUST_LEVELS = ['verified', 'community', 'unverified'];
const CONTACT_SOURCES = ['manual', 'acn-sync', 'auto-discover', 'inbox'];
const MAX_JSONL_LINE = 4000; // bytes

/**
 * Resolve the contacts.json path for a slug, or null if the persona is not installed.
 * @param {string} slug
 * @returns {{ packDir: string, contactsPath: string, jsonlPath: string }|null}
 */
function resolveContactsPaths(slug) {
  const packDir = runner.resolvePersonaDir(slug);
  if (!packDir) return null;
  return {
    packDir,
    contactsPath: path.join(packDir, 'social', 'contacts.json'),
    jsonlPath: path.join(packDir, 'social', 'contacts.jsonl'),
  };
}

/**
 * Load contacts from the installed persona's contacts.json.
 * Returns the contacts object or null if persona is not installed.
 * Returns { schemaVersion, personaSlug, contacts: [] } if contacts.json doesn't exist
 * (e.g. contacts not enabled for this persona — caller can decide what to do).
 *
 * Lazy migration: if schemaVersion is missing or old, missing fields are tolerated.
 */
function loadContacts(slug) {
  const paths = resolveContactsPaths(slug);
  if (!paths) return null;

  const { contactsPath } = paths;
  if (!fs.existsSync(contactsPath)) {
    return { schemaVersion: '1.0.0', personaSlug: slug, contacts: [] };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
    // Lazy migration: ensure schemaVersion present
    if (!raw.schemaVersion) raw.schemaVersion = '1.0.0';
    if (!Array.isArray(raw.contacts)) raw.contacts = [];
    return raw;
  } catch (e) {
    throw new Error(`Failed to read contacts.json for "${slug}": ${e.message}`);
  }
}

/**
 * Save contacts atomically (write to tmp, then rename).
 */
function saveContacts(slug, data) {
  const paths = resolveContactsPaths(slug);
  if (!paths) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  const { contactsPath, packDir } = paths;
  const socialDir = path.join(packDir, 'social');
  fs.ensureDirSync(socialDir);

  const tmpPath = contactsPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, contactsPath);
}

/**
 * Add a contact to the contact book.
 * Throws if max_contacts limit is reached (read from persona.json or defaults to 500).
 *
 * @param {string} slug
 * @param {object} contact - Contact object (must include acn_agent_id, name, trust_level, source)
 * @param {{ source?: string }} [opts]
 */
function addContact(slug, contact, opts = {}) {
  if (!contact || typeof contact !== 'object') throw new Error('contact must be an object');
  if (!contact.acn_agent_id) throw new Error('contact.acn_agent_id is required');
  if (!contact.name) throw new Error('contact.name is required');

  const data = loadContacts(slug);
  if (!data) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  // Read max_contacts from persona.json (best-effort, default 500)
  const paths = resolveContactsPaths(slug);
  let maxContacts = 500;
  try {
    const personaPath = path.join(paths.packDir, 'persona.json');
    if (fs.existsSync(personaPath)) {
      const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
      maxContacts = persona.social?.contacts?.max_contacts || 500;
    }
  } catch { /* ignore — use default */ }

  if (data.contacts.length >= maxContacts) {
    throw new Error(
      `Contact book is full (max ${maxContacts}). Remove contacts with: openpersona social remove ${slug} <agent-id>`
    );
  }

  // Prevent duplicates
  const existingIdx = data.contacts.findIndex((c) => c.acn_agent_id === contact.acn_agent_id);
  const existing = existingIdx >= 0 ? data.contacts[existingIdx] : null;
  const now = new Date().toISOString();
  const entry = {
    acn_agent_id: contact.acn_agent_id,
    slug: contact.slug !== undefined ? contact.slug : (existing ? existing.slug : undefined),
    name: contact.name,
    endpoint: contact.endpoint !== undefined ? contact.endpoint : (existing ? existing.endpoint : undefined),
    // Preserve existing arrays if new value not provided
    skills: contact.skills !== undefined ? contact.skills : (existing ? existing.skills : []),
    subnet_ids: contact.subnet_ids !== undefined ? contact.subnet_ids : (existing ? existing.subnet_ids : []),
    wallet_address: contact.wallet_address !== undefined ? contact.wallet_address : (existing ? existing.wallet_address : undefined),
    agent_card_url: contact.agent_card_url !== undefined ? contact.agent_card_url : (existing ? existing.agent_card_url : undefined),
    trust_level: TRUST_LEVELS.includes(contact.trust_level) ? contact.trust_level
                 : (existing ? existing.trust_level : 'unverified'),
    tags: contact.tags !== undefined ? contact.tags : (existing ? existing.tags : []),
    notes: contact.notes !== undefined ? contact.notes : (existing ? existing.notes : undefined),
    source: CONTACT_SOURCES.includes(opts.source || contact.source) ? (opts.source || contact.source)
            : (existing ? existing.source : 'manual'),
    // Always preserved from existing on update
    first_seen: existing ? existing.first_seen : (contact.first_seen || now),
    last_seen: now,
    last_synced: contact.last_synced !== undefined ? contact.last_synced : (existing ? existing.last_synced : null),
    interaction_count: existing ? existing.interaction_count : (contact.interaction_count || 0),
  };

  if (existing) {
    data.contacts[existingIdx] = entry;
  } else {
    data.contacts.push(entry);
  }

  saveContacts(slug, data);
  appendContactLog(slug, { event: existing ? 'updated' : 'added', acn_agent_id: contact.acn_agent_id, source: entry.source });
  return entry;
}

/**
 * Remove a contact by acn_agent_id. Returns true if removed, false if not found.
 */
function removeContact(slug, agentId) {
  const data = loadContacts(slug);
  if (!data) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  const before = data.contacts.length;
  data.contacts = data.contacts.filter((c) => c.acn_agent_id !== agentId);
  if (data.contacts.length === before) return false;

  saveContacts(slug, data);
  appendContactLog(slug, { event: 'removed', acn_agent_id: agentId });
  return true;
}

/**
 * Look up contacts by query string.
 * Matches against acn_agent_id, slug, skills (contains), tags (contains).
 *
 * @param {string} slug
 * @param {string} query
 * @returns {Array}
 */
function lookupContact(slug, query) {
  const data = loadContacts(slug);
  if (!data) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  const q = query.toLowerCase();
  return data.contacts.filter((c) =>
    c.acn_agent_id === query ||
    (c.slug && c.slug.toLowerCase().includes(q)) ||
    (c.name && c.name.toLowerCase().includes(q)) ||
    (c.skills || []).some((s) => s.toLowerCase().includes(q)) ||
    (c.tags || []).some((t) => t.toLowerCase().includes(q))
  );
}

/**
 * List contacts with optional filter.
 * Filter is a parsed key=value pair (e.g. trust=community, tag=music, skill=music).
 *
 * @param {string} slug
 * @param {{ trust?: string, tag?: string, skill?: string }} [filter]
 * @returns {Array}
 */
function listContacts(slug, filter = {}) {
  const data = loadContacts(slug);
  if (!data) throw new Error(`Persona not installed: "${slug}". Install first with: openpersona install <source>`);

  let contacts = data.contacts;
  if (filter.trust) {
    contacts = contacts.filter((c) => c.trust_level === filter.trust);
  }
  if (filter.tag) {
    contacts = contacts.filter((c) => (c.tags || []).includes(filter.tag));
  }
  if (filter.skill) {
    const sk = filter.skill.toLowerCase();
    contacts = contacts.filter((c) => (c.skills || []).some((s) => s.toLowerCase().includes(sk)));
  }
  return contacts;
}

/**
 * Append a structured event to the contacts.jsonl log (append-only, ≤ 4 KB per line).
 * Uses a single fs.appendFileSync call for atomicity on same-process writes.
 *
 * @param {string} slug
 * @param {object} entry
 */
function appendContactLog(slug, entry) {
  const paths = resolveContactsPaths(slug);
  if (!paths) return;

  const { jsonlPath, packDir } = paths;
  const socialDir = path.join(packDir, 'social');
  fs.ensureDirSync(socialDir);

  const record = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  if (Buffer.byteLength(record) > MAX_JSONL_LINE) return; // silently skip oversized entries
  fs.appendFileSync(jsonlPath, record + '\n');
}

module.exports = {
  loadContacts,
  saveContacts,
  addContact,
  removeContact,
  lookupContact,
  listContacts,
  appendContactLog,
  resolveContactsPaths,
  TRUST_LEVELS,
  CONTACT_SOURCES,
};
