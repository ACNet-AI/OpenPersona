#!/usr/bin/env python3
"""
Pack Integration (Phase 8–9): bundle fine-tuned model into a persona skill pack.

Reads training_summary.json (written by train.py + export.py) and
voice_test_results.json (written by voice_test.py), copies artifacts into the
installed persona pack's model/ directory, updates persona.json, and generates
model/RUNNING.md with platform-specific run instructions.

Usage:
    python scripts/pack_integrate.py \\
        --slug alice \\
        --model-dir models/alice/      # version management root (BASE_DIR from pipeline.sh)
        [--pack-dir ~/.openpersona/personas/persona-alice/]   # auto-discovered if omitted
        [--dry-run]                    # show what would happen, write nothing

Artifact resolution — three-level fallback:
  1. models/alice/manifest.json exists → read current version → use models/alice/export/
  2. models/alice/export/training_summary.json exists (no manifest) → use models/alice/export/
  3. models/alice/training_summary.json exists (old flat structure) → use models/alice/

The script is idempotent: re-running updates the model entry in persona.json
rather than duplicating it.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


# ── Pack discovery ────────────────────────────────────────────────────────────

REGISTRY_PATH = Path.home() / ".openpersona" / "persona-registry.json"
OPENPERSONA_PERSONAS = Path.home() / ".openpersona" / "personas"
OPENCLAW_SKILLS = Path.home() / ".openclaw" / "skills"


def find_pack_dir(slug: str) -> Path | None:
    """Locate an installed persona pack by slug.
    Priority: registry → ~/.openpersona/personas/ → ~/.openclaw/skills/
    """
    # 1. registry
    if REGISTRY_PATH.exists():
        try:
            registry = json.loads(REGISTRY_PATH.read_text())
            for entry in registry.get("personas", []):
                if entry.get("slug") == slug and entry.get("path"):
                    p = Path(entry["path"])
                    if p.exists():
                        return p
        except Exception:
            pass

    # 2. standard paths
    for candidate in [
        OPENPERSONA_PERSONAS / f"persona-{slug}",
        OPENCLAW_SKILLS / f"persona-{slug}",
    ]:
        if candidate.exists() and (candidate / "persona.json").exists():
            return candidate

    return None


# ── Artifact directory resolution (three-level fallback) ─────────────────────

def resolve_export_dir(model_dir: Path) -> tuple[Path, str | None]:
    """Return (export_dir, version_or_None) using three-level fallback.

    Level 1: manifest.json present → use model_dir/export/ (new versioned structure)
    Level 2: model_dir/export/training_summary.json present (no manifest) → use model_dir/export/
    Level 3: model_dir/training_summary.json present (old flat structure) → use model_dir/
    """
    manifest_path = model_dir / "manifest.json"

    # Level 1 — new versioned structure
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
            current = manifest.get("current")
        except Exception:
            current = None

        export_dir = model_dir / "export"
        if not export_dir.exists():
            print(f"❌ manifest.json found but export/ is missing at {export_dir}.")
            print(f"   Re-run pipeline.sh, or restore with:")
            cur = current or "vN"
            print(f"   python scripts/version.py activate --slug SLUG --version {cur}")
            sys.exit(1)

        version = current  # fall back to manifest current if summary missing
        summary_path = export_dir / "training_summary.json"
        if summary_path.exists():
            try:
                version = json.loads(summary_path.read_text()).get("version") or current
            except Exception:
                pass
        return export_dir, version

    # Level 2 — export/ exists but no manifest
    export_dir = model_dir / "export"
    if (export_dir / "training_summary.json").exists():
        try:
            version = json.loads(
                (export_dir / "training_summary.json").read_text()
            ).get("version")
        except Exception:
            version = None
        return export_dir, version

    # Level 3 — old flat structure (backward compat)
    return model_dir, None


# ── Validation ────────────────────────────────────────────────────────────────

def load_summary(export_dir: Path) -> dict:
    p = export_dir / "training_summary.json"
    if not p.exists():
        print(f"❌ training_summary.json not found at {p}")
        print("   Run scripts/train.py then scripts/export.py first.")
        sys.exit(1)
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        print(f"❌ training_summary.json is malformed: {e}")
        sys.exit(1)


def load_voice_results(export_dir: Path) -> dict | None:
    p = export_dir / "voice_test_results.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return None


# ── Copy artifacts ────────────────────────────────────────────────────────────

def copy_artifacts(export_dir: Path, pack_model_dir: Path, summary: dict,
                   dry_run: bool) -> dict:
    """Copy model artifacts into pack_model_dir. Returns mapping of copied paths."""
    copied = {}

    def cp(src: Path, dst: Path):
        if dry_run:
            print(f"  [dry-run] copy {src} → {dst}")
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # adapter_weights/ (always required)
    # Use adapter_path from summary if present and non-null; fall back to export_dir.
    _adapter_path_val = summary.get("adapter_path")
    adapter_src = Path(_adapter_path_val) if _adapter_path_val else (export_dir / "adapter_weights")
    if not adapter_src.exists():
        adapter_src = export_dir / "adapter_weights"
    if adapter_src.exists():
        dst = pack_model_dir / "adapter_weights"
        cp(adapter_src, dst)
        copied["adapter"] = "./model/adapter_weights/"
    else:
        print("⚠️  adapter_weights/ not found — skipping adapter copy")

    export = summary.get("export") or {}

    # GGUF
    gguf_src_str = export.get("gguf")
    if gguf_src_str:
        gguf_src = Path(gguf_src_str)
        if gguf_src.exists():
            dst = pack_model_dir / "gguf" / gguf_src.name
            cp(gguf_src, dst)
            copied["gguf"] = f"./model/gguf/{gguf_src.name}"

    # Ollama Modelfile
    modelfile_src_str = export.get("ollama_modelfile")
    if modelfile_src_str:
        modelfile_src = Path(modelfile_src_str)
        if modelfile_src.exists():
            dst = pack_model_dir / "ollama" / "Modelfile"
            cp(modelfile_src, dst)
            copied["ollama_modelfile"] = "./model/ollama/Modelfile"

    # vLLM launch.sh
    vllm_src_str = export.get("vllm_launch")
    if vllm_src_str:
        vllm_src = Path(vllm_src_str)
        if vllm_src.exists():
            dst = pack_model_dir / "vllm" / "launch.sh"
            cp(vllm_src, dst)
            copied["vllm_launch"] = "./model/vllm/launch.sh"

    # ONNX dir
    onnx_src_str = export.get("onnx_dir")
    if onnx_src_str:
        onnx_src = Path(onnx_src_str)
        if onnx_src.exists():
            dst = pack_model_dir / "onnx"
            cp(onnx_src, dst)
            copied["onnx_dir"] = "./model/onnx/"

    # training_summary.json + voice_test_results.json
    for fname in ["training_summary.json", "voice_test_results.json"]:
        src = export_dir / fname
        if src.exists():
            cp(src, pack_model_dir / fname)

    return copied


# ── persona.json update ───────────────────────────────────────────────────────

MODEL_ENTRY_ID_SUFFIX = "-local"


def update_persona_json(pack_dir: Path, summary: dict, voice: dict | None,
                        copied: dict, dry_run: bool,
                        version: str | None = None) -> None:
    """Inject / update body.runtime.models in persona.json."""
    pj = pack_dir / "persona.json"
    if not pj.exists():
        print(f"⚠️  persona.json not found at {pj} — skipping update")
        return

    try:
        persona = json.loads(pj.read_text())
    except json.JSONDecodeError as e:
        print(f"⚠️  persona.json is malformed ({e}) — skipping update")
        return

    # Use `or {}` instead of default= so null values (JSON null → None) are also replaced.
    soul = persona.get("soul") or {}
    identity = soul.get("identity") or {}
    slug = identity.get("slug") or persona.get("slug") or pack_dir.name.removeprefix("persona-")
    base_model = summary.get("base_model", "unknown")
    fidelity_raw = voice.get("overall_score") if voice else None
    fidelity = round(float(fidelity_raw), 2) if fidelity_raw is not None else None

    # Use versioned id when a version is known; fall back to {slug}-local for backward compat.
    ver = version or summary.get("version")
    entry_id = f"{slug}-local-{ver}" if ver else f"{slug}{MODEL_ENTRY_ID_SUFFIX}"

    model_entry: dict = {
        "id": entry_id,
        "type": "fine-tuned",
        "base": base_model,
        "trainable": True,
    }
    if ver:
        model_entry["version"] = ver
    if summary.get("lora_rank") is not None:
        model_entry["lora_rank"] = summary["lora_rank"]
    if "adapter" in copied:
        model_entry["adapter"] = copied["adapter"]
    if "gguf" in copied:
        model_entry["gguf"] = copied["gguf"]
    if "ollama_modelfile" in copied:
        model_entry["ollama_modelfile"] = copied["ollama_modelfile"]
    if fidelity is not None:
        model_entry["fidelity_score"] = fidelity

    # Navigate / create body.runtime.models
    # Use explicit isinstance checks: setdefault returns None if the key exists with value null.
    if not isinstance(persona.get("body"), dict):
        persona["body"] = {}
    body = persona["body"]
    if not isinstance(body.get("runtime"), dict):
        body["runtime"] = {}
    runtime = body["runtime"]
    if not isinstance(runtime.get("models"), list):
        runtime["models"] = []
    models: list = runtime["models"]

    # Remove legacy un-versioned entry ({slug}-local) when upgrading to a versioned id.
    # Done AFTER the navigate/create block so body/runtime/models are guaranteed proper types.
    if ver:
        legacy_id = f"{slug}{MODEL_ENTRY_ID_SUFFIX}"
        models[:] = [m for m in models if m.get("id") != legacy_id]

    # Idempotent: replace existing entry with same id
    entry_id = model_entry["id"]  # already set on model_entry above
    idx = next((i for i, m in enumerate(models) if m.get("id") == entry_id), None)
    if idx is not None:
        models[idx] = model_entry
        action = "updated"
    else:
        models.append(model_entry)
        action = "added"

    if dry_run:
        print(f"  [dry-run] persona.json: {action} model entry '{entry_id}'")
        print(f"  {json.dumps(model_entry, indent=4)}")
        return

    pj.write_text(json.dumps(persona, indent=2, ensure_ascii=False) + "\n")
    print(f"✅ persona.json: {action} model entry '{entry_id}'")


# ── RUNNING.md generation ─────────────────────────────────────────────────────

RUNNING_MD_TEMPLATE = """\
# Running {display_name} locally

