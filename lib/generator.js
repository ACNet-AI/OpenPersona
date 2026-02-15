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

const BASE_ALLOWED_TOOLS = ['Bash(npm:*)', 'Bash(npx:*)', 'Bash(openclaw:*)', 'Read', 'Write'];

function loadTemplate(name) {
  const file = path.join(TEMPLATES_DIR, `${name}.template.md`);
  return fs.readFileSync(file, 'utf-8');
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

  // Ensure soul-evolution if evolution.enabled
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

  if (evolutionEnabled && !facultyNames.includes('soul-evolution')) {
    facultyNames.push('soul-evolution');
  }

  // Store configs on persona for installer to pick up
  if (Object.keys(facultyConfigs).length > 0) {
    persona.facultyConfigs = facultyConfigs;
  }

  const faculties = facultyNames;
  const loadedFaculties = faculties.map((name) => loadFaculty(name));

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

  const soulInjection = Mustache.render(soulTpl, persona);
  const identityBlock = Mustache.render(identityTpl, persona);
  const facultyBlocks = loadedFaculties
    .filter((f) => !f.skillRef && !f.skeleton && f.files?.includes('SKILL.md'))
    .map((f) => ({
      facultyName: f.name,
      facultyDimension: f.dimension,
      facultySkillContent: readFacultySkillMd(f, persona),
    }));

  const skillMd = Mustache.render(skillTpl, {
    ...persona,
    facultyContent: facultyBlocks,
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
  ];
  const cleanPersona = { ...persona };
  for (const key of DERIVED_FIELDS) {
    delete cleanPersona[key];
  }
  cleanPersona.meta = cleanPersona.meta || {};
  cleanPersona.meta.framework = 'openpersona';
  cleanPersona.meta.frameworkVersion = cleanPersona.meta.frameworkVersion || '0.2.0';

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
        if (cfg.apiKey) envDefaults.SUNO_API_KEY = cfg.apiKey;
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

  // soul-state.json (if evolution enabled)
  if (evolutionEnabled) {
    const soulStateTpl = fs.readFileSync(
      path.join(PKG_ROOT, 'layers', 'faculties', 'soul-evolution', 'soul-state.template.json'),
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

module.exports = { generate, loadFaculty, BASE_ALLOWED_TOOLS };
