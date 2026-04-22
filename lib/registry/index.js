'use strict';

/**
 * OpenPersona - Local Persona Registry
 *
 * Manages ~/.openpersona/persona-registry.json — the local index of all
 * installed personas (install path, active flag, timestamps).
 *
 * Distinct from lib/remote/ which handles external registries (ClawHub, ACN).
 */

const path = require('path');
const fs   = require('fs-extra');

const { version: FRAMEWORK_VERSION } = require('../../package.json');

// Mirror the same resolution logic as utils.js — no cross-require to avoid circular deps.
const _OP_PERSONA_HOME = process.env.OPENPERSONA_HOME || path.join(process.env.HOME || '~', '.openpersona');
const REGISTRY_PATH = path.join(_OP_PERSONA_HOME, 'persona-registry.json');

function loadRegistry(regPath) {
  const p = regPath || REGISTRY_PATH;
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { /* corrupted — start fresh */ }
  }
  return { version: 1, personas: {} };
}

function saveRegistry(registry, regPath) {
  const p = regPath || REGISTRY_PATH;
  fs.ensureDirSync(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(registry, null, 2));
}

/**
 * Add or update an entry in the local registry.
 *
 * @param {string} slug - Canonical slug (bare, no prefix)
 * @param {object} persona - Persona / skill metadata
 * @param {string} installPath - Absolute path where files were written (used
 *   by `uninstall` and `update` to locate the installed directory)
 * @param {string} [regPath] - Override registry file path (for tests)
 * @param {object} [opts]
 * @param {string} [opts.installTarget] - Explicit single install target path
 *   (overrides installPath for the installTarget field; useful when installPath
 *   is a temporary directory and the real target is elsewhere)
 * @param {string[]} [opts.installTargets] - All install target paths (for multi-
 *   target installs such as `skill install --all`). Takes precedence over
 *   installTarget. installTarget is set to installTargets[0] for compatibility.
 * @param {string} [opts.source] - GitHub owner/repo or local path used for install
 * @param {string} [opts.resourceType] - 'persona' (default) or 'skill'
 */
function registryAdd(slug, persona, installPath, regPath, opts = {}) {
  const p = regPath || REGISTRY_PATH;
  const reg = loadRegistry(p);
  const existing = reg.personas[slug] || {};

  let installTargets;
  if (Array.isArray(opts.installTargets) && opts.installTargets.length > 0) {
    installTargets = [...new Set(opts.installTargets)];
  } else if (opts.installTarget) {
    installTargets = [opts.installTarget];
  } else {
    installTargets = [installPath];
  }
  const installTarget = installTargets[0];

  reg.personas[slug] = {
    personaName: persona.personaName || slug,
    slug,
    role: persona.role || 'companion',
    packType: persona.packType || 'single',
    resourceType: opts.resourceType || existing.resourceType || 'persona',
    path: installPath,
    installTarget,
    installTargets,
    source: opts.source || existing.source || null,
    frameworkVersion: persona.meta?.frameworkVersion || FRAMEWORK_VERSION,
    installedAt: existing.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActiveAt: existing.lastActiveAt || null,
    active: false,
  };
  saveRegistry(reg, p);
}

function registryRemove(slug, regPath) {
  const p = regPath || REGISTRY_PATH;
  const reg = loadRegistry(p);
  delete reg.personas[slug];
  saveRegistry(reg, p);
}

function registrySetActive(slug, regPath) {
  const p = regPath || REGISTRY_PATH;
  const reg = loadRegistry(p);
  for (const [key, entry] of Object.entries(reg.personas)) {
    entry.active = (key === slug);
    if (key === slug) entry.lastActiveAt = new Date().toISOString();
  }
  saveRegistry(reg, p);
}

module.exports = {
  REGISTRY_PATH,
  loadRegistry,
  saveRegistry,
  registryAdd,
  registryRemove,
  registrySetActive,
};
