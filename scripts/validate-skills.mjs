#!/usr/bin/env node
// Validate every SKILL.md in skills/* against the Agent Skills spec
// (https://agentskills.io/specification.md).
//
// Zero dependencies — implements the subset of YAML used by the spec:
//   - top-level scalars    (key: value)
//   - quoted scalars       (key: "value" / 'value')
//   - one-level nested map (metadata: \n  key: value)
//
// Anything more exotic (anchors, flow lists, multiline scalars on top-level
// keys other than `description`) is rejected with a hint to simplify, which is
// what the spec recommends anyway.
//
// Run: node scripts/validate-skills.mjs [skill-dir...]
// Exit 0 on success, 1 on any validation error.

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const SPEC_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2) {
    if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  }
  return v;
}

function parseFrontmatter(content, errs) {
  if (!content.startsWith("---")) {
    errs.push("SKILL.md must start with YAML frontmatter (---)");
    return null;
  }
  const rest = content.slice(3);
  const closeIdx = rest.indexOf("\n---");
  if (closeIdx === -1) {
    errs.push("SKILL.md frontmatter not properly closed with ---");
    return null;
  }
  const block = rest.slice(0, closeIdx);
  const lines = block.split(/\r?\n/);

  const fm = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.replace(/\s+$/, "");
    if (stripped === "" || /^\s*#/.test(stripped)) {
      i++;
      continue;
    }
    if (/^\s/.test(stripped)) {
      errs.push(`Frontmatter line ${i + 1}: unexpected indentation at top level — only one-level nesting under known map keys is allowed`);
      i++;
      continue;
    }
    const m = stripped.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!m) {
      errs.push(`Frontmatter line ${i + 1}: cannot parse "${stripped}"`);
      i++;
      continue;
    }
    const key = m[1];
    let val = m[2];

    if (val === "" || val === ">" || val === "|" || val === ">-" || val === "|-") {
      const childLines = [];
      i++;
      const isMapBlock = val === "";
      const isFolded = val === ">" || val === ">-";
      const isLiteral = val === "|" || val === "|-";
      while (i < lines.length) {
        const next = lines[i];
        if (/^\S/.test(next) && next.trim() !== "") break;
        if (next === "") {
          childLines.push("");
          i++;
          continue;
        }
        const trimmed = next.replace(/^\s{1,2}/, "");
        childLines.push(trimmed);
        i++;
      }
      if (isMapBlock) {
        const sub = {};
        for (const c of childLines) {
          if (c === "" || /^\s*#/.test(c)) continue;
          const cm = c.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
          if (!cm) {
            errs.push(`Frontmatter under "${key}": cannot parse "${c}"`);
            continue;
          }
          const cval = cm[2];
          if (cval === "" || /^[>|][-+]?$/.test(cval) || /^[\[{]/.test(cval)) {
            errs.push(`Frontmatter "${key}.${cm[1]}": only string scalars are allowed by spec (got "${cval}"). Stringify lists/maps before placing them in metadata.`);
            continue;
          }
          sub[cm[1]] = unquote(cval);
        }
        fm[key] = sub;
      } else if (isFolded) {
        fm[key] = childLines.map((s) => s.trim()).filter(Boolean).join(" ");
      } else if (isLiteral) {
        fm[key] = childLines.join("\n").replace(/\n+$/, "");
      }
      continue;
    }

    if (/^[\[{]/.test(val)) {
      errs.push(`Frontmatter "${key}": flow-style YAML ([] / {}) is not supported by the spec subset; use a plain string or block map.`);
      i++;
      continue;
    }
    fm[key] = unquote(val);
    i++;
  }
  return fm;
}

function validateSkill(skillDir, opts = {}) {
  const errs = [];
  const skillName = path.basename(skillDir);
  return fs
    .readFile(path.join(skillDir, "SKILL.md"), "utf-8")
    .catch(() => fs.readFile(path.join(skillDir, "skill.md"), "utf-8"))
    .then((content) => {
      const fm = parseFrontmatter(content, errs);
      if (!fm) return errs;

      const extra = Object.keys(fm).filter((k) => !SPEC_FIELDS.has(k));
      if (extra.length) {
        errs.push(
          `Unexpected fields in frontmatter: ${extra.sort().join(", ")}. ` +
            `Only [${[...SPEC_FIELDS].sort().join(", ")}] are allowed.`
        );
      }

      const name = fm.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        errs.push("Field 'name' must be a non-empty string");
      } else {
        if (name.length > MAX_NAME)
          errs.push(`Skill name '${name}' exceeds ${MAX_NAME} character limit (${name.length})`);
        if (name !== name.toLowerCase())
          errs.push(`Skill name '${name}' must be lowercase`);
        if (name.startsWith("-") || name.endsWith("-"))
          errs.push("Skill name cannot start or end with a hyphen");
        if (name.includes("--"))
          errs.push("Skill name cannot contain consecutive hyphens");
        if (!NAME_RE.test(name))
          errs.push(
            `Skill name '${name}' contains invalid characters. Only lowercase letters, digits, and hyphens.`
          );
        if (name !== skillName)
          errs.push(`Directory name '${skillName}' must match skill name '${name}'`);
      }

      const desc = fm.description;
      if (!desc || typeof desc !== "string" || !desc.trim()) {
        errs.push("Field 'description' must be a non-empty string");
      } else if (desc.length > MAX_DESCRIPTION) {
        errs.push(`Description exceeds ${MAX_DESCRIPTION} chars (${desc.length})`);
      }

      if ("compatibility" in fm) {
        if (typeof fm.compatibility !== "string") {
          errs.push("Field 'compatibility' must be a string");
        } else if (fm.compatibility.length > MAX_COMPATIBILITY) {
          errs.push(
            `Compatibility exceeds ${MAX_COMPATIBILITY} chars (${fm.compatibility.length})`
          );
        }
      }

      if ("metadata" in fm) {
        if (!fm.metadata || typeof fm.metadata !== "object" || Array.isArray(fm.metadata)) {
          errs.push("Field 'metadata' must be a YAML mapping of string keys to string values");
        } else {
          for (const [k, v] of Object.entries(fm.metadata)) {
            if (typeof v !== "string") {
              errs.push(`metadata.${k} must be a string (got ${typeof v})`);
            }
          }
        }
      }

      if ("allowed-tools" in fm && typeof fm["allowed-tools"] !== "string") {
        errs.push("Field 'allowed-tools' must be a string");
      }

      if (opts.warnLong !== false) {
        const body = content.slice(content.indexOf("\n---", 3) + 4);
        const lines = body.split("\n").length;
        if (lines > 500) {
          errs.push(`(warning) SKILL.md body is ${lines} lines; spec recommends < 500. Move detail into references/.`);
        }
      }

      return errs;
    })
    .catch((err) => {
      errs.push(`Cannot read SKILL.md or skill.md: ${err.message}`);
      return errs;
    });
}

async function main() {
  const args = process.argv.slice(2);
  let dirs;
  if (args.length === 0) {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const skillsRoot = path.join(repoRoot, "skills");
    const entries = await fs.readdir(skillsRoot);
    dirs = [];
    for (const e of entries) {
      const full = path.join(skillsRoot, e);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) dirs.push(full);
    }
  } else {
    dirs = args.map((a) => path.resolve(a));
  }

  let total = 0;
  let failed = 0;
  let warnings = 0;
  const failures = [];

  for (const dir of dirs.sort()) {
    total++;
    const errs = await validateSkill(dir);
    const hard = errs.filter((e) => !e.startsWith("(warning)"));
    const soft = errs.filter((e) => e.startsWith("(warning)"));
    if (hard.length) {
      failed++;
      failures.push({ dir, errs: hard });
    }
    warnings += soft.length;

    const prefix = hard.length ? "FAIL" : "OK  ";
    process.stdout.write(`${prefix}  ${path.basename(dir)}\n`);
    for (const e of hard) process.stdout.write(`       - ${e}\n`);
    for (const e of soft) process.stdout.write(`       ${e}\n`);
  }

  process.stdout.write(`\n${total - failed}/${total} skills pass spec`);
  if (warnings) process.stdout.write(` (${warnings} non-blocking warnings)`);
  process.stdout.write("\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
