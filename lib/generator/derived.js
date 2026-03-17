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
 * Compute all derived template variables and attach them to the persona object.
 *
 * @param {object} persona - Mutable persona object (modified in-place)
 * @param {object} context
 * @param {object[]} context.loadedFaculties
 * @param {object[]} context.softRefSkills
 * @param {object[]} context.softRefFaculties
 * @param {object|null} context.softRefBody
 * @param {object[]} context.softRefSources   - renamed from softRefChannels
 * @param {boolean} context.evolutionEnabled
 * @param {string[]} context.facultyNames
 */
function computeDerivedFields(persona, {
  loadedFaculties,
  softRefSkills,
  softRefFaculties,
  softRefBody,
  softRefSources,
  evolutionEnabled,
  facultyNames,
  activeSkillNames = [],
}) {
  // Identity classification
  persona.role = persona.role || (persona.personaType !== 'virtual' && persona.personaType ? persona.personaType : 'companion');
  persona.isDigitalTwin = !!persona.sourceIdentity;
  persona.sourceIdentityName = persona.sourceIdentity?.name || '';
  persona.sourceIdentityKind = persona.sourceIdentity?.kind || '';
  persona.roleFoundation = ROLE_FOUNDATIONS[persona.role] || `You serve as a ${persona.role} to your user — fulfilling this role with authenticity and care.`;

  // Mustache helpers
  persona.evolutionEnabled = evolutionEnabled;
  // selfie migrated from Faculty → Skill; check both for backward compatibility
  persona.hasSelfie = facultyNames.includes('selfie') || activeSkillNames.includes('selfie');

  // Capabilities dimension — dormant gap detection
  persona.softRefSkills = softRefSkills;
  persona.hasSoftRefSkills = softRefSkills.length > 0;
  persona.softRefSkillNames = softRefSkills.map((s) => s.name).join(', ');
  persona.softRefFaculties = softRefFaculties;
  persona.hasSoftRefFaculties = softRefFaculties.length > 0;
  persona.softRefFacultyNames = softRefFaculties.map((f) => f.name).join(', ');
  persona.hasSoftRefBody = !!softRefBody;
  persona.softRefBodyName = softRefBody?.name || '';
  persona.softRefBodyInstall = softRefBody?.install || '';

  // Heartbeat — read from _heartbeatConfig (pre-injected from persona.json rhythm.heartbeat in generate())
  persona.heartbeatExpected = persona._heartbeatConfig?.enabled === true;
  persona.heartbeatStrategy = persona._heartbeatConfig?.strategy || 'smart';

  // Body dimension — runtime environment
  const bodyRt = (persona.body?.runtime) || null;
  persona.hasBodyRuntime = !!bodyRt;
  // framework: canonical name (v0.17+); platform: deprecated alias (backward compat)
  persona.bodyFramework = bodyRt?.framework || bodyRt?.platform || '';
  persona.bodyChannels = bodyRt?.channels?.join(', ') || '';
  persona.hasBodyCredentials = !!(bodyRt?.credentials?.length);
  persona.bodyCredentialScopes = (bodyRt?.credentials || []).map((c) => `${c.scope} (${c.shared ? 'shared' : 'private'})`).join(', ');
  persona.bodyResources = bodyRt?.resources?.join(', ') || '';
  persona.hasSharedCredentials = (bodyRt?.credentials || []).some((c) => c.shared === true);
  persona.hasPrivateCredentials = (bodyRt?.credentials || []).some((c) => c.shared === false);
  persona.privateCredentialPath = `credentials/persona-${persona.slug}`;

  // Growth dimension — evolution boundaries + stage behaviors
  const evoBoundaries = persona.evolution?.boundaries || null;
  persona.hasEvolutionBoundaries = !!evoBoundaries;
  persona.immutableTraits = evoBoundaries?.immutableTraits || [];
  // Use explicit boolean flags to guard template rendering — Mustache treats 0 as falsy,
  // so {{#minFormality}} would silently skip rendering when minFormality=0 (a valid bound).
  persona.hasMaxFormality = evoBoundaries !== null && evoBoundaries.maxFormality !== undefined && evoBoundaries.maxFormality !== null;
  persona.hasMinFormality = evoBoundaries !== null && evoBoundaries.minFormality !== undefined && evoBoundaries.minFormality !== null;
  persona.maxFormality = persona.hasMaxFormality ? evoBoundaries.maxFormality : '';
  persona.minFormality = persona.hasMinFormality ? evoBoundaries.minFormality : '';
  const customStages = persona.evolution?.stageBehaviors || null;
  persona.hasStageBehaviors = !!customStages;
  if (customStages) {
    persona.stageBehaviorsBlock = Object.entries(customStages)
      .map(([stage, desc]) => `- **${stage}**: ${desc}`)
      .join('\n');
  }

  // Evolution sources — external evolution signal sources
  // evolution.sources is canonical (v0.17+); evolution.channels is the deprecated alias.
  // Raw reading + soft-ref detection is done in generate() and passed as softRefSources.
  const rawSources = persona.evolution?.sources || persona.evolution?.channels || [];
  const validSources = rawSources.filter((ch) => ch && typeof ch === 'object' && ch.name);
  persona.hasEvolutionSources = validSources.length > 0;
  persona.evolutionSourceNames = validSources.map((ch) => ch.name).join(', ');
  persona.softRefSources = softRefSources;
  persona.hasSoftRefSources = softRefSources.length > 0;
  persona.softRefSourceNames = softRefSources.map((ch) => ch.name).join(', ');
  persona.softRefSourceInstalls = softRefSources.map((ch) => ch.install).join(', ');

  // Influence boundary — external personality influence access control
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

  // hasDormantCapabilities — controls the "Dormant Capabilities" block in soul/injection.md.
  // Covers everything the persona knows about but cannot currently exercise, including heartbeat
  // (the persona should know it can proactively reach out, even if the runner doesn't support it yet).
  //
  // hasExpectedCapabilities — controls the "Expected Capabilities" install table in SKILL.md.
  // Deliberately excludes heartbeat: heartbeat is behavioral awareness, not an installable package.
  // (See skill.template.md: {{#hasExpectedCapabilities}} guard)
  persona.hasDormantCapabilities = persona.hasSoftRefSkills || persona.hasSoftRefFaculties ||
    persona.hasSoftRefBody || persona.heartbeatExpected || persona.hasSoftRefSources;
  persona.hasExpectedCapabilities = persona.hasSoftRefSkills || persona.hasSoftRefFaculties ||
    persona.hasSoftRefBody || persona.hasSoftRefSources;

  // Economy faculty awareness
  // New path: economy.enabled (v0.17+) — economy as cross-cutting concept, not a traditional Faculty
  // Old path: loadedFaculties includes 'economy' entry (backward compat)
  const economyEnabled =
    persona.economy?.enabled === true ||
    loadedFaculties.some((f) => f.name === 'economy');
  persona.hasEconomyFaculty = economyEnabled;
  // Survival Policy: opt-in; default false keeps companion/roleplay personas silent about money
  persona.hasSurvivalPolicy = economyEnabled && (persona.economy?.survivalPolicy === true);
}

module.exports = { computeDerivedFields, DERIVED_FIELDS };
