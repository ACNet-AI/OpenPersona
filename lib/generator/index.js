/**
 * OpenPersona - Core persona generation logic
 *
 * Architecture: P15 Generator Pipeline (7-phase, 4+5+3 aligned)
 * generate() is a phase runner. Each phase is an independently-testable async function
 * that reads from and writes to a shared GeneratorContext object.
 *
 * Phase responsibilities follow the production model:
 *   Generator (tool) processes raw materials (layers/ + aspects/) using molds (templates/)
 *   to produce the persona skill pack (product).
 *
 * Phases (in execution order):
 *   clonePhase    — read/clone persona from path or object; resolve inputDir
 *   validatePhase — Generate Gate (hard-reject) + format normalization + deprecation warnings
 *   loadPhase     — load ALL raw materials (4 layers × 5 concepts) + molds (templates/)
 *   derivedPhase  — ALL derived field computation; pure — zero I/O
 *   preparePhase  — create output dirs; copy local assets + rewrite paths; set persona.avatar
 *   renderPhase   — render main templates via Mustache; pure — zero I/O
 *   emitPhase     — write ALL output artifacts; sole phase with write I/O
 *
 * Dependency constraints observed:
 *   persona.avatar must be set AFTER asset path rewriting (preparePhase),
 *   so it is assigned at the end of preparePhase, not in derivedPhase.
 *
 *   buildAgentCard / buildAcnConfig are kept as compute-then-write composites in emitPhase:
 *   they do not use path-rewritten fields, but moving them to derivedPhase adds context
 *   fields with no current extension use case.
 */
const path = require('path');
const fs = require('fs-extra');
const Mustache = require('mustache');
const { validatePersona } = require('./validate');
const { computeDerivedFields, DERIVED_FIELDS } = require('./derived');
const { buildBodySection } = require('./body');
const { buildAgentCard, buildAcnConfig } = require('./social');
const { loadEconomy, writeEconomyFiles } = require('./economy');

