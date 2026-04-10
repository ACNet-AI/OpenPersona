'use strict';

/**
 * OpenPersona Living Canvas Generator
 *
 * Aggregates persona identity, faculty capabilities, skills, and evolution
 * state into a self-contained HTML profile page rendered from
 * templates/reports/canvas.template.html.
 *
 * Usage:
 *   const { renderCanvasHtml } = require('./canvas-generator');
 *   const html = renderCanvasHtml(personaDir, slug);
 */

const fs       = require('fs-extra');
const path     = require('path');
const Mustache = require('mustache');
const { resolveSoulFile } = require('../utils');
const { readJsonSafe, formatDate, daysBetween, truncate } = require('./helpers');

const TEMPLATE_PATH = path.resolve(__dirname, '../..', 'templates', 'reports', 'canvas.template.html');
const PKG           = require('../../package.json');

// Faculty dimension → display label
const DIMENSION_LABEL = {
  expression: 'Expression',
  cognition:  'Cognition',
  sense:      'Sense',
};

// Faculty dimension → color class (used in template)
const DIMENSION_CLASS = {
  expression: 'dim-expression',
  cognition:  'dim-cognition',
  sense:      'dim-sense',
};

// Well-known faculty descriptions (fallback when faculty.json is absent)
const FACULTY_DESCRIPTIONS = {
  voice:    'Text-to-speech — speaks responses aloud via TTS provider',
  selfie:   'Image generation — creates visual self-portraits on demand',
  music:    'Music generation — composes audio clips from text prompts',
  memory:   'Long-term memory — persists and retrieves facts across conversations',
  reminder: 'Scheduled reminders — queues follow-ups and time-based messages',
  economy:  'Financial health — tracks costs and computes Vitality score',
  avatar:   'Animated avatar — renders a 2D/3D persona presence',
};

// ─── Faculty resolution ───────────────────────────────────────────────────────

function resolveFacultyMeta(facultyEntry) {
  const name = typeof facultyEntry === 'string' ? facultyEntry : (facultyEntry.name || '');
  const installField = typeof facultyEntry === 'object' ? facultyEntry.install : undefined;
  const isDormant = !!installField;

  // Try reading from layers/faculties/<name>/faculty.json relative to this module
  const facultyJsonPath = path.resolve(
    __dirname, '../..', 'layers', 'faculties', name, 'faculty.json'
  );
  const meta = readJsonSafe(facultyJsonPath) || {};

  return {
    name,
    label:       meta.name || name,
    dimension:   meta.dimension || '',
    dimensionLabel: DIMENSION_LABEL[meta.dimension] || (meta.dimension || ''),
    dimensionClass: DIMENSION_CLASS[meta.dimension] || 'dim-other',
    description: meta.description || FACULTY_DESCRIPTIONS[name] || '',
    isDormant,
    installSource: installField || '',
  };
}

// ─── Skill resolution ─────────────────────────────────────────────────────────

function resolveSkillMeta(skillEntry) {
  const name = typeof skillEntry === 'string' ? skillEntry : (skillEntry.name || '');
  const installField = typeof skillEntry === 'object' ? skillEntry.install : undefined;
  const description = (typeof skillEntry === 'object' && skillEntry.description) || '';
  const isDormant = !!installField;

  return {
    name,
    label:         name,
    description:   truncate(description, 120),
    isDormant,
    installSource: installField || '',
  };
}

// ─── Data Builder ─────────────────────────────────────────────────────────────

/**
 * Build all template variables for the Living Canvas.
 *
 * @param {string} personaDir - Absolute path to installed persona directory
 * @param {string} slug       - Persona slug
 * @returns {object}          - Mustache template data
 */
