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

function registryAdd(slug, persona, installPath, regPath) {
  const p = regPath || REGISTRY_PATH;
  const reg = loadRegistry(p);
  const existing = reg.personas[slug] || {};
  reg.personas[slug] = {
    personaName: persona.personaName || slug,
    slug,
    role: persona.role || 'companion',
    path: installPath,
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
