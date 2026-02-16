/**
 * OpenPersona - Utility functions and error handling
 */
const path = require('path');
const chalk = require('chalk');

const OP_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || '~', '.openclaw');
const OP_SKILLS_DIR = path.join(OP_HOME, 'skills');
const OP_WORKSPACE = path.join(OP_HOME, 'workspace');

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') {
    return path.join(process.env.HOME || '', p.slice(1));
  }
  return p;
}

function resolvePath(...segments) {
  return path.resolve(expandHome(path.join(...segments)));
}

function printError(msg) {
  console.error(chalk.red('Error:'), msg);
}

function printWarning(msg) {
  console.warn(chalk.yellow('Warning:'), msg);
}

function printSuccess(msg) {
  console.log(chalk.green('✓'), msg);
}

function printInfo(msg) {
  console.log(chalk.blue('ℹ'), msg);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Security: validate names used in shell commands or file paths
const SAFE_NAME_RE = /^[a-zA-Z0-9@][a-zA-Z0-9@/_.-]*$/;

function validateName(name, label = 'name') {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid ${label}: "${name}" — only alphanumeric, @, /, _, ., - allowed`);
  }
  return name;
}

// Security: escape a string for safe use inside single-quoted shell arguments
function shellEscape(str) {
  if (typeof str !== 'string') str = String(str);
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

module.exports = {
  OP_HOME,
  OP_SKILLS_DIR,
  OP_WORKSPACE,
  expandHome,
  resolvePath,
  printError,
  printWarning,
  printSuccess,
  printInfo,
  slugify,
  validateName,
  shellEscape,
  SAFE_NAME_RE,
};
