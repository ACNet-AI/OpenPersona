'use strict';

/**
 * OpenPersona – Skill uninstaller
 *
 * Removes every directory recorded in the registry entry's installTargets list
 * (falls back to installTarget / path for older entries) and deregisters the
 * skill. Falls back to well-known legacy paths when the registry is silent
 * (backward compatibility).
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { printError, printSuccess, printInfo, OP_PERSONA_HOME } = require('../utils');
const { loadRegistry, registryRemove } = require('../registry');

const LEGACY_SKILL_DIR = path.join(OP_PERSONA_HOME, 'skills');
const AGENTS_MD_GLOBAL = path.join(os.homedir(), '.agents', 'skills');

/** Legacy fallback paths, resolved at call time so cwd changes are honored. */
function legacyCandidates(slug) {
  return [
    path.join(LEGACY_SKILL_DIR, `persona-${slug}`),
    path.join(LEGACY_SKILL_DIR, slug),
    path.join(AGENTS_MD_GLOBAL, slug),
    path.resolve(process.cwd(), '.agents', 'skills', slug),
    path.resolve(process.cwd(), '.claude', 'skills', slug),
    path.resolve(process.cwd(), '.cursor', 'skills', slug),
  ];
}

/**
 * Uninstall a skill by slug.
 *
 * Resolution order:
 *   1. registry installTargets[] (v0.21.1+, removes every recorded target)
 *   2. registry installTarget / path (v0.21.0 and earlier)
 *   3. Legacy well-known locations (see legacyCandidates)
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
    const targets = Array.isArray(entry.installTargets) && entry.installTargets.length > 0
      ? entry.installTargets
      : [entry.installTarget || entry.path].filter(Boolean);

    let removed = 0;
    for (const target of targets) {
      if (fs.existsSync(target)) {
        await fs.remove(target);
        printSuccess(`Removed ${target}`);
        removed++;
      }
    }

    if (removed > 0) {
      registryRemove(slug, regPath);
      printSuccess(`Deregistered skill: ${slug}`);
      return;
    }
    // Registered but nothing on disk → still deregister and fall through to fallback.
  }

  for (const candidate of legacyCandidates(slug)) {
    if (fs.existsSync(candidate)) {
      await fs.remove(candidate);
      printSuccess(`Removed ${candidate}`);
      registryRemove(slug, regPath);
      printSuccess(`Deregistered skill: ${slug}`);
      return;
    }
  }

  if (entry) {
    // Registry had entry but nothing physical remained — just clean the index.
    registryRemove(slug, regPath);
    printInfo(`Skill "${slug}" had no files on disk. Registry entry removed.`);
    return;
  }

  printError(`Skill not found: "${slug}". Install it first with: openpersona skill install <source>`);
  printInfo('Run `openpersona skill list` to see installed skills.');
  process.exit(1);
}

module.exports = { uninstallSkill, legacyCandidates };
