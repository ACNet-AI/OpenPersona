/**
 * OpenPersona - Evolution governance utilities
 */
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { OP_SKILLS_DIR, resolveSoulFile } = require('./utils');

/**
 * Generate and optionally print an evolution report for a persona.
 *
 * @param {string} slug - Persona slug
 * @param {object} [options]
 * @param {string} [options.skillsDir] - Override skills directory (for testing)
 * @param {boolean} [options.quiet] - Suppress console output
 * @returns {{ state: object, personaName: string }}
 */
async function evolveReport(slug, options = {}) {
  const skillsDir = options.skillsDir || OP_SKILLS_DIR;
  const quiet = options.quiet || false;
  const skillDir = path.join(skillsDir, `persona-${slug}`);

  if (!fs.existsSync(skillDir)) {
    throw new Error(`Persona not found: persona-${slug}`);
  }

  const statePath = resolveSoulFile(skillDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`No evolution state found for persona-${slug}. Is evolution enabled?`);
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  const personaPath = resolveSoulFile(skillDir, 'persona.json');
  let personaName = slug;
  if (fs.existsSync(personaPath)) {
    try {
      const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
      personaName = persona.personaName || slug;
    } catch { /* use slug as fallback */ }
  }

  if (!quiet) {
    printReport(state, personaName, slug);
  }

  return { state, personaName };
}

function printReport(state, personaName, slug) {
  const lines = [];
  const sep = '─'.repeat(44);

  lines.push('');
  lines.push(chalk.bold(`  Evolution Report: ${personaName}`));
  lines.push(`  ${sep}`);

  lines.push(`  Slug:         ${state.personaSlug || slug}`);
  lines.push(`  Created:      ${state.createdAt || 'unknown'}`);
  lines.push(`  Last Updated: ${state.lastUpdatedAt || 'unknown'}`);
  lines.push('');

  const rel = state.relationship || {};
  lines.push(chalk.bold('  Relationship'));
  lines.push(`  Stage:        ${rel.stage || 'unknown'}`);
  lines.push(`  Interactions: ${rel.interactionCount || 0}`);
  if (rel.firstInteraction) lines.push(`  First:        ${rel.firstInteraction}`);
  if (rel.lastInteraction) lines.push(`  Last:         ${rel.lastInteraction}`);
  if (rel.stageHistory?.length) {
    lines.push(`  History:      ${rel.stageHistory.map((s) => s.stage || s).join(' → ')}`);
  }
  lines.push('');

  const mood = state.mood || {};
  lines.push(chalk.bold('  Mood'));
  lines.push(`  Current:      ${mood.current || 'neutral'} (intensity: ${mood.intensity ?? 0.5})`);
  lines.push(`  Baseline:     ${mood.baseline || 'neutral'}`);
  lines.push('');

  const traits = state.evolvedTraits || [];
  lines.push(chalk.bold('  Evolved Traits'));
  if (traits.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const t of traits) {
      if (typeof t === 'string') {
        lines.push(`  • ${t}`);
      } else {
        lines.push(`  • ${t.name || t.trait || JSON.stringify(t)}${t.acquiredAt ? ` (since ${t.acquiredAt})` : ''}`);
      }
    }
  }
  lines.push('');

  const drift = state.speakingStyleDrift || {};
  lines.push(chalk.bold('  Speaking Style Drift'));
  lines.push(`  Formality:       ${drift.formality || 0}`);
  lines.push(`  Emoji frequency: ${drift.emoji_frequency || 0}`);
  lines.push(`  Verbosity:       ${drift.verbosity || 0}`);
  lines.push('');

  const interests = state.interests || {};
  const interestEntries = Object.entries(interests);
  lines.push(chalk.bold('  Interests'));
  if (interestEntries.length === 0) {
    lines.push('  (none discovered yet)');
  } else {
    const sorted = interestEntries.sort((a, b) => b[1] - a[1]);
    for (const [topic, weight] of sorted) {
      const bar = '█'.repeat(Math.max(0, Math.min(Math.round(weight), 20)));
      lines.push(`  ${bar} ${topic} (${weight})`);
    }
  }
  lines.push('');

  const milestones = state.milestones || [];
  lines.push(chalk.bold('  Milestones'));
  if (milestones.length === 0) {
    lines.push('  (none yet)');
  } else {
    for (const m of milestones) {
      const ts = m.timestamp ? ` [${m.timestamp}]` : '';
      lines.push(`  ★ ${m.description || m.type || JSON.stringify(m)}${ts}`);
    }
  }

  const history = state.stateHistory || [];
  if (history.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  State History'));
    lines.push(`  Snapshots: ${history.length}`);
    const latest = history[history.length - 1];
    if (latest?.timestamp || latest?.lastUpdatedAt) {
      lines.push(`  Latest:    ${latest.timestamp || latest.lastUpdatedAt}`);
    }
  }

  lines.push(`\n  ${sep}`);
  console.log(lines.join('\n'));
}

module.exports = { evolveReport };
