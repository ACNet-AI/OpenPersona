#!/usr/bin/env node
/**
 * OpenPersona CLI - Full persona package manager
 * Commands: create | install | search | uninstall | update | list | switch | publish | curate | reset | evolve-report | contribute | export | import | acn-register | state
 */
const path = require('path');
const os   = require('os');
const fs = require('fs-extra');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { generate } = require('../lib/generator');
const { install } = require('../lib/lifecycle/installer');
const { download } = require('../lib/remote/downloader');
const { search } = require('../lib/remote/searcher');
const { uninstall } = require('../lib/lifecycle/uninstaller');
const publishAdapter = require('../lib/publisher');
const { curate } = require('../lib/remote/curator');
const { contribute } = require('../lib/lifecycle/contributor');
const { switchPersona, listPersonas } = require('../lib/lifecycle/switcher');
const { registerWithAcn } = require('../lib/remote/registrar');
const { OP_PERSONA_HOME, resolveSoulFile, printError, printSuccess, printInfo, printWarning } = require('../lib/utils');
const { resolvePersonaDir, runStateSyncCommand } = require('../lib/state/runner');
const { forkPersona } = require('../lib/lifecycle/forker');
const { exportPersona, importPersona } = require('../lib/lifecycle/porter');

const PKG_ROOT = path.resolve(__dirname, '..');
const PRESETS_DIR = path.join(PKG_ROOT, 'presets');

const { version: CLI_VERSION } = require('../package.json');

program
  .name('openpersona')
  .description('OpenPersona - Create, manage, and orchestrate agent personas')
  .version(CLI_VERSION);

if (process.argv.length === 2) {
  process.argv.push('create');
}

