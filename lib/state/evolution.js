/**
 * OpenPersona - Evolution governance utilities
 */
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { OP_SKILLS_DIR, OPENCLAW_HOME, resolveSoulFile } = require('../utils');

/**
 * Generate and optionally print an evolution report for a persona.
 *
 * @param {string} slug - Persona slug
 * @param {object} [options]
 * @param {string} [options.skillsDir] - Override skills directory (for testing)
 * @param {string} [options.economyDir] - Override economy data directory (for testing)
 * @param {boolean} [options.quiet] - Suppress console output
 * @returns {{ state: object, personaName: string, selfNarrative: string, economicState: object|null }}
 */
async function evolveReport(slug, options = {}) {
  const skillsDir = options.skillsDir || OP_SKILLS_DIR;
  const quiet = options.quiet || false;
  const skillDir = path.join(skillsDir, `persona-${slug}`);

  if (!fs.existsSync(skillDir)) {
    throw new Error(`Persona not found: persona-${slug}`);
  }

  const statePath = resolveSoulFile(skillDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`No evolution state found for persona-${slug}. Is evolution enabled?`);
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  const personaPath = resolveSoulFile(skillDir, 'persona.json');
  let personaName = slug;
  if (fs.existsSync(personaPath)) {
    try {
      const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
      personaName = persona.personaName || slug;
    } catch { /* use slug as fallback */ }
  }

  const selfNarrativePath = resolveSoulFile(skillDir, 'self-narrative.md');
  let selfNarrative = '';
  if (fs.existsSync(selfNarrativePath)) {
    selfNarrative = fs.readFileSync(selfNarrativePath, 'utf-8').trim();
  }

  // Load economic state if economy faculty data exists
  const economyDataDir = options.economyDir ||
    path.join(OPENCLAW_HOME, 'economy', `persona-${slug}`);
  const economyStatePath = path.join(economyDataDir, 'economic-state.json');
  let economicState = null;
  if (fs.existsSync(economyStatePath)) {
    try {
      economicState = JSON.parse(fs.readFileSync(economyStatePath, 'utf-8'));
    } catch { /* ignore malformed file */ }
  }

  if (!quiet) {
    printReport(state, personaName, slug, selfNarrative, economicState);
  }

  return { state, personaName, selfNarrative, economicState };
}

function sumNestedObject(obj) {
  let s = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === 'number') s += v;
    else if (typeof v === 'object' && v !== null) s += sumNestedObject(v);
  }
  return s;
}

