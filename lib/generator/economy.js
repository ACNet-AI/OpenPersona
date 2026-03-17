/**
 * OpenPersona - Economy aspect builder
 *
 * Loads economy aspect source files and writes initial economic state files
 * into the generated skill pack.
 * Economy is a systemic concept (one of the 4+5+3 architecture's five aspects);
 * its runtime scripts live in aspects/economy/ and are physically copied into
 * each generated skill pack.
 *
 * agentbooks is required on demand inside writeEconomyFiles — only personas with
 * the economy aspect need it. A top-level require would break all persona generation
 * if the package is absent or releases a breaking change.
 */
const path = require('path');
const fs = require('fs-extra');
const { deriveWalletAddress } = require('./social');

const PKG_ROOT = path.resolve(__dirname, '../..');
const ASPECTS_DIR = path.join(PKG_ROOT, 'aspects');

/**
 * Load the economy aspect source from aspects/economy/.
 * Returns a faculty-compatible object (name, type, files, allowedTools, _dir)
 * so it can be merged into the generation pipeline for script/tool/SKILL.md copying.
 * Economy is a systemic concept — it lives in aspects/, not layers/faculties/.
 *
 * @returns {object|null} economy descriptor or null if aspects/economy not found
 */
function loadEconomy() {
  const economyDir = path.join(ASPECTS_DIR, 'economy');
  const economyJsonPath = path.join(economyDir, 'economy.json');
  if (!fs.existsSync(economyJsonPath)) {
    return null; // aspects/economy not found — writeEconomyFiles will still run
  }
  const economy = JSON.parse(fs.readFileSync(economyJsonPath, 'utf-8'));
  economy._dir = economyDir;
  return economy;
}

/**
 * Write economy/economic-identity.json and economy/economic-state.json when the
 * economy aspect is active. Both files are idempotent — existing files are
 * left untouched so live economic state is never overwritten on re-generation.
 *
 * @param {string} economyDir - absolute path to economy/ inside the skill pack
 * @param {object} persona    - normalized persona object
 */
async function writeEconomyFiles(economyDir, persona) {
  const {
    createInitialState: createInitialEconomicState,
    createIdentityInitialState: createIdentityInitialEconomicState,
  } = require('agentbooks');

  await fs.ensureDir(economyDir);

  const economicIdentityPath = path.join(economyDir, 'economic-identity.json');
  if (!fs.existsSync(economicIdentityPath)) {
    const identity = createIdentityInitialEconomicState(persona.slug);
    identity.walletAddress = deriveWalletAddress(persona.slug);
    await fs.writeFile(economicIdentityPath, JSON.stringify(identity, null, 2));
  }

  const economicStatePath = path.join(economyDir, 'economic-state.json');
  if (!fs.existsSync(economicStatePath)) {
    const initialState = createInitialEconomicState(persona.slug);
    await fs.writeFile(economicStatePath, JSON.stringify(initialState, null, 2));
  }
}

module.exports = { loadEconomy, writeEconomyFiles };
