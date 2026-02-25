/**
 * OpenPersona - Utility functions and error handling
 */
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

// Neutral OpenPersona home — agent-agnostic, no runtime dependency
const OP_PERSONA_HOME = process.env.OPENPERSONA_HOME || path.join(process.env.HOME || '~', '.openpersona');
const OP_SKILLS_DIR = path.join(OP_PERSONA_HOME, 'personas');

// OpenClaw integration — optional; only used when ~/.openclaw exists
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '~', '.openclaw');
const OP_WORKSPACE = path.join(OPENCLAW_HOME, 'workspace');

// OP_HOME kept as alias for backward compatibility
const OP_HOME = OP_PERSONA_HOME;

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

/**
 * Collect soft-ref hint from a layer entry (has `install` field).
 * Does NOT execute any install — decision is left to the agent or user at runtime.
 *
 * @param {object} entry - Layer entry with optional `install` field (e.g. "clawhub:pkg")
 * @param {string} layerName - Layer label for logging (e.g. "faculty", "skill", "body")
 * @returns {{ name: string, install: string, layerName: string }|null}
 */
function installExternal(entry, layerName) {
  if (!entry || !entry.install) return null;
  const [source, pkg] = entry.install.split(':', 2);
  if (!pkg || !SAFE_NAME_RE.test(pkg)) return null;
  return { name: entry.name || pkg, install: entry.install, source, pkg, layerName };
}

/**
 * Scan all four layers for soft-ref `install` fields and print hints.
 * Never auto-installs — autonomous agents handle this at runtime when capabilities are needed.
 *
 * @param {object} layers - The layers object from manifest.json (soul, body, faculties, skills)
 */
function installAllExternal(layers) {
  const hints = [];

  // Soul layer
  const soul = layers.soul || null;
  if (soul && typeof soul === 'object') {
    const h = installExternal(soul, 'soul');
    if (h) hints.push(h);
  }

  // Body layer
  const body = layers.body || null;
  if (body && typeof body === 'object') {
    const h = installExternal(body, 'body');
    if (h) hints.push(h);
  }

  // Faculty layer
  const faculties = Array.isArray(layers.faculties) ? layers.faculties : [];
  for (const f of faculties) {
    const h = installExternal(f, 'faculty');
    if (h) hints.push(h);
  }

  // Skill layer
  const skills = Array.isArray(layers.skills) ? layers.skills : [];
  for (const s of skills) {
    const h = installExternal(s, 'skill');
    if (h) hints.push(h);
  }

  // Print soft-ref hints — no auto-install
  if (hints.length > 0) {
    printInfo('');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo('  Optional capabilities declared by this persona:');
    for (const h of hints) {
      const cmd = h.source === 'clawhub'
        ? `npx openpersona install ${h.pkg}`
        : h.source === 'skillssh'
          ? `npx skills add ${h.pkg}`
          : `# ${h.install}`;
      printInfo(`  [${h.layerName}] ${h.name}`);
      printInfo(`    To enable: ${cmd}`);
    }
    printInfo('  Autonomous agents (e.g. OpenClaw) can install these on demand.');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

// --- Persona Registry ---
const REGISTRY_PATH = path.join(OP_PERSONA_HOME, 'persona-registry.json');

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
    frameworkVersion: persona.meta?.frameworkVersion || '0.9.0',
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

function resolveSoulFile(skillDir, filename) {
  const newPath = path.join(skillDir, 'soul', filename);
  if (fs.existsSync(newPath)) return newPath;
  const legacyMap = { 'persona.json': 'persona.json', 'injection.md': 'soul-injection.md', 'identity.md': 'identity-block.md', 'state.json': 'soul-state.json' };
  const legacyPath = path.join(skillDir, legacyMap[filename] || filename);
  if (fs.existsSync(legacyPath)) return legacyPath;
  return newPath;
}

module.exports = {
  OP_HOME,
  OP_PERSONA_HOME,
  OPENCLAW_HOME,
  OP_SKILLS_DIR,
  OP_WORKSPACE,
  REGISTRY_PATH,
  resolvePath,
  resolveSoulFile,
  loadRegistry,
  saveRegistry,
  registryAdd,
  registryRemove,
  registrySetActive,
  printError,
  printWarning,
  printSuccess,
  printInfo,
  slugify,
  validateName,
  shellEscape,
  syncHeartbeat,
  installExternal,
  installAllExternal,
};
