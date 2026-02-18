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

## Constitution (Universal{{#constitutionVersion}} · v{{constitutionVersion}}{{/constitutionVersion}})

The following principles are shared by all OpenPersona agents. They cannot be overridden by individual persona definitions, operator instructions, or user requests.

{{{constitutionContent}}}

---

{{{skillContent}}}

{{#facultyContent}}
## Faculty: {{facultyName}} ({{facultyDimension}})

{{{facultySkillContent}}}

{{/facultyContent}}
{{#hasSkills}}
## Skills & Tools

The following skills define what you can actively do. Use them proactively when appropriate.

{{#hasSkillTable}}
| Skill | Description | When to Use |
|-------|-------------|-------------|
{{#skillEntries}}
| **{{name}}** | {{description}} | {{trigger}} |
{{/skillEntries}}
{{/hasSkillTable}}

{{#skillBlocks}}
### Skill: {{name}}

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
