# secondme-skill

`secondme-skill` is a local-first OpenPersona package for building a personal AI double with three existing capabilities:

- `skills/anyone-skill` for identity distillation
- `skills/persona-knowledge` for persistent knowledge and data governance
- `skills/persona-model-trainer` for local model embodiment

## What this package includes

- Orchestration-layer documents and rules (this directory root)
- A generated runtime persona pack from OpenPersona:
  - `generated/persona-secondme-skill/`
- Commit boundary guide:
  - `references/submission-split.md`

## Dependency source note

This package currently uses `install: local:skills/...` in `persona.json` for monorepo-local wiring.

- Intended scope: this repository only.
- If you publish this pack outside this repo, replace `local:` entries with portable sources (for example `skillssh:` or `clawhub:`) before release.

Pre-publish safety check:

```bash
bash skills/secondme-skill/scripts/publish-check.sh
```

## Execution standard

Use non-interactive OpenPersona generation by default:

```bash
npx openpersona create --config skills/secondme-skill/persona.json --output skills/secondme-skill/generated
```

Then run sync check:

```bash
bash skills/secondme-skill/scripts/check-sync.sh
```

## Pipeline stages

1. `init` -> initialize state and verify prerequisites
2. `ingest` -> collect and normalize user-owned data
3. `distill` -> produce persona extraction artifacts
4. `train` -> train local model from versioned dataset
5. `eval` -> run voice/probe/perplexity checks
6. `integrate` -> integrate model artifacts into persona runtime
7. `report` -> produce data/model/deploy reports

## Hard gates

- Do not enter `train` unless data gate passes.
- Do not enter `eval`/`integrate` unless training gate passes.
- Do not mark `report`/deploy as pass unless persona model integration gate passes.
- Do not enter publish recommendation unless quality gate passes.
- Every failed stage must update `state/pipeline-state.json` before retry.

Persona model integration check:

```bash
bash skills/secondme-skill/scripts/check-model-integration.sh
```

Unified gate runner:

```bash
bash skills/secondme-skill/scripts/run-gates.sh
```

Optional flags:

```bash
bash skills/secondme-skill/scripts/run-gates.sh \
  --slug secondme-skill \
  --model-dir skills/secondme-skill/models/secondme-skill \
  --pack-dir skills/secondme-skill/persona-secondme-skill
```

## Report output paths

- `reports/data/`
- `reports/model/`
- `reports/deploy/`
- Generated reports are ignored by default via `.gitignore`.

Report naming:

`{slug}_{datasetVersion}_{modelVersion}_{timestamp}_{reportType}.md`

Helper command:

```bash
bash skills/secondme-skill/scripts/new-report-name.sh secondme-skill v1 v1 data
```

Report content template:

- `references/report-template.md`

