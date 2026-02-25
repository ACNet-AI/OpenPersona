/**
 * OpenPersona - Download persona pack from registry or GitHub
 */
const path = require('path');
const fs = require('fs-extra');
const { printInfo, OP_SKILLS_DIR, validateName } = require('./utils');

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
    if (!fs.existsSync(slugDir) || !fs.existsSync(path.join(slugDir, 'persona.json'))) {
      throw new Error(
        `Persona "${slug}" not found in the official registry.\n` +
        `Browse available personas at ${REGISTRY_LISTING}`
      );
    }

    await fs.copy(slugDir, outDir);
    return { dir: outDir, skipCopy: false };
  }
  throw new Error(`Unsupported registry: ${registry}`);
}

async function downloadFromGitHub(ownerRepo, outDir) {
  // Validate owner/repo format to prevent URL injection
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error(`Invalid GitHub repo format: "${ownerRepo}" — expected owner/repo`);
  }
  const url = `https://github.com/${ownerRepo}/archive/refs/heads/main.zip`;
  const zipPath = path.join(TMP_DIR, `repo-${Date.now()}.zip`);

  await downloadZip(url, zipPath);

  const AdmZip = require('adm-zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(outDir, true);
  fs.unlinkSync(zipPath);

  const baseName = path.basename(ownerRepo);
  const extracted = path.join(outDir, `${baseName}-main`);
  if (!fs.existsSync(extracted)) {
    const entries = fs.readdirSync(outDir);
    const found = entries.find((e) => {
      const p = path.join(outDir, e);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'persona.json'));
    });
    if (found) {
      return path.join(outDir, found);
    }
    throw new Error('Not a valid OpenPersona pack: persona.json not found');
  }

  const personaPath = path.join(extracted, 'persona.json');
  if (!fs.existsSync(personaPath)) {
    const subdirs = fs.readdirSync(extracted);
    const found = subdirs.find((d) => fs.existsSync(path.join(extracted, d, 'persona.json')));
    if (found) {
      return path.join(extracted, found);
    }
    throw new Error('Not a valid OpenPersona pack: persona.json not found');
  }
  return extracted;
}

/**
 * Download a file from a URL (follows redirects) and save to dest path.
 */
function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      const mod = u.startsWith('https') ? require('https') : require('http');
      mod.get(u, { headers: { 'User-Agent': 'OpenPersona/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
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
    follow(url);
  });
}

module.exports = { download };
