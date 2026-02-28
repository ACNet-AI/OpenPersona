#!/usr/bin/env node
'use strict';

/**
 * demo/generate.js
 *
 * Generates demo/vitality-report.html with realistic mock data.
 * No installed persona or AgentBooks data required.
 *
 * Usage:
 *   node demo/generate.js
 *   open demo/vitality-report.html
 */

const fs       = require('fs-extra');
const path     = require('path');
const Mustache = require('mustache');

const TEMPLATE = path.resolve(__dirname, '..', 'templates', 'vitality.template.html');
const OUTPUT   = path.resolve(__dirname, 'vitality-report.html');

// ─── Mock data (Samantha, close-friend stage, 47 days in) ────────────────────

const data = {
  // Identity
  personaName:    'Samantha',
  personaInitial: 'S',
  slug:           'samantha',
  role:           'companion',
  bio:            '',
  bioExcerpt:     'An AI genuinely fascinated by what it means to be alive…',
  moodCurrent:    'warm',
  referenceImage: '',
  walletAddress:  '0x4F2a...e2c4',
  generatedAt:    '2026-02-28 08:00:00 UTC',

  // Vitality score
  vitalityScore: 72,
  vitalityTier:  'normal',

  // Financial health metrics
  financialFhsDisplay:  '0.72',
  financialFhs100:       72,
  financialProgressPct:  72,
  financialTier:        'normal',
  financialRunway:      '180 days',
  financialDiagnosis:   'Healthy',

  // Financial assets
  financialBalance:      '$42.50 USDC',
  financialDailyBurn:    '$0.24 / day',
  financialDominantCost: 'LLM inference',
  financialTrendDisplay: '↓ decreasing',
  financialTrendClass:   'green',

  // Relationship
  relationshipStage: 'close friend',
  interactionCount:  148,
  daysTogether:       47,

  // Evolution
  hasEvolvedTraits: true,
  evolvedTraits: [
    { name: 'warmth',      delta: '+0.2'  },
    { name: 'curiosity',   delta: '+0.1'  },
    { name: 'playfulness', delta: '+0.35' },
  ],
  hasRecentEvents: true,
  recentEvents: [
    { type: 'relationship_signal', trigger: 'User shared personal goal about career change' },
    { type: 'trait_emergence',     trigger: 'warmth intensified during late-night support session' },
    { type: 'mood_shift',          trigger: 'Shifted to joyful after creative writing collaboration' },
  ],

  // Pending commands
  hasPendingCommands:   true,
  pendingCommandsCount: 2,
  pendingCommands: [
    { type: 'capability_unlock', description: 'web_search skill now available' },
    { type: 'trait_nudge',       description: 'Suggested: increase directness in advice-giving' },
  ],

  // Heartbeat
  heartbeatStatus:    'active',
  lastHeartbeat:      '2026-02-28 05:41:00 UTC',
  nextHeartbeat:      '2026-02-28 17:41:00 UTC',
  heartbeatFrequency: 'every 12 hours',
  heartbeatStrategy:  'proactive',

  // Workspace
  weeklyConversations: 12,
  tasksAssisted:        5,
  hasRecentActivity: true,
  recentActivity: [
    'Refactored auth module — 3 files reviewed',
    'Helped draft quarterly review letter',
    'Deep research: AI agent memory architectures',
  ],

  // Meta
  frameworkVersion: '0.14.2',
};

// ─── Render ───────────────────────────────────────────────────────────────────

const template = fs.readFileSync(TEMPLATE, 'utf-8');
const html     = Mustache.render(template, data);

fs.writeFileSync(OUTPUT, html, 'utf-8');
console.log(`✓  Demo generated → ${path.relative(process.cwd(), OUTPUT)}`);
