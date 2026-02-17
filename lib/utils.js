/**
 * OpenPersona - Utility functions and error handling
 */
const path = require('path');
const chalk = require('chalk');

const OP_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '~', '.openclaw');
const OP_SKILLS_DIR = path.join(OP_HOME, 'skills');
const OP_WORKSPACE = path.join(OP_HOME, 'workspace');

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(process.env.HOME || '', p.slice(1));
  }
  return p;
}

function resolvePath(...segments) {
  return path.resolve(expandHome(path.join(...segments)));
}

function printError(msg) {
  console.error(chalk.red('Error:'), msg);
}

function printWarning(msg) {
  console.warn(chalk.yellow('Warning:'), msg);
}

function printSuccess(msg) {
  console.log(chalk.green('✓'), msg);
}

function printInfo(msg) {
  console.log(chalk.blue('ℹ'), msg);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Security: validate names used in shell commands or file paths
const SAFE_NAME_RE = /^[a-zA-Z0-9@][a-zA-Z0-9@/_.-]*$/;

function validateName(name, label = 'name') {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid ${label}: "${name}" — only alphanumeric, @, /, _, ., - allowed`);
  }
  return name;
}

// Security: escape a string for safe use inside single-quoted shell arguments
function shellEscape(str) {
  if (typeof str !== 'string') str = String(str);
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Sync heartbeat config from a persona's manifest.json into openclaw.json.
 *
 * - If the manifest defines a heartbeat block, write it to config.heartbeat.
 * - If not, explicitly disable heartbeat to avoid leaking a previous persona's
 *   heartbeat settings.
 *
 * @param {object} config - The parsed openclaw.json object (mutated in place)
 * @param {string} manifestPath - Absolute path to the persona's manifest.json
 * @returns {{ synced: boolean, heartbeat: object|null }} result
 */
function syncHeartbeat(config, manifestPath) {
  const fs = require('fs-extra');

  let heartbeat = null;

  // Primary source: manifest.json
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      heartbeat = manifest.heartbeat || null;
    } catch {
      // Malformed manifest — fall through to persona.json
    }
  }

  // Fallback: persona.json in the same directory (for older packs without manifest.json)
  if (!heartbeat) {
    const personaPath = path.join(path.dirname(manifestPath), 'persona.json');
    if (fs.existsSync(personaPath)) {
      try {
        const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
        heartbeat = persona.heartbeat || null;
      } catch {
        // Malformed persona.json — treat as no heartbeat
      }
    }
  }

  if (heartbeat && heartbeat.enabled) {
    config.heartbeat = heartbeat;
    return { synced: true, heartbeat };
  }

  // No heartbeat defined (or disabled) — explicitly turn off
  config.heartbeat = { enabled: false };
  return { synced: false, heartbeat: null };
}

module.exports = {
  OP_HOME,
  OP_SKILLS_DIR,
  OP_WORKSPACE,
  expandHome,
  resolvePath,
  printError,
  printWarning,
  printSuccess,
  printInfo,
  slugify,
  validateName,
  shellEscape,
  syncHeartbeat,
  SAFE_NAME_RE,
};
