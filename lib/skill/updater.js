'use strict';

/**
 * OpenPersona – Skill updater
 *
 * Re-downloads a skill from the source URL recorded in the registry and
 * overwrites the installed directory in place. Mirrors `openpersona update`
 * semantics for persona packs.
 */

const path = require('path');
const fs = require('fs-extra');
const { printError, printSuccess, printInfo, printWarning } = require('../utils');
const { loadRegistry } = require('../registry');
const { installSkill } = require('./installer');

/**
 * Update an installed skill by slug.
 *
 * @param {string} slug
 * @param {object} [opts]
 * @param {string} [opts.regPath] - Override registry file path (for tests)
 */
async function updateSkill(slug, opts = {}) {
  const { regPath } = opts;
  const reg = loadRegistry(regPath);
  const entry = reg.personas?.[slug];

  if (!entry || entry.resourceType !== 'skill') {
    printError(`Skill not found in registry: "${slug}"`);
    printInfo('Run `openpersona skill list` to see installed skills.');
    process.exit(1);
  }

  const source = entry.source;
  if (!source) {
    printError(`No source URL recorded for skill "${slug}". Cannot auto-update.`);
    printInfo(`Re-install manually: openpersona skill install <source>`);
    process.exit(1);
  }

  printInfo(`Updating ${slug} from ${source}...`);

  // Re-use the downloader from remote/downloader.js to fetch fresh copy
  let downloader;
  try {
    downloader = require('../remote/downloader');
  } catch {
    printError('Downloader module not found. Please re-install openpersona.');
    process.exit(1);
  }

  let tmpDir;
  try {
    tmpDir = await downloader.download(source);
  } catch (e) {
    printError(`Failed to download from ${source}: ${e.message}`);
    process.exit(1);
  }

  // Find SKILL.md in downloaded dir
  const skillMdCandidates = [
    path.join(tmpDir, 'SKILL.md'),
    path.join(tmpDir, 'SKILL', 'SKILL.md'),
    path.join(tmpDir, 'skill', 'SKILL.md'),
  ];
  const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));

  if (!skillMdPath) {
    printError(`No SKILL.md found in downloaded package from ${source}`);
    await fs.remove(tmpDir);
    process.exit(1);
  }

  // Determine the installTarget from registry entry so we overwrite the correct location
  const installTarget = entry.installTarget || entry.path;
  const targetParentDir = installTarget ? path.dirname(installTarget) : null;

  // Build opts so installer writes to the same location
  const installOpts = { source, regPath };
  if (targetParentDir) {
    // Resolve runtime from target parent if recognizable
    if (targetParentDir.includes('.claude/skills')) installOpts.runtime = 'claude';
    else if (targetParentDir.includes('.cursor/skills')) installOpts.runtime = 'cursor';
    else if (targetParentDir.endsWith(path.join('.hermes', 'skills'))) installOpts.runtime = 'hermes';
    else if (targetParentDir.includes('.openpersona/skills')) installOpts.runtime = 'openpersona';
    else if (targetParentDir.endsWith(path.join('.agents', 'skills'))) {
      const isGlobal = targetParentDir === path.join(require('os').homedir(), '.agents', 'skills');
      if (isGlobal) installOpts.global = true;
    }
  }

  await installSkill(tmpDir, skillMdPath, installOpts);

  // Cleanup temp directory
  try { await fs.remove(tmpDir); } catch { /* ignore */ }

  printSuccess(`${slug} updated successfully`);
}

module.exports = { updateSkill };
