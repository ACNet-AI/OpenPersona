#!/usr/bin/env node
/**
 * OpenPersona Memory Faculty — Cross-session memory store
 *
 * Usage:
 *   node memory.js store <content> --tags <csv> --importance <0-1> [--type <type>]
 *   node memory.js retrieve [--tags <csv>] [--limit N] [--since <ISO-date>]
 *   node memory.js search <query> [--limit N]
 *   node memory.js forget <memory-id>
 *   node memory.js stats
 *
 * Environment variables:
 *   MEMORY_PROVIDER   - "local" (default), "mem0", or "zep"
 *   MEMORY_API_KEY    - API key for external providers
 *   MEMORY_BASE_PATH  - Override storage directory
 *   PERSONA_SLUG      - Current persona slug (set by OpenClaw)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---

const PERSONA_SLUG = process.env.PERSONA_SLUG || 'default';
const PROVIDER = process.env.MEMORY_PROVIDER || 'local';
const BASE_PATH = process.env.MEMORY_BASE_PATH ||
  path.join(process.env.HOME || '~', '.openclaw', 'memory', `persona-${PERSONA_SLUG}`);
const MEMORY_FILE = path.join(BASE_PATH, 'memories.jsonl');

const VALID_TYPES = ['preference', 'personal_fact', 'interest_signal', 'emotional_moment', 'milestone', 'general'];

// --- Argument parsing ---

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return showHelp();

  const command = args[0];
  const opts = { command, content: '', tags: [], importance: 0.5, type: 'general', limit: 10, since: null, id: null };
  let i = 1;

  if ((command === 'store' || command === 'search') && args[1] && !args[1].startsWith('--')) {
    opts.content = args[1];
    i = 2;
  }
  if (command === 'forget' && args[1] && !args[1].startsWith('--')) {
    opts.id = args[1];
    i = 2;
  }

  while (i < args.length) {
    switch (args[i]) {
      case '--tags':       opts.tags = (args[++i] || '').split(',').map(t => t.trim()).filter(Boolean); break;
      case '--importance': { const v = parseFloat(args[++i]); opts.importance = isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)); break; }
      case '--type':       opts.type = args[++i] || 'general'; break;
      case '--limit':     { const v = parseInt(args[++i], 10); opts.limit = isNaN(v) || v < 1 ? 10 : v; break; }
      case '--since':      opts.since = args[++i] || null; break;
      default: break;
    }
    i++;
  }
  return opts;
}

function showHelp() {
  console.log(`
Usage: node memory.js <command> [options]

Commands:
  store <content>     Store a new memory
    --tags <csv>        Comma-separated tags
    --importance <0-1>  Importance weight (default: 0.5)
    --type <type>       Memory type: preference, personal_fact, interest_signal,
                        emotional_moment, milestone, general (default: general)

  retrieve              Retrieve memories
    --tags <csv>        Filter by tags (OR match)
    --limit <N>         Max results (default: 10)
    --since <ISO-date>  Only memories after this date

  search <query>        Search memories by content
    --limit <N>         Max results (default: 10)

  forget <memory-id>    Delete a specific memory

  stats                 Show memory store statistics

Environment:
  MEMORY_PROVIDER    local (default), mem0, zep
  MEMORY_API_KEY     API key for external providers
  MEMORY_BASE_PATH   Override storage path
  PERSONA_SLUG       Current persona slug
`);
  process.exit(0);
}

// --- Local provider implementation ---

function ensureDir() {
  if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
  }
}

function readAllMemories() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  const lines = fs.readFileSync(MEMORY_FILE, 'utf-8').split('\n').filter(Boolean);
  const memories = [];
  for (const line of lines) {
    try { memories.push(JSON.parse(line)); } catch { /* skip corrupted */ }
  }
  return memories;
}

function writeAllMemories(memories) {
  ensureDir();
  const data = memories.map(m => JSON.stringify(m)).join('\n') + (memories.length ? '\n' : '');
  fs.writeFileSync(MEMORY_FILE, data);
}

function appendMemory(memory) {
  ensureDir();
  fs.appendFileSync(MEMORY_FILE, JSON.stringify(memory) + '\n');
}

function timeDecayScore(memory, now) {
  const age = (now - new Date(memory.timestamp).getTime()) / (1000 * 60 * 60 * 24);
  const decay = Math.exp(-0.01 * age);
  const accessBoost = Math.min(0.2, (memory.accessCount || 0) * 0.02);
  return (memory.importance ?? 0.5) * decay + accessBoost;
}

// --- Commands ---

