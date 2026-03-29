/**
 * OpenPersona - Persona validation logic
 * All validation runs before generation begins; throws on any violation.
 *
 * Supports two input formats for soul fields:
 *   New format (v0.17+): has a top-level "soul" key → soul.{identity,aesthetic,character}
 *   Old format (legacy): flat top-level fields (personaName, slug, bio, etc.)
 * Validation always runs on the RAW input, BEFORE normalizeSoulInput() flattens the structure.
 *
 * Supports two input formats for evolution fields (P23+):
 *   New format: nested → evolution.instance.{enabled,boundaries,sources,influenceBoundary,...}
 *   Old format (legacy): flat → evolution.{enabled,boundaries,sources,influenceBoundary,...}
 * normalizeEvolutionInput() must be called by the caller (validatePhase in generator/index.js)
 * BEFORE validatePersona() so all evolution validators receive the canonical nested format.
 */

// Fields that belong in evolution.instance (the Soul-layer evolution scope).
// Used by normalizeEvolutionInput() to promote old flat evolution fields.
const EVOLUTION_INSTANCE_FIELDS = [
  'enabled', 'relationshipProgression', 'moodTracking', 'traitEmergence',
  'speakingStyleDrift', 'interestDiscovery', 'stageBehaviors',
  'boundaries', 'sources', 'influenceBoundary',
  'channels', // deprecated alias for sources
];

const EVOLUTION_PACK_ENGINES = new Set(['signal', 'autoskill']);
const EVOLUTION_ACTIVATION_CHANNELS = new Set(['pendingCommands', 'signal', 'cli']);
const SKILL_TRUST_LEVELS = new Set(['verified', 'community', 'unverified']);

// Root-level keys allowed in the new grouped format (additionalProperties: false enforcement).
const NEW_FORMAT_ALLOWED_ROOT_KEYS = new Set([
  'soul', 'body', 'faculties', 'skills',
  'evolution', 'economy', 'vitality', 'social',
  'rhythm', 'memory',
  'additionalAllowedTools',
  'version', 'author',
]);

/**
 * Normalize evolution input: detect old flat format (evolution.enabled, evolution.boundaries, …)
 * and promote all instance-scoped fields into evolution.instance.
 * Called at the top of validatePersona() so all subsequent validators work with the new format.
 * New format is detected by presence of evolution.instance key — already-normalized input is a no-op.
 */
function normalizeEvolutionInput(persona) {
  const evo = persona.evolution;
  if (!evo || evo.instance !== undefined) {
    // When evo.instance is already defined, normalizer skips field promotion.
    // Guard: warn if instance exists but enabled is not explicitly true — evolution would silently stay off.
    // Warn only when enabled is absent (undefined/null) — not when explicitly set to false.
    if (evo && evo.instance !== undefined && evo.instance.enabled == null) {
      process.stderr.write(
        '[openpersona] warning: evolution.instance is declared but evolution.instance.enabled is not true. ' +
        'Evolution will be disabled. Add "enabled": true under evolution.instance to activate it.\n'
      );
    }
    return;
  }

  const instance = {};
  for (const field of EVOLUTION_INSTANCE_FIELDS) {
    if (evo[field] === undefined) continue;
    if (field === 'channels') {
      // deprecated alias — migrate to sources
      if (instance.sources === undefined) instance.sources = evo[field];
      process.stderr.write('[openpersona] deprecation: evolution.channels → evolution.instance.sources\n');
    } else {
      instance[field] = evo[field];
    }
    delete evo[field];
  }
  evo.instance = instance;
}

