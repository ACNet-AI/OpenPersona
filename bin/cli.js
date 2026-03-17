#!/usr/bin/env node
/**
 * OpenPersona CLI - Full persona package manager
 * Commands: create | install | search | uninstall | update | list | switch | publish | reset | evolve-report | contribute | export | import | acn-register | state
 */
const path = require('path');
const os   = require('os');
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
const { OP_SKILLS_DIR, OPENCLAW_HOME, resolveSoulFile, printError, printSuccess, printInfo, loadRegistry, shellEscape } = require('../lib/utils');
const { resolvePersonaDir, runStateSyncCommand } = require('../lib/state-runner');
const { forkPersona } = require('../lib/forker');
const { exportPersona, importPersona } = require('../lib/porter');

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
  .option('--install', 'Install to OpenClaw after generation')
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
        persona = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, 'base', 'persona.json'), 'utf-8'));
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
        printInfo(`  SKILL.md, soul/, references/, agent-card.json, acn-config.json, scripts/`);
        if (persona.evolution?.enabled) {
          printInfo(`  state.json (★Experimental)`);
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
  .option('--install', 'Install to OpenClaw after generation')
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

// ── State management commands (runner integration protocol) ──────────────────
//
// These commands are the standard interface for any agent runner to manage
// persona state. Runners call these before/after conversations regardless of
// where the persona pack is installed on disk.
//
// Lookup priority: registry path → default OP_SKILLS_DIR/persona-<slug>
// Delegates to scripts/state-sync.js inside the persona pack (no logic duplication).

// resolvePersonaDir and runStateSyncCommand are imported from lib/state-runner.js

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

// ─── Vitality ─────────────────────────────────────────────────────────────────

const vitalityCmd = program
  .command('vitality')
  .description('Persona Vitality — health scoring, reporting, and future multi-dimension monitoring');

vitalityCmd
  .command('score <slug>')
  .description('Print machine-readable Vitality score (used by Survival Policy and agent runners)')
  .action((slug) => {
    const { calcVitality }    = require('../lib/vitality');
    const { JsonFileAdapter } = require('agentbooks/adapters/json-file');

    const dataPath = process.env.AGENTBOOKS_DATA_PATH
      || path.join(OPENCLAW_HOME, 'economy', `persona-${slug}`);

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
    const { renderVitalityHtml } = require('../lib/vitality-report');
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
    const { renderCanvasHtml } = require('../lib/canvas-generator');
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
