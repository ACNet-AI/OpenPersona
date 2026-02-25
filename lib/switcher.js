/**
 * OpenPersona - Persona Switcher
 *
 * Three atomic operations:
 * 1. Read target persona resources (soul/injection.md, soul/identity.md)
 * 2. Sync workspace (IDENTITY.md, SOUL.md) — replace only the OpenPersona block
 * 3. Update active marker in openclaw.json
 */
const path = require('path');
const fs = require('fs-extra');
const Mustache = require('mustache');
const { OPENCLAW_HOME, OP_SKILLS_DIR, OP_WORKSPACE, resolveSoulFile, registrySetActive, loadRegistry, printError, printSuccess, printInfo, syncHeartbeat, installAllExternal } = require('./utils');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OPENCLAW_HOME, 'openclaw.json');

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
 * Primary source: persona-registry.json; fallback: openclaw.json scan.
 */
async function listPersonas() {
  const reg = loadRegistry();
  if (Object.keys(reg.personas).length > 0) {
    return Object.values(reg.personas).map((e) => ({
      slug: e.slug,
      personaName: e.personaName,
      active: e.active === true,
      enabled: true,
      role: e.role || 'companion',
      installedAt: e.installedAt,
      lastActiveAt: e.lastActiveAt,
    }));
  }

  // Fallback: scan openclaw.json (pre-registry installs)
  if (!fs.existsSync(OPENCLAW_JSON)) return [];

  const config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
  const entries = config.skills?.entries || {};
  const personas = [];

  for (const [key, val] of Object.entries(entries)) {
    if (!key.startsWith('persona-')) continue;
    const slug = key.replace('persona-', '');
    const skillDir = path.join(OP_SKILLS_DIR, key);
    const personaPath = resolveSoulFile(skillDir, 'persona.json');

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
 * Generate a handoff context object from the old persona's state.
 * Returns null if no meaningful state exists.
 */
function generateHandoff(oldSlug, oldSkillDir) {
  const personaPath = resolveSoulFile(oldSkillDir, 'persona.json');
  if (!fs.existsSync(personaPath)) return null;

  let persona;
  try {
    persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  } catch { return null; }

  const handoff = {
    previousPersona: {
      slug: oldSlug,
      name: persona.personaName || oldSlug,
      role: persona.role || 'companion',
    },
    timestamp: new Date().toISOString(),
  };

  const statePath = resolveSoulFile(oldSkillDir, 'state.json');
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

      if (state.relationship) {
        handoff.relationshipStage = state.relationship.stage || 'stranger';
      }

      if (state.mood) {
        handoff.moodSnapshot = {
          current: state.mood.current || 'neutral',
          intensity: state.mood.intensity ?? 0.5,
        };
      }

      if (state.interests && Object.keys(state.interests).length > 0) {
        handoff.sharedInterests = Object.keys(state.interests);
      }
    } catch { /* malformed state — skip */ }
  }

  return handoff;
}

/**
 * Render handoff.json into a markdown string using handoff.template.md.
 */
function renderHandoff(handoff) {
  const templatePath = path.join(__dirname, '..', 'templates', 'handoff.template.md');
  if (!fs.existsSync(templatePath)) return null;

  const template = fs.readFileSync(templatePath, 'utf-8');
  const view = {
    previousName: handoff.previousPersona.name,
    previousSlug: handoff.previousPersona.slug,
    previousRole: handoff.previousPersona.role,
    conversationSummary: handoff.conversationSummary || '',
    hasPendingItems: handoff.pendingItems && handoff.pendingItems.length > 0,
    pendingItems: handoff.pendingItems || [],
    hasMoodSnapshot: !!handoff.moodSnapshot,
    moodCurrent: handoff.moodSnapshot?.current || '',
    moodUserSentiment: handoff.moodSnapshot?.userSentiment || '',
    relationshipStage: handoff.relationshipStage || '',
    hasSharedInterests: handoff.sharedInterests && handoff.sharedInterests.length > 0,
    sharedInterestsList: (handoff.sharedInterests || []).join(', '),
  };

  return Mustache.render(template, view);
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

  // --- Step 1.5: Generate handoff from currently active persona ---
  let handoffMd = null;
  const reg = loadRegistry();
  const activeEntry = Object.values(reg.personas).find((e) => e.active);
  if (activeEntry && activeEntry.slug !== slug) {
    const oldSkillDir = path.join(OP_SKILLS_DIR, `persona-${activeEntry.slug}`);
    const handoff = generateHandoff(activeEntry.slug, oldSkillDir);
    if (handoff) {
      const handoffPath = path.join(skillDir, 'soul', 'handoff.json');
      await fs.ensureDir(path.dirname(handoffPath));
      await fs.writeFile(handoffPath, JSON.stringify(handoff, null, 2));
      handoffMd = renderHandoff(handoff);
      printSuccess(`Context handoff generated from ${activeEntry.slug}`);
    }
  }

  const soulPath = resolveSoulFile(skillDir, 'injection.md');
  const identityPath = resolveSoulFile(skillDir, 'identity.md');
  const personaPath = resolveSoulFile(skillDir, 'persona.json');

  if (!fs.existsSync(personaPath)) {
    printError(`Not a valid persona pack: persona.json not found in ${skillDir}`);
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

  // --- Step 2.5: Inject handoff context into SOUL.md ---
  if (handoffMd && fs.existsSync(SOUL_PATH)) {
    let soulMd = fs.readFileSync(SOUL_PATH, 'utf-8');
    const handoffBlock = `<!-- OPENPERSONA_HANDOFF_START -->\n${handoffMd}\n<!-- OPENPERSONA_HANDOFF_END -->`;
    soulMd = replaceMarkerBlock(soulMd, '<!-- OPENPERSONA_HANDOFF_START -->', '<!-- OPENPERSONA_HANDOFF_END -->', handoffBlock);
    await fs.writeFile(SOUL_PATH, soulMd);
    printSuccess('Context handoff injected into SOUL.md');
  }

  // --- Step 2.6: Install external dependencies if needed ---
  const manifestPath = path.join(skillDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      installAllExternal(manifest.layers || {});
    } catch {
      // Malformed manifest — skip external installs
    }
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
    const { synced, heartbeat } = syncHeartbeat(config, manifestPath);
    if (synced) {
      printSuccess(`Heartbeat synced: strategy=${heartbeat.strategy}, maxDaily=${heartbeat.maxDaily}`);
    } else {
      printInfo('Heartbeat disabled (persona has no heartbeat config)');
    }

    await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));
    printSuccess('openclaw.json updated');
  }

  // Update persona registry
  registrySetActive(slug);

  // Ensure credential directories exist for Self-Awareness > Body credential management
  const sharedCredDir = path.join(OP_HOME, 'credentials', 'shared');
  const privateCredDir = path.join(OP_HOME, 'credentials', `persona-${slug}`);
  await fs.ensureDir(sharedCredDir);
  await fs.ensureDir(privateCredDir);

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

module.exports = { switchPersona, listPersonas, generateHandoff, renderHandoff };
