/**
 * OpenPersona - Persona validation logic
 * All validation runs before generation begins; throws on any violation.
 *
 * Supports two input formats:
 *   New format (v0.17+): has a top-level "soul" key → soul.{identity,aesthetic,character}
 *   Old format (legacy): flat top-level fields (personaName, slug, bio, etc.)
 *
 * Validation always runs on the RAW input, BEFORE normalizeSoulInput() flattens the structure.
 */

// Root-level keys allowed in the new grouped format (additionalProperties: false enforcement).
const NEW_FORMAT_ALLOWED_ROOT_KEYS = new Set([
  'soul', 'body', 'faculties', 'skills',
  'evolution', 'economy', 'vitality', 'social',
  'rhythm',
  'additionalAllowedTools',
  'version', 'author',
]);

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

function validateConstitutionCompliance(persona) {
  // Support both new format (soul.character.boundaries) and old (boundaries)
  const boundaries = persona.soul?.character?.boundaries || persona.boundaries;
  if (!boundaries || typeof boundaries !== 'string') return;
  const b = boundaries.toLowerCase();
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

function validateEvolutionBoundaries(persona) {
  if (!persona.evolution?.boundaries) return;
  const evo = persona.evolution.boundaries;
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
  if (!persona.evolution?.influenceBoundary) return;
  const ib = persona.evolution.influenceBoundary;
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

/**
 * Run all persona validations. Operates on the RAW input (before normalizeSoulInput).
 * Mutates persona.slug (or soul.identity.slug) as a normalization side effect.
 * Throws on any violation.
 */
function validatePersona(persona) {
  validateRequiredFields(persona);
  validateConstitutionCompliance(persona);
  validateEvolutionBoundaries(persona);
  validateInfluenceBoundary(persona);

  if (persona.personaType !== undefined) {
    process.stderr.write(
      `[openpersona] warning: "personaType" is deprecated — use "role" instead. ` +
      `Supported values: companion, assistant, character, brand, pet, mentor, therapist, coach, collaborator, guardian, entertainer, narrator.\n`
    );
  }
}

module.exports = { validatePersona };
