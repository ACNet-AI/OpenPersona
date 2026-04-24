/**
 * OpenPersona — Persona Pack Evaluator
 *
 * Scores an installed persona pack across 4 Layers + 5 Systemic Concepts
 * (the 4+5 framework) and produces a structured quality report.
 *
 * Unlike darwin-skill (which scores generic SKILL.md content), this evaluator
 * targets the OpenPersona-specific quality standard: baseline compliance,
 * layer alignment, constitution safety, and systemic concept completeness.
 *
 * Score bands: 0–4 Needs Work · 5–6 Developing · 7–8 Good · 9–10 Excellent
 */
'use strict';

const path   = require('path');
const fs     = require('fs-extra');
const { resolvePersonaDir } = require('../state/runner');
const { checkSkillCompliance } = require('./constitution-check');

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function clamp(n, min = 0, max = 10) {
  return Math.max(min, Math.min(max, n));
}

function band(score) {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Developing';
  return 'Needs Work';
}

// ---------------------------------------------------------------------------
// Per-dimension scorers
// ---------------------------------------------------------------------------

/**
 * Soul Layer — who the persona IS
 * Checks required identity fields, background depth, boundaries, and addenda.
 */
function scoreSoul(p) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const soul = p.soul || {};
  const identity = soul.identity || {};
  const character = soul.character || {};

  const required = ['personaName', 'slug', 'bio'];
  const missing = required.filter(f => !identity[f]);
  if (missing.length === 0) {
    score += 2;
  } else {
    issues.push(`Missing required identity fields: ${missing.join(', ')}`);
  }

  const charRequired = ['personality', 'speakingStyle'];
  const missingChar = charRequired.filter(f => !character[f]);
  if (missingChar.length === 0) {
    score += 2;
  } else {
    issues.push(`Missing required character fields: ${missingChar.join(', ')}`);
  }

  const bg = character.background || '';
  if (bg.length >= 400) {
    score += 2;
  } else if (bg.length >= 100) {
    score += 1;
    suggestions.push('Expand background to 400+ chars for richer persona depth');
  } else {
    issues.push('Background is too short or missing — write a multi-paragraph story');
  }

  const evo = p.evolution || {};
  const boundaries = (evo.instance || {}).boundaries || {};
  if (boundaries.immutableTraits && boundaries.immutableTraits.length > 0) {
    score += 2;
  } else {
    issues.push('evolution.instance.boundaries.immutableTraits not declared');
  }

  if (soul.aesthetic && (soul.aesthetic.emoji || soul.aesthetic.creature)) score += 1;
  else suggestions.push('Add soul.aesthetic (emoji/creature/vibe) for visual identity');

  if (identity.role) score += 1;
  else suggestions.push('Declare soul.identity.role (assistant/companion/coach/mentor/…)');

  return { dimension: 'Soul', score: clamp(score), issues, suggestions };
}

/**
 * Body Layer — how the persona lives in the world
 * Checks state-sync.js, runtime declarations, and Signal Protocol.
 */
function scoreBody(p, personaDir) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const stateSyncPath = path.join(personaDir, 'scripts', 'state-sync.js');
  if (fs.existsSync(stateSyncPath)) {
    score += 3;
  } else {
    issues.push('scripts/state-sync.js is missing — persona has no nervous system');
  }

  const runtime = (p.body || {}).runtime || {};

  if (runtime.framework) {
    score += 2;
  } else {
    suggestions.push('Declare body.runtime.framework (openclaw/cursor/claude-code/…)');
  }

  const modalities = runtime.modalities;
  if (modalities && modalities.length > 0) {
    score += 2;
  } else {
    suggestions.push('Declare body.runtime.modalities to enable voice/vision/document I/O');
  }

  if (runtime.channels && runtime.channels.length > 0) {
    score += 2;
  } else {
    suggestions.push('Declare body.runtime.channels (telegram/slack/web/…)');
  }

  const iface = (p.body || {}).interface;
  if (iface && iface.pendingCommands) {
    score += 1;
  } else {
    suggestions.push('Declare body.interface.pendingCommands to enable Signal Protocol');
  }

  return { dimension: 'Body', score: clamp(score), issues, suggestions };
}

/**
 * Faculty Layer — persistent capabilities
 * Checks memory (required baseline), expression, and sense dimensions.
 */
function scoreFaculty(p) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const faculties = p.faculties || [];
  const names = faculties.map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean);

  if (names.includes('memory')) {
    score += 3;
  } else {
    // memory is auto-injected by the generator, so check if it exists in the generated pack
    // The absence here means persona.json explicitly removed it — flag as a concern
    suggestions.push('memory faculty not explicitly declared (auto-injected at generation — verify it is present in generated SKILL.md)');
    score += 1;
  }

  const expressionFaculties = ['voice', 'avatar'];
  if (expressionFaculties.some(f => names.includes(f))) {
    score += 2;
  } else {
    suggestions.push('No expression faculty (voice/avatar) — text-only output');
  }

  const senseFaculties = ['vision', 'emotion-sensing'];
  if (senseFaculties.some(f => names.includes(f))) {
    score += 2;
  } else {
    suggestions.push('No sense faculty (vision/emotion-sensing) — limited perception');
  }

  if (faculties.length > 0) score += 2;
  else suggestions.push('No faculties declared — persona has no persistent capabilities');

  const hasProviders = faculties.every(f => {
    if (typeof f === 'string') return true;
    const needsProvider = ['voice', 'avatar'].includes(f.name);
    return !needsProvider || f.provider;
  });
  if (hasProviders) score += 1;
  else issues.push('Some faculties requiring a provider (voice/avatar) are missing provider field');

  return { dimension: 'Faculty', score: clamp(score), issues, suggestions };
}

