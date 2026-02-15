/**
 * OpenPersona - Persona Harvest (Community Contribution System)
 *
 * Diff local persona changes against upstream presets,
 * classify changes, and submit PRs to the main repository.
 */
const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const { printError, printWarning, printSuccess, printInfo, OP_SKILLS_DIR } = require('./utils');

const PKG_ROOT = path.resolve(__dirname, '..');
const PRESETS_DIR = path.join(PKG_ROOT, 'presets');
const UPSTREAM_REPO = 'ACNet-AI/OpenPersona';

// Change categories with human-readable labels
const CATEGORIES = {
  background: { label: 'Background Story', layer: 'soul', impact: 'high' },
  behaviorGuide: { label: 'Behavior Guide', layer: 'soul', impact: 'high' },
  personality: { label: 'Personality', layer: 'soul', impact: 'medium' },
  speakingStyle: { label: 'Speaking Style', layer: 'soul', impact: 'medium' },
  vibe: { label: 'Vibe', layer: 'soul', impact: 'low' },
  boundaries: { label: 'Boundaries', layer: 'soul', impact: 'medium' },
  capabilities: { label: 'Capabilities', layer: 'soul', impact: 'medium' },
  bio: { label: 'Bio', layer: 'soul', impact: 'low' },
  evolution: { label: 'Evolution Config', layer: 'soul', impact: 'medium' },
  faculties: { label: 'Faculty Config', layer: 'manifest', impact: 'high' },
};

/**
 * Deep diff two objects, returning changed/added/removed keys.
 */
function diffObjects(upstream, local, prefix = '') {
  const changes = [];

  const allKeys = new Set([...Object.keys(upstream || {}), ...Object.keys(local || {})]);
  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const uVal = upstream?.[key];
    const lVal = local?.[key];

    if (uVal === undefined && lVal !== undefined) {
      changes.push({ key: fullKey, type: 'added', value: lVal });
    } else if (uVal !== undefined && lVal === undefined) {
      changes.push({ key: fullKey, type: 'removed', oldValue: uVal });
    } else if (typeof uVal === 'object' && typeof lVal === 'object' && !Array.isArray(uVal) && !Array.isArray(lVal)) {
      changes.push(...diffObjects(uVal, lVal, fullKey));
    } else if (JSON.stringify(uVal) !== JSON.stringify(lVal)) {
      changes.push({ key: fullKey, type: 'modified', oldValue: uVal, value: lVal });
    }
  }

  return changes;
}

/**
 * Classify changes into meaningful categories.
 */
function classifyChanges(changes) {
  const classified = {};
  for (const change of changes) {
    const topKey = change.key.split('.')[0];
    const cat = CATEGORIES[topKey] || { label: topKey, layer: 'other', impact: 'low' };
    if (!classified[topKey]) {
      classified[topKey] = { ...cat, changes: [] };
    }
    classified[topKey].changes.push(change);
  }
  return classified;
}

/**
 * Format diff for human review.
 */
