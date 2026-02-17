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
