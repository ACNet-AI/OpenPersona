'use strict';

/**
 * OpenPersona – Skill installer
 *
 * Installs agent skill packs (SKILL.md-only, no persona.json) to a target
 * directory chosen by the --runtime / --global / --all flags.
 *
 * Default target: .agents/skills/<slug>/  (AGENTS.md universal convention)
 * All AGENTS.md-compliant agents (OpenClaw, Cursor, Claude Code) discover skills
 * from .agents/skills/ automatically — no extra configuration needed.
 *
 * Runtime-specific targets (via --runtime=<name>):
 *   claude      → .claude/skills/<slug>/        (project-local)
 *   cursor      → .cursor/skills/<slug>/        (project-local)
 *   openclaw    → .agents/skills/<slug>/        (OpenClaw standard, same as default)
 *   hermes      → ~/.hermes/skills/<slug>/      (Hermes runtime home, global)
 *   openpersona → ~/.openpersona/skills/<slug>/ (OpenPersona runtime home, global)
 *
 * --global: ~/.agents/skills/<slug>/  (user-global AGENTS.md convention)
 * --all: write to all detected runtime dirs in CWD (.cursor/, .claude/, .agents/)
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { printError, printWarning, printSuccess, printInfo, OPENCLAW_HOME, OPENPERSONA_DIRECTORY } = require('../utils');
const { registryAdd, loadRegistry } = require('../registry');

const AGENTS_MD_PROJECT = '.agents/skills';
const AGENTS_MD_GLOBAL = path.join(os.homedir(), '.agents', 'skills');

const OPENCLAW_JSON = path.join(OPENCLAW_HOME, 'openclaw.json');

/** Known runtime → install target resolver */
const RUNTIME_TARGETS = {
  claude:       (slug) => path.resolve(process.cwd(), '.claude', 'skills', slug),
  cursor:       (slug) => path.resolve(process.cwd(), '.cursor', 'skills', slug),
  openclaw:     (slug) => path.resolve(process.cwd(), AGENTS_MD_PROJECT, slug),
  hermes:       (slug) => path.join(os.homedir(), '.hermes', 'skills', slug),
  openpersona:  (slug) => path.join(os.homedir(), '.openpersona', 'skills', slug),
};

const VALID_RUNTIMES = Object.keys(RUNTIME_TARGETS);

/**
 * Resolve where to install the skill based on the provided options.
 * Returns an array of absolute target directories (--all may return many).
 */
function resolveTargets(slug, opts = {}) {
  const { global: useGlobal, runtime, all } = opts;

  if (all) {
    const targets = [];
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, '.cursor')))  targets.push(path.join(cwd, '.cursor', 'skills', slug));
    if (fs.existsSync(path.join(cwd, '.claude')))  targets.push(path.join(cwd, '.claude', 'skills', slug));
    // Always include .agents/skills — create it if absent
    targets.push(path.join(cwd, AGENTS_MD_PROJECT, slug));
    return [...new Set(targets)];
  }

  if (runtime) {
    const lrt = runtime.toLowerCase();
    if (!RUNTIME_TARGETS[lrt]) {
      printError(`Unknown runtime: "${runtime}". Valid values: ${VALID_RUNTIMES.join(', ')}`);
      process.exit(1);
    }
    return [RUNTIME_TARGETS[lrt](slug)];
  }

  if (useGlobal) {
    return [path.join(AGENTS_MD_GLOBAL, slug)];
  }

  // Default: project-local AGENTS.md convention
  return [path.resolve(process.cwd(), AGENTS_MD_PROJECT, slug)];
}

/** Cross-platform path-contains check (normalizes separators). */
function pathContainsSegment(p, segment) {
  const norm = p.split(path.sep).join('/');
  return norm.includes(segment);
}

/**
 * Optionally register a runtime-owned skill path with OpenClaw's extraDirs.
 * Only applies to non-standard paths (hermes home, openpersona home) that
 * OpenClaw cannot discover via AGENTS.md convention natively.
 */
function maybeRegisterExtraDir(destDir) {
  const openClawPresent = fs.existsSync(OPENCLAW_HOME);
  if (!openClawPresent) return;

  // Only register dirs that are NOT under .agents/skills — those are auto-discovered
  const parentDir = path.dirname(destDir);
  const agentsSegment = '.agents/skills';
  const isAgentsMd = pathContainsSegment(parentDir, agentsSegment);
  const isCursorOrClaude = pathContainsSegment(parentDir, '.cursor/skills') ||
                           pathContainsSegment(parentDir, '.claude/skills');
  if (isAgentsMd || isCursorOrClaude) return;

  try {
    let config = {};
    if (fs.existsSync(OPENCLAW_JSON)) {
      config = JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf-8'));
    }
    config.skills = config.skills || {};
    config.skills.load = config.skills.load || {};
    const extraDirs = config.skills.load.extraDirs || [];
    const parentNorm = parentDir.replace(/\/$/, '');
    if (!extraDirs.some((d) => d.replace(/\/$/, '') === parentNorm)) {
      extraDirs.push(parentDir);
      config.skills.load.extraDirs = extraDirs;
      fs.writeFileSync(OPENCLAW_JSON, JSON.stringify(config, null, 2));
      printInfo(`  OpenClaw: registered ${parentDir} in extraDirs`);
    }
  } catch {
    // OpenClaw integration is optional — never fail the install
  }
}

