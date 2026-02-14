/**
 * OpenPersona - Install persona to OpenClaw
 */
const path = require('path');
const fs = require('fs-extra');
const { OP_HOME, OP_SKILLS_DIR, OP_WORKSPACE, printError, printWarning, printSuccess, printInfo } = require('./utils');

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
  config.skills.entries[`persona-${slug}`] = { enabled: true };
  await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));
  printSuccess(`Updated openclaw.json`);

  // SOUL.md injection
  const soulInjectionPath = path.join(destDir, 'soul-injection.md');
  const soulContent = fs.existsSync(soulInjectionPath)
    ? fs.readFileSync(soulInjectionPath, 'utf-8')
    : '';
  if (soulContent) {
    let soulMd = '';
    if (fs.existsSync(SOUL_PATH)) {
      soulMd = fs.readFileSync(SOUL_PATH, 'utf-8');
    }
    const markerStart = `<!-- OpenPersona: ${personaName} -->`;
    const markerEnd = `<!-- End OpenPersona: ${personaName} -->`;
    const re = new RegExp(`${escapeRe(markerStart)}[\\s\\S]*?${escapeRe(markerEnd)}`, 'g');
    soulMd = soulMd.replace(re, '').trim();
    soulMd = soulMd + '\n\n' + soulContent;
    await fs.ensureDir(path.dirname(SOUL_PATH));
    await fs.writeFile(SOUL_PATH, soulMd);
    printSuccess('Injected into SOUL.md');
  }

  // IDENTITY.md
  const identityBlockPath = path.join(destDir, 'identity-block.md');
  const identityContent = fs.existsSync(identityBlockPath)
    ? fs.readFileSync(identityBlockPath, 'utf-8')
    : '';
  if (identityContent) {
    let identityMd = '';
    const markerStart = `<!-- OpenPersona Identity: ${personaName} -->`;
    const markerEnd = `<!-- End OpenPersona Identity: ${personaName} -->`;
    const re = new RegExp(`${escapeRe(markerStart)}[\\s\\S]*?${escapeRe(markerEnd)}`, 'g');

    if (fs.existsSync(IDENTITY_PATH)) {
      identityMd = fs.readFileSync(IDENTITY_PATH, 'utf-8');
      identityMd = identityMd.replace(re, '').trim();
    } else {
      identityMd = '# IDENTITY.md - Who Am I?\n\n';
      await fs.ensureDir(path.dirname(IDENTITY_PATH));
    }
    identityMd = identityMd + '\n\n' + identityContent;
    await fs.writeFile(IDENTITY_PATH, identityMd);
    printSuccess('Updated IDENTITY.md');
  }

  // Install external skills (skills.clawhub, skills.skillssh)
  const { execSync } = require('child_process');
  const clawhub = persona.skills?.clawhub || [];
  const skillssh = persona.skills?.skillssh || [];
  for (const s of clawhub) {
    try {
      execSync(`npx clawhub@latest install ${s}`, { stdio: 'inherit' });
      printSuccess(`Installed ClawHub skill: ${s}`);
    } catch (e) {
      printWarning(`Failed to install ClawHub skill ${s}: ${e.message}`);
    }
  }
  for (const s of skillssh) {
    try {
      execSync(`npx skills add ${s}`, { stdio: 'inherit' });
      printSuccess(`Installed skills.sh: ${s}`);
    } catch (e) {
      printWarning(`Failed to install skills.sh ${s}: ${e.message}`);
    }
  }

  // Post-install guidance
  const faculties = persona.faculties || [];
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

  printInfo('');
  printSuccess(`${personaName} is ready! Run "openclaw restart" to apply changes.`);
  printInfo('');
  printInfo('Try saying to your agent:');
  if (faculties.includes('selfie')) {
    printInfo('  "Send me a selfie"');
    printInfo('  "Send a pic wearing a cowboy hat"');
  }
  printInfo('  "What are you up to?"');
  printInfo('  "Tell me about yourself"');

  return destDir;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { install };
