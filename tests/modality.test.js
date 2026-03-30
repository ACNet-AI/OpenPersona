/**
 * OpenPersona — Body Runtime Modalities Tests
 *
 * Tests for body.runtime.modalities:
 *   1. String shorthand: 'voice' → voice faculty auto-injected
 *   2. Object format: { type: 'voice', provider: 'elevenlabs' } → voice injected + voiceProvider derived
 *   3. Mixed format: ['document', { type: 'vision', provider: 'claude-vision' }]
 *   4. Custom type: [{ type: 'holographic' }] → hasCustomModalities = true
 *   5. No modalities → only memory injected (backward compat)
 *   6. voice already declared → no duplicate injection
 *   7. Derived flags: hasVisionModality, hasDocumentModality, hasLocationModality, hasEmotionModality, hasSensorModality
 *   8. soul/injection.md contains modality awareness blocks
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { generate } = require('../lib/generator');

function basePersona(overrides = {}) {
  return {
    soul: {
      identity: { personaName: 'Test', slug: 'test-modality', bio: 'test persona' },
      character: { personality: 'neutral', speakingStyle: 'plain' },
    },
    body: { runtime: { framework: 'openclaw' } },
    evolution: { instance: { enabled: true, boundaries: { immutableTraits: ['honest'], minFormality: -3, maxFormality: 5 } } },
    ...overrides,
  };
}

async function gen(persona) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-modality-'));
  try {
    const { skillDir } = await generate(persona, tmpDir);
    const personaJson = await fs.readJson(path.join(skillDir, 'persona.json'));
    const injectionMd = await fs.readFile(path.join(skillDir, 'soul', 'injection.md'), 'utf8');
    return { skillDir, personaJson, injectionMd, tmpDir };
  } catch (e) {
    await fs.remove(tmpDir);
    throw e;
  }
}

describe('Modality: no modalities declared', () => {
  let result;
  before(async () => { result = await gen(basePersona()); });
  after(async () => { await fs.remove(result.tmpDir); });

  it('memory faculty is auto-injected', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'memory'));
  });

  it('voice faculty is NOT injected (no modalities)', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(!faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice'));
  });

  it('injection.md does not contain Voice Modality block', () => {
    assert.ok(!result.injectionMd.includes('**Voice Modality:**'));
  });
});

describe('Modality: string shorthand "voice"', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: ['voice'] } },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('voice faculty is auto-injected', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice'));
  });

  it('memory faculty is also present', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'memory'));
  });

  it('injection.md contains Voice Modality block', () => {
    assert.ok(result.injectionMd.includes('**Voice Modality:**'));
  });
});

describe('Modality: object format with provider', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: {
        runtime: {
          framework: 'openclaw',
          modalities: [{ type: 'voice', provider: 'elevenlabs', inputProvider: 'whisper' }],
        },
      },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('voice faculty is auto-injected', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice'));
  });

  it('injection.md contains provider name', () => {
    assert.ok(result.injectionMd.includes('elevenlabs'));
  });

  it('injection.md contains inputProvider name', () => {
    assert.ok(result.injectionMd.includes('whisper'));
  });
});

describe('Modality: voice already declared — no duplicate injection', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: ['voice'] } },
      faculties: [{ name: 'voice', provider: 'elevenlabs', voiceId: 'custom-voice-id' }],
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('voice faculty appears exactly once', () => {
    const faculties = result.personaJson.faculties || [];
    const voiceCount = faculties.filter(f => (typeof f === 'string' ? f : f.name) === 'voice').length;
    assert.strictEqual(voiceCount, 1, 'voice faculty must not be duplicated');
  });

  it('custom voiceId is preserved', () => {
    const faculties = result.personaJson.faculties || [];
    const voiceFaculty = faculties.find(f => (typeof f === 'string' ? f : f.name) === 'voice');
    assert.strictEqual(typeof voiceFaculty, 'object');
    assert.strictEqual(voiceFaculty.voiceId, 'custom-voice-id');
  });
});

describe('Modality: vision — faculty auto-injected', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: [{ type: 'vision', provider: 'claude-vision' }] } },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('vision faculty is auto-injected', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'vision'));
  });

  it('voice faculty is NOT injected (no voice modality)', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(!faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice'));
  });

  it('injection.md contains Vision Modality block', () => {
    assert.ok(result.injectionMd.includes('**Vision Modality:**'));
  });

  it('injection.md contains vision provider name', () => {
    assert.ok(result.injectionMd.includes('claude-vision'));
  });
});

describe('Modality: vision already declared — no duplicate injection', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: ['vision'] } },
      faculties: [{ name: 'vision' }],
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('vision faculty appears exactly once', () => {
    const faculties = result.personaJson.faculties || [];
    const count = faculties.filter(f => (typeof f === 'string' ? f : f.name) === 'vision').length;
    assert.strictEqual(count, 1, 'vision faculty must not be duplicated');
  });
});

describe('Modality: mixed format', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: {
        runtime: {
          framework: 'openclaw',
          modalities: [
            'document',
            { type: 'vision', provider: 'claude-vision' },
            'location',
          ],
        },
      },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('injection.md contains Document Modality block', () => {
    assert.ok(result.injectionMd.includes('**Document Modality:**'));
  });

  it('injection.md contains Vision Modality block', () => {
    assert.ok(result.injectionMd.includes('**Vision Modality:**'));
  });

  it('injection.md contains Location Modality block', () => {
    assert.ok(result.injectionMd.includes('**Location Modality:**'));
  });

  it('voice faculty is NOT injected', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(!faculties.some(f => (typeof f === 'string' ? f : f.name) === 'voice'));
  });
});

describe('Modality: emotion and sensor', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: ['emotion', 'sensor'] } },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('injection.md contains Emotion Modality block', () => {
    assert.ok(result.injectionMd.includes('**Emotion Modality:**'));
  });

  it('injection.md contains Sensor Modality block', () => {
    assert.ok(result.injectionMd.includes('**Sensor Modality:**'));
  });
});

describe('Modality: custom type', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: [{ type: 'holographic' }] } },
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('injection.md contains Additional Modalities block', () => {
    assert.ok(result.injectionMd.includes('**Additional Modalities:**'));
  });

  it('injection.md mentions custom type name', () => {
    assert.ok(result.injectionMd.includes('holographic'));
  });
});

describe('Sense Faculty: emotion-sensing explicit declaration', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      faculties: [{ name: 'emotion-sensing' }],
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('emotion-sensing faculty is present in output persona.json', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'emotion-sensing'));
  });

  it('memory faculty is also present (auto-injected)', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'memory'));
  });

  it('emotion-sensing is NOT auto-injected without explicit declaration', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-emotion-'));
    try {
      const { skillDir } = await generate(basePersona(), tmpDir);
      const personaJson = await fs.readJson(path.join(skillDir, 'persona.json'));
      const faculties = personaJson.faculties || [];
      assert.ok(!faculties.some(f => (typeof f === 'string' ? f : f.name) === 'emotion-sensing'));
    } finally {
      await fs.remove(tmpDir);
    }
  });
});

describe('Sense Faculty: vision + emotion-sensing together', () => {
  let result;
  before(async () => {
    result = await gen(basePersona({
      body: { runtime: { framework: 'openclaw', modalities: ['vision', 'emotion'] } },
      faculties: [{ name: 'emotion-sensing' }],
    }));
  });
  after(async () => { await fs.remove(result.tmpDir); });

  it('vision faculty is auto-injected (from modality)', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'vision'));
  });

  it('emotion-sensing faculty is present (explicit)', () => {
    const faculties = result.personaJson.faculties || [];
    assert.ok(faculties.some(f => (typeof f === 'string' ? f : f.name) === 'emotion-sensing'));
  });

  it('injection.md contains both Emotion Modality block and Vision Modality block', () => {
    assert.ok(result.injectionMd.includes('**Vision Modality:**'));
    assert.ok(result.injectionMd.includes('**Emotion Modality:**'));
  });
});