/**
 * Install a skill pack from a source directory to all resolved target directories.
 *
 * @param {string} skillDir - Source directory (already downloaded / extracted)
 * @param {string} skillMdPath - Absolute path to SKILL.md inside skillDir
 * @param {object} opts
 * @param {boolean} [opts.global] - Install to ~/.agents/skills/
 * @param {string}  [opts.runtime] - Runtime override (claude/cursor/openclaw/hermes/openpersona)
 * @param {boolean} [opts.all] - Mirror to all detected runtime dirs in CWD
 * @param {string}  [opts.source] - Original source (owner/repo or local path)
 * @param {boolean} [opts.force] - Bypass constitution compliance check
 * @param {string}  [opts.regPath] - Override registry file path (for tests)
 * @returns {string[]} List of installed target directories
 */
async function installSkill(skillDir, skillMdPath, opts = {}) {
  const { source = null, regPath, force = false } = opts;

  // Parse frontmatter
  const skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');

  // Constitution compliance pre-check — scan for §2/§3 violations before copying any files
  const { checkSkillCompliance } = require('../lifecycle/constitution-check');
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
        'Review the SKILL.md carefully. Use --force to proceed anyway.'
      );
    }
    if (force && compliance.warnings.length > 0) {
      for (const w of compliance.warnings) {
        printWarning(`  [force] Bypassing ${w.section} flag: ${w.label}`);
      }
    }
  }

  const fm = parseFrontmatter(skillMdContent);
  const versionInfo = resolveVersion(skillDir, fm);

  const rawName = fm.name || path.basename(skillDir);
  const slug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const personaName = fm.name || rawName;
  const role = fm['metadata.role'] || fm.role || 'assistant';

  if (versionInfo.source === 'none') {
    printWarning('Version missing: neither SKILL.md version nor package.json version was found.');
  }

  const targets = resolveTargets(slug, opts);

  for (const destDir of targets) {
    await fs.ensureDir(destDir);
    await fs.copy(skillDir, destDir, { overwrite: true });
    maybeRegisterExtraDir(destDir);
    printSuccess(`Installed to ${destDir}`);
  }

  // Record ALL targets in the registry so uninstall/update reach every install site.
  // Skills are tools/instructions — NOT an active persona — so we do NOT call
  // registrySetActive here (that is reserved for persona packs).
  const primaryTarget = targets[0];

  registryAdd(
    slug,
    { personaName, role, packType: 'single' },
    primaryTarget,
    regPath,
    { installTargets: targets, source, resourceType: 'skill' }
  );

  console.log('');
  printSuccess(`${personaName} installed`);
  printInfo(`  Version : ${versionInfo.version || 'unknown'}`);
  printInfo(`  Target  : ${targets.join(', ')}`);
  const autoDiscoverable = targets.some((t) =>
    pathContainsSegment(t, '.agents/skills') ||
    pathContainsSegment(t, '.claude/skills') ||
    pathContainsSegment(t, '.cursor/skills')
  );
  if (autoDiscoverable) {
    printInfo('  Discoverable by Cursor, Claude Code, OpenClaw via AGENTS.md');
  }
  printInfo(`  View skills: ${OPENPERSONA_DIRECTORY}/skills`);
  console.log('');

  return targets;
}

/** Parse YAML-like frontmatter between --- delimiters */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let multilineBuffer = [];
  for (const line of lines) {
    if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      multilineBuffer.push(line.trim());
      continue;
    }
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

function resolveVersion(skillDir, fm = {}) {
  if (fm.version) return { version: fm.version, source: 'skill_frontmatter' };
  if (fm['metadata.version']) return { version: fm['metadata.version'], source: 'skill_metadata' };
  try {
    const pkgPath = path.join(skillDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
        return { version: pkg.version.trim(), source: 'package_json' };
      }
    }
  } catch { /* ignore */ }
  return { version: null, source: 'none' };
}

/**
 * List installed skills from the registry and local filesystem scans.
 * Shows registry entries (resourceType: 'skill') plus any unregistered skills
 * found in well-known locations.
 */
function listSkills(opts = {}) {
  const { regPath } = opts;
  const reg = loadRegistry(regPath);
  const entries = reg.personas || {};

  // Registered skills
  const registered = Object.values(entries).filter((e) => e.resourceType === 'skill');

  // Legacy: entries installed before resourceType field existed — check installTarget path
  const legacySkill = Object.values(entries).filter((e) =>
    !e.resourceType &&
    e.installTarget &&
    (pathContainsSegment(e.installTarget, '.agents/skills') ||
     pathContainsSegment(e.installTarget, '.claude/skills') ||
     pathContainsSegment(e.installTarget, '.cursor/skills') ||
     pathContainsSegment(e.installTarget, '.hermes/skills'))
  );

  const all = [...registered, ...legacySkill];

  // Also scan filesystem for unregistered skills in standard locations
  const scanDirs = [
    path.resolve(process.cwd(), AGENTS_MD_PROJECT),
    AGENTS_MD_GLOBAL,
  ];
  const unregistered = [];
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    const subdirs = fs.readdirSync(dir).filter((f) => {
      const full = path.join(dir, f);
      return fs.statSync(full).isDirectory() &&
             fs.existsSync(path.join(full, 'SKILL.md'));
    });
    for (const sub of subdirs) {
      const slug = sub.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!all.some((e) => e.slug === slug)) {
        unregistered.push({ slug, path: path.join(dir, sub), source: 'filesystem-scan' });
      }
    }
  }

  return { registered: all, unregistered };
}

module.exports = {
  installSkill,
  resolveTargets,
  parseFrontmatter,
  resolveVersion,
  listSkills,
  pathContainsSegment,
  VALID_RUNTIMES,
  AGENTS_MD_PROJECT,
  AGENTS_MD_GLOBAL,
};
