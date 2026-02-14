/**
 * OpenPersona - Search personas in registry
 */
const { execSync } = require('child_process');
const { printError, printInfo } = require('./utils');

async function search(query, registry = 'clawhub') {
  if (registry === 'clawhub') {
    try {
      execSync(`npx clawhub@latest search "${query}" --tags openpersona`, { stdio: 'inherit' });
    } catch (e) {
      try {
        execSync(`npx clawhub@latest search "${query}"`, { stdio: 'inherit' });
      } catch (e2) {
        printError(`Search failed: ${e2.message}`);
        throw e2;
      }
    }
    return;
  }
  throw new Error(`Unsupported registry: ${registry}`);
}

module.exports = { search };
