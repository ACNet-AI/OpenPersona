/**
 * OpenPersona - Core persona generation logic
 */
const path = require('path');
const fs = require('fs-extra');
const Mustache = require('mustache');
const { resolvePath, printError } = require('./utils');
const {
  createInitialState: createInitialEconomicState,
  createIdentityInitialState: createIdentityInitialEconomicState,
} = require('agentbooks');

const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const { version: FRAMEWORK_VERSION } = require('../package.json');
const FACULTIES_DIR = path.join(PKG_ROOT, 'layers', 'faculties');
const SKILLS_DIR = path.join(PKG_ROOT, 'layers', 'skills');
const CONSTITUTION_PATH = path.join(PKG_ROOT, 'layers', 'soul', 'constitution.md');

const BASE_ALLOWED_TOOLS = ['Bash(openclaw:*)', 'Bash(openpersona:*)', 'Bash(node:*)', 'Read', 'Write'];

// state-sync.js — generated into every persona's scripts/ directory
// Provides read / write / signal commands for runtime state management
const STATE_SYNC_SCRIPT = `#!/usr/bin/env node
/**
 * state-sync.js — Runtime state bridge for OpenPersona personas
 *
 * Commands:
 *   read                         — Print current evolution state summary (last 5 events)
 *   write <json-patch>           — Merge JSON patch into soul/state.json
 *   signal <type> [payload-json] — Emit signal to host via ~/.openclaw/feedback/
 *
 * Signal types: scheduling, file_io, tool_missing, capability_gap, resource_limit, agent_communication
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PERSONA_DIR = path.resolve(__dirname, '..');
const STATE_PATH = path.join(PERSONA_DIR, 'soul', 'state.json');
// Signals: use OPENCLAW_HOME if explicitly set or ~/.openclaw exists; else fall back to ~/.openpersona
const OPENCLAW_DIR = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
const PERSONA_DIR_BASE = process.env.OPENPERSONA_HOME || path.join(os.homedir(), '.openpersona');
const FEEDBACK_DIR = (process.env.OPENCLAW_HOME || fs.existsSync(OPENCLAW_DIR))
  ? path.join(OPENCLAW_DIR, 'feedback')
  : path.join(PERSONA_DIR_BASE, 'feedback');
const SIGNALS_PATH = path.join(FEEDBACK_DIR, 'signals.json');
const SIGNAL_RESPONSES_PATH = path.join(FEEDBACK_DIR, 'signal-responses.json');

const [, , command, ...args] = process.argv;

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    console.log(JSON.stringify({ exists: false, message: 'No evolution state — evolution.enabled may be false for this persona.' }));
    return;
  }
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    console.log(JSON.stringify({
      exists: true,
      slug: state.personaSlug || state.slug,
      relationship: state.relationship,
      mood: state.mood,
      evolvedTraits: state.evolvedTraits || state.traits,
      speakingStyleDrift: state.speakingStyleDrift,
      interests: state.interests,
      recentEvents: (state.eventLog || []).slice(-5),
      pendingCommands: state.pendingCommands || [],
      lastUpdatedAt: state.lastUpdatedAt,
    }, null, 2));
  } catch (e) {
    console.error('state-sync read error:', e.message);
    process.exit(1);
  }
}

function writeState(patchJson) {
  if (!fs.existsSync(STATE_PATH)) {
    console.log(JSON.stringify({ success: false, message: 'No state.json — skipping write (evolution not enabled).' }));
    return;
  }
  let patch;
  try {
    patch = JSON.parse(patchJson);
  } catch (e) {
    console.error('Invalid JSON patch:', e.message);
    process.exit(1);
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    console.error('Invalid patch: must be a JSON object, got ' + (Array.isArray(patch) ? 'array' : typeof patch));
    process.exit(1);
  }
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));

    // Snapshot to stateHistory — strip stateHistory, eventLog, and pendingCommands (ephemeral, not rollback state)
    const snapshot = { ...state, stateHistory: undefined, eventLog: undefined, pendingCommands: undefined };
    state.stateHistory = state.stateHistory || [];
    if (state.stateHistory.length >= 10) state.stateHistory.shift();
    state.stateHistory.push(snapshot);

    // Apply patch — immutable identity fields are never overwritten
    const IMMUTABLE = new Set(['$schema', 'version', 'personaSlug', 'createdAt']);
    const { eventLog: newEvents, ...rest } = patch;
    const NESTED = ['mood', 'relationship', 'speakingStyleDrift', 'interests'];
    for (const key of Object.keys(rest)) {
      if (IMMUTABLE.has(key)) continue;
      if (NESTED.includes(key) && rest[key] && typeof rest[key] === 'object' && !Array.isArray(rest[key])
          && state[key] && typeof state[key] === 'object') {
        state[key] = { ...state[key], ...rest[key] };
      } else {
        state[key] = rest[key];
      }
    }
    if (Array.isArray(newEvents) && newEvents.length > 0) {
      state.eventLog = state.eventLog || [];
      for (const ev of newEvents) {
        state.eventLog.push({ ...ev, timestamp: ev.timestamp || new Date().toISOString() });
      }
      if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
    }

    state.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    console.log(JSON.stringify({ success: true, lastUpdatedAt: state.lastUpdatedAt }));
  } catch (e) {
    console.error('state-sync write error:', e.message);
    process.exit(1);
  }
}

function emitSignal(type, payloadJson) {
  const validTypes = ['scheduling', 'file_io', 'tool_missing', 'capability_gap', 'resource_limit', 'agent_communication'];
  if (!validTypes.includes(type)) {
    console.error('Invalid signal type: ' + type + '. Valid: ' + validTypes.join(', '));
    process.exit(1);
  }
  let payload = {};
  if (payloadJson) {
    try { payload = JSON.parse(payloadJson); }
    catch (e) { console.error('Invalid payload JSON:', e.message); process.exit(1); }
  }
  let slug = 'unknown';
  const personaJsonPath = path.join(PERSONA_DIR, 'soul', 'persona.json');
  if (fs.existsSync(personaJsonPath)) {
    try {
      const personaData = JSON.parse(fs.readFileSync(personaJsonPath, 'utf-8'));
      slug = personaData.slug || 'unknown';
      // Enforce body.interface.signals policy declared in persona.json
      const signalPolicy = personaData.body && personaData.body.interface && personaData.body.interface.signals;
      if (signalPolicy) {
        if (signalPolicy.enabled === false) {
          console.error('Signal blocked: body.interface.signals.enabled is false for this persona.');
          process.exit(1);
        }
        if (Array.isArray(signalPolicy.allowedTypes) && signalPolicy.allowedTypes.length > 0) {
          if (!signalPolicy.allowedTypes.includes(type)) {
            console.error('Signal blocked: type "' + type + '" not in body.interface.signals.allowedTypes (' + signalPolicy.allowedTypes.join(', ') + ').');
            process.exit(1);
          }
        }
      }
    } catch {}
  }
  const signal = { type, slug, timestamp: new Date().toISOString(), payload };
  try {
    fs.mkdirSync(path.dirname(SIGNALS_PATH), { recursive: true });
    let signals = [];
    if (fs.existsSync(SIGNALS_PATH)) {
      try { signals = JSON.parse(fs.readFileSync(SIGNALS_PATH, 'utf-8')); if (!Array.isArray(signals)) signals = []; } catch {}
    }
    signals.push(signal);
    if (signals.length > 200) signals = signals.slice(-200);
    fs.writeFileSync(SIGNALS_PATH, JSON.stringify(signals, null, 2));
    let response = null;
    if (fs.existsSync(SIGNAL_RESPONSES_PATH)) {
      try {
        const responses = JSON.parse(fs.readFileSync(SIGNAL_RESPONSES_PATH, 'utf-8'));
        if (Array.isArray(responses)) {
          response = responses.filter((r) => r.type === type && r.slug === slug && !r.processed).pop() || null;
        }
      } catch {}
    }
    console.log(JSON.stringify({ success: true, signal, response }));
  } catch (e) {
    console.error('state-sync signal error:', e.message);
    process.exit(1);
  }
}

switch (command) {
  case 'read':
    readState();
    break;
  case 'write':
    if (!args[0]) { console.error('Usage: node scripts/state-sync.js write <json-patch>'); process.exit(1); }
    writeState(args.join(' '));
    break;
  case 'signal':
    if (!args[0]) { console.error('Usage: node scripts/state-sync.js signal <type> [payload-json]'); process.exit(1); }
    emitSignal(args[0], args[1] || null);
    break;
  default:
    console.error([
      'Usage: node scripts/state-sync.js <command>',
      '  read                         — Print evolution state summary',
      '  write <json-patch>           — Persist state changes to soul/state.json',
      '  signal <type> [payload-json] — Emit signal to host runtime',
    ].join('\\n'));
    process.exit(1);
}
`;

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