function formatDiffReport(classified) {
  const lines = [];
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('  Persona Harvest — Change Report');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const [key, cat] of Object.entries(classified)) {
    const impactBadge = cat.impact === 'high' ? '★★★' : cat.impact === 'medium' ? '★★' : '★';
    lines.push(`  ${impactBadge} ${cat.label} (${cat.layer} layer)`);
    for (const c of cat.changes) {
      if (c.type === 'added') {
        lines.push(`    + ${c.key}: ${truncate(JSON.stringify(c.value), 80)}`);
      } else if (c.type === 'removed') {
        lines.push(`    - ${c.key}: (removed)`);
      } else {
        lines.push(`    ~ ${c.key}`);
        if (typeof c.oldValue === 'string' && typeof c.value === 'string') {
          // Show string diffs inline
          const oldSnippet = truncate(c.oldValue, 60);
          const newSnippet = truncate(c.value, 60);
          lines.push(`      was: "${oldSnippet}"`);
          lines.push(`      now: "${newSnippet}"`);
        }
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Generate PR title and body from classified changes.
 */
function generatePRContent(slug, classified) {
  const catNames = Object.values(classified).map((c) => c.label.toLowerCase());
  const title = `persona-harvest(${slug}): improve ${catNames.slice(0, 3).join(', ')}`;

  const bodyLines = [];
  bodyLines.push('## Persona Harvest');
  bodyLines.push('');
  bodyLines.push(`Community-contributed improvements to the **${slug}** persona, discovered through real interaction.`);
  bodyLines.push('');
  bodyLines.push('## Changes');
  bodyLines.push('');

  for (const [key, cat] of Object.entries(classified)) {
    const impactBadge = cat.impact === 'high' ? '**HIGH**' : cat.impact === 'medium' ? 'MEDIUM' : 'low';
    bodyLines.push(`### ${cat.label} (${cat.layer} layer) — ${impactBadge}`);
    bodyLines.push('');
    for (const c of cat.changes) {
      if (c.type === 'modified' && typeof c.value === 'string') {
        bodyLines.push(`- \`${c.key}\`: Updated`);
      } else if (c.type === 'added') {
        bodyLines.push(`- \`${c.key}\`: Added`);
      } else if (c.type === 'removed') {
        bodyLines.push(`- \`${c.key}\`: Removed`);
      } else {
        bodyLines.push(`- \`${c.key}\`: Modified`);
      }
    }
    bodyLines.push('');
  }

  bodyLines.push('## Motivation');
  bodyLines.push('');
  bodyLines.push('_Please describe what interaction or insight led to these improvements._');
  bodyLines.push('');
  bodyLines.push('---');
  bodyLines.push('*Submitted via `npx openpersona contribute` — Persona Harvest*');

  return { title, body: bodyLines.join('\n') };
}

/**
 * Main contribute flow.
 *
 * Modes:
 *   - "preset" (default): diff installed persona vs upstream preset
 *   - "framework": diff local repo changes (layers/, templates/, lib/)
 */
async function contribute(slug, options = {}) {
  const { mode = 'preset', dryRun = false } = options;

  // --- Validate prerequisites ---
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    printError('GitHub CLI (gh) is required. Install: https://cli.github.com/');
    process.exit(1);
  }

  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    printError('Not logged in to GitHub. Run: gh auth login');
    process.exit(1);
  }

  if (mode === 'preset') {
    return contributePreset(slug, dryRun);
  } else if (mode === 'framework') {
    return contributeFramework(dryRun);
  } else {
    printError(`Unknown mode: ${mode}`);
    process.exit(1);
  }
}

/**
 * Contribute preset-level changes (persona.json + manifest.json).
 */
async function contributePreset(slug, dryRun) {
  // Find local installed persona
  const localDir = path.join(OP_SKILLS_DIR, `persona-${slug}`);
  if (!fs.existsSync(localDir)) {
    printError(`Installed persona not found: persona-${slug}`);
    printInfo(`Run: npx openpersona create --preset ${slug} --install`);
    process.exit(1);
  }

  // Find upstream preset
  const upstreamDir = path.join(PRESETS_DIR, slug);
  if (!fs.existsSync(upstreamDir)) {
    printWarning(`No upstream preset found for "${slug}" — this may be a custom persona.`);
    printInfo('Framework-level contributions: npx openpersona contribute --mode framework');
    process.exit(1);
  }

  // Load and diff persona.json
  const localPersona = JSON.parse(fs.readFileSync(path.join(localDir, 'persona.json'), 'utf-8'));
  const upstreamPersona = JSON.parse(fs.readFileSync(path.join(upstreamDir, 'persona.json'), 'utf-8'));

  // Strip non-contributable fields (meta, internal)
  const stripFields = ['meta', 'defaults', 'allowedTools', 'allowedToolsStr', 'faculties'];
  const cleanLocal = { ...localPersona };
  const cleanUpstream = { ...upstreamPersona };
  for (const f of stripFields) {
    delete cleanLocal[f];
    delete cleanUpstream[f];
  }

  const personaChanges = diffObjects(cleanUpstream, cleanLocal);

  // Load and diff manifest.json (if local has one)
  let manifestChanges = [];
  const localManifestPath = path.join(localDir, 'manifest.json');
  const upstreamManifestPath = path.join(upstreamDir, 'manifest.json');
  if (fs.existsSync(localManifestPath) && fs.existsSync(upstreamManifestPath)) {
    const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf-8'));
    const upstreamManifest = JSON.parse(fs.readFileSync(upstreamManifestPath, 'utf-8'));
    // Only diff faculties (the interesting part)
    if (JSON.stringify(localManifest.layers?.faculties) !== JSON.stringify(upstreamManifest.layers?.faculties)) {
      manifestChanges.push({
        key: 'faculties',
        type: 'modified',
        oldValue: upstreamManifest.layers?.faculties,
        value: localManifest.layers?.faculties,
      });
    }
  }

  const allChanges = [...personaChanges, ...manifestChanges];
  if (allChanges.length === 0) {
    printInfo(`No differences found between local persona-${slug} and upstream preset.`);
    printInfo('Your Samantha is in sync with the mother soul.');
    return;
  }

  // Classify and display
  const classified = classifyChanges(allChanges);
  console.log(formatDiffReport(classified));

  printInfo(`Found ${allChanges.length} change(s) across ${Object.keys(classified).length} category/categories.`);
  console.log('');

  if (dryRun) {
    printInfo('Dry run — no PR will be created.');
    return { changes: allChanges, classified };
  }

  // --- Submit PR ---
  const { title, body } = generatePRContent(slug, classified);

  printInfo('Preparing PR...');
  const branch = `persona-harvest/${slug}-${Date.now()}`;

  try {
    // Fork if needed (gh fork is idempotent)
    printInfo('Ensuring fork exists...');
    execSync(`gh repo fork ${UPSTREAM_REPO} --clone=false`, { stdio: 'pipe' });

    // Get the user's fork
    const ghUser = execSync('gh api user -q .login', { encoding: 'utf-8' }).trim();
    const forkRepo = `${ghUser}/OpenPersona`;
    printInfo(`Fork: ${forkRepo}`);

    // Clone to temp dir
    const tmpDir = path.join(require('os').tmpdir(), `openpersona-harvest-${Date.now()}`);
    printInfo('Cloning fork...');
    execSync(`gh repo clone ${forkRepo} "${tmpDir}" -- --depth 1`, { stdio: 'pipe' });

    // Create branch
    execSync(`git checkout -b ${branch}`, { cwd: tmpDir, stdio: 'pipe' });

    // Copy modified files
    const presetTarget = path.join(tmpDir, 'presets', slug);
    await fs.ensureDir(presetTarget);

    // Always copy persona.json with changes
    if (personaChanges.length > 0) {
      // Apply changes to the upstream persona.json (not the installed one which has extra fields)
      const merged = JSON.parse(JSON.stringify(upstreamPersona));
      for (const change of personaChanges) {
        const keys = change.key.split('.');
        let obj = merged;
        for (let i = 0; i < keys.length - 1; i++) {
          obj = obj[keys[i]] = obj[keys[i]] || {};
        }
        if (change.type === 'removed') {
          delete obj[keys[keys.length - 1]];
        } else {
          obj[keys[keys.length - 1]] = change.value;
        }
      }
      await fs.writeFile(path.join(presetTarget, 'persona.json'), JSON.stringify(merged, null, 2) + '\n');
    }

    // Copy manifest if changed
    if (manifestChanges.length > 0 && fs.existsSync(localManifestPath)) {
      await fs.copy(localManifestPath, path.join(presetTarget, 'manifest.json'));
    }

    // Commit
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    const commitMsg = `persona-harvest(${slug}): ${Object.values(classified).map((c) => c.label.toLowerCase()).join(', ')}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: tmpDir, stdio: 'pipe' });

    // Push
    printInfo('Pushing branch...');
    execSync(`git push origin ${branch}`, { cwd: tmpDir, stdio: 'pipe' });

    // Create PR
    printInfo('Creating PR...');
    const prUrl = execSync(
      `gh pr create --repo ${UPSTREAM_REPO} --head ${ghUser}:${branch} --title "${title}" --body "${body.replace(/"/g, '\\"')}"`,
      { cwd: tmpDir, encoding: 'utf-8' }
    ).trim();

    // Cleanup
    await fs.remove(tmpDir);

    console.log('');
    printSuccess('Persona Harvest complete!');
    printSuccess(`PR created: ${prUrl}`);
    printInfo('A maintainer will review your contribution.');
    console.log('');

    return { prUrl, changes: allChanges, classified };
  } catch (err) {
    printError(`PR creation failed: ${err.message}`);
    printInfo('You can manually submit changes at: https://github.com/ACNet-AI/OpenPersona/pulls');
    process.exit(1);
  }
}

