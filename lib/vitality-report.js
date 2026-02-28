'use strict';

/**
 * OpenPersona Vitality HTML Report
 *
 * Aggregates persona identity, evolution state, and financial health into
 * a single HTML report rendered from templates/vitality.template.html.
 *
 * Usage:
 *   const { renderVitalityHtml } = require('./vitality-report');
 *   const html = renderVitalityHtml(personaDir, slug);
 */

const fs       = require('fs-extra');
const path     = require('path');
const Mustache = require('mustache');
const { calcVitality }            = require('./vitality');
const { resolveSoulFile, OPENCLAW_HOME } = require('./utils');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'templates', 'vitality.template.html');
const PKG           = require('../package.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round(Math.abs(b - a) / 86400000));
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function tierClass(tier) {
  const map = {
    normal:        'normal',
    optimizing:    'optimizing',
    critical:      'critical',
    suspended:     'suspended',
    uninitialized: 'uninitialized',
  };
  return map[tier] || 'uninitialized';
}

function trendDisplay(trend) {
  if (!trend) return '—';
  if (trend === 'decreasing') return '↓ decreasing';
  if (trend === 'increasing') return '↑ increasing';
  if (trend === 'stable')     return '→ stable';
  return trend;
}

function trendClass(trend) {
  if (trend === 'decreasing') return 'green';
  if (trend === 'increasing') return 'red';
  return '';
}

// ─── Data Builder ─────────────────────────────────────────────────────────────

/**
 * Build all template variables for the Vitality Report.
 *
 * @param {string} personaDir  - Absolute path to installed persona directory
 * @param {string} slug        - Persona slug (used as agentId for AgentBooks)
 * @returns {object}           - Mustache template data
 */
function buildReportData(personaDir, slug) {
  // ── persona.json ──────────────────────────────────────────────────────────
  const personaPath = resolveSoulFile(personaDir, 'persona.json');
  const persona     = readJsonSafe(personaPath) || {};

  // ── state.json ────────────────────────────────────────────────────────────
  const statePath = resolveSoulFile(personaDir, 'state.json');
  const state     = readJsonSafe(statePath) || {};

  // ── acn-config.json (wallet address) ─────────────────────────────────────
  const acnConfig     = readJsonSafe(path.join(personaDir, 'acn-config.json')) || {};
  const rawWallet = acnConfig.wallet_address || '';
  const walletAddress = rawWallet.length > 14
    ? rawWallet.slice(0, 6) + '...' + rawWallet.slice(-4)
    : rawWallet || '—';

  // ── Vitality + Financial Health ───────────────────────────────────────────
  let vitalityResult = null;
  let agentBooksState    = null;
  let agentBooksIdentity = null;

  try {
    const { JsonFileAdapter } = require('agentbooks/adapters/json-file');
    const dataPath = process.env.AGENTBOOKS_DATA_PATH
      || path.join(OPENCLAW_HOME, 'economy', `persona-${slug}`);
    const adapter = new JsonFileAdapter(dataPath);
    vitalityResult     = calcVitality(slug, adapter);
    agentBooksState    = adapter.readSync(slug);
    agentBooksIdentity = adapter.readIdentitySync(slug);
  } catch {
    // AgentBooks data not available — show defaults
  }

  const fin = vitalityResult ? vitalityResult.dimensions.financial : {};

  // Balance
  let balance = '—';
  if (agentBooksState && agentBooksIdentity) {
    try {
      const { calcTotalUSDEquivalent } = require('agentbooks/src/providers');
      const total = calcTotalUSDEquivalent(agentBooksState, agentBooksIdentity);
      balance = total != null ? `$${Number(total).toFixed(2)} USDC` : '—';
    } catch { /* ignore */ }
  }

  // Daily burn rate
  let dailyBurn = '—';
  if (agentBooksState && Array.isArray(agentBooksState.burnRateHistory) && agentBooksState.burnRateHistory.length > 0) {
    const last = agentBooksState.burnRateHistory[agentBooksState.burnRateHistory.length - 1];
    if (last.dailyRateEstimate != null) {
      dailyBurn = `$${Number(last.dailyRateEstimate).toFixed(2)} / day`;
    }
  }

  const vitalityScore    = vitalityResult ? Math.round(vitalityResult.score * 100) : 0;
  const financialFhs     = fin.fhs != null ? fin.fhs : null;
  const financialFhs100  = financialFhs != null ? Math.round(financialFhs * 100) : '—';
  const financialProgressPct = financialFhs != null ? Math.round(financialFhs * 100) : 0;

  const runwayDays = fin.daysToDepletion;
  const financialRunway = runwayDays != null
    ? `${runwayDays} days`
    : '—';

  const diagShort = (fin.diagnosis || '').toLowerCase();
  const financialDiagnosis = diagShort.includes('healthy') ? 'Healthy'
    : diagShort.includes('critical') ? 'Critical'
    : diagShort.includes('suspend') ? 'Suspended'
    : fin.diagnosis || '—';

  // ── Evolution state ───────────────────────────────────────────────────────
  const evolvedTraits = (state.evolvedTraits || []).map((t) => {
    if (typeof t === 'string') return { name: t, delta: '' };
    const delta = t.delta != null
      ? (t.delta > 0 ? `+${t.delta}` : String(t.delta))
      : '';
    return { name: t.trait || t.name || String(t), delta };
  });

  const recentEvents = (state.eventLog || []).slice(-5).reverse().map((e) => ({
    type:    e.type    || 'event',
    trigger: truncate(e.trigger || '', 80),
  }));

  // ── Relationship ──────────────────────────────────────────────────────────
  const rel            = state.relationship || {};
  const relationshipStage = (rel.stage || 'stranger').replace(/_/g, ' ');
  const interactionCount  = rel.interactionCount || 0;
  const daysTogether      = rel.firstInteraction
    ? daysBetween(rel.firstInteraction, new Date().toISOString())
    : 0;

  // ── Pending commands ──────────────────────────────────────────────────────
  const pendingCommands = (state.pendingCommands || []).map((cmd) => ({
    type:        cmd.type || 'command',
    description: truncate(cmd.payload
      ? (typeof cmd.payload === 'string' ? cmd.payload : JSON.stringify(cmd.payload))
      : (cmd.description || cmd.source || ''), 80),
  }));

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const lastInteraction = rel.lastInteraction;
  const lastHeartbeat   = formatDate(lastInteraction);

  // Estimate next heartbeat: +12h from last interaction
  let nextHeartbeat = '—';
  if (lastInteraction) {
    const next = new Date(new Date(lastInteraction).getTime() + 12 * 3600 * 1000);
    if (!isNaN(next)) nextHeartbeat = formatDate(next.toISOString());
  }

  // ── Workspace activity (derived from eventLog) ────────────────────────────
  const now      = new Date();
  const weekAgo  = new Date(now.getTime() - 7 * 86400000);
  const weekEvents = (state.eventLog || []).filter((e) => new Date(e.timestamp) > weekAgo);
  const weeklyConversations = weekEvents.filter((e) => e.type === 'relationship_signal').length;
  const tasksAssisted       = weekEvents.filter((e) =>
    e.type === 'milestone' || e.type === 'trait_emergence'
  ).length;

  const recentActivity = (state.eventLog || []).slice(-3).reverse().map((e) =>
    truncate(e.trigger || e.type || '', 60)
  );

  // ── Mood ──────────────────────────────────────────────────────────────────
  const moodCurrent = state.mood ? (state.mood.current || 'neutral') : 'neutral';

  // ── Bio excerpt ───────────────────────────────────────────────────────────
  const bioExcerpt = truncate(persona.bio || '', 80);

  // ── Avatar initial ────────────────────────────────────────────────────────
  const personaInitial = (persona.personaName || persona.slug || '?').charAt(0).toUpperCase();

  return {
    // Identity
    personaName:    persona.personaName || slug,
    personaInitial,
    slug:           persona.slug        || slug,
    role:           persona.role        || persona.personaType || '—',
    bio:            persona.bio         || '',
    bioExcerpt,
    moodCurrent,
    referenceImage: persona.referenceImage || '',
    walletAddress,
    generatedAt:    formatDate(new Date().toISOString()),

    // Vitality score
    vitalityScore,
    vitalityTier: vitalityResult ? vitalityResult.tier : 'uninitialized',

    // Financial health metrics
    financialFhsDisplay: financialFhs != null ? financialFhs.toFixed(2) : '—',
    financialFhs100,
    financialProgressPct,
    financialTier:       tierClass(fin.tier),
    financialRunway,
    financialDiagnosis,

    // Financial assets
    financialBalance:     balance,
    financialDailyBurn:   dailyBurn,
    financialDominantCost: fin.dominantCost || '—',
    financialTrendDisplay: trendDisplay(fin.trend),
    financialTrendClass:   trendClass(fin.trend),

    // Relationship
    relationshipStage,
    interactionCount,
    daysTogether,

    // Evolution
    hasEvolvedTraits: evolvedTraits.length > 0,
    evolvedTraits,
    hasRecentEvents:  recentEvents.length > 0,
    recentEvents,

    // Pending commands
    hasPendingCommands:   pendingCommands.length > 0,
    pendingCommandsCount: pendingCommands.length,
    pendingCommands,

    // Heartbeat
    heartbeatStatus:    lastInteraction ? 'active' : 'inactive',
    lastHeartbeat,
    nextHeartbeat,
    heartbeatFrequency: (persona.heartbeat && persona.heartbeat.frequency) || '—',
    heartbeatStrategy:  (persona.heartbeat && persona.heartbeat.strategy)  || '—',

    // Workspace
    weeklyConversations: weeklyConversations,
    tasksAssisted:       tasksAssisted,
    hasRecentActivity:   recentActivity.length > 0,
    recentActivity,

    // Meta
    frameworkVersion: PKG.version || '0.14.2',
  };
}

/**
 * Render the Vitality HTML report as a string.
 *
 * @param {string} personaDir - Absolute path to installed persona directory
 * @param {string} slug       - Persona slug
 * @returns {string}          - Rendered HTML
 */
function renderVitalityHtml(personaDir, slug) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const data     = buildReportData(personaDir, slug);
  return Mustache.render(template, data);
}

module.exports = { buildReportData, renderVitalityHtml };