const PKG_ROOT = path.resolve(__dirname, '../..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const { version: FRAMEWORK_VERSION } = require('../../package.json');
const FACULTIES_DIR = path.join(PKG_ROOT, 'layers', 'faculties');
const SKILLS_DIR = path.join(PKG_ROOT, 'layers', 'skills');
const CONSTITUTION_PATH = path.join(PKG_ROOT, 'layers', 'soul', 'constitution.md');
const SIGNAL_PROTOCOL_PATH = path.join(PKG_ROOT, 'layers', 'body', 'SIGNAL-PROTOCOL.md');

const BASE_ALLOWED_TOOLS = ['Bash(openclaw:*)', 'Bash(openpersona:*)', 'Bash(node:*)', 'Read', 'Write'];

// ---------------------------------------------------------------------------
// Helper utilities (not phase-specific)
// ---------------------------------------------------------------------------

/**
 * Normalize new grouped soul format to the flat structure the rest of the generator expects.
 * New format: { soul: { identity: {}, aesthetic: {}, character: {} }, body, faculties, ... }
 * Old format: { personaName, slug, bio, personality, ... } (passthrough, no changes)
 *
 * Validation (validatePersona) must run BEFORE this function — it operates on the raw input.
 */
function normalizeSoulInput(persona) {
  if (!persona.soul) return;
  const { identity = {}, aesthetic = {}, character = {} } = persona.soul;
  Object.assign(persona, identity, aesthetic, character);
  delete persona.soul;
}

function loadConstitution() {
  if (!fs.existsSync(CONSTITUTION_PATH)) {
    return { content: '', version: '' };
  }
  const raw = fs.readFileSync(CONSTITUTION_PATH, 'utf-8');
  const versionMatch = raw.match(/^#\s+.*\bv(\d+(?:\.\d+)*)/m);
  const version = versionMatch ? versionMatch[1] : '';
  const lines = raw.split('\n');
  const firstSectionIdx = lines.findIndex((l) => /^## (?:§)?\d+\./.test(l));
  const content = firstSectionIdx === -1 ? raw : lines.slice(firstSectionIdx).join('\n').trim();
  return { content, version };
}

function loadFaculty(name) {
  const facultyDir = path.join(FACULTIES_DIR, name);
  const facultyPath = path.join(facultyDir, 'faculty.json');
  if (!fs.existsSync(facultyPath)) {
    throw new Error(`Faculty not found: ${name}`);
  }
  const faculty = JSON.parse(fs.readFileSync(facultyPath, 'utf-8'));

  if (!faculty.name || !faculty.dimension) {
    throw new Error(`Faculty ${name}: name and dimension are required`);
  }
  const dims = ['expression', 'sense', 'cognition'];
  if (!dims.includes(faculty.dimension)) {
    throw new Error(`Faculty ${name}: dimension must be expression/sense/cognition`);
  }
  if (faculty.skillRef && faculty.skeleton) {
    throw new Error(`Faculty ${name}: skillRef and skeleton are mutually exclusive`);
  }
  if (!faculty.skillRef && !faculty.skeleton && (!faculty.files || faculty.files.length === 0)) {
    throw new Error(`Faculty ${name}: files required when no skillRef/skeleton`);
  }

  faculty._dir = facultyDir;
  return faculty;
}

/**
 * Load a skill definition from layers/skills/{name}/.
 * Returns the full skill object if found, or null if not found (fallback to inline).
 */
function loadSkill(name) {
  const skillDir = path.join(SKILLS_DIR, name);
  const skillJsonPath = path.join(skillDir, 'skill.json');
  if (!fs.existsSync(skillJsonPath)) {
    return null;
  }
  const skill = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
  skill._dir = skillDir;

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    skill._content = fs.readFileSync(skillMdPath, 'utf-8');
  }

  return skill;
}

function buildBackstory(persona) {
  const parts = [];
  parts.push(`You are ${persona.personaName}, ${persona.bio}.`);
  if (persona.age) parts.push(`You are ${persona.age} years old.`);
  if (persona.background) parts.push(persona.background);
  return parts.join(' ');
}

function collectAllowedTools(persona, faculties) {
  const set = new Set(BASE_ALLOWED_TOOLS);
  const src = [
    ...(Array.isArray(persona.allowedTools) ? persona.allowedTools : []),
    ...(Array.isArray(persona.additionalAllowedTools) ? persona.additionalAllowedTools : []),
  ];
  src.forEach((t) => set.add(t));
  faculties.forEach((f) => (f.allowedTools || []).forEach((t) => set.add(t)));
  return Array.from(set);
}

function readFacultySkillMd(faculty, persona) {
  let raw = fs.readFileSync(path.join(faculty._dir, 'SKILL.md'), 'utf-8');

  raw = raw.replace(/<details>[\s\S]*?<\/details>\s*/g, '');

  const refSections = ['Environment Variables', 'Error Handling'];
  for (const heading of refSections) {
    const pattern = new RegExp(
      `^## ${heading}\\b[\\s\\S]*?(?=^## |$(?!\\n))`,
      'gm'
    );
    raw = raw.replace(pattern, '');
  }

  raw = raw.replace(/\n{3,}/g, '\n\n').trim();
  return Mustache.render(raw, persona);
}

/**
 * Build a brief, persona-friendly summary of faculties for soul-injection.
 */
function buildFacultySummary(faculties) {
  if (!faculties.length) return '';
  const lines = faculties
    .filter((f) => f.type !== 'aspect')
    .map((f) => {
      const dimLabel = f.dimension
        ? f.dimension.charAt(0).toUpperCase() + f.dimension.slice(1)
        : 'System';
      return `- **${f.name}** (${dimLabel}) — ${f.description}`;
    });
  return lines.join('\n');
}

/**
 * Build rich persona behavior content for SKILL.md.
 * Accepts pre-loaded behaviorGuideContent (from loadPhase) — pure computation, no I/O.
 *
 * @param {object} persona
 * @param {object[]} faculties
 * @param {string|null} behaviorGuideContent - pre-loaded file content, or null if inline/absent
 */
function buildSkillContent(persona, faculties, behaviorGuideContent) {
  const sections = [];

  sections.push(`You are **${persona.personaName}**, ${persona.bio}.`);
  if (persona.background) {
    sections.push(persona.background);
  }

  if (persona.capabilities?.length) {
    sections.push('');
    sections.push('### Core Capabilities');
    sections.push('');
    for (const cap of persona.capabilities) {
      sections.push(`- **${cap}**`);
    }
  }

  if (persona.behaviorGuide) {
    sections.push('');
    if (persona.behaviorGuide.startsWith('file:')) {
      // File content was pre-loaded in loadPhase
      if (behaviorGuideContent != null) {
        sections.push(behaviorGuideContent);
      }
    } else {
      // Inline string format
      sections.push(persona.behaviorGuide);
    }
  }

  sections.push('');
  sections.push('### Behavior Guidelines');
  sections.push('');
  sections.push(`- **Personality**: ${persona.personality}`);
  sections.push(`- **Speaking style**: ${persona.speakingStyle}`);
  if (persona.vibe) {
    sections.push(`- **Overall vibe**: ${persona.vibe}`);
  }
  if (persona.boundaries) {
    sections.push(`- **Boundaries**: ${persona.boundaries}`);
  }

  return sections.join('\n');
}

/**
 * Write state.json — the Lifecycle Protocol's runtime memory.
 */
async function writeStateFile(skillDir, persona) {
  const statePath = path.join(skillDir, 'state.json');
  if (fs.existsSync(statePath)) return;

  const soulStateTpl = fs.readFileSync(
    path.join(PKG_ROOT, 'templates', 'soul', 'soul-state.template.json'),
    'utf-8'
  );
  const now = new Date().toISOString();
  const moodBaseline = persona.personality?.split(',')[0]?.trim() || 'neutral';
  const soulState = Mustache.render(soulStateTpl, {
    slug: persona.slug,
    createdAt: now,
    lastUpdatedAt: now,
    moodBaseline,
  });
  await fs.writeFile(statePath, soulState);
}

/**
 * Write soul/self-narrative.md when evolution is enabled.
 */
async function writeSelfNarrative(soulDir, persona) {
  const selfNarrativePath = path.join(soulDir, 'self-narrative.md');
  if (!fs.existsSync(selfNarrativePath)) {
    await fs.writeFile(
      selfNarrativePath,
      `# Self-Narrative\n\n_Written and maintained by ${persona.personaName}. Each entry captures a significant moment of growth or realization, written in first-person voice. Append new entries — never overwrite or delete previous ones._\n`
    );
  }
}

// ---------------------------------------------------------------------------
// GeneratorContext
// ---------------------------------------------------------------------------

/**
 * Create an empty GeneratorContext.
 * The context is a shared mutable object that flows through all pipeline phases.
 * Each phase reads from and writes to the context; no phase returns a value.
 *
 * Fields are grouped by the phase that first populates them.
 *
 * @param {string|object} personaPathOrObj
 * @param {string} outputDir
 */
function createContext(personaPathOrObj, outputDir) {
  return {
    // ── Input ────────────────────────────────────────────────────────────
    personaPathOrObj,
    outputDir,

    // ── clonePhase ───────────────────────────────────────────────────────
    persona: null,
    inputDir: null,

    // ── validatePhase ────────────────────────────────────────────────────
    evolutionEnabled: false,

    // ── loadPhase ────────────────────────────────────────────────────────
    // Soul layer
    constitution: null,              // { content, version }
    behaviorGuideContent: null,      // pre-loaded file content (when behaviorGuide is "file:")
    behaviorGuideSourcePath: null,   // source path for emitPhase file copy
    // Body layer
    rawBody: null,                   // persona.body || embodiments[0] || null
    softRefBody: null,               // { name, install } | null
    // Faculty layer
    loadedFaculties: [],             // locally-resolved faculty objects
    softRefFaculties: [],            // external-only: { name, install }
    facultyNames: [],                // all declared faculty names (ordered)
    // Skill layer
    skillCache: null,                // Map<name, skill|null>
    resolvedSkills: [],              // classified skill objects
    activeSkills: [],                // resolved or inline-only skills
    softRefSkills: [],               // external-only skills
    // Evolution sources
    softRefSources: [],
    validEvolutionSources: [],
    // Templates (molds)
    soulTpl: '',
    skillTpl: '',
    soulPartials: null,

    // ── derivedPhase ─────────────────────────────────────────────────────
    activeSkillNames: [],
    facultyIndex: [],
    bodyDescription: '',

    // ── preparePhase ─────────────────────────────────────────────────────
    skillDir: null,
    soulDir: null,
    refsDir: null,
    // persona.avatar is also set here (after asset path rewriting)

    // ── renderPhase ──────────────────────────────────────────────────────
    soulInjection: '',
    skillMd: '',
  };
}

// ---------------------------------------------------------------------------
// Pipeline phases
// ---------------------------------------------------------------------------

/**
 * Phase 1 — Clone
 * Read persona.json from disk or deep-clone an inline object.
 * Resolves inputDir for later asset and file: reference resolution.
 */
async function clonePhase(ctx) {
  if (typeof ctx.personaPathOrObj === 'string') {
    ctx.inputDir = path.dirname(path.resolve(ctx.personaPathOrObj));
    ctx.persona = JSON.parse(fs.readFileSync(ctx.personaPathOrObj, 'utf-8'));
  } else {
    ctx.persona = JSON.parse(JSON.stringify(ctx.personaPathOrObj));
    ctx.inputDir = null;
  }
}

/**
 * Phase 2 — Validate
 * Runs the Generate Gate (hard-reject on constraint violations), normalizes the soul
 * input format, emits deprecation warnings, and sets top-level control flags.
 */
async function validatePhase(ctx) {
  const { persona } = ctx;

  validatePersona(persona);
  normalizeSoulInput(persona);

  persona._heartbeatConfig = persona.rhythm?.heartbeat || persona.heartbeat || null;

  if (persona.body?.runtime?.acn_gateway && !persona.social?.acn?.gateway) {
    process.stderr.write('[openpersona] deprecation: body.runtime.acn_gateway → social.acn.gateway\n');
  }
  if (persona.body?.runtime?.platform && !persona.body?.runtime?.framework) {
    process.stderr.write('[openpersona] deprecation: body.runtime.platform → body.runtime.framework\n');
  }
  if (persona.evolution?.channels && !persona.evolution?.sources) {
    process.stderr.write('[openpersona] deprecation: evolution.channels → evolution.sources\n');
  }

  ctx.evolutionEnabled = persona.evolution?.enabled === true;
}

/**
 * Phase 3 — Load
 * Loads ALL raw materials (4 structural layers + Economy aspect) and molds (templates/).
 * This phase is the sole consumer of the source directories:
 *   layers/soul/   → constitution.md
 *   layers/body/   → (softRefBody detection; SIGNAL-PROTOCOL.md copied in emitPhase)
 *   layers/faculties/ → faculty.json × N
 *   layers/skills/    → skill.json × N
 *   aspects/economy/  → economy.json (when economy.enabled)
 *   templates/        → skill.template.md + soul-injection + partials × 6
 *
 * behaviorGuide file content is pre-loaded here so buildSkillContent (derivedPhase)
 * remains a pure function with no I/O.
 */
async function loadPhase(ctx) {
  const { persona, inputDir } = ctx;

  // ── Soul layer ────────────────────────────────────────────────────────
  ctx.constitution = loadConstitution();

  // Pre-load behaviorGuide file content (if "file:" reference)
  if (persona.behaviorGuide?.startsWith('file:') && inputDir) {
    const filePath = path.resolve(inputDir, persona.behaviorGuide.slice(5));
    if (fs.existsSync(filePath)) {
      ctx.behaviorGuideContent = fs.readFileSync(filePath, 'utf-8');
      ctx.behaviorGuideSourcePath = filePath;
    } else {
      process.stderr.write(`[openpersona] warning: behaviorGuide file not found: ${filePath}\n`);
    }
  }

  // ── Body layer ────────────────────────────────────────────────────────
  ctx.rawBody = persona.body || persona.embodiments?.[0] || null;
  ctx.softRefBody = ctx.rawBody && typeof ctx.rawBody === 'object' && ctx.rawBody.install
    ? { name: ctx.rawBody.name || 'body', install: ctx.rawBody.install }
    : null;

  // ── Faculty layer ─────────────────────────────────────────────────────
  const rawFaculties = persona.faculties || [];
  const facultyConfigs = {};

  ctx.facultyNames = rawFaculties.map((entry) => {
    if (typeof entry !== 'object' || !entry.name) {
      throw new Error(`Invalid faculty entry: ${JSON.stringify(entry)} — must be { name: "...", ...config }`);
    }
    const { name, ...config } = entry;
    if (Object.keys(config).length > 0) {
      facultyConfigs[name] = config;
    }
    return name;
  });

  if (Object.keys(facultyConfigs).length > 0) {
    persona.facultyConfigs = facultyConfigs;
  }

  for (let i = 0; i < ctx.facultyNames.length; i++) {
    const name = ctx.facultyNames[i];
    const entry = rawFaculties[i];
    if (entry.install) {
      try {
        ctx.loadedFaculties.push(loadFaculty(name));
      } catch {
        ctx.softRefFaculties.push({ name, install: entry.install });
      }
    } else {
      ctx.loadedFaculties.push(loadFaculty(name));
    }
  }

  // ── Economy aspect ────────────────────────────────────────────────────
  // Economy is a systemic concept (aspects/economy/), not a structural Faculty.
  if (persona.economy?.enabled === true && !ctx.facultyNames.includes('economy')) {
    const economyAspect = loadEconomy();
    if (economyAspect) {
      ctx.loadedFaculties.push(economyAspect);
    }
  }

  // ── Skill layer ───────────────────────────────────────────────────────
  const rawSkills = Array.isArray(persona.skills) ? persona.skills : [];
  const validSkills = rawSkills.filter((s) => s && typeof s === 'object' && s.name);

  ctx.skillCache = new Map();
  for (const s of validSkills) {
    if (!ctx.skillCache.has(s.name)) {
      ctx.skillCache.set(s.name, loadSkill(s.name));
    }
  }

  ctx.resolvedSkills = validSkills.map((s) => {
    const local = ctx.skillCache.get(s.name);
    const hasInstall = !!s.install;
    const isResolved = !!local;

    let status;
    if (isResolved)       status = 'resolved';
    else if (hasInstall)  status = 'soft-ref';
    else                  status = 'inline-only';

    return {
      name: s.name,
      description: local?.description || s.description || '',
      trigger: local?.triggers?.join(', ') || s.trigger || '',
      hasContent: !!local?._content,
      content: local?._content || '',
      status,
      install: s.install || '',
      isSoftRef: status === 'soft-ref',
    };
  });

  ctx.activeSkills = ctx.resolvedSkills.filter((s) => !s.isSoftRef);
  ctx.softRefSkills = ctx.resolvedSkills.filter((s) => s.isSoftRef);

  // ── Evolution sources ─────────────────────────────────────────────────
  const rawEvolutionSources = persona.evolution?.sources || persona.evolution?.channels || [];
  ctx.validEvolutionSources = rawEvolutionSources.filter((ch) => ch && typeof ch === 'object' && ch.name);
  ctx.softRefSources = ctx.validEvolutionSources.filter((ch) => !!ch.install);

  // ── Templates (molds) ─────────────────────────────────────────────────
  ctx.soulTpl = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'soul', 'soul-injection.template.md'),
    'utf-8'
  );
  ctx.skillTpl = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'skill.template.md'),
    'utf-8'
  );

  const SOUL_PARTIALS_DIR = path.join(TEMPLATES_DIR, 'soul', 'partials');
  ctx.soulPartials = {
    'soul-intro':               fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-intro.partial.md'), 'utf-8'),
    'soul-awareness-identity':  fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-identity.partial.md'), 'utf-8'),
    'soul-awareness-body':      fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-body.partial.md'), 'utf-8'),
    'soul-awareness-growth':    fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-growth.partial.md'), 'utf-8'),
    'soul-how-you-grow':        fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-how-you-grow.partial.md'), 'utf-8'),
    'soul-economy':             fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-economy.partial.md'), 'utf-8'),
  };
}

