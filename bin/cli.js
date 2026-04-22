#!/usr/bin/env node
/**
 * OpenPersona CLI - Full persona package manager
 * Commands: create | install | search | uninstall | update | list | switch | publish | curate |
 *           reset | evolve-report | contribute | export | import | acn-register | state |
 *           dataset | skill | persona | model
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
const datasetPublisher = require('../lib/dataset/publisher');
const skillInstaller = require('../lib/skill/installer');
const skillUninstaller = require('../lib/skill/uninstaller');
const skillUpdater = require('../lib/skill/updater');
const skillPublisher = require('../lib/skill/publisher');
const skillSearcher = require('../lib/skill/searcher');
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
  .description('Install persona or skill pack (smart router — auto-detects type). In v1.0 this will also handle datasets and models.')
  .option('--registry <name>', 'Registry (acnlabs, skillssh)', 'acnlabs')
  .option('--runtime <name>', 'For skill packs: target runtime (claude|cursor|openclaw|hermes|openpersona)')
  .option('--global', 'For skill packs: install to ~/.agents/skills/ (user-global)')
  .option('--all', 'For skill packs: install to all detected runtime dirs in CWD')
  .addHelpText('after', [
    '',
    'Examples:',
    '  openpersona install acnlabs/anyone-skill        (auto-routes: persona or skill)',
    '  openpersona install owner/repo --runtime=claude (force skill → .claude/skills/)',
    '  openpersona install owner/repo --global         (force skill → ~/.agents/skills/)',
    '',
    'Use `openpersona persona install` for persona-only guaranteed routing.',
    'Use `openpersona skill install` for skill-only guaranteed routing.',
  ].join('\n'))
  .action(async (target, options) => {
    let dir;
    let skipCopy = false;
    try {
      const result = await download(target, options.registry);
      dir = result.dir;
      skipCopy = !!result.skipCopy;

      // Detect pack type and route accordingly
      const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json')) ||
        fs.existsSync(path.join(dir, 'soul', 'persona.json'));
      const skillMdCandidates = [
        path.join(dir, 'SKILL.md'),
        path.join(dir, 'SKILL', 'SKILL.md'),
        path.join(dir, 'skill', 'SKILL.md'),
      ];
      const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));

      if (hasPersonaJson) {
        if (options.runtime || options.all) {
          printWarning('--runtime / --all ignored for persona packs (use `openpersona skill install` for skill packs)');
        }
        printInfo('Detected: persona pack → installing to ~/.openpersona/');
        await install(dir, skipCopy ? { skipCopy: true, source: target } : { source: target });
      } else if (skillMdPath) {
        printInfo('Detected: skill pack → installing to .agents/skills/');
        await skillInstaller.installSkill(dir, skillMdPath, {
          runtime: options.runtime,
          global: options.global,
          all: options.all,
          source: target,
        });
      } else {
        printError('Not a valid pack: no persona.json or SKILL.md found in the downloaded repository.');
        printInfo('Make sure the repo contains a SKILL.md (skill pack) or persona.json (persona pack).');
        process.exit(1);
      }
    } catch (e) {
      printError(e.message);
      process.exit(1);
    } finally {
      if (dir && !skipCopy) {
        try { await fs.remove(dir); } catch { /* ignore */ }
      }
    }
  });

program
  .command('search <query>')
  .description('Search personas in the OpenPersona directory. Note: in v1.0 this will aggregate all resources. Use `openpersona persona search` for persona-only stable behavior.')
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
  .description('List installed personas. Note: in v1.0 this will aggregate all resources. Use `openpersona persona list` for persona-only stable behavior.')
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

// ---------------------------------------------------------------------------
// dataset — HF dataset directory integration
// ---------------------------------------------------------------------------

const datasetCmd = program
  .command('dataset')
  .description('Hugging Face dataset directory — install and publish persona datasets');

datasetCmd
  .command('install <repo>')
  .description('Record an install event for a HF dataset (increments counter on openpersona.co/datasets)')
  .addHelpText('after', '\nExample:\n  openpersona dataset install proj-persona/PersonaHub')
  .action(async (repo) => {
    try {
      await datasetPublisher.install(repo);
    } catch (err) {
      printError(`dataset install: ${err.message}`);
      process.exit(1);
    }
  });