function printReport(state, personaName, slug, selfNarrative = '', economicState = null) {
  const lines = [];
  const sep = '─'.repeat(44);

  lines.push('');
  lines.push(chalk.bold(`  Evolution Report: ${personaName}`));
  lines.push(`  ${sep}`);

  lines.push(`  Slug:         ${state.personaSlug || slug}`);
  lines.push(`  Created:      ${state.createdAt || 'unknown'}`);
  lines.push(`  Last Updated: ${state.lastUpdatedAt || 'unknown'}`);
  lines.push('');

  const rel = state.relationship || {};
  lines.push(chalk.bold('  Relationship'));
  lines.push(`  Stage:        ${rel.stage || 'unknown'}`);
  lines.push(`  Interactions: ${rel.interactionCount || 0}`);
  if (rel.firstInteraction) lines.push(`  First:        ${rel.firstInteraction}`);
  if (rel.lastInteraction) lines.push(`  Last:         ${rel.lastInteraction}`);
  if (rel.stageHistory?.length) {
    lines.push(`  History:      ${rel.stageHistory.map((s) => s.stage || s).join(' → ')}`);
  }
  lines.push('');

  const mood = state.mood || {};
  lines.push(chalk.bold('  Mood'));
  lines.push(`  Current:      ${mood.current || 'neutral'} (intensity: ${mood.intensity ?? 0.5})`);
  lines.push(`  Baseline:     ${mood.baseline || 'neutral'}`);
  lines.push('');

  const traits = state.evolvedTraits || [];
  lines.push(chalk.bold('  Evolved Traits'));
  if (traits.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const t of traits) {
      if (typeof t === 'string') {
        lines.push(`  • ${t}`);
      } else {
        lines.push(`  • ${t.name || t.trait || JSON.stringify(t)}${t.acquiredAt ? ` (since ${t.acquiredAt})` : ''}`);
      }
    }
  }
  lines.push('');

  const drift = state.speakingStyleDrift || {};
  lines.push(chalk.bold('  Speaking Style Drift'));
  lines.push(`  Formality:       ${drift.formality || 0}`);
  lines.push(`  Emoji frequency: ${drift.emoji_frequency || 0}`);
  lines.push(`  Verbosity:       ${drift.verbosity || 0}`);
  lines.push('');

  const interests = state.interests || {};
  const interestEntries = Object.entries(interests);
  lines.push(chalk.bold('  Interests'));
  if (interestEntries.length === 0) {
    lines.push('  (none discovered yet)');
  } else {
    const sorted = interestEntries.sort((a, b) => b[1] - a[1]);
    for (const [topic, weight] of sorted) {
      const bar = '█'.repeat(Math.max(0, Math.min(Math.round(weight), 20)));
      lines.push(`  ${bar} ${topic} (${weight})`);
    }
  }
  lines.push('');

  const milestones = state.milestones || [];
  lines.push(chalk.bold('  Milestones'));
  if (milestones.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const m of milestones) {
      const ts = m.timestamp ? ` [${m.timestamp}]` : '';
      lines.push(`  ★ ${m.description || m.type || JSON.stringify(m)}${ts}`);
    }
  }

  const history = state.stateHistory || [];
  if (history.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  State History'));
    lines.push(`  Snapshots: ${history.length}`);
    const latest = history[history.length - 1];
    if (latest?.timestamp || latest?.lastUpdatedAt) {
      lines.push(`  Latest:    ${latest.timestamp || latest.lastUpdatedAt}`);
    }
  }

  const eventLog = state.eventLog || [];
  lines.push('');
  lines.push(chalk.bold('  Event Log') + chalk.dim('  (last 10)'));
  if (eventLog.length === 0) {
    lines.push('  (no events recorded yet)');
  } else {
    const recent = eventLog.slice(-10).reverse();
    for (const ev of recent) {
      const ts = ev.timestamp ? chalk.dim(`[${ev.timestamp}]`) : '';
      lines.push(`  ${ts} ${chalk.cyan(ev.type || 'unknown')}`);
      if (ev.trigger) lines.push(`    trigger: ${ev.trigger}`);
      if (ev.delta)   lines.push(`    delta:   ${ev.delta}`);
    }
  }

  lines.push('');
  lines.push(chalk.bold('  Self-Narrative') + chalk.dim('  (last 10 lines)'));
  if (!selfNarrative) {
    lines.push('  (no entries yet)');
  } else {
    const narrativeLines = selfNarrative.split('\n').filter((l) => l.trim());
    const recent = narrativeLines.slice(-10);
    for (const l of recent) {
      lines.push(`  ${l}`);
    }
  }

  // Economic summary (shown only if economy faculty data exists)
  if (economicState) {
    const bs = economicState.balanceSheet || {};
    const schemaVersion = economicState.version || '1.0.0';

    if (!schemaVersion.startsWith('2.')) {
      lines.push('  (economic-state schema version not supported)');
      return lines.join('\n');
    }
    const operationalBalance = bs.operationalBalance || 0;
    const operationalCurrency = bs.operationalCurrency || 'USD';
    const primaryProvider = bs.primaryProvider || 'local';
    const equity = bs.equity || {};

    const period = (economicState.incomeStatement || {}).currentPeriod || {};
    const allTime = (economicState.incomeStatement || {}).allTime || {};
    const expenses = period.expenses || {};
    const expTotal = expenses.total || 0;
    const tier = (economicState.vitality && economicState.vitality.tier) || 'unknown';
    const vitalityScore = economicState.vitality && economicState.vitality.score != null
      ? `  ${(economicState.vitality.score * 100).toFixed(1)}%`
      : '';
    const diagnosis = economicState.vitality && economicState.vitality.diagnosis
      ? `  [${economicState.vitality.diagnosis}]`
      : '';

    const tierColor = tier === 'normal' ? chalk.green
      : tier === 'optimizing' ? chalk.yellow
      : tier === 'critical' || tier === 'suspended' ? chalk.red
      : chalk.gray;

    lines.push('');
    lines.push(chalk.bold('  Economy') + chalk.dim('  (economy faculty)'));
    lines.push(`  Vitality Tier: ${tierColor(tier.toUpperCase())}${vitalityScore}${diagnosis}`);
    lines.push(`  Primary:       ${primaryProvider}  (${operationalCurrency})`);
    lines.push(`  Balance:       ${operationalBalance.toFixed(4)} ${operationalCurrency}`);

    // Show individual provider balances for v2
    if (schemaVersion.startsWith('2.') && bs.assets && bs.assets.providers) {
      const providers = bs.assets.providers;
      for (const [name, data] of Object.entries(providers)) {
        if (!data) continue;
        let bal = 0;
        let unit = '';
        if (name === 'local')        { bal = data.budget || 0;   unit = data.currency || 'USD'; }
        if (name === 'coinbase-cdp') { bal = data.USDC || 0;     unit = 'USDC'; }
        if (name === 'acn')          { bal = data.credits || 0;  unit = 'credits'; }
        if (name === 'onchain')      { bal = data.USDC || 0;     unit = 'USDC'; }
        if (bal === 0 && name !== primaryProvider) continue;
        const tag = name === primaryProvider ? chalk.dim(' ←') : '';
        lines.push(`    ${name}: ${bal.toFixed(4)} ${unit}${tag}`);
      }
    }

    lines.push('');
    lines.push(chalk.bold('  P&L') + chalk.dim(`  (period: ${period.periodStart || 'n/a'})`));
    lines.push(`  Revenue:       ${(period.revenue || 0).toFixed(4)}`);
    lines.push(`  Expenses:      ${expTotal.toFixed(4)}`);
    lines.push(`  Net Income:    ${(period.netIncome || 0).toFixed(4)}`);
    lines.push('');
    lines.push(chalk.bold('  Cost Structure'));
    if (expTotal === 0) {
      lines.push('  (no costs recorded yet)');
    } else {
      for (const cat of Object.keys(expenses)) {
        if (cat === 'total') continue;
        const val = expenses[cat];
        const catTotal = typeof val === 'number' ? val : sumNestedObject(val);
        if (catTotal === 0) continue;
        const pct = ((catTotal / expTotal) * 100).toFixed(1);
        lines.push(`  ${cat}: ${catTotal.toFixed(4)}  (${pct}%)`);
      }
    }
    lines.push('');
    lines.push(chalk.bold('  All Time'));
    lines.push(`  Revenue:       ${(allTime.totalRevenue || 0).toFixed(4)}`);
    lines.push(`  Expenses:      ${(allTime.totalExpenses || 0).toFixed(4)}`);
    lines.push(`  Net Income:    ${(allTime.netIncome || 0).toFixed(4)}`);
    lines.push(`  Accum. Equity: ${(equity.accumulatedNetIncome || 0).toFixed(4)}`);
  }

  lines.push(`\n  ${sep}`);
  console.log(lines.join('\n'));
}