/**
 * Phase 4 — Derive
 * Computes ALL derived fields. Pure — zero I/O.
 * behaviorGuideContent (pre-loaded in loadPhase) is passed to buildSkillContent
 * so this phase remains free of file reads.
 *
 * Note: persona.avatar is intentionally NOT set here — it depends on
 * persona.referenceImage which is rewritten by preparePhase. It is set at
 * the end of preparePhase after asset copying completes.
 */
async function derivedPhase(ctx) {
  const {
    persona, loadedFaculties, softRefFaculties, softRefBody, softRefSources,
    evolutionEnabled, facultyNames, behaviorGuideContent, rawBody,
  } = ctx;

  // Initial derived fields (depend on loadedFaculties)
  persona.backstory = buildBackstory(persona);
  persona.facultySummary = buildFacultySummary(loadedFaculties);
  persona.skillContent = buildSkillContent(persona, loadedFaculties, behaviorGuideContent);
  persona.description = persona.bio?.slice(0, 120) || `Persona: ${persona.personaName}`;
  persona.allowedTools = collectAllowedTools(persona, loadedFaculties);
  persona.creature = persona.creature ?? 'AI companion';
  persona.emoji = persona.emoji ?? '🤖';
  persona.vibe = persona.vibe ?? '';
  persona.capabilitiesSection = persona.capabilities?.length
    ? persona.capabilities.map((c) => `- **${c}**`).join('\n')
    : '';
  persona.author = persona.author ?? 'openpersona';
  persona.version = persona.version ?? '0.1.0';

  // Merge skill allowedTools (requires skillCache from loadPhase)
  for (const [, local] of ctx.skillCache) {
    if (local?.allowedTools) {
      local.allowedTools.forEach((t) => {
        if (!persona.allowedTools.includes(t)) {
          persona.allowedTools.push(t);
        }
      });
    }
  }
  persona.allowedToolsStr = persona.allowedTools.join(' ');

  ctx.activeSkillNames = ctx.activeSkills.map((s) => s.name);

  // Full derived field computation (all template flags, soft-ref awareness, etc.)
  computeDerivedFields(persona, {
    loadedFaculties,
    softRefSkills: ctx.softRefSkills,
    softRefFaculties,
    softRefBody,
    softRefSources,
    evolutionEnabled,
    facultyNames,
    activeSkillNames: ctx.activeSkillNames,
  });

  // Body section for SKILL.md (pure computation from rawBody)
  const { bodyDescription, hasInterfaceConfig, interfaceSignalPolicy, interfaceCommandPolicy } =
    buildBodySection(rawBody, softRefBody);
  ctx.bodyDescription = bodyDescription;
  persona.hasInterfaceConfig = hasInterfaceConfig;
  persona.interfaceSignalPolicy = interfaceSignalPolicy;
  persona.interfaceCommandPolicy = interfaceCommandPolicy;

  // Faculty index for SKILL.md summary table
  ctx.facultyIndex = loadedFaculties
    .filter((f) => !f.skillRef && !f.skeleton && f.type !== 'aspect')
    .map((f) => {
      const hasDoc = f.files?.includes('SKILL.md');
      return {
        facultyName: f.name,
        facultyDimension: f.dimension,
        facultyDescription: f.description || '',
        facultyFile: hasDoc ? `references/${f.name}.md` : '',
        hasFacultyFile: hasDoc,
      };
    });
}

