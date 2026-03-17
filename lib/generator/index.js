/**
 * OpenPersona - Core persona generation logic
 *
 * Architecture: P15 Generator Pipeline
 * generate() is a phase runner. Each phase is an independently-testable async function
 * that reads from and writes to a shared GeneratorContext object.
 *
 * Phases (in execution order):
 *   clonePhase    — read/clone persona from path or object; resolve inputDir
 *   validatePhase — Generate Gate (validate) + format normalization + deprecation warnings
 *   derivePhase   — load faculties/economy; compute initial derived fields
 *   assetPhase    — create output dirs; copy local assets (rewrite paths); write state-sync.js
 *   templatePhase — resolve skills; computeDerivedFields; render soul-injection + SKILL.md
 *   emitPhase     — write all output files
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

// state-sync.js — generated into every persona's scripts/ directory
// Loaded from templates/body/state-sync.template.js to keep generator.js maintainable
const STATE_SYNC_SCRIPT = fs.readFileSync(
  path.join(TEMPLATES_DIR, 'body', 'state-sync.template.js'),
  'utf-8'
);

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
  if (!persona.soul) return; // old flat format — passthrough
  const { identity = {}, aesthetic = {}, character = {} } = persona.soul;
  Object.assign(persona, identity, aesthetic, character);
  delete persona.soul;
  // additionalAllowedTools is NOT merged here — handled by collectAllowedTools() uniformly
}

function loadTemplate(name) {
  // soul-injection lives in templates/soul/; all others are at templates/ root
  const subdir = name === 'soul-injection' ? 'soul' : '';
  const file = subdir
    ? path.join(TEMPLATES_DIR, subdir, `${name}.template.md`)
    : path.join(TEMPLATES_DIR, `${name}.template.md`);
  return fs.readFileSync(file, 'utf-8');
}

function loadConstitution() {
  if (!fs.existsSync(CONSTITUTION_PATH)) {
    return { content: '', version: '' };
  }
  const raw = fs.readFileSync(CONSTITUTION_PATH, 'utf-8');
  // Extract version from H1 title (e.g. "# OpenPersona Constitution v1.0")
  const versionMatch = raw.match(/^#\s+.*\bv(\d+(?:\.\d+)*)/m);
  const version = versionMatch ? versionMatch[1] : '';
  // Strip the H1 title and intro paragraph — only inject the operative sections
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

  // Validation
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
    return null; // No local definition — use inline manifest fields
  }
  const skill = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8'));
  skill._dir = skillDir;

  // Load SKILL.md content if available
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
  // Merge both old allowedTools (legacy) and new additionalAllowedTools (v0.17+)
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

  // Strip <details>...</details> blocks (operator reference, not needed by agent)
  raw = raw.replace(/<details>[\s\S]*?<\/details>\s*/g, '');

  // Strip reference-only sections that don't help the agent in conversation
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
 * This goes into SOUL.md — should describe WHAT you can do, not HOW (no API details).
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
 * Describes who the persona is, what they can do, and how they should behave.
 *
 * @param {object} persona
 * @param {object[]} faculties
 * @param {string|null} inputDir  - Directory of the source persona.json (for resolving "file:" paths)
 */
