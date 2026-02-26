'use strict';

/**
 * OpenPersona Vitality Aggregator
 *
 * Vitality is an OpenPersona-level concept that aggregates multiple health
 * dimensions into a single score. The financial dimension is provided by
 * AgentBooks; future dimensions (memory, social, reputation) will be added
 * here without changing AgentBooks.
 *
 * Current implementation: single financial dimension (transparent pass-through).
 *
 * Extension point: When new dimensions are ready, add them to calcVitality
 * as parallel calls and weight-average the results.
 */

const path = require('path');
const os   = require('os');

const { calcFinancialHealth } = require('../packages/agentbooks/src/index');

/**
 * Calculate aggregated Vitality for an agent.
 *
 * @param {string} agentId
 * @param {object} adapter  - Storage adapter (JsonFileAdapter or InMemoryAdapter)
 * @returns {{ tier, score, dimensions: { financial: object } }}
 */
function calcVitality(agentId, adapter) {
  const state    = adapter.readSync(agentId);
  const identity = adapter.readIdentitySync(agentId);

  // Financial dimension (from AgentBooks)
  const financial = calcFinancialHealth(state, identity);

  // ── Future dimensions (reserved) ──────────────────────────────────────────
  // const memory   = calcMemoryHealth(agentId);     // not yet implemented
  // const social   = calcSocialHealth(agentId);     // not yet implemented

  // ── Aggregation (currently single-dimension) ──────────────────────────────
  // When additional dimensions are implemented, replace with weighted average:
  //   const score = financial.fhs * 0.4 + memory.score * 0.3 + social.score * 0.3;
  const score = financial.fhs;
  const tier  = financial.tier;

  return {
    tier,
    score,
    dimensions: {
      financial: {
        fhs:             financial.fhs,
        tier:            financial.tier,
        diagnosis:       financial.diagnosis,
        prescriptions:   financial.prescriptions,
        daysToDepletion: financial.daysToDepletion,
        dominantCost:    financial.dominantCost,
        trend:           financial.trend,
      },
      // memory: null,   // reserved
      // social: null,   // reserved
    },
  };
}

module.exports = { calcVitality };
