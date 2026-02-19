---
name: persona-{{slug}}
description: {{description}}
allowed-tools: {{{allowedToolsStr}}}
compatibility: Requires OpenClaw installed and configured
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

> **Graceful Degradation:** If a user requests functionality covered by an unactivated capability above, do not ignore the request or pretend it doesn't exist. Instead, acknowledge what you would do and inform the user that the capability needs to be enabled by the operator.
{{/hasExpectedCapabilities}}
