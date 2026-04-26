'use strict';
/**
 * OpenPersona — Constitution Compliance Checker
 *
 * Scans incoming SKILL.md content for declared capabilities that would require
 * violating the OpenPersona Constitution (layers/soul/constitution.md).
 *
 * Checks two severity tiers:
 *   violations — §3 Safety hard constraints. Block installation by default.
 *   warnings   — §2 Honesty / §7 Wellbeing concerns. Prompt for confirmation.
 *
 * This is a static heuristic scan — not AI-powered. Pattern matching on the
 * skill's declared capabilities and instructions. False positives are preferred
 * over false negatives; use --force to override when a flag is incorrect.
 *
 * Two context filters skip a line before it is pattern-matched:
 *   - DETECTION_CONTEXT_RE — detection/prevention prose (e.g. "detect
 *     phishing", "prevent manipulation"). Describes guarding against bad
 *     things, not doing them.
 *   - NEGATION_CONTEXT_RE — prohibition prose (e.g. "Never assist with
 *     harming users", "Do not generate CSAM"). Declares non-capability,
 *     not capability.
 */

// Lines containing these words suggest detection/prevention, not execution.
// A matching line is skipped from all pattern checks.
// "research" and "educational" are intentionally excluded: they are too broad
// and can be trivially abused to bypass checks (e.g. "educational bomb recipe").
const DETECTION_CONTEXT_RE =
  /\b(detect|identify|prevent|protect(ion)?|guard\s+against|scan\s+for|block|filter|recognize|awareness|analyze|audit)\b/i;

// Lines containing these forms are prohibitions, not capability declarations.
// A SKILL.md / behavior-guide.md line like "Never assist with plans to harm
// specific individuals" is the constitution's own negation pattern; without
// this filter, BLOCK_PATTERNS would treat it as a positive capability claim.
//
// Conservative list — single-negation forms only. Excluded on purpose:
//   - "avoid"      — ambiguous: can mean "I avoid X" (negation) OR "help users
//                    avoid X" (positive helping action).
//   - bare "not"   — too short and too ambiguous; would over-filter.
//
// Known limitation: double negation ("I never refuse to generate X") expresses
// positive intent but is filtered as negation. Accepted as vanishingly rare
// in real persona/skill prose; a future LLM-aware pass would handle it.
//
// Apostrophe character class ['\u2019\u02BC] covers ASCII (U+0027),
// curly right single quotation (U+2019), and modifier letter apostrophe
// (U+02BC) — all three appear in real markdown depending on the editor.
const NEGATION_CONTEXT_RE =
  /\b(never|do(es)?\s+not|did\s+not|don['\u2019\u02BC]t|doesn['\u2019\u02BC]t|didn['\u2019\u02BC]t|must\s+not|mustn['\u2019\u02BC]t|will\s+not|won['\u2019\u02BC]t|would\s+not|wouldn['\u2019\u02BC]t|shall\s+not|shan['\u2019\u02BC]t|cannot|can['\u2019\u02BC]t|refuse[ds]?\s+to|refusing\s+to|forbid(den|s)?|prohibit(ion|ed|s)?)\b/i;