// ── Soul-Memory Bridge ────────────────────────────────────────────────────────
/**
 * Scan an eventLog for recurring patterns and promote them to evolvedTraits.
 *
 * This is the programmatic Soul-Memory Bridge: it converts accumulated runtime
 * signals (recorded in state.json.eventLog) into durable soul-level trait changes
 * (evolvedTraits entries). No external memory backend is required — the eventLog
 * itself is the signal source.
 *
 * Promotion rules (default threshold = 3, configurable via persona.memory.promotionThreshold):
 *   interest_discovery  N+ events with same delta → trait "developed_interest_in_<delta>"
 *   trait_emergence     N+ events with same delta → trait "<delta>"  (already explicit)
 *   mood_shift          N+ events in same direction (delta starts with same mood word)
 *                       → trait "stable_<mood>_disposition"
 *
 * Gate: immutableTraits in evolution.boundaries are never promoted over.
 * Idempotent: traits already present in existingTraits are not duplicated.
 *
 * @param {object[]} eventLog           - state.json.eventLog array
 * @param {object}   persona            - persona.json object (for boundaries + threshold)
 * @param {object[]} [existingTraits]   - current state.json.evolvedTraits (to avoid duplicates)
 * @returns {object[]} Array of new evolvedTrait entries to append (empty if nothing to promote)
 */
