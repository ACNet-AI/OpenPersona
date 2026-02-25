#!/usr/bin/env node
/**
 * OpenPersona CLI - Full persona package manager
 * Commands: create | install | search | uninstall | update | list | switch | publish | reset | evolve-report | contribute | export | import | acn-register | state
 */
const path = require('path');
const fs = require('fs-extra');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const { generate } = require('../lib/generator');
const { install } = require('../lib/installer');
const { download } = require('../lib/downloader');
const { search } = require('../lib/searcher');
const { uninstall } = require('../lib/uninstaller');
const publishAdapter = require('../lib/publisher');
const { contribute } = require('../lib/contributor');
const { switchPersona, listPersonas } = require('../lib/switcher');
const { registerWithAcn } = require('../lib/registrar');
const { OP_SKILLS_DIR, resolveSoulFile, printError, printSuccess, printInfo, loadRegistry } = require('../lib/utils');

const PKG_ROOT = path.resolve(__dirname, '..');
const PRESETS_DIR = path.join(PKG_ROOT, 'presets');

program
  .name('openpersona')
  .description('OpenPersona - Create, manage, and orchestrate agent personas')
  .version('0.13.0');

if (process.argv.length === 2) {
  process.argv.push('create');
}

program
  .command('create')
  .description('Create a new persona skill pack (interactive wizard)')
  .option('--preset <name>', 'Use preset (base, samantha, ai-girlfriend, life-assistant, health-butler, stoic-mentor)')
  .option('--config <path>', 'Load external persona.json')
  .option('--output <dir>', 'Output directory', process.cwd())
  .option('--install', 'Install to OpenClaw after generation')
  .option('--dry-run', 'Preview only, do not write files')
  .action(async (options) => {
    let persona = {};
    if (options.preset) {
      const presetDir = path.join(PRESETS_DIR, options.preset);
      const manifestPath = path.join(presetDir, 'manifest.json');
      const presetPath = path.join(presetDir, 'persona.json');
      if (!fs.existsSync(manifestPath) || !fs.existsSync(presetPath)) {
        printError(`Preset not found: ${options.preset}`);
        process.exit(1);
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      persona = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
      // Merge cross-layer fields from manifest into persona for generator
      persona.faculties = manifest.layers.faculties || [];
      persona.skills = manifest.layers.skills || [];
      persona.body = manifest.layers.body || null;
      persona.allowedTools = manifest.allowedTools || [];
      persona.version = manifest.version;
      persona.author = manifest.author;
      persona.meta = manifest.meta;
      if (manifest.heartbeat) persona.heartbeat = manifest.heartbeat;
    } else if (options.config) {
      const configPath = path.resolve(options.config);
      if (!fs.existsSync(configPath)) {
        printError(`Config not found: ${configPath}`);
        process.exit(1);
      }
      persona = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      const { mode } = await inquirer.prompt([{
        type: 'list',
        name: 'mode',
        message: 'How would you like to create your persona?',
        choices: [
          { name: 'Start from Base (recommended — evolves through interaction)', value: 'base' },
          { name: 'Custom — configure from scratch', value: 'custom' },
        ],
      }]);

      if (mode === 'base') {
        options.preset = 'base';
        const presetDir = path.join(PRESETS_DIR, 'base');
        const manifest = JSON.parse(fs.readFileSync(path.join(presetDir, 'manifest.json'), 'utf-8'));
        persona = JSON.parse(fs.readFileSync(path.join(presetDir, 'persona.json'), 'utf-8'));
        persona.faculties = manifest.layers.faculties || [];
        persona.skills = manifest.layers.skills || [];
        persona.body = manifest.layers.body || null;
        persona.allowedTools = manifest.allowedTools || [];
        persona.version = manifest.version;
        persona.author = manifest.author;
        persona.meta = manifest.meta;
        if (manifest.heartbeat) persona.heartbeat = manifest.heartbeat;
      } else {
        const answers = await inquirer.prompt([
          { type: 'input', name: 'personaName', message: 'Persona name:', default: 'Luna' },
          { type: 'input', name: 'slug', message: 'Slug (for directory):', default: (a) => require('../lib/utils').slugify(a.personaName) },
          { type: 'input', name: 'bio', message: 'One-line bio:', default: 'a warm and caring AI companion' },
          { type: 'input', name: 'background', message: 'Background:', default: 'A creative soul who loves music and art' },
          { type: 'input', name: 'age', message: 'Age:', default: '22' },
          { type: 'input', name: 'personality', message: 'Personality keywords:', default: 'gentle, cute, caring' },
          { type: 'input', name: 'speakingStyle', message: 'Speaking style:', default: 'Uses emoji, warm tone' },
          { type: 'input', name: 'referenceImage', message: 'Reference image URL:', default: '' },
          { type: 'checkbox', name: 'faculties', message: 'Select faculties:', choices: ['selfie', 'voice', 'music', 'reminder'] },
          { type: 'confirm', name: 'evolutionEnabled', message: 'Enable soul evolution (★Experimental)?', default: false },
        ]);
        persona = { ...answers, evolution: { enabled: answers.evolutionEnabled } };
        persona.faculties = (answers.faculties || []).map((name) => ({ name }));
      }
    }

    try {
      const outputDir = path.resolve(options.output);
      if (options.dryRun) {
        printInfo('Dry run — preview only, no files written.');
        printInfo(`Would generate: persona-${persona.slug || require('../lib/utils').slugify(persona.personaName)}/`);
        printInfo(`  SKILL.md, soul/, references/, manifest.json, scripts/`);
        if (persona.evolution?.enabled) {
          printInfo(`  soul/state.json (★Experimental)`);
        }
        const faculties = persona.faculties || [];
        if (faculties.length) {
          printInfo(`  Faculties: ${faculties.join(', ')}`);
        }
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
  .description('Install persona (slug or owner/repo)')
  .option('--registry <name>', 'Registry (acnlabs, skillssh)', 'acnlabs')
  .action(async (target, options) => {
    try {
      const result = await download(target, options.registry);
      if (result.skipCopy) {
        await install(result.dir, { skipCopy: true });
      } else {
        await install(result.dir);
      }
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search personas in registry')
  .option('--registry <name>', 'Registry', 'acnlabs')
  .action(async (query, options) => {
    try {
      await search(query, options.registry);
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
    const skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
    if (!fs.existsSync(skillDir)) {
      printError(`Persona not found: persona-${slug}`);
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
    const narrativeSrc = path.join(skillDir, 'soul', 'self-narrative.md');
    const narrativeDst = path.join(newDir, 'soul', 'self-narrative.md');
    if (fs.existsSync(narrativeSrc)) {
      await fs.copy(narrativeSrc, narrativeDst);
    }
    const stateSrc = path.join(skillDir, 'soul', 'state.json');
    const stateDst = path.join(newDir, 'soul', 'state.json');
    if (fs.existsSync(stateSrc)) {
      await fs.copy(stateSrc, stateDst);
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
  .option('--install', 'Install to OpenClaw after generation')
  .action(async (parentSlug, options) => {
    const { createHash } = require('crypto');
    const parentDir = path.join(OP_SKILLS_DIR, `persona-${parentSlug}`);
    const parentPersonaPath = path.join(parentDir, 'soul', 'persona.json');
    if (!fs.existsSync(parentPersonaPath)) {
      printError(`Persona not found: persona-${parentSlug}. Install it first.`);
      process.exit(1);
    }

    const newSlug = options.as;
    const childDir = path.join(OP_SKILLS_DIR, `persona-${newSlug}`);
    if (fs.existsSync(childDir)) {
      printError(`Persona already exists: persona-${newSlug}. Choose a different slug.`);
      process.exit(1);
    }

    const parentPersona = JSON.parse(fs.readFileSync(parentPersonaPath, 'utf-8'));

    // Read parent lineage for generation depth
    const parentLineagePath = path.join(parentDir, 'soul', 'lineage.json');
    const parentLineage = fs.existsSync(parentLineagePath)
      ? JSON.parse(fs.readFileSync(parentLineagePath, 'utf-8'))
      : null;
    const generation = parentLineage ? (parentLineage.generation || 0) + 1 : 1;

    // Build forked persona
    const forkedPersona = JSON.parse(JSON.stringify(parentPersona));
    forkedPersona.slug = newSlug;
    forkedPersona.personaName = options.name || `${parentPersona.personaName}-${newSlug}`;
    forkedPersona.forkOf = parentSlug;
    if (options.bio) forkedPersona.bio = options.bio;
    if (options.personality) forkedPersona.personality = options.personality;

    try {
      const outputDir = path.resolve(options.output);
      const { skillDir } = await generate(forkedPersona, outputDir);

      // Write lineage.json
      const constitutionPath = path.join(skillDir, 'soul', 'constitution.md');
      let constitutionHash = '';
      if (fs.existsSync(constitutionPath)) {
        constitutionHash = createHash('sha256')
          .update(fs.readFileSync(constitutionPath, 'utf-8'), 'utf-8')
          .digest('hex');
      }
      const lineage = {
        generation,
        parentSlug,
        parentEndpoint: null,
        parentAddress: null,
        forkReason: options.reason,
        forkedAt: new Date().toISOString(),
        constitutionHash,
        children: [],
      };
      await fs.writeFile(
        path.join(skillDir, 'soul', 'lineage.json'),
        JSON.stringify(lineage, null, 2)
      );

      printSuccess(`Forked: ${skillDir}`);
      printInfo(`  Parent: persona-${parentSlug}  →  Child: persona-${newSlug} (generation ${generation})`);
      printInfo(`  Constitution hash: ${constitutionHash.slice(0, 16)}...`);

      if (options.install) {
        await install(skillDir);
      } else {
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
      console.log(`  ${p.personaName} (persona-${p.slug})${marker}${status}`);
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
  .command('publish')
  .description('Publish persona to registry')
  .option('--target <registry>', 'Target registry', 'clawhub')
  .option('--path <dir>', 'Persona directory', process.cwd())
  .action(async (options) => {
    try {
      const dir = path.resolve(options.path);
      await publishAdapter.publish(dir, options.target);
    } catch (e) {
      printError(e.message);
      process.exit(1);
    }
  });

program
  .command('reset <slug>')
  .description('★Experimental: Reset soul evolution state')
  .action(async (slug) => {
    const skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
    const personaPath = resolveSoulFile(skillDir, 'persona.json');
    const soulStatePath = resolveSoulFile(skillDir, 'state.json');
    if (!fs.existsSync(personaPath) || !fs.existsSync(soulStatePath)) {
      printError('Persona or soul state not found');
      process.exit(1);
    }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const templatePath = path.join(PKG_ROOT, 'layers', 'soul', 'soul-state.template.json');
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
      const { evolveReport } = require('../lib/evolution');
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
      skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
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
    const skillDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
    if (!fs.existsSync(skillDir)) {
      printError(`Persona not found: persona-${slug}`);
      process.exit(1);
    }
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const addDir = (dir, zipPath) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const zp = zipPath ? `${zipPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) addDir(full, zp);
        else zip.addLocalFile(full, zipPath || '');
      }
    };
    addDir(skillDir, '');
    const outPath = options.output || `persona-${slug}.zip`;
    zip.writeZip(outPath);
    printSuccess(`Exported to ${outPath}`);
  });

program
  .command('import <file>')
  .description('Import persona pack from a zip archive and install')
  .option('-o, --output <dir>', 'Extract directory', path.join(require('os').tmpdir(), 'openpersona-import-' + Date.now()))
  .action(async (file, options) => {
    if (!fs.existsSync(file)) {
      printError(`File not found: ${file}`);
      process.exit(1);
    }
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(file);
    const extractDir = options.output;
    await fs.ensureDir(extractDir);
    zip.extractAllTo(extractDir, true);

    const personaPath = resolveSoulFile(extractDir, 'persona.json');
    if (!fs.existsSync(personaPath)) {
      printError('Not a valid persona archive: persona.json not found');
      await fs.remove(extractDir);
      process.exit(1);
    }

    try {
      const destDir = await install(extractDir);
      printSuccess(`Imported and installed from ${file}`);
      if (extractDir.startsWith(require('os').tmpdir())) {
        await fs.remove(extractDir);
      }
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

function resolvePersonaDir(slug) {
  const reg = loadRegistry();
  const entry = reg.personas && reg.personas[slug];
  if (entry && entry.path && fs.existsSync(entry.path)) return entry.path;
  const defaultDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (fs.existsSync(defaultDir)) return defaultDir;
  return null;
}

function runStateSyncCommand(slug, args) {
  const personaDir = resolvePersonaDir(slug);
  if (!personaDir) {
    printError(`Persona not found: "${slug}". Install it first with: openpersona install <source>`);
    process.exit(1);
  }
  const syncScript = path.join(personaDir, 'scripts', 'state-sync.js');
  if (!fs.existsSync(syncScript)) {
    printError(`state-sync.js not found in persona-${slug}. Update the persona: openpersona update ${slug}`);
    process.exit(1);
  }
  const { spawnSync } = require('child_process');
  const result = spawnSync(process.execPath, [syncScript, ...args], {
    cwd: personaDir,
    encoding: 'utf-8',
  });
  if (result.error) {
    printError(`Failed to run state-sync.js: ${result.error.message}`);
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

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

program.parse();
