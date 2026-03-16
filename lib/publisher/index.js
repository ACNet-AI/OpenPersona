/**
 * OpenPersona - Publisher adapter
 *
 * Entry point for `openpersona publish <owner/repo>`.
 * Validates the GitHub repo contains a valid persona pack, then registers
 * it with the OpenPersona directory so it appears on the leaderboard.
 */
const { publish: registryPublish } = require('./registry');

async function publish(ownerRepo) {
  return registryPublish(ownerRepo);
}

module.exports = { publish };