program
  .command('create')
  .description('Create a new persona skill pack (interactive wizard)')
  .option('--preset <name>', 'Use preset (base, samantha, ai-girlfriend, life-assistant, health-butler, stoic-mentor)')
  .option('--config <path>', 'Load external persona.json')
  .option('--output <dir>', 'Output directory', process.cwd())
  .option('--install', 'Install to ~/.openpersona after generation')
  .option('--dry-run', 'Preview only, do not write files')
  .action(async (options) => {
    let persona = {};
    if (options.preset) {
      const presetDir = path.join(PRESETS_DIR, options.preset);
      const presetPath = path.join(presetDir, 'persona.json');
      if (!fs.existsSync(presetPath)) {
        printError(`Preset not found: ${options.preset}`);
        process.exit(1);
      }
      persona = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
    } else if (options.config) {
      const configPath = path.resolve(options.config);
      if (!fs.existsSync(configPath)) {
        printError(`Config not found: ${configPath}`);
        process.exit(1);
      }
      persona = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      // Non-interactive guard: agents and CI environments have no TTY.
      // Hanging on prompts is worse than a clear error — fail fast.
      if (!process.stdin.isTTY) {
        printError(
          'No --preset or --config provided and stdin is not a TTY (non-interactive environment).\n' +
          '  Agent usage:   npx openpersona create --config ./persona.json --install\n' +
          '  Preset usage:  npx openpersona create --preset base --install\n' +
          '  Human wizard:  run in an interactive terminal without flags'
        );
        process.exit(1);
      }
      const { mode } = await inquirer.prompt([{
        type: 'list',
        name: 'mode',
        message: 'How would you like to create your persona?',
        choices: [
          { name: 'Base        — blank-slate with memory + voice + evolution (recommended)', value: 'base' },
          { name: 'Preset      — pick a pre-built character (samantha, stoic-mentor, life-assistant…)', value: 'preset' },
          { name: 'From scratch — guided wizard', value: 'custom' },
        ],
      }]);

      if (mode === 'base') {
        options.preset = 'base';
        persona = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, 'base', 'persona.json'), 'utf-8'));
      } else if (mode === 'preset') {
        const presetChoices = fs.readdirSync(PRESETS_DIR)
          .filter((d) => fs.existsSync(path.join(PRESETS_DIR, d, 'persona.json')))
          .filter((d) => d !== 'base');
        const { presetName } = await inquirer.prompt([{
          type: 'list',
          name: 'presetName',
          message: 'Choose a preset:',
          choices: presetChoices,
        }]);
        options.preset = presetName;
        persona = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, presetName, 'persona.json'), 'utf-8'));
      } else {
        const { slugify } = require('../lib/utils');
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'personaName',
            message: 'Persona name:',
            default: 'Alex',
          },
          {
            type: 'input',
            name: 'slug',
            message: 'Slug (directory name + CLI commands):',
            default: (a) => slugify(a.personaName),
          },
          {
            type: 'list',
            name: 'role',
            message: 'Role (what is this persona to the user?):',
            choices: [
              { name: 'assistant  — general-purpose helper', value: 'assistant' },
              { name: 'companion  — emotional connection, evolving relationship', value: 'companion' },
              { name: 'coach      — accountability, guidance, skill-building', value: 'coach' },
              { name: 'mentor     — wisdom, long-term growth', value: 'mentor' },
              { name: 'character  — fictional persona / roleplay', value: 'character' },
              { name: 'other      — enter your own', value: 'other' },
            ],
          },
          {
            type: 'input',
            name: 'roleCustom',
            message: 'Enter custom role:',
            when: (a) => a.role === 'other',
          },
          {
            type: 'input',
            name: 'bio',
            message: 'One-line bio:',
            default: 'An adaptive AI persona ready to help and grow through interaction',
          },
          {
            type: 'input',
            name: 'personality',
            message: 'Personality (comma-separated traits):',
            default: 'curious, direct, honest',
          },
          {
            type: 'input',
            name: 'speakingStyle',
            message: 'Speaking style:',
            default: 'Clear and natural; adapts tone to context',
          },
          {
            type: 'list',
            name: 'framework',
            message: 'Agent runner (which AI agent will host this persona?):',
            choices: [
              { name: 'openclaw   — OpenClaw (default)', value: 'openclaw' },
              { name: 'cursor     — Cursor IDE agent', value: 'cursor' },
              { name: 'claude-code — Claude Code CLI', value: 'claude-code' },
              { name: 'codex      — OpenAI Codex', value: 'codex' },
              { name: 'other      — enter manually', value: 'other' },
              { name: 'skip       — set later', value: '' },
            ],
          },
          {
            type: 'input',
            name: 'frameworkCustom',
            message: 'Enter framework name:',
            when: (a) => a.framework === 'other',
          },
          {
            type: 'checkbox',
            name: 'extraFaculties',
            message: 'Optional faculties (memory is auto-included by the framework):',
            choices: [
              { name: 'voice — text-to-speech (ElevenLabs / OpenAI TTS)', value: 'voice' },
            ],
          },
          {
            type: 'checkbox',
            name: 'skills',
            message: 'Built-in skills (on-demand actions):',
            choices: [
              { name: 'selfie   — AI image generation', value: 'selfie' },
              { name: 'music    — music composition', value: 'music' },
              { name: 'reminder — scheduled reminders', value: 'reminder' },
            ],
          },
          {
            type: 'confirm',
            name: 'evolutionEnabled',
            message: 'Enable soul evolution? (personality grows through interaction)',
            default: true,
          },
          {
            type: 'input',
            name: 'immutableTraits',
            message: 'Immutable traits — will never drift (comma-separated):',
            default: 'honest, curious',
            when: (a) => a.evolutionEnabled,
          },
        ]);

        const role = answers.role === 'other' ? (answers.roleCustom || '').trim() || 'assistant' : answers.role;
        const framework = answers.framework === 'other' ? (answers.frameworkCustom || '').trim() : answers.framework;
        const faculties = (answers.extraFaculties || []).map((name) => ({ name }));
        const skills = (answers.skills || []).map((name) => ({ name }));
        const immutableTraits = answers.immutableTraits
          ? answers.immutableTraits.split(',').map((t) => t.trim()).filter(Boolean)
          : ['honest', 'curious'];

        persona = {
          soul: {
            identity: {
              personaName: answers.personaName,
              slug: answers.slug,
              role,
              bio: answers.bio,
            },
            character: {
              personality: answers.personality,
              speakingStyle: answers.speakingStyle,
            },
          },
          ...(framework ? { body: { runtime: { framework } } } : {}),
          ...(faculties.length ? { faculties } : {}),
          ...(skills.length ? { skills } : {}),
          ...(answers.evolutionEnabled ? {
            evolution: {
              instance: {
                enabled: true,
                boundaries: {
                  immutableTraits,
                  minFormality: -3,
                  maxFormality: 6,
                },
              },
            },
          } : {}),
        };
      }
    }

    try {
      const outputDir = path.resolve(options.output);
      if (options.dryRun) {
        // Resolve grouped soul format before accessing top-level fields
        const flatName = persona.personaName || persona.soul?.identity?.personaName;
        const flatSlug = persona.slug || persona.soul?.identity?.slug;
        const { slugify } = require('../lib/utils');
        printInfo('Dry run — preview only, no files written.');
        printInfo(`Would generate: persona-${flatSlug || slugify(flatName)}/`);
        printInfo(`  SKILL.md, soul/, references/, agent-card.json, acn-config.json, scripts/, state.json`);
        if (persona.evolution?.enabled || persona.evolution?.instance?.enabled) {
          printInfo(`  soul/self-narrative.md (★Experimental — evolution enabled)`);
        }
        const faculties = (persona.faculties || []).map((f) => (typeof f === 'string' ? f : f.name));
        const skills = (persona.skills || []).map((s) => (typeof s === 'string' ? s : s.name));
        if (faculties.length) printInfo(`  Faculties: ${faculties.join(', ')}`);
        if (skills.length) printInfo(`  Skills: ${skills.join(', ')}`);
        return;
      }
      const { skillDir } = await generate(persona, outputDir);
      printSuccess('Generated: ' + skillDir);
      if (options.install) {
        await install(skillDir);
      } else {
        printInfo('Run: npx openpersona create --config ./persona.json --output . --install');
      }
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('install <target>')
  .description('Install persona (slug, owner/repo, or owner/repo#subpath)')
  .option('--registry <name>', 'Registry (acnlabs, skillssh)', 'acnlabs')
  .action(async (target, options) => {
    try {
      const result = await download(target, options.registry);
      if (result.skipCopy) {
        await install(result.dir, { skipCopy: true, source: target });
      } else {
        await install(result.dir, { source: target });
      }
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search personas in the OpenPersona directory')
  .option('--type <type>', 'Filter by pack type: single or multi')
  .action(async (query, options) => {
    try {
      await search(query, { type: options.type });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('uninstall <slug>')
  .description('Uninstall persona')
  .action(async (slug) => {
    try {
      await uninstall(slug);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('update <slug>')
  .description('Update installed persona')
  .action(async (slug) => {
    const skillDir = resolvePersonaDir(slug);
    if (!skillDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }
    const personaPath = resolveSoulFile(skillDir, 'persona.json');
    if (!fs.existsSync(personaPath)) {
      printError('persona.json not found');
      process.exit(1);
    }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const tmpDir = path.join(require('os').tmpdir(), 'openpersona-update-' + Date.now());
    await fs.ensureDir(tmpDir);
    const { skillDir: newDir } = await generate(persona, tmpDir);
    // Preserve runtime evolution artifacts — these represent accumulated persona growth
    const runtimeArtifacts = [
      'state.json',
      'soul/self-narrative.md',
      // lineage.json records fork parentage + constitution hash — must survive updates
      // so trust chain verification (installer.js verifyConstitutionHash) keeps working
      'soul/lineage.json',
    ];
    for (const rel of runtimeArtifacts) {
      const src = path.join(skillDir, rel);
      const dst = path.join(newDir, rel);
      if (fs.existsSync(src)) {
        await fs.copy(src, dst);
      }
    }
    await fs.remove(skillDir);
    await fs.move(newDir, skillDir);
    await fs.remove(tmpDir);
    await install(skillDir, { skipCopy: true });
    printSuccess('Updated persona-' + slug);
  });

program
  .command('fork <parent-slug>')
  .description('Fork an installed persona into a specialized child')
  .requiredOption('--as <new-slug>', 'Slug for the child persona')
  .option('--name <name>', 'Child persona name (default: "<ParentName>-<new-slug>")')
  .option('--bio <bio>', 'Override bio')
  .option('--personality <keywords>', 'Override personality (comma-separated)')
  .option('--reason <text>', 'Fork reason, written into lineage.json', 'specialization')
  .option('--output <dir>', 'Output directory', process.cwd())
  .option('--install', 'Install to ~/.openpersona after generation')
  .action(async (parentSlug, options) => {
    try {
      const { skillDir, lineage } = await forkPersona(parentSlug, {
        as: options.as,
        name: options.name,
        bio: options.bio,
        personality: options.personality,
        reason: options.reason,
        output: options.output,
        install: options.install,
      });
      printSuccess(`Forked: ${skillDir}`);
      printInfo(`  Parent: persona-${parentSlug}  →  Child: persona-${options.as} (generation ${lineage.generation})`);
      printInfo(`  Constitution hash: ${lineage.constitutionHash.slice(0, 16)}...`);
      if (!options.install) {
        printInfo(`To install: npx openpersona install ${skillDir}`);
      }
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List installed personas')
  .action(async () => {
    const personas = await listPersonas();
    if (personas.length === 0) {
      printInfo('No personas installed.');
      return;
    }
    for (const p of personas) {
      const marker = p.active ? chalk.green(' ← active') : '';
      const status = p.enabled ? '' : chalk.dim(' (disabled)');
      const typeTag = p.packType && p.packType !== 'single' ? chalk.cyan(` [${p.packType}]`) : '';
      console.log(`  ${p.personaName} (persona-${p.slug})${typeTag}${marker}${status}`);
    }
  });

program
  .command('switch <slug>')
  .description('Switch active persona')
  .action(async (slug) => {
    try {
      await switchPersona(slug);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('publish <owner/repo>')
  .description('Validate a GitHub repo as a persona pack and register it with the OpenPersona directory (e.g. alice/my-persona)')
  .action(async (ownerRepo) => {
    try {
      await publishAdapter.publish(ownerRepo);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('curate <owner/repo>')
  .description('Curator-only: actively collect a popular persona pack from the market into the OpenPersona directory (requires OPENPERSONA_CURATOR_TOKEN)')
  .option('--type <type>', 'Pack type: single (default), multi, or tool', 'single')
  .option('--role <role>', 'Override role for non-OpenPersona packs (companion/assistant/mentor/character/tool/...). Defaults to value in persona.json, or "companion" if absent.')
  .option('--token <token>', 'Curator authentication token (falls back to OPENPERSONA_CURATOR_TOKEN env)')
  .option('--tags <tags>', 'Comma-separated tag list for discovery (e.g. "companion,wellness"). See CURATION-STANDARDS.md for the full tag taxonomy.')
  .option('--min-stars <n>', 'Minimum GitHub star count (default: 500). Override for exceptional cases.', '500')
  .action(async (ownerRepo, options) => {
    try {
      await curate(ownerRepo, { packType: options.type, role: options.role, token: options.token, tags: options.tags, minStars: parseInt(options.minStars, 10) });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('reset <slug>')
  .description('★Experimental: Reset soul evolution state')
  .action(async (slug) => {
    const skillDir = resolvePersonaDir(slug);
    if (!skillDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }
    const personaPath = resolveSoulFile(skillDir, 'persona.json');
    const soulStatePath = resolveSoulFile(skillDir, 'state.json');
    if (!fs.existsSync(personaPath) || !fs.existsSync(soulStatePath)) {
      printError('Persona or soul state not found');
      process.exit(1);
    }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const templatePath = path.join(PKG_ROOT, 'templates', 'soul', 'soul-state.template.json');
    const tpl = fs.readFileSync(templatePath, 'utf-8');
    const Mustache = require('mustache');
    const now = new Date().toISOString();
    const moodBaseline = persona.personality?.split(',')[0]?.trim() || 'neutral';
    const soulState = Mustache.render(tpl, { slug, createdAt: now, lastUpdatedAt: now, moodBaseline });
    fs.writeFileSync(soulStatePath, soulState);
    printSuccess('Reset soul evolution state');
  });

program
  .command('evolve-report <slug>')
  .description('★Experimental: Show evolution report for a persona')
  .action(async (slug) => {
    try {
      const { evolveReport } = require('../lib/state/evolution');
      await evolveReport(slug);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('contribute [slug]')
  .description('Persona Harvest — submit persona improvements as a PR to the community')
  .option('--mode <mode>', 'Contribution scope: preset or framework', 'preset')
  .option('--dry-run', 'Show diff only, do not create PR')
  .action(async (slug, options) => {
    try {
      if (options.mode === 'preset' && !slug) {
        printError('Slug required for preset contributions. Example: npx openpersona contribute samantha');
        process.exit(1);
      }
      await contribute(slug, { mode: options.mode, dryRun: options.dryRun });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('acn-register [slug]')
  .description('Register a persona with ACN (Agent Communication Network)')
  .option('--endpoint <url>', 'Agent A2A endpoint URL (replaces <RUNTIME_ENDPOINT> placeholder)')
  .option('--dir <path>', 'Path to persona pack directory (overrides slug lookup)')
  .option('--dry-run', 'Preview registration payload without calling ACN')
  .action(async (slug, options) => {
    let skillDir;

    if (options.dir) {
      skillDir = path.resolve(options.dir);
    } else if (slug) {
      skillDir = resolvePersonaDir(slug);
    } else {
      // Try current directory
      skillDir = process.cwd();
    }

    if (!require('fs-extra').existsSync(path.join(skillDir, 'acn-config.json'))) {
      printError(`No acn-config.json found in ${skillDir}. Provide a slug or --dir pointing to a generated persona pack.`);
      process.exit(1);
    }

    try {
      const result = await registerWithAcn(skillDir, {
        endpoint: options.endpoint,
        dryRun: options.dryRun,
      });

      if (options.dryRun) return;

      printSuccess(`Registered with ACN!`);
      printInfo(`  Agent ID:   ${result.agent_id}`);
      printInfo(`  Status:     ${result.status}`);
      printInfo(`  Claim URL:  ${result.claim_url}`);
      printInfo(`  Card URL:   ${result.agent_card_url}`);
      printInfo(`  Heartbeat:  ${result.heartbeat_endpoint}`);
      printInfo(`  Saved:      acn-registration.json`);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('export <slug>')
  .description('Export persona pack (with soul state) as a zip archive')
  .option('-o, --output <path>', 'Output file path')
  .action(async (slug, options) => {
    const skillDir = resolvePersonaDir(slug);
    if (!skillDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }
    try {
      const outPath = exportPersona(skillDir, options.output);
      printSuccess(`Exported to ${outPath}`);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('import <file>')
  .description('Import persona pack from a zip archive and install')
  .option('-o, --output <dir>', 'Extract directory (temp, auto-cleaned)')
  .action(async (file, options) => {
    try {
      const destDir = await importPersona(file, { extractDir: options.output });
      printSuccess(`Imported and installed from ${file}`);
      printInfo(`  Installed to: ${destDir}`);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

// ── Pack refinement (P24) ─────────────────────────────────────────────────────

program
  .command('refine <slug>')
  .description('Refine persona skill pack from accumulated experience (pack-level evolution)')
  .option('--emit',      'Signal path Step A: check threshold and emit refinement_request signal')
  .option('--apply',     'Signal path Step B: read signal response and apply refinement')
  .option('--from-pool', 'AutoSkill path: pull from shared aggregation pool (requires aggregation: opt-in)')
  .action(async (slug, options) => {
    const { refine } = require('../lib/lifecycle/refine');
    try {
      await refine(slug, { emit: options.emit, apply: options.apply, fromPool: options.fromPool });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

// ── State management commands (runner integration protocol) ──────────────────
//
// These commands are the standard interface for any agent runner to manage
// persona state. Runners call these before/after conversations regardless of
// where the persona pack is installed on disk.
//
// Lookup priority: registry path → default OP_SKILLS_DIR/persona-<slug>
// Delegates to scripts/state-sync.js inside the persona pack (no logic duplication).

// resolvePersonaDir and runStateSyncCommand are imported from lib/state/runner.js

const stateCmd = program
  .command('state')
  .description('Manage persona evolution state (runner integration — works from any directory)');

stateCmd
  .command('read <slug>')
  .description('Print current evolution state summary for a persona')
  .action((slug) => {
    runStateSyncCommand(slug, ['read']);
  });

stateCmd
  .command('write <slug> <patch>')
  .description('Merge JSON patch into persona evolution state')
  .action((slug, patch) => {
    runStateSyncCommand(slug, ['write', patch]);
  });

stateCmd
  .command('signal <slug> <type> [payload]')
  .description('Emit a signal from a persona to its host runtime')
  .action((slug, type, payload) => {
    const args = ['signal', type];
    if (payload) args.push(payload);
    runStateSyncCommand(slug, args);
  });

stateCmd
  .command('promote <slug>')
  .description('Soul-Memory Bridge: scan eventLog for recurring patterns and promote them to evolvedTraits')
  .option('--dry-run', 'Preview promotions without writing to state')
  .action((slug, opts) => {
    const { promoteToInstinct } = require('../lib/state/evolution');

    const personaDir = resolvePersonaDir(slug);
    if (!personaDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }

    const personaPath = resolveSoulFile(personaDir, 'persona.json');
    const statePath   = resolveSoulFile(personaDir, 'state.json');

    if (!personaPath || !fs.existsSync(personaPath)) {
      printError(`persona.json not found in ${personaDir}`);
      process.exit(1);
    }

    let persona, state;
    try {
      persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
      state   = statePath && fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf-8')) : {};
    } catch (err) {
      printError(`promote: failed to read persona state: ${err.message}`);
      process.exit(1);
    }

    const eventLog      = state.eventLog     || [];
    const existingTraits = state.evolvedTraits || [];

    if (eventLog.length === 0) {
      printWarning(`promote: no eventLog entries found for ${slug} — nothing to promote`);
      return;
    }

    const newTraits = promoteToInstinct(eventLog, persona, existingTraits);

    if (newTraits.length === 0) {
      printInfo(`promote: no patterns reached threshold — evolvedTraits unchanged`);
      return;
    }

    if (opts.dryRun) {
      printInfo(`promote: ${newTraits.length} trait(s) would be promoted (dry run):`);
      for (const t of newTraits) printInfo(`  + ${t.trait}  (${t.evidenceCount} events)`);
      return;
    }

    const updatedTraits = [...existingTraits, ...newTraits];
    runStateSyncCommand(slug, ['write', JSON.stringify({ evolvedTraits: updatedTraits })]);
    printSuccess(`promote: promoted ${newTraits.length} trait(s) to evolvedTraits for ${slug}:`);
    for (const t of newTraits) printSuccess(`  + ${t.trait}  (${t.evidenceCount} events)`);
  });

// ─── Vitality ─────────────────────────────────────────────────────────────────

const vitalityCmd = program
  .command('vitality')
  .description('Persona Vitality — health scoring, reporting, and future multi-dimension monitoring');

vitalityCmd
  .command('score <slug>')
  .description('Print machine-readable Vitality score (used by Survival Policy and agent runners)')
  .action((slug) => {
    const { calcVitality }    = require('../lib/report/vitality');
    const { JsonFileAdapter } = require('agentbooks/adapters/json-file');

    const dataPath = process.env.AGENTBOOKS_DATA_PATH
      || path.join(OP_PERSONA_HOME, 'economy', `persona-${slug}`);

    const adapter = new JsonFileAdapter(dataPath);
    let report;
    try {
      report = calcVitality(slug, adapter);
    } catch (err) {
      printError(`vitality score: failed to compute for ${slug}: ${err.message}`);
      process.exit(1);
    }

    const fin = report.dimensions.financial;
    const lines = [
      'VITALITY_REPORT',
      `tier=${report.tier}  score=${(report.score * 100).toFixed(1)}%`,
      `diagnosis=${fin.diagnosis}`,
      `prescriptions=${(fin.prescriptions || []).join(',')}`,
    ];
    if (fin.daysToDepletion !== null && fin.daysToDepletion !== undefined) {
      lines.push(`daysToDepletion=${fin.daysToDepletion}`);
    }
    if (fin.dominantCost) lines.push(`dominantCost=${fin.dominantCost}`);
    lines.push(`trend=${fin.trend}`);
    console.log(lines.join('\n'));
  });

vitalityCmd
  .command('report <slug>')
  .description('Render a human-readable HTML Vitality report')
  .option('--output <file>', 'Write HTML to <file> instead of stdout')
  .action((slug, options) => {
    const personaDir = resolvePersonaDir(slug);
    if (!personaDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }
    const { renderVitalityHtml } = require('../lib/report/vitality-report');
    let html;
    try {
      html = renderVitalityHtml(personaDir, slug);
    } catch (err) {
      printError(`vitality report: failed to render for ${slug}: ${err.message}`);
      process.exit(1);
    }
    if (options.output) {
      fs.writeFileSync(options.output, html, 'utf-8');
      printSuccess(`Vitality report written to ${options.output}`);
    } else {
      process.stdout.write(html);
    }
  });

// ── canvas ────────────────────────────────────────────────────────────────────

program
  .command('canvas <slug>')
  .description('Generate a Living Canvas persona profile page (P14 Phase 1)')
  .option('--output <file>', 'Write HTML to <file> (default: canvas-<slug>.html)')
  .option('--open', 'Open in default browser after writing')
  .action((slug, options) => {
    const personaDir = resolvePersonaDir(slug);
    if (!personaDir) {
      printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
      process.exit(1);
    }
    const { renderCanvasHtml } = require('../lib/report/canvas');
    let html;
    try {
      html = renderCanvasHtml(personaDir, slug);
    } catch (err) {
      printError(`canvas: failed to render for ${slug}: ${err.message}`);
      process.exit(1);
    }
    const outFile = options.output || `canvas-${slug}.html`;
    fs.writeFileSync(outFile, html, 'utf-8');
    printSuccess(`Living Canvas written to ${outFile}`);
    if (options.open) {
      const { execSync } = require('child_process');
      const cmd = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start'
        : 'xdg-open';
      try { execSync(`${cmd} "${outFile}"`); } catch { /* ignore */ }
    }
  });

program.parse();
