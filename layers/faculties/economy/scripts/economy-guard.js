#!/usr/bin/env node
'use strict';

/**
 * OpenPersona thin wrapper for agentbooks economy-guard.
 *
 * Outputs FINANCIAL_HEALTH_REPORT (not VITALITY_REPORT).
 * Vitality is aggregated by `openpersona vitality score <slug>` command.
 */

const path = require('path');
const os   = require('os');

process.env.AGENTBOOKS_AGENT_ID = process.env.AGENTBOOKS_AGENT_ID
  || process.env.PERSONA_SLUG
  || 'default';

process.env.AGENTBOOKS_DATA_PATH = process.env.AGENTBOOKS_DATA_PATH
  || process.env.ECONOMY_DATA_PATH
  || path.join(os.homedir(), '.openclaw', 'economy',
       `persona-${process.env.AGENTBOOKS_AGENT_ID}`);

require('agentbooks/cli/economy-guard');
