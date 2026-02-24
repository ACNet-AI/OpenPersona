#!/usr/bin/env node
/**
 * OpenPersona Economy Hook — Post-conversation inference cost recorder
 *
 * Records inference costs at the end of each conversation, appends a
 * burnRateHistory entry, and updates state.vitality.
 *
 * Usage:
 *   node economy-hook.js --input <tokens> --output <tokens> [--thinking <tokens>] [--model <name>]
 *
 * Or via environment variables:
 *   TOKEN_INPUT_COUNT / TOKEN_OUTPUT_COUNT / TOKEN_THINKING_COUNT
 *
 * Environment variables:
 *   PERSONA_SLUG       - Current persona slug
 *   ECONOMY_DATA_PATH  - Override storage directory
 *   TOKEN_INPUT_COUNT  - Input token count
 *   TOKEN_OUTPUT_COUNT - Output token count
 *   TOKEN_THINKING_COUNT - Thinking token count
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

const {
  getConfig, loadState, saveState, loadIdentity,
  deductFromProvider, getProviderBalance,
  addToExpenseAccount, recalcExpensesTotal,
  calcVitality,
} = require('./economy-lib');

// Model pricing table (USD per 1M tokens)
const MODEL_PRICING = {
  'claude-4':           { input: 3.00,  output: 15.00, thinking: 15.00 },
  'claude-3-5-sonnet':  { input: 3.00,  output: 15.00, thinking: 15.00 },
  'claude-3-opus':      { input: 15.00, output: 75.00, thinking: 75.00 },
  'gpt-4o':             { input: 2.50,  output: 10.00, thinking: 10.00 },
  'gpt-4-turbo':        { input: 10.00, output: 30.00, thinking: 30.00 },
  'gpt-3-5-turbo':      { input: 0.50,  output: 1.50,  thinking: 1.50  },
  'default':            { input: 3.00,  output: 15.00, thinking: 15.00 },
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    input: parseInt(process.env.TOKEN_INPUT_COUNT || '0', 10),
    output: parseInt(process.env.TOKEN_OUTPUT_COUNT || '0', 10),
    thinking: parseInt(process.env.TOKEN_THINKING_COUNT || '0', 10),
    model: process.env.LLM_MODEL || 'default',
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':    opts.input = parseInt(args[++i], 10); break;
      case '--output':   opts.output = parseInt(args[++i], 10); break;
      case '--thinking': opts.thinking = parseInt(args[++i], 10); break;
      case '--model':    opts.model = args[++i]; break;
    }
  }
  return opts;
}

function calcCosts(tokens, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  return {
    input:    (tokens.input    / 1_000_000) * pricing.input,
    output:   (tokens.output   / 1_000_000) * pricing.output,
    thinking: (tokens.thinking / 1_000_000) * pricing.thinking,
  };
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

function callAcnSpend(identity, cfg, amount, note) {
  const agentId = identity.providers.acn && identity.providers.acn.acnAgentId;
  if (!agentId) return;
  const path = require('path');
  const secretsPath = path.join(
    process.env.HOME || '~',
    '.openclaw', 'secrets', `persona-${cfg.slug}`, 'acn.json'
  );
  if (!fs.existsSync(secretsPath)) return;
  let secrets;
  try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')); } catch (e) { return; }
  if (!secrets || !secrets.acnApiKey) return;
  try {
    const { execSync } = require('child_process');
    const acnBase = process.env.ACN_BASE_URL || 'https://api.agentplanet.com';
    const payload = JSON.stringify({ amount, description: note || 'inference cost' });
    execSync(
      `curl -sf -X POST -H "X-API-Key: ${secrets.acnApiKey}" -H "Content-Type: application/json" -d '${payload}' "${acnBase}/api/agent-wallets/${agentId}/spend"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
  } catch (e) { /* network unavailable — local mirror already updated */ }
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.input === 0 && opts.output === 0 && opts.thinking === 0) {
    console.log('economy-hook: no token counts provided, skipping');
    process.exit(0);
  }

  const cfg = getConfig();
  const state = loadState(cfg);
  const identity = loadIdentity(cfg);

  const costs = calcCosts(opts, opts.model);
  const primary = (state.balanceSheet && state.balanceSheet.primaryProvider) || 'local';
  const totalCost = round6(costs.input + costs.output + costs.thinking);

  if (totalCost <= 0) {
    console.log('economy-hook: cost rounds to 0, skipping');
    process.exit(0);
  }

  // Record costs in expense accounts
  const period = state.incomeStatement.currentPeriod;
  if (costs.input > 0)    addToExpenseAccount(period.expenses, 'inference.llm.input',    costs.input);
  if (costs.output > 0)   addToExpenseAccount(period.expenses, 'inference.llm.output',   costs.output);
  if (costs.thinking > 0) addToExpenseAccount(period.expenses, 'inference.llm.thinking', costs.thinking);
  recalcExpensesTotal(period.expenses);
  period.netIncome = round6(period.revenue - period.expenses.total);

  state.incomeStatement.allTime.totalExpenses = round6(state.incomeStatement.allTime.totalExpenses + totalCost);
  state.incomeStatement.allTime.netIncome = round6(
    state.incomeStatement.allTime.totalRevenue - state.incomeStatement.allTime.totalExpenses
  );
  state.balanceSheet.equity.accumulatedNetIncome = state.incomeStatement.allTime.netIncome;

  // Deduct from primary provider's local mirror
  deductFromProvider(state, primary, totalCost);
  state.balanceSheet.operationalBalance = getProviderBalance(state, primary);

  // For ACN: also call real spend API
  if (primary === 'acn' && identity) {
    callAcnSpend(identity, cfg, totalCost, `inference ${opts.model}`);
  }

  // Append burnRateHistory entry
  const periodStart = period.periodStart || new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.max((Date.now() - new Date(periodStart).getTime()) / 86400000, 1);
  const dailyBurnRate = round6((period.expenses.total || 0) / daysElapsed);
  if (!state.burnRateHistory) state.burnRateHistory = [];
  state.burnRateHistory.push({
    timestamp: new Date().toISOString(),
    dailyBurnRate,
    periodExpenses: period.expenses.total || 0,
  });
  if (state.burnRateHistory.length > 30) {
    state.burnRateHistory.splice(0, state.burnRateHistory.length - 30);
  }

  // Update vitality
  const report = calcVitality(state, identity);
  state.vitality = {
    score:           report.vitality,
    tier:            report.tier,
    diagnosis:       report.diagnosis,
    prescriptions:   report.prescriptions,
    daysToDepletion: report.dimensions.financial.liquidity.daysToDepletion,
    dominantCost:    report.dimensions.financial.efficiency.dominantCost,
    trend:           report.dimensions.financial.trend.direction,
    computedAt:      new Date().toISOString(),
  };

  // Ledger entry
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'),
    type: 'cost',
    channel: 'inference.llm',
    amount: totalCost,
    note: `model=${opts.model} in=${opts.input} out=${opts.output} thinking=${opts.thinking}`,
    timestamp: new Date().toISOString(),
  };
  state.ledger.push(entry);
  if (state.ledger.length > 500) state.ledger.splice(0, state.ledger.length - 500);

  saveState(state, cfg);
  console.log(`economy-hook: cost=${totalCost.toFixed(6)}  balance=${state.balanceSheet.operationalBalance.toFixed(4)}  tier=${state.vitality.tier}`);
}

main();
