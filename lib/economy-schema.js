'use strict';

/**
 * Canonical factory for economic-state.json initial structure.
 * Used by both lib/generator.js (generation time) and
 * layers/faculties/economy/scripts/economy-lib.js (runtime).
 */
function createInitialState(slug, primaryProvider, operationalCurrency) {
  primaryProvider = primaryProvider || 'local';
  operationalCurrency = operationalCurrency || 'USD';
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    schema: 'openpersona/economic-state',
    version: '2.1.0',
    personaSlug: slug || 'default',
    balanceSheet: {
      assets: {
        providers: {
          local:          { budget: 0.0, currency: 'USD', depositsTotal: 0.0, lastUpdated: now },
          'coinbase-cdp': { USDC: 0.0, ETH: 0.0, network: 'base', lastSynced: null },
          acn:            { credits: 0.0, lastSynced: null },
          onchain:        { USDC: 0.0, ETH: 0.0, network: 'base', lastSynced: null },
        },
        totalUSDEquivalent: 0.0,
      },
      primaryProvider,
      operationalBalance: 0.0,
      operationalCurrency,
      equity: { accumulatedNetIncome: 0.0 },
    },
    incomeStatement: {
      currency: operationalCurrency,
      currentPeriod: {
        periodStart: today,
        revenue: 0.0,
        expenses: {
          inference: { llm: { input: 0.0, output: 0.0, thinking: 0.0 } },
          runtime: { compute: 0.0, storage: 0.0, bandwidth: 0.0 },
          faculty: {},
          skill: {},
          agent: { acn: 0.0, a2a: 0.0 },
          custom: {},
          total: 0.0,
        },
        netIncome: 0.0,
      },
      allTime: { totalRevenue: 0.0, totalExpenses: 0.0, netIncome: 0.0 },
    },
    burnRateHistory: [],
    vitality: {
      score: 0.0, tier: 'suspended', diagnosis: 'unfunded',
      prescriptions: ['deposit_required'],
      daysToDepletion: null, dominantCost: null, trend: 'stable', computedAt: null,
    },
    ledger: [],
    createdAt: now,
    lastUpdatedAt: now,
  };
}

module.exports = { createInitialState };