function promoteToInstinct(eventLog, persona, existingTraits = []) {
  if (!Array.isArray(eventLog) || eventLog.length === 0) return [];

  const threshold = persona?.memory?.promotionThreshold ?? 3;
  const immutable  = new Set(
    (persona?.evolution?.instance?.boundaries?.immutableTraits ||
     persona?.evolution?.boundaries?.immutableTraits || [])
      .map(t => String(t).toLowerCase())
  );

  const existingKeys = new Set(
    existingTraits.map(t => (typeof t === 'string' ? t : t.trait || t.name || '')).map(s => s.toLowerCase())
  );

  // Group events by promotable key: type + normalised delta
  const groups = {};
  for (const ev of eventLog) {
    if (!ev || !ev.type || !ev.delta) continue;

    let key = null;
    let candidateTrait = null;

    if (ev.type === 'interest_discovery') {
      // Normalise: lowercase, collapse whitespace → underscore, strip non-alphanumeric/underscore.
      const topic = String(ev.delta).trim().toLowerCase()
        .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (topic) {
        key = `interest_discovery::${topic}`;
        candidateTrait = `developed_interest_in_${topic}`;
      }
    } else if (ev.type === 'trait_emergence') {
      // Same normalisation — trait names must be clean identifiers.
      const trait = String(ev.delta).trim().toLowerCase()
        .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (trait) {
        key = `trait_emergence::${trait}`;
        candidateTrait = trait;
      }
    } else if (ev.type === 'mood_shift') {
      // Extract first word and strip non-alphanumeric chars to produce a clean trait name.
      // E.g. "+0.2 joyful" → "joyful", "joy+0.3" → "joy03" (skip if empty after clean).
      const rawWord = String(ev.delta).trim().toLowerCase().split(/[\s_]/)[0];
      const moodWord = rawWord.replace(/[^a-z0-9]/g, '');
      if (moodWord) {
        key = `mood_shift::${moodWord}`;
        candidateTrait = `stable_${moodWord}_disposition`;
      }
    }

    if (key && candidateTrait) {
      if (!groups[key]) groups[key] = { candidateTrait, events: [] };
      groups[key].events.push(ev);
    }
  }

  const newTraits = [];
  const now = new Date().toISOString();

  for (const { candidateTrait, events } of Object.values(groups)) {
    if (events.length < threshold) continue;

    const traitKey = candidateTrait.toLowerCase();
    if (immutable.has(traitKey)) continue;        // gate: immutableTraits
    if (existingKeys.has(traitKey)) continue;     // idempotent

    newTraits.push({
      trait:         candidateTrait,
      acquiredAt:    now,
      source:        'memory_promotion',
      evidenceCount: events.length,
    });
    existingKeys.add(traitKey); // prevent duplicate within this call
  }

  return newTraits;
}

module.exports = { evolveReport, promoteToInstinct };
