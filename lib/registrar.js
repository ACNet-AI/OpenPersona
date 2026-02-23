/**
 * OpenPersona — ACN Registrar
 *
 * Reads the generated acn-config.json + agent-card.json from a persona pack
 * and registers the persona with the ACN gateway via POST /api/v1/agents/join.
 *
 * Saves registration result to acn-registration.json in the persona directory.
 */
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const http = require('http');
const { printError, printSuccess, printInfo, printWarning, resolveSoulFile } = require('./utils');

/**
 * Make an HTTP/HTTPS POST request.
 * @param {string} url
 * @param {object} body
 * @returns {Promise<{status: number, body: object}>}
 */
function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(d) });
          } catch {
            resolve({ status: res.statusCode, body: d });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Register a persona with ACN.
 *
 * @param {string} skillDir  Absolute path to the generated persona pack directory
 * @param {object} options
 * @param {string} [options.endpoint]   Agent A2A endpoint URL (replaces <RUNTIME_ENDPOINT>)
 * @param {boolean} [options.dryRun]    Print payload without calling ACN
 * @returns {Promise<object>}  ACN join response
 */
async function registerWithAcn(skillDir, options = {}) {
  const { endpoint = '', dryRun = false } = options;

  // --- Read generated files ---
  const acnConfigPath = path.join(skillDir, 'acn-config.json');
  const agentCardPath = path.join(skillDir, 'agent-card.json');
  const personaPath = resolveSoulFile(skillDir, 'persona.json');

  if (!fs.existsSync(acnConfigPath)) {
    throw new Error(`acn-config.json not found in ${skillDir}. Run 'openpersona create' first.`);
  }
  if (!fs.existsSync(agentCardPath)) {
    throw new Error(`agent-card.json not found in ${skillDir}.`);
  }

  const acnConfig = JSON.parse(fs.readFileSync(acnConfigPath, 'utf-8'));
  const agentCard = JSON.parse(fs.readFileSync(agentCardPath, 'utf-8'));

  // Read persona name/bio for join payload
  let personaBio = acnConfig.name;
  if (fs.existsSync(personaPath)) {
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    personaBio = persona.bio || persona.personaName;
  }

  const gateway = acnConfig.acn_gateway;
  if (!gateway || gateway === '<RUNTIME_ACN_GATEWAY>') {
    throw new Error(
      'acn_gateway is not configured. Set body.runtime.acn_gateway in persona.json and regenerate.'
    );
  }

  // Build Agent Card with resolved endpoint
  const resolvedCard = { ...agentCard };
  if (endpoint) {
    resolvedCard.url = endpoint;
  }

  // Build join payload
  const payload = {
    name: acnConfig.name,
    description: personaBio,
    skills: acnConfig.skills,
    endpoint: endpoint || undefined,
    agent_card: resolvedCard,
  };

  // --- Dry run ---
  if (dryRun) {
    printInfo('Dry run — would POST to: ' + gateway + '/api/v1/agents/join');
    console.log(JSON.stringify(payload, null, 2));
    return { dryRun: true, payload };
  }

  // --- Call ACN ---
  printInfo(`Registering ${acnConfig.name} with ACN at ${gateway} ...`);

  let res;
  try {
    res = await post(gateway + '/api/v1/agents/join', payload);
  } catch (err) {
    throw new Error(`Failed to reach ACN gateway: ${err.message}`);
  }

  if (res.status !== 200) {
    const detail = typeof res.body === 'object' ? res.body.detail || JSON.stringify(res.body) : res.body;
    throw new Error(`ACN registration failed (HTTP ${res.status}): ${detail}`);
  }

  const result = res.body;

  // --- Persist registration result ---
  const registrationRecord = {
    registeredAt: new Date().toISOString(),
    gateway,
    agentId: result.agent_id,
    apiKey: result.api_key,
    status: result.status,
    claimStatus: result.claim_status,
    claimUrl: result.claim_url,
    agentCardUrl: result.agent_card_url,
    heartbeatEndpoint: result.heartbeat_endpoint,
    tasksEndpoint: result.tasks_endpoint,
  };

  const regPath = path.join(skillDir, 'acn-registration.json');
  await fs.writeFile(regPath, JSON.stringify(registrationRecord, null, 2));

  return result;
}

module.exports = { registerWithAcn };
