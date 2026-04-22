'use strict';

/**
 * OpenPersona – Skill publisher
 *
 * publish <owner/repo> — Register a GitHub skill pack with the OpenPersona
 *   skill directory at openpersona.co/skills
 *
 * This is a client-first implementation: the POST request is sent to the
 * server-side /api/skills/publish endpoint. If the endpoint returns 404 or
 * is not yet available, a graceful fallback message is printed instead of
 * erroring out. This allows the CLI to ship before server-side support lands.
 *
 * Respects DISABLE_TELEMETRY / DO_NOT_TRACK / CI env vars.
 */

const https = require('https');
const {
  printError,
  printWarning,
  printSuccess,
  printInfo,
  OPENPERSONA_DIRECTORY,
  OPENPERSONA_SKILLS_ENDPOINT,
} = require('../utils');

const GH_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function isTelemetryDisabled() {
  return !!(process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || process.env.CI);
}

/** Generic POST helper — returns { status, body } or { error } */
function post(url, payload) {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify(payload);
      const parsed = new URL(url);
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + (parsed.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'openpersona-cli',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }
      );
      req.on('error', (e) => resolve({ error: e.message }));
      req.setTimeout(10000, () => {
        req.destroy(new Error('Request timed out'));
      });
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

/**
 * openpersona skill publish <owner/repo>
 *
 * Registers a GitHub skill pack with the OpenPersona skill directory.
 * The server fetches metadata from the repo; no local files are uploaded.
 */
async function publish(ownerRepo) {
  if (!GH_REPO_RE.test(ownerRepo)) {
    printError(`Invalid repo format: "${ownerRepo}" — expected owner/repo (GitHub)`);
    process.exit(1);
  }

  printInfo(`Publishing ${ownerRepo} to the OpenPersona skill directory...`);
  printInfo(`  GitHub: https://github.com/${ownerRepo}`);

  if (isTelemetryDisabled()) {
    printInfo('Telemetry disabled — skipping publish.');
    return;
  }

  const publishUrl = `${OPENPERSONA_SKILLS_ENDPOINT}/publish`;
  const result = await post(publishUrl, { repo: ownerRepo });

  if (result.error) {
    printWarning(`Could not reach OpenPersona directory: ${result.error}`);
    _printWebFallback(ownerRepo);
    return;
  }

  if (result.status === 404 || result.status === 501) {
    printWarning('Skill directory endpoint not yet available (coming soon).');
    _printWebFallback(ownerRepo);
    return;
  }

  if (result.status && result.status >= 400) {
    let msg = `HTTP ${result.status}`;
    try {
      const parsed = JSON.parse(result.body);
      if (parsed.error) msg = parsed.error;
    } catch { /* ignore */ }
    printError(`Publish failed: ${msg}`);
    process.exit(1);
  }

  printSuccess(`Published! ${ownerRepo} is now listed in the OpenPersona skill directory.`);
  printInfo(`  View: ${OPENPERSONA_DIRECTORY}/skills`);
}

function _printWebFallback(ownerRepo) {
  printInfo('');
  printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  printInfo('  Register your skill via the web UI instead:');
  printInfo(`  ${OPENPERSONA_DIRECTORY}/skills`);
  printInfo('');
  printInfo('  Make sure your repo has a valid SKILL.md with frontmatter:');
  printInfo('    ---');
  printInfo('    name: My Skill');
  printInfo('    description: What this skill does');
  printInfo('    version: 1.0.0');
  printInfo('    ---');
  printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

module.exports = { publish };
