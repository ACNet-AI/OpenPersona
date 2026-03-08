'use strict';

/**
 * Living Canvas smoke test — filesystem-based, no browser, no network.
 * Reads source files directly and verifies structural markers that guarantee
 * the renderer pipeline (pixi → l2dwidget → vector) is wired correctly.
 *
 * Run:  node --test tests/living-canvas.smoke.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** When packages/avatar-runtime is absent (e.g. CI), skip avatar-runtime suites. */
const HAS_AVATAR_RUNTIME = fs.existsSync(path.join(ROOT, 'packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js'));
const d = HAS_AVATAR_RUNTIME ? describe : describe.skip;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJSON(rel) {
  return JSON.parse(read(rel));
}

// ── living-canvas.html ────────────────────────────────────────────────────────

describe('living-canvas.html', () => {
  let html;
  test('file exists and is non-empty', () => {
    html = read('demo/living-canvas.html');
    assert.ok(html.length > 0, 'living-canvas.html should not be empty');
  });

  test('contains rendererMode switch + resolveRendererMode', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('rendererMode'), 'Should reference rendererMode');
    assert.ok(html.includes('resolveRendererMode'), 'Should define resolveRendererMode()');
  });

  test('pixi is default renderer (resolveRendererMode returns "pixi")', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes("return 'pixi'"), 'Default fallback should be "pixi"');
  });

  test('contains renderBadge UI element', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('renderBadge'), 'Should contain #renderBadge element');
  });

  test('loads live2d-pixi-adapter from avatar-runtime web/renderers', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(
      html.includes('/packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js'),
      'Should load adapter from avatar-runtime/web/renderers'
    );
  });

  test('references OpenPersonaPixiLive2DAdapter (pixi path)', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('OpenPersonaPixiLive2DAdapter'), 'Should check window.OpenPersonaPixiLive2DAdapter');
  });

  test('fallback chain: l2dwidget + vector referenced', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('l2dwidget'), 'Should reference l2dwidget fallback');
    assert.ok(html.includes('vector'), 'Should reference vector final fallback');
  });

  test('clearLive2DRenderers cleanup guard exists', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('clearLive2DRenderers'), 'Should define clearLive2DRenderers()');
  });

  test('no hardcoded samantha-avatar.png in avatar fallback', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(
      !html.includes("|| '../UI/images/samantha-avatar.png'"),
      'Should not hardcode Samantha avatar as JS fallback'
    );
  });

  test('crab SVG placeholder element exists for no-avatar state', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('avatarPlaceholder'), 'Should contain #avatarPlaceholder element');
    assert.ok(html.includes('OpenClaw crab placeholder'), 'Should contain OpenClaw crab placeholder title');
    assert.ok(!html.includes('avatarPlaceholderLetter'), 'Letter span should be removed (replaced by crab SVG)');
  });

  test('img src defaults to data:, not samantha-avatar.png', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(
      !html.includes('src="../UI/images/samantha-avatar.png"'),
      'avatarImage img src should not default to Samantha'
    );
    assert.ok(html.includes('src="data:,"'), 'avatarImage img src should default to data:,');
  });
});

// ── packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js ─────────────

d('avatar-runtime web renderer: live2d-pixi-adapter', () => {
  let pkg;
  test('file exists', () => {
    pkg = read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.length > 0, 'Package adapter should not be empty');
  });

  test('exports createAdapter', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('createAdapter'), 'Should expose createAdapter function');
  });

  test('sets window.OpenPersonaPixiLive2DAdapter', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('OpenPersonaPixiLive2DAdapter'), 'Should register global namespace');
  });

  test('implements applyFaceControl for face control protocol', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('applyFaceControl'), 'Should implement applyFaceControl');
  });

  test('implements destroy() for lifecycle cleanup', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('destroy'), 'Should implement destroy()');
  });

  test('loads live2d.min.js (UMD) + cubism2.min.js for true Live2D rendering', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('live2d.min.js'), 'Should load Cubism 2 UMD runtime (sets window.Live2D)');
    assert.ok(pkg.includes('cubism2.min.js'), 'Should load pixi-live2d-display cubism2 build');
  });

  test('uses Live2DModel.from() for model loading', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('Live2DModel'), 'Should reference Live2DModel API');
  });

  test('maps face control to Cubism 2 parameters', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('PARAM_ANGLE_X'), 'Should map yaw to PARAM_ANGLE_X');
    assert.ok(pkg.includes('PARAM_EYE_L_OPEN'), 'Should map blink to PARAM_EYE_L_OPEN');
    assert.ok(pkg.includes('PARAM_MOUTH_OPEN_Y'), 'Should map jawOpen to PARAM_MOUTH_OPEN_Y');
  });

  test('lerp smoothing for face control present', () => {
    pkg = pkg || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(pkg.includes('lerp'), 'Should use lerp for smooth face control transitions');
  });
});

