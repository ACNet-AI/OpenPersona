/**
 * OpenPersona - Download persona pack from registry or GitHub
 */
const path = require('path');
const fs = require('fs-extra');
const https = require('https');
const { execSync } = require('child_process');
const { printError, OP_SKILLS_DIR } = require('./utils');

const TMP_DIR = path.join(require('os').tmpdir(), 'openpersona-dl');

async function download(target, registry = 'clawhub') {
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
  if (registry === 'clawhub') {
    try {
      execSync(`npx clawhub@latest install ${slug}`, { stdio: 'inherit' });
      const candidate = path.join(OP_SKILLS_DIR, `persona-${slug}`);
      const alt = path.join(OP_SKILLS_DIR, slug);
      if (fs.existsSync(candidate)) {
        return { dir: candidate, skipCopy: true };
      }
      if (fs.existsSync(alt)) {
        return { dir: alt, skipCopy: true };
      }
      printError('ClawHub installed but persona folder not found. Check ~/.openclaw/skills/');
      throw new Error('Persona not found after install');
    } catch (e) {
      printError(`ClawHub install failed: ${e.message}`);
      throw e;
    }
  }
  throw new Error(`Unsupported registry: ${registry}`);
}

async function downloadFromGitHub(ownerRepo, outDir) {
  const url = `https://github.com/${ownerRepo}/archive/refs/heads/main.zip`;
  const zipPath = path.join(TMP_DIR, `repo-${Date.now()}.zip`);

  await new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(zipPath);
    const req = https.get(url, { headers: { 'User-Agent': 'OpenPersona/0.1' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirect = res.headers.location;
        (redirect.startsWith('https') ? require('https') : require('http'))
          .get(redirect, (r2) => {
            r2.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          })
          .on('error', reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    req.on('error', reject);
  });

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

module.exports = { download };
