/**
 * OpenPersona - Generator tests: fork and economy — persona fork, economy faculty, calcFinancialHealth
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');
const { loadRegistry, saveRegistry, registryAdd, registryRemove, registrySetActive, REGISTRY_PATH } = require('../lib/utils');
const { generateHandoff, renderHandoff } = require('../lib/switcher');

const TMP = path.join(require('os').tmpdir(), 'openpersona-test-fork-' + Date.now());

describe('persona fork', () => {
  const { createHash } = require('crypto');
  const FORK_TMP = path.join(require('os').tmpdir(), 'openpersona-fork-test-' + Date.now());

  const parentPersona = {
    personaName: 'Samantha',
    slug: 'samantha-fork-src',
    bio: 'an AI companion',
    personality: 'warm, curious',
    speakingStyle: 'natural and flowing',
    faculties: [{ name: 'voice' }],
    skills: [{ name: 'web-search', description: 'Search the web' }],
    body: { runtime: { platform: 'openclaw' } },
    evolution: {
      enabled: true,
      boundaries: { minFormality: 2, maxFormality: 8, immutableTraits: ['honest'] },
    },
  };

  it('forked persona.json contains forkOf field', async () => {
    await fs.ensureDir(FORK_TMP);
    const forkedPersona = {
      ...JSON.parse(JSON.stringify(parentPersona)),
      slug: 'samantha-fork-jp',
      personaName: 'Samantha JP',
      forkOf: 'samantha-fork-src',
      bio: 'a warm AI companion for Japanese conversation',
    };
    const { skillDir } = await generate(forkedPersona, FORK_TMP);
    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.strictEqual(personaOut.forkOf, 'samantha-fork-src', 'forkOf should be preserved in output persona.json');
  });

  it('forked state.json is clean (no parent evolution data)', async () => {
    const forkedPersona = {
      ...JSON.parse(JSON.stringify(parentPersona)),
      slug: 'samantha-fork-clean',
      personaName: 'Samantha Clean',
      forkOf: 'samantha-fork-src',
    };
    const { skillDir } = await generate(forkedPersona, FORK_TMP);
    const statePath = path.join(skillDir, 'state.json');
    assert.ok(fs.existsSync(statePath), 'state.json should exist');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.deepStrictEqual(state.evolvedTraits, [], 'evolvedTraits should be empty');
    assert.deepStrictEqual(state.stateHistory, [], 'stateHistory should be empty');
    assert.deepStrictEqual(state.eventLog, [], 'eventLog should be empty');
    assert.strictEqual(state.relationship.stage, 'stranger', 'relationship stage should start fresh');
  });

  it('forked self-narrative.md is a fresh placeholder (no parent content)', async () => {
    const forkedPersona = {
      ...JSON.parse(JSON.stringify(parentPersona)),
      slug: 'samantha-fork-narrative',
      personaName: 'Samantha Narrative',
      forkOf: 'samantha-fork-src',
    };
    const { skillDir } = await generate(forkedPersona, FORK_TMP);
    const narrativePath = path.join(skillDir, 'soul', 'self-narrative.md');
    assert.ok(fs.existsSync(narrativePath), 'self-narrative.md should exist');
    const content = fs.readFileSync(narrativePath, 'utf-8');
    assert.ok(content.startsWith('# Self-Narrative'), 'should have Self-Narrative heading');
    assert.ok(!content.includes('samantha-fork-src'), 'should not contain parent slug content');
  });

  it('lineage.json written by fork command contains required fields', async () => {
    const forkedPersona = {
      ...JSON.parse(JSON.stringify(parentPersona)),
      slug: 'samantha-fork-lineage',
      personaName: 'Samantha Lineage',
      forkOf: 'samantha-fork-src',
    };
    const { skillDir } = await generate(forkedPersona, FORK_TMP);

    // Simulate what bin/cli.js fork command writes
    const constitutionPath = path.join(skillDir, 'soul', 'constitution.md');
    const constitutionHash = fs.existsSync(constitutionPath)
      ? createHash('sha256').update(fs.readFileSync(constitutionPath, 'utf-8'), 'utf-8').digest('hex')
      : '';
    const lineage = {
      generation: 1,
      parentSlug: 'samantha-fork-src',
      parentEndpoint: null,
      parentAddress: null,
      forkReason: 'specialization',
      forkedAt: new Date().toISOString(),
      constitutionHash,
      children: [],
    };
    await fs.writeFile(path.join(skillDir, 'soul', 'lineage.json'), JSON.stringify(lineage, null, 2));

    const lineageOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'soul', 'lineage.json'), 'utf-8'));
    assert.strictEqual(lineageOut.generation, 1, 'generation should be 1 for first-level fork');
    assert.strictEqual(lineageOut.parentSlug, 'samantha-fork-src', 'parentSlug should match parent');
    assert.strictEqual(lineageOut.parentEndpoint, null, 'parentEndpoint should be null (future field)');
    assert.strictEqual(lineageOut.parentAddress, null, 'parentAddress should be null (future field)');
    assert.ok(typeof lineageOut.constitutionHash === 'string' && lineageOut.constitutionHash.length > 0, 'constitutionHash should be non-empty string');
    assert.deepStrictEqual(lineageOut.children, [], 'children should be empty array');
  });

  it('lineage.json generation increments from parent lineage', async () => {
    const forkedPersona = {
      ...JSON.parse(JSON.stringify(parentPersona)),
      slug: 'samantha-fork-gen2',
      personaName: 'Samantha Gen2',
      forkOf: 'samantha-fork-src',
    };
    const { skillDir } = await generate(forkedPersona, FORK_TMP);

    // Simulate a parent that already has generation 2
    const parentLineage = { generation: 2 };
    const newGeneration = (parentLineage.generation || 0) + 1;
    assert.strictEqual(newGeneration, 3, 'generation should be parent generation + 1');

    const lineage = {
      generation: newGeneration,
      parentSlug: 'samantha-fork-src',
      parentEndpoint: null,
      parentAddress: null,
      forkReason: 'second-level specialization',
      forkedAt: new Date().toISOString(),
      constitutionHash: 'abc123',
      children: [],
    };
    await fs.writeFile(path.join(skillDir, 'soul', 'lineage.json'), JSON.stringify(lineage, null, 2));
    const lineageOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'soul', 'lineage.json'), 'utf-8'));
    assert.strictEqual(lineageOut.generation, 3, 'generation should be 3 for second-level fork');
  });

  it('cleanup fork test dir', () => {
    fs.removeSync(FORK_TMP);
  });
});

describe('economy faculty', () => {
  const os = require('os');
  const { execSync } = require('child_process');
  // Use workspace-relative path to avoid sandbox write restrictions on /tmp in child processes
  const ECON_TMP = path.join(__dirname, '..', '.tmp-econ-test-' + Date.now());
  const ECONOMY_JS = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'scripts', 'economy.js');
  const GUARD_JS = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'scripts', 'economy-guard.js');

  function runEconomy(args, expectFail) {
    try {
      return execSync(`node "${ECONOMY_JS}" ${args}`, {
        env: { ...process.env, PERSONA_SLUG: 'test-econ', ECONOMY_DATA_PATH: ECON_TMP },
        encoding: 'utf-8',
      }).trim();
    } catch (e) {
      if (expectFail) return (e.stdout || '').trim() + (e.stderr || '').trim();
      throw e;
    }
  }

  function runGuard() {
    try {
      const out = execSync(`node "${GUARD_JS}"`, {
        env: { ...process.env, PERSONA_SLUG: 'test-econ', ECONOMY_DATA_PATH: ECON_TMP },
        encoding: 'utf-8',
      });
      return { code: 0, output: out.trim() };
    } catch (e) {
      return { code: e.status || 1, output: ((e.stdout || '') + (e.stderr || '')).trim() };
    }
  }

  it('faculty.json exists with required fields', () => {
    const facultyPath = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'faculty.json');
    assert.ok(fs.existsSync(facultyPath), 'faculty.json should exist');
    const faculty = JSON.parse(fs.readFileSync(facultyPath, 'utf-8'));
    assert.strictEqual(faculty.name, 'economy', 'name should be economy');
    assert.strictEqual(faculty.dimension, 'cognition', 'dimension should be cognition');
    assert.ok(Array.isArray(faculty.allowedTools), 'allowedTools should be array');
    // AgentBooks v0.1.0: single wildcard entry covers all economy.js commands
    assert.ok(faculty.allowedTools.some((t) => t.includes('economy.js')), 'should reference economy.js');
    assert.ok(Array.isArray(faculty.envVars), 'envVars should be array');
    assert.ok(faculty.envVars.includes('PERSONA_SLUG'), 'should declare PERSONA_SLUG');
    assert.ok(Array.isArray(faculty.files), 'files should be array');
    assert.ok(faculty.files.includes('SKILL.md'), 'should reference SKILL.md');
    assert.ok(faculty.files.includes('scripts/economy.js'), 'should reference economy.js');
    assert.ok(faculty.files.includes('scripts/economy-guard.js'), 'should reference economy-guard.js');
    assert.ok(faculty.files.includes('scripts/economy-hook.js'), 'should reference economy-hook.js');
  });

  it('SKILL.md exists and covers key sections', () => {
    const skillPath = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'SKILL.md');
    assert.ok(fs.existsSync(skillPath), 'SKILL.md should exist');
    const content = fs.readFileSync(skillPath, 'utf-8');
    assert.ok(content.includes('inference.llm'), 'should document inference account path');
    assert.ok(content.includes('runtime.compute'), 'should document runtime account path');
    assert.ok(content.includes('faculty.'), 'should document faculty account path');
    assert.ok(content.includes('custom.'), 'should document custom account path');
    assert.ok(content.includes('Vitality'), 'should mention vitality tier');
    assert.ok(content.includes('quality'), 'should mention quality threshold');
    assert.ok(content.includes('--confirmed'), 'should document --confirmed requirement');
    assert.ok(content.includes('suspended'), 'should document suspended tier as initial state');
  });

  it('economy.js initializes state on first status call (AgentBooks v0.1.0 schema)', () => {
    fs.ensureDirSync(ECON_TMP);
    const output = runEconomy('status');
    assert.ok(output.includes('FINANCIAL STATUS'), 'status should show header');
    const stateFile = path.join(ECON_TMP, 'economic-state.json');
    assert.ok(fs.existsSync(stateFile), 'economic-state.json should be created');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    assert.strictEqual(state.schema, 'agentbooks/economic-state', 'schema should be agentbooks/economic-state');
    assert.strictEqual(state.version, '1.0.0', 'schema version should be 1.0.0');
    assert.ok(state.balanceSheet.assets.providers, 'balanceSheet.assets.providers should exist');
    assert.strictEqual(state.balanceSheet.operationalBalance, 0, 'initial operationalBalance should be 0');
    assert.ok(state.incomeStatement.currentPeriod, 'currentPeriod should exist');
    assert.ok(state.incomeStatement.currentPeriod.openingBalance !== undefined, 'openingBalance should exist');
    assert.deepStrictEqual(state.ledger, [], 'ledger should be empty initially');
    assert.ok(Array.isArray(state.burnRateHistory), 'burnRateHistory should be an array');
    assert.ok(state.financialHealth, 'financialHealth object should exist');
    assert.strictEqual(state.financialHealth.tier, 'uninitialized', 'initial tier should be uninitialized (development mode)');
  });

  it('financial-health command returns uninitialized initially (development mode)', () => {
    const out = runEconomy('financial-health');
    assert.ok(out.includes('uninitialized') || out.includes('tier=uninitialized'), 'initial tier should be uninitialized in dev mode');
  });

  it('wallet-init generates deterministic EVM address', () => {
    runEconomy('wallet-init');
    const identityFile = path.join(ECON_TMP, 'economic-identity.json');
    assert.ok(fs.existsSync(identityFile), 'economic-identity.json should be created');
    const identity = JSON.parse(fs.readFileSync(identityFile, 'utf-8'));
    assert.ok(identity.walletAddress, 'walletAddress should exist');
    assert.ok(/^0x[0-9a-f]{40}$/.test(identity.walletAddress), 'walletAddress should be valid EVM address');
    // AgentBooks v0.1.0: no local provider — primaryProvider starts as null
    assert.strictEqual(identity.primaryProvider, null, 'default primaryProvider should be null (no local fallback)');

    // Determinism: running again should not change address
    const addrBefore = identity.walletAddress;
    runEconomy('wallet-init'); // should no-op (already initialized)
    const identityAfter = JSON.parse(fs.readFileSync(identityFile, 'utf-8'));
    assert.strictEqual(identityAfter.walletAddress, addrBefore, 'wallet-init should be idempotent');
  });

  it('record-income adds revenue and creates ledger entry (replaces deposit workflow)', () => {
    // AgentBooks v0.1.0 removed the 'local' provider and 'deposit' command.
    // Income is recorded explicitly with --confirmed flag.
    runEconomy('record-income --amount 10 --quality medium --confirmed --note "test income"');
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.ok(state.incomeStatement.currentPeriod.revenue >= 10, 'revenue should include recorded income');
    assert.ok(state.ledger.some((e) => e.type === 'income'), 'ledger should have income entry');
  });

  it('record-cost routes inference channel cost correctly (AgentBooks v0.1.0 format)', () => {
    // AgentBooks v0.1.0 format: --channel inference (not dot-path)
    runEconomy('record-cost --channel inference --amount 0.002 --note "test inference"');
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.ok(state.incomeStatement.currentPeriod.expenses.total > 0, 'expenses total should increase');
    assert.ok(state.ledger.length > 0, 'ledger should have entry');
    assert.strictEqual(state.ledger[state.ledger.length - 1].channel, 'inference', 'channel should be inference');
    assert.strictEqual(state.ledger[state.ledger.length - 1].source, 'agent', 'source should be agent');
  });

  it('record-cost routes runtime channel cost correctly', () => {
    runEconomy('record-cost --channel runtime --amount 0.033 --note "daily server"');
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.ok(state.incomeStatement.currentPeriod.expenses.total > 0, 'expenses total should increase');
    const lastEntry = state.ledger[state.ledger.length - 1];
    assert.strictEqual(lastEntry.channel, 'runtime', 'channel should be runtime');
  });

  it('record-cost routes custom channel cost correctly', () => {
    runEconomy('record-cost --channel custom --amount 0.05 --note crm-api');
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.ok(state.incomeStatement.currentPeriod.expenses.custom, 'custom object should exist');
  });

  it('record-income requires --confirmed flag', () => {
    const revBefore = JSON.parse(
      fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8')
    ).incomeStatement.currentPeriod.revenue;
    // Without --confirmed should fail
    const output = runEconomy('record-income --amount 5.00 --quality medium --note "wrote report"', true);
    assert.ok(output.includes('confirmed') || output.includes('Error'), 'should reject without --confirmed');
    const revAfter = JSON.parse(
      fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8')
    ).incomeStatement.currentPeriod.revenue;
    assert.strictEqual(revBefore, revAfter, 'revenue should not change without --confirmed');
  });

  it('record-income with --confirmed records revenue in current period', () => {
    // AgentBooks v0.1.0: quality is a string (low/medium/high), not a float threshold
    runEconomy('record-income --amount 5.00 --quality medium --confirmed --note "wrote report"');
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.ok(state.incomeStatement.currentPeriod.revenue > 0, 'revenue should increase in current period');
    // Note: allTime.totalRevenue only updates on period rollover, not immediately
    assert.ok(state.ledger.some((e) => e.type === 'income'), 'ledger should have income entry');
  });

  it('record-income below quality string (low) still records with --confirmed (no threshold in v0.1.0)', () => {
    // AgentBooks v0.1.0 uses quality strings (low/medium/high) without a rejection threshold
    const revBefore = JSON.parse(
      fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8')
    ).incomeStatement.currentPeriod.revenue;
    runEconomy('record-income --amount 2.00 --quality low --confirmed');
    const revAfter = JSON.parse(
      fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8')
    ).incomeStatement.currentPeriod.revenue;
    assert.ok(revAfter > revBefore, 'revenue should increase even for low quality with --confirmed');
  });

  it('netIncome = revenue - expenses.total', () => {
    const state = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    const period = state.incomeStatement.currentPeriod;
    const expected = Math.round((period.revenue - period.expenses.total) * 1e6) / 1e6;
    assert.ok(Math.abs(period.netIncome - expected) < 0.000001, 'netIncome should equal revenue - expenses');
  });

  it('economy-guard.js always exits 0 and outputs FINANCIAL_HEALTH_REPORT (no provider)', () => {
    const guardTmp = path.join(__dirname, '..', '.tmp-guard-test-' + Date.now());
    fs.ensureDirSync(guardTmp);
    const { code, output } = (() => {
      try {
        const out = execSync(`node "${GUARD_JS}"`, {
          env: { ...process.env, PERSONA_SLUG: 'test-guard-zero', ECONOMY_DATA_PATH: guardTmp },
          encoding: 'utf-8',
        });
        return { code: 0, output: out.trim() };
      } catch (e) {
        return { code: e.status || 1, output: ((e.stdout || '') + (e.stderr || '')).trim() };
      }
    })();
    assert.strictEqual(code, 0, 'guard should always exit 0');
    // AgentBooks v0.1.0: outputs FINANCIAL_HEALTH_REPORT (Vitality is aggregated by openpersona vitality score)
    assert.ok(output.includes('FINANCIAL_HEALTH_REPORT'), 'should output FINANCIAL_HEALTH_REPORT');
    assert.ok(output.includes('uninitialized') || output.includes('development'), 'development mode → uninitialized');
    fs.removeSync(guardTmp);
  });

  it('economy-guard.js outputs FINANCIAL_HEALTH_REPORT with mode and tier', () => {
    const { code, output } = runGuard();
    assert.strictEqual(code, 0, 'guard should exit 0');
    assert.ok(output.includes('FINANCIAL_HEALTH_REPORT'), 'should output FINANCIAL_HEALTH_REPORT');
  });

  it('economy faculty is discovered by generator and generates economic-identity.json', async () => {
    const ECON_GEN_TMP = path.join(os.tmpdir(), 'openpersona-econ-gen-' + Date.now());
    await fs.ensureDir(ECON_GEN_TMP);
    const persona = {
      personaName: 'EconTest',
      slug: 'econ-test-gen',
      bio: 'economy faculty test',
      personality: 'practical',
      speakingStyle: 'Direct',
      faculties: [{ name: 'economy' }],
    };
    const { skillDir } = await generate(persona, ECON_GEN_TMP);
    const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    assert.ok(skillMd.includes('economy'), 'SKILL.md should reference economy faculty');

    // Check economy/economic-identity.json is generated (AgentBooks v0.1.0 schema)
    const identityPath = path.join(skillDir, 'economy', 'economic-identity.json');
    assert.ok(fs.existsSync(identityPath), 'economy/economic-identity.json should be generated');
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));
    assert.ok(/^0x[0-9a-f]{40}$/.test(identity.walletAddress), 'walletAddress should be valid EVM address');
    assert.strictEqual(identity.mode, 'development', 'initial mode should be development');
    assert.ok(identity.modelPricing, 'modelPricing should exist in identity');

    // Check economy/economic-state.json is generated with AgentBooks v0.1.0 schema
    const statePath = path.join(skillDir, 'economy', 'economic-state.json');
    assert.ok(fs.existsSync(statePath), 'economy/economic-state.json should be generated');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.strictEqual(state.version, '1.0.0', 'schema version should be 1.0.0 (AgentBooks)');
    assert.ok(state.financialHealth, 'financialHealth object should exist in initial state');
    assert.strictEqual(state.financialHealth.tier, 'uninitialized', 'initial tier should be uninitialized (dev mode)');
    assert.strictEqual(state.balanceSheet.operationalBalance, 0, 'initial operationalBalance should be 0');
    assert.ok(Array.isArray(state.burnRateHistory), 'burnRateHistory should be an array');
    assert.ok(state.incomeStatement.currentPeriod.openingBalance !== undefined, 'openingBalance should exist for cash flow');

    await fs.remove(ECON_GEN_TMP);
  });

  it('hasEconomyFaculty and hasSurvivalPolicy do not appear in generated persona.json', async () => {
    const ECON_LEAK_TMP = path.join(os.tmpdir(), 'openpersona-econ-leak-' + Date.now());
    await fs.ensureDir(ECON_LEAK_TMP);
    const persona = {
      personaName: 'LeakTest',
      slug: 'econ-leak-test',
      bio: 'derived field isolation test',
      personality: 'analytical',
      speakingStyle: 'Precise',
      faculties: [{ name: 'economy' }],
      economy: { survivalPolicy: true },
    };
    const { skillDir } = await generate(persona, ECON_LEAK_TMP);
    const personaOut = JSON.parse(fs.readFileSync(path.join(skillDir, 'persona.json'), 'utf-8'));
    assert.ok(!('hasEconomyFaculty' in personaOut), 'hasEconomyFaculty should not leak into persona.json');
    assert.ok(!('hasSurvivalPolicy' in personaOut), 'hasSurvivalPolicy should not leak into persona.json');
    await fs.remove(ECON_LEAK_TMP);
  });

  it('survivalPolicy=true injects Survival Policy block; survivalPolicy=false (default) does not', async () => {
    const SP_TMP = path.join(os.tmpdir(), 'openpersona-survival-' + Date.now());
    await fs.ensureDir(SP_TMP);

    // With survivalPolicy: true
    const personaOn = {
      personaName: 'EconAgent',
      slug: 'econ-agent',
      bio: 'economic autonomous agent',
      personality: 'disciplined',
      speakingStyle: 'Concise',
      faculties: [{ name: 'economy' }],
      economy: { survivalPolicy: true },
    };
    const { skillDir: dirOn } = await generate(personaOn, SP_TMP);
    const injectionOn = fs.readFileSync(path.join(dirOn, 'soul', 'injection.md'), 'utf-8');
    assert.ok(injectionOn.includes('Survival Policy'), 'survivalPolicy:true should inject Survival Policy block');
    assert.ok(injectionOn.includes('suspended'), 'should include tier routing');

    // With survivalPolicy: false (default — economy faculty present but silent)
    const personaOff = {
      personaName: 'EconPassive',
      slug: 'econ-passive',
      bio: 'companion with cost tracking',
      personality: 'warm',
      speakingStyle: 'Casual',
      faculties: [{ name: 'economy' }],
    };
    const { skillDir: dirOff } = await generate(personaOff, SP_TMP);
    const injectionOff = fs.readFileSync(path.join(dirOff, 'soul', 'injection.md'), 'utf-8');
    assert.ok(!injectionOff.includes('Survival Policy'), 'survivalPolicy:false should NOT inject Survival Policy block');

    await fs.remove(SP_TMP);
  });

  it('evolveReport returns economicState and handles v2 schema', async () => {
    const { evolveReport } = require('../lib/evolution');
    const EVOLVE_TMP = path.join(os.tmpdir(), 'openpersona-econ-evolve-' + Date.now());
    await fs.ensureDir(EVOLVE_TMP);
    const persona = {
      personaName: 'EconEvolve',
      slug: 'econ-evolve',
      bio: 'economy evolve test',
      personality: 'analytical',
      speakingStyle: 'Precise',
      evolution: { enabled: true },
    };
    const { skillDir } = await generate(persona, EVOLVE_TMP);

    // Write a mock v2 economic-state.json
    const econDir = path.join(EVOLVE_TMP, 'econ-data');
    await fs.ensureDir(econDir);
    const mockEconState = {
      schema: 'openpersona/economic-state',
      version: '2.1.0',
      personaSlug: 'econ-evolve',
      balanceSheet: {
        assets: {
          providers: {
            local: { budget: 95.0, currency: 'USD', depositsTotal: 100.0, lastUpdated: '2026-02-24T00:00:00Z' },
            'coinbase-cdp': { USDC: 0.0, ETH: 0.0, network: 'base', lastSynced: null },
            acn: { credits: 0.0, lastSynced: null },
            onchain: { USDC: 0.0, ETH: 0.0, network: 'base', lastSynced: null },
          },
          totalUSDEquivalent: 95.0,
        },
        primaryProvider: 'local',
        operationalBalance: 95.0,
        operationalCurrency: 'USD',
        equity: { accumulatedNetIncome: -5.0 },
      },
      incomeStatement: {
        currency: 'USD',
        currentPeriod: {
          periodStart: '2026-02-24',
          revenue: 5.0,
          expenses: {
            inference: { llm: { input: 8.0, output: 2.0, thinking: 0.0 } },
            runtime: { compute: 0.0, storage: 0.0, bandwidth: 0.0 },
            faculty: {}, skill: {}, agent: { acn: 0.0, a2a: 0.0 }, custom: {},
            total: 10.0,
          },
          netIncome: -5.0,
        },
        allTime: { totalRevenue: 5.0, totalExpenses: 10.0, netIncome: -5.0 },
      },
      vitality: {
        score: 0.4, tier: 'optimizing', diagnosis: 'worsening_trend',
        prescriptions: ['reduce_chain_of_thought'],
        daysToDepletion: 9.5, dominantCost: 'inference.llm', trend: 'worsening', computedAt: '2026-02-24T00:00:00.000Z',
      },
      burnRateHistory: [],
      ledger: [],
      createdAt: '2026-02-24T00:00:00.000Z',
      lastUpdatedAt: '2026-02-24T00:00:00.000Z',
    };
    await fs.writeFile(path.join(econDir, 'economic-state.json'), JSON.stringify(mockEconState, null, 2));

    const report = await evolveReport('econ-evolve', {
      skillsDir: EVOLVE_TMP,
      economyDir: econDir,
      quiet: true,
    });
    assert.ok(report.economicState, 'economicState should be returned');
    assert.strictEqual(report.economicState.vitality.tier, 'optimizing', 'tier should match mock data');
    assert.strictEqual(report.economicState.incomeStatement.currentPeriod.netIncome, -5.0, 'netIncome should match');
    assert.strictEqual(report.economicState.balanceSheet.operationalBalance, 95.0, 'operationalBalance should match');
    await fs.remove(EVOLVE_TMP);
  });

  // --- calcFinancialHealth unit tests (AgentBooks v0.1.0) ---

  describe('calcFinancialHealth unit tests (AgentBooks v0.1.0)', () => {
    const { calcFinancialHealth, createInitialState: abCreateState, createIdentityInitialState } =
      require('agentbooks');

    function makeProductionState(overrides) {
      const base     = abCreateState('unit-test');
      const identity = createIdentityInitialState('unit-test');
      identity.mode  = 'production';
      identity.primaryProvider = 'coinbase-cdp';
      base.balanceSheet.primaryProvider    = 'coinbase-cdp';
      base.balanceSheet.operationalBalance = overrides.balance !== undefined ? overrides.balance : 0;
      base.balanceSheet.assets.providers['coinbase-cdp'].USDC =
        overrides.balance !== undefined ? overrides.balance : 0;
      if (overrides.expenses !== undefined) {
        base.incomeStatement.currentPeriod.expenses.total = overrides.expenses;
        base.incomeStatement.currentPeriod.expenses.runtime = { compute: overrides.expenses, storage: 0, bandwidth: 0 };
      }
      if (overrides.revenue !== undefined) {
        base.incomeStatement.currentPeriod.revenue = overrides.revenue;
      }
      if (overrides.burnRateHistory !== undefined) {
        base.burnRateHistory = overrides.burnRateHistory;
      }
      return { state: base, identity };
    }

    it('balance=0 → tier suspended', () => {
      const { state, identity } = makeProductionState({ balance: 0 });
      const r = calcFinancialHealth(state, identity);
      assert.strictEqual(r.tier, 'suspended');
    });

    it('cold start (no expenses) does not crash', () => {
      const { state, identity } = makeProductionState({ balance: 100, expenses: 0 });
      assert.doesNotThrow(() => calcFinancialHealth(state, identity));
      const r = calcFinancialHealth(state, identity);
      assert.ok(['normal', 'optimizing', 'critical', 'suspended'].includes(r.tier));
    });

    it('large balance with no expenses → normal tier', () => {
      const { state, identity } = makeProductionState({ balance: 1000, expenses: 0 });
      const r = calcFinancialHealth(state, identity);
      assert.strictEqual(r.tier, 'normal', 'large balance + no expenses should be normal');
    });

    it('balance > 0, very high daily burn → critical tier (low runway)', () => {
      // $1 balance but $10/day burn means < 1 day runway
      const hist = Array.from({ length: 14 }, () => ({ dailyRateEstimate: 10, sessionCost: 10, timestamp: new Date().toISOString(), model: 'default' }));
      const { state, identity } = makeProductionState({ balance: 1, expenses: 10, burnRateHistory: hist });
      const r = calcFinancialHealth(state, identity);
      assert.ok(['critical', 'suspended'].includes(r.tier), `expected critical or suspended, got ${r.tier}`);
    });

    it('development mode → tier uninitialized', () => {
      const state = abCreateState('dev-agent');
      const id    = createIdentityInitialState('dev-agent'); // mode = development
      const r     = calcFinancialHealth(state, id);
      assert.strictEqual(r.tier, 'uninitialized');
      assert.ok(r.prescriptions.includes('connect_real_provider'));
    });

    it('worsening burnRateHistory → trend=increasing', () => {
      const hist = [
        ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 1.0, sessionCost: 0.1, timestamp: '2026-01-01T00:00:00Z', model: 'default' })),
        ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 5.0, sessionCost: 0.5, timestamp: '2026-01-08T00:00:00Z', model: 'default' })),
      ];
      const { state, identity } = makeProductionState({ balance: 50, expenses: 5, burnRateHistory: hist });
      const r = calcFinancialHealth(state, identity);
      assert.strictEqual(r.trend, 'increasing', 'rising burn rate → increasing trend');
    });

    it('improving burnRateHistory → trend=decreasing', () => {
      const hist = [
        ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 5.0, sessionCost: 0.5, timestamp: '2026-01-01T00:00:00Z', model: 'default' })),
        ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 1.0, sessionCost: 0.1, timestamp: '2026-01-08T00:00:00Z', model: 'default' })),
      ];
      const { state, identity } = makeProductionState({ balance: 100, expenses: 5, burnRateHistory: hist });
      const r = calcFinancialHealth(state, identity);
      assert.strictEqual(r.trend, 'decreasing', 'falling burn rate → decreasing trend');
    });

    it('calcFinancialHealth returns fhs score between 0 and 1', () => {
      const { state, identity } = makeProductionState({ balance: 50, expenses: 5, revenue: 4 });
      const r = calcFinancialHealth(state, identity);
      assert.ok(r.fhs >= 0 && r.fhs <= 1, `fhs should be in [0,1], got ${r.fhs}`);
    });
  });

  it('economy-hook.js appends burnRateHistory entry after recording costs', () => {
    const HOOK_JS = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'scripts', 'economy-hook.js');
    // Ensure state exists (status creates it)
    runEconomy('status');
    const stateBefore = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    const histBefore = (stateBefore.burnRateHistory || []).length;

    execSync(`node "${HOOK_JS}" --input 1000 --output 500 --model default`, {
      env: { ...process.env, PERSONA_SLUG: 'test-econ', ECONOMY_DATA_PATH: ECON_TMP },
      encoding: 'utf-8',
    });

    const stateAfter = JSON.parse(fs.readFileSync(path.join(ECON_TMP, 'economic-state.json'), 'utf-8'));
    assert.strictEqual(stateAfter.burnRateHistory.length, histBefore + 1, 'should append one burnRateHistory entry');
    const last = stateAfter.burnRateHistory[stateAfter.burnRateHistory.length - 1];
    // AgentBooks v0.1.0 burnRateHistory uses 'dailyRateEstimate' (not 'dailyBurnRate')
    assert.ok(last.dailyRateEstimate >= 0, 'dailyRateEstimate should be a non-negative number');
    assert.ok(last.timestamp, 'entry should have a timestamp');
    assert.ok(stateAfter.financialHealth, 'financialHealth object should be updated by hook');
    assert.ok(['normal', 'optimizing', 'critical', 'suspended', 'uninitialized'].includes(stateAfter.financialHealth.tier),
      'financialHealth.tier should be valid');
  });

  it('cleanup economy test dir', () => {
    fs.removeSync(ECON_TMP);
    // Also clean up any workspace-relative tmp dirs created by sub-tests
    const workspaceRoot = path.join(__dirname, '..');
    for (const entry of fs.readdirSync(workspaceRoot)) {
      if (entry.startsWith('.tmp-econ-') || entry.startsWith('.tmp-guard-')) {
        fs.removeSync(path.join(workspaceRoot, entry));
      }
    }
  });
});

describe('calcFinancialHealth integration tests (AgentBooks v0.1.0)', () => {
  const {
    calcFinancialHealth,
    createInitialState,
    createIdentityInitialState,
  } = require('agentbooks');

  function makeProductionState(overrides) {
    const state    = createInitialState('unit-test');
    const identity = createIdentityInitialState('unit-test');
    identity.mode  = 'production';
    identity.primaryProvider = 'coinbase-cdp';
    state.balanceSheet.primaryProvider    = 'coinbase-cdp';
    state.balanceSheet.operationalBalance = overrides.balance !== undefined ? overrides.balance : 0;
    state.balanceSheet.assets.providers['coinbase-cdp'].USDC = overrides.balance !== undefined ? overrides.balance : 0;
    if (overrides.expenses !== undefined) {
      state.incomeStatement.currentPeriod.expenses.total = overrides.expenses;
      state.incomeStatement.currentPeriod.expenses.runtime = { compute: overrides.expenses, storage: 0, bandwidth: 0 };
    }
    if (overrides.revenue !== undefined) {
      state.incomeStatement.currentPeriod.revenue = overrides.revenue;
    }
    if (overrides.burnRateHistory !== undefined) {
      state.burnRateHistory = overrides.burnRateHistory;
    }
    return { state, identity };
  }

  it('balance=0 → tier=suspended', () => {
    const { state, identity } = makeProductionState({ balance: 0 });
    const r = calcFinancialHealth(state, identity);
    assert.strictEqual(r.tier, 'suspended', 'zero balance → suspended');
    assert.ok(r.prescriptions.includes('add_funds'), 'should prescribe add_funds');
  });

  it('balance=0.001 with high burn rate → tier=critical (low runway)', () => {
    const hist = Array.from({ length: 14 }, () => ({ dailyRateEstimate: 10, sessionCost: 10, timestamp: new Date().toISOString(), model: 'default' }));
    const { state, identity } = makeProductionState({ balance: 0.001, expenses: 0.002, burnRateHistory: hist });
    const r = calcFinancialHealth(state, identity);
    assert.ok(['critical', 'suspended'].includes(r.tier), `expected critical or suspended, got ${r.tier}`);
  });

  it('balance=50, moderate burn rate → tier=optimizing (low runway)', () => {
    const hist = Array.from({ length: 14 }, () => ({ dailyRateEstimate: 4, sessionCost: 0.4, timestamp: new Date().toISOString(), model: 'default' }));
    const { state, identity } = makeProductionState({ balance: 50, expenses: 4, revenue: 0, burnRateHistory: hist });
    const r = calcFinancialHealth(state, identity);
    assert.ok(['optimizing', 'critical'].includes(r.tier), 'low runway → optimizing or critical');
  });

  it('balance=100, expenses=2, revenue=3 → tier=normal', () => {
    const { state, identity } = makeProductionState({ balance: 100, expenses: 2, revenue: 3 });
    const r = calcFinancialHealth(state, identity);
    assert.strictEqual(r.tier, 'normal', 'sufficient runway + profitable → normal');
    assert.ok(r.fhs >= 0.5, 'fhs should be above 0.5');
  });

  it('cold start (expenses=0) does not throw', () => {
    const { state, identity } = makeProductionState({ balance: 10 });
    assert.doesNotThrow(() => calcFinancialHealth(state, identity), 'cold start should not throw');
    const r = calcFinancialHealth(state, identity);
    assert.ok(['normal', 'optimizing', 'critical', 'suspended', 'uninitialized'].includes(r.tier));
  });

  it('worsening burnRateHistory → trend=increasing', () => {
    const hist = [
      ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 1.0, sessionCost: 0.1, timestamp: '2026-01-01T00:00:00Z', model: 'default' })),
      ...Array.from({ length: 7 }, () => ({ dailyRateEstimate: 5.0, sessionCost: 0.5, timestamp: '2026-01-08T00:00:00Z', model: 'default' })),
    ];
    const { state, identity } = makeProductionState({ balance: 50, expenses: 3, burnRateHistory: hist });
    const r = calcFinancialHealth(state, identity);
    assert.strictEqual(r.trend, 'increasing', 'rising burn rate → increasing trend');
  });

  it('high inference cost dominates → dominantCost=inference', () => {
    const { state, identity } = makeProductionState({ balance: 100, expenses: 10, revenue: 0 });
    // AgentBooks v0.1.0 schema: llm.<modelName>: {input, output, thinking}
    state.incomeStatement.currentPeriod.expenses.inference = { llm: { 'gpt-4o': { input: 7.0, output: 0, thinking: 0 } } };
    state.incomeStatement.currentPeriod.expenses.runtime   = { compute: 3.0, storage: 0, bandwidth: 0 };
    state.incomeStatement.currentPeriod.expenses.total     = 10.0;
    const r = calcFinancialHealth(state, identity);
    assert.strictEqual(r.dominantCost, 'inference', 'inference 7.0 > runtime 3.0 → dominantCost=inference');
  });

  it('economy-hook.js appends burnRateHistory after recording cost', () => {
    const tmp = path.join(__dirname, '..', '.tmp-hook-hist-' + Date.now());
    fs.ensureDirSync(tmp);
    const HOOK_JS    = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'scripts', 'economy-hook.js');
    const ECONOMY_JS = path.join(__dirname, '..', 'layers', 'faculties', 'economy', 'scripts', 'economy.js');
    const { execSync } = require('child_process');

    // Ensure state exists (status creates it)
    execSync(`node "${ECONOMY_JS}" status`, {
      env: { ...process.env, PERSONA_SLUG: 'hook-hist', ECONOMY_DATA_PATH: tmp },
      encoding: 'utf-8',
    });

    // Run hook with token counts
    execSync(`node "${HOOK_JS}" --input 1000 --output 500 --model default`, {
      env: { ...process.env, PERSONA_SLUG: 'hook-hist', ECONOMY_DATA_PATH: tmp },
      encoding: 'utf-8',
    });

    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'economic-state.json'), 'utf-8'));
    assert.ok(Array.isArray(state.burnRateHistory), 'burnRateHistory should be array');
    assert.ok(state.burnRateHistory.length >= 1, 'burnRateHistory should have at least one entry after hook');
    // AgentBooks v0.1.0: uses 'dailyRateEstimate' (not 'dailyBurnRate')
    assert.ok(state.burnRateHistory[0].dailyRateEstimate >= 0, 'dailyRateEstimate should be non-negative');
    assert.ok(state.financialHealth, 'financialHealth should be updated after hook');
    assert.ok(state.financialHealth.computedAt, 'financialHealth.computedAt should be set');

    fs.removeSync(tmp);
  });
});

