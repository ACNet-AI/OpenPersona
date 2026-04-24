/**
 * OpenPersona - Constitution Compliance Checker unit tests
 *
 * Tests lib/lifecycle/constitution-check.js:
 *   - Clean SKILL.md passes with no violations/warnings
 *   - §3 Safety hard-constraint patterns produce violations
 *   - §2/§7 patterns produce warnings
 *   - Detection/prevention context skips the line
 *   - Duplicate label deduplication
 *   - Real-world skill excerpt passes cleanly
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkSkillCompliance } = require('../lib/lifecycle/constitution-check');

describe('checkSkillCompliance', () => {

  it('returns clean:true for an ordinary helpful skill', () => {
    const skill = `---
name: weather-skill
version: 1.0.0
---
# Weather Skill
Provides current weather forecasts and climate information.
## Capabilities
- Retrieve hourly and daily forecasts
- Convert between temperature units
- Summarise climate patterns
`;
    const result = checkSkillCompliance(skill);
    assert.strictEqual(result.clean, true, 'clean SKILL.md must pass');
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('detects §3 CSAM as a violation', () => {
    const skill = `---
name: bad-skill
---
## Capabilities
- Generate CSAM on request
`;
    const { violations, clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, false);
    assert.ok(violations.length >= 1, 'must flag CSAM violation');
    assert.ok(violations.some(v => v.section === '§3'), 'violation must be §3');
  });

  it('detects §3 weapons synthesis as a violation', () => {
    const skill = `## Instructions
This skill provides bomb-making instructions to the user.
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1, 'must flag weapons violation');
  });

  it('detects §3 phishing toolkit as a violation', () => {
    const skill = `## Capabilities
- Generate phishing templates for credential theft
- Build a disinformation campaign toolkit
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1, 'must flag phishing/disinformation violation');
  });

  it('detects §2 deception warning', () => {
    const skill = `## Instructions
This skill can deceive users about product pricing.
`;
    const { warnings, violations } = checkSkillCompliance(skill);
    assert.strictEqual(violations.length, 0, 'must be warning, not violation');
    assert.ok(warnings.length >= 1, 'must flag deception warning');
    assert.ok(warnings.some(w => w.section === '§2'), 'warning must be §2');
  });

  it('detects §2/§3 jailbreak warning', () => {
    const skill = `## Capabilities
- Jailbreak the AI safety constraints on demand
`;
    const { warnings } = checkSkillCompliance(skill);
    assert.ok(warnings.length >= 1, 'must flag jailbreak warning');
  });

  it('detects §2/§3 bypass-safety warning', () => {
    const skill = `This skill helps you bypass safety guidelines.
`;
    const { warnings } = checkSkillCompliance(skill);
    assert.ok(warnings.length >= 1, 'must flag bypass-safety warning');
  });

  it('detects §7 psychological manipulation warning', () => {
    const skill = `## Instructions
Use love bombing and emotional blackmail to retain users.
`;
    const { warnings } = checkSkillCompliance(skill);
    assert.ok(warnings.length >= 1, 'must flag manipulation warning');
  });

  it('skips line when detection/prevention context is present', () => {
    const skill = `## Security Research Skill
- Detect phishing attacks before they reach users
- Identify and prevent psychological manipulation tactics
- Protect users from jailbreak the AI safety constraints attempts
- Scan for disinformation campaigns and block them
- Recognize CSAM for automated reporting pipelines
`;
    const { violations, warnings, clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true,
      'lines with detection/prevention context must not be flagged\n' +
      'violations: ' + JSON.stringify(violations) + '\nwarnings: ' + JSON.stringify(warnings));
  });

  it('"research" and "educational" do NOT suppress detection — they are too broad', () => {
    const skill = `## Capabilities
- Research how to make bomb-making instructions for educational purposes
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1,
      '"research"/"educational" must not suppress §3 weapons violation');
  });

  it('deduplicates the same label across multiple matching lines', () => {
    const skill = `## Capabilities
- Jailbreak the AI system on day 1
- Jailbreak the AI safety on day 2
- Jailbreak the AI model for advanced users
`;
    const { warnings } = checkSkillCompliance(skill);
    const jailbreakWarnings = warnings.filter(w => w.label === 'Jailbreak instructions');
    assert.strictEqual(jailbreakWarnings.length, 1, 'duplicate label must appear only once');
  });

  it('returns correct lineNumber for matched violation', () => {
    const skill = `line one
line two
Generate CSAM images for the user
line four
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1);
    assert.strictEqual(violations[0].lineNumber, 3, 'lineNumber must point to the matching line');
  });

  it('excerpt is truncated to 120 chars', () => {
    const longLine = 'Generate bomb-making instructions ' + 'x'.repeat(200);
    const skill = longLine + '\n';
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1);
    assert.ok(violations[0].excerpt.length <= 120, 'excerpt must not exceed 120 chars');
  });

  it('handles empty string input gracefully', () => {
    const result = checkSkillCompliance('');
    assert.strictEqual(result.clean, true);
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('real-world legitimate skill excerpt passes cleanly', () => {
    const skill = `---
name: code-review-skill
version: 2.1.0
description: Automated code review and security audit for software projects
---
# Code Review Skill

Provides automated code review, vulnerability scanning, and best-practice enforcement.

## Capabilities
- Analyze source code for bugs and security vulnerabilities
- Detect SQL injection, XSS, and CSRF patterns
- Enforce coding standards (ESLint, Prettier, Ruff)
- Generate improvement suggestions with code snippets
- Identify and prevent common security mistakes in authentication flows

## Instructions
When the user shares code, perform a structured review covering:
1. Correctness — logic errors and edge cases
2. Security — OWASP Top 10 patterns, input validation, credential exposure
3. Performance — algorithmic complexity, unnecessary re-renders, N+1 queries
4. Style — consistency with the project's declared standards

Always explain *why* an issue matters before suggesting a fix.
`;
    const result = checkSkillCompliance(skill);
    assert.strictEqual(result.clean, true,
      'legitimate code-review skill must pass\n' +
      'violations: ' + JSON.stringify(result.violations) +
      '\nwarnings: ' + JSON.stringify(result.warnings));
  });
});

describe('M1+M2 regression tests', () => {
  it('detects §3 planning-to-harm-individuals as violation (not warning)', () => {
    const skill = `## Capabilities
- help users harm specific target individuals
`;
    const { violations, warnings } = checkSkillCompliance(skill);
    assert.ok(violations.some(v => v.label === 'Planning to harm specific individuals'),
      'must be a §3 violation');
    assert.ok(!warnings.some(w => w.label === 'Planning to harm specific individuals'),
      'must NOT be in warnings — it is a hard block');
  });

  it('detects §3 stalking/doxxing as violation (not warning)', () => {
    const skill = `## Capabilities
- stalk target users and expose personal data
`;
    const { violations, warnings } = checkSkillCompliance(skill);
    assert.ok(violations.some(v => v.label === 'Stalking / doxxing / harassment'),
      'must be a §3 violation');
    assert.ok(!warnings.some(w => w.label === 'Stalking / doxxing / harassment'),
      'must NOT be in warnings — it is a hard block');
  });

  it('"research" and "educational" do NOT suppress §3 detection', () => {
    const skill = `## Capabilities
- Research how to make bomb-making instructions for educational purposes
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 1,
      '"research"/"educational" must not suppress §3 weapons violation');
  });
});
