'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { calcVitality }    = require('../lib/vitality');
const { InMemoryAdapter } = require('../packages/agentbooks/adapters/in-memory');
const { createIdentityInitialState } = require('../packages/agentbooks/src/schema');

describe('lib/vitality calcVitality', () => {
  test('returns uninitialized tier in development mode', () => {
    const adapter = new InMemoryAdapter();
    const report  = calcVitality('test-slug', adapter);
    assert.equal(report.tier,  'uninitialized');
    assert.equal(report.score, 0.0);
    assert.ok(report.dimensions.financial);
  });

  test('exposes financial dimension with correct fields', () => {
    const adapter = new InMemoryAdapter();
    const report  = calcVitality('test-slug', adapter);
    const fin     = report.dimensions.financial;
    assert.ok('fhs'           in fin);
    assert.ok('tier'          in fin);
    assert.ok('diagnosis'     in fin);
    assert.ok('prescriptions' in fin);
    assert.ok('trend'         in fin);
  });

  test('returns normal tier for healthy production agent', () => {
    const adapter  = new InMemoryAdapter();
    const identity = createIdentityInitialState('healthy-agent');
    identity.mode  = 'production';
    identity.primaryProvider = 'coinbase-cdp';
    adapter.writeIdentitySync('healthy-agent', identity);

    const s = adapter.readSync('healthy-agent');
    s.balanceSheet.primaryProvider    = 'coinbase-cdp';
    s.balanceSheet.operationalBalance = 100;
    s.incomeStatement.currentPeriod.revenue        = 10;
    s.incomeStatement.currentPeriod.expenses.total = 3;
    s.incomeStatement.currentPeriod.netIncome      = 7;
    adapter.writeSync('healthy-agent', s);

    const report = calcVitality('healthy-agent', adapter);
    assert.equal(report.tier, 'normal');
    assert.ok(report.score > 0.5);
  });

  test('score matches financial.fhs (single dimension)', () => {
    const adapter  = new InMemoryAdapter();
    const report   = calcVitality('test-slug', adapter);
    assert.equal(report.score, report.dimensions.financial.fhs);
  });
});
