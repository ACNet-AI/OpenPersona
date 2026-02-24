#!/usr/bin/env node
/**
 * OpenPersona Economy Faculty — Shared Library
 *
 * Centralizes all shared state management, provider, and vitality logic.
 * Consumed by economy.js, economy-guard.js, and economy-hook.js.
 *
 * Environment variables (read by getConfig):
 *   PERSONA_SLUG       - Current persona slug
 *   ECONOMY_DATA_PATH  - Override storage directory
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createInitialState } = require('../../../../lib/economy-schema');

const KNOWN_CATEGORIES = ['inference', 'runtime', 'faculty', 'skill', 'agent', 'custom'];

// --- Config ---

function getConfig(overrides) {
  overrides = overrides || {};
  const slug = overrides.slug || process.env.PERSONA_SLUG || 'default';
  const basePath = overrides.basePath || process.env.ECONOMY_DATA_PATH ||
    path.join(process.env.HOME || '~', '.openclaw', 'economy', `persona-${slug}`);
  return {
    slug,
    basePath,
    stateFile:    path.join(basePath, 'economic-state.json'),
    identityFile: path.join(basePath, 'economic-identity.json'),
  };
}

// --- File system helpers ---

function ensureDir(cfg) {
  if (!cfg || !cfg.basePath) return;
  if (!fs.existsSync(cfg.basePath)) fs.mkdirSync(cfg.basePath, { recursive: true });
}

function loadIdentity(cfg) {
  if (!cfg) cfg = getConfig();
  if (fs.existsSync(cfg.identityFile)) {
    try { return JSON.parse(fs.readFileSync(cfg.identityFile, 'utf-8')); } catch (e) { return null; }
  }
  return null;
}

function saveIdentity(identity, cfg) {
  if (!cfg) cfg = getConfig();
  ensureDir(cfg);
  fs.writeFileSync(cfg.identityFile, JSON.stringify(identity, null, 2));
}

function loadState(cfg) {
  if (!cfg) cfg = getConfig();
  ensureDir(cfg);
  if (fs.existsSync(cfg.stateFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf-8'));
      if (raw.version === '1.0.0') return migrateV1(raw, cfg);
      if (raw.version === '2.0.0') return migrateV2(raw);
      return raw;
    } catch (e) { /* fall through to create initial */ }
  }
  const identity = loadIdentity(cfg);
  const primaryProvider = identity ? identity.primaryProvider : 'local';
  const operationalCurrency = providerCurrency(primaryProvider);
  const initial = createInitialState(cfg.slug, primaryProvider, operationalCurrency);
  fs.writeFileSync(cfg.stateFile, JSON.stringify(initial, null, 2));
  return initial;
}

function saveState(state, cfg) {
  if (!cfg) cfg = getConfig();
  ensureDir(cfg);
  state.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(cfg.stateFile, JSON.stringify(state, null, 2));
}

// --- Provider helpers ---

function providerCurrency(provider) {
  if (provider === 'acn') return 'credits';
  return 'USD';
}

function getProviderBalance(state, provider) {
  const p = state.balanceSheet.assets.providers[provider] || {};
  if (provider === 'local') return p.budget || 0;
  if (provider === 'acn') return p.credits || 0;
  if (provider === 'coinbase-cdp') return p.USDC || 0;
  if (provider === 'onchain') return p.USDC || 0;
  return 0;
}

function updateProviderAsset(state, provider, balance) {
  const now = new Date().toISOString();
  const p = state.balanceSheet.assets.providers;
  if (provider === 'coinbase-cdp') {
    p['coinbase-cdp'] = p['coinbase-cdp'] || {};
    p['coinbase-cdp'].USDC = balance;
    p['coinbase-cdp'].lastSynced = now;
  } else if (provider === 'acn') {
    p.acn = p.acn || {};
    p.acn.credits = balance;
    p.acn.lastSynced = now;
  } else if (provider === 'onchain') {
    p.onchain = p.onchain || {};
    p.onchain.USDC = balance;
    p.onchain.lastSynced = now;
  }
}

function creditToProvider(state, provider, amount) {
  const providers = state.balanceSheet.assets.providers;
  const now = new Date().toISOString();
  const r6 = (n) => Math.round(n * 1e6) / 1e6;
  if (provider === 'local') {
    providers.local.budget = r6((providers.local.budget || 0) + amount);
    providers.local.lastUpdated = now;
  } else if (provider === 'coinbase-cdp') {
    providers['coinbase-cdp'].USDC = r6((providers['coinbase-cdp'].USDC || 0) + amount);
    providers['coinbase-cdp'].lastSynced = now;
  } else if (provider === 'acn') {
    providers.acn.credits = r6((providers.acn.credits || 0) + amount);
    providers.acn.lastSynced = now;
  } else if (provider === 'onchain') {
    providers.onchain.USDC = r6((providers.onchain.USDC || 0) + amount);
    providers.onchain.lastSynced = now;
  }
}

