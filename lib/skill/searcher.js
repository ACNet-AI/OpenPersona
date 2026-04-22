'use strict';

/**
 * OpenPersona – Skill searcher
 *
 * Queries the OpenPersona skill directory at openpersona.co/api/skills.
 * Falls back gracefully when the endpoint is not yet available.
 */

const https = require('https');
const { printError, printInfo, OPENPERSONA_DIRECTORY, OPENPERSONA_SKILLS_ENDPOINT } = require('../utils');

function fetchSkills(query) {
  return new Promise((resolve, reject) => {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    const url = `${OPENPERSONA_SKILLS_ENDPOINT}${q}`;
    try {
      const parsed = new URL(url);
      const req = https.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + (parsed.search || ''),
          headers: { 'User-Agent': 'openpersona-cli' },
        },
        (res) => {
          if (res.statusCode === 404 || res.statusCode === 501) {
            resolve({ notAvailable: true });
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`OpenPersona skill directory returned HTTP ${res.statusCode}`));
            return;
          }
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error(`Invalid response: ${e.message}`)); }
          });
        }
      );
      req.setTimeout(8000, () => {
        req.destroy(new Error('Request timed out after 8s'));
      });
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Search the OpenPersona skill directory.
 * @param {string} query - text search term (empty = list all)
 */
async function search(query) {
  const term = (query || '').trim().toLowerCase();

  let result;
  try {
    result = await fetchSkills(term);
  } catch (e) {
    printError(`Failed to reach OpenPersona skill directory: ${e.message}`);
    printInfo(`Browse manually: ${OPENPERSONA_DIRECTORY}/skills`);
    throw e;
  }

  if (result.notAvailable) {
    printInfo('');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo('  Skill directory search is coming soon!');
    printInfo(`  Browse skills at: ${OPENPERSONA_DIRECTORY}/skills`);
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo('');
    return;
  }

  const skills = result.skills || [];
  const matches = term
    ? skills.filter((s) =>
        s.id?.toLowerCase().includes(term) ||
        s.name?.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term)
      )
    : skills;

  if (matches.length === 0) {
    printInfo(`No skills found matching "${query}".`);
    printInfo(`Browse all: ${OPENPERSONA_DIRECTORY}/skills`);
    return;
  }

  console.log('');
  console.log(`  OpenPersona Skill Directory — ${matches.length} result${matches.length === 1 ? '' : 's'}${term ? ` for "${query}"` : ''}`);
  console.log('  ─────────────────────────────────────────────────');
  for (const s of matches) {
    const installs = s.installs > 0 ? ` · ${s.installs} install${s.installs === 1 ? '' : 's'}` : '';
    console.log(`  ${s.id || s.repo}${installs}`);
    if (s.description) console.log(`    ${s.description}`);
    console.log(`    $ openpersona skill install ${s.repo || s.id}`);
    console.log('');
  }
  console.log(`  Browse: ${OPENPERSONA_DIRECTORY}/skills`);
  console.log('');
}

module.exports = { search };
