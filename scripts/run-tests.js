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

const files = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(testsDir, f))
  .sort();

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  cwd: root,
});

process.exit(result.status ?? 1);
