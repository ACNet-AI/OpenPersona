/**
 * OpenPersona - Install persona (agent-agnostic; optional OpenClaw integration)
 */
const path = require('path');
const fs = require('fs-extra');
const { OP_PERSONA_HOME, OPENCLAW_HOME, OP_SKILLS_DIR, OP_WORKSPACE, resolveSoulFile, registryAdd, registrySetActive, printError, printWarning, printSuccess, printInfo, syncHeartbeat, installAllExternal } = require('./utils');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OPENCLAW_HOME, 'openclaw.json');

async function install(skillDir, options = {}) {
  const { skipCopy = false, source = null } = options;
  const personaPath = resolveSoulFile(skillDir, 'persona.json');
  if (!fs.existsSync(personaPath)) {
    throw new Error('Not a valid OpenPersona pack: persona.json not found');
  }
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  const slug = persona.slug;
  const personaName = persona.personaName;

  // Ensure neutral install directory exists (no OpenClaw required)
  await fs.ensureDir(OP_SKILLS_DIR);
  const openClawPresent = fs.existsSync(OPENCLAW_HOME);

  const destDir = skipCopy ? skillDir : path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (!skipCopy) {
    await fs.copy(skillDir, destDir, { overwrite: true });
    printSuccess(`Copied persona-${slug} to ${destDir}`);
  } else {
    if (!fs.existsSync(resolveSoulFile(skillDir, 'injection.md'))) {
      const { generate } = require('./generator');
      const tmpDir = path.join(require('os').tmpdir(), 'openpersona-tmp-' + Date.now());
      await fs.ensureDir(tmpDir);
      const { skillDir: genDir } = await generate(persona, tmpDir);
      const genSoulDir = path.join(genDir, 'soul');
      const destSoulDir = path.join(skillDir, 'soul');
      await fs.ensureDir(destSoulDir);
      await fs.copy(path.join(genSoulDir, 'injection.md'), path.join(destSoulDir, 'injection.md'));
      await fs.copy(path.join(genSoulDir, 'identity.md'), path.join(destSoulDir, 'identity.md'));
      await fs.remove(tmpDir);
    }
    printSuccess(`Using ClawHub-installed persona-${slug}`);
  }

  const manifestPath = path.join(destDir, 'manifest.json');
  const defaultEnv = persona.defaults?.env || {};
  let config = {};

  // --- Optional OpenClaw integration ---
  if (openClawPresent) {
    if (fs.existsSync(OPENCLAW_JSON)) {
      config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    }
    config.skills = config.skills || {};
    config.skills.load = config.skills.load || {};
    const extraDirs = config.skills.load.extraDirs || [];
    const skillsDirNorm = OP_SKILLS_DIR.replace(/\/$/, '');
    if (!extraDirs.some((d) => d.replace(/\/$/, '') === skillsDirNorm)) {
      extraDirs.push(OP_SKILLS_DIR);
      config.skills.load.extraDirs = extraDirs;
    }
    config.skills.entries = config.skills.entries || {};
    const entry = config.skills.entries[`persona-${slug}`] || { enabled: true };
    entry.enabled = true;
    if (Object.keys(defaultEnv).length > 0) {
      entry.env = entry.env || {};
      for (const [key, value] of Object.entries(defaultEnv)) {
        if (!entry.env[key]) entry.env[key] = value;
      }
    }
    config.skills.entries[`persona-${slug}`] = entry;
    for (const [key, val] of Object.entries(config.skills.entries)) {
      if (key.startsWith('persona-') && typeof val === 'object') {
        val.active = (key === `persona-${slug}`);
      }
    }

    // Sync heartbeat
    const { synced, heartbeat } = syncHeartbeat(config, manifestPath);
    if (synced) {
      printSuccess(`Heartbeat synced: strategy=${heartbeat.strategy}, maxDaily=${heartbeat.maxDaily}`);
    }

    await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));

    // Inject into SOUL.md
    const soulInjectionPath = resolveSoulFile(destDir, 'injection.md');
    const soulContent = fs.existsSync(soulInjectionPath)
      ? fs.readFileSync(soulInjectionPath, 'utf-8') : '';
    if (soulContent) {
      let soulMd = fs.existsSync(SOUL_PATH) ? fs.readFileSync(SOUL_PATH, 'utf-8') : '';
      soulMd = soulMd.replace(/<!-- OPENPERSONA_SOUL_START -->[\s\S]*?<!-- OPENPERSONA_SOUL_END -->/g, '').trim();
      soulMd = soulMd + '\n\n' + soulContent;
      await fs.ensureDir(path.dirname(SOUL_PATH));
      await fs.writeFile(SOUL_PATH, soulMd);
      printSuccess('Injected into SOUL.md');
    }

    // Update IDENTITY.md
    const identityBlockPath = resolveSoulFile(destDir, 'identity.md');
    const identityContent = fs.existsSync(identityBlockPath)
      ? fs.readFileSync(identityBlockPath, 'utf-8') : '';
    if (identityContent) {
      let identityMd = '';
      if (fs.existsSync(IDENTITY_PATH)) {
        identityMd = fs.readFileSync(IDENTITY_PATH, 'utf-8');
        identityMd = identityMd.replace(/<!-- OPENPERSONA_IDENTITY_START -->[\s\S]*?<!-- OPENPERSONA_IDENTITY_END -->/g, '').trim();
      } else {
        identityMd = '# IDENTITY.md - Who Am I?\n\n';
        await fs.ensureDir(path.dirname(IDENTITY_PATH));
      }
      identityMd = identityMd + '\n\n' + identityContent;
      await fs.writeFile(IDENTITY_PATH, identityMd);
      printSuccess('Updated IDENTITY.md');
    }
  }

  // Install external dependencies across all four layers
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      installAllExternal(manifest.layers || {});
    } catch {
      // Malformed manifest — skip external installs
    }
  }

  // Post-install faculty guidance
  const rawFaculties = persona.faculties || [];
  const faculties = rawFaculties.map((f) => f.name);
  const envEntries = config.skills?.entries?.[`persona-${slug}`] || {};

  if (faculties.includes('selfie') && !envEntries.env?.FAL_KEY) {
    printInfo('');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo(`  ${personaName} has selfie capabilities!`);
    printInfo('  Set FAL_KEY env var or add it to your agent config.');
    printInfo('  Get a free key: https://fal.ai/dashboard/keys');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  if (faculties.includes('voice') && !envEntries.env?.TTS_API_KEY && !envEntries.env?.ELEVENLABS_API_KEY) {
    printInfo('');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo(`  ${personaName} has voice capabilities!`);
    if (defaultEnv.TTS_PROVIDER === 'elevenlabs') {
      printInfo('  Provider: ElevenLabs — set ELEVENLABS_API_KEY to enable.');
      printInfo('  Get a key: https://elevenlabs.io');
    } else {
      printInfo('  Set TTS_API_KEY env var to enable voice synthesis.');
    }
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Register persona in local registry
  registryAdd(slug, persona, destDir);
  registrySetActive(slug);

  // Anonymous install telemetry — fire-and-forget, never blocks or throws
  _reportInstall(slug, {
    repo: source && source.includes('/') ? source : null,
    bio: persona.bio || '',
    role: persona.role || '',
  });

  // Ensure credential directories exist
  const sharedCredDir = path.join(OP_PERSONA_HOME, 'credentials', 'shared');
  const privateCredDir = path.join(OP_PERSONA_HOME, 'credentials', `persona-${slug}`);
  await fs.ensureDir(sharedCredDir);
  await fs.ensureDir(privateCredDir);

  printInfo('');
  printSuccess(`${personaName} installed to ${destDir}`);
  if (openClawPresent) {
    printInfo('OpenClaw detected — run "openclaw restart" to apply.');
  } else {
    printInfo(`Point your agent to: ${destDir}/SKILL.md`);
  }
  printInfo('');
  printInfo('Try saying to your agent:');
  if (faculties.includes('selfie')) printInfo('  "Send me a selfie"');
  if (faculties.includes('voice')) printInfo('  "Say something to me"');
  if (faculties.includes('music')) printInfo('  "Compose a song for me"');
  printInfo('  "What are you up to?"');
  printInfo('  "Tell me about yourself"');

  return destDir;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fire-and-forget anonymous install telemetry.
 * Reports to the persona-skills directory so install counts stay up to date.
 * Never throws, never blocks the install flow.
 */
function _reportInstall(slug, { repo, bio, role } = {}) {
  try {
    const https = require('https');
    const endpoint = process.env.OPENPERSONA_TELEMETRY_URL || 'https://openpersona-frontend.vercel.app/api/telemetry';
    if (process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || process.env.CI) return;
    const url = new URL(endpoint);
    const payload = { slug, event: 'install' };
    if (repo) payload.repo = repo;
    if (bio || role) payload.meta = { bio: bio || '', role: role || 'assistant' };
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'openpersona-cli',
      },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
    req.unref(); // don't keep the process alive waiting for a response
  } catch {
    // Silently ignore any error — telemetry must never break the install
  }
}

module.exports = { install };
