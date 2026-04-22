#!/usr/bin/env node
'use strict';

/**
 * Cross-version test runner for Node 18/20/22.
 * Discovers tests/*.js and runs them via node --test.
 * Avoids Node 21+ directory recursion change and npm script glob expansion issues.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');

if (!fs.existsSync(testsDir)) {
  console.error('tests/ directory not found');
  process.exit(1);
}

// Recursively collect all .js files under tests/ so suites in subdirectories
// (e.g. tests/skill/) are picked up. Node 21+ changed --test directory-mode
// semantics; we always pass explicit file paths for determinism across versions.
function collectTests(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTests(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = collectTests(testsDir).sort();

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

// --test-concurrency=1 serializes test files.
// Required because several suites temporarily chdir / override process.exit —
// parallel workers can race and cause "Unable to deserialize cloned data"
// structured-clone failures on Node 20.x. Serial execution is deterministic
// and the whole suite still completes in ~15s.
const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit', cwd: root }
);

process.exit(result.status ?? 1);
