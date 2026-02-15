#!/usr/bin/env node
/**
 * OpenPersona CLI - Full persona package manager
 * Commands: create | install | search | uninstall | update | list | switch | publish | reset | contribute
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
const { OP_SKILLS_DIR, printError, printSuccess, printInfo } = require('../lib/utils');

const PKG_ROOT = path.resolve(__dirname, '..');
const PRESETS_DIR = path.join(PKG_ROOT, 'presets');

program
  .name('openpersona')
  .description('OpenPersona - Create, manage, and orchestrate AI personas')
  .version('0.1.0');

if (process.argv.length === 2) {
  process.argv.push('create');
}

program
  .command('create')
  .description('Create a new persona skill pack (interactive wizard)')
  .option('--preset <name>', 'Use preset (ai-girlfriend, samantha, life-assistant, health-butler)')
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
      persona.skills = manifest.layers.skills || {};
      persona.embodiments = manifest.layers.body ? [manifest.layers.body] : [];
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
      const answers = await inquirer.prompt([
        { type: 'input', name: 'personaName', message: 'Persona name:', default: 'Luna' },
        { type: 'input', name: 'slug', message: 'Slug (for directory):', default: (a) => require('../lib/utils').slugify(a.personaName) },
        { type: 'input', name: 'bio', message: 'One-line bio:', default: 'a warm and caring AI companion' },
        { type: 'input', name: 'background', message: 'Background:', default: 'A creative soul who loves music and art' },
        { type: 'input', name: 'age', message: 'Age:', default: '22' },
        { type: 'input', name: 'personality', message: 'Personality keywords:', default: 'gentle, cute, caring' },
        { type: 'input', name: 'speakingStyle', message: 'Speaking style:', default: 'Uses emoji, warm tone' },
        { type: 'input', name: 'referenceImage', message: 'Reference image URL:', default: '' },
        { type: 'checkbox', name: 'faculties', message: 'Select faculties:', choices: ['selfie', 'voice', 'music', 'reminder', 'soul-evolution'] },
        { type: 'confirm', name: 'evolutionEnabled', message: 'Enable soul evolution (★Experimental)?', default: false },
      ]);
      persona = { ...answers, evolution: { enabled: answers.evolutionEnabled } };
      persona.faculties = (answers.faculties || []).map((name) => ({ name }));
    }

    try {
      const outputDir = path.resolve(options.output);
      if (options.dryRun) {
        printInfo('Dry run — preview only, no files written.');
        printInfo(`Would generate: persona-${persona.slug || require('../lib/utils').slugify(persona.personaName)}/`);
        printInfo(`  SKILL.md, soul-injection.md, identity-block.md, README.md, persona.json`);
        if (persona.evolution?.enabled) {
          printInfo(`  soul-state.json (★Experimental)`);
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
  .option('--registry <name>', 'Registry (clawhub, skillssh)', 'clawhub')
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
  .option('--registry <name>', 'Registry', 'clawhub')
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
    const personaPath = path.join(skillDir, 'persona.json');
    if (!fs.existsSync(personaPath)) {
      printError('persona.json not found');
      process.exit(1);
    }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const tmpDir = path.join(require('os').tmpdir(), 'openpersona-update-' + Date.now());
    await fs.ensureDir(tmpDir);
    const { skillDir: newDir } = await generate(persona, tmpDir);
    await fs.remove(skillDir);
    await fs.move(newDir, skillDir);
    await fs.remove(tmpDir);
    await install(skillDir, { skipCopy: true });
    printSuccess('Updated persona-' + slug);
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
    const personaPath = path.join(skillDir, 'persona.json');
    const soulStatePath = path.join(skillDir, 'soul-state.json');
    if (!fs.existsSync(personaPath) || !fs.existsSync(soulStatePath)) {
      printError('Persona or soul-state.json not found');
      process.exit(1);
    }
    const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
    const templatePath = path.join(PKG_ROOT, 'layers', 'faculties', 'soul-evolution', 'soul-state.template.json');
    const tpl = fs.readFileSync(templatePath, 'utf-8');
    const Mustache = require('mustache');
    const now = new Date().toISOString();
    const moodBaseline = persona.personality?.split(',')[0]?.trim() || 'neutral';
    const soulState = Mustache.render(tpl, { slug, createdAt: now, lastUpdatedAt: now, moodBaseline });
    fs.writeFileSync(soulStatePath, soulState);
    printSuccess('Reset soul-state.json');
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

program.parse();
