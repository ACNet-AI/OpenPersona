/**
 * OpenPersona - Persona export / import (zip archive)
 *
 * exportPersona: packages an installed persona directory (including state.json at pack root)
 *                into a portable zip archive
 * importPersona: extracts a zip archive and installs the persona
 */
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { install } = require('./installer');
const { resolveSoulFile } = require('../utils');

/**
 * Parse a .gitignore file into a Set of excluded names/paths.
 * Handles comments (#) and blank lines; does not implement glob patterns
 * (the pack .gitignore only uses simple filenames and short paths).
 *
 * @param {string} gitignorePath
 * @returns {Set<string>}
 */
function parseGitignore(gitignorePath) {
  if (!fs.existsSync(gitignorePath)) return new Set();
  const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
  const excluded = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // Normalise: strip leading slash, keep the rest
    excluded.add(line.replace(/^\//, ''));
  }
  return excluded;
}

/**
 * Export an installed persona directory to a zip archive.
 * Files listed in the pack's .gitignore are excluded from the bundle
 * (e.g. acn-registration.json, state.json, handoff.json, soul/self-narrative.md).
 *
 * @param {string} skillDir - Absolute path to the persona pack directory
 * @param {string} [outPath] - Output zip path (defaults to persona-<slug>.zip in cwd)
 * @returns {string} Path of the written zip file
 */
function exportPersona(skillDir, outPath) {
  const zip = new AdmZip();

  const SKIP_DIRS = new Set(['node_modules', '.git', '.DS_Store']);
  // Read the pack's .gitignore to exclude sensitive runtime files
  const gitignored = parseGitignore(path.join(skillDir, '.gitignore'));

  const addDir = (dir, zipPath) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      // Build a relative path from the pack root (e.g. "soul/self-narrative.md")
      const relPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
      if (gitignored.has(relPath) || gitignored.has(entry.name)) continue;
      if (entry.isDirectory()) addDir(full, relPath);
      else zip.addLocalFile(full, zipPath || '');
    }
  };

  addDir(skillDir, '');

  const dest = outPath || path.join(process.cwd(), `persona-${path.basename(skillDir)}.zip`);
  zip.writeZip(dest);
  return dest;
}

/**
 * Import a persona from a zip archive and install it.
 *
 * @param {string} file - Path to the zip archive
 * @param {object} [options]
 * @param {string} [options.extractDir] - Temp extraction directory (auto-cleaned if inside tmpdir)
 * @returns {Promise<string>} Installed persona directory path
 */
async function importPersona(file, options = {}) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const extractDir = options.extractDir || path.join(os.tmpdir(), `openpersona-import-${Date.now()}`);
  await fs.ensureDir(extractDir);

  const zip = new AdmZip(file);
  zip.extractAllTo(extractDir, true);

  const personaPath = resolveSoulFile(extractDir, 'persona.json');
  if (!fs.existsSync(personaPath)) {
    await fs.remove(extractDir);
    throw new Error('Not a valid persona archive: persona.json not found');
  }

  const destDir = await install(extractDir);

  if (extractDir.startsWith(os.tmpdir())) {
    await fs.remove(extractDir);
  }

  return destDir;
}

module.exports = { exportPersona, importPersona };
