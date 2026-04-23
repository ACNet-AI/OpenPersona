'use strict';
/**
 * OpenPersona - Refine protection for Social Contacts
 *
 * Ensures regeneratePack (called by refine) does NOT overwrite
 * social/contacts.json, social/contacts.jsonl, or social/.poller-cursor.json.
 *
 *  1. GENERATED_PACK_FILES constant does not include contacts paths
 *  2. regeneratePack copies only SKILL.md and agent-card.json (structural test)
 *  3. contacts.json survives a simulated regeneratePack call
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');

describe('refine protection for social contacts', () => {
  let tmpPersonaDir;
  let tmpGenOutDir;

  before(async () => {
    tmpPersonaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-refine-protect-persona-'));
    tmpGenOutDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'op-refine-protect-gen-'));

    // Set up a fake installed persona
    await fs.writeFile(path.join(tmpPersonaDir, 'persona.json'), JSON.stringify({ slug: 'refine-test' }));
    await fs.writeFile(path.join(tmpPersonaDir, 'SKILL.md'), '# Old SKILL.md');
    await fs.writeFile(path.join(tmpPersonaDir, 'agent-card.json'), JSON.stringify({ name: 'Old' }));
    await fs.ensureDir(path.join(tmpPersonaDir, 'social'));
    await fs.writeFile(
      path.join(tmpPersonaDir, 'social', 'contacts.json'),
      JSON.stringify({ schemaVersion: '1.0.0', personaSlug: 'refine-test', contacts: [{ acn_agent_id: 'keep-me' }] })
    );
    await fs.writeFile(path.join(tmpPersonaDir, 'social', 'contacts.jsonl'), '{"event":"old"}\n');
    await fs.writeFile(path.join(tmpPersonaDir, 'social', '.poller-cursor.json'), '{"cursor":"old"}');

    // Set up fake generated output (what generate() would produce in a tempdir)
    const genSkillDir = path.join(tmpGenOutDir, 'persona-refine-test');
    await fs.ensureDir(genSkillDir);
    await fs.writeFile(path.join(genSkillDir, 'SKILL.md'), '# New SKILL.md');
    await fs.writeFile(path.join(genSkillDir, 'agent-card.json'), JSON.stringify({ name: 'New' }));
    await fs.ensureDir(path.join(genSkillDir, 'social'));
    await fs.writeFile(
      path.join(genSkillDir, 'social', 'contacts.json'),
      JSON.stringify({ schemaVersion: '1.0.0', personaSlug: 'refine-test', contacts: [] })
    );
  });

  after(async () => {
    await fs.remove(tmpPersonaDir);
    await fs.remove(tmpGenOutDir);
  });

  it('GENERATED_PACK_FILES does not include contacts paths', () => {
    const refineSource = fs.readFileSync(
      path.join(__dirname, '..', 'lib', 'lifecycle', 'refine.js'),
      'utf-8'
    );
    // Ensure contacts.json is NOT in GENERATED_PACK_FILES
    const match = refineSource.match(/GENERATED_PACK_FILES\s*=\s*\[([^\]]+)\]/);
    assert.ok(match, 'GENERATED_PACK_FILES must be defined in refine.js');
    const fileList = match[1];
    assert.ok(!fileList.includes('contacts.json'), 'contacts.json must not be in GENERATED_PACK_FILES');
    assert.ok(!fileList.includes('contacts.jsonl'), 'contacts.jsonl must not be in GENERATED_PACK_FILES');
  });

  it('contacts.json survives simulated regeneratePack (only SKILL.md and agent-card.json are copied)', () => {
    const GENERATED_PACK_FILES = ['SKILL.md', 'agent-card.json'];
    const genSkillDir = path.join(tmpGenOutDir, 'persona-refine-test');

    // Simulate what regeneratePack does
    for (const f of GENERATED_PACK_FILES) {
      const src = path.join(genSkillDir, f);
      if (fs.existsSync(src)) fs.copySync(src, path.join(tmpPersonaDir, f));
    }

    // SKILL.md and agent-card.json were updated
    assert.equal(fs.readFileSync(path.join(tmpPersonaDir, 'SKILL.md'), 'utf-8'), '# New SKILL.md');
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmpPersonaDir, 'agent-card.json'), 'utf-8')).name, 'New');

    // contacts.json was NOT overwritten
    const contacts = JSON.parse(fs.readFileSync(path.join(tmpPersonaDir, 'social', 'contacts.json'), 'utf-8'));
    assert.equal(contacts.contacts[0]?.acn_agent_id, 'keep-me', 'contacts.json must be preserved');

    // contacts.jsonl was NOT touched
    const jsonlContent = fs.readFileSync(path.join(tmpPersonaDir, 'social', 'contacts.jsonl'), 'utf-8');
    assert.ok(jsonlContent.includes('"old"'), 'contacts.jsonl must be preserved');

    // .poller-cursor.json was NOT touched
    const cursorContent = fs.readFileSync(path.join(tmpPersonaDir, 'social', '.poller-cursor.json'), 'utf-8');
    assert.ok(cursorContent.includes('"old"'), '.poller-cursor.json must be preserved');
  });
});
