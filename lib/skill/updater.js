'use strict';

/**
 * OpenPersona – Skill updater
 *
 * Re-downloads a skill from the source URL recorded in the registry and
 * overwrites every installTargets directory that was recorded at install
 * time. Mirrors `openpersona update` semantics for persona packs while
 * preserving the exact set of locations originally chosen (including --all
 * multi-target installs).
 */

const path = require('path');
const fs = require('fs-extra');
const { printError, printSuccess, printInfo } = require('../utils');
const { loadRegistry, registryAdd } = require('../registry');
const { parseFrontmatter, resolveVersion } = require('./installer');

/**
 * Update an installed skill by slug.
 *
 * @param {string} slug
 * @param {object} [opts]
 * @param {string} [opts.regPath] - Override registry file path (for tests)
 * @param {object} [opts.downloader] - Override downloader (for tests).
 *   Must expose a download(source) → { dir, skipCopy } method.
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

  const targets = Array.isArray(entry.installTargets) && entry.installTargets.length > 0
    ? entry.installTargets
    : [entry.installTarget || entry.path].filter(Boolean);

  if (targets.length === 0) {
    printError(`No install targets recorded for skill "${slug}". Cannot auto-update.`);
    printInfo(`Re-install manually: openpersona skill install ${source}`);
    process.exit(1);
  }

  printInfo(`Updating ${slug} from ${source}...`);

  let downloader = opts.downloader;
  if (!downloader) {
    try {
      downloader = require('../remote/downloader');
    } catch {
      printError('Downloader module not found. Please re-install openpersona.');
      process.exit(1);
    }
  }

  let tmpDir;
  try {
    const result = await downloader.download(source);
    tmpDir = result && result.dir;
    if (!tmpDir) throw new Error('Downloader returned no directory');
  } catch (e) {
    printError(`Failed to download from ${source}: ${e.message}`);
    process.exit(1);
  }

  const skillMdCandidates = [
    path.join(tmpDir, 'SKILL.md'),
    path.join(tmpDir, 'SKILL', 'SKILL.md'),
    path.join(tmpDir, 'skill', 'SKILL.md'),
  ];
  const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));

  if (!skillMdPath) {
    printError(`No SKILL.md found in downloaded package from ${source}`);
    try { await fs.remove(tmpDir); } catch { /* ignore */ }
    process.exit(1);
  }

  // Determine the true pack root (SKILL.md may live in a subdir).
  const packRoot = path.dirname(skillMdPath);
  const fm = parseFrontmatter(fs.readFileSync(skillMdPath, 'utf-8'));
  const versionInfo = resolveVersion(packRoot, fm);

  for (const target of targets) {
    await fs.ensureDir(target);
    await fs.copy(packRoot, target, { overwrite: true });
    printSuccess(`Updated ${target}`);
  }

  // Refresh registry entry (preserves installedAt/lastActiveAt, bumps updatedAt)
  registryAdd(
    slug,
    {
      personaName: entry.personaName || slug,
      role: entry.role || 'assistant',
      packType: entry.packType || 'single',
    },
    targets[0],
    regPath,
    { installTargets: targets, source, resourceType: 'skill' }
  );

  try { await fs.remove(tmpDir); } catch { /* ignore */ }

  printSuccess(`${slug} updated successfully`);
  printInfo(`  Version : ${versionInfo.version || 'unknown'}`);
  printInfo(`  Targets : ${targets.join(', ')}`);
}

module.exports = { updateSkill };
