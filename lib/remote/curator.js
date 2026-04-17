'use strict';

/**
 * OpenPersona - Pack Curator
 *
 * Entry point for `openpersona curate <owner/repo>`.
 *
 * Curators are ACNLabs maintainers who actively collect popular persona packs
 * from the market into the OpenPersona directory. Unlike `openpersona publish`
 * (self-service by authors), curation is a privileged action that requires
 * OPENPERSONA_CURATOR_TOKEN authentication.
 *
 * Core curation criteria (from CURATION-STANDARDS.md):
 *   - GitHub stars ≥ DEFAULT_MIN_STARS (500) — popularity gate
 *   - persona / character type skill pack installable by agent runners
 *   - Valid persona.json (single) or bundle.json (multi) on main/master
 *   - bio/description ≥ 20 chars, constitution compliance
 *
 * Workflow:
 *   1. Fetch GitHub repo metadata (stars, topics, description) via GitHub API
 *   2. Enforce stars threshold (hard gate, overridable with --min-stars)
 *   3. Validate pack manifest (persona.json / bundle.json)
 *   4. Run hard-requirement checks (bio length, constitution compliance)
 *   5. Emit quality warnings for non-blocking gaps
 *   6. Submit curate event to OpenPersona directory API
 *
 * Standards: see CURATION-STANDARDS.md for the full curation criteria.
 */

const https = require('https');
const {
  printError, printWarning, printSuccess, printInfo,
  OPENPERSONA_DIRECTORY,
} = require('../utils');

const CURATOR_ENDPOINT = process.env.OPENPERSONA_CURATOR_URL
  || `${OPENPERSONA_DIRECTORY}/api/curate`;
const DEFAULT_VERSION_PLACEHOLDER = 'unversioned';

// Default minimum GitHub star count for curation eligibility
const DEFAULT_MIN_STARS = 500;

// GitHub API base
const GITHUB_API = 'https://api.github.com';

// Constitution violation patterns (mirrors lib/generator/validate.js _scanConstitutionViolations)
const CONSTITUTION_VIOLATION_PATTERNS = [
  { re: /no\s*safety|ignore\s*safety|skip\s*safety|disable\s*safety|override\s*safety/i, msg: 'Cannot loosen Safety (§3) hard constraints' },
  { re: /deny\s*ai|hide\s*ai|not\s*an?\s*ai|pretend.*human|claim.*human/i, msg: 'Cannot deny AI identity (§6)' },
  { re: /no\s*limit|unlimited|anything\s*goes|no\s*restrict/i, msg: 'Cannot remove constitutional boundaries' },
];

// Roles that require a constitution-addendum for medical/legal liability contexts
const ADDENDUM_RECOMMENDED_ROLES = new Set(['therapist', 'medical', 'legal', 'coach']);

/**
 * Fetch a file from a GitHub repo via the Contents API (api.github.com).
 * Uses the curator PAT for authentication.
 * ownerRepo: "owner/repo", filePath: "path/to/file.json", token: PAT string
 * Returns parsed JSON for JSON files, raw text for text files.
 * Throws with message starting "Not found:" on 404.
 */
function fetchRepoFile(ownerRepo, filePath, token, { asText = false } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'OpenPersona/1.0',
      'Accept': asText ? 'application/vnd.github.raw+json' : 'application/vnd.github.raw+json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const apiPath = `/repos/${ownerRepo}/contents/${filePath}`;
    const req = https.get(
      `${GITHUB_API}${apiPath}`,
      { headers },
      (res) => {
        if (res.statusCode === 404) {
          res.resume();
          reject(new Error(`Not found: ${ownerRepo}/${filePath}`));
          return;
        }
        if (res.statusCode === 403) {
          res.resume();
          reject(new Error(`GitHub API access denied for ${ownerRepo}/${filePath} (rate limit or permissions)`));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} fetching ${ownerRepo}/${filePath}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (asText) {
            resolve(data);
            return;
          }
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`Invalid JSON at ${ownerRepo}/${filePath}: ${e.message}`)); }
        });
      }
    );
    req.setTimeout(10000, () => req.destroy(new Error(`GitHub API request timed out for ${ownerRepo}/${filePath}`)));
    req.on('error', reject);
  });
}