/**
 * Phase 5 — Prepare
 * Creates the output directory tree and copies local asset files.
 * Asset path rewriting MUST happen before renderPhase so Mustache templates
 * see the correct ./assets/... relative paths.
 *
 * persona.avatar is set here (after rewriting) — it is the one derived field
 * that depends on a path-rewritten value and cannot be computed in derivedPhase.
 */
async function preparePhase(ctx) {
  const { persona, inputDir, outputDir } = ctx;

  await fs.ensureDir(outputDir);
  ctx.skillDir = path.join(outputDir, `persona-${persona.slug}`);
  ctx.soulDir = path.join(ctx.skillDir, 'soul');
  ctx.refsDir = path.join(ctx.skillDir, 'references');

  await fs.ensureDir(ctx.skillDir);
  await fs.ensureDir(path.join(ctx.skillDir, 'scripts'));

  if (inputDir) {
    const isLocal = (s) => s && typeof s === 'string' && !s.startsWith('http') && !s.startsWith('data:') && !s.startsWith('//');
    const copyAsset = (srcRel, destSubdir) => {
      const src = path.isAbsolute(srcRel) ? srcRel : path.join(inputDir, srcRel);
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        process.stderr.write(`[openpersona] warning: asset file not found, skipping copy: ${src}\n`);
        return null;
      }
      const destName = path.basename(src);
      const dest = path.join(ctx.skillDir, 'assets', destSubdir, destName);
      fs.ensureDirSync(path.dirname(dest));
      fs.copyFileSync(src, dest);
      return `./assets/${destSubdir}/${destName}`;
    };
    if (isLocal(persona.referenceImage)) {
      const rewritten = copyAsset(persona.referenceImage, 'reference');
      if (rewritten) persona.referenceImage = rewritten;
    }
    const appearance = persona.body?.appearance;
    if (appearance && typeof appearance === 'object') {
      if (isLocal(appearance.avatar)) {
        const rewritten = copyAsset(appearance.avatar, 'avatar');
        if (rewritten) appearance.avatar = rewritten;
      }
      if (isLocal(appearance.model3d)) {
        const rewritten = copyAsset(appearance.model3d, 'avatar');
        if (rewritten) appearance.model3d = rewritten;
      }
    }
  }

  // persona.avatar depends on persona.referenceImage which may have just been rewritten above.
  // Must be assigned after asset copying — cannot live in derivedPhase.
  persona.avatar = persona.referenceImage || persona.avatar || '';
}

