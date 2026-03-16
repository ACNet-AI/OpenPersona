/**
 * OpenPersona - Persona fork logic
 *
 * Derives a child persona from an installed parent:
 *   - Inherits evolution.boundaries, faculties, skills, body.runtime
 *   - Resets soul/state.json and soul/self-narrative.md (fresh runtime state)
 *   - Writes soul/lineage.json (parent slug, constitution hash, generation depth)
 */
const path = require('path');
const fs = require('fs-extra');
const { createHash } = require('crypto');
const { generate } = require('./generator');
const { install } = require('./installer');
const { resolvePersonaDir } = require('./state-runner');
const { printError, printSuccess, printInfo, OP_SKILLS_DIR } = require('./utils');

/**
 * Fork an installed persona into a specialized child.
 *
 * @param {string} parentSlug - Slug of the installed parent persona
 * @param {object} options
 * @param {string} options.as - Slug for the child persona (required)
 * @param {string} [options.name] - Override child persona name
 * @param {string} [options.bio] - Override bio
 * @param {string} [options.personality] - Override personality
 * @param {string} [options.reason='specialization'] - Fork reason written to lineage.json
 * @param {string} [options.output=process.cwd()] - Output directory
 * @param {boolean} [options.install=false] - Auto-install after generation
 * @returns {Promise<{ skillDir: string, lineage: object }>}
 */
async function forkPersona(parentSlug, options = {}) {
  const parentDir = resolvePersonaDir(parentSlug);
  if (!parentDir) {
    throw new Error(`Persona not found: "${parentSlug}". Install it first with: openpersona install <source>`);
  }

  const parentPersonaPath = path.join(parentDir, 'soul', 'persona.json');
  if (!fs.existsSync(parentPersonaPath)) {
    throw new Error(`Persona not found: "${parentSlug}". Install it first with: openpersona install <source>`);
  }

  const newSlug = options.as;
  if (!newSlug) throw new Error('options.as (child slug) is required');

  const childDir = path.join(OP_SKILLS_DIR, `persona-${newSlug}`);
  if (fs.existsSync(childDir)) {
    throw new Error(`Persona already exists: persona-${newSlug}. Choose a different slug.`);
  }

  const parentPersona = JSON.parse(fs.readFileSync(parentPersonaPath, 'utf-8'));

  const parentLineagePath = path.join(parentDir, 'soul', 'lineage.json');
  const parentLineage = fs.existsSync(parentLineagePath)
    ? JSON.parse(fs.readFileSync(parentLineagePath, 'utf-8'))
    : null;
  const generation = parentLineage ? (parentLineage.generation || 0) + 1 : 1;

  // Build forked persona — override selectively
  const forkedPersona = JSON.parse(JSON.stringify(parentPersona));
  forkedPersona.slug = newSlug;
  forkedPersona.personaName = options.name || `${parentPersona.personaName}-${newSlug}`;
  forkedPersona.forkOf = parentSlug;
  if (options.bio) forkedPersona.bio = options.bio;
  if (options.personality) forkedPersona.personality = options.personality;

  const outputDir = path.resolve(options.output || process.cwd());
  const { skillDir } = await generate(forkedPersona, outputDir);

  // Compute constitution hash for lineage integrity verification
  const constitutionPath = path.join(skillDir, 'soul', 'constitution.md');
  let constitutionHash = '';
  if (fs.existsSync(constitutionPath)) {
    constitutionHash = createHash('sha256')
      .update(fs.readFileSync(constitutionPath))
      .digest('hex');
  }

  const lineage = {
    generation,
    parentSlug,
    parentEndpoint: null,
    parentAddress: null,
    forkReason: options.reason || 'specialization',
    forkedAt: new Date().toISOString(),
    constitutionHash,
    children: [],
  };
  await fs.writeFile(
    path.join(skillDir, 'soul', 'lineage.json'),
    JSON.stringify(lineage, null, 2)
  );

  if (options.install) {
    await install(skillDir);
  }

  return { skillDir, lineage };
}

module.exports = { forkPersona };