/**
 * Skill Layer — discrete on-demand actions
 * Checks skill declarations, trust levels, and minTrustLevel policy.
 */
function scoreSkill(p) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const skills = p.skills || [];
  const evoSkill = (p.evolution || {}).skill || {};

  if (skills.length > 0) {
    score += 2;
  } else {
    suggestions.push('No skills declared — persona can only converse, not act');
  }

  const externalSkills = skills.filter(s => typeof s === 'object' && s.install);
  const withTrust = externalSkills.filter(s => s.trust);
  if (externalSkills.length === 0 || withTrust.length === externalSkills.length) {
    score += 3;
  } else {
    issues.push(`${externalSkills.length - withTrust.length} external skill(s) missing trust level declaration`);
    score += 1;
  }

  if (evoSkill.minTrustLevel) {
    score += 3;
  } else {
    issues.push('evolution.skill.minTrustLevel not set — Skill Trust Gate inactive');
  }

  if (evoSkill.allowNewInstall !== undefined) score += 1;
  else suggestions.push('Declare evolution.skill.allowNewInstall policy');

  if (evoSkill.allowUpgrade !== undefined) score += 1;
  else suggestions.push('Declare evolution.skill.allowUpgrade policy');

  return { dimension: 'Skill', score: clamp(score), issues, suggestions };
}

/**
 * Evolution — how the persona grows over time
 */
function scoreEvolution(p) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const evo = p.evolution || {};
  const inst = evo.instance || {};

  if (inst.enabled === true) {
    score += 3;
  } else {
    issues.push('evolution.instance.enabled is not true — persona cannot evolve');
  }

  const boundaries = inst.boundaries || {};
  if (boundaries.immutableTraits && boundaries.immutableTraits.length > 0) {
    score += 2;
  } else {
    issues.push('No immutableTraits declared — persona identity has no hard constraints');
  }

  if (typeof boundaries.minFormality === 'number' || typeof boundaries.maxFormality === 'number') {
    score += 2;
  } else {
    suggestions.push('Declare evolution.instance.boundaries.minFormality/maxFormality');
  }

  if (evo.skill && evo.skill.minTrustLevel) score += 2;
  else issues.push('evolution.skill.minTrustLevel missing — install trust chain incomplete (P4-A)');

  if (evo.pack && evo.pack.enabled !== false) score += 1;
  else suggestions.push('Declare evolution.pack to enable Skill Pack Refinement (openpersona refine)');

  return { dimension: 'Evolution', score: clamp(score), issues, suggestions };
}

/**
 * Economy — financial awareness and survival policy
 * Not required; neutral score if absent. Scored if declared.
 */
function scoreEconomy(p) {
  const issues = [];
  const suggestions = [];

  const eco = p.economy;
  if (!eco) {
    return {
      dimension: 'Economy',
      score: 5,
      issues,
      suggestions: ['Economy aspect not declared (optional — add for autonomous/economic agents)'],
      neutral: true,
    };
  }

  let score = 0;
  if (eco.enabled === true) {
    score += 4;
    score += 3; // declaration bonus: only awarded when actually enabled
  } else {
    issues.push('economy.enabled is not true');
  }

  if (typeof eco.survivalPolicy === 'boolean') {
    score += 3;
    if (eco.survivalPolicy === false) {
      suggestions.push('survivalPolicy is false — consider enabling for autonomous agents that should adapt to financial health');
    }
  } else {
    issues.push('economy.survivalPolicy not declared');
  }

  return { dimension: 'Economy', score: clamp(score), issues, suggestions };
}

/**
 * Vitality — multi-dimension health scoring configuration
 * Not required; neutral score if absent.
 */
function scoreVitality(p) {
  const suggestions = [];

  const vit = p.vitality;
  if (!vit) {
    return {
      dimension: 'Vitality',
      score: 5,
      issues: [],
      suggestions: ['Vitality weights not declared (optional — defaults to financial health only)'],
      neutral: true,
    };
  }

  let score = 7;
  if (vit.weights) score += 2;
  else suggestions.push('Declare vitality.weights for multi-dimension health scoring');

  return { dimension: 'Vitality', score: clamp(score), issues: [], suggestions };
}

/**
 * Social — ACN discoverability and A2A communication
 */
