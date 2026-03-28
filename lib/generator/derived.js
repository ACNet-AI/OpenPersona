/**
 * OpenPersona - Derived field computation
 *
 * Computes all template variables that are derived from persona.json input.
 * These fields are injected into Mustache templates but must NOT appear in the
 * output persona.json — they are listed in DERIVED_FIELDS for cleanup.
 *
 * Convention: all derived field names are listed in DERIVED_FIELDS below.
 * When adding a new derived field, add it to DERIVED_FIELDS in the same commit.
 */

/**
 * Field names that are computed by the generator and must be stripped from output persona.json.
 * Keeping this list co-located with the computation makes it easy to keep in sync.
 */
const DERIVED_FIELDS = [
  'backstory', 'facultySummary', 'capabilitiesSection',
  'skillContent', 'description', 'evolutionEnabled', 'hasSelfie', 'allowedTools', 'allowedToolsStr',
  'facultyConfigs',
  // 'author' and 'version' are intentionally NOT derived — they are persona utility fields
  // declared in persona.json and preserved in the output (with defaults set by generator.js).
  '_dir',
  'hasSoftRefSkills', 'softRefSkillNames', 'softRefSkills',
  'hasSoftRefFaculties', 'softRefFacultyNames', 'softRefFaculties',
  'hasSoftRefBody', 'softRefBodyName', 'softRefBodyInstall',
  'heartbeatExpected', 'heartbeatStrategy', 'hasDormantCapabilities',
  'hasExpectedCapabilities',
  'isDigitalTwin', 'sourceIdentityName', 'sourceIdentityKind', 'roleFoundation',
  'personaType',
  'hasBodyRuntime', 'bodyFramework', 'bodyChannels', 'hasBodyCredentials',
  'bodyCredentialScopes', 'bodyResources',
  'hasSharedCredentials', 'hasPrivateCredentials', 'privateCredentialPath',
  'hasEvolutionBoundaries', 'immutableTraits', 'maxFormality', 'minFormality', 'hasMaxFormality', 'hasMinFormality',
  'hasStageBehaviors', 'stageBehaviorsBlock',
  'hasHandoff',
  'hasEvolutionSources', 'evolutionSourceNames',
  'hasSoftRefSources', 'softRefSourceNames', 'softRefSourceInstalls', 'softRefSources',
  'hasInfluenceBoundary', 'influenceBoundaryPolicy',
  'influenceableDimensions', 'influenceBoundaryRules',
  'hasImmutableTraitsWarning', 'immutableTraitsForInfluence',
  'hasSkillTrustPolicy', 'skillMinTrustLevel',
  'hasConstitutionAddendum',
  'hasEconomyFaculty', 'hasSurvivalPolicy',
  'hasInterfaceConfig', 'interfaceSignalPolicy', 'interfaceCommandPolicy',
  'avatar',
  // heartbeat: old flat top-level path (P19 interim, now superseded by rhythm.heartbeat).
  // Stripped from output so the runner reads rhythm.heartbeat (preserved) or persona.heartbeat (P19 compat).
  // _heartbeatConfig: internal value pre-injected by generator.js before derivation.
  'heartbeat', '_heartbeatConfig',
  // additionalAllowedTools: merged into allowedTools by collectAllowedTools(), stripped from output
  'additionalAllowedTools',
];