// ── demo/living-canvas.direct.json ───────────────────────────────────────────

describe('living-canvas.direct.json', () => {
  test('is valid JSON', () => {
    assert.doesNotThrow(() => readJSON('demo/living-canvas.direct.json'), 'Should be valid JSON');
  });

  test('rendererMode is "pixi"', () => {
    const obj = readJSON('demo/living-canvas.direct.json');
    assert.equal(obj?.render?.rendererMode, 'pixi', 'Default rendererMode should be "pixi"');
  });

  test('avatarModel3Url is declared', () => {
    const obj = readJSON('demo/living-canvas.direct.json');
    assert.ok(obj?.avatarModel3Url, 'Should declare a default avatarModel3Url');
  });
});

// ── avatar-runtime Renderer Registry ─────────────────────────────────────────

d('avatar-runtime: renderer-registry', () => {
  let src;
  test('renderer-registry.js file exists', () => {
    src = read('packages/avatar-runtime/web/renderer-registry.js');
    assert.ok(src.length > 0, 'renderer-registry.js should not be empty');
  });

  test('exposes OpenPersonaRendererRegistry on window', () => {
    src = src || read('packages/avatar-runtime/web/renderer-registry.js');
    assert.ok(src.includes('OpenPersonaRendererRegistry'), 'Should set window.OpenPersonaRendererRegistry');
  });

  test('implements register / resolve / create / list', () => {
    src = src || read('packages/avatar-runtime/web/renderer-registry.js');
    assert.ok(src.includes('register'), 'Should expose register()');
    assert.ok(src.includes('resolve'),  'Should expose resolve()');
    assert.ok(src.includes('create'),   'Should expose create()');
    assert.ok(src.includes('list'),     'Should expose list()');
  });

  test('embeds assertRendererFactory (no separate IRenderer.js load needed)', () => {
    src = src || read('packages/avatar-runtime/web/renderer-registry.js');
    assert.ok(src.includes('assertRendererFactory'), 'Should inline assertRendererFactory validator');
  });

  test('create() calls createInstance() then mount() — factory/instance separated', () => {
    src = src || read('packages/avatar-runtime/web/renderer-registry.js');
    assert.ok(src.includes('createInstance'), 'Should call factory.createInstance()');
    assert.ok(src.includes('mount'),          'Should call instance.mount()');
  });
});

d('avatar-runtime: vector-renderer', () => {
  let src;
  test('vector-renderer.js file exists', () => {
    src = read('packages/avatar-runtime/web/renderers/vector-renderer.js');
    assert.ok(src.length > 0, 'vector-renderer.js should not be empty');
  });

  test('exposes OpenPersonaVectorRenderer on window', () => {
    src = src || read('packages/avatar-runtime/web/renderers/vector-renderer.js');
    assert.ok(src.includes('OpenPersonaVectorRenderer'), 'Should set window.OpenPersonaVectorRenderer');
  });

  test('implements IRendererFactory: canHandle + createInstance', () => {
    src = src || read('packages/avatar-runtime/web/renderers/vector-renderer.js');
    assert.ok(src.includes('canHandle'),      'Should implement canHandle()');
    assert.ok(src.includes('createInstance'), 'Should implement createInstance()');
  });

  test('canHandle always returns true (fallback renderer)', () => {
    src = src || read('packages/avatar-runtime/web/renderers/vector-renderer.js');
    assert.ok(src.includes('return true'), 'VectorRendererFactory.canHandle should always return true');
  });

  test('instance implements mount / update / unmount / getState', () => {
    src = src || read('packages/avatar-runtime/web/renderers/vector-renderer.js');
    assert.ok(src.includes('mount'),    'Should implement mount()');
    assert.ok(src.includes('update'),   'Should implement update()');
    assert.ok(src.includes('unmount'),  'Should implement unmount()');
    assert.ok(src.includes('getState'), 'Should implement getState()');
  });
});