function validateRequiredFields(persona) {
  if (persona.soul) {
    // New grouped format
    const identity = persona.soul.identity || {};
    const character = persona.soul.character || {};
    const checks = {
      'soul.identity.personaName': identity.personaName,
      'soul.identity.slug': identity.slug,
      'soul.identity.bio': identity.bio,
      'soul.character.personality': character.personality,
      'soul.character.speakingStyle': character.speakingStyle,
    };
    for (const [fieldPath, val] of Object.entries(checks)) {
      if (!val) throw new Error(`persona.json missing required field: ${fieldPath}`);
    }
    // Normalize slug in place (on identity object — normalizeSoulInput will lift it to top level)
    identity.slug = identity.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Strict root-key check (additionalProperties: false at root level)
    for (const key of Object.keys(persona)) {
      if (!NEW_FORMAT_ALLOWED_ROOT_KEYS.has(key)) {
        throw new Error(
          `persona.json (new format) has unknown root field: "${key}". ` +
          `Allowed root fields: ${[...NEW_FORMAT_ALLOWED_ROOT_KEYS].join(', ')}. ` +
          `Soul fields (personaName, bio, personality, etc.) belong under soul.identity / soul.aesthetic / soul.character.`
        );
      }
    }
    return;
  }

  // Old flat format
  const required = ['personaName', 'slug', 'bio', 'personality', 'speakingStyle'];
  for (const k of required) {
    if (!persona[k]) throw new Error(`persona.json missing required field: ${k}`);
  }
  persona.slug = persona.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Shared compliance pattern scanner — used by both boundaries and addendum validators.
 * Returns an array of violation strings (empty = compliant).
 */
function _scanConstitutionViolations(text) {
  const t = text.toLowerCase();
  const violations = [];
  if (/no\s*safety|ignore\s*safety|skip\s*safety|disable\s*safety|override\s*safety/i.test(t)) {
    violations.push('Cannot loosen Safety (§3) hard constraints');
  }
  if (/deny\s*ai|hide\s*ai|not\s*an?\s*ai|pretend.*human|claim.*human/i.test(t)) {
    violations.push('Cannot deny AI identity (§6) — personas must be truthful when sincerely asked');
  }
  if (/no\s*limit|unlimited|anything\s*goes|no\s*restrict/i.test(t)) {
    violations.push('Cannot remove constitutional boundaries — personas can add stricter rules, not loosen them');
  }
  return violations;
}

function validateConstitutionCompliance(persona) {
  // Support both new format (soul.character.boundaries) and old (boundaries)
  const boundaries = persona.soul?.character?.boundaries || persona.boundaries;
  if (!boundaries || typeof boundaries !== 'string') return;
  const violations = _scanConstitutionViolations(boundaries);
  if (violations.length > 0) {
    throw new Error(
      `Constitution compliance error in boundaries field:\n${violations.map((v) => `  - ${v}`).join('\n')}\n` +
      'Persona boundaries can add stricter rules but cannot loosen the constitution. See §5 (Principal Hierarchy).'
    );
  }
}

/**
 * Validate inline constitutionAddendum content for compliance.
 * Only runs when the addendum is declared as inline text (not a file: reference).
 * File-based addendums are validated after loading in loadPhase.
 */
function validateConstitutionAddendum(persona) {
  const addendum = persona.soul?.identity?.constitutionAddendum || persona.constitutionAddendum;
  if (!addendum || typeof addendum !== 'string') return;
  if (addendum.startsWith('file:')) return; // file: refs validated after loading
  const violations = _scanConstitutionViolations(addendum);
  if (violations.length > 0) {
    throw new Error(
      `Constitution compliance error in constitutionAddendum:\n${violations.map((v) => `  - ${v}`).join('\n')}\n` +
      'Constitution addendums can add stricter domain constraints but cannot loosen the universal constitution.'
    );
  }
}

/**
 * Validate loaded addendum content (called from loadPhase for file: references).
 * Exported so the generator can call it after file loading.
 */
function validateConstitutionAddendumContent(content, sourcePath) {
  if (!content || typeof content !== 'string') return;
  const violations = _scanConstitutionViolations(content);
  if (violations.length > 0) {
    throw new Error(
      `Constitution compliance error in constitutionAddendum (${sourcePath || 'file'}):\n` +
      `${violations.map((v) => `  - ${v}`).join('\n')}\n` +
      'Constitution addendums can add stricter domain constraints but cannot loosen the universal constitution.'
    );
  }
}

function validateEvolutionBoundaries(persona) {
  if (!persona.evolution?.instance?.boundaries) return;
  const evo = persona.evolution.instance.boundaries;
  const violations = [];

  if (evo.immutableTraits !== undefined) {
    if (!Array.isArray(evo.immutableTraits)) {
      violations.push('immutableTraits must be an array of strings');
    } else {
      for (const t of evo.immutableTraits) {
        if (typeof t !== 'string' || t.trim().length === 0) {
          violations.push(`immutableTraits contains invalid entry: ${JSON.stringify(t)}`);
          break;
        }
        if (t.length > 100) {
          violations.push(`immutableTraits entry too long (max 100 chars): "${t.slice(0, 30)}..."`);
          break;
        }
      }
    }
  }

  // minFormality / maxFormality declare a bounding window for speakingStyleDrift.formality writes.
  // speakingStyleDrift.formality is a signed delta (0 = baseline; positive = more formal; negative = more casual).
  // Bounds range is -10 to +10, allowing constraints both above and below the natural baseline.
  // Examples: minFormality: -2 = "can be up to 2 units more casual than baseline"
  //           minFormality:  4 = "must be at least 4 units more formal than baseline"
  const hasMin = evo.minFormality !== undefined && evo.minFormality !== null;
  const hasMax = evo.maxFormality !== undefined && evo.maxFormality !== null;
  const minIsNum = hasMin && typeof evo.minFormality === 'number';
  const maxIsNum = hasMax && typeof evo.maxFormality === 'number';
  if (hasMin && !minIsNum) violations.push('minFormality must be a number');
  if (hasMax && !maxIsNum) violations.push('maxFormality must be a number');
  if (minIsNum && (evo.minFormality < -10 || evo.minFormality > 10)) {
    violations.push(`minFormality (${evo.minFormality}) must be between -10 and 10`);
  }
  if (maxIsNum && (evo.maxFormality < -10 || evo.maxFormality > 10)) {
    violations.push(`maxFormality (${evo.maxFormality}) must be between -10 and 10`);
  }
  if (minIsNum && maxIsNum && evo.minFormality >= evo.maxFormality) {
    violations.push(`minFormality (${evo.minFormality}) must be less than maxFormality (${evo.maxFormality})`);
  }

  if (violations.length > 0) {
    throw new Error(
      `Evolution boundaries validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`
    );
  }
}

function validateInfluenceBoundary(persona) {
  if (!persona.evolution?.instance?.influenceBoundary) return;
  const ib = persona.evolution.instance.influenceBoundary;
  const violations = [];
  const validDimensions = ['mood', 'traits', 'speakingStyle', 'interests', 'formality'];

  if (ib.defaultPolicy !== undefined && ib.defaultPolicy !== 'reject' && ib.defaultPolicy !== 'accept') {
    violations.push(`defaultPolicy must be 'reject' or 'accept', got: ${JSON.stringify(ib.defaultPolicy)}`);
  }

  if (ib.rules !== undefined) {
    if (!Array.isArray(ib.rules)) {
      violations.push('rules must be an array');
    } else {
      for (let i = 0; i < ib.rules.length; i++) {
        const rule = ib.rules[i];
        if (!rule || typeof rule !== 'object') {
          violations.push(`rules[${i}] must be an object`);
          continue;
        }
        if (!validDimensions.includes(rule.dimension)) {
          violations.push(`rules[${i}].dimension must be one of: ${validDimensions.join(', ')} (got: ${JSON.stringify(rule.dimension)})`);
        }
        if (!Array.isArray(rule.allowFrom) || rule.allowFrom.length === 0) {
          violations.push(`rules[${i}].allowFrom must be a non-empty array`);
        }
        if (typeof rule.maxDrift !== 'number' || rule.maxDrift < 0 || rule.maxDrift > 1) {
          violations.push(`rules[${i}].maxDrift must be a number between 0 and 1 (got: ${JSON.stringify(rule.maxDrift)})`);
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Influence boundary validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`
    );
  }
}

function validateEvolutionPack(persona) {
  const pack = persona.evolution?.pack;
  if (!pack) return;
  const violations = [];
  if (pack.engine !== undefined && !EVOLUTION_PACK_ENGINES.has(pack.engine)) {
    violations.push(`pack.engine must be one of: ${[...EVOLUTION_PACK_ENGINES].join(', ')} (got: ${JSON.stringify(pack.engine)})`);
  }
  if (pack.triggerAfterEvents !== undefined) {
    if (typeof pack.triggerAfterEvents !== 'number' || !Number.isInteger(pack.triggerAfterEvents) || pack.triggerAfterEvents < 1) {
      violations.push('pack.triggerAfterEvents must be a positive integer');
    }
  }
  if (violations.length > 0) {
    throw new Error(`Evolution pack validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
  }
}

function validateEvolutionFaculty(persona) {
  const faculty = persona.evolution?.faculty;
  if (!faculty) return;
  const violations = [];
  if (faculty.activationChannels !== undefined) {
    if (!Array.isArray(faculty.activationChannels)) {
      violations.push('faculty.activationChannels must be an array');
    } else {
      for (const ch of faculty.activationChannels) {
        if (!EVOLUTION_ACTIVATION_CHANNELS.has(ch)) {
          violations.push(`faculty.activationChannels contains unknown value: ${JSON.stringify(ch)} (allowed: ${[...EVOLUTION_ACTIVATION_CHANNELS].join(', ')})`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`Evolution faculty validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
  }
}

function validateEvolutionBody(persona) {
  const body = persona.evolution?.body;
  if (!body) return;
  const violations = [];
  if (body.allowRuntimeExpansion !== undefined && typeof body.allowRuntimeExpansion !== 'boolean') {
    violations.push('body.allowRuntimeExpansion must be a boolean');
  }
  if (body.allowModelSwap !== undefined && typeof body.allowModelSwap !== 'boolean') {
    violations.push('body.allowModelSwap must be a boolean');
  }
  if (violations.length > 0) {
    throw new Error(`Evolution body validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
  }
}

function validateEvolutionSkill(persona) {
  const skill = persona.evolution?.skill;
  if (!skill) return;
  const violations = [];
  for (const field of ['allowNewInstall', 'allowUpgrade', 'allowUninstall']) {
    if (skill[field] !== undefined && typeof skill[field] !== 'boolean') {
      violations.push(`skill.${field} must be a boolean`);
    }
  }
  if (skill.minTrustLevel !== undefined && !SKILL_TRUST_LEVELS.has(skill.minTrustLevel)) {
    violations.push(`skill.minTrustLevel must be one of: ${[...SKILL_TRUST_LEVELS].join(', ')} (got: ${JSON.stringify(skill.minTrustLevel)})`);
  }
  if (violations.length > 0) {
    throw new Error(`Evolution skill validation error:\n${violations.map((v) => `  - ${v}`).join('\n')}`);
  }
}

/**
 * Baseline compliance warnings (non-blocking).
 * Enforces the P11-grade capability floor defined in schemas/baseline.json.
 * Does not throw — baseline gaps are quality issues, not safety violations.
 * Safety violations (constitution, schema errors) use hard-reject (throw) elsewhere.
 *
 * Note: memory faculty is NOT checked here — it is auto-injected upstream by
 * applyBaselineDefaults() in the generator before validatePersona() runs.
 */
function warnBaselineCompliance(persona) {
  const evolutionEnabled = persona.evolution?.instance?.enabled === true;
  const hasBoundaries = !!persona.evolution?.instance?.boundaries;
  if (evolutionEnabled && !hasBoundaries) {
    process.stderr.write(
      '[openpersona] baseline warning: evolution is enabled but evolution.instance.boundaries is not declared. ' +
      'P11-grade personas with evolution must declare immutableTraits and formality bounds to constrain drift ' +
      '(schemas/baseline.json → concepts.evolution.required). ' +
      'Add evolution.instance.boundaries with immutableTraits and minFormality/maxFormality.\n'
    );
  }
}

/**
 * Run all persona validations.
 * Callers MUST invoke normalizeEvolutionInput(persona) before calling this function
 * so all evolution validators receive the canonical nested format.
 * validateRequiredFields() runs on the RAW soul input (before normalizeSoulInput flattens it).
 * Mutates persona.slug (or soul.identity.slug) as a normalization side effect.
 * Throws on any violation.
 */
function validatePersona(persona) {
  validateRequiredFields(persona);
  validateConstitutionCompliance(persona);
  validateConstitutionAddendum(persona);
  validateEvolutionBoundaries(persona);
  validateInfluenceBoundary(persona);
  validateEvolutionPack(persona);
  validateEvolutionFaculty(persona);
  validateEvolutionBody(persona);
  validateEvolutionSkill(persona);
  warnBaselineCompliance(persona);

  if (persona.personaType !== undefined) {
    process.stderr.write(
      `[openpersona] warning: "personaType" is deprecated — use "role" instead. ` +
      `Supported values: companion, assistant, character, brand, pet, mentor, therapist, coach, collaborator, guardian, entertainer, narrator.\n`
    );
  }
}

module.exports = { validatePersona, normalizeEvolutionInput, validateConstitutionAddendumContent };
