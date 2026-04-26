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
// Soul-field schema normaliser (W6 fix — schema bifurcation)
// ---------------------------------------------------------------------------
//
// The creator-facing INPUT schema (`schemas/persona.input.schema.json`,
// authoritative for v0.17+) groups soul fields under
// `soul.{identity, character, aesthetic}`. The generator then runs
// `normalizeSoulInput()` (lib/generator/index.js L59-63) which flattens
// those sub-objects to top level and `delete persona.soul`, so on-disk
// persona.json files use a FLAT schema with `personaName`, `personality`,
// `vibe`, etc. at the top level.
//
// The evaluator must read both, because:
//   - All real on-disk packs are flat (the canonical wire format).
//   - Some in-memory callers (tests, pre-flatten contributor flows) may
//     still pass the nested grouped structure.
//
// This mirrors the nested-first / flat-fallback pattern already used in
// `lib/lifecycle/refine.js` L86-89 — the convention is established
// elsewhere in the codebase; this helper just centralises it for the
// evaluator's five soul-reading sites (scoreSoul, extractEvaluableContent,
// evaluatePersona's role lookup).
function getSoulView(p) {
  const soul = p.soul || {};
  const identity  = soul.identity  || {};
  const character = soul.character || {};
  const aesthetic = soul.aesthetic || {};
  return {
    identity: {
      personaName: identity.personaName || p.personaName || null,
      slug:        identity.slug        || p.slug        || null,
      bio:         identity.bio         || p.bio         || null,
      role:        identity.role        || p.role        || null,
    },
    character: {
      personality:    character.personality    || p.personality    || null,
      speakingStyle:  character.speakingStyle  || p.speakingStyle  || null,
      background:     character.background     || p.background     || null,
      boundaries:     character.boundaries     || p.boundaries     || null,
    },
    aesthetic: {
      emoji:    aesthetic.emoji    || p.emoji    || null,
      creature: aesthetic.creature || p.creature || null,
      vibe:     aesthetic.vibe     || p.vibe     || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Role-aware profiles
// ---------------------------------------------------------------------------
//
// Each profile maps a dimension to a severity modifier:
//   - 'strict'  : that dimension is core to this role — suggestions escalate to
//                 issues, and the dimension's weight is doubled.
//   - 'lenient' : that dimension is peripheral for this role — some issues
//                 demote to suggestions (or disappear), and weight is halved.
//   - default   : 'normal' (unchanged).
//
// Roles not listed here fall back to an all-'normal' profile, so the evaluator
// is backward compatible with persona packs that omit `role` (read via
// `getSoulView()` — top-level on flat on-disk packs, `soul.identity.role`
// on pre-flatten nested input).

const ROLE_PROFILES = {
  // Dialog / companionship primary — Soul is what the persona IS,
  // Skills/Rhythm are often not needed.
  companion:    { soul: 'strict', skill: 'lenient', rhythm: 'lenient' },
  character:    { soul: 'strict', skill: 'lenient', rhythm: 'lenient' },
  pet:          { soul: 'strict', skill: 'lenient', rhythm: 'lenient', faculty: 'lenient' },
  narrator:     { soul: 'strict', skill: 'lenient', rhythm: 'lenient', social: 'lenient' },
  entertainer:  { soul: 'strict', skill: 'lenient' },

  // Professional / guidance — Soul AND Skill both matter;
  // coaching/mentoring often benefit from scheduled check-ins.
  therapist:    { soul: 'strict', skill: 'strict' },
  mentor:       { soul: 'strict', skill: 'strict', rhythm: 'strict' },
  coach:        { soul: 'strict', skill: 'strict', rhythm: 'strict' },

  // Task primary — Skill is core, Soul can be lighter.
  assistant:    { skill: 'strict' },
  collaborator: { skill: 'strict' },
  guardian:     { skill: 'strict' },

  // Brand / social presence — Social (ACN) is the product.
  brand:        { social: 'strict' },

  // Pure tool personas — no conversational soul needed,
  // everything flows through Skill actions.
  tool:         { soul: 'lenient', skill: 'strict', social: 'lenient', rhythm: 'lenient' },

  _default:     {},
};

const BASE_WEIGHTS = {
  Soul: 2, Body: 2,
  Faculty: 1, Skill: 1, Social: 1,
  Evolution: 0.5, Economy: 0.5, Vitality: 0.5, Rhythm: 0.5,
};

function getRoleProfile(role) {
  if (!role) return ROLE_PROFILES._default;
  const normalized = String(role).toLowerCase().trim();
  return ROLE_PROFILES[normalized] || ROLE_PROFILES._default;
}

function sevFor(profile, dim) {
  return (profile && profile[dim]) || 'normal';
}

/**
 * Build role-aware dimension weights.
 * strict doubles the base weight, lenient halves it.
 */
function getWeights(role) {
  const profile = getRoleProfile(role);
  const out = { ...BASE_WEIGHTS };
  for (const [dim, sev] of Object.entries(profile)) {
    const key = dim.charAt(0).toUpperCase() + dim.slice(1);
    if (!(key in out)) continue;
    if (sev === 'strict')  out[key] = out[key] * 2;
    if (sev === 'lenient') out[key] = out[key] * 0.5;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-dimension scorers
// ---------------------------------------------------------------------------

/**
 * Soul Layer — who the persona IS
 * Checks required identity fields, background depth, boundaries, and addenda.
 *
 * severity:
 *   strict  — aesthetic + longer background become hard requirements
 *   lenient — background threshold relaxed; aesthetic fully optional
 */
function scoreSoul(p, severity = 'normal') {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const view = getSoulView(p);
  const identity = view.identity;
  const character = view.character;

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
  // Role-aware background thresholds: strict roles (companions, characters)
  // need a richer inner life; lenient roles (tools) can describe themselves briefly.
  const [fullBar, partialBar] = severity === 'strict'  ? [600, 200]
                              : severity === 'lenient' ? [200, 50]
                              : [400, 100];
  if (bg.length >= fullBar) {
    score += 2;
  } else if (bg.length >= partialBar) {
    score += 1;
    suggestions.push(`Expand background to ${fullBar}+ chars for richer persona depth`);
  } else if (severity === 'lenient') {
    suggestions.push(`Background is short (<${partialBar} chars) — consider a brief description`);
  } else {
    issues.push(`Background is too short or missing (<${partialBar} chars) — write a multi-paragraph story`);
  }

  const evo = p.evolution || {};
  const boundaries = (evo.instance || {}).boundaries || {};
  if (boundaries.immutableTraits && boundaries.immutableTraits.length > 0) {
    score += 2;
  } else {
    issues.push('evolution.instance.boundaries.immutableTraits not declared');
  }

  const hasAesthetic = !!(view.aesthetic.emoji || view.aesthetic.creature);
  if (hasAesthetic) {
    score += 1;
  } else if (severity === 'strict') {
    // Applies to companion/character/pet/narrator/entertainer (dialog-primary)
    // AND therapist/mentor/coach (professional). All of these depend on Soul
    // depth, so a distinctive visual identity is expected — phrased role-agnostically.
    issues.push('Aesthetic identity (emoji/creature/vibe) missing — this role depends on Soul depth and needs a distinctive visual identity');
  } else if (severity !== 'lenient') {
    suggestions.push('Add aesthetic fields (emoji/creature/vibe) for visual identity');
  }

  if (identity.role) score += 1;
  else suggestions.push('Declare role (assistant/companion/coach/mentor/…)');

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
 *
 * severity:
 *   lenient — expression / sense faculties are not expected (e.g. pet personas);
 *             their absence neither reduces score nor produces suggestions.
 */
function scoreFaculty(p, severity = 'normal') {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const faculties = p.faculties || [];
  const names = faculties.map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean);

  if (names.includes('memory')) {
    score += 3;
  } else {
    suggestions.push('memory faculty not explicitly declared (auto-injected at generation — verify it is present in generated SKILL.md)');
    score += 1;
  }

  const expressionFaculties = ['voice', 'avatar'];
  const hasExpression = expressionFaculties.some(f => names.includes(f));
  if (hasExpression) {
    score += 2;
  } else if (severity === 'lenient') {
    // Expression faculties optional for this role — grant baseline credit
    // so absence does not drag the score down.
    score += 2;
  } else {
    suggestions.push('No expression faculty (voice/avatar) — text-only output');
  }

  const senseFaculties = ['vision', 'emotion-sensing'];
  const hasSense = senseFaculties.some(f => names.includes(f));
  if (hasSense) {
    score += 2;
  } else if (severity === 'lenient') {
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
 *
 * severity:
 *   strict  — "No skills declared" escalates to a hard issue;
 *             install/upgrade policy suggestions escalate to issues.
 *   lenient — dialog-primary personas (companion/character/pet) are not
 *             expected to declare skills; absence neither penalises nor
 *             produces a suggestion. minTrustLevel stays recommended but
 *             demotes to a suggestion rather than an issue.
 */
function scoreSkill(p, severity = 'normal') {
  const issues = [];
  const suggestions = [];
  let score = 0;

  const skills = p.skills || [];
  const evoSkill = (p.evolution || {}).skill || {};

  if (skills.length > 0) {
    score += 2;
  } else if (severity === 'strict') {
    issues.push('No skills declared — task-primary persona has no actions to perform');
  } else if (severity === 'lenient') {
    // Dialog-primary role: skills are optional, grant baseline credit
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

  // Lenient output policy for this dimension:
  //   minTrustLevel intentionally keeps a suggestion even on lenient roles
  //   with no declared skills — it is a SAFETY concept (the Skill Trust Gate),
  //   and users should learn about it before they ever add a skill. Other
  //   Skill fields follow the "silent on lenient" convention.

  if (evoSkill.minTrustLevel) {
    score += 3;
  } else if (severity === 'lenient' && skills.length === 0) {
    // Safety-related discoverability: keep the suggestion visible even
    // though this role is not expected to declare skills.
    suggestions.push('evolution.skill.minTrustLevel not set (optional for dialog-primary personas, but recommended if skills are ever added)');
    score += 2;
  } else {
    issues.push('evolution.skill.minTrustLevel not set — Skill Trust Gate inactive');
  }

  // allowNewInstall / allowUpgrade are optional policy declarations (defaults
  // apply when omitted). We deliberately DO NOT escalate them to hard issues
  // under strict roles — the "policy not declared" signal is not strong
  // enough to justify report noise. The score cost (no +1) is signal enough.
  if (evoSkill.allowNewInstall !== undefined) {
    score += 1;
  } else if (severity !== 'lenient') {
    suggestions.push('Declare evolution.skill.allowNewInstall policy');
  }

  if (evoSkill.allowUpgrade !== undefined) {
    score += 1;
  } else if (severity !== 'lenient') {
    suggestions.push('Declare evolution.skill.allowUpgrade policy');
  }

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
 *
 * severity:
 *   strict  — brand-like personas: contacts + gateway declarations escalate
 *             to hard issues.
 *   lenient — solo personas (narrator, tool): missing agent-card / acn-config
 *             demote to suggestions since the persona may intentionally run
 *             off-network.
 */
function scoreSocial(p, personaDir, severity = 'normal') {
  const issues = [];
  const suggestions = [];
  let score = 0;

  // Lenient output policy for this dimension:
  //   File-level artifacts (agent-card.json, acn-config.json) keep a
  //   suggestion on lenient — missing files are highly visible to users
  //   and the hint aids discoverability.
  //   Field-level toggles (contacts.enabled, acn.gateway) stay silent on
  //   lenient — repeating them as suggestions on every off-network persona
  //   adds noise without informational value.

  const agentCardPath = path.join(personaDir, 'agent-card.json');
  if (fs.existsSync(agentCardPath)) {
    score += 3;
  } else if (severity === 'lenient') {
    suggestions.push('agent-card.json missing (optional for off-network personas)');
    score += 2;
  } else {
    issues.push('agent-card.json missing — persona is not discoverable on ACN');
  }

  const acnConfigPath = path.join(personaDir, 'acn-config.json');
  if (fs.existsSync(acnConfigPath)) {
    score += 3;
  } else if (severity === 'lenient') {
    suggestions.push('acn-config.json missing (optional for off-network personas)');
    score += 2;
  } else {
    issues.push('acn-config.json missing — ACN registration not configured');
  }

  const social = p.social || {};
  if (social.contacts && social.contacts.enabled) {
    score += 2;
  } else if (severity === 'strict') {
    issues.push('social.contacts.enabled is false — social-primary persona needs address book (P13-B)');
  } else if (severity === 'lenient') {
    // Silent: field-level toggle, not worth nagging off-network personas about.
    score += 2;
  } else {
    suggestions.push('Enable social.contacts for A2A address book (P13-B)');
  }

  if (social.acn && social.acn.gateway) {
    score += 2;
  } else if (severity === 'strict') {
    issues.push('social.acn.gateway not declared — social-primary persona must pin gateway');
  } else if (severity === 'lenient') {
    // Silent: see lenient output policy above.
    score += 2;
  } else {
    suggestions.push('Declare social.acn.gateway (defaults to ACN production gateway)');
  }

  return { dimension: 'Social', score: clamp(score), issues, suggestions };
}

/**
 * Rhythm — heartbeat and circadian schedule
 * Not required by default; neutral score if absent.
 *
 * severity:
 *   strict  — mentor/coach style roles: rhythm declaration is expected,
 *             absence becomes a hard issue.
 *   lenient — dialog-primary roles: rhythm is peripheral, absence produces
 *             no suggestion at all.
 */
function scoreRhythm(p, severity = 'normal') {
  const suggestions = [];
  const issues = [];

  const rhythm = p.rhythm;
  if (!rhythm) {
    if (severity === 'strict') {
      return {
        dimension: 'Rhythm',
        score: 2,
        issues: ['rhythm not declared — coach/mentor personas need scheduled check-ins'],
        suggestions: [],
      };
    }
    if (severity === 'lenient') {
      return {
        dimension: 'Rhythm',
        score: 5,
        issues: [],
        suggestions: [],
        neutral: true,
      };
    }
    return {
      dimension: 'Rhythm',
      score: 5,
      issues: [],
      suggestions: ['rhythm not declared (optional — add for proactive/time-aware personas)'],
      neutral: true,
    };
  }

  // Lenient output policy for this dimension:
  //   Rhythm fields are pure behavioral knobs with no safety / discoverability
  //   angle, so lenient roles stay fully silent. If a companion declared
  //   `rhythm: {}` on purpose, they already signalled opt-in awareness.

  let score = 5;
  if (rhythm.heartbeat && rhythm.heartbeat.enabled) {
    score += 3;
  } else if (severity === 'strict') {
    issues.push('rhythm.heartbeat.enabled is false — coach/mentor personas benefit from proactive check-ins');
  } else if (severity === 'lenient') {
    // Silent: see lenient output policy above.
    score += 3;
  } else {
    suggestions.push('Declare rhythm.heartbeat.enabled: true for proactive outreach');
  }

  if (rhythm.circadian && rhythm.circadian.length > 0) {
    score += 2;
  } else if (severity === 'strict') {
    issues.push('rhythm.circadian not declared — time-of-day behavior missing');
  } else if (severity === 'lenient') {
    // Silent: see lenient output policy above.
    score += 2;
  } else {
    suggestions.push('Declare rhythm.circadian schedule for time-of-day behavior');
  }

  return { dimension: 'Rhythm', score: clamp(score), issues, suggestions };
}

// ---------------------------------------------------------------------------
// Constitution compliance gate
// ---------------------------------------------------------------------------

function runConstitutionCheck(personaDir) {
  // We DO NOT scan soul/constitution.md here. constitution.md is the
  // boilerplate-derived safety constitution itself — its content is exclusively
  // negation patterns ("Never assist with plans to harm specific individuals").
  // checkSkillCompliance() is shaped for SKILL.md-style positive capability
  // declarations; it has no negation-context awareness, so every persona pack
  // would surface §3 false positives and be hard-capped at overallScore=3.
  // This aligns the gate with the "Excluded by design" intent already
  // documented for EVALUABLE_SOUL_DOCS just below this function.
  const sources = [
    path.join(personaDir, 'soul', 'behavior-guide.md'),
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
// LLM-evaluable content extraction
// ---------------------------------------------------------------------------

/**
 * Soul markdown files an LLM evaluator should read.
 *
 * Whitelist (read into report.packContent.soulDocs):
 *   - behavior-guide.md  — operational dos/don'ts derived from Soul fields
 *   - self-narrative.md  — first-person narrative, the persona's prose voice
 *   - identity.md        — identity card, role/aesthetic/relationship anchors
 *
 * Excluded by design:
 *   - constitution.md    — boilerplate-derived safety constitution; structural
 *                          evaluator already covers §3 violations
 *   - injection.md       — runtime injection scaffolding, not narrative
 *   - any non-.md file or files outside soul/
 */
const EVALUABLE_SOUL_DOCS = [
  'behavior-guide.md',
  'self-narrative.md',
  'identity.md',
];

/**
 * Extract the subset of persona content that an LLM evaluator needs to make
 * a qualitative judgement. Excludes runtime/channel/install plumbing (no
 * informational value for content quality), keeps narrative + character
 * fields + soul prose documents.
 *
 * Used by `openpersona evaluate <slug> --pack-content` so the persona-evaluator
 * skill can hand a single JSON to the host LLM without re-reading the filesystem.
 */
function extractEvaluableContent(personaDir, p) {
  const view = getSoulView(p);
  const evo = p.evolution || {};
  const inst = evo.instance || {};
  const boundaries = inst.boundaries || {};

  const out = {
    identity:  { ...view.identity },
    character: { ...view.character },
    aesthetic: { ...view.aesthetic },
    immutableTraits: boundaries.immutableTraits || null,
    formality: (typeof boundaries.minFormality === 'number' || typeof boundaries.maxFormality === 'number')
      ? { min: boundaries.minFormality ?? null, max: boundaries.maxFormality ?? null }
      : null,
  };

  // Pull narrative soul/*.md files (whitelist). Each becomes a dict entry
  // keyed by filename so the LLM evaluator can address them individually.
  // Files that don't exist are silently skipped — absence is normal, not
  // an error. The dict is omitted entirely if nothing was found, to keep
  // packContent compact.
  const soulDocs = {};
  for (const filename of EVALUABLE_SOUL_DOCS) {
    const docPath = path.join(personaDir, 'soul', filename);
    if (fs.existsSync(docPath)) {
      soulDocs[filename] = fs.readFileSync(docPath, 'utf-8');
    }
  }
  if (Object.keys(soulDocs).length > 0) {
    out.soulDocs = soulDocs;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a persona pack by slug or absolute directory path.
 *
 * @param {string} slugOrDir - Persona slug (e.g. "secondme") or absolute path
 * @param {object} [options]
 * @param {boolean} [options.includeContent=false] - If true, include the
 *   evaluable content subset in `report.packContent` so an LLM evaluator
 *   can make qualitative judgements without re-reading the filesystem.
 *   `report.packContent.soulDocs` is a dict of whitelisted `soul/*.md` files
 *   (behavior-guide / self-narrative / identity); omitted if none exist.
 * @returns {{ slug, personaDir, role, weights, dimensions, constitution, overallScore, band, summary, packContent? }}
 */
function evaluatePersona(slugOrDir, options = {}) {
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

  const role = getSoulView(p).identity.role;
  const profile = getRoleProfile(role);
  const weights = getWeights(role);

  const sSoul    = sevFor(profile, 'soul');
  const sFaculty = sevFor(profile, 'faculty');
  const sSkill   = sevFor(profile, 'skill');
  const sSocial  = sevFor(profile, 'social');
  const sRhythm  = sevFor(profile, 'rhythm');

  const dimSpecs = [
    { result: scoreSoul(p, sSoul),                      severity: sSoul    },
    { result: scoreBody(p, personaDir),                 severity: 'normal' },
    { result: scoreFaculty(p, sFaculty),                severity: sFaculty },
    { result: scoreSkill(p, sSkill),                    severity: sSkill   },
    { result: scoreEvolution(p),                        severity: 'normal' },
    { result: scoreEconomy(p),                          severity: 'normal' },
    { result: scoreVitality(p),                         severity: 'normal' },
    { result: scoreSocial(p, personaDir, sSocial),      severity: sSocial  },
    { result: scoreRhythm(p, sRhythm),                  severity: sRhythm  },
  ];
  const dimensions = dimSpecs.map(({ result, severity }) => ({
    ...result,
    severity,
    weight: weights[result.dimension] || 1,
  }));

  const constitution = runConstitutionCheck(personaDir);

  // Role-aware weighted average: dimensions declared core to the role (strict)
  // are doubled, peripheral (lenient) ones are halved.
  const weightedSum = dimensions.reduce((sum, d) => sum + d.score * (weights[d.dimension] || 1), 0);
  const totalWeight = dimensions.reduce((sum, d) => sum + (weights[d.dimension] || 1), 0);
  let overallScore = Math.round(weightedSum / totalWeight);

  // Constitution hard penalty: violations cap the score at 3
  if (constitution.violations && constitution.violations.length > 0) {
    overallScore = Math.min(overallScore, 3);
  }

  const constitutionPassed = !constitution.violations || constitution.violations.length === 0;

  const report = {
    slug,
    personaDir,
    role,
    weights,
    dimensions,
    constitution: {
      passed: constitutionPassed,
      violations: constitution.violations || [],
      warnings: constitution.warnings || [],
    },
    overallScore: clamp(overallScore),
    band: band(overallScore),
    summary: buildSummary(dimensions, overallScore, role),
  };

  if (options.includeContent) {
    report.packContent = extractEvaluableContent(personaDir, p);
  }

  return report;
}

function buildSummary(dimensions, overallScore, role) {
  const strengths = dimensions
    .filter(d => d.score >= 8)
    .map(d => d.dimension);
  const gaps = dimensions
    .filter(d => d.score <= 4)
    .map(d => d.dimension);
  const allIssues = dimensions.flatMap(d => d.issues);
  const allSuggestions = dimensions.flatMap(d => d.suggestions);

  return {
    overallScore,
    role: role || null,
    strengths,
    gaps,
    topIssues: allIssues.slice(0, 5),
    topSuggestions: allSuggestions.slice(0, 5),
  };
}

module.exports = {
  evaluatePersona,
  extractEvaluableContent,
  getRoleProfile,
  getWeights,
  ROLE_PROFILES,
  BASE_WEIGHTS,
};