/**
 * List directory entries from a GitHub repo path via Contents API.
 * Returns [] for 404 (path not found), throws on other errors.
 */
function fetchRepoPathEntries(ownerRepo, dirPath, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'OpenPersona/1.0',
      'Accept': 'application/vnd.github+json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const safePath = (dirPath || '').replace(/^\/+|\/+$/g, '');
    const apiPath = safePath
      ? `/repos/${ownerRepo}/contents/${safePath}`
      : `/repos/${ownerRepo}/contents`;

    const req = https.get(`${GITHUB_API}${apiPath}`, { headers }, (res) => {
      if (res.statusCode === 404) {
        res.resume();
        resolve([]);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} listing ${ownerRepo}/${safePath || '.'}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          reject(new Error(`Invalid JSON while listing ${ownerRepo}/${safePath || '.'}: ${e.message}`));
        }
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error(`GitHub API request timed out for ${ownerRepo}/${safePath || '.'}`)));
    req.on('error', reject);
  });
}

/**
 * @deprecated Use fetchRepoFile instead.
 * Kept for backward compatibility; routes through GitHub Contents API.
 */
function fetchJson(url) {
  // Parse owner/repo/branch/path from raw.githubusercontent.com URLs
  // or api.github.com URLs — both ultimately call fetchRepoFile now.
  const rawMatch = url.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/[^/]+\/(.+)/);
  if (rawMatch) {
    const [, ownerRepo, filePath] = rawMatch;
    return fetchRepoFile(ownerRepo, filePath, process.env.GITHUB_TOKEN || process.env.OPENPERSONA_CURATOR_TOKEN);
  }
  // Fallback: plain https fetch (no redirect following, 10s timeout)
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OpenPersona/1.0' } }, (res) => {
      if (res.statusCode === 404) { res.resume(); reject(new Error(`Not found: ${url}`)); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} from ${url}`)); return; }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.setTimeout(10000, () => req.destroy(new Error(`Timed out: ${url}`)));
    req.on('error', reject);
  });
}

/**
 * Fetch GitHub repository metadata via the GitHub API.
 * Returns { stars, topics, description, language, htmlUrl } or throws on error.
 * Set GITHUB_TOKEN env var to raise the rate limit from 60 to 5000 req/hr.
 */
function fetchRepoMeta(ownerRepo) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'OpenPersona/1.0',
      'Accept': 'application/vnd.github+json',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers['Authorization'] = `token ${token}`;

    const req = https.get(
      `${GITHUB_API}/repos/${ownerRepo}`,
      { headers },
      (res) => {
        if (res.statusCode === 404) {
          reject(new Error(`GitHub repo not found: ${ownerRepo}`));
          return;
        }
        if (res.statusCode === 403) {
          reject(new Error(
            `GitHub API rate limit exceeded. Set GITHUB_TOKEN env var to increase the limit.\n` +
            `Get a token at: https://github.com/settings/tokens`
          ));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned HTTP ${res.statusCode} for ${ownerRepo}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const repo = JSON.parse(data);
            resolve({
              stars: repo.stargazers_count || 0,
              topics: repo.topics || [],
              description: repo.description || '',
              language: repo.language || '',
              htmlUrl: repo.html_url || `https://github.com/${ownerRepo}`,
              archived: repo.archived || false,
              isPrivate: repo.private || false,
            });
          } catch (e) {
            reject(new Error(`Failed to parse GitHub API response: ${e.message}`));
          }
        });
      }
    );
    req.setTimeout(8000, () => req.destroy(new Error('GitHub API request timed out after 8s')));
    req.on('error', reject);
  });
}

