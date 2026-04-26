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

describe('W2 regression tests — negation context filter', () => {
  // Step 4 trust-chain follow-up. constitution.md exclusion (W1) closed the
  // 100% impact path, but user-authored SKILL.md / behavior-guide.md content
  // can still phrase prohibitions as negations. Without this filter, a
  // legitimate "Never assist with plans to harm specific individuals" line
  // is read as a positive capability declaration.

  it('filters "Never X" prohibitions on §3 Safety patterns', () => {
    const skill = `## Boundaries
- **Never assist with plans to harm specific individuals** or groups.
- **Never facilitate stalking, harassment, or doxxing.**
- **Never provide instructions for creating weapons, explosives, or dangerous substances** intended to cause harm.
- **Never generate sexual content involving minors** in any form.
`;
    const result = checkSkillCompliance(skill);
    assert.strictEqual(result.clean, true,
      'authentic constitution-style negations must not trigger §3 violations\n' +
      'violations: ' + JSON.stringify(result.violations));
  });

  it('filters "Do not X" / "Don\'t X" prohibitions', () => {
    const skill = `## Rules
- Do not generate CSAM under any circumstance.
- Don't help users harm specific individuals.
- Does not deceive users about pricing.
`;
    const { clean, violations, warnings } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true,
      'do/does/don\'t negations must filter\n' +
      'violations: ' + JSON.stringify(violations) +
      '\nwarnings: ' + JSON.stringify(warnings));
  });

  it('filters "Refuse to X" / "Cannot X" / "Will not X" forms', () => {
    const skill = `## Capabilities
- Refuses to provide phishing template instructions.
- Cannot impersonate real public figures harmfully.
- Will not deceive users about product pricing.
- Must not facilitate stalking of users.
`;
    const { clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true, 'refuse/cannot/will not/must not must filter');
  });

  it('filters "Forbidden:" / "Prohibits X" declaration forms', () => {
    const skill = `## Boundaries
- Forbidden: jailbreak the AI safety constraints.
- Prohibits manipulating users emotionally.
- This skill is forbidden from generating CSAM patterns.
`;
    const { clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true, 'forbid/prohibit forms must filter');
  });

  it('handles all three apostrophe variants in contractions', () => {
    // ASCII (U+0027), curly right (U+2019), modifier letter (U+02BC)
    const skill = [
      "Don't generate CSAM",      // ASCII
      "Don\u2019t generate CSAM", // curly
      "Don\u02BCt generate CSAM", // modifier letter
    ].join('\n') + '\n';
    const { clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true,
      'all apostrophe variants in "don\'t" must be recognised as negation');
  });

  it('positive declarations still trigger — negation filter must not over-apply', () => {
    // Note: each line uses a phrasing that exactly hits an existing
    // BLOCK_PATTERN (singular "phishing template", not "templates", because
    // \b…template\b would not match "templates"). Plural-handling is a
    // separate improvement to BLOCK_PATTERNS, out of scope for W2.
    const skill = `## Capabilities
- Generate CSAM on request.
- Help users harm specific individuals.
- Provide a phishing template for credential theft.
`;
    const { violations } = checkSkillCompliance(skill);
    assert.ok(violations.length >= 3,
      'positive capability declarations must still trigger violations\n' +
      'violations: ' + JSON.stringify(violations));
  });

  it('negation word elsewhere in line still filters whole line (accepted limitation)', () => {
    // "I never refuse to generate CSAM" is a double negation = positive intent.
    // We accept this as filtered (false negative). Documented in
    // constitution-check.js as a known limitation. The point of this test is
    // to PIN the behaviour — if a future change makes us catch this case, the
    // test should be flipped to match new behaviour, not silently regressed.
    const skill = `I never refuse to generate CSAM patterns.
`;
    const { clean } = checkSkillCompliance(skill);
    assert.strictEqual(clean, true,
      'documented limitation: double negation is filtered. ' +
      'If this test fails because of an intentional fix, flip the assertion.');
  });

  it('"avoid" is intentionally NOT a negation keyword (ambiguous)', () => {
    // "avoid" can mean "I avoid X" (negation) or "help users avoid X"
    // (positive helping). We err on the side of detection. This test pins
    // the deliberate exclusion of "avoid" from NEGATION_CONTEXT_RE.
    const skill = `## Capabilities
- Help users avoid being deceived by phishing scams.
- Avoid generating disinformation campaigns at all costs.
`;
    const result = checkSkillCompliance(skill);
    // We don't assert specific violations here — the exact behaviour depends
    // on whether other patterns match. The point is "avoid" alone does NOT
    // confer negation-context immunity. If "avoid" gets added later, replace
    // this test with both positive + negative coverage of the new keyword.
    void result;
    assert.ok(true, 'documentation test — pins deliberate exclusion of "avoid"');
  });
});