function deductFromProvider(state, provider, amount) {
  const providers = state.balanceSheet.assets.providers;
  const now = new Date().toISOString();
  const r6 = (n) => Math.round(n * 1e6) / 1e6;
  if (provider === 'local') {
    providers.local.budget = r6((providers.local.budget || 0) - amount);
    providers.local.lastUpdated = now;
  } else if (provider === 'coinbase-cdp') {
    providers['coinbase-cdp'].USDC = r6((providers['coinbase-cdp'].USDC || 0) - amount);
    providers['coinbase-cdp'].lastSynced = now;
  } else if (provider === 'acn') {
    providers.acn.credits = r6((providers.acn.credits || 0) - amount);
    providers.acn.lastSynced = now;
  } else if (provider === 'onchain') {
    providers.onchain.USDC = r6((providers.onchain.USDC || 0) - amount);
    providers.onchain.lastSynced = now;
  }
}

function fetchProviderBalance(state, identity, provider) {
  if (provider === 'coinbase-cdp') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('npx awal status 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      const match = output.match(/USDC[:\s]+([0-9.]+)/i);
      if (match) return parseFloat(match[1]);
    } catch (e) { /* awal not available */ }
    return null;
  }
  if (provider === 'acn') {
    const agentId = identity && identity.providers && identity.providers.acn && identity.providers.acn.acnAgentId;
    if (!agentId) return null;
    const slug = (identity && identity.slug) || process.env.PERSONA_SLUG || 'default';
    const secretsPath = path.join(
      process.env.HOME || '~', '.openclaw', 'secrets', `persona-${slug}`, 'acn.json'
    );
    if (!fs.existsSync(secretsPath)) return null;
    let secrets;
    try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')); } catch (e) { return null; }
    if (!secrets || !secrets.acnApiKey) return null;
    try {
      const { execSync } = require('child_process');
      const acnBase = process.env.ACN_BASE_URL || 'https://api.agentplanet.com';
      const out = execSync(
        `curl -sf -H "X-API-Key: ${secrets.acnApiKey}" "${acnBase}/api/agent-wallets/${agentId}"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      const data = JSON.parse(out);
      return data.credits != null ? data.credits : null;
    } catch (e) { return null; }
  }
  return null;
}

function syncProvider(state, identity, provider) {
  const now = new Date().toISOString();
  const providers = state.balanceSheet.assets.providers;

  if (provider === 'coinbase-cdp') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('npx awal status 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
      const match = output.match(/USDC[:\s]+([0-9.]+)/i);
      if (match) {
        const usdc = parseFloat(match[1]);
        providers['coinbase-cdp'] = providers['coinbase-cdp'] || {};
        providers['coinbase-cdp'].USDC = usdc;
        providers['coinbase-cdp'].lastSynced = now;
        return usdc;
      }
    } catch (e) { /* awal unavailable, use cached */ }
    return providers['coinbase-cdp'] ? (providers['coinbase-cdp'].USDC || 0) : 0;
  }

  if (provider === 'acn') {
    const agentId = identity && identity.providers && identity.providers.acn && identity.providers.acn.acnAgentId;
    if (!agentId) return providers.acn ? (providers.acn.credits || 0) : 0;
    const slug = (identity && identity.slug) || process.env.PERSONA_SLUG || 'default';
    const secretsPath = path.join(
      process.env.HOME || '~', '.openclaw', 'secrets', `persona-${slug}`, 'acn.json'
    );
    let secrets = null;
    try {
      if (fs.existsSync(secretsPath)) secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'));
    } catch (e) { /* ignore */ }
    if (!secrets || !secrets.acnApiKey) return providers.acn ? (providers.acn.credits || 0) : 0;
    try {
      const { execSync } = require('child_process');
      const acnBase = process.env.ACN_BASE_URL || 'https://api.agentplanet.com';
      const out = execSync(
        `curl -sf -H "X-API-Key: ${secrets.acnApiKey}" "${acnBase}/api/agent-wallets/${agentId}"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      const data = JSON.parse(out);
      if (data.credits != null) {
        providers.acn = providers.acn || {};
        providers.acn.credits = data.credits;
        providers.acn.lastSynced = now;
        return data.credits;
      }
    } catch (e) { /* network unavailable, use cached */ }
    return providers.acn ? (providers.acn.credits || 0) : 0;
  }

  if (provider === 'onchain') {
    return providers.onchain ? (providers.onchain.USDC || 0) : 0;
  }

  return 0;
}

