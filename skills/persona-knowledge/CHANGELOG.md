# Changelog — persona-knowledge

## [0.2.0] — 2026-04-11

### Added

- **Dataset export versioning** — every `export_training.py` run now assigns an auto-incremented version tag (`v1`, `v2`, …) and records it in `training/metadata.json` as `export_version`. Override with `--version <tag>`.
- **Export hash** — `metadata.json` now includes `export_hash` (SHA-256 of `conversations.jsonl`) and `source_snapshot` (per-file hash of all source files at export time).
- **Export history** — each export appends an entry to `dataset.json → export_history[]`, enabling full audit trail without re-running exports.
- `**--list` flag** — `export_training.py --slug {slug} --list` shows all past exports with version, hash, turn count, and timestamp.
- `**--wiki-only` flag** — skips copying `sources/` to `training/raw/`, useful when only wiki-derived conversations are needed.
- `**probes.json` generation** — `export_training.py` now auto-generates `training/probes.json` from `wiki/identity.md` and `wiki/voice.md`. Contains weighted keyword probes (name: 1.0, identity: 0.8, voice: 0.5) consumed by `persona-model-trainer`'s probe evaluation step.
- **27 unit tests** — covering export versioning, hash format, source snapshot, export history, `--list`, `--wiki-only`, `--version`, probes schema, hash determinism.
- **Cross-skill next-step guidance** — Phase 4 export section now includes a ready-to-run `pipeline.sh` command (with `--probes`) pointing to `persona-model-trainer`.

### Changed

- `metadata.json` output extended with `export_version`, `export_hash`, `source_snapshot` fields (backward-compatible — old consumers ignore unknown fields).
- `export_training.py` module docstring updated to list `probes.json` in the output structure.

---

## [0.1.0] — initial release

- `init_dataset.py` — initialize dataset with MemPalace wing + KG + wiki structure
- `ingest.py` — unified ingestion: adapter dispatch, PII scan, dedup, MemPalace, KG
- `export_training.py` — export sources + wiki → `training/` directory
- `lint_wiki.py` — wiki health check
- `query_kg.py` — Knowledge Graph query CLI