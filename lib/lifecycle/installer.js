/**
 * OpenPersona - Install persona (agent-agnostic; optional OpenClaw integration)
 */
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { OP_PERSONA_HOME, OPENCLAW_HOME, OP_SKILLS_DIR, OP_WORKSPACE, resolveSoulFile, printError, printWarning, printSuccess, printInfo, syncHeartbeat, installAllExternal, OPENPERSONA_TELEMETRY_ENDPOINT } = require('../utils');
const { registryAdd, registrySetActive } = require('../registry');

const SOUL_PATH = path.join(OP_WORKSPACE, 'SOUL.md');
const IDENTITY_PATH = path.join(OP_WORKSPACE, 'IDENTITY.md');
const OPENCLAW_JSON = path.join(OPENCLAW_HOME, 'openclaw.json');

function resolveSkillMdPath(skillDir) {
  const candidates = [
    path.join(skillDir, 'SKILL.md'),
    path.join(skillDir, 'SKILL', 'SKILL.md'),
    path.join(skillDir, 'skill', 'SKILL.md'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Parse SKILL.md YAML frontmatter (between --- delimiters).
 * Returns a plain object with string values. Does not require a full YAML parser.
 */
function parseSkillMdFrontmatter(skillMdContent) {
  const match = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let multilineBuffer = [];
  for (const line of lines) {
    // Multiline value continuation (starts with spaces, after a `key: >` or `key: |`)
    if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      multilineBuffer.push(line.trim());
      continue;
    }
    // Flush multiline buffer
    if (currentKey && multilineBuffer.length > 0) {
      fm[currentKey] = multilineBuffer.join(' ').trim();
      multilineBuffer = [];
      currentKey = null;
    }
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.*)/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val === '>' || val === '|' || val === '') {
      currentKey = key;
      multilineBuffer = [];
    } else {
      fm[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  if (currentKey && multilineBuffer.length > 0) {
    fm[currentKey] = multilineBuffer.join(' ').trim();
  }
  return fm;
}

function resolvePackVersionFromLocal(skillDir, frontmatter = {}) {
  if (frontmatter.version) return { version: frontmatter.version, source: 'skill_frontmatter' };
  if (frontmatter['metadata.version']) return { version: frontmatter['metadata.version'], source: 'skill_metadata' };
  try {
    const pkgPath = path.join(skillDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
        return { version: pkg.version.trim(), source: 'package_json' };
      }
    }
  } catch {
    // Ignore malformed package.json and continue as no version found.
  }
  return { version: null, source: 'none' };
}

/**
 * Install a SKILL.md-only pack (non-OpenPersona format, agent skill pack format).
 * Copies files, registers in local registry, and integrates with OpenClaw if present.
 */
async function installSkillMdPack(skillDir, skillMdPath, options = {}) {
  const { skipCopy = false, source = null, regPath = undefined, force = false } = options;
  const skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');

  // Constitution compliance pre-check
  const { checkSkillCompliance } = require('./constitution-check');
  const compliance = checkSkillCompliance(skillMdContent);
  if (!compliance.clean) {
    // §3 Safety violations are absolute — --force cannot override them.
    if (compliance.violations.length > 0) {
      printWarning('Constitution compliance check — §3 Safety violations found:');
      for (const v of compliance.violations) {
        printWarning(`  [${v.section}] ${v.label}  (line ${v.lineNumber}): "${v.excerpt}"`);
      }
      throw new Error(
        `Installation blocked: SKILL.md declares ${compliance.violations.length} capability(ies) that violate ` +
        'OpenPersona Constitution §3 (Safety).\n' +
        '§3 Safety hard constraints cannot be bypassed — review and reject this skill.'
      );
    }
    // §2/§7 concerns can be bypassed with --force after manual review.
    if (compliance.warnings.length > 0 && !force) {
      printWarning('Constitution compliance check — §2/§7 concerns found:');
      for (const w of compliance.warnings) {
        printWarning(`  [${w.section}] ${w.label}  (line ${w.lineNumber}): "${w.excerpt}"`);
      }
      throw new Error(
        `Installation blocked: SKILL.md raises ${compliance.warnings.length} potential concern(s) ` +
        'under OpenPersona Constitution §2 (Honesty) or §7 (Wellbeing).\n' +
        'Use --force to proceed anyway.'
      );
    }
    if (force && compliance.warnings.length > 0) {
      for (const w of compliance.warnings) {
        printWarning(`  [force] Bypassing ${w.section} flag: ${w.label}`);
      }
    }
  }

  const fm = parseSkillMdFrontmatter(skillMdContent);
  const versionInfo = resolvePackVersionFromLocal(skillDir, fm);

  // Derive slug from `name` frontmatter field or directory name, then slugify
  const rawName = fm.name || path.basename(skillDir);
  const slug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const personaName = fm.name || rawName;
  const bio = fm.description || '';
  const role = fm['metadata.role'] || 'assistant';

  if (versionInfo.source === 'package_json') {
    printWarning(
      'Version fallback: SKILL.md has no version field, using package.json version instead. ' +
      'Add `version:` to SKILL.md frontmatter for skill-native versioning.'
    );
  } else if (versionInfo.source === 'none') {
    printWarning(
      'Version missing: neither SKILL.md version nor package.json version was found.'
    );
  }

  await fs.ensureDir(OP_SKILLS_DIR);
  const openClawPresent = fs.existsSync(OPENCLAW_HOME);

  const destDir = skipCopy ? skillDir : path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (!skipCopy) {
    await fs.copy(skillDir, destDir, { overwrite: true });
    printSuccess(`Copied skill-${slug} to ${destDir}`);
  } else {
    printSuccess(`Using skill-${slug} at ${skillDir}`);
  }

  // Optional OpenClaw integration — add to extraDirs and skills entries
  if (openClawPresent) {
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
    config.skills.entries[`persona-${slug}`] = entry;
    for (const [key, val] of Object.entries(config.skills.entries)) {
      if (key.startsWith('persona-') && typeof val === 'object') {
        val.active = (key === `persona-${slug}`);
      }
    }
    await fs.writeFile(OPENCLAW_JSON, JSON.stringify(config, null, 2));
  }

  // Register in local registry (packType: single, no persona.json available)
  registryAdd(slug, { personaName, role, packType: 'single' }, destDir, regPath);
  registrySetActive(slug, regPath);

  printSuccess(`Installed: ${personaName} (persona-${slug})`);
  printInfo(`  Format: SKILL.md (non-OpenPersona)`);
  printInfo(`  Location: ${destDir}`);
  printInfo(`  Activate: openpersona switch ${slug}`);
}

async function install(skillDir, options = {}) {
  const { skipCopy = false, source = null, regPath = undefined } = options;
  const personaPath = resolveSoulFile(skillDir, 'persona.json');

  // Multi-persona bundle check: bundle.json at root indicates a multi pack
  const bundlePath = require('path').join(skillDir, 'bundle.json');
  if (fs.existsSync(bundlePath) && !fs.existsSync(personaPath)) {
    let bundleName = 'this bundle';
    try {
      const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
      bundleName = bundle.name || bundle.slug || bundleName;
    } catch { /* ignore parse errors */ }
    printInfo('');
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo(`  "${bundleName}" is a multi-persona bundle (packType: multi).`);
    printInfo('  Multi-persona bundle installation is not yet supported.');
    printInfo('  Each persona in the bundle can be installed individually.');
    if (source) printInfo(`  Browse the bundle: https://github.com/${source}`);
    printInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    printInfo('');
    return;
  }

  // SKILL.md-only pack (non-OpenPersona format but agent-installable)
  const skillMdPath = resolveSkillMdPath(skillDir);
  if (!fs.existsSync(personaPath) && skillMdPath) {
    await installSkillMdPack(skillDir, skillMdPath, { skipCopy, source, regPath });
    return;
  }

  if (!fs.existsSync(personaPath)) {
    throw new Error('Not a valid skill pack: neither persona.json nor SKILL.md found');
  }
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));

  // Warn if this single pack declares packType: multi (misconfigured)
  if (persona.packType === 'multi') {
    printWarning('This pack declares packType: "multi" but has no bundle.json. Proceeding as single-persona install.');
  }
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
      const { generate } = require('../generator');
      const tmpDir = path.join(require('os').tmpdir(), 'openpersona-tmp-' + Date.now());
      await fs.ensureDir(tmpDir);
      const { skillDir: genDir } = await generate(persona, tmpDir);
      const genSoulDir = path.join(genDir, 'soul');
      const destSoulDir = path.join(skillDir, 'soul');
      await fs.ensureDir(destSoulDir);
      await fs.copy(path.join(genSoulDir, 'injection.md'), path.join(destSoulDir, 'injection.md'));
      await fs.remove(tmpDir);
    }
    printSuccess(`Using ClawHub-installed persona-${slug}`);
  }

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
    const { synced, heartbeat } = syncHeartbeat(config, destDir);
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

    // Update IDENTITY.md — backward-compatible: only runs when a legacy soul/identity.md exists.
    // New persona packs no longer generate identity.md; this block is a no-op for them.
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

  // Install external dependencies across all four layers (read from persona.json)
  installAllExternal({
    body: persona.body || null,
    faculties: Array.isArray(persona.faculties) ? persona.faculties : [],
    skills: Array.isArray(persona.skills) ? persona.skills : [],
  });

  // Post-install capability guidance
  const rawFaculties = persona.faculties || [];
  const faculties = rawFaculties.map((f) => (typeof f === 'string' ? f : f.name));
  const rawSkills = Array.isArray(persona.skills) ? persona.skills : [];
  const skills = rawSkills.map((s) => (typeof s === 'string' ? s : s.name));
  const envEntries = config.skills?.entries?.[`persona-${slug}`] || {};

  // selfie migrated to Skill (check both for backward compat)
  if ((skills.includes('selfie') || faculties.includes('selfie')) && !envEntries.env?.FAL_KEY) {
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

  // Trust chain: verify constitutionHash when lineage.json is present
  verifyConstitutionHash(destDir, slug);

  // Social Contacts: materialize contacts.json from seed when missing.
  // contacts.json is gitignored and excluded from zip exports (privacy). On fresh
  // install or import the file is absent; we recreate it from the declared seed so
  // the persona is immediately usable without a separate 'generate' step.
  if (persona.social && persona.social.contacts && persona.social.contacts.enabled) {
    const contactsJsonPath = path.join(destDir, 'social', 'contacts.json');
    if (!fs.existsSync(contactsJsonPath)) {
      try {
        const { buildContactsSeed } = require('../generator/social');
        const seed = buildContactsSeed(persona);
        if (seed) {
          await fs.ensureDir(path.join(destDir, 'social'));
          await fs.writeFile(contactsJsonPath, JSON.stringify(seed, null, 2));
        }
      } catch (e) {
        printWarning(`Could not materialize social/contacts.json from seed: ${e.message}`);
      }
    }
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
  if (skills.includes('selfie') || faculties.includes('selfie')) printInfo('  "Send me a selfie"');
  if (faculties.includes('voice')) printInfo('  "Say something to me"');
  if (skills.includes('music') || faculties.includes('music')) printInfo('  "Compose a song for me"');
  printInfo('  "What are you up to?"');
  printInfo('  "Tell me about yourself"');

  return destDir;
}

/**
 * Compute the combined constitution hash for a persona pack directory.
 * Covers constitution.md + constitution-addendum.md (if present) so the
 * hash chain is invalidated when either document changes.
 *
 * @param {string} soulDir - Path to the soul/ directory
 * @returns {string} SHA-256 hex digest, or '' if constitution.md is absent
 */
function computeConstitutionHash(soulDir) {
  const constitutionPath = path.join(soulDir, 'constitution.md');
  if (!fs.existsSync(constitutionPath)) return '';
  const hasher = crypto.createHash('sha256');
  hasher.update(fs.readFileSync(constitutionPath));
  const addendumPath = path.join(soulDir, 'constitution-addendum.md');
  if (fs.existsSync(addendumPath)) {
    hasher.update('\n---addendum---\n');
    hasher.update(fs.readFileSync(addendumPath));
  }
  return hasher.digest('hex');
}

/**
 * Verify that the installed constitution.md (+ addendum if present) matches
 * the hash recorded in lineage.json.
 * Warns (never throws) so a fork from an older framework version still installs,
 * but the operator is alerted to review the constraint diff.
 */
function verifyConstitutionHash(destDir, slug) {
  const lineagePath = path.join(destDir, 'soul', 'lineage.json');
  if (!fs.existsSync(lineagePath)) return;
  let lineage;
  try { lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf-8')); } catch { return; }
  const expected = lineage.constitutionHash;
  if (!expected) return;

  const soulDir = path.join(destDir, 'soul');
  if (!fs.existsSync(path.join(soulDir, 'constitution.md'))) {
    printWarning(`[trust-chain] persona-${slug}: lineage.json declares constitutionHash but soul/constitution.md is missing — cannot verify.`);
    return;
  }
  const actual = computeConstitutionHash(soulDir);
  if (actual !== expected) {
    printWarning(`[trust-chain] persona-${slug}: constitution.md hash mismatch.`);
    printWarning(`  lineage recorded: ${expected}`);
    printWarning(`  installed hash  : ${actual}`);
    printWarning('  The constitution (or domain addendum) may have been updated since this persona was forked. Review any constraint changes before use.');
  }
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
    const endpoint = OPENPERSONA_TELEMETRY_ENDPOINT;
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

module.exports = { install, computeConstitutionHash };
