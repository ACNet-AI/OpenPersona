#!/usr/bin/env node
/**
 * OpenPersona Economy Faculty — Multi-asset wallet mirror
 *
 * Usage:
 *   node economy.js wallet-init                          # Generate deterministic EVM address
 *   node economy.js wallet-connect --provider <name> [--rpc <url>] [--acn-agent-id <id>]
 *   node economy.js set-primary --provider <name>
 *   node economy.js sync [--provider <name>]             # Pull real balance from provider
 *   node economy.js deposit --amount N [--currency USD] [--source "desc"]
 *   node economy.js balance                              # Show all provider assets
 *   node economy.js record-cost --channel <path> --amount <n> [--note <text>]
 *   node economy.js record-income --amount <n> --quality <0-1> --confirmed [--task-id <id>] [--note <text>]
 *   node economy.js status        # Full P&L + balance sheet + vitality report
 *   node economy.js tier          # Current vitality tier (real-time)
 *   node economy.js pl            # Current period income statement
 *   node economy.js ledger [--limit N]
 *
 * Account paths (dot-separated):
 *   inference.llm.input | inference.llm.output | inference.llm.thinking
 *   runtime.compute | runtime.storage | runtime.bandwidth
 *   faculty.voice | faculty.selfie | faculty.music | faculty.memory
 *   skill.web-search | skill.code-execution
 *   agent.acn | agent.a2a
 *   custom.<anything>
 *
 * Environment variables:
 *   PERSONA_SLUG       - Current persona slug
 *   ECONOMY_DATA_PATH  - Override storage directory (defaults to ~/.openclaw/economy/persona-{slug})
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

const lib = require('./economy-lib');
const cfg = lib.getConfig();

const MIN_QUALITY_FOR_INCOME = 0.6;

// --- Argument parsing ---

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return showHelp();

  const command = args[0];
  const opts = {
    command,
    channel: '',
    amount: NaN,
    quality: null,
    taskId: null,
    note: '',
    limit: 20,
    provider: '',
    rpc: '',
    acnAgentId: '',
    currency: 'USD',
    source: '',
    confirmed: false,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--channel':      opts.channel = args[++i]; break;
      case '--amount':       opts.amount = parseFloat(args[++i]); break;
      case '--quality':      opts.quality = parseFloat(args[++i]); break;
      case '--task-id':      opts.taskId = args[++i]; break;
      case '--note':         opts.note = args[++i]; break;
      case '--limit':        opts.limit = parseInt(args[++i], 10); break;
      case '--provider':     opts.provider = args[++i]; break;
      case '--rpc':          opts.rpc = args[++i]; break;
      case '--acn-agent-id': opts.acnAgentId = args[++i]; break;
      case '--currency':     opts.currency = args[++i]; break;
      case '--source':       opts.source = args[++i]; break;
      case '--confirmed':    opts.confirmed = true; break;
    }
  }
  return opts;
}

// --- Vitality state writer ---

function writeVitality(state) {
  const identity = lib.loadIdentity(cfg);
  const report = lib.calcVitality(state, identity);
  state.vitality = {
    score:          report.vitality,
    tier:           report.tier,
    diagnosis:      report.diagnosis,
    prescriptions:  report.prescriptions,
    daysToDepletion: report.dimensions.financial.liquidity.daysToDepletion,
    dominantCost:   report.dimensions.financial.efficiency.dominantCost,
    trend:          report.dimensions.financial.trend.direction,
    computedAt:     new Date().toISOString(),
  };
  return report;
}

// --- Commands ---

function cmdWalletInit() {
  lib.ensureDir(cfg);
  if (fs.existsSync(cfg.identityFile)) {
    const existing = JSON.parse(fs.readFileSync(cfg.identityFile, 'utf-8'));
    console.log(`wallet already initialized  address=${existing.walletAddress}`);
    return;
  }
  const hash = crypto.createHash('sha256')
    .update(cfg.slug + 'openpersona')
    .digest('hex');
  const walletAddress = '0x' + hash.slice(-40);
  const identity = {
    walletAddress,
    primaryProvider: 'local',
    providers: {
      local:          { enabled: true },
      'coinbase-cdp': { enabled: false, awalAuthenticated: false },
      acn:            { enabled: false, acnAgentId: null },
      onchain:        { enabled: false, rpc: null, network: 'base' },
    },
    createdAt: new Date().toISOString(),
  };
  lib.saveIdentity(identity, cfg);
  console.log(`wallet initialized  address=${walletAddress}  provider=local`);
}

function cmdWalletConnect(opts) {
  const provider = opts.provider;
  if (!provider || !['coinbase-cdp', 'acn', 'onchain'].includes(provider)) {
    console.error('Error: --provider must be one of: coinbase-cdp, acn, onchain');
    process.exit(1);
  }
  if (!fs.existsSync(cfg.identityFile)) {
    console.error('Error: run wallet-init first');
    process.exit(1);
  }
  const identity = JSON.parse(fs.readFileSync(cfg.identityFile, 'utf-8'));
  identity.providers[provider] = identity.providers[provider] || {};
  identity.providers[provider].enabled = true;
  if (provider === 'acn' && opts.acnAgentId) {
    identity.providers.acn.acnAgentId = opts.acnAgentId;
    console.log(`acn connected  acnAgentId=${opts.acnAgentId}`);
    console.log(`  Store your ACN API key in: ~/.openclaw/secrets/persona-${cfg.slug}/acn.json`);
    console.log(`  Format: { "acnApiKey": "<your-key>" }`);
  }
  if (provider === 'onchain' && opts.rpc) {
    identity.providers.onchain.rpc = opts.rpc;
  }
  if (provider === 'coinbase-cdp') {
    console.log(`coinbase-cdp connected. Authenticate with: npx awal status`);
    console.log(`  Fund with: npx awal fund`);
  }
  lib.saveIdentity(identity, cfg);
  console.log(`provider enabled  provider=${provider}`);
}

function cmdSetPrimary(opts) {
  const provider = opts.provider;
  if (!provider) { console.error('Error: --provider is required'); process.exit(1); }
  if (!fs.existsSync(cfg.identityFile)) {
    console.error('Error: run wallet-init first');
    process.exit(1);
  }
  const identity = JSON.parse(fs.readFileSync(cfg.identityFile, 'utf-8'));
  if (!identity.providers[provider] || !identity.providers[provider].enabled) {
    console.error(`Error: provider "${provider}" is not enabled. Run wallet-connect first.`);
    process.exit(1);
  }
  identity.primaryProvider = provider;
  lib.saveIdentity(identity, cfg);

  const state = lib.loadState(cfg);
  const currency = lib.providerCurrency(provider);
  state.balanceSheet.primaryProvider = provider;
  state.balanceSheet.operationalCurrency = currency;
  state.incomeStatement.currency = currency;
  state.balanceSheet.operationalBalance = lib.getProviderBalance(state, provider);
  writeVitality(state);
  lib.saveState(state, cfg);
  console.log(`primary provider set  provider=${provider}  currency=${currency}  balance=${state.balanceSheet.operationalBalance}  tier=${state.vitality.tier}`);
}

function cmdSync(opts) {
  const state = lib.loadState(cfg);
  const identity = lib.loadIdentity(cfg);
  if (!identity) { console.error('Error: run wallet-init first'); process.exit(1); }

  const targets = opts.provider ? [opts.provider] : Object.keys(identity.providers).filter(
    (p) => identity.providers[p].enabled && p !== 'local'
  );

  let synced = 0;
  for (const provider of targets) {
    if (provider === 'local') continue;
    if (!identity.providers[provider] || !identity.providers[provider].enabled) continue;
    try {
      const balance = lib.fetchProviderBalance(state, identity, provider);
      if (balance !== null) {
        lib.updateProviderAsset(state, provider, balance);
        synced++;
        console.log(`synced  provider=${provider}  balance=${balance}`);
      }
    } catch (e) {
      console.error(`sync failed  provider=${provider}  error=${e.message}`);
    }
  }

  const primary = state.balanceSheet.primaryProvider;
  state.balanceSheet.operationalBalance = lib.getProviderBalance(state, primary);
  writeVitality(state);
  lib.saveState(state, cfg);
  if (synced === 0) console.log('no providers synced (run wallet-connect first)');
}

function cmdDeposit(opts) {
  if (isNaN(opts.amount) || opts.amount <= 0) {
    console.error('Error: --amount must be a positive number'); process.exit(1);
  }
  const state = lib.loadState(cfg);
  const providers = state.balanceSheet.assets.providers;

  providers.local = providers.local || { budget: 0.0, currency: 'USD', depositsTotal: 0.0 };
  providers.local.budget = Math.round((providers.local.budget + opts.amount) * 1e6) / 1e6;
  providers.local.depositsTotal = Math.round((providers.local.depositsTotal + opts.amount) * 1e6) / 1e6;
  providers.local.lastUpdated = new Date().toISOString();
  providers.local.currency = opts.currency || 'USD';

  if (state.balanceSheet.primaryProvider === 'local') {
    state.balanceSheet.operationalBalance = providers.local.budget;
    state.balanceSheet.operationalCurrency = opts.currency || 'USD';
  }

  writeVitality(state);

  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'),
    type: 'deposit',
    amount: opts.amount,
    currency: opts.currency || 'USD',
    source: opts.source || '',
    timestamp: new Date().toISOString(),
  };
  state.ledger.push(entry);
  if (state.ledger.length > 500) state.ledger.splice(0, state.ledger.length - 500);

  lib.saveState(state, cfg);
  console.log(`deposited  amount=${opts.amount}  currency=${opts.currency || 'USD'}  balance=${state.balanceSheet.operationalBalance}  tier=${state.vitality.tier}`);
}

function cmdBalance() {
  const state = lib.loadState(cfg);
  const identity = lib.loadIdentity(cfg);
  const bs = state.balanceSheet;
  const providers = bs.assets.providers;

  console.log('');
  console.log('=== WALLET BALANCE ===');
  console.log(`Persona:     ${state.personaSlug}`);
  console.log(`Address:     ${identity ? identity.walletAddress : '(not initialized)'}`);
  console.log(`Primary:     ${bs.primaryProvider}  (${bs.operationalCurrency})`);
  console.log(`Operational: ${bs.operationalBalance.toFixed(4)} ${bs.operationalCurrency}`);
  console.log('');
  console.log('--- Asset Providers ---');
  for (const [name, data] of Object.entries(providers)) {
    if (!data) continue;
    const enabled = identity && identity.providers[name] && identity.providers[name].enabled;
    const tag = enabled ? '[on] ' : '[off]';
    if (name === 'local') {
      console.log(`  ${tag} local:        ${(data.budget || 0).toFixed(4)} ${data.currency || 'USD'}  (deposited: ${(data.depositsTotal || 0).toFixed(4)})`);
    } else if (name === 'coinbase-cdp') {
      console.log(`  ${tag} coinbase-cdp: ${(data.USDC || 0).toFixed(4)} USDC  ${data.lastSynced ? '(synced: ' + data.lastSynced.slice(0, 10) + ')' : '(not synced)'}`);
    } else if (name === 'acn') {
      console.log(`  ${tag} acn:          ${(data.credits || 0).toFixed(4)} credits  ${data.lastSynced ? '(synced: ' + data.lastSynced.slice(0, 10) + ')' : '(not synced)'}`);
    } else if (name === 'onchain') {
      console.log(`  ${tag} onchain:      ${(data.USDC || 0).toFixed(4)} USDC  ${data.lastSynced ? '(synced: ' + data.lastSynced.slice(0, 10) + ')' : '(not synced)'}`);
    }
  }
  console.log('=====================');
  console.log('');
}

function cmdRecordCost(opts) {
  if (!opts.channel) { console.error('Error: --channel is required'); process.exit(1); }
  if (isNaN(opts.amount) || opts.amount <= 0) { console.error('Error: --amount must be a positive number'); process.exit(1); }

  const state = lib.loadState(cfg);
  const period = state.incomeStatement.currentPeriod;

  lib.addToExpenseAccount(period.expenses, opts.channel, opts.amount);
  lib.recalcExpensesTotal(period.expenses);
  period.netIncome = Math.round((period.revenue - period.expenses.total) * 1e6) / 1e6;

  const primary = state.balanceSheet.primaryProvider;
  lib.deductFromProvider(state, primary, opts.amount);
  state.balanceSheet.operationalBalance = lib.getProviderBalance(state, primary);

  state.incomeStatement.allTime.totalExpenses = Math.round(
    (state.incomeStatement.allTime.totalExpenses + opts.amount) * 1e6
  ) / 1e6;
  state.incomeStatement.allTime.netIncome = Math.round(
    (state.incomeStatement.allTime.totalRevenue - state.incomeStatement.allTime.totalExpenses) * 1e6
  ) / 1e6;
  state.balanceSheet.equity.accumulatedNetIncome = state.incomeStatement.allTime.netIncome;
  writeVitality(state);

  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'),
    type: 'cost',
    channel: opts.channel,
    amount: opts.amount,
    note: opts.note || '',
    timestamp: new Date().toISOString(),
  };
  state.ledger.push(entry);
  if (state.ledger.length > 500) state.ledger.splice(0, state.ledger.length - 500);

  lib.saveState(state, cfg);
  console.log(`cost recorded  channel=${opts.channel}  amount=${opts.amount}  tier=${state.vitality.tier}`);
}

function cmdRecordIncome(opts) {
  if (isNaN(opts.amount) || opts.amount <= 0) { console.error('Error: --amount must be a positive number'); process.exit(1); }
  if (opts.quality === null || isNaN(opts.quality)) { console.error('Error: --quality is required (0.0–1.0)'); process.exit(1); }
  if (!opts.confirmed) {
    console.error('Error: --confirmed is required. Income must be externally verified before recording.');
    process.exit(1);
  }
  if (opts.quality < MIN_QUALITY_FOR_INCOME) {
    console.log(`income NOT recorded — quality ${opts.quality} is below threshold ${MIN_QUALITY_FOR_INCOME}`);
    return;
  }

  const state = lib.loadState(cfg);
  const period = state.incomeStatement.currentPeriod;

  period.revenue = Math.round((period.revenue + opts.amount) * 1e6) / 1e6;
  period.netIncome = Math.round((period.revenue - period.expenses.total) * 1e6) / 1e6;

  const primary = state.balanceSheet.primaryProvider;
  lib.creditToProvider(state, primary, opts.amount);
  state.balanceSheet.operationalBalance = lib.getProviderBalance(state, primary);

  state.incomeStatement.allTime.totalRevenue = Math.round(
    (state.incomeStatement.allTime.totalRevenue + opts.amount) * 1e6
  ) / 1e6;
  state.incomeStatement.allTime.netIncome = Math.round(
    (state.incomeStatement.allTime.totalRevenue - state.incomeStatement.allTime.totalExpenses) * 1e6
  ) / 1e6;
  state.balanceSheet.equity.accumulatedNetIncome = state.incomeStatement.allTime.netIncome;
  writeVitality(state);

  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex'),
    type: 'income',
    amount: opts.amount,
    quality: opts.quality,
    taskId: opts.taskId || null,
    note: opts.note || '',
    timestamp: new Date().toISOString(),
  };
  state.ledger.push(entry);
  if (state.ledger.length > 500) state.ledger.splice(0, state.ledger.length - 500);

  lib.saveState(state, cfg);
  console.log(`income recorded  amount=${opts.amount}  quality=${opts.quality}  tier=${state.vitality.tier}`);
}

function cmdTier() {
  // Real-time calculation — never reads stale cached tier
  const state = lib.loadState(cfg);
  const identity = lib.loadIdentity(cfg);
  console.log(lib.calcVitality(state, identity).tier);
}

function cmdStatus() {
  const state = lib.loadState(cfg);
  const identity = lib.loadIdentity(cfg);
  const bs = state.balanceSheet;
  const period = state.incomeStatement.currentPeriod;
  const allTime = state.incomeStatement.allTime;
  const expenses = period.expenses;
  const report = lib.calcVitality(state, identity);
  const fin = report.dimensions.financial;

  console.log('');
  console.log('=== ECONOMIC STATUS ===');
  console.log(`Persona:       ${state.personaSlug}`);
  console.log(`Vitality Tier: ${report.tier.toUpperCase()}`);
  console.log(`Vitality:      ${(report.vitality * 100).toFixed(1)}%`);
  console.log(`Diagnosis:     ${report.diagnosis}`);
  console.log(`Prescriptions: ${report.prescriptions.join(', ')}`);
  console.log(`Address:       ${identity ? identity.walletAddress : '(not initialized)'}`);
  console.log(`Primary:       ${bs.primaryProvider}  (${bs.operationalCurrency})`);
  console.log('');
  console.log('--- Operational Balance ---');
  console.log(`  Balance:      ${bs.operationalBalance.toFixed(4)} ${bs.operationalCurrency}`);
  console.log(`  Days Left:    ${fin.liquidity.daysToDepletion < 9999 ? fin.liquidity.daysToDepletion.toFixed(1) : '∞'}`);
  console.log(`  Accum. Net:   ${bs.equity.accumulatedNetIncome.toFixed(4)}`);
  console.log('');
  console.log(`--- Income Statement (period: ${period.periodStart}) ---`);
  console.log(`  Revenue:      ${period.revenue.toFixed(4)}`);
  console.log(`  Expenses:     ${expenses.total.toFixed(4)}`);
  console.log(`  Net Income:   ${period.netIncome.toFixed(4)}`);
  console.log('');
  console.log('--- Cost Breakdown ---');
  printExpenseBreakdown(expenses);
  console.log('');
  console.log('--- All Time ---');
  console.log(`  Revenue:      ${allTime.totalRevenue.toFixed(4)}`);
  console.log(`  Expenses:     ${allTime.totalExpenses.toFixed(4)}`);
  console.log(`  Net Income:   ${allTime.netIncome.toFixed(4)}`);
  console.log('=======================');
  console.log('');
}

function cmdPl() {
  const state = lib.loadState(cfg);
  const period = state.incomeStatement.currentPeriod;
  const expenses = period.expenses;
  const currency = state.balanceSheet.operationalCurrency;

  console.log('');
  console.log(`=== INCOME STATEMENT (${period.periodStart}) [${currency}] ===`);
  console.log(`Revenue:  ${period.revenue.toFixed(4)}`);
  console.log('Expenses:');
  printExpenseBreakdown(expenses, '  ');
  console.log(`  ─────────────────`);
  console.log(`  Total:    ${expenses.total.toFixed(4)}`);
  console.log(`Net Income: ${period.netIncome.toFixed(4)}`);
  console.log('');
}

function printExpenseBreakdown(expenses, indent) {
  indent = indent || '  ';
  const total = expenses.total || 0;
  for (const cat of Object.keys(expenses)) {
    if (cat === 'total') continue;
    const val = expenses[cat];
    const catTotal = typeof val === 'number' ? val : lib.sumNestedObject(val);
    if (catTotal === 0) continue;
    const pct = total > 0 ? ((catTotal / total) * 100).toFixed(1) : '0.0';
    console.log(`${indent}${cat}: ${catTotal.toFixed(4)}  (${pct}%)`);
    if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        const subTotal = typeof v === 'number' ? v : lib.sumNestedObject(v);
        if (subTotal === 0) continue;
        console.log(`${indent}  ${k}: ${subTotal.toFixed(4)}`);
      }
    }
  }
}

function cmdLedger(opts) {
  const state = lib.loadState(cfg);
  const entries = state.ledger.slice(-opts.limit).reverse();
  if (entries.length === 0) { console.log('(no ledger entries yet)'); return; }
  console.log('');
  for (const e of entries) {
    const sign = e.type === 'income' || e.type === 'deposit' ? '+' : '-';
    let detail = '';
    if (e.type === 'cost') detail = `  channel=${e.channel}`;
    if (e.type === 'income') detail = `  quality=${e.quality}`;
    if (e.type === 'deposit') detail = `  source=${e.source || ''}  currency=${e.currency || 'USD'}`;
    console.log(`[${e.timestamp}] ${sign}${e.amount.toFixed(4)}  ${e.type}${detail}${e.note ? '  note=' + e.note : ''}`);
  }
  console.log('');
}

function showHelp() {
  console.log(`
OpenPersona Economy Faculty (v2.1 — vitality-driven)

Commands:
  wallet-init                                    Generate deterministic EVM address
  wallet-connect --provider <name> [options]     Enable a provider (coinbase-cdp|acn|onchain)
  set-primary    --provider <name>               Set primary operational provider
  sync           [--provider <name>]             Pull real balance from provider(s)
  deposit        --amount N [--currency USD]     Fund local budget (local provider only)
  balance                                        Show all provider assets
  record-cost    --channel <path> --amount N     Record an expense
  record-income  --amount N --quality Q --confirmed  Record confirmed income
  status         Full P&L + balance sheet + vitality report
  tier           Current vitality tier (real-time)
  pl             Current period income statement
  ledger         [--limit N] Recent entries

Account paths:
  inference.llm.input | inference.llm.output | inference.llm.thinking
  runtime.compute | runtime.storage | runtime.bandwidth
  faculty.<name> | skill.<name> | agent.acn | agent.a2a | custom.<name>
`);
  process.exit(0);
}

// --- Main ---

const opts = parseArgs(process.argv);
switch (opts.command) {
  case 'wallet-init':    cmdWalletInit(); break;
  case 'wallet-connect': cmdWalletConnect(opts); break;
  case 'set-primary':    cmdSetPrimary(opts); break;
  case 'sync':           cmdSync(opts); break;
  case 'deposit':        cmdDeposit(opts); break;
  case 'balance':        cmdBalance(); break;
  case 'record-cost':    cmdRecordCost(opts); break;
  case 'record-income':  cmdRecordIncome(opts); break;
  case 'status':         cmdStatus(); break;
  case 'tier':           cmdTier(); break;
  case 'pl':             cmdPl(); break;
  case 'ledger':         cmdLedger(opts); break;
  default:
    console.error(`Unknown command: ${opts.command}`);
    showHelp();
}
