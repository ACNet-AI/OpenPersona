/**
 * OpenPersona - Search personas in the OpenPersona directory
 */
const https = require('https');
const { printError, printInfo, OPENPERSONA_DIRECTORY } = require('../utils');

const PERSONAS_API = `${OPENPERSONA_DIRECTORY}/api/personas`;

function fetchPersonas() {
  return new Promise((resolve, reject) => {
    const req = https.get(PERSONAS_API, { headers: { 'User-Agent': 'openpersona-cli' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`OpenPersona directory returned HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid response from directory: ${e.message}`)); }
      });
    });
    req.setTimeout(8000, () => {
      req.destroy(new Error('Request timed out after 8s'));
    });
    req.on('error', reject);
  });
}

async function search(query) {
  const term = (query || '').trim().toLowerCase();

  let result;
  try {
    result = await fetchPersonas();
  } catch (e) {
    printError(`Failed to reach OpenPersona directory: ${e.message}`);
    printInfo(`Browse manually: ${OPENPERSONA_DIRECTORY}`);
    throw e;
  }

  const personas = result.personas || [];
  const matches = term
    ? personas.filter((p) =>
        p.id?.toLowerCase().includes(term) ||
        p.name?.toLowerCase().includes(term) ||
        p.bio?.toLowerCase().includes(term) ||
        p.role?.toLowerCase().includes(term)
      )
    : personas;

  if (matches.length === 0) {
    printInfo(`No personas found matching "${query}".`);
    printInfo(`Browse all: ${OPENPERSONA_DIRECTORY}`);
    return;
  }

  console.log('');
  console.log(`  OpenPersona Directory — ${matches.length} result${matches.length === 1 ? '' : 's'}${term ? ` for "${query}"` : ''}`);
  console.log('  ─────────────────────────────────────────────────');
  for (const p of matches) {
    const installs = p.installs > 0 ? ` · ${p.installs} install${p.installs === 1 ? '' : 's'}` : '';
    const role = p.role ? ` [${p.role}]` : '';
    console.log(`  ${p.id}${role}${installs}`);
    if (p.bio) console.log(`    ${p.bio}`);
    console.log(`    $ npx openpersona install ${p.id}`);
    console.log('');
  }
  console.log(`  Browse: ${OPENPERSONA_DIRECTORY}`);
  console.log('');
}

module.exports = { search };