function buildSkillContent(persona, faculties, inputDir) {
  const sections = [];

  // Identity
  sections.push(`You are **${persona.personaName}**, ${persona.bio}.`);
  if (persona.background) {
    sections.push(persona.background);
  }

  // Capabilities as behavioral instructions
  if (persona.capabilities?.length) {
    sections.push('');
    sections.push('### Core Capabilities');
    sections.push('');
    for (const cap of persona.capabilities) {
      sections.push(`- **${cap}**`);
    }
  }

  // Domain-specific behavior guide (optional, from persona.json)
  if (persona.behaviorGuide) {
    sections.push('');
    if (persona.behaviorGuide.startsWith('file:') && inputDir) {
      // File-reference format: read content from external file
      const filePath = path.resolve(inputDir, persona.behaviorGuide.slice(5));
      if (fs.existsSync(filePath)) {
        sections.push(fs.readFileSync(filePath, 'utf8'));
      } else {
        process.stderr.write(`[openpersona] warning: behaviorGuide file not found: ${filePath}\n`);
      }
    } else if (!persona.behaviorGuide.startsWith('file:')) {
      // Inline string format
      sections.push(persona.behaviorGuide);
    }
  }

  // Speaking style guidance
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
 * Generated unconditionally for all personas; lives at the pack root (not soul/).
 * Schema: schemas/persona-skill-pack.spec.md
 */
async function writeStateFile(skillDir, persona) {
  const statePath = path.join(skillDir, 'state.json');
  // Preserve existing state.json — live evolution data must never be overwritten on re-generation.
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
 * Append-only growth log written by the persona in first-person voice.
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
 * @param {string|object} personaPathOrObj - Path to persona.json or inline persona object
 * @param {string} outputDir - Target output directory
 */
function createContext(personaPathOrObj, outputDir) {
  return {
    // ── Input ──────────────────────────────────────────────────────────
    personaPathOrObj,
    outputDir,

    // ── clonePhase ──────────────────────────────────────────────────────
    persona: null,
    inputDir: null,

    // ── validatePhase ───────────────────────────────────────────────────
    evolutionEnabled: false,

    // ── derivePhase (load resources + initial derived fields) ───────────
    loadedFaculties: [],
    softRefFaculties: [],
    softRefBody: null,
    softRefSources: [],
    validEvolutionSources: [],

    // ── assetPhase (output dirs + asset copy) ───────────────────────────
    skillDir: null,
    soulDir: null,
    refsDir: null,

    // ── templatePhase (skill resolution + render) ───────────────────────
    skillCache: null,          // Map<name, skill|null>
    resolvedSkills: [],
    activeSkills: [],
    softRefSkills: [],
    activeSkillNames: [],
    constitution: null,
    soulPartials: null,
    soulInjection: '',
    skillMd: '',
    facultyIndex: [],
    bodyDescription: '',
  };
}

// ---------------------------------------------------------------------------
// Pipeline phases
// ---------------------------------------------------------------------------

/**
 * Phase 1 — Clone
 * Read persona.json from disk or deep-clone an inline object.
 * Resolves inputDir (directory of the source persona.json) for later asset resolution.
 */
async function clonePhase(ctx) {
  if (typeof ctx.personaPathOrObj === 'string') {
    ctx.inputDir = path.dirname(path.resolve(ctx.personaPathOrObj));
    ctx.persona = JSON.parse(fs.readFileSync(ctx.personaPathOrObj, 'utf-8'));
  } else {
    // Deep-clone so asset path rewrites never mutate the caller's original object.
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

  // Validation runs on the RAW input (before normalization)
  validatePersona(persona);

  // Flatten new grouped soul format to top-level fields; old flat format is a no-op
  normalizeSoulInput(persona);

  // persona.rhythm.heartbeat is the canonical path (v0.18+ grouped under Life Rhythm).
  // persona.heartbeat is the backward-compat flat path (P19 interim).
  persona._heartbeatConfig = persona.rhythm?.heartbeat || persona.heartbeat || null;

  // Deprecation: body.runtime.acn_gateway → social.acn.gateway
  if (persona.body?.runtime?.acn_gateway && !persona.social?.acn?.gateway) {
    process.stderr.write('[openpersona] deprecation: body.runtime.acn_gateway → social.acn.gateway\n');
  }

  // Deprecation: body.runtime.platform → body.runtime.framework
  if (persona.body?.runtime?.platform && !persona.body?.runtime?.framework) {
    process.stderr.write('[openpersona] deprecation: body.runtime.platform → body.runtime.framework\n');
  }

  // Deprecation: evolution.channels → evolution.sources
  if (persona.evolution?.channels && !persona.evolution?.sources) {
    process.stderr.write('[openpersona] deprecation: evolution.channels → evolution.sources\n');
  }

  ctx.evolutionEnabled = persona.evolution?.enabled === true;
}

/**
 * Phase 3 — Derive
 * Loads all raw material (faculties, economy aspect) and computes initial derived fields
 * on the persona object (backstory, facultySummary, skillContent, allowedTools, etc.).
 * Also classifies soft-ref faculties and evolution sources.
 */
async function derivePhase(ctx) {
  const { persona, inputDir } = ctx;

  const rawFaculties = persona.faculties || [];

  // Parse faculties: each entry must be { name: string, ...config }
  const facultyConfigs = {};  // name → config overrides (provider, voiceId, stability, etc.)
  const facultyNames = rawFaculties.map((entry) => {
    if (typeof entry !== 'object' || !entry.name) {
      throw new Error(`Invalid faculty entry: ${JSON.stringify(entry)} — must be { name: "...", ...config }`);
    }
    const { name, ...config } = entry;
    if (Object.keys(config).length > 0) {
      facultyConfigs[name] = config;
    }
    return name;
  });

  // Store configs on persona for installer to pick up
  if (Object.keys(facultyConfigs).length > 0) {
    persona.facultyConfigs = facultyConfigs;
  }

  // Body layer — detect soft-ref (declared with install but not locally available)
  const rawBody = persona.body || persona.embodiments?.[0] || null;
  ctx.softRefBody = rawBody && typeof rawBody === 'object' && rawBody.install
    ? { name: rawBody.name || 'body', install: rawBody.install }
    : null;

  // Load faculties — external ones (with install) may not exist locally yet
  for (let i = 0; i < facultyNames.length; i++) {
    const name = facultyNames[i];
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

  // Auto-activate economy aspect when economy.enabled is set but 'economy' is not in faculties.
  // Economy is a systemic concept (aspects/economy/), not a structural Faculty.
  if (persona.economy?.enabled === true && !facultyNames.includes('economy')) {
    const economyAspect = loadEconomy();
    if (economyAspect) {
      ctx.loadedFaculties.push(economyAspect);
    }
  }

  // Initial derived fields (depend on loadedFaculties; used by templates)
  persona.backstory = buildBackstory(persona);
  persona.facultySummary = buildFacultySummary(ctx.loadedFaculties);
  persona.skillContent = buildSkillContent(persona, ctx.loadedFaculties, inputDir);
  persona.description = persona.bio?.slice(0, 120) || `Persona: ${persona.personaName}`;
  persona.allowedTools = collectAllowedTools(persona, ctx.loadedFaculties);
  persona.allowedToolsStr = persona.allowedTools.join(' ');
  persona.creature = persona.creature ?? 'AI companion';
  persona.emoji = persona.emoji ?? '🤖';
  persona.vibe = persona.vibe ?? '';
  persona.avatar = persona.referenceImage || persona.avatar || '';
  persona.capabilitiesSection = persona.capabilities?.length
    ? persona.capabilities.map((c) => `- **${c}**`).join('\n')
    : '';
  persona.author = persona.author ?? 'openpersona';
  persona.version = persona.version ?? '0.1.0';

  // Compute softRefSources before computeDerivedFields (needed by SKILL.md template)
  const rawEvolutionSources = persona.evolution?.sources || persona.evolution?.channels || [];
  ctx.validEvolutionSources = rawEvolutionSources.filter((ch) => ch && typeof ch === 'object' && ch.name);
  ctx.softRefSources = ctx.validEvolutionSources.filter((ch) => !!ch.install);
}

/**
 * Phase 4 — Asset
 * Creates the output directory tree, copies local asset files (rewriting their paths
 * on the persona object), and writes the state-sync.js nerve fiber script.
 * Asset path rewriting MUST happen before templatePhase so rendered templates see
 * the correct ./assets/... relative paths.
 */
async function assetPhase(ctx) {
  const { persona, inputDir, outputDir } = ctx;

  await fs.ensureDir(outputDir);
  ctx.skillDir = path.join(outputDir, `persona-${persona.slug}`);
  ctx.soulDir = path.join(ctx.skillDir, 'soul');
  ctx.refsDir = path.join(ctx.skillDir, 'references');

  await fs.ensureDir(ctx.skillDir);
  await fs.ensureDir(path.join(ctx.skillDir, 'scripts'));

  // Copy local asset files into assets/ (referenceImage, body.appearance.avatar/model3d)
  // Directories are created on demand — only when there are actual files to copy.
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

  // Runtime state bridge — generated for every persona
  await fs.writeFile(path.join(ctx.skillDir, 'scripts', 'state-sync.js'), STATE_SYNC_SCRIPT);
}

/**
 * Phase 5 — Template
 * Resolves skills (local lookup, soft-ref detection), merges skill allowedTools into
 * persona, runs computeDerivedFields, then renders soul-injection.md and SKILL.md.
 */
async function templatePhase(ctx) {
  const { persona, loadedFaculties, softRefFaculties, softRefBody, softRefSources, evolutionEnabled } = ctx;

  const soulTpl = loadTemplate('soul-injection');
  const skillTpl = loadTemplate('skill');

  // Soul injection partials
  const SOUL_PARTIALS_DIR = path.join(TEMPLATES_DIR, 'soul', 'partials');
  ctx.soulPartials = {
    'soul-intro': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-intro.partial.md'), 'utf-8'),
    'soul-awareness-identity': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-identity.partial.md'), 'utf-8'),
    'soul-awareness-body': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-body.partial.md'), 'utf-8'),
    'soul-awareness-growth': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-awareness-growth.partial.md'), 'utf-8'),
    'soul-how-you-grow': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-how-you-grow.partial.md'), 'utf-8'),
    'soul-economy': fs.readFileSync(path.join(SOUL_PARTIALS_DIR, 'soul-economy.partial.md'), 'utf-8'),
  };

  // Skill layer — resolve before template rendering so soul-injection can reference soft-ref state
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
    if (isResolved) {
      status = 'resolved';
    } else if (hasInstall) {
      status = 'soft-ref';
    } else {
      status = 'inline-only';
    }

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

  // Collect allowed tools from skills with local definitions
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

  computeDerivedFields(persona, {
    loadedFaculties,
    softRefSkills: ctx.softRefSkills,
    softRefFaculties,
    softRefBody,
    softRefSources,
    evolutionEnabled,
    facultyNames: loadedFaculties.map((f) => f.name),
    activeSkillNames: ctx.activeSkillNames,
  });

  ctx.soulInjection = Mustache.render(soulTpl, persona, ctx.soulPartials);

  // Build faculty index for SKILL.md (summary table, not full content)
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

  // Body layer — build four-dimensional description for SKILL.md
  const rawBody = persona.body || persona.embodiments?.[0] || null;
  const { bodyDescription, hasInterfaceConfig, interfaceSignalPolicy, interfaceCommandPolicy } =
    buildBodySection(rawBody, ctx.softRefBody);

  ctx.bodyDescription = bodyDescription;
  persona.hasInterfaceConfig = hasInterfaceConfig;
  persona.interfaceSignalPolicy = interfaceSignalPolicy;
  persona.interfaceCommandPolicy = interfaceCommandPolicy;

  ctx.constitution = loadConstitution();
  ctx.skillMd = Mustache.render(skillTpl, {
    ...persona,
    constitutionVersion: ctx.constitution.version,
    bodyDescription,
    hasFaculties: ctx.facultyIndex.length > 0,
    facultyIndex: ctx.facultyIndex,
    hasSkills: ctx.activeSkills.length > 0,
    hasSkillTable: ctx.activeSkills.filter((s) => !s.hasContent).length > 0,
    skillEntries: ctx.activeSkills.filter((s) => !s.hasContent),
    skillBlocks: ctx.activeSkills.filter((s) => s.hasContent),
  });
}

/**
 * Phase 6 — Emit
 * Writes all output artifacts to the skill pack directory:
 * SKILL.md, soul/{injection,constitution,self-narrative}.md, references/,
 * faculty/skill resource files, soul/behavior-guide.md, persona.json,
 * agent-card.json, acn-config.json, state.json, economy/, .gitignore.
 */
async function emitPhase(ctx) {
  const { persona, skillDir, soulDir, refsDir, loadedFaculties, skillCache } = ctx;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), ctx.skillMd);

  // Soul layer artifacts
  await fs.ensureDir(soulDir);
  await fs.writeFile(path.join(soulDir, 'injection.md'), ctx.soulInjection);

  // Constitution — Soul layer artifact
  const constitutionOut = ctx.constitution.version
    ? `# OpenPersona Constitution (v${ctx.constitution.version})\n\n${ctx.constitution.content}`
    : ctx.constitution.content;
  if (constitutionOut.trim()) {
    await fs.writeFile(path.join(soulDir, 'constitution.md'), constitutionOut);
  }

  // Faculty docs — agent-facing references
  for (const f of loadedFaculties) {
    if (!f.skillRef && !f.skeleton && f.files?.includes('SKILL.md')) {
      await fs.ensureDir(refsDir);
      const content = readFacultySkillMd(f, persona);
      await fs.writeFile(path.join(refsDir, `${f.name}.md`), content);
    }
  }

  // Signal Protocol host-side implementation guide
  if (fs.existsSync(SIGNAL_PROTOCOL_PATH)) {
    await fs.ensureDir(refsDir);
    await fs.copy(SIGNAL_PROTOCOL_PATH, path.join(refsDir, 'SIGNAL-PROTOCOL.md'));
  }

  // Copy faculty resource files (skip SKILL.md — output separately under references/)
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

  // behaviorGuide file handling (before DERIVED_FIELDS cleanup):
  // - Inline string → write soul/behavior-guide.md, convert value to "file:" reference
  // - "file:" reference → copy source file to output soul/behavior-guide.md, keep path
  if (persona.behaviorGuide) {
    const behaviorGuideDest = path.join(skillDir, 'soul', 'behavior-guide.md');
    if (persona.behaviorGuide.startsWith('file:') && ctx.inputDir) {
      const src = path.resolve(ctx.inputDir, persona.behaviorGuide.slice(5));
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, behaviorGuideDest);
      }
    } else if (!persona.behaviorGuide.startsWith('file:')) {
      // Inline string → externalize to file
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

  // Merge facultyConfigs into defaults.env (rich faculty config → env var mapping)
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

  // agent-card.json — controlled by social.a2a.enabled (default: true)
  const { agentCard, agentCardSkills } = buildAgentCard(persona, loadedFaculties, ctx.activeSkills);
  if (persona.social?.a2a?.enabled !== false) {
    await fs.writeFile(path.join(skillDir, 'agent-card.json'), JSON.stringify(agentCard, null, 2));
  }

  // acn-config.json — controlled by social.acn.enabled (default: true)
  if (persona.social?.acn?.enabled !== false) {
    const acnConfig = buildAcnConfig(persona, agentCardSkills);
    await fs.writeFile(path.join(skillDir, 'acn-config.json'), JSON.stringify(acnConfig, null, 2));
  }

  // state.json — Body nervous system runtime state
  await writeStateFile(skillDir, persona);

  // soul/self-narrative.md — append-only growth log
  if (ctx.evolutionEnabled) {
    await writeSelfNarrative(soulDir, persona);
  }

  // economy/ files
  if (persona.hasEconomyFaculty) {
    const economyDir = path.join(skillDir, 'economy');
    await writeEconomyFiles(economyDir, persona);
  }

  // .gitignore — protect sensitive runtime files from accidental VCS commits
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
 * Runs the 6-phase generation pipeline via a shared GeneratorContext.
 *
 * @param {string|object} personaPathOrObj - Path to persona.json or inline persona object
 * @param {string} outputDir - Target output directory
 * @returns {{ persona: object, skillDir: string }}
 */
async function generate(personaPathOrObj, outputDir) {
  const ctx = createContext(personaPathOrObj, outputDir);
  await clonePhase(ctx);
  await validatePhase(ctx);
  await derivePhase(ctx);
  await assetPhase(ctx);
  await templatePhase(ctx);
  await emitPhase(ctx);
  return { persona: ctx.persona, skillDir: ctx.skillDir };
}

module.exports = {
  generate,
  // Pipeline primitives — exported for independent testing and third-party hooks
  createContext,
  clonePhase,
  validatePhase,
  derivePhase,
  assetPhase,
  templatePhase,
  emitPhase,
  // Utilities consumed by other modules
  loadFaculty,
  loadConstitution,
  BASE_ALLOWED_TOOLS,
};