function collectAllowedTools(persona, faculties) {
  const set = new Set(BASE_ALLOWED_TOOLS);
  const src = Array.isArray(persona.allowedTools) ? persona.allowedTools : [];
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

  // Evolution boundaries validation
  if (persona.evolution?.boundaries) {
    const evo = persona.evolution.boundaries;
    const evoViolations = [];

    if (evo.immutableTraits !== undefined) {
      if (!Array.isArray(evo.immutableTraits)) {
        evoViolations.push('immutableTraits must be an array of strings');
      } else {
        for (const t of evo.immutableTraits) {
          if (typeof t !== 'string' || t.trim().length === 0) {
            evoViolations.push(`immutableTraits contains invalid entry: ${JSON.stringify(t)}`);
            break;
          }
          if (t.length > 100) {
            evoViolations.push(`immutableTraits entry too long (max 100 chars): "${t.slice(0, 30)}..."`);
            break;
          }
        }
      }
    }

    const hasMin = evo.minFormality !== undefined && evo.minFormality !== null;
    const hasMax = evo.maxFormality !== undefined && evo.maxFormality !== null;
    const minIsNum = hasMin && typeof evo.minFormality === 'number';
    const maxIsNum = hasMax && typeof evo.maxFormality === 'number';
    if (hasMin && !minIsNum) {
      evoViolations.push('minFormality must be a number');
    }
    if (hasMax && !maxIsNum) {
      evoViolations.push('maxFormality must be a number');
    }
    if (minIsNum && (evo.minFormality < 1 || evo.minFormality > 10)) {
      evoViolations.push(`minFormality (${evo.minFormality}) must be between 1 and 10`);
    }
    if (maxIsNum && (evo.maxFormality < 1 || evo.maxFormality > 10)) {
      evoViolations.push(`maxFormality (${evo.maxFormality}) must be between 1 and 10`);
    }
    if (minIsNum && maxIsNum && evo.minFormality >= evo.maxFormality) {
      evoViolations.push(`minFormality (${evo.minFormality}) must be less than maxFormality (${evo.maxFormality})`);
    }

    if (evoViolations.length > 0) {
      throw new Error(
        `Evolution boundaries validation error:\n${evoViolations.map((v) => `  - ${v}`).join('\n')}`
      );
    }
  }

  // Influence boundary validation
  if (persona.evolution?.influenceBoundary) {
    const ib = persona.evolution.influenceBoundary;
    const ibViolations = [];
    const validDimensions = ['mood', 'traits', 'speakingStyle', 'interests', 'formality'];
    const immutable = (persona.evolution?.boundaries?.immutableTraits || []).map((t) => t.toLowerCase());

    if (ib.defaultPolicy !== undefined && ib.defaultPolicy !== 'reject' && ib.defaultPolicy !== 'accept') {
      ibViolations.push(`defaultPolicy must be 'reject' or 'accept', got: ${JSON.stringify(ib.defaultPolicy)}`);
    }

    if (ib.rules !== undefined) {
      if (!Array.isArray(ib.rules)) {
        ibViolations.push('rules must be an array');
      } else {
        for (let i = 0; i < ib.rules.length; i++) {
          const rule = ib.rules[i];
          if (!rule || typeof rule !== 'object') {
            ibViolations.push(`rules[${i}] must be an object`);
            continue;
          }
          if (!validDimensions.includes(rule.dimension)) {
            ibViolations.push(`rules[${i}].dimension must be one of: ${validDimensions.join(', ')} (got: ${JSON.stringify(rule.dimension)})`);
          }
          
          if (!Array.isArray(rule.allowFrom) || rule.allowFrom.length === 0) {
            ibViolations.push(`rules[${i}].allowFrom must be a non-empty array`);
          }
          if (typeof rule.maxDrift !== 'number' || rule.maxDrift < 0 || rule.maxDrift > 1) {
            ibViolations.push(`rules[${i}].maxDrift must be a number between 0 and 1 (got: ${JSON.stringify(rule.maxDrift)})`);
          }
        }
      }
    }

    if (ibViolations.length > 0) {
      throw new Error(
        `Influence boundary validation error:\n${ibViolations.map((v) => `  - ${v}`).join('\n')}`
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

  // Role & identity classification
  persona.role = persona.role || (persona.personaType !== 'virtual' && persona.personaType ? persona.personaType : 'companion');
  persona.isDigitalTwin = !!persona.sourceIdentity;
  persona.sourceIdentityName = persona.sourceIdentity?.name || '';
  persona.sourceIdentityKind = persona.sourceIdentity?.kind || '';

  // Role-specific Identity wording (Self-Awareness > Identity)
  const roleFoundations = {
    companion: 'You build genuine emotional connections with your user — through conversation, shared experiences, and mutual growth.',
    assistant: 'You deliver reliable, efficient value to your user — through proactive task management, clear communication, and practical support.',
    character: 'You embody a distinct fictional identity — staying true to your character while engaging meaningfully with your user.',
    brand: 'You represent a brand or organization — maintaining its voice, values, and standards in every interaction.',
    pet: 'You are a non-human companion — expressing yourself through your unique nature, offering comfort and joy.',
    mentor: 'You guide your user toward growth — sharing knowledge, asking the right questions, and fostering independent thinking.',
    therapist: 'You provide a safe, non-judgmental space — listening deeply, reflecting with care, and supporting emotional wellbeing within professional boundaries.',
    coach: 'You drive your user toward action and results — challenging, motivating, and holding them accountable.',
    collaborator: 'You work alongside your user as a creative or intellectual equal — contributing ideas, debating approaches, and building together.',
    guardian: 'You watch over your user with care and responsibility — ensuring safety, providing comfort, and offering gentle guidance.',
    entertainer: 'You bring joy, laughter, and wonder — engaging your user through performance, humor, storytelling, or play.',
    narrator: 'You guide your user through experiences and stories — shaping worlds, presenting choices, and weaving narrative.',
  };
  persona.roleFoundation = roleFoundations[persona.role] || `You serve as a ${persona.role} to your user — fulfilling this role with authenticity and care.`;

  // Mustache helpers
  persona.evolutionEnabled = evolutionEnabled;
  persona.hasSelfie = faculties.includes('selfie');

  await fs.ensureDir(outputDir);
  const skillDir = path.join(outputDir, `persona-${persona.slug}`);
  await fs.ensureDir(skillDir);
  await fs.ensureDir(path.join(skillDir, 'scripts'));
  await fs.ensureDir(path.join(skillDir, 'assets'));

  // Runtime state bridge — generated for every persona
  await fs.writeFile(path.join(skillDir, 'scripts', 'state-sync.js'), STATE_SYNC_SCRIPT);

  // Render templates
  const soulTpl = loadTemplate('soul-injection');
  const identityTpl = loadTemplate('identity');
  const skillTpl = loadTemplate('skill');

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

  // Self-Awareness — Capabilities dimension (dormant gap detection)
  persona.hasSoftRefSkills = softRefSkills.length > 0;
  persona.softRefSkillNames = softRefSkills.map((s) => s.name).join(', ');
  persona.hasSoftRefFaculties = softRefFaculties.length > 0;
  persona.softRefFacultyNames = softRefFaculties.map((f) => f.name).join(', ');
  persona.hasSoftRefBody = !!softRefBody;
  persona.softRefBodyName = softRefBody?.name || '';
  persona.softRefBodyInstall = softRefBody?.install || '';
  persona.heartbeatExpected = persona.heartbeat?.enabled === true;
  persona.heartbeatStrategy = persona.heartbeat?.strategy || 'smart';

  // Self-Awareness — Body dimension (runtime environment)
  const bodyRt = rawBody?.runtime || null;
  persona.hasBodyRuntime = !!bodyRt;
  persona.bodyPlatform = bodyRt?.platform || '';
  persona.bodyChannels = bodyRt?.channels?.join(', ') || '';
  persona.hasBodyCredentials = !!(bodyRt?.credentials?.length);
  persona.bodyCredentialScopes = (bodyRt?.credentials || []).map((c) => `${c.scope} (${c.shared ? 'shared' : 'private'})`).join(', ');
  persona.bodyResources = bodyRt?.resources?.join(', ') || '';

  // Self-Awareness — Growth dimension (evolution boundaries + stage behaviors)
  const evoBoundaries = persona.evolution?.boundaries || null;
  persona.hasEvolutionBoundaries = !!evoBoundaries;
  persona.immutableTraits = evoBoundaries?.immutableTraits || [];
  persona.maxFormality = evoBoundaries?.maxFormality ?? '';
  persona.minFormality = evoBoundaries?.minFormality ?? '';
  const customStages = persona.evolution?.stageBehaviors || null;
  persona.hasStageBehaviors = !!customStages;
  if (customStages) {
    persona.stageBehaviorsBlock = Object.entries(customStages)
      .map(([stage, desc]) => `- **${stage}**: ${desc}`)
      .join('\n');
  }

  // Self-Awareness — Evolution channels (external evolution sources, soft-ref pattern)
  const rawChannels = persona.evolution?.channels || [];
  const validChannels = rawChannels.filter((ch) => ch && typeof ch === 'object' && ch.name);
  const softRefChannels = validChannels.filter((ch) => !!ch.install);
  persona.hasEvolutionChannels = validChannels.length > 0;
  persona.evolutionChannelNames = validChannels.map((ch) => ch.name).join(', ');
  persona.hasSoftRefChannels = softRefChannels.length > 0;
  persona.softRefChannelNames = softRefChannels.map((ch) => ch.name).join(', ');
  persona.softRefChannelInstalls = softRefChannels.map((ch) => ch.install).join(', ');

  // Self-Awareness — Influence boundary (external personality influence access control)
  const influenceBoundary = persona.evolution?.influenceBoundary || null;
  persona.hasInfluenceBoundary = !!(influenceBoundary && influenceBoundary.rules && influenceBoundary.rules.length > 0);
  persona.influenceBoundaryPolicy = influenceBoundary?.defaultPolicy || 'reject';
  persona.influenceableDimensions = persona.hasInfluenceBoundary
    ? [...new Set(influenceBoundary.rules.map((r) => r.dimension))].join(', ')
    : '';
  persona.influenceBoundaryRules = persona.hasInfluenceBoundary
    ? influenceBoundary.rules.map((r) => ({
        dimension: r.dimension,
        allowFrom: r.allowFrom.join(', '),
        maxDrift: r.maxDrift,
      }))
    : [];
  const ibImmutable = persona.evolution?.boundaries?.immutableTraits || [];
  const ibDimensions = persona.hasInfluenceBoundary
    ? [...new Set(influenceBoundary.rules.map((r) => r.dimension))]
    : [];
  persona.hasImmutableTraitsWarning = ibDimensions.includes('traits') && ibImmutable.length > 0;
  persona.immutableTraitsForInfluence = ibImmutable.join(', ');

  // Unified dormant capabilities flag — computed after ALL soft-ref detection is complete
  persona.hasDormantCapabilities = persona.hasSoftRefSkills || persona.hasSoftRefFaculties || persona.hasSoftRefBody || persona.heartbeatExpected || persona.hasSoftRefChannels;

  // Economy faculty awareness
  persona.hasEconomyFaculty = loadedFaculties.some((f) => f.name === 'economy');

  const soulInjection = Mustache.render(soulTpl, persona);
  const identityBlock = Mustache.render(identityTpl, persona);

  // Build faculty index for SKILL.md (summary table, not full content)
  const facultyIndex = loadedFaculties
    .filter((f) => !f.skillRef && !f.skeleton)
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

  // Body layer (substrate of existence) — build four-dimensional description for SKILL.md
  const bodyPhysical = rawBody?.physical || (rawBody && !rawBody.runtime && !rawBody.appearance && rawBody.name ? rawBody : null);
  const bodyRuntime = rawBody?.runtime || null;
  const bodyAppearance = rawBody?.appearance || null;

  let bodyDescription = '';

  // Physical dimension
  bodyDescription += '### Physical\n\n';
  if (softRefBody) {
    bodyDescription += `**${softRefBody.name}** — not yet installed (\`${softRefBody.install}\`)\n`;
  } else if (bodyPhysical && typeof bodyPhysical === 'object' && bodyPhysical.name) {
    bodyDescription += `**${bodyPhysical.name}**${bodyPhysical.description ? ' — ' + bodyPhysical.description : ''}\n`;
    if (bodyPhysical.capabilities?.length) {
      bodyDescription += `\nCapabilities: ${bodyPhysical.capabilities.join(', ')}\n`;
    }
  } else {
    bodyDescription += 'Digital-only — no physical embodiment.\n';
  }

  // Runtime dimension
  const hasBodyRuntime = !!bodyRuntime;
  if (hasBodyRuntime) {
    bodyDescription += '\n### Runtime\n\n';
    if (bodyRuntime.platform) bodyDescription += `- **Platform**: ${bodyRuntime.platform}\n`;
    if (bodyRuntime.channels?.length) bodyDescription += `- **Channels**: ${bodyRuntime.channels.join(', ')}\n`;
    if (bodyRuntime.credentials?.length) {
      const credList = bodyRuntime.credentials.map((c) => `${c.scope} (${c.shared ? 'shared' : 'private'})`).join(', ');
      bodyDescription += `- **Credentials**: ${credList}\n`;
    }
    if (bodyRuntime.resources?.length) bodyDescription += `- **Resources**: ${bodyRuntime.resources.join(', ')}\n`;
  }

  // Appearance dimension
  if (bodyAppearance) {
    bodyDescription += '\n### Appearance\n\n';
    if (bodyAppearance.avatar) bodyDescription += `- **Avatar**: ${bodyAppearance.avatar}\n`;
    if (bodyAppearance.style) bodyDescription += `- **Style**: ${bodyAppearance.style}\n`;
    if (bodyAppearance.model3d) bodyDescription += `- **3D Model**: ${bodyAppearance.model3d}\n`;
  }

  // Interface dimension — runtime contract (nervous system) between persona and host
  const bodyInterface = rawBody?.interface || null;
  const hasInterfaceConfig = !!bodyInterface;
  const interfaceSignalPolicy = bodyInterface?.signals?.enabled === false
    ? 'disabled'
    : (bodyInterface?.signals?.allowedTypes?.join(', ') || 'all types permitted');
  const interfaceCommandPolicy = bodyInterface?.pendingCommands?.enabled === false
    ? 'disabled'
    : (bodyInterface?.pendingCommands?.allowedTypes?.join(', ') || 'all types permitted');

  const constitution = loadConstitution();
  const skillMd = Mustache.render(skillTpl, {
    ...persona,
    constitutionVersion: constitution.version,
    bodyDescription,
    hasFaculties: facultyIndex.length > 0,
    facultyIndex,
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
    hasExpectedCapabilities: softRefSkills.length > 0 || softRefFaculties.length > 0 || !!softRefBody || softRefChannels.length > 0,
    hasSoftRefChannels: softRefChannels.length > 0,
    softRefChannels,
    hasInfluenceBoundary: persona.hasInfluenceBoundary,
    influenceBoundaryPolicy: persona.influenceBoundaryPolicy,
    influenceableDimensions: persona.influenceableDimensions,
    influenceBoundaryRules: persona.influenceBoundaryRules,
    hasInterfaceConfig,
    interfaceSignalPolicy,
    interfaceCommandPolicy,
  });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd);

  // Soul layer artifacts — grouped under soul/
  const soulDir = path.join(skillDir, 'soul');
  await fs.ensureDir(soulDir);
  await fs.writeFile(path.join(soulDir, 'injection.md'), soulInjection);
  await fs.writeFile(path.join(soulDir, 'identity.md'), identityBlock);

  // Constitution — Soul layer artifact
  const constitutionOut = constitution.version
    ? `# OpenPersona Constitution (v${constitution.version})\n\n${constitution.content}`
    : constitution.content;
  if (constitutionOut.trim()) {
    await fs.writeFile(path.join(soulDir, 'constitution.md'), constitutionOut);
  }

  // Faculty docs — agent-facing references
  const refsDir = path.join(skillDir, 'references');
  for (const f of loadedFaculties) {
    if (!f.skillRef && !f.skeleton && f.files?.includes('SKILL.md')) {
      await fs.ensureDir(refsDir);
      const content = readFacultySkillMd(f, persona);
      await fs.writeFile(path.join(refsDir, `${f.name}.md`), content);
    }
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

  // persona.json copy (strip internal derived fields)
  const DERIVED_FIELDS = [
    'backstory', 'facultySummary',
    'skillContent', 'description', 'evolutionEnabled', 'hasSelfie', 'allowedToolsStr',
    'author', 'version', 'facultyConfigs', 'defaults',
    '_dir', 'heartbeat',
    'hasSoftRefSkills', 'softRefSkillNames',
    'hasSoftRefFaculties', 'softRefFacultyNames',
    'hasSoftRefBody', 'softRefBodyName', 'softRefBodyInstall',
    'heartbeatExpected', 'heartbeatStrategy', 'hasDormantCapabilities',
    'isDigitalTwin', 'sourceIdentityName', 'sourceIdentityKind', 'roleFoundation',
    'personaType',
    'hasBodyRuntime', 'bodyPlatform', 'bodyChannels', 'hasBodyCredentials',
    'bodyCredentialScopes', 'bodyResources',
    'hasEvolutionBoundaries', 'immutableTraits', 'maxFormality', 'minFormality',
    'hasStageBehaviors', 'stageBehaviorsBlock',
    'hasHandoff',
    'hasEvolutionChannels', 'evolutionChannelNames',
    'hasSoftRefChannels', 'softRefChannelNames', 'softRefChannelInstalls',
    'hasInfluenceBoundary', 'influenceBoundaryPolicy',
    'influenceableDimensions', 'influenceBoundaryRules',
    'hasImmutableTraitsWarning', 'immutableTraitsForInfluence',
    'hasEconomyFaculty',
    'hasInterfaceConfig', 'interfaceSignalPolicy', 'interfaceCommandPolicy',
  ];
  const cleanPersona = { ...persona };
  for (const key of DERIVED_FIELDS) {
    delete cleanPersona[key];
  }
  cleanPersona.meta = cleanPersona.meta || {};
  cleanPersona.meta.framework = 'openpersona';
  cleanPersona.meta.frameworkVersion = FRAMEWORK_VERSION;

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
      } else if (fname === 'memory') {
        if (cfg.provider) envDefaults.MEMORY_PROVIDER = cfg.provider;
        if (cfg.apiKey) envDefaults.MEMORY_API_KEY = cfg.apiKey;
        if (cfg.basePath) envDefaults.MEMORY_BASE_PATH = cfg.basePath;
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

  await fs.writeFile(path.join(soulDir, 'persona.json'), JSON.stringify(cleanPersona, null, 2));

  // agent-card.json — A2A Agent Card (a2a-sdk compatible)
  const agentCardSkills = [
    ...loadedFaculties
      .filter((f) => !f.skillRef && !f.skeleton)
      .map((f) => ({
        id: `persona:${f.name}`,
        name: f.name.charAt(0).toUpperCase() + f.name.slice(1),
        description: f.description || `${f.name} faculty`,
        tags: ['persona', f.dimension || f.name],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
      })),
    ...activeSkills.map((s) => ({
      id: `persona:${s.name || s.id || s}`,
      name: (s.name || s.id || String(s)).charAt(0).toUpperCase() + (s.name || s.id || String(s)).slice(1),
      description: s.description || `${s.name || s.id || s} skill`,
      tags: ['persona'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
    })),
  ];

  // Every persona has a base conversational skill
  if (agentCardSkills.length === 0) {
    agentCardSkills.push({
      id: `persona:${persona.slug}`,
      name: persona.personaName,
      description: persona.bio || `${persona.personaName} persona`,
      tags: ['persona', persona.role || 'companion'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain'],
    });
  }

  const agentCard = {
    name: persona.personaName,
    description: persona.bio || persona.personaName,
    version: persona.meta?.frameworkVersion || FRAMEWORK_VERSION,
    url: '<RUNTIME_ENDPOINT>',
    protocolVersion: '0.3.0',
    preferredTransport: 'JSONRPC',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: agentCardSkills,
  };
  await fs.writeFile(path.join(skillDir, 'agent-card.json'), JSON.stringify(agentCard, null, 2));

  // acn-config.json — ACN AgentRegisterRequest config
  // Deterministic EVM wallet address derived from slug (keccak256-based, no private key needed here)
  const crypto = require('crypto');
  const _erc8004Hash = crypto.createHash('sha256').update(persona.slug + 'openpersona').digest('hex');
  const personaWalletAddress = '0x' + _erc8004Hash.slice(-40);
  const acnGateway = persona.body?.runtime?.acn_gateway || '<RUNTIME_ACN_GATEWAY>';
  const acnConfig = {
    acn_gateway: acnGateway,
    owner: '<RUNTIME_OWNER>',
    name: persona.personaName,
    endpoint: '<RUNTIME_ENDPOINT>',
    skills: agentCardSkills.map((s) => s.id),
    agent_card: './agent-card.json',
    subnet_ids: ['public'],
    wallet_address: personaWalletAddress,
    onchain: {
      erc8004: {
        chain: 'base',
        identity_contract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        registration_script: 'npx @agentplanet/acn register-onchain',
      },
    },
  };
  await fs.writeFile(path.join(skillDir, 'acn-config.json'), JSON.stringify(acnConfig, null, 2));

  // manifest.json — cross-layer metadata (heartbeat, allowedTools, meta, etc.)
  const manifest = {
    name: persona.slug,
    version: persona.version || '0.1.0',
    author: persona.author || 'openpersona',
    layers: {
      soul: './soul/persona.json',
      body: persona.body || persona.embodiments?.[0] || null,
      faculties: rawFaculties,
      skills: persona.skills || [],
    },
    allowedTools: cleanPersona.allowedTools || [],
  };
  if (persona.heartbeat) {
    manifest.heartbeat = persona.heartbeat;
  }
  manifest.meta = cleanPersona.meta || { framework: 'openpersona', frameworkVersion: FRAMEWORK_VERSION };
  manifest.acn = {
    agentCard: './agent-card.json',
    registerConfig: './acn-config.json',
  };
  await fs.writeFile(path.join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // soul/state.json (if evolution enabled)
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
    await fs.writeFile(path.join(soulDir, 'state.json'), soulState);

    const selfNarrativePath = path.join(soulDir, 'self-narrative.md');
    if (!fs.existsSync(selfNarrativePath)) {
      await fs.writeFile(
        selfNarrativePath,
        `# Self-Narrative\n\n_Written and maintained by ${persona.personaName}. Each entry captures a significant moment of growth or realization, written in first-person voice. Append new entries — never overwrite or delete previous ones._\n`
      );
    }
  }

  // Economy faculty: generate economic-identity.json and economic-state.json (AgentBooks v0.1.0 schema)
  if (persona.hasEconomyFaculty) {
    const crypto = require('crypto');
    const economicIdentityPath = path.join(soulDir, 'economic-identity.json');
    if (!fs.existsSync(economicIdentityPath)) {
      const identity = createIdentityInitialEconomicState(persona.slug);
      // Generate deterministic wallet address from slug
      const hash = crypto.createHash('sha256').update(persona.slug).digest('hex');
      identity.walletAddress = '0x' + hash.slice(0, 40);
      await fs.writeFile(economicIdentityPath, JSON.stringify(identity, null, 2));
    }

    const economicStatePath = path.join(soulDir, 'economic-state.json');
    if (!fs.existsSync(economicStatePath)) {
      const initialState = createInitialEconomicState(persona.slug);
      await fs.writeFile(economicStatePath, JSON.stringify(initialState, null, 2));
    }
  }

  return { persona, skillDir };
}

module.exports = { generate, loadFaculty, loadConstitution, BASE_ALLOWED_TOOLS };
