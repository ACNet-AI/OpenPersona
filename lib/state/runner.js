/**
 * OpenPersona - Persona directory resolution and state-sync runner
 *
 * Provides helpers for locating installed personas and delegating
 * state management commands to the persona's own scripts/state-sync.js.
 *
 * Used by CLI state commands (read/write/signal) and any other code
 * that needs to locate an installed persona by slug.
 */
const path = require('path');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');
const { OP_SKILLS_DIR, OPENCLAW_HOME, printError } = require('../utils');
const { loadRegistry } = require('../registry');

/**
 * Locate an installed persona's directory by slug.
 * Resolution order:
 *   1. Registry-stored path (survives directory moves)
 *   2. ~/.openpersona/personas/persona-<slug>
 *   3. Legacy ~/.openclaw/skills/persona-<slug>
 *
 * @param {string} slug
 * @returns {string|null} Absolute path to the persona directory, or null if not found
 */
function resolvePersonaDir(slug) {
  const reg = loadRegistry();
  const entry = reg.personas && reg.personas[slug];
  if (entry && entry.path && fs.existsSync(entry.path)) return entry.path;

  const defaultDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (fs.existsSync(defaultDir)) return defaultDir;

  const legacyDir = path.join(OPENCLAW_HOME, 'skills', `persona-${slug}`);
  if (fs.existsSync(legacyDir)) return legacyDir;

  return null;
}

/**
 * Delegate a state-sync command to the persona's own scripts/state-sync.js.
 * Exits the process with the appropriate code if anything fails.
 *
 * @param {string} slug
 * @param {string[]} args - Arguments passed to state-sync.js (e.g. ['read'] or ['write', '{}'])
 */
function runStateSyncCommand(slug, args) {
  const personaDir = resolvePersonaDir(slug);
  if (!personaDir) {
    printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
    process.exit(1);
  }
  const syncScript = path.join(personaDir, 'scripts', 'state-sync.js');
  if (!fs.existsSync(syncScript)) {
    printError(`state-sync.js not found in persona-${slug}. Update the persona: openpersona update ${slug}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [syncScript, ...args], {
    cwd: personaDir,
    encoding: 'utf-8',
  });
  if (result.error) {
    printError(`Failed to run state-sync.js: ${result.error.message}`);
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

module.exports = { resolvePersonaDir, runStateSyncCommand };