d('avatar-runtime: web/index.js', () => {
  let src;
  test('web/index.js file exists', () => {
    src = read('packages/avatar-runtime/web/index.js');
    assert.ok(src.length > 0, 'web/index.js should not be empty');
  });

  test('reads registry from window.OpenPersonaRendererRegistry', () => {
    src = src || read('packages/avatar-runtime/web/index.js');
    assert.ok(src.includes('OpenPersonaRendererRegistry'), 'Should reference window.OpenPersonaRendererRegistry');
  });

  test('registers pixi adapter factory first', () => {
    src = src || read('packages/avatar-runtime/web/index.js');
    assert.ok(src.includes('OpenPersonaPixiLive2DAdapter'), 'Should read window.OpenPersonaPixiLive2DAdapter');
    assert.ok(src.includes('pixiAdapter.factory') || src.includes('.factory'), 'Should register the .factory object');
  });

  test('registers vector renderer as fallback', () => {
    src = src || read('packages/avatar-runtime/web/index.js');
    assert.ok(src.includes('OpenPersonaVectorRenderer'), 'Should register window.OpenPersonaVectorRenderer');
  });
});

d('avatar-runtime: live2d-pixi-adapter IRendererFactory interface', () => {
  let src;
  test('adapter exposes canHandle()', () => {
    src = src || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(src.includes('canHandle'), 'Should expose canHandle on OpenPersonaPixiLive2DAdapter');
  });

  test('adapter exposes factory.createInstance()', () => {
    src = src || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(src.includes('factory'), 'Should expose factory object');
    assert.ok(src.includes('createInstance'), 'factory should implement createInstance()');
  });

  test('backward-compatible create() still present', () => {
    src = src || read('packages/avatar-runtime/web/renderers/live2d-pixi-adapter.js');
    assert.ok(src.includes('create: createAdapter'), 'Should preserve backward-compatible create() entry point');
  });
});

d('avatar-runtime: package.json exports', () => {
  test('exports field has ".", "./web", and "./widget" entries', () => {
    const pkg = readJSON('packages/avatar-runtime/package.json');
    assert.ok(pkg.exports, 'package.json should have exports field');
    assert.equal(pkg.exports['.'],        './src/runtime.js',        'Main export should be src/runtime.js');
    assert.equal(pkg.exports['./web'],    './web/index.js',          './web export should be web/index.js');
    assert.equal(pkg.exports['./widget'], './web/avatar-widget.js',  './widget export should be web/avatar-widget.js');
  });
});

// ── avatar-widget.js ──────────────────────────────────────────────────────────

d('avatar-runtime: avatar-widget.js', () => {
  let src;
  test('file exists and is non-empty', () => {
    src = read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.length > 0, 'avatar-widget.js should not be empty');
  });

  test('exposes AvatarWidget constructor on window', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('AvatarWidget'), 'Should define AvatarWidget');
    assert.ok(src.includes('global.AvatarWidget = AvatarWidget'), 'Should expose on global/window');
  });

  test('has module.exports for CJS compatibility', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('module.exports = AvatarWidget'), 'Should export for CJS consumers');
  });

  test('accepts container + opts in constructor', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('function AvatarWidget(container, opts)'), 'Constructor should accept container and opts');
  });

  test('implements ready() — returns initPromise', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('AvatarWidget.prototype.ready'), 'Should implement ready()');
    assert.ok(src.includes('_initPromise'), 'Should store init promise');
  });

  test('implements update(mediaState) with pre-ready buffering', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('AvatarWidget.prototype.update'), 'Should implement update()');
    assert.ok(src.includes('_pendingUpdate'), 'Should buffer update before ready()');
  });

  test('implements destroy() with poll + renderer cleanup', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('AvatarWidget.prototype.destroy'),  'Should implement destroy()');
    assert.ok(src.includes('clearInterval'),                   'destroy() should clear poll timer');
    assert.ok(src.includes('unmount'),                         'destroy() should unmount renderer');
  });

  test('implements getState() for debugging', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('AvatarWidget.prototype.getState'), 'Should implement getState()');
  });

  test('bootstraps registry via ensureRegistry(base)', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('ensureRegistry'), 'Should call ensureRegistry for self-loading');
  });

  test('auto-detects script base via document.currentScript', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('document.currentScript'), 'Should detect own path via currentScript');
  });

  test('supports widgetBase opt to override script base path', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('widgetBase'), 'Should accept widgetBase override option');
  });

  test('starts polling when stateUrl is provided', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('_startPolling'), 'Should call _startPolling when stateUrl set');
    assert.ok(src.includes('stateUrl'),      'Should read opts.stateUrl');
    assert.ok(src.includes('setInterval'),   'Should use setInterval for polling');
    assert.ok(src.includes('fetch'),         'Should use fetch to poll stateUrl');
  });

  test('passes vendorBase through to registry.create opts', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('vendorBase'), 'Should forward vendorBase to renderer opts');
  });

  test('destroy() before ready() — _destroyed guard prevents mount', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('_destroyed'), 'Should use _destroyed flag to guard async init');
  });

  test('update() before ready() buffers last mediaState in _pendingUpdate', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('_pendingUpdate'), 'Should store pending update for pre-ready calls');
    assert.ok(src.includes('else if (!this._destroyed)'), 'Should buffer only when not destroyed');
  });

  test('_pendingUpdate applied immediately after mount', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(
      src.includes('self._pendingUpdate') && src.includes('instance.update(self._pendingUpdate)'),
      'Should apply buffered update right after renderer is mounted'
    );
  });

  test('destroy() clears _pendingUpdate', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(
      src.includes('this._pendingUpdate = null'),
      'destroy() should clear pending update to prevent stale application'
    );
  });

  test('ready() JSDoc warns to add .catch()', () => {
    src = src || read('packages/avatar-runtime/web/avatar-widget.js');
    assert.ok(src.includes('.catch()'), 'ready() JSDoc should remind consumers to handle rejection');
  });
});

