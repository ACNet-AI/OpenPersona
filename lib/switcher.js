/**
 * OpenPersona - Persona Switcher
 *
 * Three atomic operations:
 * 1. Read target persona resources (identity-block.md, soul-injection.md)
 * 2. Sync workspace (IDENTITY.md, SOUL.md) — replace only the OpenPersona block
 * 3. Update active marker in openclaw.json
 */
const path = require('path');
const fs = require('fs-extra');
const { OP_HOME, OP_SKILLS_DIR, OP_WORKSPACE, printError, printSuccess, printInfo, syncHeartbeat } = require('./utils');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OP_HOME, 'openclaw.json');

/**
 * Replace content between markers in a document.
 * If markers don't exist yet, append the content at the end.
 */
function replaceMarkerBlock(doc, startMarker, endMarker, newContent) {
  const re = new RegExp(`${escapeRe(startMarker)}[\\s\\S]*?${escapeRe(endMarker)}`, 'g');
  if (re.test(doc)) {
    return doc.replace(re, newContent).trim();
  }
  // No existing block — append
  return doc.trim() + '\n\n' + newContent;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List all installed personas with active status.
 */
async function listPersonas() {
  if (!fs.existsSync(OPENCLAW_JSON)) return [];

  const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
  const entries = config.skills?.entries || {};
  const personas = [];

  for (const [key, val] of Object.entries(entries)) {
    if (!key.startsWith('persona-')) continue;
    const slug = key.replace('persona-', '');
    const skillDir = path.join(OP_SKILLS_DIR, key);
    const personaPath = path.join(skillDir, 'persona.json');

    let personaName = slug;
    if (fs.existsSync(personaPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
        personaName = p.personaName || slug;
      } catch {}
    }

    personas.push({
      slug,
      personaName,
      active: val.active === true,
      enabled: val.enabled !== false,
    });
  }

  return personas;
}

/**
 * Switch the active persona.
 */
async function switchPersona(slug) {
  const skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);

  // --- Step 1: Read target resources ---
  if (!fs.existsSync(skillDir)) {
    printError(`Persona not found: persona-${slug}`);
    printInfo(`Installed personas are in ${OP_SKILLS_DIR}`);
    process.exit(1);
  }

  const soulPath = path.join(skillDir, 'soul-injection.md');
  const identityPath = path.join(skillDir, 'identity-block.md');
  const personaPath = path.join(skillDir, 'persona.json');

  if (!fs.existsSync(personaPath)) {
    printError(`Not a valid persona pack: ${skillDir}/persona.json not found`);
    process.exit(1);
  }

  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  const personaName = persona.personaName || slug;

  const soulContent = fs.existsSync(soulPath)
    ? fs.readFileSync(soulPath, 'utf-8')
    : '';
  const identityContent = fs.existsSync(identityPath)
    ? fs.readFileSync(identityPath, 'utf-8')
    : '';

  // --- Step 2: Sync workspace ---
  // SOUL.md — replace only the OpenPersona block, preserve user content
  if (soulContent) {
    let soulMd = '';
    if (fs.existsSync(SOUL_PATH)) {
      soulMd = fs.readFileSync(SOUL_PATH, 'utf-8');
    }
    soulMd = replaceMarkerBlock(
      soulMd,
      '<!-- OPENPERSONA_SOUL_START -->',
      '<!-- OPENPERSONA_SOUL_END -->',
      soulContent
    );
    await fs.ensureDir(path.dirname(SOUL_PATH));
    await fs.writeFile(SOUL_PATH, soulMd);
    printSuccess('SOUL.md updated');
  }

  // IDENTITY.md — replace only the OpenPersona block
  if (identityContent) {
    let identityMd = '';
    if (fs.existsSync(IDENTITY_PATH)) {
      identityMd = fs.readFileSync(IDENTITY_PATH, 'utf-8');
    } else {
      identityMd = '# IDENTITY.md - Who Am I?\n\n';
      await fs.ensureDir(path.dirname(IDENTITY_PATH));
    }
    identityMd = replaceMarkerBlock(
      identityMd,
      '<!-- OPENPERSONA_IDENTITY_START -->',
      '<!-- OPENPERSONA_IDENTITY_END -->',
      identityContent
    );
    await fs.writeFile(IDENTITY_PATH, identityMd);
    printSuccess('IDENTITY.md updated');
  }

  // --- Step 3: Update active marker + sync heartbeat ---
  if (fs.existsSync(OPENCLAW_JSON)) {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    const entries = config.skills?.entries || {};
    for (const [key, val] of Object.entries(entries)) {
      if (key.startsWith('persona-') && typeof val === 'object') {
        val.active = (key === `persona-${slug}`);
      }
    }

    // Sync heartbeat from persona's manifest into global config
    const manifestPath = path.join(skillDir, 'manifest.json');
    const { synced, heartbeat } = syncHeartbeat(config, manifestPath);
    if (synced) {
      printSuccess(`Heartbeat synced: strategy=${heartbeat.strategy}, maxDaily=${heartbeat.maxDaily}`);
    } else {
      printInfo('Heartbeat disabled (persona has no heartbeat config)');
    }

    await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));
    printSuccess('openclaw.json updated');
  }

  // --- Step 4: Optional greeting via OpenClaw messaging ---
  try {
    const { execSync } = require('child_process');
    // Check if openclaw CLI is available
    execSync('which openclaw', { stdio: 'ignore' });
    const bio = persona.bio || '';
    const emoji = persona.emoji || '👋';
    const greeting = `${emoji} Hey, I'm ${personaName}${bio ? ' — ' + bio : ''}. I just took over the workspace.`;
    // Try to send via default channel; fail silently if no channel configured
    execSync(`openclaw message send --action send --message ${JSON.stringify(greeting)}`, {
      stdio: 'ignore',
      timeout: 5000,
    });
    printSuccess(`${personaName} said hello via messaging`);
  } catch {
    // openclaw not available or no messaging channel — skip silently
  }

  printInfo('');
  printSuccess(`Switched to ${personaName} (${slug})`);
  printInfo('Run "openclaw restart" to apply changes.');
}

module.exports = { switchPersona, listPersonas };
