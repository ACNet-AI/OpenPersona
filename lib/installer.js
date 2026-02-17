/**
 * OpenPersona - Install persona to OpenClaw
 */
const path = require('path');
const fs = require('fs-extra');
const { OP_HOME, OP_SKILLS_DIR, OP_WORKSPACE, printError, printWarning, printSuccess, printInfo, syncHeartbeat, installAllExternal } = require('./utils');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OP_HOME, 'openclaw.json');

async function install(skillDir, options = {}) {
  const { skipCopy = false } = options;
  const personaPath = path.join(skillDir, 'persona.json');
  if (!fs.existsSync(personaPath)) {
    throw new Error('Not a valid OpenPersona pack: persona.json not found');
  }
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  const slug = persona.slug;
  const personaName = persona.personaName;

  // Check OpenClaw
  if (!fs.existsSync(OP_HOME)) {
    printError(`OpenClaw not found at ${OP_HOME}. Run 'openclaw init' first.`);
    process.exit(1);
  }

  await fs.ensureDir(OP_SKILLS_DIR);

  const destDir = skipCopy ? skillDir : path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (!skipCopy) {
    await fs.copy(skillDir, destDir, { overwrite: true });
    printSuccess(`Copied persona-${slug} to ${destDir}`);
  } else {
    if (!fs.existsSync(path.join(skillDir, 'soul-injection.md'))) {
      const { generate } = require('./generator');
      const tmpDir = path.join(require('os').tmpdir(), 'openpersona-tmp-' + Date.now());
      await fs.ensureDir(tmpDir);
      const { skillDir: genDir } = await generate(persona, tmpDir);
      await fs.copy(path.join(genDir, 'soul-injection.md'), path.join(skillDir, 'soul-injection.md'));
      await fs.copy(path.join(genDir, 'identity-block.md'), path.join(skillDir, 'identity-block.md'));
      await fs.remove(tmpDir);
    }
    printSuccess(`Using ClawHub-installed persona-${slug}`);
  }

  // Update openclaw.json
  let config = {};
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

  // Apply default env vars from manifest (user-provided values take precedence)
  const defaultEnv = persona.defaults?.env || {};
  if (Object.keys(defaultEnv).length > 0) {
    entry.env = entry.env || {};
    for (const [key, value] of Object.entries(defaultEnv)) {
      if (!entry.env[key]) {
        entry.env[key] = value;
      }
    }
  }

  config.skills.entries[`persona-${slug}`] = entry;

  // Mark this persona as active, deactivate others
  for (const [key, val] of Object.entries(config.skills.entries)) {
    if (key.startsWith('persona-') && typeof val === 'object') {
      val.active = (key === `persona-${slug}`);
    }
  }

  // Sync heartbeat from persona's manifest into global config
  const manifestPath = path.join(destDir, 'manifest.json');
  const { synced, heartbeat } = syncHeartbeat(config, manifestPath);
  if (synced) {
    printSuccess(`Heartbeat synced: strategy=${heartbeat.strategy}, maxDaily=${heartbeat.maxDaily}`);
  } else {
    printInfo('Heartbeat disabled (persona has no heartbeat config)');
  }

  await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));

  // SOUL.md injection (using generic markers for clean switching)
  const soulInjectionPath = path.join(destDir, 'soul-injection.md');
  const soulContent = fs.existsSync(soulInjectionPath)
    ? fs.readFileSync(soulInjectionPath, 'utf-8')
    : '';
  if (soulContent) {
    let soulMd = '';
    if (fs.existsSync(SOUL_PATH)) {
      soulMd = fs.readFileSync(SOUL_PATH, 'utf-8');
    }
    // Remove any existing OpenPersona soul block (generic or legacy per-persona markers)
    soulMd = soulMd.replace(/<!-- OPENPERSONA_SOUL_START -->[\s\S]*?<!-- OPENPERSONA_SOUL_END -->/g, '').trim();
    soulMd = soulMd + '\n\n' + soulContent;
    await fs.ensureDir(path.dirname(SOUL_PATH));
    await fs.writeFile(SOUL_PATH, soulMd);
    printSuccess('Injected into SOUL.md');
  }

  // IDENTITY.md (using generic markers)
  const identityBlockPath = path.join(destDir, 'identity-block.md');
  const identityContent = fs.existsSync(identityBlockPath)
    ? fs.readFileSync(identityBlockPath, 'utf-8')
    : '';
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

  // Install external dependencies across all four layers (read from manifest, not persona.json)
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      installAllExternal(manifest.layers || {});
    } catch {
      // Malformed manifest — skip external installs
    }
  }

  // Post-install guidance
  const rawFaculties = persona.faculties || [];
  const faculties = rawFaculties.map((f) => f.name);
  if (faculties.includes('selfie')) {
    const envEntries = config.skills.entries[`persona-${slug}`] || {};
    const hasKey = envEntries.env?.FAL_KEY;
    if (!hasKey) {
      printInfo('');
      printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      printInfo(`  ${personaName} has selfie capabilities!`);
      printInfo('  To enable selfie generation, configure your fal.ai API key:');
      printInfo('');
      printInfo('  1. Get a free API key: https://fal.ai/dashboard/keys');
      printInfo('  2. Add to your OpenClaw config:');
      printInfo('');
      printInfo(`     Edit ~/.openclaw/openclaw.json and add under`);
      printInfo(`     skills.entries.persona-${slug}:`);
      printInfo('');
      printInfo('     "env": { "FAL_KEY": "your_key_here" }');
      printInfo('');
      printInfo('  Or set the environment variable: export FAL_KEY=your_key');
      printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  if (faculties.includes('voice')) {
    const envEntries = config.skills.entries[`persona-${slug}`] || {};
    const hasKey = envEntries.env?.TTS_API_KEY || envEntries.env?.ELEVENLABS_API_KEY;
    if (!hasKey) {
      printInfo('');
      printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      printInfo(`  ${personaName} has voice capabilities!`);
      printInfo('  To enable voice synthesis, configure your TTS API key:');
      printInfo('');
      if (defaultEnv.TTS_PROVIDER === 'elevenlabs') {
        printInfo('  Provider: ElevenLabs (pre-configured)');
        if (defaultEnv.TTS_VOICE_ID) {
          printInfo(`  Voice ID: ${defaultEnv.TTS_VOICE_ID} (built-in)`);
        }
        printInfo('');
        printInfo('  1. Get an API key: https://elevenlabs.io');
        printInfo('  2. Add to OpenClaw config or environment:');
        printInfo('');
        printInfo(`     Edit ~/.openclaw/openclaw.json → skills.entries.persona-${slug}.env:`);
        printInfo('     "ELEVENLABS_API_KEY": "your_key_here"');
      } else {
        printInfo('  1. Get an API key from your TTS provider');
        printInfo('  2. Add to your OpenClaw config:');
        printInfo('');
        printInfo(`     Edit ~/.openclaw/openclaw.json → skills.entries.persona-${slug}.env:`);
        printInfo('     "TTS_API_KEY": "your_key_here"');
      }
      printInfo('');
      printInfo('  Or: npm install @elevenlabs/elevenlabs-js (for SDK playback)');
      printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  printInfo('');
  printSuccess(`${personaName} is ready! Run "openclaw restart" to apply changes.`);
  printInfo('');
  printInfo('Try saying to your agent:');
  if (faculties.includes('selfie')) {
    printInfo('  "Send me a selfie"');
    printInfo('  "Send a pic wearing a cowboy hat"');
  }
  if (faculties.includes('voice')) {
    printInfo('  "Say something to me"');
    printInfo('  "Read me a poem in your voice"');
  }
  if (faculties.includes('music')) {
    printInfo('  "Compose a song for me"');
    printInfo('  "Write a lullaby"');
  }
  printInfo('  "What are you up to?"');
  printInfo('  "Tell me about yourself"');

  return destDir;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { install };