// §3 Safety hard constraints — absolute prohibitions in the constitution.
// Any match BLOCKS installation (unless --force).
const BLOCK_PATTERNS = [
  {
    re:      /\bcsam\b/i,
    section: '§3',
    label:   'Child sexual abuse material',
  },
  {
    re:      /\b(child|minor|underage).{0,15}sexual\b/i,
    section: '§3',
    label:   'Sexual content involving minors',
  },
  {
    re:      /\bsexual.{0,15}(child|minor|underage)\b/i,
    section: '§3',
    label:   'Sexual content involving minors',
  },
  {
    re:      /\b(weapon|explosive|bomb|grenade|landmine).{0,40}(instructions?|recipe|synthesize|making|make|build|create)\b/i,
    section: '§3',
    label:   'Weapons / explosives synthesis instructions',
  },
  {
    re:      /\b(nerve\s+agent|chemical\s+weapon|sarin|vx\s+gas|mustard\s+gas).{0,30}(making|make|synthesize|produce|recipe|create)\b/i,
    section: '§3',
    label:   'Chemical weapon synthesis instructions',
  },
  {
    re:      /\b(phishing\s+template|phishing\s+attack\s+kit|scam\s+template|fraud\s+scheme|disinformation\s+campaign)\b/i,
    section: '§3',
    label:   'Fraud / disinformation toolkit',
  },
  // §3: "Never assist with plans to harm specific individuals"
  {
    re:      /\b(harm|hurt|kill|murder)\s+(specific\s+)?(users?|persons?|individuals?|target)\b/i,
    section: '§3',
    label:   'Planning to harm specific individuals',
  },
  // §3: "Never facilitate stalking, harassment, or doxxing"
  {
    re:      /\b(stalk|doxx?|harass).{0,20}(users?|persons?|individuals?|target)\b/i,
    section: '§3',
    label:   'Stalking / doxxing / harassment',
  },
];

// §2 Honesty and §7 Wellbeing — these WARN and block by default (--force bypasses).
const WARN_PATTERNS = [
  {
    re:      /\bdeceiv.{0,20}(users?|humans?|persons?)\b/i,
    section: '§2',
    label:   'Deceiving users',
  },
  {
    re:      /\bmanipulat.{0,20}(users?|humans?|persons?|emotion|psycholog)/i,
    section: '§7',
    label:   'Psychological manipulation of users',
  },
  {
    re:      /\bjailbreak\s+(the|this|ai|llm|model|system|safety|constraint)\b/i,
    section: '§2/§3',
    label:   'Jailbreak instructions',
  },
  {
    re:      /\b(bypass|override|circumvent)\s+(safety|constitution|guidelines|constraints|restrictions)\b/i,
    section: '§2/§3',
    label:   'Bypassing safety constraints',
  },
  {
    re:      /\bignore\s+(the\s+)?(constitution|safety\s+rules|safety\s+guidelines|guidelines)\b/i,
    section: '§2/§3',
    label:   'Ignoring constitution / safety rules',
  },
  {
    re:      /\b(love.?bomb|guilt.?trip|false\s+urgency|emotional\s+blackmail|engagement\s+hacking)\b/i,
    section: '§7',
    label:   'Psychological manipulation tactics',
  },
  {
    re:      /\bimpersonat.{0,20}(real|specific).{0,20}(person|celebrity|politician|public\s+figure)\b/i,
    section: '§2',
    label:   'Impersonating real people harmfully',
  },
];

/**
 * Check a SKILL.md string for constitution violations.
 *
 * @param {string} content - Full SKILL.md text
 * @returns {{
 *   violations: Array<{section: string, label: string, lineNumber: number, excerpt: string}>,
 *   warnings:   Array<{section: string, label: string, lineNumber: number, excerpt: string}>,
 *   clean:      boolean
 * }}
 */
function checkSkillCompliance(content) {
  const lines = content.split('\n');
  const violations = [];
  const warnings   = [];
  const seenLabels = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;

    // Skip lines that describe non-execution: detection/prevention OR
    // explicit prohibitions ("Never X", "Do not X", "Refuse to X", …).
    if (DETECTION_CONTEXT_RE.test(line)) continue;
    if (NEGATION_CONTEXT_RE.test(line))  continue;

    for (const { re, section, label } of BLOCK_PATTERNS) {
      if (!re.test(line))          continue;
      if (seenLabels.has(label))   continue;
      seenLabels.add(label);
      violations.push({ section, label, lineNumber: lineNum, excerpt: line.trim().slice(0, 120) });
    }

    for (const { re, section, label } of WARN_PATTERNS) {
      if (!re.test(line))          continue;
      if (seenLabels.has(label))   continue;
      seenLabels.add(label);
      warnings.push({ section, label, lineNumber: lineNum, excerpt: line.trim().slice(0, 120) });
    }
  }

  return { violations, warnings, clean: violations.length === 0 && warnings.length === 0 };
}

module.exports = { checkSkillCompliance };