/**
 * Phase 6 — Render
 * Renders main templates via Mustache. Pure — zero I/O.
 * All template variables are on ctx.persona (set by derivedPhase + preparePhase).
 */
async function renderPhase(ctx) {
  const { persona, soulTpl, skillTpl, soulPartials, constitution, bodyDescription, facultyIndex, activeSkills } = ctx;

  ctx.soulInjection = Mustache.render(soulTpl, persona, soulPartials);

  ctx.skillMd = Mustache.render(skillTpl, {
    ...persona,
    constitutionVersion: constitution.version,
    bodyDescription,
    hasFaculties: facultyIndex.length > 0,
    facultyIndex,
    hasSkills: activeSkills.length > 0,
    hasSkillTable: activeSkills.filter((s) => !s.hasContent).length > 0,
    skillEntries: activeSkills.filter((s) => !s.hasContent),
    skillBlocks: activeSkills.filter((s) => s.hasContent),
  });
}

/**
 * Phase 7 — Emit
 * Writes ALL output artifacts. Sole phase with write I/O.
 *
 * buildAgentCard / buildAcnConfig are compute-then-write composites kept here because:
 * (a) they only write when their features are enabled, (b) they do not use path-rewritten
 * fields, but moving them to derivedPhase adds context fields with no current extension need.
 */
