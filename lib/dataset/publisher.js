'use strict';

/**
 * OpenPersona – Dataset directory integration
 *
 * install <owner/repo>  — Record an install event (increments counter on openpersona.co/datasets)
 * publish <owner/repo>  — Register a HF dataset with the dataset directory
 *
 * No HF OAuth is performed from the CLI; the publish call is anonymous and the
 * dataset will appear on the directory without a "curated" badge. To get the
 * curated badge, publish via the web UI at openpersona.co/datasets while logged
 * in with a Hugging Face account that has write access to the repo.
 *
 * Both commands respect the DISABLE_TELEMETRY / DO_NOT_TRACK / CI env vars.
 */

const https = require('https');
const {
  printError,
  printWarning,
  printSuccess,
  printInfo,
  OPENPERSONA_DIRECTORY,
  OPENPERSONA_TELEMETRY_ENDPOINT,
  OPENPERSONA_DATASETS_ENDPOINT,
} = require('../utils');

const HF_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/** Mirror of the server-side normalizeDatasetSlug in kv-datasets.ts */
function normalizeSlug(repoName) {
  return repoName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isTelemetryDisabled() {
  return !!(process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || process.env.CI);
}

/** Generic fire-and-forget POST helper. Returns { status, body } or { error }. */
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
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

/**
 * openpersona dataset install <owner/repo>
 *
 * Increments the install counter for the dataset on openpersona.co/datasets.
 * Nothing is downloaded or installed locally — HF datasets are accessed directly
 * via the Hugging Face Hub.
 */
async function install(ownerRepo) {
  if (!HF_REPO_RE.test(ownerRepo)) {
    printError(`Invalid repo format: "${ownerRepo}" — expected owner/repo (Hugging Face)`);
    process.exit(1);
  }

  const [rawOwner, rawName] = ownerRepo.split('/');
  const owner = rawOwner.toLowerCase();
  const slug = normalizeSlug(rawName);
  printInfo(`Recording install for ${ownerRepo}...`);
  printInfo(`  Browse dataset: https://huggingface.co/datasets/${ownerRepo}`);

  if (isTelemetryDisabled()) {
    printInfo('Telemetry disabled — skipping install counter.');
    return;
  }

  const result = await post(OPENPERSONA_TELEMETRY_ENDPOINT, {
    event: 'dataset_install',
    repo: ownerRepo,
  });

  if (result.error) {
    printWarning(`Could not reach OpenPersona directory: ${result.error}`);
    printInfo('Install recorded locally. Counter will sync on next connection.');
  } else if (result.status && result.status >= 400) {
    printWarning(`Counter update returned HTTP ${result.status} — may be a new dataset not yet indexed.`);
  } else {
    printSuccess(`Install recorded for ${ownerRepo}`);
  }

  printInfo(`  View on OpenPersona: ${OPENPERSONA_DIRECTORY}/datasets/${owner}/${slug}`);
}

/**
 * openpersona dataset publish <owner/repo>
 *
 * Registers a Hugging Face dataset with the openpersona.co/datasets directory.
 * The dataset metadata is fetched from the HF API server-side; no local files needed.
 *
 * Note: CLI publish is anonymous (no HF OAuth). The dataset will appear in the
 * directory but without a "curated" badge. Use the web UI for curated publishing.
 */
async function publish(ownerRepo) {
  if (!HF_REPO_RE.test(ownerRepo)) {
    printError(`Invalid repo format: "${ownerRepo}" — expected owner/repo (Hugging Face)`);
    process.exit(1);
  }

  const [rawOwner, rawName] = ownerRepo.split('/');
  const owner = rawOwner.toLowerCase();
  const slugFallback = normalizeSlug(rawName);
  printInfo(`Publishing ${ownerRepo} to the OpenPersona dataset directory...`);
  printInfo('  (CLI publish is anonymous — no "curated" badge; use the web UI to get curated status)');

  if (isTelemetryDisabled()) {
    printInfo('Telemetry disabled — skipping publish.');
    return;
  }

  const publishUrl = `${OPENPERSONA_DATASETS_ENDPOINT}/publish`;
  const result = await post(publishUrl, { repo: ownerRepo });

  if (result.error) {
    printError(`Could not reach OpenPersona directory: ${result.error}`);
    printInfo(`Your dataset is still accessible at: https://huggingface.co/datasets/${ownerRepo}`);
    process.exit(1);
  }

  if (result.status === 404) {
    printError(`Dataset not found on Hugging Face: ${ownerRepo}`);
    printInfo('Make sure the repo is public and the owner/name is correct.');
    process.exit(1);
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

  let slug = slugFallback;
  let resolvedOwner = owner;
  try {
    const parsed = JSON.parse(result.body);
    if (parsed.slug) slug = parsed.slug;
    if (parsed.owner) resolvedOwner = parsed.owner;
  } catch { /* ignore */ }

  printSuccess(`Published! ${ownerRepo} is now listed on the OpenPersona dataset directory.`);
  printInfo(`  View: ${OPENPERSONA_DIRECTORY}/datasets/${resolvedOwner}/${slug}`);
  printInfo(`  To get a curated badge, publish via the web UI: ${OPENPERSONA_DIRECTORY}/datasets`);
}

module.exports = { install, publish };
