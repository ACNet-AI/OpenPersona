/**
 * OpenPersona - Social aspect builder
 *
 * Builds A2A Agent Card and ACN config objects from persona data.
 * Social is one of the five systemic concepts in the 4+5+3 architecture.
 * Unlike Economy, Social has no runtime scripts to copy into skill packs —
 * these functions are pure computation that generates output files from persona data.
 */
const crypto = require('crypto');
const { version: FRAMEWORK_VERSION } = require('../../package.json');

/**
 * Derive a deterministic EVM-format wallet address from a persona slug.
 * Used for acn-config.json (on-chain identity) and economy/economic-identity.json.
 * The same slug always produces the same address — persona identity is stable across re-generations.
 */
function deriveWalletAddress(slug) {
  const hash = crypto.createHash('sha256').update(slug + 'openpersona').digest('hex');
  return '0x' + hash.slice(-40);
}

/**
 * Build the A2A Agent Card and the skill list it references.
 *
 * @param {object} persona         - normalized persona object
 * @param {Array}  loadedFaculties - resolved faculty objects
 * @param {Array}  activeSkills    - resolved skill objects
 * @returns {{ agentCard: object, agentCardSkills: Array }}
 */
function buildAgentCard(persona, loadedFaculties, activeSkills) {
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
    protocolVersion: persona.social?.a2a?.protocol || '0.3.0',
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

  return { agentCard, agentCardSkills };
}

/**
 * Build the ACN AgentRegisterRequest config object.
 *
 * @param {object} persona        - normalized persona object
 * @param {Array}  agentCardSkills - from buildAgentCard()
 * @returns {object} ACN config
 */
function buildAcnConfig(persona, agentCardSkills) {
  const acnGateway = persona.social?.acn?.gateway || persona.body?.runtime?.acn_gateway || '<RUNTIME_ACN_GATEWAY>';
  const chain = persona.social?.onchain?.chain || 'base';
  return {
    acn_gateway: acnGateway,
    owner: '<RUNTIME_OWNER>',
    name: persona.personaName,
    endpoint: '<RUNTIME_ENDPOINT>',
    skills: agentCardSkills.map((s) => s.id),
    agent_card: './agent-card.json',
    subnet_ids: ['public'],
    wallet_address: deriveWalletAddress(persona.slug),
    onchain: {
      erc8004: {
        chain,
        identity_contract: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        registration_script: 'npx @agentplanet/acn register-onchain',
      },
    },
  };
}

module.exports = { deriveWalletAddress, buildAgentCard, buildAcnConfig };
