'use strict';

/**
 * OpenPersona – Skill uninstaller
 *
 * Looks up installTarget from the registry, removes the directory, and
 * deregisters the skill. Falls back to well-known legacy paths when the
 * registry entry lacks an installTarget field (backward compatibility).
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { printError, printSuccess, printInfo, OP_PERSONA_HOME } = require('../utils');
const { loadRegistry, registryRemove } = require('../registry');

const LEGACY_SKILL_DIR = path.join(OP_PERSONA_HOME, 'skills');
const AGENTS_MD_PROJECT = path.resolve(process.cwd(), '.agents', 'skills');
const AGENTS_MD_GLOBAL = path.join(os.homedir(), '.agents', 'skills');

/**
 * Uninstall a skill by slug.
 *
 * Resolution order:
 *   1. registry installTarget field (preferred, set by v0.21.0+)
 *   2. registry path field (set by earlier installs)
 *   3. Legacy ~/.openpersona/skills/persona-<slug>/
 *   4. ~/.agents/skills/<slug>/  (global AGENTS.md)
 *   5. <cwd>/.agents/skills/<slug>/  (project-local AGENTS.md)
 *
 * @param {string} slug
 * @param {object} [opts]
 * @param {string} [opts.regPath] - Override registry file path (for tests)
 */
async function uninstallSkill(slug, opts = {}) {
  const { regPath } = opts;
  const reg = loadRegistry(regPath);
  const entry = reg.personas?.[slug];

  if (entry) {
    // Preferred: use installTarget (v0.21.0+ field)
    const target = entry.installTarget || entry.path;
    if (target && fs.existsSync(target)) {
      await fs.remove(target);
      printSuccess(`Removed ${target}`);
      registryRemove(slug, regPath);
      printSuccess(`Deregistered skill: ${slug}`);
      return;
    }
  }

  // Legacy fallback scans
  const candidates = [
    path.join(LEGACY_SKILL_DIR, `persona-${slug}`),
    path.join(LEGACY_SKILL_DIR, slug),
    path.join(AGENTS_MD_GLOBAL, slug),
    path.join(AGENTS_MD_PROJECT, slug),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      await fs.remove(candidate);
      printSuccess(`Removed ${candidate}`);
      registryRemove(slug, regPath);
      printSuccess(`Deregistered skill: ${slug}`);
      return;
    }
  }

  printError(`Skill not found: "${slug}". Install it first with: openpersona skill install <source>`);
  printInfo('Run `openpersona skill list` to see installed skills.');
  process.exit(1);
}

module.exports = { uninstallSkill };