datasetCmd
  .command('publish <repo>')
  .description('Publish a HF dataset to the OpenPersona dataset directory (openpersona.co/datasets)')
  .addHelpText('after', [
    '',
    'Example:',
    '  openpersona dataset publish proj-persona/PersonaHub',
    '',
    'Note: CLI publish is anonymous (no curated badge).',
    'To get a curated badge, publish via the web UI while logged in with HF.',
  ].join('\n'))
  .action(async (repo) => {
    try {
      await datasetPublisher.publish(repo);
    } catch (err) {
      printError(`dataset publish: ${err.message}`);
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// skill — Agent skill pack lifecycle
// ---------------------------------------------------------------------------

const skillCmd = program
  .command('skill')
  .description('Agent skill registry — install, update, publish, and manage skill packs');

skillCmd
  .command('install <target>')
  .description('Install a skill pack (owner/repo, owner/repo#subpath, local dir, or local zip)')
  .option('--runtime <name>', `Target runtime: ${skillInstaller.VALID_RUNTIMES.join(' | ')}`)
  .option('--global', 'Install to ~/.agents/skills/ (user-global AGENTS.md convention)')
  .option('--all', 'Install to all detected runtime dirs in CWD (.cursor/, .claude/, .agents/)')
  .addHelpText('after', [
    '',
    'Examples:',
    '  openpersona skill install acnlabs/anyone-skill',
    '  openpersona skill install owner/repo --global',
    '  openpersona skill install owner/repo --runtime=claude',
    '  openpersona skill install owner/repo --runtime=cursor',
    '  openpersona skill install owner/repo --all',
    '  openpersona skill install ./local-skill-dir',
    '',
    'Default target: .agents/skills/<slug>/  (discoverable by Cursor, Claude Code, OpenClaw)',
  ].join('\n'))
  .action(async (target, options) => {
    let dir;
    let skipCopy = false;
    try {
      const result = await download(target, 'acnlabs');
      dir = result.dir;
      skipCopy = !!result.skipCopy;
      const skillMdCandidates = [
        path.join(dir, 'SKILL.md'),
        path.join(dir, 'SKILL', 'SKILL.md'),
        path.join(dir, 'skill', 'SKILL.md'),
      ];
      const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));
      if (!skillMdPath) {
        printError('No SKILL.md found — not a valid skill pack.');
        printInfo('Make sure the repo contains a SKILL.md in the root or SKILL/ directory.');
        process.exit(1);
      }
      // Strong typing: persona packs should use `persona install`
      const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json')) ||
        fs.existsSync(path.join(dir, 'soul', 'persona.json'));
      if (hasPersonaJson) {
        printError('This is a persona pack (has persona.json), not a skill-only pack.');
        printInfo(`Use: openpersona persona install ${target}`);
        process.exit(1);
      }
      await skillInstaller.installSkill(dir, skillMdPath, {
        runtime: options.runtime,
        global: options.global,
        all: options.all,
        source: target,
      });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    } finally {
      if (dir && !skipCopy) {
        try { await fs.remove(dir); } catch { /* ignore */ }
      }
    }
  });

skillCmd
  .command('update <slug>')
  .description('Re-download and overwrite an installed skill from its recorded source URL')
  .addHelpText('after', '\nExample:\n  openpersona skill update anyone-skill')
  .action(async (slug) => {
    try {
      await skillUpdater.updateSkill(slug);
    } catch (e) {
      if (!e._handled) printError(e.message);
      process.exit(1);
    }
  });

skillCmd
  .command('uninstall <slug>')
  .description('Uninstall a skill pack (looks up installTarget from registry)')
  .addHelpText('after', '\nExample:\n  openpersona skill uninstall anyone-skill')
  .action(async (slug) => {
    try {
      await skillUninstaller.uninstallSkill(slug);
    } catch (e) {
      if (!e._handled) printError(e.message);
      process.exit(1);
    }
  });

skillCmd
  .command('list')
  .description('List installed skills (registry + filesystem scan of .agents/skills/)')
  .action(() => {
    const { registered, unregistered } = skillInstaller.listSkills();
    if (registered.length === 0 && unregistered.length === 0) {
      printInfo('No skills installed.');
      printInfo('Install one: openpersona skill install owner/repo');
      return;
    }
    console.log('');
    if (registered.length > 0) {
      console.log('  Registered skills:');
      for (const s of registered) {
        const target = s.installTarget || s.path || '(unknown path)';
        console.log(`    ${s.personaName || s.slug}  (${s.slug})`);
        console.log(`      Location: ${target}`);
        if (s.source) console.log(`      Source  : ${s.source}`);
      }
    }
    if (unregistered.length > 0) {
      console.log('');
      console.log('  Unregistered skills (found on filesystem):');
      for (const s of unregistered) {
        console.log(`    ${s.slug}`);
        console.log(`      Location: ${s.path}`);
        console.log(`      (install via openpersona to register)`);
      }
    }
    console.log('');
  });

skillCmd
  .command('search <query>')
  .description('Search the OpenPersona skill directory')
  .addHelpText('after', '\nExample:\n  openpersona skill search persona')
  .action(async (query) => {
    try {
      await skillSearcher.search(query);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

skillCmd
  .command('publish <owner/repo>')
  .description('Publish a skill pack to the OpenPersona skill directory (openpersona.co/skills)')
  .addHelpText('after', [
    '',
    'Example:',
    '  openpersona skill publish owner/my-skill',
    '',
    'Your repo must have a valid SKILL.md with name, description, and version in frontmatter.',
  ].join('\n'))
  .action(async (ownerRepo) => {
    try {
      await skillPublisher.publish(ownerRepo);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

skillCmd
  .command('info <slug>')
  .description('Show local info for an installed skill (registry entry + SKILL.md frontmatter)')
  .action((slug) => {
    const { loadRegistry } = require('../lib/registry');
    const reg = loadRegistry();
    const entry = reg.personas?.[slug];
    if (!entry) {
      printError(`Skill not found in registry: "${slug}"`);
      printInfo('Run `openpersona skill list` to see installed skills.');
      process.exit(1);
    }
    const target = entry.installTarget || entry.path;
    console.log('');
    console.log(`  Skill: ${entry.personaName || slug}`);
    console.log(`  Slug : ${slug}`);
    if (entry.source)    console.log(`  Source  : ${entry.source}`);
    if (target)          console.log(`  Location: ${target}`);
    if (entry.installedAt) console.log(`  Installed: ${entry.installedAt}`);
    if (entry.updatedAt)   console.log(`  Updated  : ${entry.updatedAt}`);

    // Read SKILL.md frontmatter
    if (target) {
      const skillMdCandidates = [
        path.join(target, 'SKILL.md'),
        path.join(target, 'SKILL', 'SKILL.md'),
      ];
      const skillMdPath = skillMdCandidates.find((p) => fs.existsSync(p));
      if (skillMdPath) {
        const fm = skillInstaller.parseFrontmatter(fs.readFileSync(skillMdPath, 'utf-8'));
        if (fm.version)     console.log(`  Version : ${fm.version}`);
        if (fm.description) console.log(`  Desc    : ${fm.description}`);
      }
    }
    console.log('');
  });

// ---------------------------------------------------------------------------
// persona — Namespace aliases for all persona commands (mirrors root commands)
// Lets users use `openpersona persona install`, `openpersona persona list`, etc.
// Root commands remain fully functional — no deprecation warnings in v0.21.0.
// ---------------------------------------------------------------------------

const personaCmd = program
  .command('persona')
  .description('Persona agents — create, install, fork, refine, publish, and more (namespace alias for root commands)');

// Re-export action handlers from existing root command registrations is not
// directly supported by Commander — we register thin wrappers that delegate to
// the same underlying library calls used by root commands.

personaCmd
  .command('create')
  .description('Create a new persona skill pack (interactive wizard)')
  .option('--preset <name>', 'Use preset (base, samantha, ai-girlfriend, life-assistant, health-butler, stoic-mentor)')
  .option('--config <path>', 'Load external persona.json')
  .option('--output <dir>', 'Output directory', process.cwd())
  .option('--install', 'Install to ~/.openpersona after generation')
  .option('--dry-run', 'Preview only, do not write files')
  .action(async (options) => {
    // Delegate to root `create` by re-invoking via process (simplest approach for aliases)
    const args = ['create'];
    if (options.preset)  args.push('--preset', options.preset);
    if (options.config)  args.push('--config', options.config);
    if (options.output)  args.push('--output', options.output);
    if (options.install) args.push('--install');
    if (options.dryRun)  args.push('--dry-run');
    process.argv = [process.argv[0], process.argv[1], ...args];
    // Re-parse — Commander will pick up the root `create` command
    program.parseAsync(['', '', ...args]).catch((e) => { printError(e.message); process.exit(1); });
  });

personaCmd
  .command('install <target>')
  .description('Install a persona pack (strong-typed: errors on SKILL.md-only packs)')
  .option('--registry <name>', 'Registry (acnlabs, skillssh)', 'acnlabs')
  .addHelpText('after', '\nFor skill packs use: openpersona skill install <target>')
  .action(async (target, options) => {
    let dir;
    let skipCopy = false;
    try {
      const result = await download(target, options.registry);
      dir = result.dir;
      skipCopy = !!result.skipCopy;
      const hasPersonaJson = fs.existsSync(path.join(dir, 'persona.json')) ||
        fs.existsSync(path.join(dir, 'soul', 'persona.json'));
      if (!hasPersonaJson) {
        printError('This is a SKILL.md-only pack, not a persona pack.');
        printInfo(`Try: openpersona skill install ${target}`);
        process.exit(1);
      }
      await install(dir, skipCopy ? { skipCopy: true, source: target } : { source: target });
    } catch (e) {
      printError(e.message);
      process.exit(1);
    } finally {
      if (dir && !skipCopy) {
        try { await fs.remove(dir); } catch { /* ignore */ }
      }
    }
  });

personaCmd
  .command('fork <parent-slug>')
  .description('Fork an installed persona into a specialized child')
  .requiredOption('--as <new-slug>', 'Slug for the child persona')
  .option('--name <name>', 'Child persona name')
  .option('--bio <bio>', 'Override bio')
  .option('--personality <keywords>', 'Override personality (comma-separated)')
  .option('--reason <text>', 'Fork reason', 'specialization')
  .option('--output <dir>', 'Output directory', process.cwd())
  .option('--install', 'Install to ~/.openpersona after generation')
  .action(async (parentSlug, options) => {
    try {
      const { skillDir, lineage } = await forkPersona(parentSlug, {
        as: options.as, name: options.name, bio: options.bio,
        personality: options.personality, reason: options.reason,
        output: options.output, install: options.install,
      });
      printSuccess(`Forked: ${skillDir}`);
      printInfo(`  Parent: persona-${parentSlug}  →  Child: persona-${options.as} (generation ${lineage.generation})`);
      if (!options.install) printInfo(`To install: npx openpersona install ${skillDir}`);
    } catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('uninstall <slug>')
  .description('Uninstall persona')
  .action(async (slug) => {
    try { await uninstall(slug); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('update <slug>')
  .description('Update installed persona')
  .action(async (slug) => {
    const skillDir = resolvePersonaDir(slug);
    if (!skillDir) { printError(`Persona not found: "${slug}"`); process.exit(1); }
    const personaPath = resolveSoulFile(skillDir, 'persona.json');
    if (!fs.existsSync(personaPath)) { printError('persona.json not found'); process.exit(1); }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const tmpDir = path.join(os.tmpdir(), 'openpersona-update-' + Date.now());
    await fs.ensureDir(tmpDir);
    const { skillDir: newDir } = await generate(persona, tmpDir);
    const runtimeArtifacts = ['state.json', 'soul/self-narrative.md', 'soul/lineage.json'];
    for (const rel of runtimeArtifacts) {
      const src = path.join(skillDir, rel);
      if (fs.existsSync(src)) await fs.copy(src, path.join(newDir, rel));
    }
    await fs.remove(skillDir);
    await fs.move(newDir, skillDir);
    await fs.remove(tmpDir);
    await install(skillDir, { skipCopy: true });
    printSuccess('Updated persona-' + slug);
  });

personaCmd
  .command('list')
  .description('List installed personas')
  .action(async () => {
    const personas = await listPersonas();
    if (personas.length === 0) { printInfo('No personas installed.'); return; }
    for (const p of personas) {
      const marker = p.active ? chalk.green(' ← active') : '';
      const status = p.enabled ? '' : chalk.dim(' (disabled)');
      const typeTag = p.packType && p.packType !== 'single' ? chalk.cyan(` [${p.packType}]`) : '';
      console.log(`  ${p.personaName} (persona-${p.slug})${typeTag}${marker}${status}`);
    }
  });

personaCmd
  .command('search <query>')
  .description('Search personas in the OpenPersona directory')
  .option('--type <type>', 'Filter by pack type: single or multi')
  .action(async (query, options) => {
    try { await search(query, { type: options.type }); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('switch <slug>')
  .description('Switch active persona')
  .action(async (slug) => {
    try { await switchPersona(slug); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('publish <owner/repo>')
  .description('Validate a GitHub repo as a persona pack and register it with the OpenPersona directory')
  .action(async (ownerRepo) => {
    try { await publishAdapter.publish(ownerRepo); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('export <slug>')
  .description('Export persona pack (with soul state) as a zip archive')
  .option('--output <file>', 'Output zip file path')
  .action(async (slug, options) => {
    try { await exportPersona(slug, options); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('import <file>')
  .description('Import persona pack from a zip archive and install')
  .option('--as <slug>', 'Override slug on import')
  .action(async (file, options) => {
    try { await importPersona(file, options); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('contribute [slug]')
  .description('Persona Harvest — submit persona improvements as a PR to the community')
  .option('--slug <slug>', 'Target persona slug')
  .action(async (slug, options) => {
    try { await contribute(slug || options.slug); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('acn-register [slug]')
  .description('Register a persona with ACN (Agent Communication Network)')
  .option('--slug <slug>', 'Persona slug')
  .action(async (slug, options) => {
    try { await registerWithAcn(slug || options.slug); }
    catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('reset <slug>')
  .description('★Experimental: Reset soul evolution state')
  .action(async (slug) => {
    const skillDir = resolvePersonaDir(slug);
    if (!skillDir) { printError(`Persona not found: "${slug}"`); process.exit(1); }
    const statePath = path.join(skillDir, 'state.json');
    if (fs.existsSync(statePath)) { await fs.remove(statePath); printSuccess(`Reset state.json for persona-${slug}`); }
    else printInfo(`No state.json found for persona-${slug} — already clean.`);
  });

personaCmd
  .command('evolve-report <slug>')
  .description('★Experimental: Show evolution report for a persona')
  .action(async (slug) => {
    try {
      const { generateEvolveReport } = require('../lib/state/evolution');
      const skillDir = resolvePersonaDir(slug);
      if (!skillDir) { printError(`Persona not found: "${slug}"`); process.exit(1); }
      const report = await generateEvolveReport(skillDir, slug);
      console.log(report);
    } catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('refine <slug>')
  .description('Refine persona skill pack from accumulated experience (pack-level evolution)')
  .option('--threshold <n>', 'Min events before refinement triggers', '5')
  .option('--dry-run', 'Preview changes without writing')
  .action(async (slug, options) => {
    try {
      const { refine } = require('../lib/lifecycle/refine');
      await refine(slug, { threshold: parseInt(options.threshold, 10), dryRun: options.dryRun });
    } catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('canvas <slug>')
  .description('Generate a Living Canvas persona profile page')
  .option('--output <file>', 'Write HTML to <file>')
  .option('--open', 'Open in default browser after writing')
  .action((slug, options) => {
    const personaDir = resolvePersonaDir(slug);
    if (!personaDir) { printError(`Persona not found: "${slug}"`); process.exit(1); }
    const { renderCanvasHtml } = require('../lib/report/canvas');
    try {
      const html = renderCanvasHtml(personaDir, slug);
      const outFile = options.output || `canvas-${slug}.html`;
      fs.writeFileSync(outFile, html, 'utf-8');
      printSuccess(`Living Canvas written to ${outFile}`);
      if (options.open) {
        const { execSync } = require('child_process');
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        try { execSync(`${cmd} "${outFile}"`); } catch { /* ignore */ }
      }
    } catch (e) { printError(e.message); process.exit(1); }
  });

personaCmd
  .command('curate <owner/repo>')
  .description('Curator-only: actively collect a popular persona pack (requires OPENPERSONA_CURATOR_TOKEN)')
  .option('--type <type>', 'Pack type: single (default), multi, or tool', 'single')
  .option('--role <role>', 'Override role')
  .option('--token <token>', 'Curator authentication token')
  .option('--tags <tags>', 'Comma-separated tag list')
  .option('--min-stars <n>', 'Minimum GitHub star count', '500')
  .action(async (ownerRepo, options) => {
    try {
      await curate(ownerRepo, { packType: options.type, role: options.role, token: options.token, tags: options.tags, minStars: parseInt(options.minStars, 10) });
    } catch (e) { printError(e.message); process.exit(1); }
  });

// ---------------------------------------------------------------------------
// model — Persona model lifecycle (stub — coming in v1.0)
// ---------------------------------------------------------------------------

const modelCmd = program
  .command('model')
  .description('Persona models — install and publish fine-tuned persona models (coming in v1.0)');

const _modelStub = (cmdName) => () => {
  printWarning(`openpersona model ${cmdName} is not yet implemented.`);
  printInfo('For now, use the persona-model-trainer skill directly:');
  printInfo('  openpersona skill install acnlabs/persona-model-trainer');
  printInfo('Full model registry integration is planned for v1.0.');
  process.exit(0);
};

modelCmd
  .command('install <repo>')
  .description('Install a fine-tuned persona model from HuggingFace (coming in v1.0)')
  .action(_modelStub('install'));

modelCmd
  .command('publish <repo>')
  .description('Publish a fine-tuned persona model to the OpenPersona model registry (coming in v1.0)')
  .action(_modelStub('publish'));

// ---------------------------------------------------------------------------

program.parse();