Auto-generated by `persona-model-trainer/scripts/pack_integrate.py`.

**Base model**: `{base_model}`  
**LoRA rank**: {lora_rank} | **Trained epochs**: {epochs} | **Method**: {method}  
{fidelity_line}

---

## Ollama (recommended — macOS / Linux / Windows)

```bash
ollama create {slug} -f model/ollama/Modelfile
ollama run {slug}
```

## LM Studio (GUI — all platforms)

1. Open LM Studio → Load Model → browse to `model/gguf/{slug}.gguf`
2. Start a chat session

## llama.cpp (advanced — CPU / GPU)

```bash
./llama-cli -m model/gguf/{slug}.gguf --interactive --ctx-size 4096
```

{vllm_section}

{onnx_section}

## OpenClaw / OpenPersona integration

`persona.json` already declares the local model — runners pick it up automatically:

```bash
openpersona switch {slug}
# Then start a conversation — the runner reads body.runtime.models and loads the local model
```

---

*To re-train: run `bash scripts/pipeline.sh --slug {slug} --model {base_model} --source ./training`*
"""

VLLM_SECTION = """\
## vLLM — OpenAI-compatible API (NVIDIA GPU)

```bash
pip install vllm
bash model/vllm/launch.sh
# → http://localhost:8000/v1/chat/completions
```
"""

ONNX_SECTION = """\
## ONNX — Edge / mobile / browser