describe('living-canvas.html: renderer registry script tags', () => {
  let html;
  test('loads renderer-registry.js after live2d-pixi-adapter.js', () => {
    html = read('demo/living-canvas.html');
    const adapterIdx  = html.indexOf('live2d-pixi-adapter.js');
    const registryIdx = html.indexOf('renderer-registry.js');
    assert.ok(registryIdx > adapterIdx, 'renderer-registry.js should be loaded after live2d-pixi-adapter.js');
  });

  test('loads vector-renderer.js', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('/packages/avatar-runtime/web/renderers/vector-renderer.js'), 'Should load vector-renderer.js');
  });

  test('loads web/index.js', () => {
    html = html || read('demo/living-canvas.html');
    assert.ok(html.includes('/packages/avatar-runtime/web/index.js'), 'Should load web/index.js');
  });
});

// ── run-living-canvas.sh ─────────────────────────────────────────────────────

describe('run-living-canvas.sh', () => {
  let sh;
  test('file exists and is executable', () => {
    const fullPath = path.join(ROOT, 'demo/run-living-canvas.sh');
    assert.ok(fs.existsSync(fullPath), 'run-living-canvas.sh should exist');
    const stat = fs.statSync(fullPath);
    assert.ok(stat.mode & 0o111, 'run-living-canvas.sh should be executable');
    sh = fs.readFileSync(fullPath, 'utf8');
  });

  test('supports --renderer flag', () => {
    sh = sh || read('demo/run-living-canvas.sh');
    assert.ok(sh.includes('--renderer'), 'Should parse --renderer option');
    assert.ok(sh.includes('RENDERER_MODE'), 'Should store renderer override in RENDERER_MODE');
  });

  test('appends renderer param to printed URL', () => {
    sh = sh || read('demo/run-living-canvas.sh');
    assert.ok(sh.includes('_RENDERER_PARAM') || sh.includes('RENDERER_MODE'), 'Should splice renderer into demo URL');
  });

  test('supports --persona flag', () => {
    sh = sh || read('demo/run-living-canvas.sh');
    assert.ok(sh.includes('--persona'), 'Should parse --persona option');
    assert.ok(sh.includes('_PERSONA_FLAG_SET'), 'Should track whether --persona was explicitly set');
    assert.ok(sh.includes('candidatePersonaDirs') || sh.includes('.openclaw/skills/persona-'), 'Should search installed persona dirs');
  });

  test('LIVING_CANVAS_PERSONA_NAME default is not Samantha', () => {
    sh = sh || read('demo/run-living-canvas.sh');
    assert.ok(!sh.includes('LIVING_CANVAS_PERSONA_NAME:-Samantha'), 'Should not hardcode Samantha as persona name default');
  });

  test('LIVING_CANVAS_AVATAR default is not samantha-avatar.png', () => {
    sh = sh || read('demo/run-living-canvas.sh');
    assert.ok(!sh.includes('LIVING_CANVAS_AVATAR:-../UI/images/samantha-avatar.png'), 'Should not hardcode Samantha avatar as default');
  });
});
