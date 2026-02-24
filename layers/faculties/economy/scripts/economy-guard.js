#!/usr/bin/env node
/**
 * OpenPersona Economy Guard — Vitality Reporter
 *
 * Runs at conversation start. Outputs a VITALITY_REPORT for the persona to
 * interpret and act upon. Always exits 0 — the persona makes its own decisions.
 *
 * Usage: node economy-guard.js
 *
 * Environment variables:
 *   PERSONA_SLUG       - Current persona slug
 *   ECONOMY_DATA_PATH  - Override storage directory
 */

'use strict';

const {
  getConfig, loadState, loadIdentity, syncProvider,
  getProviderBalance, saveState, calcVitality,
} = require('./economy-lib');

function main() {
  const cfg = getConfig();
  const state = loadState(cfg);
  const identity = loadIdentity(cfg);

  const primaryProvider = (state.balanceSheet && state.balanceSheet.primaryProvider) || 'local';

  // Sync non-local primary provider for fresh balance
  if (primaryProvider !== 'local' && identity) {
    try {
      const balance = syncProvider(state, identity, primaryProvider);
      state.balanceSheet.operationalBalance = balance;
      try { saveState(state, cfg); } catch (e) { /* non-fatal */ }
    } catch (e) { /* network unavailable, use cached */ }
  }

  const report = calcVitality(state, identity);
  const fin = report.dimensions.financial;
  const balance = state.balanceSheet.operationalBalance || 0;
  const currency = (state.balanceSheet && state.balanceSheet.operationalCurrency) || 'USD';
  const dtd = fin.liquidity.daysToDepletion;
  const daysStr = dtd >= 9999 ? '∞' : dtd.toFixed(1);
  const dominantCost = fin.efficiency.dominantCost || 'none';

  console.log('VITALITY_REPORT');
  console.log(`tier=${report.tier}  vitality=${(report.vitality * 100).toFixed(1)}%  balance=${balance.toFixed(4)} ${currency}  provider=${primaryProvider}`);
  console.log(`diagnosis=${report.diagnosis}  daysToDepletion=${daysStr}  trend=${fin.trend.direction}`);
  console.log(`dominant_cost=${dominantCost}`);
  console.log(`prescriptions=${report.prescriptions.join(',')}`);
  process.exit(0);
}

main();