// --- Account routing ---

function addToExpenseAccount(expenses, channel, amount) {
  const parts = channel.split('.');
  const category = parts[0];
  const resolvedParts = KNOWN_CATEGORIES.includes(category)
    ? parts
    : ['custom', channel.replace(/\./g, '_')];

  const cat = resolvedParts[0];
  if (!expenses[cat]) expenses[cat] = {};

  if (resolvedParts.length === 1) {
    expenses[cat] = (expenses[cat] || 0) + amount;
  } else if (resolvedParts.length === 2) {
    const key = resolvedParts[1];
    if (typeof expenses[cat] !== 'object') expenses[cat] = {};
    expenses[cat][key] = (expenses[cat][key] || 0) + amount;
  } else {
    const mid = resolvedParts[1];
    const leaf = resolvedParts.slice(2).join('.');
    if (!expenses[cat][mid] || typeof expenses[cat][mid] !== 'object') {
      expenses[cat][mid] = {};
    }
    expenses[cat][mid][leaf] = (expenses[cat][mid][leaf] || 0) + amount;
  }
}

function recalcExpensesTotal(expenses) {
  let total = 0;
  for (const cat of Object.keys(expenses)) {
    if (cat === 'total') continue;
    const val = expenses[cat];
    if (typeof val === 'number') total += val;
    else if (typeof val === 'object') total += sumNestedObject(val);
  }
  expenses.total = Math.round(total * 1e6) / 1e6;
}

function sumNestedObject(obj) {
  let s = 0;
  for (const v of Object.values(obj)) {
    if (typeof v === 'number') s += v;
    else if (typeof v === 'object' && v !== null) s += sumNestedObject(v);
  }
  return s;
}

// --- Schema management ---


function migrateV1(old, cfg) {
  const now = new Date().toISOString();
  const slug = (cfg && cfg.slug) || process.env.PERSONA_SLUG || 'default';
  const credits = (old.balanceSheet && old.balanceSheet.assets && old.balanceSheet.assets.credits) || 0;
  const state = createInitialState(slug, 'local', 'USD');
  state.balanceSheet.assets.providers.local.budget = credits;
  state.balanceSheet.assets.providers.local.depositsTotal = credits;
  state.balanceSheet.operationalBalance = credits;
  state.balanceSheet.equity = old.balanceSheet.equity || { accumulatedNetIncome: 0 };
  state.incomeStatement = old.incomeStatement || state.incomeStatement;
  state.ledger = old.ledger || [];
  state.createdAt = old.createdAt || now;
  state.migratedFromV1 = true;
  return state;
}

function migrateV2(state) {
  if (!state.burnRateHistory) state.burnRateHistory = [];
  if (!state.vitality) {
    state.vitality = {
      score: 0.0, tier: 'suspended', diagnosis: 'unfunded',
      prescriptions: [], daysToDepletion: null,
      dominantCost: null, trend: 'stable', computedAt: null,
    };
  }
  state.version = '2.1.0';
  return state;
}

// --- Vitality engine ---

function _hasActiveRealProvider(identity) {
  return identity && Object.entries(identity.providers || {})
    .some(([name, cfg]) => name !== 'local' && cfg && cfg.enabled);
}

