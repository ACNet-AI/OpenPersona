# OpenPersona demos

Static and interactive samples under this directory.

| Artifact | What it is |
|----------|------------|
| **`vitality-report.html`** | Sample Vitality HTML report (mock data). Regenerate from the repo root: `node demo/generate.js` |
| **`architecture.html`** | Interactive **4+5+3** architecture diagram (open locally or use the README “Live Demo” link) |
| **`living-canvas.html`** | Living Canvas demo shell (uses `living-canvas.state.json` or `living-canvas.direct.json` via query) |
| **`run-living-canvas.sh`** | Advanced demo: static server + optional `packages/avatar-runtime` + avatar bridge scripts — requires a local persona install and extra env (see script header) |
| **`acceptance.sh`** | Smoke checks; invoked from repo root as `npm run acceptance` |

`vendor/` holds npm deps for some canvas demos; `vendor-dist/` includes an offline Live2D widget bundle when needed without a full install.
