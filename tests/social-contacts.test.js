'use strict';
/**
 * OpenPersona - Social Contacts CRUD tests
 *
 * Tests for lib/social/contacts.js:
 *  1. loadContacts returns null for non-installed slug
 *  2. addContact creates a new contact
 *  3. addContact updates an existing contact (preserves first_seen, interaction_count)
 *  4. addContact rejects when max_contacts is reached
 *  5. removeContact removes by acn_agent_id
 *  6. removeContact returns false for unknown agent-id
 *  7. lookupContact matches by name, skill, tag
 *  8. listContacts filters by trust level
 *  9. listContacts filters by tag
 * 10. listContacts filters by skill
 * 11. appendContactLog writes a jsonl line (≤ 4KB)
 * 12. appendContactLog silently skips oversized entries
 * 13. Uninstalled slug gives friendly error on CRUD
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');

const contactsModule = require('../lib/social/contacts');
const runner = require('../lib/state/runner');

describe('social contacts CRUD', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-social-contacts-'));
    // Create a fake persona.json so max_contacts can be read
    await fs.writeFile(
      path.join(tmpDir, 'persona.json'),
      JSON.stringify({ slug: 'test-persona', social: { contacts: { max_contacts: 3 } } })
    );
    // Create social/ dir with empty contacts.json
    await fs.ensureDir(path.join(tmpDir, 'social'));
    await fs.writeFile(
      path.join(tmpDir, 'social', 'contacts.json'),
      JSON.stringify({ schemaVersion: '1.0.0', personaSlug: 'test-persona', contacts: [] })
    );
    // Monkey-patch resolvePersonaDir
    runner._origResolve = runner.resolvePersonaDir;
    runner.resolvePersonaDir = (slug) => (slug === 'test-persona' ? tmpDir : null);
  });

  after(async () => {
    runner.resolvePersonaDir = runner._origResolve;
    await fs.remove(tmpDir);
  });

  it('loadContacts returns null for non-installed slug', () => {
    const data = contactsModule.loadContacts('nonexistent-slug');
    assert.equal(data, null);
  });

  it('loadContacts returns empty list for installed slug with no contacts', () => {
    const data = contactsModule.loadContacts('test-persona');
    assert.ok(data);
    assert.deepEqual(data.contacts, []);
  });

  it('addContact creates a new contact', () => {
    const entry = contactsModule.addContact('test-persona', {
      acn_agent_id: 'agent-001',
      name: 'Alice',
      skills: ['music'],
      trust_level: 'community',
    }, { source: 'manual' });
    assert.equal(entry.acn_agent_id, 'agent-001');
    assert.equal(entry.name, 'Alice');
    assert.equal(entry.trust_level, 'community');
    assert.equal(entry.source, 'manual');
    assert.ok(entry.first_seen);

    const data = contactsModule.loadContacts('test-persona');
    assert.equal(data.contacts.length, 1);
  });

  it('addContact updates existing contact and preserves first_seen + interaction_count + skills', () => {
    const original = contactsModule.loadContacts('test-persona').contacts[0];
    const originalFirstSeen = original.first_seen;

    const updated = contactsModule.addContact('test-persona', {
      acn_agent_id: 'agent-001',
      name: 'Alice Updated',
      trust_level: 'verified',
      // intentionally omit skills — must be preserved from original
    }, { source: 'acn-sync' });

    assert.equal(updated.name, 'Alice Updated');
    assert.equal(updated.trust_level, 'verified');
    assert.equal(updated.first_seen, originalFirstSeen, 'first_seen must be preserved');
    assert.equal(updated.interaction_count, original.interaction_count, 'interaction_count preserved');
    assert.deepEqual(updated.skills, ['music'], 'skills array preserved from original when omitted in update');

    const data = contactsModule.loadContacts('test-persona');
    assert.equal(data.contacts.length, 1, 'no duplicate created');

    // Verify jsonl records event='updated' (R23 — was broken by existing>=0 type bug)
    const jsonlPath = path.join(tmpDir, 'social', 'contacts.jsonl');
    assert.ok(fs.existsSync(jsonlPath), 'contacts.jsonl created');
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n').filter(Boolean);
    const hasUpdatedEvent = lines.some((l) => {
      try { return JSON.parse(l).event === 'updated'; } catch { return false; }
    });
    assert.ok(hasUpdatedEvent, 'contacts.jsonl must contain an event="updated" entry after addContact on existing');
  });

  it('addContact rejects when max_contacts (3) is reached', () => {
    contactsModule.addContact('test-persona', { acn_agent_id: 'agent-002', name: 'Bob' });
    contactsModule.addContact('test-persona', { acn_agent_id: 'agent-003', name: 'Carol' });

    const data = contactsModule.loadContacts('test-persona');
    assert.equal(data.contacts.length, 3);

    assert.throws(
      () => contactsModule.addContact('test-persona', { acn_agent_id: 'agent-004', name: 'Dave' }),
      /Contact book is full/
    );
  });

  it('removeContact removes an existing contact', () => {
    const removed = contactsModule.removeContact('test-persona', 'agent-003');
    assert.equal(removed, true);
    const data = contactsModule.loadContacts('test-persona');
    assert.equal(data.contacts.length, 2);
  });

  it('removeContact returns false for unknown agent-id', () => {
    const removed = contactsModule.removeContact('test-persona', 'does-not-exist');
    assert.equal(removed, false);
  });

  it('lookupContact matches by name', () => {
    const results = contactsModule.lookupContact('test-persona', 'alice');
    assert.equal(results.length, 1);
    assert.equal(results[0].acn_agent_id, 'agent-001');
  });

  it('lookupContact matches by skill', () => {
    const results = contactsModule.lookupContact('test-persona', 'music');
    assert.ok(results.some((c) => c.acn_agent_id === 'agent-001'));
  });

  it('listContacts filters by trust level', () => {
    const results = contactsModule.listContacts('test-persona', { trust: 'verified' });
    assert.ok(results.every((c) => c.trust_level === 'verified'));
  });

  it('listContacts with no filter returns all', () => {
    const results = contactsModule.listContacts('test-persona');
    assert.equal(results.length, 2);
  });

  it('appendContactLog writes a jsonl line', () => {
    contactsModule.appendContactLog('test-persona', { event: 'test', acn_agent_id: 'agent-001' });
    const jsonlPath = path.join(tmpDir, 'social', 'contacts.jsonl');
    assert.ok(fs.existsSync(jsonlPath), 'contacts.jsonl created');
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.event, 'test');
    assert.ok(last.timestamp, 'timestamp auto-added');
  });

  it('appendContactLog silently skips oversized entries', () => {
    const jsonlPath = path.join(tmpDir, 'social', 'contacts.jsonl');
    const before = fs.existsSync(jsonlPath) ? fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean).length : 0;
    const bigEntry = { event: 'oversized', data: 'x'.repeat(5000) };
    // Should not throw
    contactsModule.appendContactLog('test-persona', bigEntry);
    const after = fs.existsSync(jsonlPath) ? fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean).length : 0;
    assert.equal(after, before, 'no new line written for oversized entry');
  });

  it('CRUD on uninstalled slug throws friendly error', () => {
    assert.throws(
      () => contactsModule.addContact('not-installed', { acn_agent_id: 'x', name: 'Y' }),
      /not installed/
    );
    assert.throws(
      () => contactsModule.removeContact('not-installed', 'x'),
      /not installed/
    );
    assert.throws(
      () => contactsModule.lookupContact('not-installed', 'query'),
      /not installed/
    );
    assert.throws(
      () => contactsModule.listContacts('not-installed'),
      /not installed/
    );
  });
});
