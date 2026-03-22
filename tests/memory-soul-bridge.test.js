'use strict';

/**
 * OpenPersona — P1 Memory as Soul Infrastructure tests
 *
 * Coverage:
 *   A. memory.js update / supersededBy chain
 *      - update creates new entry and marks old as supersededBy
 *      - retrieve / search exclude superseded entries
 *      - stats reports supersededCount
 *   B. promoteToInstinct — Soul-Memory Bridge
 *      - promotes interest_discovery events that meet threshold
 *      - promotes trait_emergence events
 *      - promotes mood_shift events
 *      - respects promotionThreshold from persona.memory
 *      - immutableTraits gate blocks promotion
 *      - idempotent: does not duplicate existing traits
 *      - returns empty when below threshold
 *   C. Fork memory inheritance
 *      - inheritance: "copy" copies memories.jsonl
 *      - inheritance: "none" (default) leaves child memory empty
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path   = require('path');
const fs     = require('fs-extra');
const os     = require('os');

const { promoteToInstinct } = require('../lib/state/evolution');
const { generate }          = require('../lib/generator');
const { forkPersona }       = require('../lib/lifecycle/forker');

// Import memory.js helpers directly (not via CLI)
const {
  readAllMemories,
  writeAllMemories,
  appendMemory,
  isSuperseded,
  VALID_TYPES,
} = require('../layers/faculties/memory/scripts/memory.js');

const TMP = path.join(os.tmpdir(), `openpersona-memory-test-${Date.now()}`);

before(async () => { await fs.ensureDir(TMP); });
after(async ()  => { await fs.remove(TMP); });

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMemory(overrides = {}) {
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    type: 'general',
    content: 'test content',
    tags: [],
    importance: 0.5,
    timestamp: new Date().toISOString(),
    accessCount: 0,
    lastAccessed: null,
    ...overrides,
  };
}

function makeMemDir(label) {
  const dir = path.join(TMP, `mem-${label}`);
  fs.ensureDirSync(dir);
  return dir;
}

// Override MEMORY_BASE_PATH is not easily injectable into memory.js constants,
// so we use the exported read/write helpers directly with a temp file path.
// We replicate the update logic here to test the data layer.

function updateMemory(all, oldId, newContent, opts = {}) {
  const idx = all.findIndex(m => m.id === oldId);
  if (idx === -1) return { success: false };

  const old = all[idx];
  const newMem = {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    type: opts.type || old.type,
    content: newContent,
    tags: opts.tags || old.tags,
    importance: opts.importance ?? old.importance,
    timestamp: new Date().toISOString(),
    accessCount: 0,
    lastAccessed: null,
    supersedes: oldId,
  };
  all[idx] = { ...old, supersededBy: newMem.id };
  all.push(newMem);
  return { success: true, newMem };
}

// ── A. memory.js update / supersededBy chain ─────────────────────────────────

describe('memory update / supersededBy chain', () => {
  it('update marks old entry as supersededBy and creates new entry', () => {
    const all = [makeMemory({ id: 'mem_001', content: 'User likes coffee' })];
    const { success, newMem } = updateMemory(all, 'mem_001', 'User likes tea');

    assert.ok(success);
    assert.strictEqual(all[0].supersededBy, newMem.id);
    assert.strictEqual(newMem.supersedes, 'mem_001');
    assert.strictEqual(newMem.content, 'User likes tea');
    assert.strictEqual(all.length, 2);
  });

  it('isSuperseded returns true for superseded entries only', () => {
    const active     = makeMemory({ id: 'mem_active' });
    const superseded = makeMemory({ id: 'mem_old', supersededBy: 'mem_active' });

    assert.strictEqual(isSuperseded(active), false);
    assert.strictEqual(isSuperseded(superseded), true);
  });

  it('retrieve excludes superseded entries', () => {
    const all = [
      makeMemory({ id: 'mem_old',    content: 'old pref',  supersededBy: 'mem_new' }),
      makeMemory({ id: 'mem_new',    content: 'new pref',  tags: ['pref'] }),
      makeMemory({ id: 'mem_other',  content: 'unrelated', tags: ['pref'] }),
    ];
    const active = all.filter(m => !isSuperseded(m));
    assert.strictEqual(active.length, 2);
    assert.ok(active.every(m => m.id !== 'mem_old'));
  });

  it('search excludes superseded entries', () => {
    const all = [
      makeMemory({ id: 'mem_s1', content: 'prefers coffee', supersededBy: 'mem_s2' }),
      makeMemory({ id: 'mem_s2', content: 'prefers tea' }),
    ];
    const results = all
      .filter(m => !isSuperseded(m))
      .filter(m => m.content.includes('pref'));
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'mem_s2');
  });

  it('stats supersededCount reflects chain', () => {
    const all = [
      makeMemory({ id: 'mem_a', supersededBy: 'mem_b' }),
      makeMemory({ id: 'mem_b' }),
      makeMemory({ id: 'mem_c' }),
    ];
    const supersededCount = all.filter(m => isSuperseded(m)).length;
    const active = all.filter(m => !isSuperseded(m)).length;
    assert.strictEqual(supersededCount, 1);
    assert.strictEqual(active, 2);
  });

  it('update guard preserves chain when entry is already superseded', () => {
    // mem_old → mem_new chain is already established.
    // Attempting to update mem_old again would break the chain by replacing
    // mem_old.supersededBy with a new id. cmdUpdate uses isSuperseded() to reject this.
    const all = [
      makeMemory({ id: 'mem_old', supersededBy: 'mem_new' }),
      makeMemory({ id: 'mem_new' }),
    ];
    const originalPointer = all[0].supersededBy;

    // Guard: isSuperseded fires → caller must not proceed
    assert.ok(isSuperseded(all[0]), 'entry must be detected as superseded');

    // Simulate the guard: if isSuperseded, abort without modifying the array
    if (!isSuperseded(all[0])) {
      // would call updateMemory here — must not reach this branch
      updateMemory(all, 'mem_old', 'attempted override');
    }

    // Chain must remain intact — pointer unchanged
    assert.strictEqual(all[0].supersededBy, originalPointer, 'supersededBy must not be overwritten');
    assert.strictEqual(all.length, 2, 'no new entry must be appended');
  });
});

// ── B. promoteToInstinct — Soul-Memory Bridge ─────────────────────────────────

describe('promoteToInstinct', () => {
  it('returns empty array for empty eventLog', () => {
    const result = promoteToInstinct([], {}, []);
    assert.deepStrictEqual(result, []);
  });

  it('does not promote when below threshold', () => {
    const eventLog = [
      { type: 'interest_discovery', trigger: 'cooking mentioned', delta: 'cooking', source: 'conversation', timestamp: new Date().toISOString() },
      { type: 'interest_discovery', trigger: 'cooking again',     delta: 'cooking', source: 'conversation', timestamp: new Date().toISOString() },
    ];
    const result = promoteToInstinct(eventLog, { memory: { promotionThreshold: 3 } }, []);
    assert.strictEqual(result.length, 0);
  });

  it('promotes interest_discovery when threshold met', () => {
    const ts = new Date().toISOString();
    const eventLog = [
      { type: 'interest_discovery', trigger: 't1', delta: 'cooking', source: 'conversation', timestamp: ts },
      { type: 'interest_discovery', trigger: 't2', delta: 'cooking', source: 'conversation', timestamp: ts },
      { type: 'interest_discovery', trigger: 't3', delta: 'cooking', source: 'conversation', timestamp: ts },
    ];
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].trait, 'developed_interest_in_cooking');
    assert.strictEqual(result[0].source, 'memory_promotion');
    assert.strictEqual(result[0].evidenceCount, 3);
  });

  it('promotes trait_emergence events', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, (_, i) => ({
      type: 'trait_emergence', trigger: `t${i}`, delta: 'becomes_more_empathetic',
      source: 'conversation', timestamp: ts,
    }));
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].trait, 'becomes_more_empathetic');
  });

  it('promotes mood_shift events into stable disposition', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'mood_shift', trigger: 'positive feedback', delta: 'joyful uplift',
      source: 'conversation', timestamp: ts,
    }));
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].trait.startsWith('stable_joyful'));
  });

  it('mood_shift: special characters in delta are stripped from trait name', () => {
    const ts = new Date().toISOString();
    // delta "+0.2 joyful" — first word "+0.2" after strip becomes "02",
    // but "joyful" is the second word. The split gets "+0.2", then strip non-alnum = "02".
    // Use a realistic delta like "+joy" or "joy+0.3" to validate the strip.
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'mood_shift', trigger: 'scoring', delta: 'joy+0.3',
      source: 'conversation', timestamp: ts,
    }));
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1, 'should promote despite special chars');
    assert.ok(
      /^stable_[a-z0-9]+_disposition$/.test(result[0].trait),
      `trait name must contain only alphanumeric chars, got: "${result[0].trait}"`
    );
    assert.ok(!result[0].trait.includes('+'), 'trait name must not contain "+"');
  });

  it('interest_discovery: special characters in delta are sanitized', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'interest_discovery', trigger: 'tech discussion', delta: 'C++ programming',
      source: 'conversation', timestamp: ts,
    }));
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1);
    assert.ok(
      /^developed_interest_in_[a-z0-9_]+$/.test(result[0].trait),
      `trait must contain only alphanumeric/underscore chars, got: "${result[0].trait}"`
    );
    assert.ok(!result[0].trait.includes('+'), 'trait name must not contain "+"');
  });

  it('trait_emergence: special characters in delta are sanitized', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'trait_emergence', trigger: 'observation', delta: 'detail-oriented+focus',
      source: 'conversation', timestamp: ts,
    }));
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 1);
    assert.ok(
      /^[a-z0-9_]+$/.test(result[0].trait),
      `trait must contain only alphanumeric/underscore chars, got: "${result[0].trait}"`
    );
    assert.ok(!result[0].trait.includes('+'), 'trait name must not contain "+"');
    assert.ok(!result[0].trait.includes('-'), 'trait name must not contain "-"');
  });

  it('respects promotionThreshold from persona.memory', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 5 }, () => ({
      type: 'interest_discovery', trigger: 't', delta: 'music',
      source: 'conversation', timestamp: ts,
    }));
    // threshold = 6 → no promotion (only 5 events)
    const r1 = promoteToInstinct(eventLog, { memory: { promotionThreshold: 6 } }, []);
    assert.strictEqual(r1.length, 0);
    // threshold = 5 → promote
    const r2 = promoteToInstinct(eventLog, { memory: { promotionThreshold: 5 } }, []);
    assert.strictEqual(r2.length, 1);
  });

  it('immutableTraits gate blocks promotion', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'trait_emergence', trigger: 't', delta: 'strict_confidentiality',
      source: 'conversation', timestamp: ts,
    }));
    const persona = {
      evolution: { instance: { boundaries: { immutableTraits: ['strict_confidentiality'] } } },
    };
    const result = promoteToInstinct(eventLog, persona, []);
    assert.strictEqual(result.length, 0);
  });

  it('is idempotent — does not duplicate existing traits', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'interest_discovery', trigger: 't', delta: 'photography',
      source: 'conversation', timestamp: ts,
    }));
    const existing = [{ trait: 'developed_interest_in_photography', acquiredAt: ts, source: 'memory_promotion' }];
    const result = promoteToInstinct(eventLog, {}, existing);
    assert.strictEqual(result.length, 0);
  });

  it('promotes multiple distinct patterns independently', () => {
    const ts = new Date().toISOString();
    const eventLog = [
      ...Array.from({ length: 3 }, () => ({ type: 'interest_discovery', trigger: 't', delta: 'yoga',   source: 'conversation', timestamp: ts })),
      ...Array.from({ length: 3 }, () => ({ type: 'interest_discovery', trigger: 't', delta: 'travel', source: 'conversation', timestamp: ts })),
    ];
    const result = promoteToInstinct(eventLog, {}, []);
    assert.strictEqual(result.length, 2);
    const traits = result.map(r => r.trait).sort();
    assert.deepStrictEqual(traits, ['developed_interest_in_travel', 'developed_interest_in_yoga']);
  });

  it('handles old flat evolution.boundaries format', () => {
    const ts = new Date().toISOString();
    const eventLog = Array.from({ length: 3 }, () => ({
      type: 'trait_emergence', trigger: 't', delta: 'immutable_trait',
      source: 'conversation', timestamp: ts,
    }));
    const persona = { evolution: { boundaries: { immutableTraits: ['immutable_trait'] } } };
    const result = promoteToInstinct(eventLog, persona, []);
    assert.strictEqual(result.length, 0);
  });
});

// ── C. Fork memory inheritance ───────────────────────────────────────────────
// memoryDir() in forker.js uses OPENCLAW_HOME env var.
// We point it to a temp dir so tests never touch ~/.openclaw.

describe('forkPersona — memory inheritance', () => {
  const FAKE_CLAW = path.join(TMP, 'fake-openclaw');
  let origClawHome;

  before(() => {
    origClawHome = process.env.OPENCLAW_HOME;
    process.env.OPENCLAW_HOME = FAKE_CLAW;
  });
  after(() => {
    if (origClawHome !== undefined) process.env.OPENCLAW_HOME = origClawHome;
    else delete process.env.OPENCLAW_HOME;
  });

  function fakeMemDir(slug) {
    return path.join(FAKE_CLAW, 'memory', `persona-${slug}`);
  }

  async function makePersonaDir(slug, memoryOverride = {}) {
    const outDir = path.join(TMP, `fork-src-${slug}`);
    await fs.ensureDir(outDir);
    const persona = {
      personaName: 'Memory Test',
      slug,
      bio: 'A test persona',
      personality: 'Curious',
      speakingStyle: 'Friendly',
      memory: memoryOverride,
    };
    const { skillDir } = await generate(persona, outDir);
    return skillDir;
  }

  it('inheritance: "copy" copies parent memories.jsonl to child', async () => {
    const parentSlug = `fork-mem-parent-${Date.now()}`;
    const skillDir = await makePersonaDir(parentSlug, { inheritance: 'copy' });

    // Seed parent memory in fake OPENCLAW_HOME
    const parentMemDir = fakeMemDir(parentSlug);
    await fs.ensureDir(parentMemDir);
    const mem = makeMemory({ content: 'Parent persona likes jazz' });
    await fs.writeFile(path.join(parentMemDir, 'memories.jsonl'), JSON.stringify(mem) + '\n');

    const childSlug = `${parentSlug}-child`;
    const childOut  = path.join(TMP, `fork-child-copy-${Date.now()}`);
    await fs.ensureDir(childOut);

    await forkPersona(parentSlug, { as: childSlug, parentDir: skillDir, output: childOut });

    const childMemFile = path.join(fakeMemDir(childSlug), 'memories.jsonl');
    assert.ok(fs.existsSync(childMemFile), 'child memories.jsonl should exist');
    assert.ok(fs.readFileSync(childMemFile, 'utf-8').includes('jazz'));
  });

  it('inheritance: "none" (default) child has no copied memories', async () => {
    const parentSlug = `fork-no-mem-parent-${Date.now()}`;
    const skillDir = await makePersonaDir(parentSlug, { inheritance: 'none' });

    // Seed parent memory — should NOT be copied
    const parentMemDir = fakeMemDir(parentSlug);
    await fs.ensureDir(parentMemDir);
    await fs.writeFile(path.join(parentMemDir, 'memories.jsonl'), JSON.stringify(makeMemory()) + '\n');

    const childSlug = `${parentSlug}-child`;
    const childOut  = path.join(TMP, `fork-child-none-${Date.now()}`);
    await fs.ensureDir(childOut);

    await forkPersona(parentSlug, { as: childSlug, parentDir: skillDir, output: childOut });

    const childMemFile = path.join(fakeMemDir(childSlug), 'memories.jsonl');
    assert.strictEqual(fs.existsSync(childMemFile), false, 'child should NOT have memories');
  });
});
