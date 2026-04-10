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

/**
 * Search the OpenPersona directory.
 * @param {string} query - text search term (empty = list all)
 * @param {object} [options]
 * @param {string} [options.type] - filter by packType: "single" or "multi"
 */
async function search(query, options = {}) {
  const term = (query || '').trim().toLowerCase();
  const typeFilter = options.type ? options.type.toLowerCase() : null;

  if (typeFilter && !['single', 'multi'].includes(typeFilter)) {
    printError(`Invalid --type: "${typeFilter}". Allowed values: single, multi`);
    return;
  }

  let result;
  try {
    result = await fetchPersonas();
  } catch (e) {
    printError(`Failed to reach OpenPersona directory: ${e.message}`);
    printInfo(`Browse manually: ${OPENPERSONA_DIRECTORY}`);
    throw e;
  }

  let personas = result.personas || [];

  // Filter by packType when --type is specified
  if (typeFilter) {
    personas = personas.filter((p) => (p.packType || 'single') === typeFilter);
  }

  const matches = term
    ? personas.filter((p) =>
        p.id?.toLowerCase().includes(term) ||
        p.name?.toLowerCase().includes(term) ||
        p.bio?.toLowerCase().includes(term) ||
        p.role?.toLowerCase().includes(term)
      )
    : personas;

  if (matches.length === 0) {
    const qualifier = typeFilter ? ` (type: ${typeFilter})` : '';
    printInfo(`No personas found matching "${query}"${qualifier}.`);
    printInfo(`Browse all: ${OPENPERSONA_DIRECTORY}`);
    return;
  }

  const typeLabel = typeFilter ? ` · type: ${typeFilter}` : '';
  console.log('');
  console.log(`  OpenPersona Directory — ${matches.length} result${matches.length === 1 ? '' : 's'}${term ? ` for "${query}"` : ''}${typeLabel}`);
  console.log('  ─────────────────────────────────────────────────');
  for (const p of matches) {
    const installs = p.installs > 0 ? ` · ${p.installs} install${p.installs === 1 ? '' : 's'}` : '';
    const role = p.role ? ` [${p.role}]` : '';
    const multiTag = p.packType === 'multi' ? ' [multi]' : '';
    const curatedTag = p.isCurated ? ' [curated]' : '';
    console.log(`  ${p.id}${role}${multiTag}${curatedTag}${installs}`);
    if (p.bio) console.log(`    ${p.bio}`);
    if (p.packType === 'multi') {
      console.log(`    $ openpersona install ${p.repo || p.id}  (browse bundle — installation not yet supported)`);
    } else {
      console.log(`    $ npx openpersona install ${p.id}`);
    }
    console.log('');
  }
  console.log(`  Browse: ${OPENPERSONA_DIRECTORY}`);
  console.log('');
}

module.exports = { search };