function buildCanvasData(personaDir, slug) {
  // ── persona.json ────────────────────────────────────────────────────────────
  const personaPath = resolveSoulFile(personaDir, 'persona.json');
  const persona     = readJsonSafe(personaPath) || {};

  // ── state.json ──────────────────────────────────────────────────────────────
  const statePath = resolveSoulFile(personaDir, 'state.json');
  const state     = readJsonSafe(statePath) || {};

  // ── agent-card.json ─────────────────────────────────────────────────────────
  const agentCard = readJsonSafe(path.join(personaDir, 'agent-card.json')) || {};
  const a2aUrl    = agentCard.url || '';
  const hasA2A    = !!(a2aUrl && !a2aUrl.includes('<RUNTIME_ENDPOINT>'));

  // ── acn-config.json ─────────────────────────────────────────────────────────
  const acnConfig    = readJsonSafe(path.join(personaDir, 'acn-config.json')) || {};
  const rawWallet    = acnConfig.wallet_address || '';
  const walletShort  = rawWallet.length > 14
    ? rawWallet.slice(0, 6) + '...' + rawWallet.slice(-4)
    : rawWallet || '—';

  // frameworkVersion: read from persona.json meta (set by generator), fallback to package version
  const frameworkVersion = persona.meta?.frameworkVersion || PKG.version || '—';

  // ── Soul: identity ──────────────────────────────────────────────────────────
  const personaName    = persona.personaName || slug;
  const personaInitial = personaName.charAt(0).toUpperCase();
  const role           = persona.role || persona.personaType || '—';
  const bioExcerpt     = truncate(persona.bio || '', 200);
  const referenceImage = persona.referenceImage || '';

  // ── Soul: mood ──────────────────────────────────────────────────────────────
  const moodCurrent = state.mood ? (state.mood.current || 'neutral') : 'neutral';

  // ── Soul: relationship ──────────────────────────────────────────────────────
  const rel               = state.relationship || {};
  const relationshipStage = (rel.stage || 'stranger').replace(/_/g, ' ');
  const interactionCount  = rel.interactionCount || 0;
  const firstInteraction  = rel.firstInteraction || null;
  const lastInteraction   = rel.lastInteraction || null;
  const daysTogether = firstInteraction
    ? daysBetween(firstInteraction, new Date().toISOString())
    : 0;
  const lastSeenDisplay = lastInteraction ? formatDate(lastInteraction) : '—';

  // ── Soul: evolved traits ────────────────────────────────────────────────────
  const evolvedTraits = (state.evolvedTraits || []).map((t) => {
    if (typeof t === 'string') return { name: t };
    return { name: t.trait || t.name || String(t) };
  });

  // ── Soul: recent events (last 5, newest first) ──────────────────────────────
  const EVENT_TYPE_LABEL = {
    relationship_signal: 'Relationship',
    mood_shift:          'Mood shift',
    trait_emergence:     'New trait',
    interest_discovery:  'New interest',
    milestone:           'Milestone',
    speaking_style_drift:'Style drift',
  };
  const recentEvents = (state.eventLog || []).slice(-5).reverse().map((e) => ({
    typeLabel: EVENT_TYPE_LABEL[e.type] || (e.type || 'Event'),
    trigger:   truncate(e.trigger || '', 90),
    dateShort: e.timestamp ? formatDate(e.timestamp) : '',
  }));

  // ── Body layer ──────────────────────────────────────────────────────────────
  const bodyRuntime  = (persona.body && persona.body.runtime) || null;
  const hasBody      = !!bodyRuntime;
  const bodyPlatform = bodyRuntime ? (bodyRuntime.platform || '—') : '—';
  const _hb = persona.rhythm?.heartbeat || persona.heartbeat;
  const heartbeatEnabled = !!(_hb && _hb.enabled);

  // ── Faculty layer ───────────────────────────────────────────────────────────
  const rawFaculties = Array.isArray(persona.faculties) ? persona.faculties : [];
  const faculties = rawFaculties.map(resolveFacultyMeta);
  const activeFaculties  = faculties.filter((f) => !f.isDormant);
  const dormantFaculties = faculties.filter((f) => f.isDormant);

  // ── Avatar widget (P14 Phase 1.5) ───────────────────────────────────────────
  // Detect avatar faculty + body.appearance.model3d → animated Live2D widget
  const hasAvatarFaculty = rawFaculties.some((f) => {
    const n = typeof f === 'string' ? f : (f.name || '');
    return n === 'avatar';
  });
  const bodyAppearance = (persona.body && persona.body.appearance) || {};
  const avatarModel3Url  = bodyAppearance.model3d || '';
  const hasAvatarModel3d = !!avatarModel3Url;

  // Inline avatar-widget.js from packages/avatar-runtime when available.
  // The inlined script is safe to embed: it contains no Mustache {{ patterns.
  const WIDGET_PATH = path.resolve(__dirname, '../..', 'packages', 'avatar-runtime', 'web', 'avatar-widget.js');
  const avatarWidgetInlineScript = (hasAvatarFaculty && hasAvatarModel3d && fs.existsSync(WIDGET_PATH))
    ? fs.readFileSync(WIDGET_PATH, 'utf-8')
    : '';

  // ── Skill layer ─────────────────────────────────────────────────────────────
  const rawSkills = Array.isArray(persona.skills) ? persona.skills : [];
  // Inject hasA2A + a2aUrl into each skill so Mustache can resolve them
  // without relying on parent-context lookup inside nested sections.
  const skills = rawSkills.map((entry) => ({
    ...resolveSkillMeta(entry),
    hasA2A,
    a2aUrl,
  }));
  const activeSkills  = skills.filter((s) => !s.isDormant);
  const dormantSkills = skills.filter((s) => s.isDormant);

  return {
    // ── Identity
    personaName,
    personaInitial,
    slug:           persona.slug || slug,
    role,
    bioExcerpt,
    referenceImage,
    hasReferenceImage: !!referenceImage,

    // ── Soul state
    moodCurrent,
    relationshipStage,
    interactionCount,
    daysTogether,
    lastSeenDisplay,

    // ── Evolution
    hasEvolvedTraits: evolvedTraits.length > 0,
    evolvedTraits,
    hasRecentEvents:  recentEvents.length > 0,
    recentEvents,

    // ── Body
    hasBody,
    bodyPlatform,
    heartbeatEnabled,

    // ── Faculties
    hasFaculties:       faculties.length > 0,
    faculties,
    hasActiveFaculties: activeFaculties.length > 0,
    activeFaculties,
    hasDormantFaculties: dormantFaculties.length > 0,
    dormantFaculties,

    // ── Skills
    hasSkills:       skills.length > 0,
    skills,
    hasActiveSkills: activeSkills.length > 0,
    activeSkills,
    hasDormantSkills: dormantSkills.length > 0,
    dormantSkills,

    // ── Avatar widget (P14 Phase 1.5)
    hasAvatarFaculty,
    hasAvatarModel3d,
    avatarModel3Url,
    // avatarWidgetInlineScript truthy → template embeds the widget + init block
    avatarWidgetInlineScript,

    // ── A2A / Footer
    hasA2A,
    a2aUrl,
    walletAddress:    walletShort,
    hasWallet:        !!rawWallet,
    frameworkVersion,
    generatedAt:      new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  };
}

/**
 * Render the Living Canvas HTML as a string.
 *
 * @param {string} personaDir - Absolute path to installed persona directory
 * @param {string} slug       - Persona slug
 * @returns {string}          - Rendered HTML
 */
function renderCanvasHtml(personaDir, slug) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const data     = buildCanvasData(personaDir, slug);
  return Mustache.render(template, data);
}

module.exports = { buildCanvasData, renderCanvasHtml };