const ROLE_FOUNDATIONS = {
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

/**
 * Compute all derived template variables.
 *
 * Returns a plain object containing all derived fields. The caller (derivedPhase) applies
 * them to persona via Object.assign so Mustache templates can access everything via one
 * context object. These fields are NOT emitted to persona.json — emitPhase strips them
 * using the DERIVED_FIELDS list.
 *
 * Side-effect: normalizes persona.role (an INPUT field preserved in output persona.json)
 * because roleFoundation depends on it. All other mutations are in the returned object.
 *
 * @param {object} persona - Read for input values; persona.role may be normalized as a side-effect
 * @param {object} context
 * @param {object[]} context.loadedFaculties  - structural Faculty objects (voice, avatar, memory…)
 * @param {object[]} context.loadedAspects    - systemic aspect objects (economy…); NOT structural Faculties
 * @param {object[]} context.softRefSkills
 * @param {object[]} context.softRefFaculties
 * @param {object|null} context.softRefBody
 * @param {object[]} context.softRefSources   - renamed from softRefChannels
 * @param {boolean} context.evolutionEnabled
 * @param {string[]} context.facultyNames
 * @returns {object} derived - plain object of all computed template variables
 */
function computeDerivedFields(persona, {
  loadedFaculties,
  loadedAspects = [],
  softRefSkills,
  softRefFaculties,
  softRefBody,
  softRefSources,
  evolutionEnabled,
  facultyNames,
  activeSkillNames = [],
}) {
  // persona.role normalization — this is a persona INPUT field (preserved in output persona.json),
  // not a derived field. It must be normalized here because roleFoundation depends on it.
  persona.role = persona.role || (persona.personaType !== 'virtual' && persona.personaType ? persona.personaType : 'companion');

  // All remaining assignments build the `derived` object returned by this function.
  // The caller (derivedPhase) applies them to persona via Object.assign for template rendering,
  // but they are NOT part of persona.json output — they are stripped via DERIVED_FIELDS.
  const d = {};

  // Constitution addendum
  d.hasConstitutionAddendum = !!(persona.constitutionAddendum);

  // Identity classification
  d.isDigitalTwin = !!persona.sourceIdentity;
  d.sourceIdentityName = persona.sourceIdentity?.name || '';
  d.sourceIdentityKind = persona.sourceIdentity?.kind || '';
  d.roleFoundation = ROLE_FOUNDATIONS[persona.role] || `You serve as a ${persona.role} to your user — fulfilling this role with authenticity and care.`;

  // Mustache helpers
  d.evolutionEnabled = evolutionEnabled;
  // selfie migrated from Faculty → Skill; check both for backward compatibility
  d.hasSelfie = facultyNames.includes('selfie') || activeSkillNames.includes('selfie');

  // Capabilities dimension — dormant gap detection
  d.softRefSkills = softRefSkills;
  d.hasSoftRefSkills = softRefSkills.length > 0;
  d.softRefSkillNames = softRefSkills.map((s) => s.name).join(', ');
  d.softRefFaculties = softRefFaculties;
  d.hasSoftRefFaculties = softRefFaculties.length > 0;
  d.softRefFacultyNames = softRefFaculties.map((f) => f.name).join(', ');
  d.hasSoftRefBody = !!softRefBody;
  d.softRefBodyName = softRefBody?.name || '';
  d.softRefBodyInstall = softRefBody?.install || '';

  // Heartbeat — read from _heartbeatConfig (pre-injected from persona.json rhythm.heartbeat in generate())
  d.heartbeatExpected = persona._heartbeatConfig?.enabled === true;
  d.heartbeatStrategy = persona._heartbeatConfig?.strategy || 'smart';

  // Body dimension — runtime environment
  const bodyRt = (persona.body?.runtime) || null;
  d.hasBodyRuntime = !!bodyRt;
  // framework: canonical name (v0.17+); platform: deprecated alias (backward compat)
  d.bodyFramework = bodyRt?.framework || bodyRt?.platform || '';
  d.bodyChannels = bodyRt?.channels?.join(', ') || '';
  d.hasBodyCredentials = !!(bodyRt?.credentials?.length);
  d.bodyCredentialScopes = (bodyRt?.credentials || []).map((c) => `${c.scope} (${c.shared ? 'shared' : 'private'})`).join(', ');
  d.bodyResources = bodyRt?.resources?.join(', ') || '';
  d.hasSharedCredentials = (bodyRt?.credentials || []).some((c) => c.shared === true);
  d.hasPrivateCredentials = (bodyRt?.credentials || []).some((c) => c.shared === false);
  d.privateCredentialPath = `credentials/persona-${persona.slug}`;

  // Growth dimension — evolution boundaries + stage behaviors
  // After normalizeEvolutionInput(), all instance-scoped fields live under evolution.instance.
  const evoInstance = persona.evolution?.instance || null;
  const evoBoundaries = evoInstance?.boundaries || null;
  d.hasEvolutionBoundaries = !!evoBoundaries;
  d.immutableTraits = evoBoundaries?.immutableTraits || [];
  // Use explicit boolean flags to guard template rendering — Mustache treats 0 as falsy,
  // so {{#minFormality}} would silently skip rendering when minFormality=0 (a valid bound).
  d.hasMaxFormality = evoBoundaries !== null && evoBoundaries.maxFormality !== undefined && evoBoundaries.maxFormality !== null;
  d.hasMinFormality = evoBoundaries !== null && evoBoundaries.minFormality !== undefined && evoBoundaries.minFormality !== null;
  d.maxFormality = d.hasMaxFormality ? evoBoundaries.maxFormality : '';
  d.minFormality = d.hasMinFormality ? evoBoundaries.minFormality : '';
  const customStages = evoInstance?.stageBehaviors || null;
  d.hasStageBehaviors = !!customStages;
  d.stageBehaviorsBlock = customStages
    ? Object.entries(customStages).map(([stage, desc]) => `- **${stage}**: ${desc}`).join('\n')
    : '';

  // Evolution sources — external evolution signal sources (under evolution.instance.sources post-normalization).
  // Raw reading + soft-ref detection is done in generate() and passed as softRefSources.
  const rawSources = evoInstance?.sources || [];
  const validSources = rawSources.filter((ch) => ch && typeof ch === 'object' && ch.name);
  d.hasEvolutionSources = validSources.length > 0;
  d.evolutionSourceNames = validSources.map((ch) => ch.name).join(', ');
  d.softRefSources = softRefSources;
  d.hasSoftRefSources = softRefSources.length > 0;
  d.softRefSourceNames = softRefSources.map((ch) => ch.name).join(', ');
  d.softRefSourceInstalls = softRefSources.map((ch) => ch.install).join(', ');

  // Influence boundary — external personality influence access control
  const influenceBoundary = evoInstance?.influenceBoundary || null;
  d.hasInfluenceBoundary = !!(influenceBoundary && influenceBoundary.rules && influenceBoundary.rules.length > 0);
  d.influenceBoundaryPolicy = influenceBoundary?.defaultPolicy || 'reject';
  d.influenceableDimensions = d.hasInfluenceBoundary
    ? [...new Set(influenceBoundary.rules.map((r) => r.dimension))].join(', ')
    : '';
  d.influenceBoundaryRules = d.hasInfluenceBoundary
    ? influenceBoundary.rules.map((r) => ({
        dimension: r.dimension,
        allowFrom: r.allowFrom.join(', '),
        maxDrift: r.maxDrift,
      }))
    : [];
  const ibImmutable = evoBoundaries?.immutableTraits || [];
  const ibDimensions = d.hasInfluenceBoundary
    ? [...new Set(influenceBoundary.rules.map((r) => r.dimension))]
    : [];
  d.hasImmutableTraitsWarning = ibDimensions.includes('traits') && ibImmutable.length > 0;
  d.immutableTraitsForInfluence = ibImmutable.join(', ');

  // hasDormantCapabilities — controls the "Dormant Capabilities" block in soul/injection.md.
  // Covers everything the persona knows about but cannot currently exercise, including heartbeat
  // (the persona should know it can proactively reach out, even if the runner doesn't support it yet).
  //
  // hasExpectedCapabilities — controls the "Expected Capabilities" install table in SKILL.md.
  // Deliberately excludes heartbeat: heartbeat is behavioral awareness, not an installable package.
  // (See skill.template.md: {{#hasExpectedCapabilities}} guard)
  d.hasDormantCapabilities = d.hasSoftRefSkills || d.hasSoftRefFaculties ||
    d.hasSoftRefBody || d.heartbeatExpected || d.hasSoftRefSources;
  d.hasExpectedCapabilities = d.hasSoftRefSkills || d.hasSoftRefFaculties ||
    d.hasSoftRefBody || d.hasSoftRefSources;

  // Skill trust gate — awareness injected into soul Body section
  const evoSkill = persona.evolution?.skill || null;
  d.hasSkillTrustPolicy = !!(evoSkill && evoSkill.minTrustLevel);
  d.skillMinTrustLevel = evoSkill?.minTrustLevel || '';

  // Economy faculty awareness
  // Primary path: economy.enabled (v0.17+) — economy as systemic concept in loadedAspects
  // Legacy path: loadedFaculties includes 'economy' entry (backward compat — pre-separation)
  const economyEnabled =
    persona.economy?.enabled === true ||
    loadedAspects.some((a) => a.name === 'economy') ||
    loadedFaculties.some((f) => f.name === 'economy');
  d.hasEconomyFaculty = economyEnabled;
  // Survival Policy: opt-in; default false keeps companion/roleplay personas silent about money
  d.hasSurvivalPolicy = economyEnabled && (persona.economy?.survivalPolicy === true);

  return d;
}

module.exports = { computeDerivedFields, DERIVED_FIELDS };
