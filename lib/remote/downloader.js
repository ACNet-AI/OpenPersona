/**
 * OpenPersona - Download persona pack from registry or GitHub
 */
const path = require('path');
const fs = require('fs-extra');
const { printInfo, OP_SKILLS_DIR, validateName } = require('../utils');

const TMP_DIR = path.join(require('os').tmpdir(), 'openpersona-dl');
const OFFICIAL_REGISTRY = 'https://github.com/acnlabs/persona-skills/archive/refs/heads/main.zip';
const REGISTRY_LISTING = 'https://openpersona-frontend.vercel.app';

async function download(target, registry = 'acnlabs') {
  await fs.ensureDir(TMP_DIR);
  const outDir = path.join(TMP_DIR, `persona-${Date.now()}`);

  // owner/repo format → GitHub
  if (target.includes('/')) {
    const dir = await downloadFromGitHub(target, outDir);
    return { dir, skipCopy: false };
  }
  return await downloadFromRegistry(target, registry, outDir);
}

async function downloadFromRegistry(slug, registry, outDir) {
  if (registry === 'acnlabs' || registry === 'clawhub') {
    validateName(slug, 'slug');

    printInfo(`Downloading persona "${slug}" from acnlabs/persona-skills...`);
    const zipPath = path.join(TMP_DIR, `persona-skills-${Date.now()}.zip`);
    try {
      await downloadZip(OFFICIAL_REGISTRY, zipPath);
    } catch (e) {
      throw new Error(`Failed to reach persona registry: ${e.message}`);
    }

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    const extractDir = path.join(TMP_DIR, `persona-skills-extract-${Date.now()}`);
    zip.extractAllTo(extractDir, true);
    try { fs.unlinkSync(zipPath); } catch (_) {}

    // The zip extracts as a single root folder (e.g. persona-skills-main/)
    const entries = fs.readdirSync(extractDir);
    const repoRoot = entries.length === 1
      ? path.join(extractDir, entries[0])
      : extractDir;

    const slugDir = path.join(repoRoot, slug);
    const hasPersonaJson = fs.existsSync(path.join(slugDir, 'persona.json')) ||
      fs.existsSync(path.join(slugDir, 'soul', 'persona.json'));
    if (!fs.existsSync(slugDir) || !hasPersonaJson) {
      await fs.remove(extractDir).catch(() => {});
      throw new Error(
        `Persona "${slug}" not found in the official registry.\n` +
        `Browse available personas at ${REGISTRY_LISTING}`
      );
    }

    await fs.copy(slugDir, outDir);
    // Clean up the full registry archive — only the target persona was needed
    await fs.remove(extractDir).catch(() => {});
    return { dir: outDir, skipCopy: false };
  }
  throw new Error(`Unsupported registry: ${registry}`);
}

async function downloadFromGitHub(ownerRepo, outDir) {
  // Validate owner/repo format to prevent URL injection
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error(`Invalid GitHub repo format: "${ownerRepo}" — expected owner/repo`);
  }

  // Try main branch first, fall back to master — mirrors registry.js validateRepo behaviour
  const branches = ['main', 'master'];
  const zipPath = path.join(TMP_DIR, `repo-${Date.now()}.zip`);
  let lastError;
  for (const branch of branches) {
    const url = `https://github.com/${ownerRepo}/archive/refs/heads/${branch}.zip`;
    try {
      await downloadZip(url, zipPath);
      lastError = null;
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(outDir, true);
      try { fs.unlinkSync(zipPath); } catch (_) {}

      const baseName = path.basename(ownerRepo);
      const extracted = path.join(outDir, `${baseName}-${branch}`);
      if (!fs.existsSync(extracted)) {
        const entries = fs.readdirSync(outDir);
        const found = entries.find((e) => {
          const p = path.join(outDir, e);
          return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'persona.json'));
        });
        if (found) return path.join(outDir, found);
        throw new Error('Not a valid OpenPersona pack: persona.json not found');
      }

      const personaPath = path.join(extracted, 'persona.json');
      if (!fs.existsSync(personaPath)) {
        const subdirs = fs.readdirSync(extracted);
        const found = subdirs.find((d) => fs.existsSync(path.join(extracted, d, 'persona.json')));
        if (found) return path.join(extracted, found);
        throw new Error('Not a valid OpenPersona pack: persona.json not found');
      }
      return extracted;
    } catch (e) {
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}
      lastError = e;
    }
  }
  throw lastError || new Error(`Failed to download ${ownerRepo}`);
}

/**
 * Download a file from a URL (follows redirects) and save to dest path.
 */
function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    const MAX_HOPS = 5;
    const follow = (u, hops) => {
      if (hops > MAX_HOPS) {
        reject(new Error(`Too many redirects (>${MAX_HOPS}) downloading ${url}`));
        return;
      }
      const mod = u.startsWith('https') ? require('https') : require('http');
      mod.get(u, { headers: { 'User-Agent': 'OpenPersona/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location, hops + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }
        const file = require('fs').createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url, 0);
  });
}

module.exports = { download };