- **Android / iOS**: bundle `model/onnx/` into your app with ONNX Runtime Mobile
- **Browser (WASM)**: use `onnxruntime-web` with `model/onnx/`
"""


def generate_running_md(slug: str, pack_dir: Path, summary: dict, voice: dict | None,
                        copied: dict, dry_run: bool) -> None:
    persona_name = ""
    pj = pack_dir / "persona.json"
    if pj.exists():
        try:
            p = json.loads(pj.read_text())
            persona_name = ((p.get("soul") or {}).get("identity") or {}).get("personaName") \
                           or p.get("personaName", "")
        except Exception:
            pass
    display_name = persona_name or slug.title()
    fidelity_raw = voice.get("overall_score") if voice else None
    fidelity = round(float(fidelity_raw), 2) if fidelity_raw is not None else None
    fidelity_line = f"**Voice fidelity score**: {fidelity} / 5.0" if fidelity is not None else ""

    content = RUNNING_MD_TEMPLATE.format(
        display_name=display_name,
        slug=slug,
        base_model=summary.get("base_model") or "unknown",
        lora_rank=summary.get("lora_rank") or "—",
        epochs=summary.get("epochs") or "—",
        method=summary.get("method") or "—",
        fidelity_line=fidelity_line,
        vllm_section=VLLM_SECTION if "vllm_launch" in copied else "",
        onnx_section=ONNX_SECTION if "onnx_dir" in copied else "",
    )

    dst = pack_dir / "model" / "RUNNING.md"
    if dry_run:
        print(f"  [dry-run] generate {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(content)
    print(f"✅ model/RUNNING.md generated")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bundle fine-tuned model into an installed persona skill pack (Phase 8–9)"
    )
    parser.add_argument("--slug",      required=True, help="Persona slug")
    parser.add_argument("--model-dir", required=True,
                        help="Version management root (BASE_DIR from pipeline.sh, e.g. models/alice/)")
    parser.add_argument("--pack-dir",  default=None,
                        help="Persona pack root (auto-discovered from registry if omitted)")
    parser.add_argument("--dry-run",   action="store_true",
                        help="Show what would happen — write nothing")
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    if not model_dir.exists():
        print(f"❌ --model-dir not found: {model_dir}")
        sys.exit(1)

    # Resolve artifact directory via three-level fallback
    export_dir, version = resolve_export_dir(model_dir)

    # Locate persona pack
    if args.pack_dir:
        pack_dir = Path(args.pack_dir)
        if not pack_dir.exists():
            print(f"❌ --pack-dir not found: {pack_dir}")
            sys.exit(1)
    else:
        pack_dir = find_pack_dir(args.slug)
        if pack_dir is None:
            print(f"❌ Could not find installed persona pack for slug '{args.slug}'.")
            print(f"   Install first:  openpersona install --preset {args.slug}")
            print(f"   Or specify:     --pack-dir /path/to/persona-{args.slug}/")
            sys.exit(1)

    print(f"\npersona-model-trainer  pack integration")
    print(f"  slug:      {args.slug}")
    print(f"  model-dir: {model_dir}")
    print(f"  export-dir: {export_dir}")
    if version:
        print(f"  version:   {version}")
    print(f"  pack-dir:  {pack_dir}")
    if args.dry_run:
        print(f"  mode:      DRY RUN — nothing will be written")
    print()

    summary = load_summary(export_dir)
    voice   = load_voice_results(export_dir)

    if voice:
        score = voice.get("overall_score", "?")
        passed = voice.get("pass", False)
        print(f"Voice fidelity: {score}/5.0  ({'✅ PASS' if passed else '⚠️  BELOW THRESHOLD'})")
    else:
        print("Voice fidelity: not available (voice_test_results.json not found)")

    pack_model_dir = pack_dir / "model"
    if not args.dry_run:
        pack_model_dir.mkdir(parents=True, exist_ok=True)

    # Copy artifacts
    print(f"\nCopying model artifacts → {pack_model_dir}/")
    copied = copy_artifacts(export_dir, pack_model_dir, summary, args.dry_run)
    if not args.dry_run:
        for label, path in copied.items():
            print(f"  ✅ {label}: {path}")

    # Update persona.json
    print()
    update_persona_json(pack_dir, summary, voice, copied, args.dry_run, version=version)

    # Generate RUNNING.md
    generate_running_md(args.slug, pack_dir, summary, voice, copied, args.dry_run)

    if not args.dry_run:
        print(f"\n{'═'*50}")
        print(f"✅ Pack integration complete")
        print(f"   Pack: {pack_dir}")
        print(f"   Model artifacts: {pack_model_dir}/")
        print()
        print("Next steps:")
        if "ollama_modelfile" in copied:
            print(f"  ollama create {args.slug} -f {pack_model_dir}/ollama/Modelfile")
            print(f"  ollama run {args.slug}")
        print(f"  cat {pack_dir}/model/RUNNING.md   # full platform guide")
        print(f"  openpersona switch {args.slug}     # activate in OpenClaw")
    else:
        print(f"\n[dry-run complete — no files written]")


if __name__ == "__main__":
    main()
