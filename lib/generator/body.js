/**
 * OpenPersona - Body layer description builder
 * Renders the four-dimensional Body section for SKILL.md and extracts interface policy.
 */

/**
 * Build the Body layer Markdown block for SKILL.md and extract interface config.
 *
 * @param {object|null} rawBody - persona.body value
 * @param {object|null} softRefBody - detected soft-ref body { name, install } or null
 * @returns {{ bodyDescription: string, hasInterfaceConfig: boolean, interfaceSignalPolicy: string, interfaceCommandPolicy: string }}
 */
function buildBodySection(rawBody, softRefBody) {
  const bodyPhysical = rawBody?.physical ||
    (rawBody && !rawBody.runtime && !rawBody.appearance && rawBody.name ? rawBody : null);
  const bodyRuntime = rawBody?.runtime || null;
  const bodyAppearance = rawBody?.appearance || null;
  const bodyInterface = rawBody?.interface || null;

  let bodyDescription = '';

  // Physical dimension
  bodyDescription += '### Physical\n\n';
  if (softRefBody) {
    bodyDescription += `**${softRefBody.name}** — not yet installed (\`${softRefBody.install}\`)\n`;
  } else if (bodyPhysical && typeof bodyPhysical === 'object' && bodyPhysical.name) {
    bodyDescription += `**${bodyPhysical.name}**${bodyPhysical.description ? ' — ' + bodyPhysical.description : ''}\n`;
    if (bodyPhysical.capabilities?.length) {
      bodyDescription += `\nCapabilities: ${bodyPhysical.capabilities.join(', ')}\n`;
    }
  } else {
    bodyDescription += 'Digital-only — no physical embodiment.\n';
  }

  // Runtime dimension
  if (bodyRuntime) {
    bodyDescription += '\n### Runtime\n\n';
    // framework is canonical (v0.17+); platform is the deprecated alias
    const fw = bodyRuntime.framework || bodyRuntime.platform;
    if (fw) bodyDescription += `- **Framework**: ${fw}\n`;
    if (bodyRuntime.host) bodyDescription += `- **Host**: ${bodyRuntime.host}\n`;
    if (bodyRuntime.models?.length) bodyDescription += `- **Models**: ${bodyRuntime.models.join(', ')}\n`;
    if (bodyRuntime.compatibility?.length) bodyDescription += `- **Compatibility**: ${bodyRuntime.compatibility.join(', ')}\n`;
    if (bodyRuntime.channels?.length) bodyDescription += `- **Channels**: ${bodyRuntime.channels.join(', ')}\n`;
    if (bodyRuntime.credentials?.length) {
      const credList = bodyRuntime.credentials.map((c) => `${c.scope} (${c.shared ? 'shared' : 'private'})`).join(', ');
      bodyDescription += `- **Credentials**: ${credList}\n`;
    }
    if (bodyRuntime.resources?.length) bodyDescription += `- **Resources**: ${bodyRuntime.resources.join(', ')}\n`;
  }

  // Appearance dimension
  if (bodyAppearance) {
    bodyDescription += '\n### Appearance\n\n';
    if (bodyAppearance.avatar) bodyDescription += `- **Avatar**: ${bodyAppearance.avatar}\n`;
    if (bodyAppearance.style) bodyDescription += `- **Style**: ${bodyAppearance.style}\n`;
    if (bodyAppearance.model3d) bodyDescription += `- **3D Model**: ${bodyAppearance.model3d}\n`;
  }

  // Interface dimension — runtime contract (nervous system) between persona and host
  const hasInterfaceConfig = !!bodyInterface;
  const interfaceSignalPolicy = bodyInterface?.signals?.enabled === false
    ? 'disabled'
    : (bodyInterface?.signals?.allowedTypes?.join(', ') || 'all types permitted');
  const interfaceCommandPolicy = bodyInterface?.pendingCommands?.enabled === false
    ? 'disabled'
    : (bodyInterface?.pendingCommands?.allowedTypes?.join(', ') || 'all types permitted');

  return { bodyDescription, hasInterfaceConfig, interfaceSignalPolicy, interfaceCommandPolicy };
}

module.exports = { buildBodySection };
