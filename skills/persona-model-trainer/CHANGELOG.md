# Changelog — persona-model-trainer

## [0.2.0] — 2026-04-11

### Added

- **Model versioning** — every `pipeline.sh` run archives the adapter to `models/{slug}/adapters/vN/` (weights + `training_summary.json` + voice/probe results + prepared data snapshot). `manifest.json` tracks the active version.
- **`version.py`** — CLI for version lifecycle:
  - `list` — table of all versions with TURNS / FIDELITY / BASE MODEL / DATE
  - `diff` — side-by-side comparison of any two versions (base model, lora config, perplexity, probe_score, data_hash, …)
  - `activate` — switch active version; optional `--restore-data` to reproduce exact training conditions
  - `push` — push adapter to HuggingFace Hub; `--include-data` for private dataset repo
  - `update-manifest` — internal command called by `pipeline.sh`
- **Evaluation layer**:
  - *Perplexity* — extracted from `mlx_lm.lora` validation loss (`exp(eval_loss)`); recorded in `training_summary.json → evaluation.eval_loss` + `evaluation.perplexity`
  - *Probe score* — new `eval_probe.py` script; loads adapter, runs `probes.json` questions, computes weighted keyword-match score (0.0–1.0); recorded in `evaluation.probe_score`
  - `pipeline.sh` Step 4c — optional probe evaluation via `--probes <path>`, archives `probe_results.json`
  - `version.py diff` — surfaces `perplexity` and `probe_score` as labelled rows
- **Gemma 4 hyperparameter preset** — `--preset gemma4` sets `lora-rank=16`, `lora-layers=16`, `warmup-ratio=0.1`, `lora-alpha=auto(=rank)` per Google recommendation
- **New pipeline flags**: `--lora-alpha`, `--lora-layers`, `--warmup-ratio`, `--probes`
- **Dataset provenance chain** — `pipeline.sh` reads `export_version` / `export_hash` from `training/metadata.json` (persona-knowledge output) and injects them as `dataset_version` / `dataset_export_hash` into `training_summary.json`
- **Colab notebook sync** — `generate_colab.py` now supports `--lora-alpha`, `--lora-layers`, `--warmup-ratio`; Cell 9 extracts `eval_loss` and writes `evaluation` block to the in-Colab `training_summary.json`
- **End-to-end pipeline guide** — `references/pipeline-guide.md`: full walkthrough from data collection to running the model (6 phases, iterative improvement loop, traceability section, common fixes table)
- **Integration smoke tests** — `tests/test_integration.py`: 25 CLI-level tests covering `init_dataset → export_training → prepare_data → version list` with real script invocations against a temp dataset directory; verifies traceability chain and hash determinism
- **113 unit tests** — covering prepare_data, generate_colab, pack_integrate, voice_test helpers, train dry-run, version management, Gemma 4 preset, dataset injection, eval_loss parsing, probe scoring

### Changed

- `pipeline.sh` final summary now displays `PROBE_SCORE` alongside `VOICE_SCORE`
- Quick Start examples in `SKILL.md` updated to include `--probes ./training/probes.json`
- Dependency chain updated: `anyone-skill → persona-knowledge → persona-model-trainer → runnable model`

---

## [0.1.0] — initial release

- `pipeline.sh` — end-to-end training orchestrator (prepare → train → voice test → export)
- `prepare_data.py` — merge raw + distilled sources, PII scan, train/eval split
- `train.py` — MLX / Unsloth / QLoRA / LoRA backends
- `voice_test.py` — voice consistency scoring
- `export.py` — GGUF / Ollama / vLLM / ONNX export
- `pack_integrate.py` — bundle adapter into installed OpenPersona persona pack
- `generate_colab.py` — Colab notebook generation for GPU-less users