async function emitPhase(ctx) {
  const { persona, skillDir, soulDir, refsDir, loadedFaculties, skillCache, constitution } = ctx;

  // SKILL.md + Soul layer artifacts
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), ctx.skillMd);
  await fs.ensureDir(soulDir);
  await fs.writeFile(path.join(soulDir, 'injection.md'), ctx.soulInjection);

  const constitutionOut = constitution.version
    ? `# OpenPersona Constitution (v${constitution.version})\n\n${constitution.content}`
    : constitution.content;
  if (constitutionOut.trim()) {
    await fs.writeFile(path.join(soulDir, 'constitution.md'), constitutionOut);
  }

  // Faculty reference docs (read + Mustache render + write — minor composite)
  for (const f of loadedFaculties) {
    if (!f.skillRef && !f.skeleton && f.files?.includes('SKILL.md')) {
      await fs.ensureDir(refsDir);
      const content = readFacultySkillMd(f, persona);
      await fs.writeFile(path.join(refsDir, `${f.name}.md`), content);
    }
  }

  // Body layer: Signal Protocol host-side guide
  if (fs.existsSync(SIGNAL_PROTOCOL_PATH)) {
    await fs.ensureDir(refsDir);
    await fs.copy(SIGNAL_PROTOCOL_PATH, path.join(refsDir, 'SIGNAL-PROTOCOL.md'));
  }

  // Copy faculty resource files (skip SKILL.md — written separately above)
  for (const f of loadedFaculties) {
    if (f.files) {
      for (const rel of f.files) {
        if (rel === 'SKILL.md') continue;
        const src = path.join(f._dir, rel);
        if (fs.existsSync(src)) {
          const dest = path.join(skillDir, rel);
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest);
        }
      }
    }
  }

  // Copy skill resource files
  for (const [, local] of skillCache) {
    if (local?.files && local._dir) {
      for (const rel of local.files) {
        if (rel === 'SKILL.md') continue;
        const src = path.join(local._dir, rel);
        if (fs.existsSync(src)) {
          const dest = path.join(skillDir, rel);
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest);
        }
      }
    }
  }

  // soul/behavior-guide.md
  if (persona.behaviorGuide) {
    const behaviorGuideDest = path.join(skillDir, 'soul', 'behavior-guide.md');
    if (persona.behaviorGuide.startsWith('file:') && ctx.behaviorGuideSourcePath) {
      // Content was pre-loaded in loadPhase; copy the source file to output
      if (fs.existsSync(ctx.behaviorGuideSourcePath)) {
        fs.copyFileSync(ctx.behaviorGuideSourcePath, behaviorGuideDest);
      }
    } else if (!persona.behaviorGuide.startsWith('file:')) {
      // Inline string → externalize to file and update reference
      fs.writeFileSync(behaviorGuideDest, persona.behaviorGuide);
      persona.behaviorGuide = 'file:soul/behavior-guide.md';
    }
  }

  // persona.json — strip internal derived fields, inject framework meta
  const cleanPersona = { ...persona };
  for (const key of DERIVED_FIELDS) {
    delete cleanPersona[key];
  }
  cleanPersona.meta = cleanPersona.meta || {};
  cleanPersona.meta.framework = 'openpersona';
  cleanPersona.meta.frameworkVersion = FRAMEWORK_VERSION;

  if (persona.facultyConfigs) {
    const envDefaults = { ...(cleanPersona.defaults?.env || {}) };
    for (const [fname, cfg] of Object.entries(persona.facultyConfigs)) {
      if (fname === 'voice') {
        if (cfg.provider) envDefaults.TTS_PROVIDER = cfg.provider;
        if (cfg.voiceId) envDefaults.TTS_VOICE_ID = cfg.voiceId;
        if (cfg.stability != null) envDefaults.TTS_STABILITY = String(cfg.stability);
        if (cfg.similarity_boost != null) envDefaults.TTS_SIMILARITY = String(cfg.similarity_boost);
        if (cfg.apiKey) envDefaults.ELEVENLABS_API_KEY = cfg.apiKey;
      } else if (fname === 'selfie') {
        if (cfg.apiKey) envDefaults.FAL_KEY = cfg.apiKey;
      } else if (fname === 'music') {
        if (cfg.apiKey) envDefaults.ELEVENLABS_API_KEY = cfg.apiKey;
      } else if (fname === 'memory') {
        if (cfg.provider) envDefaults.MEMORY_PROVIDER = cfg.provider;
        if (cfg.apiKey) envDefaults.MEMORY_API_KEY = cfg.apiKey;
        if (cfg.basePath) envDefaults.MEMORY_BASE_PATH = cfg.basePath;
      }
    }
    if (Object.keys(envDefaults).length > 0) {
      cleanPersona.defaults = { env: envDefaults };
    }
  }

  await fs.writeFile(path.join(skillDir, 'persona.json'), JSON.stringify(cleanPersona, null, 2));

  // Social aspect: Agent Card + ACN config (compute-then-write composites)
  const { agentCard, agentCardSkills } = buildAgentCard(persona, loadedFaculties, ctx.activeSkills);
  if (persona.social?.a2a?.enabled !== false) {
    await fs.writeFile(path.join(skillDir, 'agent-card.json'), JSON.stringify(agentCard, null, 2));
  }
  if (persona.social?.acn?.enabled !== false) {
    const acnConfig = buildAcnConfig(persona, agentCardSkills);
    await fs.writeFile(path.join(skillDir, 'acn-config.json'), JSON.stringify(acnConfig, null, 2));
  }

  // Body nervous system
  await writeStateFile(skillDir, persona);
  if (ctx.evolutionEnabled) {
    await writeSelfNarrative(soulDir, persona);
  }

  // Economy aspect
  if (persona.hasEconomyFaculty) {
    const economyDir = path.join(skillDir, 'economy');
    await writeEconomyFiles(economyDir, persona);
  }

  // Body: Runtime state bridge script
  const stateSyncScript = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'body', 'state-sync.template.js'),
    'utf-8'
  );
  await fs.writeFile(path.join(skillDir, 'scripts', 'state-sync.js'), stateSyncScript);

  // .gitignore — protect sensitive runtime files
  const gitignoreContent = [
    '# OpenPersona runtime files — do not commit to version control',
    'acn-registration.json',
    'state.json',
    'handoff.json',
    'soul/self-narrative.md',
    '',
  ].join('\n');
  await fs.writeFile(path.join(skillDir, '.gitignore'), gitignoreContent);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a persona skill pack from a persona.json declaration.
 * Runs the 7-phase generation pipeline via a shared GeneratorContext.
 *
 * Phase sequence:
 *   clone → validate → load → derive → prepare → render → emit
 *
 * @param {string|object} personaPathOrObj - Path to persona.json or inline persona object
 * @param {string} outputDir - Target output directory
 * @returns {{ persona: object, skillDir: string }}
 */
async function generate(personaPathOrObj, outputDir) {
  const ctx = createContext(personaPathOrObj, outputDir);
  await clonePhase(ctx);
  await validatePhase(ctx);
  await loadPhase(ctx);
  await derivedPhase(ctx);
  await preparePhase(ctx);
  await renderPhase(ctx);
  await emitPhase(ctx);
  return { persona: ctx.persona, skillDir: ctx.skillDir };
}

module.exports = {
  generate,
  // Pipeline primitives — exported for independent testing and third-party hooks
  createContext,
  clonePhase,
  validatePhase,
  loadPhase,
  derivedPhase,
  preparePhase,
  renderPhase,
  emitPhase,
  // Utilities consumed by other modules
  loadFaculty,
  loadConstitution,
  BASE_ALLOWED_TOOLS,
};