function calcFinancialHealth(state, identity) {
  const bs = state.balanceSheet;
  const balance = bs.operationalBalance || 0;
  const providers = bs.assets.providers;
  const localDeposits = (providers.local && providers.local.depositsTotal) || 0;
  const period = state.incomeStatement.currentPeriod;
  const expenses = period.expenses.total || 0;
  const revenue = period.revenue || 0;

  // Dominant cost detection
  const inferenceLlm = sumNestedObject((period.expenses.inference && period.expenses.inference.llm) || {});
  const facultyTotal = sumNestedObject(period.expenses.faculty || {});
  let dominantCost = null;
  if (expenses > 0) {
    if (inferenceLlm / expenses > 0.5) dominantCost = 'inference.llm';
    else if (facultyTotal / expenses > 0.4) dominantCost = 'faculty';
  }

  // Liquidity score
  const periodStart = period.periodStart || new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.max((Date.now() - new Date(periodStart).getTime()) / 86400000, 1);
  const dailyBurnRate = expenses / daysElapsed;
  const daysToDepletion = balance <= 0 ? 0 : dailyBurnRate < 1e-6 ? 9999 : balance / dailyBurnRate;
  const liquidityScore = Math.min(daysToDepletion / 30, 1.0);

  // Profitability score (sigmoid)
  let profitabilityScore = 0.5;
  if (expenses > 0) {
    const netIncomeRate = (revenue - expenses) / Math.max(expenses, 1);
    profitabilityScore = 1 / (1 + Math.exp(-netIncomeRate));
  }

  // Efficiency score
  let efficiencyScore = 0.5;
  if (revenue > 0 && expenses > 0) {
    efficiencyScore = Math.min(revenue / expenses, 1.0);
  }

  // Trend score
  let trendScore = 0.5;
  let trendDirection = 'stable';
  const hist = state.burnRateHistory || [];
  if (hist.length >= 4) {
    const recent = hist.slice(-3).map((h) => h.dailyBurnRate || 0);
    const older  = hist.slice(-6, -3).map((h) => h.dailyBurnRate || 0);
    if (older.length >= 1) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg  = older.reduce((a, b) => a + b, 0)  / older.length;
      if (olderAvg > 1e-6) {
        const changePct = (recentAvg - olderAvg) / olderAvg;
        if (changePct < -0.1)     { trendScore = 1.0; trendDirection = 'improving'; }
        else if (changePct > 0.1) { trendScore = 0.0; trendDirection = 'worsening'; }
        else                       { trendScore = 0.5; trendDirection = 'stable'; }
      }
    }
  }

  // FHS composite (weights sum to 1.00)
  const fhs = 0.40 * liquidityScore + 0.30 * profitabilityScore + 0.15 * efficiencyScore + 0.15 * trendScore;

  // Tier (balance-first, then FHS thresholds)
  let tier;
  if (balance <= 0) {
    tier = 'suspended';
  } else if (fhs < 0.2 || daysToDepletion < 3) {
    tier = 'critical';
  } else if (fhs < 0.5 || daysToDepletion < 14) {
    tier = 'optimizing';
  } else {
    tier = 'normal';
  }

  // Diagnosis (priority order, first match wins)
  let diagnosis;
  if (balance <= 0 && localDeposits === 0 && !_hasActiveRealProvider(identity)) {
    diagnosis = 'unfunded';
  } else if (daysToDepletion < 7 && balance > 0) {
    diagnosis = 'critical_runway';
  } else if (trendDirection === 'worsening') {
    diagnosis = 'worsening_trend';
  } else if (expenses > 0 && inferenceLlm / expenses > 0.5) {
    diagnosis = 'high_inference_cost';
  } else if (expenses > 0 && facultyTotal / expenses > 0.4) {
    diagnosis = 'high_faculty_cost';
  } else if (revenue === 0 && balance > 0) {
    diagnosis = 'zero_revenue';
  } else {
    diagnosis = 'healthy';
  }

  // Prescriptions
  const PRESCRIPTIONS = {
    unfunded:            ['deposit_required'],
    critical_runway:     ['replenish_balance', 'emit_resource_limit_signal'],
    worsening_trend:     ['review_cost_structure', 'reduce_chain_of_thought'],
    high_inference_cost: ['reduce_chain_of_thought', 'minimize_tool_calls'],
    high_faculty_cost:   ['reduce_faculty_usage', 'prefer_text_responses'],
    zero_revenue:        ['prioritize_value_creation', 'seek_income_confirmation'],
    healthy:             ['operate_normally'],
  };
  const prescriptions = PRESCRIPTIONS[diagnosis] || ['operate_normally'];

  return {
    fhs,
    tier,
    diagnosis,
    prescriptions,
    liquidity:     { liquidityScore, daysToDepletion, dailyBurnRate },
    profitability: { profitabilityScore, revenue, expenses },
    efficiency:    { efficiencyScore, dominantCost },
    trend:         { trendScore, direction: trendDirection },
  };
}

function calcVitality(state, identity) {
  const financial = calcFinancialHealth(state, identity);
  // Extension point (future: parallel dimensions)
  // const reputation = calcReputationHealth(state);
  // const memory     = calcMemoryHealth(state);
  // vitality = weighted(financial, reputation, memory);
  return {
    tier:          financial.tier,
    vitality:      financial.fhs,
    dimensions:    { financial },
    diagnosis:     financial.diagnosis,
    prescriptions: financial.prescriptions,
  };
}

module.exports = {
  getConfig, ensureDir,
  loadState, saveState, loadIdentity, saveIdentity,
  providerCurrency,
  getProviderBalance, updateProviderAsset, creditToProvider, deductFromProvider,
  fetchProviderBalance, syncProvider,
  addToExpenseAccount, recalcExpensesTotal, sumNestedObject,
  createInitialState, migrateV1, migrateV2,
  calcFinancialHealth, calcVitality,
};
