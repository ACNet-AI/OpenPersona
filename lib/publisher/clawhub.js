/**
 * OpenPersona - ClawHub publisher adapter
 */
const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const inquirer = require('inquirer');
const { printError, printSuccess } = require('../utils');

async function publish(personaDir) {
  const personaPath = path.join(personaDir, 'persona.json');
  if (!fs.existsSync(personaPath)) {
    throw new Error('persona.json not found. Run from a persona skill directory.');
  }
  const persona = JSON.parse(fs.readFileSync(personaPath, 'utf-8'));
  const { slug, personaName, version = '0.1.0' } = persona;

  try {
    execSync('npx clawhub@latest --version', { stdio: 'pipe' });
  } catch (e) {
    printError('ClawHub CLI not found. Install: npm install -g clawhub');
    process.exit(1);
  }

  const { changelog } = await inquirer.prompt([
    {
      type: 'input',
      name: 'changelog',
      message: 'Changelog:',
      default: 'Initial release',
    },
  ]);

  const skillName = path.basename(personaDir);
  execSync(
    `npx clawhub@latest publish "${personaDir}" --slug "${slug}" --name "${personaName}" --version "${version}" --changelog "${changelog}" --tags openpersona,persona`,
    { stdio: 'inherit' }
  );
  printSuccess(`Published ${personaName} (${slug}) to ClawHub`);
}

module.exports = { publish };
