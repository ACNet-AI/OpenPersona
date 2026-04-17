#!/usr/bin/env node
'use strict';

/**
 * Generate a dedupe migration report for directory entries.
 *
 * This script is read-only:
 * - Fetches https://openpersona.co/api/personas
 * - Detects duplicate canonical entries like "slug" + "slug--slug"
 * - Prints recommended admin actions to fix stale canonical versions
 *
 * Usage:
 *   node scripts/curation-dedupe-report.js
 *   node scripts/curation-dedupe-report.js --json
 *   node scripts/curation-dedupe-report.js --sql
 */

const https = require('https');

const PERSONAS_API = process.env.OPENPERSONA_PERSONAS_API || 'https://openpersona.co/api/personas';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'openpersona-cli' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
        }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error(`Request timed out for ${url}`)));
    req.on('error', reject);
  });
}

function parseDateSafe(v) {
  const t = Date.parse(v || '');
  return Number.isNaN(t) ? 0 : t;
}

function detectCanonicalDupes(personas) {
  const byRepo = new Map();
  for (const p of personas) {
    const key = (p.repo || '').toLowerCase();
    if (!key) continue;
    if (!byRepo.has(key)) byRepo.set(key, []);
    byRepo.get(key).push(p);
  }

  const findings = [];
  for (const [repo, rows] of byRepo.entries()) {
    const repoSlug = repo.split('/')[1] || '';
    if (!repoSlug) continue;
    const canonical = rows.find((r) => r.id === repoSlug);
    const shadow = rows.find((r) => r.id === `${repoSlug}--${repoSlug}`);
    if (!canonical || !shadow) continue;

    const newer = parseDateSafe(shadow.updatedAt) >= parseDateSafe(canonical.updatedAt);
    const versionDiff = (canonical.version || '') !== (shadow.version || '');

    findings.push({
      repo,
      canonical: {
        id: canonical.id,
        version: canonical.version || '',
        updatedAt: canonical.updatedAt || '',
      },
      shadow: {
        id: shadow.id,
        version: shadow.version || '',
        updatedAt: shadow.updatedAt || '',
      },
      recommendedVersion: newer ? (shadow.version || canonical.version || '') : (canonical.version || shadow.version || ''),
      recommendedUpdatedAt: newer ? (shadow.updatedAt || canonical.updatedAt || '') : (canonical.updatedAt || shadow.updatedAt || ''),
      versionDiff,
      newerShadow: newer,
      actions: [
        {
          type: 'update',
          targetId: canonical.id,
          fields: {
            version: newer ? (shadow.version || canonical.version || '') : (canonical.version || shadow.version || ''),
            updatedAt: newer ? (shadow.updatedAt || canonical.updatedAt || '') : (canonical.updatedAt || shadow.updatedAt || ''),
          },
        },
        {
          type: 'delete',
          targetId: shadow.id,
        },
      ],
    });
  }

  return findings.sort((a, b) => a.repo.localeCompare(b.repo));
}

function printHuman(findings) {
  if (findings.length === 0) {
    console.log('No canonical duplicate patterns found (slug + slug--slug).');
    return;
  }

  console.log(`Found ${findings.length} canonical duplicate pattern(s):\n`);
  for (const f of findings) {
    console.log(`Repo: ${f.repo}`);
    console.log(`  canonical: ${f.canonical.id}  v${f.canonical.version || 'unknown'}  @ ${f.canonical.updatedAt || 'unknown'}`);
    console.log(`  shadow   : ${f.shadow.id}  v${f.shadow.version || 'unknown'}  @ ${f.shadow.updatedAt || 'unknown'}`);
    console.log(`  action 1 : UPDATE ${f.canonical.id} => version=${f.recommendedVersion || 'unknown'}, updatedAt=${f.recommendedUpdatedAt || 'unknown'}`);
    console.log(`  action 2 : DELETE ${f.shadow.id}`);
    console.log('');
  }

  console.log('Tip: apply these actions in your directory backend admin tool/SQL console.');
}

function sqlEscape(value) {
  return String(value || '').replace(/'/g, "''");
}

function printSql(findings) {
  if (findings.length === 0) {
    console.log('-- No canonical duplicate patterns found (slug + slug--slug).');
    return;
  }

  console.log('-- OpenPersona canonical dedupe SQL template');
  console.log('-- Replace personas with your real table name if different.');
  console.log('BEGIN;');
  for (const f of findings) {
    console.log('');
    console.log(`-- ${f.repo}`);
    console.log(
      `UPDATE personas SET version='${sqlEscape(f.recommendedVersion)}', updatedAt='${sqlEscape(f.recommendedUpdatedAt)}'` +
      ` WHERE id='${sqlEscape(f.canonical.id)}' AND repo='${sqlEscape(f.repo)}';`
    );
    console.log(
      `DELETE FROM personas WHERE id='${sqlEscape(f.shadow.id)}' AND repo='${sqlEscape(f.repo)}';`
    );
  }
  console.log('');
  console.log('COMMIT;');
}

async function main() {
  const asJson = process.argv.includes('--json');
  const asSql = process.argv.includes('--sql');
  const data = await fetchJson(PERSONAS_API);
  const personas = Array.isArray(data.personas) ? data.personas : [];
  const findings = detectCanonicalDupes(personas);

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
    return;
  }
  if (asSql) {
    printSql(findings);
    return;
  }

  printHuman(findings);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

