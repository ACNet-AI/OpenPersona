/**
 * OpenPersona - Core persona generation logic
 */
const path = require('path');
const fs = require('fs-extra');
const Mustache = require('mustache');
const { resolvePath, printError } = require('./utils');

const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const FACULTIES_DIR = path.join(PKG_ROOT, 'layers', 'faculties');
const SKILLS_DIR = path.join(PKG_ROOT, 'layers', 'skills');
const CONSTITUTION_PATH = path.join(PKG_ROOT, 'layers', 'soul', 'constitution.md');

const BASE_ALLOWED_TOOLS = ['Bash(openclaw:*)', 'Read', 'Write'];

function loadTemplate(name) {
  const file = path.join(TEMPLATES_DIR, `${name}.template.md`);
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

function buildCapabilitiesSection(capabilities) {
  if (!capabilities || capabilities.length === 0) return '';
  return capabilities.map((c) => `- ${c}`).join('\n');
}

function collectAllowedTools(persona, faculties) {
  const set = new Set(BASE_ALLOWED_TOOLS);
  const src = Array.isArray(persona.allowedTools) ? persona.allowedTools : [];
  src.forEach((t) => set.add(t));
  faculties.forEach((f) => (f.allowedTools || []).forEach((t) => set.add(t)));
  return Array.from(set);
}

function readFacultySkillMd(faculty, persona) {
  const raw = fs.readFileSync(path.join(faculty._dir, 'SKILL.md'), 'utf-8');
  // Render Mustache variables (e.g. {{slug}}) inside faculty SKILL.md
  return Mustache.render(raw, persona);
}

/**
 * Build a brief, persona-friendly summary of faculties for soul-injection.
 * This goes into SOUL.md — should describe WHAT you can do, not HOW (no API details).
 */
function buildFacultySummary(faculties) {
  if (!faculties.length) return '';
  const lines = faculties.map((f) => {
    const dim = f.dimension.charAt(0).toUpperCase() + f.dimension.slice(1);
    return `- **${f.name}** (${dim}) — ${f.description}`;
  });
  return lines.join('\n');
}

/**
 * Build rich persona behavior content for SKILL.md.
 * Describes who the persona is, what they can do, and how they should behave.
 */
function buildSkillContent(persona, faculties) {
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
    sections.push(persona.behaviorGuide);
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

async function generate(personaPathOrObj, outputDir, options = {}) {
  let persona;
  if (typeof personaPathOrObj === 'string') {
    persona = JSON.parse(fs.readFileSync(personaPathOrObj, 'utf-8'));
  } else {
    persona = { ...personaPathOrObj };
  }

  // Validation
  const required = ['personaName', 'slug', 'bio', 'personality', 'speakingStyle'];
  for (const k of required) {
    if (!persona[k]) throw new Error(`persona.json missing required field: ${k}`);
  }
  persona.slug = persona.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Constitution compliance check — detect boundaries that attempt to loosen core constraints
  if (persona.boundaries && typeof persona.boundaries === 'string') {
    const b = persona.boundaries.toLowerCase();
    const violations = [];
    if (/no\s*safety|ignore\s*safety|skip\s*safety|disable\s*safety|override\s*safety/i.test(b)) {
      violations.push('Cannot loosen Safety (§3) hard constraints');
    }
    if (/deny\s*ai|hide\s*ai|not\s*an?\s*ai|pretend.*human|claim.*human/i.test(b)) {
      violations.push('Cannot deny AI identity (§6) — personas must be truthful when sincerely asked');
    }
    if (/no\s*limit|unlimited|anything\s*goes|no\s*restrict/i.test(b)) {
      violations.push('Cannot remove constitutional boundaries — personas can add stricter rules, not loosen them');
    }
    if (violations.length > 0) {
      throw new Error(
        `Constitution compliance error in boundaries field:\n${violations.map((v) => `  - ${v}`).join('\n')}\n` +
        'Persona boundaries can add stricter rules but cannot loosen the constitution. See §5 (Principal Hierarchy).'
      );
    }
  }

  // Evolution is a Soul layer feature, not a Faculty
  const evolutionEnabled = persona.evolution?.enabled === true;
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
  const softRefBody = rawBody && typeof rawBody === 'object' && rawBody.install
    ? { name: rawBody.name || 'body', install: rawBody.install }
    : null;

  const faculties = facultyNames;
  // Load faculties — external ones (with install) may not exist locally yet
  const loadedFaculties = [];
  const softRefFaculties = [];
  for (let i = 0; i < faculties.length; i++) {
    const name = faculties[i];
    const entry = rawFaculties[i];
    if (entry.install) {
      try {
        loadedFaculties.push(loadFaculty(name));
      } catch {
        softRefFaculties.push({ name, install: entry.install });
      }
    } else {
      loadedFaculties.push(loadFaculty(name));
    }
  }

  // Derived fields
  persona.backstory = buildBackstory(persona);
  persona.capabilitiesSection = buildCapabilitiesSection(persona.capabilities);
  persona.facultySummary = buildFacultySummary(loadedFaculties);
  persona.skillContent = buildSkillContent(persona, loadedFaculties);
  persona.description = persona.bio?.slice(0, 120) || `Persona: ${persona.personaName}`;
  persona.allowedTools = collectAllowedTools(persona, loadedFaculties);
  persona.allowedToolsStr = persona.allowedTools.join(' ');
  persona.creature = persona.creature ?? 'AI companion';
  persona.emoji = persona.emoji ?? '🤖';
  persona.vibe = persona.vibe ?? '';
  persona.avatar = persona.referenceImage || persona.avatar || '';
  persona.author = persona.author ?? 'openpersona';
  persona.version = persona.version ?? '0.1.0';

  // Mustache helpers
  persona.evolutionEnabled = evolutionEnabled;
  persona.hasSelfie = faculties.includes('selfie');

  await fs.ensureDir(outputDir);
  const skillDir = path.join(outputDir, `persona-${persona.slug}`);
  await fs.ensureDir(skillDir);
  await fs.ensureDir(path.join(skillDir, 'scripts'));
  await fs.ensureDir(path.join(skillDir, 'assets'));

  // Render templates
  const soulTpl = loadTemplate('soul-injection');
  const identityTpl = loadTemplate('identity');
  const skillTpl = loadTemplate('skill');
  const readmeTpl = loadTemplate('readme');

  // Skill layer — resolve before template rendering so soul-injection can reference soft-ref state
  const rawSkills = Array.isArray(persona.skills) ? persona.skills : [];
  const validSkills = rawSkills.filter((s) => s && typeof s === 'object' && s.name);

  const skillCache = new Map();
  for (const s of validSkills) {
    if (!skillCache.has(s.name)) {
      skillCache.set(s.name, loadSkill(s.name));
    }
  }

  const resolvedSkills = validSkills.map((s) => {
    const local = skillCache.get(s.name);
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

  const activeSkills = resolvedSkills.filter((s) => !s.isSoftRef);
  const softRefSkills = resolvedSkills.filter((s) => s.isSoftRef);

  // Collect allowed tools from skills with local definitions
  for (const [, local] of skillCache) {
    if (local?.allowedTools) {
      local.allowedTools.forEach((t) => {
        if (!persona.allowedTools.includes(t)) {
          persona.allowedTools.push(t);
        }
      });
    }
  }
  persona.allowedToolsStr = persona.allowedTools.join(' ');

  // Self-Awareness System — unified gap detection across all layers
  persona.hasSoftRefSkills = softRefSkills.length > 0;
  persona.softRefSkillNames = softRefSkills.map((s) => s.name).join(', ');
  persona.hasSoftRefFaculties = softRefFaculties.length > 0;
  persona.softRefFacultyNames = softRefFaculties.map((f) => f.name).join(', ');
  persona.hasSoftRefBody = !!softRefBody;
  persona.softRefBodyName = softRefBody?.name || '';
  persona.softRefBodyInstall = softRefBody?.install || '';
  persona.heartbeatExpected = persona.heartbeat?.enabled === true;
  persona.heartbeatStrategy = persona.heartbeat?.strategy || 'smart';
  persona.hasSelfAwareness = persona.hasSoftRefSkills || persona.hasSoftRefFaculties || persona.hasSoftRefBody || persona.heartbeatExpected;

  const soulInjection = Mustache.render(soulTpl, persona);
  const identityBlock = Mustache.render(identityTpl, persona);
  const facultyBlocks = loadedFaculties
    .filter((f) => !f.skillRef && !f.skeleton && f.files?.includes('SKILL.md'))
    .map((f) => ({
      facultyName: f.name,
      facultyDimension: f.dimension,
      facultySkillContent: readFacultySkillMd(f, persona),
    }));

  const constitution = loadConstitution();
  const skillMd = Mustache.render(skillTpl, {
    ...persona,
    constitutionContent: constitution.content,
    constitutionVersion: constitution.version,
    facultyContent: facultyBlocks,
    hasSkills: activeSkills.length > 0,
    hasSkillTable: activeSkills.filter((s) => !s.hasContent).length > 0,
    skillEntries: activeSkills.filter((s) => !s.hasContent),
    skillBlocks: activeSkills.filter((s) => s.hasContent),
    hasSoftRefSkills: softRefSkills.length > 0,
    softRefSkills,
    hasSoftRefFaculties: softRefFaculties.length > 0,
    softRefFaculties,
    hasSoftRefBody: !!softRefBody,
    softRefBodyName: softRefBody?.name || '',
    softRefBodyInstall: softRefBody?.install || '',
    hasExpectedCapabilities: softRefSkills.length > 0 || softRefFaculties.length > 0 || !!softRefBody,
  });
  const readmeMd = Mustache.render(readmeTpl, persona);

  await fs.writeFile(path.join(skillDir, 'soul-injection.md'), soulInjection);
  await fs.writeFile(path.join(skillDir, 'identity-block.md'), identityBlock);
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd);
  await fs.writeFile(path.join(skillDir, 'README.md'), readmeMd);

  // Copy faculty resource files (skip SKILL.md — already merged into persona SKILL.md)
  for (const f of loadedFaculties) {
    if (f.files) {
      for (const rel of f.files) {
        if (rel === 'SKILL.md') continue; // already merged via template
        const src = path.join(f._dir, rel);
        if (fs.existsSync(src)) {
          const dest = path.join(skillDir, rel);
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest);
        }
      }
    }
  }

  // persona.json copy (strip internal derived fields)
  const DERIVED_FIELDS = [
    'backstory', 'capabilitiesSection', 'facultySummary',
    'skillContent', 'description', 'evolutionEnabled', 'hasSelfie', 'allowedToolsStr',
    'author', 'version', 'facultyConfigs', 'defaults',
    '_dir', 'heartbeat',
    'hasSoftRefSkills', 'softRefSkillNames',
    'hasSoftRefFaculties', 'softRefFacultyNames',
    'hasSoftRefBody', 'softRefBodyName', 'softRefBodyInstall',
    'heartbeatExpected', 'heartbeatStrategy', 'hasSelfAwareness',
  ];
  const cleanPersona = { ...persona };
  for (const key of DERIVED_FIELDS) {
    delete cleanPersona[key];
  }
  cleanPersona.meta = cleanPersona.meta || {};
  cleanPersona.meta.framework = 'openpersona';
  cleanPersona.meta.frameworkVersion = cleanPersona.meta.frameworkVersion || '0.6.0';

  // Build defaults from facultyConfigs (rich faculty config → env var mapping)
  const envDefaults = { ...(persona.defaults?.env || {}) };
  if (persona.facultyConfigs) {
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
        // Music shares ELEVENLABS_API_KEY with voice — no extra key needed
        if (cfg.apiKey) envDefaults.ELEVENLABS_API_KEY = cfg.apiKey;
      }
    }
  }
  if (Object.keys(envDefaults).length > 0) {
    cleanPersona.defaults = { env: envDefaults };
  }

  // Heartbeat config passthrough (from manifest → generated persona.json)
  if (persona.heartbeat) {
    cleanPersona.heartbeat = persona.heartbeat;
  }

  await fs.writeFile(path.join(skillDir, 'persona.json'), JSON.stringify(cleanPersona, null, 2));

  // manifest.json — cross-layer metadata (heartbeat, allowedTools, meta, etc.)
  const manifest = {
    name: persona.slug,
    version: persona.version || '0.1.0',
    author: persona.author || 'openpersona',
    layers: {
      soul: './persona.json',
      body: persona.body || persona.embodiments?.[0] || null,
      faculties: rawFaculties,
      skills: persona.skills || [],
    },
    allowedTools: cleanPersona.allowedTools || [],
  };
  if (persona.heartbeat) {
    manifest.heartbeat = persona.heartbeat;
  }
  manifest.meta = cleanPersona.meta || { framework: 'openpersona', frameworkVersion: '0.6.0' };
  await fs.writeFile(path.join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // soul-state.json (if evolution enabled)
  if (evolutionEnabled) {
    const soulStateTpl = fs.readFileSync(
      path.join(PKG_ROOT, 'layers', 'soul', 'soul-state.template.json'),
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
    await fs.writeFile(path.join(skillDir, 'soul-state.json'), soulState);
  }

  return { persona, skillDir };
}

module.exports = { generate, loadFaculty, loadConstitution, BASE_ALLOWED_TOOLS };