function cmdStore(opts) {
  if (!opts.content) {
    console.error('[ERROR] No content provided');
    process.exit(1);
  }
  if (!VALID_TYPES.includes(opts.type)) {
    console.error(`[ERROR] Invalid type "${opts.type}". Valid: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const memory = {
    id: 'mem_' + crypto.randomBytes(8).toString('hex'),
    type: opts.type,
    content: opts.content,
    tags: opts.tags,
    importance: opts.importance,
    timestamp: new Date().toISOString(),
    accessCount: 0,
    lastAccessed: null,
  };

  appendMemory(memory);
  console.log(JSON.stringify({ success: true, action: 'store', memory }));
}

function cmdRetrieve(opts) {
  const now = Date.now();
  let memories = readAllMemories();

  if (opts.tags.length > 0) {
    memories = memories.filter(m =>
      m.tags && m.tags.some(t => opts.tags.includes(t))
    );
  }
  if (opts.since) {
    const sinceTs = new Date(opts.since).getTime();
    memories = memories.filter(m => new Date(m.timestamp).getTime() >= sinceTs);
  }

  memories.sort((a, b) => timeDecayScore(b, now) - timeDecayScore(a, now));
  memories = memories.slice(0, opts.limit);

  // Update access counts
  if (memories.length > 0) {
    const ids = new Set(memories.map(m => m.id));
    const all = readAllMemories();
    const accessTime = new Date().toISOString();
    for (const m of all) {
      if (ids.has(m.id)) {
        m.accessCount = (m.accessCount || 0) + 1;
        m.lastAccessed = accessTime;
      }
    }
    writeAllMemories(all);
  }

  console.log(JSON.stringify({ success: true, action: 'retrieve', count: memories.length, memories }));
}

function cmdSearch(opts) {
  if (!opts.content) {
    console.error('[ERROR] No search query provided');
    process.exit(1);
  }

  const now = Date.now();
  const query = opts.content.toLowerCase();
  let memories = readAllMemories();

  memories = memories
    .map(m => {
      const contentMatch = (m.content || '').toLowerCase().includes(query) ? 1 : 0;
      const tagMatch = (m.tags || []).some(t => t.toLowerCase().includes(query)) ? 0.5 : 0;
      const relevance = contentMatch + tagMatch;
      return { ...m, _relevance: relevance };
    })
    .filter(m => m._relevance > 0)
    .sort((a, b) => {
      const scoreDiff = b._relevance - a._relevance;
      if (scoreDiff !== 0) return scoreDiff;
      return timeDecayScore(b, now) - timeDecayScore(a, now);
    })
    .slice(0, opts.limit);

  // Strip internal scoring field
  const results = memories.map(({ _relevance, ...rest }) => rest);
  console.log(JSON.stringify({ success: true, action: 'search', query: opts.content, count: results.length, memories: results }));
}

function cmdForget(opts) {
  if (!opts.id) {
    console.error('[ERROR] No memory ID provided');
    process.exit(1);
  }

  const memories = readAllMemories();
  const before = memories.length;
  const filtered = memories.filter(m => m.id !== opts.id);

  if (filtered.length === before) {
    console.log(JSON.stringify({ success: false, action: 'forget', error: `Memory ${opts.id} not found` }));
    process.exit(1);
  }

  writeAllMemories(filtered);
  console.log(JSON.stringify({ success: true, action: 'forget', id: opts.id, remaining: filtered.length }));
}

function cmdStats() {
  const memories = readAllMemories();
  if (memories.length === 0) {
    console.log(JSON.stringify({ success: true, action: 'stats', totalMemories: 0, topTags: [], oldestMemory: null, newestMemory: null, avgImportance: 0 }));
    return;
  }

  const tagCounts = {};
  let importanceSum = 0;
  for (const m of memories) {
    importanceSum += m.importance || 0;
    for (const t of (m.tags || [])) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const sorted = [...memories].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  console.log(JSON.stringify({
    success: true,
    action: 'stats',
    totalMemories: memories.length,
    topTags,
    oldestMemory: sorted[0].timestamp,
    newestMemory: sorted[sorted.length - 1].timestamp,
    avgImportance: Math.round((importanceSum / memories.length) * 100) / 100,
  }));
}

// --- External provider dispatch ---

async function dispatchExternal(opts) {
  console.error(`[ERROR] Provider "${PROVIDER}" is not yet implemented.`);
  console.error('  Supported providers: local (default)');
  console.error('  Mem0 and Zep support is experimental — install their SDK and contribute an adapter.');
  process.exit(1);
}

// --- Main ---

function main() {
  const opts = parseArgs(process.argv);
  if (!opts) return;

  if (PROVIDER !== 'local') {
    return dispatchExternal(opts);
  }

  switch (opts.command) {
    case 'store':    return cmdStore(opts);
    case 'retrieve': return cmdRetrieve(opts);
    case 'search':   return cmdSearch(opts);
    case 'forget':   return cmdForget(opts);
    case 'stats':    return cmdStats(opts);
    default:
      console.error(`[ERROR] Unknown command: ${opts.command}`);
      showHelp();
  }
}

if (require.main === module) {
  main();
}

module.exports = { readAllMemories, writeAllMemories, appendMemory, timeDecayScore, VALID_TYPES, main };
