#!/usr/bin/env node
'use strict';

/**
 * OpenPersona thin wrapper for agentbooks economy-hook.
 *
 * Maps OpenPersona env vars → AgentBooks env vars, then delegates.
 * PERSONA_SLUG → AGENTBOOKS_AGENT_ID mapping lives ONLY here.
 */

const path = require('path');
const os   = require('os');

// Map OpenPersona → AgentBooks (only if not already set)
process.env.AGENTBOOKS_AGENT_ID = process.env.AGENTBOOKS_AGENT_ID
  || process.env.PERSONA_SLUG
  || 'default';

process.env.AGENTBOOKS_DATA_PATH = process.env.AGENTBOOKS_DATA_PATH
  || process.env.ECONOMY_DATA_PATH
  || path.join(os.homedir(), '.openclaw', 'economy',
       `persona-${process.env.AGENTBOOKS_AGENT_ID}`);

require('../../../../packages/agentbooks/cli/economy-hook');
