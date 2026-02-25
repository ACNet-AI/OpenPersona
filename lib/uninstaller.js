/**
 * OpenPersona - Uninstall persona from OpenClaw
 */
const path = require('path');
const fs = require('fs-extra');
const { OPENCLAW_HOME, OP_SKILLS_DIR, OP_WORKSPACE, loadRegistry, registryRemove, printError, printWarning, printSuccess, printInfo } = require('./utils');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OPENCLAW_HOME, 'openclaw.json');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function uninstall(slug) {
  // 1. New neutral path
  const skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (fs.existsSync(skillDir)) return uninstallFromDir(skillDir, slug);

  // 2. Alt without prefix
  const alt = path.join(OP_SKILLS_DIR, slug);
  if (fs.existsSync(alt)) return uninstallFromDir(alt, slug);

  // 3. Registry-stored path (handles old ~/.openclaw/skills installs)
  const reg = loadRegistry();
  const entry = reg.personas?.[slug];
  if (entry?.path && fs.existsSync(entry.path)) return uninstallFromDir(entry.path, slug);

  // 4. Legacy OpenClaw path fallback
  const legacyDir = path.join(OPENCLAW_HOME, 'skills', `persona-${slug}`);
  if (fs.existsSync(legacyDir)) return uninstallFromDir(legacyDir, slug);

  printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
  process.exit(1);
}

async function uninstallFromDir(skillDir, slug) {
  let personaName = slug;
  let persona = {};
  const personaPath = path.join(skillDir, 'persona.json');
  if (fs.existsSync(personaPath)) {
    persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    personaName = persona.personaName || personaName;
  }

  // Remove from SOUL.md
  if (fs.existsSync(SOUL_PATH)) {
    let soulMd = fs.readFileSync(SOUL_PATH, 'utf-8');
    const markerStart = `<!-- OpenPersona: ${personaName} -->`;
    const markerEnd = `<!-- End OpenPersona: ${personaName} -->`;
    const re = new RegExp(`\\s*${escapeRe(markerStart)}[\\s\\S]*?${escapeRe(markerEnd)}\\s*`, 'g');
    soulMd = soulMd.replace(re, '\n').replace(/\n{3,}/g, '\n\n').trim();
    await fs.writeFile(SOUL_PATH, soulMd);
    printSuccess('Removed from SOUL.md');
  }

  // Remove from IDENTITY.md
  if (fs.existsSync(IDENTITY_PATH)) {
    let identityMd = fs.readFileSync(IDENTITY_PATH, 'utf-8');
    const markerStart = `<!-- OpenPersona Identity: ${personaName} -->`;
    const markerEnd = `<!-- End OpenPersona Identity: ${personaName} -->`;
    const re = new RegExp(`\\s*${escapeRe(markerStart)}[\\s\\S]*?${escapeRe(markerEnd)}\\s*`, 'g');
    identityMd = identityMd.replace(re, '\n').replace(/\n{3,}/g, '\n\n').trim();
    await fs.writeFile(IDENTITY_PATH, identityMd);
    printSuccess('Removed from IDENTITY.md');
  }

  // Remove from openclaw.json
  const skillKey = path.basename(skillDir);
  if (fs.existsSync(OPENCLAW_JSON)) {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    if (config.skills?.entries?.[skillKey]) {
      delete config.skills.entries[skillKey];
      await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));
      printSuccess('Removed from openclaw.json');
    }
  }

  // Delete skill folder
  await fs.remove(skillDir);
  printSuccess(`Removed ${skillDir}`);

  // Remove from persona registry
  registryRemove(slug);

  if ((persona.skills?.clawhub?.length || persona.skills?.skillssh?.length) > 0) {
    printWarning('External skills may be shared. Uninstall manually if needed.');
  }

  if (fs.existsSync(OPENCLAW_HOME)) {
    printInfo('Run "openclaw restart" to apply changes.');
  }
}

module.exports = { uninstall };