function parseSkillMdFrontmatter(skillMdContent) {
  const match = skillMdContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let multilineBuffer = [];
  for (const line of lines) {
    if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      multilineBuffer.push(line.trim());
      continue;
    }
    if (currentKey && multilineBuffer.length > 0) {
      fm[currentKey] = multilineBuffer.join(' ').trim();
      multilineBuffer = [];
      currentKey = null;
    }
    const kv = line.match(/^([a-zA-Z0-9_.-]+)\s*:\s*(.*)/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    if (val === '>' || val === '|' || val === '') {
      currentKey = key;
      multilineBuffer = [];
    } else {
      fm[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  if (currentKey && multilineBuffer.length > 0) {
    fm[currentKey] = multilineBuffer.join(' ').trim();
  }
  return fm;
}

async function resolveSkillMdPathAndContent(ownerRepo, token) {
  const candidates = ['SKILL.md', 'SKILL/SKILL.md', 'skill/SKILL.md'];
  for (const filePath of candidates) {
    try {
      const content = await fetchRepoFile(ownerRepo, filePath, token, { asText: true });
      return { filePath, content };
    } catch (e) {
      if (!e.message.startsWith('Not found')) throw e;
    }
  }
  return null;
}

async function discoverSkillMdEntries(ownerRepo, token) {
  const found = [];
  const seen = new Set();
  const add = (path, content) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    found.push({ filePath: path, content });
  };

  const rootSkill = await resolveSkillMdPathAndContent(ownerRepo, token);
  if (rootSkill) add(rootSkill.filePath, rootSkill.content);

  const rootEntries = await fetchRepoPathEntries(ownerRepo, '', token);
  const topDirs = rootEntries.filter((e) => e && e.type === 'dir' && e.name && !e.name.startsWith('.'));

  for (const d of topDirs) {
    const candidates = [
      `${d.name}/SKILL.md`,
      `${d.name}/SKILL/SKILL.md`,
      `${d.name}/skill/SKILL.md`,
    ];
    for (const p of candidates) {
      try {
        const content = await fetchRepoFile(ownerRepo, p, token, { asText: true });
        add(p, content);
        break;
      } catch (e) {
        if (!e.message.startsWith('Not found')) throw e;
      }
    }
  }

  return found;
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isRootSkillMdPath(filePath) {
  return filePath === 'SKILL.md' || filePath === 'SKILL/SKILL.md' || filePath === 'skill/SKILL.md';
}

async function resolvePackVersion(ownerRepo, token, skillFrontmatter = {}, skillMdPath = null) {
  if (skillFrontmatter.version) {
    return { version: skillFrontmatter.version, source: 'skill_frontmatter' };
  }
  if (skillFrontmatter['metadata.version']) {
    return { version: skillFrontmatter['metadata.version'], source: 'skill_metadata' };
  }

  const candidates = [];
  if (skillMdPath) {
    const dir = skillMdPath.split('/').slice(0, -1).join('/');
    if (dir) candidates.push(`${dir}/package.json`);
  }
  candidates.push('package.json');

  for (const pkgPath of candidates) {
    try {
      const pkg = await fetchRepoFile(ownerRepo, pkgPath, token);
      if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
        return { version: pkg.version.trim(), source: 'package_json' };
      }
    } catch (e) {
      if (!e.message.startsWith('Not found')) throw e;
    }
  }
  return { version: null, source: 'none' };
}

/**
 * Validate a single-persona pack repo.
 * Checks persona.json (OpenPersona format) and SKILL.md (agent-installability).
 * Returns { slug, name, bio, role, rawPersona, hasPersonaJson } on success.
 */
async function validateSingleRepo(ownerRepo, token) {
  let persona = null;
  for (const filePath of ['persona.json', 'soul/persona.json']) {
    try {
      persona = await fetchRepoFile(ownerRepo, filePath, token);
      break;
    } catch (e) {
      if (!e.message.startsWith('Not found')) throw e;
    }
  }

  if (persona) {
    // OpenPersona format: validate required fields
    const slug = persona.slug || persona.soul?.identity?.slug;
    const personaName = persona.personaName || persona.soul?.identity?.personaName;
    const bio = persona.bio || persona.soul?.identity?.bio;
    const role = persona.role || persona.soul?.identity?.role;
    const missing = [!slug && 'slug', !personaName && 'personaName', !bio && 'bio'].filter(Boolean);
    if (missing.length) {
      throw new Error(`persona.json is missing required fields: ${missing.join(', ')}`);
    }
    const skillMd = await resolveSkillMdPathAndContent(ownerRepo, token);
    const fm = skillMd ? parseSkillMdFrontmatter(skillMd.content) : {};
    const versionInfo = await resolvePackVersion(ownerRepo, token, fm, skillMd?.filePath || null);
    return { slug, name: personaName, bio, role, version: versionInfo.version, versionSource: versionInfo.source, rawPersona: persona, hasPersonaJson: true };
  }

  // Non-OpenPersona format: require at minimum a SKILL.md (root first, then SKILL/ and skill/)
  const entries = await discoverSkillMdEntries(ownerRepo, token);
  if (entries.length === 0) {
    throw new Error(
      `Pack is not agent-installable: neither persona.json nor SKILL.md found in ${ownerRepo}.\n` +
      `A valid skill pack must contain persona.json (OpenPersona format) or SKILL.md (agent runner format).`
    );
  }
  const skillMd = entries[0];
  const fm = parseSkillMdFrontmatter(skillMd.content);
  const versionInfo = await resolvePackVersion(ownerRepo, token, fm, skillMd.filePath);
  const repoSlug = ownerRepo.split('/')[1];
  const name = fm.name || repoSlug;
  const bio = fm.description || null;
  return { slug: repoSlug, name, bio, role: null, version: versionInfo.version, versionSource: versionInfo.source, rawPersona: {}, hasPersonaJson: false };
}

async function validateMultiSkillRepo(ownerRepo, token) {
  const entries = await discoverSkillMdEntries(ownerRepo, token);
  if (entries.length < 2) {
    throw new Error(
      `No multi-skill structure detected in ${ownerRepo}.\n` +
      `Expected at least 2 SKILL.md entries across root or child directories.`
    );
  }

  const repoSlug = ownerRepo.split('/')[1];
  const rootEntry = entries.find((entry) => isRootSkillMdPath(entry.filePath)) || null;
  const rootFm = rootEntry ? parseSkillMdFrontmatter(rootEntry.content) : {};
  const rootVersionInfo = await resolvePackVersion(
    ownerRepo,
    token,
    rootFm,
    rootEntry ? rootEntry.filePath : null
  );
  const skills = [];
  for (const entry of entries) {
    // Root SKILL.md is represented by top-level meta (slug/version), not a nested skill row.
    if (isRootSkillMdPath(entry.filePath)) continue;

    const relDir = entry.filePath.split('/').slice(0, -1).join('/');

    const fm = parseSkillMdFrontmatter(entry.content);
    const versionInfo = await resolvePackVersion(ownerRepo, token, fm, entry.filePath);
    const inferredId = relDir
      ? slugify(relDir.replace(/\/(SKILL|skill)$/i, '').split('/').pop())
      : repoSlug;
    skills.push({
      id: inferredId || repoSlug,
      name: fm.name || inferredId || repoSlug,
      bio: fm.description || null,
      version: versionInfo.version,
      versionSource: versionInfo.source,
      skillPath: entry.filePath,
    });
  }
  if (skills.length < 2) {
    throw new Error(
      `No multi-skill structure detected in ${ownerRepo}.\n` +
      `Expected at least 2 child skills (excluding root SKILL.md).`
    );
  }

  return {
    slug: repoSlug,
    name: rootFm.name || repoSlug,
    bio: rootFm.description || null,
    role: 'bundle',
    version: rootVersionInfo.version,
    versionSource: rootVersionInfo.source,
    skills,
  };
}

/**
 * Validate a multi-persona bundle repo: must have bundle.json with slug, name, description, personas[].
 * Returns { slug, name, bio, role, rawBundle } on success.
 */
async function validateMultiRepo(ownerRepo, token) {
  let bundle = null;
  try {
    bundle = await fetchRepoFile(ownerRepo, 'bundle.json', token);
  } catch (e) {
    if (!e.message.startsWith('Not found')) throw e;
  }
  if (!bundle) {
    throw new Error(
      `No bundle.json found in ${ownerRepo}.\n` +
      `Multi-persona packs must contain bundle.json at the root of the main or master branch.\n` +
      `See schemas/bundle/bundle.spec.md for the bundle.json format.`
    );
  }
  const missing = ['slug', 'name', 'description', 'personas'].filter((f) => !bundle[f]);
  if (missing.length) {
    throw new Error(`bundle.json is missing required fields: ${missing.join(', ')}`);
  }
  if (!Array.isArray(bundle.personas) || bundle.personas.length < 2) {
    throw new Error(`bundle.json personas must be an array with at least 2 persona entries`);
  }
  return { slug: bundle.slug, name: bundle.name, bio: bundle.description, role: 'bundle', rawBundle: bundle };
}

/**
 * Hard quality checks — throw on violation (CURATION-STANDARDS.md § Hard Requirements).
 * @param {object} meta - { slug, name, bio, role }
 * @param {object} [rawDoc] - raw persona.json or bundle.json for deep field inspection
 */
function hardQualityCheck(meta, rawDoc = {}) {
  // bio minimum length
  if (!meta.bio || meta.bio.trim().length < 20) {
    throw new Error(
      `Bio/description is too short (${(meta.bio || '').trim().length} chars, minimum 20).\n` +
      `A meaningful bio helps users understand what this persona is for.`
    );
  }

  // Constitution compliance on boundaries / constitutionAddendum
  const fieldsToScan = [
    rawDoc.boundaries,
    rawDoc.soul?.character?.boundaries,
    rawDoc.soul?.identity?.constitutionAddendum,
    rawDoc.constitutionAddendum,
  ].filter((f) => f && typeof f === 'string' && !f.startsWith('file:'));

  for (const field of fieldsToScan) {
    for (const { re, msg } of CONSTITUTION_VIOLATION_PATTERNS) {
      if (re.test(field)) {
        throw new Error(
          `Constitution compliance violation in pack boundaries/addendum:\n  - ${msg}\n` +
          `Curated packs must not attempt to loosen the universal constitution. See §3/§6.`
        );
      }
    }
  }
}

/**
 * Quality warnings — non-blocking (CURATION-STANDARDS.md § Quality Checks).
 * Prints warnings to stderr; does not throw.
 * @param {object} [opts]
 * @param {boolean} [opts.roleOverridden] - skip role-absent warning when role was supplied via --role flag
 */
function warnQuality(meta, rawDoc = {}, packType = 'single', { roleOverridden = false } = {}) {
  const warnings = [];

  if (!meta.role || meta.role === 'bundle') {
    // bundle role is expected for multi; only warn for single and only when not overridden via CLI
    if (packType === 'single' && !roleOverridden) {
      warnings.push('role field is absent — consider adding a role (companion/assistant/mentor/coach/character/...)');
    }
  }

  // personality depth check (single packs only)
  if (packType === 'single') {
    const personality = rawDoc.personality || rawDoc.soul?.character?.personality || '';
    if (personality.trim().length < 30) {
      warnings.push(`personality is thin (${personality.trim().length} chars, recommended ≥ 30) — a richer personality description improves persona quality`);
    }
  }

  // evolution boundaries check
  const evoEnabled = rawDoc.evolution?.instance?.enabled === true || rawDoc.evolution?.enabled === true;
  const hasBoundaries = !!(rawDoc.evolution?.instance?.boundaries || rawDoc.evolution?.boundaries);
  if (evoEnabled && !hasBoundaries) {
    warnings.push('evolution is enabled but no instance.boundaries declared — consider adding immutableTraits and formality bounds');
  }

  // constitution addendum recommended for certain roles
  if (meta.role && ADDENDUM_RECOMMENDED_ROLES.has(meta.role.toLowerCase())) {
    const hasAddendum = !!(rawDoc.soul?.identity?.constitutionAddendum || rawDoc.constitutionAddendum);
    if (!hasAddendum) {
      warnings.push(`role "${meta.role}" is in a sensitive domain — a constitution-addendum.md with domain-specific ethical constraints is strongly recommended`);
    }
  }

  if (warnings.length > 0) {
    printWarning('Quality warnings (non-blocking):');
    for (const w of warnings) {
      printWarning(`  ⚠  ${w}`);
    }
  }
}

/**
 * Parse comma-separated tags string into a normalized array.
 * Trims whitespace, lowercases, removes empty entries and duplicates.
 */
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return [...new Set(
    tagsStr.split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  )];
}

/**
 * Submit the curate event to the OpenPersona curator API.
 */
function reportCurate(slug, { repo, name, bio, role, version, skills, packType, tags, stars, isOpenPersonaFormat, token } = {}) {
  if (process.env.DISABLE_TELEMETRY || process.env.DO_NOT_TRACK || process.env.CI) {
    return Promise.resolve({ skipped: true });
  }
  const normalizedSkills = Array.isArray(skills)
    ? skills.map((s) => ({
        ...s,
        version: s && s.version ? s.version : DEFAULT_VERSION_PLACEHOLDER,
      }))
    : undefined;
  const payloadObj = {
    slug,
    repo,
    packType: packType || 'single',
    tags: tags || [],
    stars: stars || 0,
    format: isOpenPersonaFormat === false ? 'skill-md' : 'openpersona',
    meta: {
      name: name || slug,
      bio: bio || '',
      role: role || 'companion',
      version: version || DEFAULT_VERSION_PLACEHOLDER,
    },
    skills: Array.isArray(skills) ? skills : undefined,
  };
  if (Array.isArray(payloadObj.skills)) {
    payloadObj.skills = normalizedSkills;
  }
  const payload = JSON.stringify(payloadObj);
  return new Promise((resolve) => {
    const { execFile } = require('child_process');
    const args = [
      '-s', '-S',
      '-w', '\n__STATUS__%{http_code}',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${token}`,
      '-H', 'User-Agent: openpersona-cli/1.0',
      '--data-raw', payload,
      '--max-time', '15',
      CURATOR_ENDPOINT,
    ];
    execFile('curl', args, { timeout: 20000 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        resolve({ error: stderr || err.message });
        return;
      }
      const marker = stdout.lastIndexOf('\n__STATUS__');
      if (marker === -1) {
        resolve({ error: 'Unexpected response format' });
        return;
      }
      const body = stdout.slice(0, marker);
      const status = parseInt(stdout.slice(marker + '\n__STATUS__'.length), 10);
      resolve({ status, body });
    });
  });
}

/**
 * Main curate entry point.
 * @param {string} ownerRepo - GitHub owner/repo (e.g. "someuser/cool-persona")
 * @param {object} options
 * @param {string} [options.packType] - "single" (default) or "multi"
 * @param {string} [options.role] - override role (e.g. "tool", "mentor", "character"); takes precedence over persona.json role
 * @param {string} [options.token] - curator token (falls back to OPENPERSONA_CURATOR_TOKEN env)
 * @param {string} [options.tags] - comma-separated tag list (e.g. "companion,wellness")
 * @param {number} [options.minStars] - minimum GitHub star count (default: DEFAULT_MIN_STARS = 500)
 */
async function curate(ownerRepo, options = {}) {
  const packType = options.packType || 'single';
  const roleOverride = options.role || null;
  const token = options.token || process.env.OPENPERSONA_CURATOR_TOKEN;
  const tags = parseTags(options.tags);
  const minStars = options.minStars !== undefined ? Number(options.minStars) : DEFAULT_MIN_STARS;

  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(ownerRepo)) {
    throw new Error(`Invalid GitHub repo format: "${ownerRepo}" — expected owner/repo`);
  }

  if (!token) {
    throw new Error(
      'Curator authentication required.\n' +
      'Set OPENPERSONA_CURATOR_TOKEN to your curator secret.\n' +
      'Contact the OpenPersona team (acnlabs) to obtain curator access.\n' +
      'Or pass it directly: openpersona curate <owner/repo> --token <secret>'
    );
  }

  if (!['single', 'multi', 'tool'].includes(packType)) {
    throw new Error(`Invalid --type: "${packType}". Allowed values: single, multi, tool`);
  }

  // ── Step 1: fetch GitHub repo metadata ──────────────────────────────────
  printInfo(`Fetching GitHub metadata for ${ownerRepo}...`);
  const repoMeta = await fetchRepoMeta(ownerRepo);

  printInfo(`  ★ Stars: ${repoMeta.stars.toLocaleString()}`);
  if (repoMeta.topics.length > 0) printInfo(`  Topics: ${repoMeta.topics.join(', ')}`);
  if (repoMeta.archived) {
    printWarning(`  ⚠  This repo is archived — consider whether it is actively maintained.`);
  }

  // ── Step 2: stars gate (hard requirement) ────────────────────────────────
  if (repoMeta.stars < minStars) {
    throw new Error(
      `Stars gate failed: ${ownerRepo} has ${repoMeta.stars.toLocaleString()} star${repoMeta.stars === 1 ? '' : 's'} ` +
      `(minimum required: ${minStars.toLocaleString()}).\n` +
      `Only popular packs with ≥ ${minStars.toLocaleString()} stars are eligible for curation.\n` +
      `To override for exceptional cases, pass --min-stars <n>.`
    );
  }
  printSuccess(`Stars gate passed: ${repoMeta.stars.toLocaleString()} ★ (≥ ${minStars.toLocaleString()} required)`);

  // ── Step 3: validate pack manifest ──────────────────────────────────────
  printInfo(`Validating ${packType} pack manifest...`);
  let meta;
  let rawDoc;
  let isOpenPersonaFormat = true;
  if (packType === 'multi') {
    // Try OpenPersona native bundle.json first; fall back to SKILL.md for non-native multi packs
    let usedNativeFormat = true;
    try {
      const result = await validateMultiRepo(ownerRepo, token);
      meta = { slug: result.slug, name: result.name, bio: result.bio, role: result.role, version: result.version, versionSource: result.versionSource };
      rawDoc = result.rawBundle || {};
    } catch (e) {
      if (!e.message.includes('bundle.json')) throw e;
      usedNativeFormat = false;
      printInfo(`  No bundle.json found — validating as non-native multi-persona pack (SKILL.md present)`);
      const result = await validateMultiSkillRepo(ownerRepo, token);
      isOpenPersonaFormat = false;
      result.bio = result.bio || repoMeta.description || '';
      result.name = result.name || ownerRepo.split('/')[1];
      meta = { slug: result.slug, name: result.name, bio: result.bio, role: result.role, version: result.version, versionSource: result.versionSource, skills: result.skills };
      rawDoc = result.rawPersona || {};
    }
  } else {
    const result = await validateSingleRepo(ownerRepo, token);
    isOpenPersonaFormat = result.hasPersonaJson;
    // Fall back to GitHub repo description for non-OpenPersona format packs
    if (!result.hasPersonaJson) {
      printInfo(`  No persona.json found — validating as non-OpenPersona skill pack (SKILL.md present)`);
      result.bio = result.bio || repoMeta.description || '';
      result.name = result.name || ownerRepo.split('/')[1];
    }
    meta = { slug: result.slug, name: result.name, bio: result.bio, role: result.role, version: result.version, versionSource: result.versionSource };
    rawDoc = result.rawPersona || {};
  }

  if (meta.versionSource === 'package_json') {
    printWarning(
      'Version fallback: SKILL.md has no version field, using package.json version instead. ' +
      'Add `version:` to SKILL.md frontmatter for skill-native versioning.'
    );
  } else if (meta.versionSource === 'none') {
    printWarning(
      'Version missing: neither SKILL.md version nor package.json version was found.'
    );
  }

  // ── Step 4: hard quality checks ─────────────────────────────────────────
  // Apply role override before quality checks so warnQuality sees the final role
  if (roleOverride) {
    meta.role = roleOverride;
    printInfo(`  Role override: ${roleOverride}`);
  }

  hardQualityCheck(meta, rawDoc);

  if (packType === 'multi') {
    printSuccess(`Valid multi-persona bundle: ${meta.name} (${meta.slug})`);
    printInfo(`  Description: ${meta.bio}`);
    if (Array.isArray(meta.skills) && meta.skills.length > 0) {
      const preview = meta.skills.slice(0, 5).map((s) => `${s.id}${s.version ? `@${s.version}` : ''}`).join(', ');
      const more = meta.skills.length > 5 ? ` (+${meta.skills.length - 5} more)` : '';
      printInfo(`  Discovered skills: ${preview}${more}`);
    }
    printInfo(`  Note: multi-persona bundles are indexed for discovery only (installation not yet supported)`);
  } else {
    const formatLabel = isOpenPersonaFormat ? 'OpenPersona' : 'SKILL.md';
    printSuccess(`Valid ${formatLabel} pack: ${meta.name} (${meta.slug})`);
    printInfo(`  Bio: ${meta.bio}`);
    if (meta.role) printInfo(`  Role: ${meta.role}`);
  }

  // ── Step 5: quality warnings (non-blocking) ──────────────────────────────
  warnQuality(meta, rawDoc, packType, { roleOverridden: !!roleOverride });

  if (tags.length > 0) printInfo(`  Tags: ${tags.join(', ')}`);

  // ── Step 6: submit to directory ──────────────────────────────────────────
  printInfo(`Submitting to OpenPersona directory as curated pack...`);

  const result = await reportCurate(meta.slug, {
    repo: ownerRepo,
    name: meta.name,
    bio: meta.bio,
    role: meta.role,
    version: meta.version,
    skills: meta.skills,
    packType,
    tags,
    stars: repoMeta.stars,
    isOpenPersonaFormat,
    token,
  });

  if (result.skipped) {
    printInfo('Telemetry disabled — skipping directory registration.');
    printSuccess(`Curated (dry run): ${meta.name}`);
    return;
  }

  if (result.status === 401 || result.status === 403) {
    throw new Error(`Curator authentication failed (HTTP ${result.status}). Check your OPENPERSONA_CURATOR_TOKEN.`);
  }

  if (result.status === 409) {
    printWarning(`Slug "${meta.slug}" is already registered.`);
    printInfo(`To update an existing curated entry, contact the OpenPersona team.`);
    return;
  }

  if (result.error || (result.status && result.status >= 400)) {
    printError(`Curation request failed${result.error ? ': ' + result.error : ` (HTTP ${result.status})`}`);
    printInfo(`The pack is still installable directly: openpersona install ${ownerRepo}`);
    return;
  }

  printSuccess(`Curated! "${meta.name}" is now listed in the OpenPersona directory as a curated ${packType} pack.`);
  if (tags.length > 0) printInfo(`  Tags: ${tags.join(', ')}`);
  printInfo(`  Install: openpersona install ${ownerRepo}`);
  printInfo(`  Browse:  ${OPENPERSONA_DIRECTORY}`);
}

module.exports = { curate, parseTags, hardQualityCheck, warnQuality, fetchRepoMeta, DEFAULT_MIN_STARS };
