/**
 * OpenPersona - Persona export / import (zip archive)
 *
 * exportPersona: packages an installed persona directory (including soul/state.json)
 *                into a portable zip archive
 * importPersona: extracts a zip archive and installs the persona
 */
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const AdmZip = require('adm-zip');
const { install } = require('./installer');
const { resolveSoulFile } = require('./utils');

/**
 * Export an installed persona directory to a zip archive.
 *
 * @param {string} skillDir - Absolute path to the persona pack directory
 * @param {string} [outPath] - Output zip path (defaults to persona-<slug>.zip in cwd)
 * @returns {string} Path of the written zip file
 */
function exportPersona(skillDir, outPath) {
  const zip = new AdmZip();

  const SKIP_DIRS = new Set(['node_modules', '.git', '.DS_Store']);

  const addDir = (dir, zipPath) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const zp = zipPath ? `${zipPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) addDir(full, zp);
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
