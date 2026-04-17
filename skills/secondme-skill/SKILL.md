---
name: secondme-skill
version: 0.1.1
description: "A complete pipeline to build your AI Second Me: distill your identity from personal data, grow a private knowledge base, train a local model, and govern what gets shared."
license: MIT
compatibility: "OpenPersona/OpenClaw/Cursor, local-first with optional network interoperability."
allowed-tools: Read Write Edit Bash WebSearch
metadata:
  author: acnlabs
---

# secondme-skill

secondme-skill is a complete pipeline for building your AI Second Me — distill your identity from owned data, grow a private knowledge base, train a local model that speaks like you, and govern what gets shared. Local-first, privacy-first, fully yours.

This is an orchestration skill package. It does not replace lower-level capabilities.

## Source of truth

- Persona source declaration: `persona.json`
- Pipeline runtime state: `state/pipeline-state.json`
- Product and governance spec: `references/product-report.md`
- Generated runtime pack: `generated/persona-secondme-skill/`
- Regeneration script: `scripts/regenerate-pack.sh`

## Dependency chain

- Foundation: `openpersona` -> persona pack creation and lifecycle baseline
- Orchestration: `secondme-skill` -> workflow gates, state, and report contracts
- Capability chain:
  1. `anyone-skill` -> identity extraction and evidence grading
  2. `persona-knowledge` -> data ingestion, deduplication, wiki/KG, versioned export
  3. `persona-model-trainer` -> local training, evaluation, export, integration

## Required execution policy

- Use non-interactive generation and scripts where possible.
- Keep local-first and least-privilege defaults.
- Keep stage outputs auditable with version/hash references.
- Treat `persona-secondme-skill/` as generated output (read-only baseline).
- When `persona.json` changes, regenerate the runtime pack before release.
- Before publishing outside this repository, run `scripts/publish-check.sh`.
- Preferred release check path: `scripts/run-gates.sh` (regenerate + sync + model gate + publish gate).

## Stage contract

### init

- Validate toolchain and directories.
- Initialize or load `state/pipeline-state.json`.

### ingest

- Ingest user-owned data with PII scanning.
- Require explicit source authorization from user.

### distill

- Build structured persona extraction artifacts.
- Ensure minimum persona input for OpenPersona is complete.

### train

- Route by hardware tier:
  - Apple Silicon: `mlx`
  - NVIDIA: `unsloth`
  - No local GPU: `colab`

### eval

- Check thresholds:
  - `voice_score >= 3.5`
  - `probe_score >= 0.8`
  - `perplexity` degradation <= 20% vs last viable version

### integrate

- Integrate model artifacts only when eval gate passes.
- Require runtime pack persona model integration before marking stage pass.

### report

- Emit three reports under `reports/data`, `reports/model`, `reports/deploy`.
- Keep `report` and deployment recommendation in blocked state if persona model gate fails.

## Failure routing

- Data gate fail -> return to `ingest` and request source expansion.
- Train fail -> change backend or reduce model size.
- Eval fail -> augment data or retune hyperparameters, then retrain.

Always update `error_code`, `last_error`, and `retry_count` in pipeline state before retry.

## Human approval gates

Require explicit human approval for:

- financial/legal commitments
- account-changing write actions
- external publishing/sharing of identity artifacts

## Persona model gate

`secondme` requires trained persona model integration, not only host default model fallback.

Pass criteria:

- `generated/persona-secondme-skill/persona.json` contains `body.runtime.models`.
- `body.runtime.models` has at least one model entry.
- `scripts/check-model-integration.sh` returns success.

If this gate fails, `report` must not be marked pass and deployment recommendation remains blocked.

## Sync discipline

1. Edit root `persona.json` and orchestration docs first.
2. Run `scripts/regenerate-pack.sh`.
3. Run `scripts/check-sync.sh` to validate root and generated pack alignment.
4. Verify runtime pack path `generated/persona-secondme-skill/` exists and updated.
5. Only then produce release reports under `reports/`.