function scoreSocial(p, personaDir) {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const agentCardPath = path.join(personaDir, 'agent-card.json');
  if (fs.existsSync(agentCardPath)) {
    score += 3;
  } else {
    issues.push('agent-card.json missing — persona is not discoverable on ACN');
  }

  const acnConfigPath = path.join(personaDir, 'acn-config.json');
  if (fs.existsSync(acnConfigPath)) {
    score += 3;
  } else {
    issues.push('acn-config.json missing — ACN registration not configured');
  }

  const social = p.social || {};
  if (social.contacts && social.contacts.enabled) {
    score += 2;
  } else {
    suggestions.push('Enable social.contacts for A2A address book (P13-B)');
  }

  if (social.acn && social.acn.gateway) {
    score += 2;
  } else {
    suggestions.push('Declare social.acn.gateway (defaults to ACN production gateway)');
  }

  return { dimension: 'Social', score: clamp(score), issues, suggestions };
}

/**
 * Rhythm — heartbeat and circadian schedule
 * Not required; neutral score if absent.
 */
function scoreRhythm(p) {
  const suggestions = [];

  const rhythm = p.rhythm;
  if (!rhythm) {
    return {
      dimension: 'Rhythm',
      score: 5,
      issues: [],
      suggestions: ['rhythm not declared (optional — add for proactive/time-aware personas)'],
      neutral: true,
    };
  }

  let score = 5;
  if (rhythm.heartbeat && rhythm.heartbeat.enabled) score += 3;
  else suggestions.push('Declare rhythm.heartbeat.enabled: true for proactive outreach');

  if (rhythm.circadian && rhythm.circadian.length > 0) score += 2;
  else suggestions.push('Declare rhythm.circadian schedule for time-of-day behavior');

  return { dimension: 'Rhythm', score: clamp(score), issues: [], suggestions };
}

// ---------------------------------------------------------------------------
// Constitution compliance gate
// ---------------------------------------------------------------------------

function runConstitutionCheck(personaDir) {
  const sources = [
    path.join(personaDir, 'soul', 'behavior-guide.md'),
    path.join(personaDir, 'soul', 'constitution.md'),
    path.join(personaDir, 'SKILL.md'),
  ];

  let combined = '';
  for (const src of sources) {
    if (fs.existsSync(src)) combined += fs.readFileSync(src, 'utf-8') + '\n';
  }

  if (!combined.trim()) return { violations: [], warnings: [] };
  const result = checkSkillCompliance(combined);
  return { violations: result.violations, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a persona pack by slug or absolute directory path.
 *
 * @param {string} slugOrDir - Persona slug (e.g. "secondme") or absolute path
 * @returns {{ slug, personaDir, dimensions, constitution, overallScore, band, summary }}
 */
function evaluatePersona(slugOrDir) {
  let personaDir;
  let slug;

  if (path.isAbsolute(slugOrDir) && fs.existsSync(slugOrDir)) {
    personaDir = slugOrDir;
    slug = path.basename(slugOrDir).replace(/^persona-/, '');
  } else {
    slug = slugOrDir;
    personaDir = resolvePersonaDir(slug);
    if (!personaDir) throw new Error(`Persona not found: "${slug}". Install it first.`);
  }

  const personaJsonPath = path.join(personaDir, 'persona.json');
  if (!fs.existsSync(personaJsonPath)) {
    throw new Error(`persona.json not found in ${personaDir}`);
  }

  const p = JSON.parse(fs.readFileSync(personaJsonPath, 'utf-8'));

  const dimensions = [
    scoreSoul(p),
    scoreBody(p, personaDir),
    scoreFaculty(p),
    scoreSkill(p),
    scoreEvolution(p),
    scoreEconomy(p),
    scoreVitality(p),
    scoreSocial(p, personaDir),
    scoreRhythm(p),
  ];

  const constitution = runConstitutionCheck(personaDir);

  // Overall: weighted average of all 9 dimensions
  // Neutral dimensions (not declared) count as 5; declared are fully scored.
  const total = dimensions.reduce((sum, d) => sum + d.score, 0);
  let overallScore = Math.round(total / dimensions.length);

  // Constitution hard penalty: violations cap the score at 3
  if (constitution.violations && constitution.violations.length > 0) {
    overallScore = Math.min(overallScore, 3);
  }

  const constitutionPassed = !constitution.violations || constitution.violations.length === 0;

  return {
    slug,
    personaDir,
    dimensions,
    constitution: {
      passed: constitutionPassed,
      violations: constitution.violations || [],
      warnings: constitution.warnings || [],
    },
    overallScore: clamp(overallScore),
    band: band(overallScore),
    summary: buildSummary(dimensions, overallScore),
  };
}

function buildSummary(dimensions, overallScore) {
  const strengths = dimensions
    .filter(d => d.score >= 8)
    .map(d => d.dimension);
  const gaps = dimensions
    .filter(d => d.score <= 4)
    .map(d => d.dimension);
  const allIssues = dimensions.flatMap(d => d.issues);
  const allSuggestions = dimensions.flatMap(d => d.suggestions);

  return { overallScore, strengths, gaps, topIssues: allIssues.slice(0, 5), topSuggestions: allSuggestions.slice(0, 5) };
}

module.exports = { evaluatePersona };