/**
 * Contribute framework-level changes (for developers who cloned the repo).
 */
async function contributeFramework(dryRun) {
  // Check if we're in a git repo that is OpenPersona
  const isGitRepo = fs.existsSync(path.join(PKG_ROOT, '.git'));
  if (!isGitRepo) {
    printError('Framework contributions require a git clone of OpenPersona.');
    printInfo('Run: git clone https://github.com/ACNet-AI/OpenPersona.git');
    process.exit(1);
  }

  // Show git diff summary
  const diffStat = execSync('git diff --stat HEAD', { cwd: PKG_ROOT, encoding: 'utf-8' }).trim();
  const untrackedRaw = execSync('git ls-files --others --exclude-standard', { cwd: PKG_ROOT, encoding: 'utf-8' }).trim();

  if (!diffStat && !untrackedRaw) {
    printInfo('No local changes detected in the framework.');
    return;
  }

  console.log('');
  printInfo('Framework changes detected:');
  if (diffStat) {
    console.log(diffStat);
  }
  if (untrackedRaw) {
    console.log('\nNew files:');
    console.log(untrackedRaw.split('\n').map((f) => `  + ${f}`).join('\n'));
  }
  console.log('');

  if (dryRun) {
    printInfo('Dry run — no PR will be created.');
    return;
  }

  printInfo('For framework-level contributions:');
  printInfo('  1. Fork: gh repo fork ACNet-AI/OpenPersona');
  printInfo('  2. Branch: git checkout -b feature/your-improvement');
  printInfo('  3. Commit your changes');
  printInfo('  4. Push: git push origin feature/your-improvement');
  printInfo('  5. PR: gh pr create --repo ACNet-AI/OpenPersona');
}

function truncate(str, max) {
  if (typeof str !== 'string') str = JSON.stringify(str);
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

module.exports = { contribute, diffObjects, classifyChanges, formatDiffReport, generatePRContent };
