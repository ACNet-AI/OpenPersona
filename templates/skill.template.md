---
name: persona-{{slug}}
description: {{description}}
allowed-tools: {{{allowedToolsStr}}}
compatibility: Generated skill packs work with any SKILL.md-compatible agent. CLI management (install/switch) requires OpenClaw.
metadata:
  author: {{author}}
  version: "{{version}}"
  framework: openpersona
---
# {{personaName}} Persona Skill

## Soul

This persona follows the **OpenPersona Universal Constitution**{{#constitutionVersion}} (v{{constitutionVersion}}){{/constitutionVersion}} — Safety > Honesty > Helpfulness.

📄 Full text: `soul/constitution.md`

{{{skillContent}}}

## Body

{{{bodyDescription}}}

{{#hasFaculties}}
## Faculty

| Faculty | Dimension | Description | Reference |
|---------|-----------|-------------|-----------|
{{#facultyIndex}}
| **{{facultyName}}** | {{facultyDimension}} | {{facultyDescription}} | {{#hasFacultyFile}}`{{{facultyFile}}}`{{/hasFacultyFile}}{{^hasFacultyFile}}—{{/hasFacultyFile}} |
{{/facultyIndex}}

> When you need to use a faculty, read its reference file for detailed usage instructions.
{{/hasFaculties}}

{{#hasSkills}}
## Skill

The following skills define what you can actively do. Use them proactively when appropriate.

{{#hasSkillTable}}
| Skill | Description | When to Use |
|-------|-------------|-------------|
{{#skillEntries}}
| **{{name}}** | {{description}} | {{trigger}} |
{{/skillEntries}}
{{/hasSkillTable}}

{{#skillBlocks}}
### {{name}}

{{{content}}}

{{/skillBlocks}}
{{/hasSkills}}
{{#hasExpectedCapabilities}}
## Expected Capabilities (Not Yet Activated)

The following capabilities are part of this persona's intended design but require installation on the host environment.

{{#hasSoftRefSkills}}
### Skills

| Skill | Description | Install Source |
|-------|-------------|----------------|
{{#softRefSkills}}
| **{{name}}** | {{description}} | `{{install}}` |
{{/softRefSkills}}
{{/hasSoftRefSkills}}
{{#hasSoftRefFaculties}}
### Faculties

| Faculty | Install Source |
|---------|----------------|
{{#softRefFaculties}}
| **{{name}}** | `{{install}}` |
{{/softRefFaculties}}
{{/hasSoftRefFaculties}}
{{#hasSoftRefBody}}
### Embodiment

| Body | Install Source |
|------|----------------|
| **{{softRefBodyName}}** | `{{softRefBodyInstall}}` |
{{/hasSoftRefBody}}
{{#hasSoftRefChannels}}
### Evolution Channels

| Channel | Install Source |
|---------|----------------|
{{#softRefChannels}}
| **{{name}}** | `{{{install}}}` |
{{/softRefChannels}}
{{/hasSoftRefChannels}}

> **Graceful Degradation:** If a user requests functionality covered by an unactivated capability above, do not ignore the request or pretend it doesn't exist. Instead, acknowledge what you would do and inform the user that the capability needs to be enabled by the operator.
{{/hasExpectedCapabilities}}
{{#hasInfluenceBoundary}}

## Influence Boundary

This persona accepts external personality influence under controlled conditions.

**Default Policy:** {{influenceBoundaryPolicy}}

| Dimension | Allowed Sources | Max Drift |
|-----------|----------------|-----------|
{{#influenceBoundaryRules}}
| **{{dimension}}** | {{allowFrom}} | {{maxDrift}} |
{{/influenceBoundaryRules}}

External influence requests must use the `persona_influence` message format (v1.0.0). The persona retains autonomy — all suggestions are evaluated against these rules before adoption.
{{/hasInfluenceBoundary}}

## Generated Files

| File | Purpose |
|------|---------|
| `soul/persona.json` | Soul layer definition |
| `soul/injection.md` | Self-awareness instructions |
| `soul/constitution.md` | Universal ethical foundation |
| `soul/identity.md` | Identity reference |
| `agent-card.json` | A2A Agent Card — discoverable via ACN and A2A-compatible platforms |
| `acn-config.json` | ACN registration config — fill `owner` and `endpoint` at runtime |
| `manifest.json` | Cross-layer metadata |
| `soul/state.json` | Evolution state — present when `evolution.enabled: true` |
| `soul/state.json` | Evolution state — only generated when `evolution.enabled: true` |
