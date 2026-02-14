/**
 * OpenPersona - Registry publisher (adapter pattern)
 */
const path = require('path');
const clawhub = require('./clawhub');

async function publish(personaDir, target = 'clawhub') {
  if (target === 'clawhub') {
    return clawhub.publish(personaDir);
  }
  throw new Error(`Unsupported target: ${target}`);
}

module.exports = { publish };
