/**
 * OpenPersona - Persona registry publisher
 *
 * Workflow:
 *   1. Validates that the GitHub repo (owner/repo) contains a valid persona pack
 *      (looks for persona.json or soul/persona.json on the main branch)
 *   2. Registers the persona with the OpenPersona directory via telemetry endpoint
 *      so it appears on the leaderboard without waiting for installs
 *
 * The persona remains installable via `openpersona install owner/repo` regardless
 * of whether registration succeeds.
 */
const https = require('https');
const { printError, printWarning, printSuccess, printInfo } = require('../utils');

const TELEMETRY_ENDPOINT = process.env.OPENPERSONA_TELEMETRY_URL || 'https://openpersona-frontend.vercel.app/api/telemetry';

/**
 * Fetch a file from a raw GitHub URL, following redirects.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const MAX_HOPS = 5;
    const follow = (u, hops) => {
      if (hops > MAX_HOPS) {
        reject(new Error(`Too many redirects (>${MAX_HOPS}) fetching ${url}`));
        return;
      }
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, { headers: { 'User-Agent': 'OpenPersona/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location, hops + 1);
          return;
        }
        if (res.statusCode === 404) {
          reject(new Error(`Not found: ${u}`));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Invalid JSON at ${u}: ${e.message}`)); }
        });
      }).on('error', reject);
    };
    follow(url, 0);
  });
}

/**
 * Validate that owner/repo is a valid OpenPersona pack on GitHub.
 * Tries `main` branch first, falls back to `master`.
 * Within each branch, tries root persona.json before soul/persona.json.
 */
async function validateRepo(ownerRepo) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error(`Invalid GitHub repo format: "${ownerRepo}" — expected owner/repo`);
  }

  let persona = null;

  for (const branch of ['main', 'master']) {
    const base = `https://raw.githubusercontent.com/${ownerRepo}/${branch}`;
    for (const candidate of [`${base}/persona.json`, `${base}/soul/persona.json`]) {
      try {
        persona = await fetchJson(candidate);
        break;
      } catch (e) {
        if (!e.message.startsWith('Not found')) throw e;
      }
    }
    if (persona) break;
  }

  if (!persona) {
    throw new Error(
      `No persona.json found in ${ownerRepo}.\n` +
      `Make sure your repo contains persona.json (or soul/persona.json) at the root of the main or master branch.`
    );
  }

  const missing = ['slug', 'personaName', 'bio'].filter((f) => !persona[f]);
  if (missing.length) {
    throw new Error(`persona.json is missing required fields: ${missing.join(', ')}`);
  }

  return persona;
}

/**
 * Report a publish event to the frontend so the persona appears
 * in the leaderboard immediately (before any installs).
 */
function reportPublish(slug, { repo, bio, role } = {}) {
  return new Promise((resolve) => {
    try {
      if (process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || process.env.CI) {
        resolve({ skipped: true });
        return;
      }
      const url = new URL(TELEMETRY_ENDPOINT);
      const payload = {
        slug,
        event: 'publish',
        repo,
        meta: { bio: bio || '', role: role || 'assistant' },
      };
      const body = JSON.stringify(payload);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'openpersona-cli',
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', (e) => resolve({ error: e.message }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function publish(ownerRepo) {
  printInfo(`Validating ${ownerRepo}...`);

  const persona = await validateRepo(ownerRepo);
  const { slug, personaName, bio, role } = persona;

  printSuccess(`Valid OpenPersona pack: ${personaName} (${slug})`);
  printInfo(`  Bio: ${bio}`);
  printInfo(`Registering with OpenPersona directory...`);

  const result = await reportPublish(slug, { repo: ownerRepo, bio, role });

  if (result.skipped) {
    printInfo('Telemetry disabled — skipping registration.');
    printSuccess(`Published: openpersona install ${ownerRepo}`);
    return;
  }

  if (result.status === 409) {
    printWarning(`Slug "${slug}" is already registered to a different repo.`);
    printInfo(`If this is your persona, make sure the repo field in persona.json matches exactly.`);
    printInfo(`Your persona is still installable: openpersona install ${ownerRepo}`);
    return;
  }

  if (result.error || (result.status && result.status >= 400)) {
    printError(`Registration request failed${result.error ? ': ' + result.error : ` (HTTP ${result.status})`}`);
    printInfo(`Your persona is still installable: openpersona install ${ownerRepo}`);
    printInfo(`It will appear on the leaderboard once someone installs it.`);
    return;
  }

  printSuccess(`Published! ${personaName} is now listed on the OpenPersona directory.`);
  printInfo(`  Install: openpersona install ${ownerRepo}`);
  printInfo(`  Browse:  https://openpersona-frontend.vercel.app`);
}

module.exports = { publish };
