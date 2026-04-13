# Changelog — anyone-skill

## [1.1.0] — 2026-04-11

### Added

- **Extended dependency chain** — documented the full local-model path: `anyone-skill → persona-knowledge → persona-model-trainer → runnable persona model`
- **Step 6-D: `--probes` guidance** — after `export_training.py` runs, the step now shows a ready-to-copy `pipeline.sh` command including `--probes ./training/probes.json` and links to `persona-model-trainer/references/pipeline-guide.md`
- **`training-export.md` updated** — "After export" output listing now includes `probes.json` with description; `--probes` usage hint added to the "Ready for" line

### Changed

- Step 6-D description clarified: `export_training.py` also generates `probes.json` (in addition to `conversations.jsonl`, `profile.md`, `metadata.json`)

---

## [1.0.0] — initial release

- Phase 0–7 distillation workflow: classify, ethics check, intake, collect sources, 4-dimension extraction, evidence grading, OpenPersona pack generation, evolution
- `persona-knowledge` integration (Phase 3 Path A): ingest → MemPalace + KG + wiki → export
- Step 6-D: training data export for `persona-model-trainer`
- Subject strategy reference (yourself / someone you know / public figure / fictional / historical / archetype)
