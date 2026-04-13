"""
Integration smoke tests for the full knowledge → export → prepare → version chain.

Runs real CLI scripts (no mocking of I/O) against a temp OPENPERSONA_DATASETS
directory.  No GPU or MemPalace required — init_dataset.py gracefully stubs
MemPalace when the package is absent.

Covered path:
  persona-knowledge/init_dataset.py
    → (manual wiki/source seeding)
  persona-knowledge/export_training.py
    → training/ (conversations.jsonl + raw/ + profile.md + metadata.json + probes.json)
  persona-model-trainer/prepare_data.py
    → prepared/ (train.jsonl + eval.jsonl + stats.json)
  persona-model-trainer/version.py list
    → (mock adapters dir with training_summary.json)
  traceability: metadata.json export_version/export_hash ↔ training_summary.json
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# ── Paths to the two skill script directories ─────────────────────────────────
SKILLS_DIR = Path(__file__).resolve().parent.parent.parent  # skills/
PK_SCRIPTS  = SKILLS_DIR / "persona-knowledge"  / "scripts"
PMT_SCRIPTS = SKILLS_DIR / "persona-model-trainer" / "scripts"


def _run(script: Path, args: list[str], env: dict | None = None) -> subprocess.CompletedProcess:
    merged_env = {**os.environ, **(env or {})}
    return subprocess.run(
        [sys.executable, str(script)] + args,
        capture_output=True,
        text=True,
        env=merged_env,
    )


def _seed_dataset(dataset_dir: Path, slug: str, name: str) -> None:
    """Write the minimal files that export_training.py needs, bypassing MemPalace."""

    # sources/ — one JSONL source file (authentic voice)
    sources_dir = dataset_dir / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)
    source_lines = [
        json.dumps({"role": "user",      "content": "What do you do?"}),
        json.dumps({"role": "assistant", "content": f"I'm {name}. I build things."}),
        json.dumps({"role": "user",      "content": "What's your favourite tool?"}),
        json.dumps({"role": "assistant", "content": "A good pen and a quiet room."}),
    ]
    (sources_dir / "chat.jsonl").write_text("\n".join(source_lines) + "\n")

    # wiki/ — identity.md and voice.md with Content sections
    wiki_dir = dataset_dir / "wiki"
    wiki_dir.mkdir(exist_ok=True)
    (wiki_dir / "identity.md").write_text(
        f"# Identity\n\n## Content\n\n{name} is a builder and thinker from London.\n"
        "She founded three companies and writes every morning.\n"
    )
    (wiki_dir / "voice.md").write_text(
        "# Voice\n\n## Content\n\nSpeaks in short, declarative sentences.\n"
        "Favours precision over flair. Rarely uses metaphors.\n"
    )

    # dataset.json — minimal schema so export_training.py doesn't fail on missing file
    (dataset_dir / "dataset.json").write_text(json.dumps({
        "schema_version": 1,
        "slug": slug,
        "name": name,
        "created_at": "2026-01-01T00:00:00+00:00",
        "stats": {},
        "export_history": [],
    }, indent=2) + "\n")


class TestInitDataset(unittest.TestCase):
    """init_dataset.py creates expected directory structure."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_creates_dataset_structure(self):
        env = {"OPENPERSONA_DATASETS": self.tmp}
        result = _run(PK_SCRIPTS / "init_dataset.py",
                      ["--slug", "smoke-init", "--name", "Test Person"],
                      env=env)
        self.assertEqual(result.returncode, 0, result.stderr)

        dataset_dir = Path(self.tmp) / "smoke-init"
        self.assertTrue((dataset_dir / "dataset.json").exists())
        self.assertTrue((dataset_dir / "sources").exists())
        self.assertTrue((dataset_dir / "wiki").exists())
        self.assertTrue((dataset_dir / "wiki" / "identity.md").exists())
        self.assertTrue((dataset_dir / "wiki" / "voice.md").exists())

    def test_dataset_json_fields(self):
        env = {"OPENPERSONA_DATASETS": self.tmp}
        _run(PK_SCRIPTS / "init_dataset.py",
             ["--slug", "smoke-fields", "--name", "Field Person"],
             env=env)
        meta = json.loads((Path(self.tmp) / "smoke-fields" / "dataset.json").read_text())
        self.assertEqual(meta["slug"], "smoke-fields")
        self.assertEqual(meta["name"], "Field Person")
        self.assertIn("export_history", meta)
        self.assertEqual(meta["export_history"], [])

    def test_duplicate_slug_exits_nonzero(self):
        env = {"OPENPERSONA_DATASETS": self.tmp}
        _run(PK_SCRIPTS / "init_dataset.py",
             ["--slug", "dupe", "--name", "First"], env=env)
        result = _run(PK_SCRIPTS / "init_dataset.py",
                      ["--slug", "dupe", "--name", "Second"], env=env)
        self.assertNotEqual(result.returncode, 0)


class TestExportTraining(unittest.TestCase):
    """export_training.py produces a complete training/ directory."""

    def setUp(self):
        self.tmp    = tempfile.mkdtemp()
        self.slug   = "smoke-export"
        self.name   = "Ada Smoke"
        self.ds_dir = Path(self.tmp) / "datasets" / self.slug
        self.out_dir = Path(self.tmp) / "training"
        self.ds_dir.mkdir(parents=True)
        _seed_dataset(self.ds_dir, self.slug, self.name)
        self.env = {"OPENPERSONA_DATASETS": str(self.ds_dir.parent)}

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _export(self, extra_args: list[str] | None = None) -> subprocess.CompletedProcess:
        args = ["--slug", self.slug, "--output", str(self.out_dir)]
        return _run(PK_SCRIPTS / "export_training.py", args + (extra_args or []), env=self.env)

    def test_export_exits_zero(self):
        result = self._export()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_output_files_present(self):
        self._export()
        self.assertTrue((self.out_dir / "conversations.jsonl").exists())
        self.assertTrue((self.out_dir / "raw").exists())
        self.assertTrue((self.out_dir / "metadata.json").exists())
        self.assertTrue((self.out_dir / "probes.json").exists())

    def test_metadata_has_versioning_fields(self):
        self._export()
        meta = json.loads((self.out_dir / "metadata.json").read_text())
        self.assertIn("export_version", meta)
        self.assertIn("export_hash", meta)
        self.assertIn("source_snapshot", meta)
        self.assertTrue(meta["export_version"].startswith("v"))
        self.assertTrue(meta["export_hash"].startswith("sha256:"))

    def test_probes_json_schema(self):
        self._export()
        probes_data = json.loads((self.out_dir / "probes.json").read_text())
        self.assertEqual(probes_data["slug"], self.slug)
        self.assertIn("probes", probes_data)
        probes = probes_data["probes"]
        self.assertGreaterEqual(len(probes), 1)
        # name probe is always present
        ids = [p["id"] for p in probes]
        self.assertIn("name", ids)
        # every probe has required fields
        for p in probes:
            self.assertIn("question", p)
            self.assertIn("keywords", p)
            self.assertIn("weight", p)

    def test_name_probe_keyword(self):
        self._export()
        probes_data = json.loads((self.out_dir / "probes.json").read_text())
        name_probe = next(p for p in probes_data["probes"] if p["id"] == "name")
        # persona name must appear in name probe keywords
        self.assertIn(self.name, name_probe["keywords"])

    def test_export_history_appended(self):
        self._export()
        dataset_meta = json.loads((self.ds_dir / "dataset.json").read_text())
        self.assertEqual(len(dataset_meta["export_history"]), 1)
        entry = dataset_meta["export_history"][0]
        self.assertIn("version", entry)
        self.assertIn("export_hash", entry)

    def test_raw_directory_contains_source(self):
        self._export()
        raw_dir = self.out_dir / "raw"
        raw_files = list(raw_dir.iterdir())
        self.assertGreater(len(raw_files), 0)

    def test_wiki_only_flag_skips_raw(self):
        self._export(["--wiki-only"])
        raw_dir = self.out_dir / "raw"
        # _copy_raw_sources() is never called with --wiki-only, so raw/ is not created
        self.assertFalse(raw_dir.exists(), "raw/ should not be created with --wiki-only")

    def test_explicit_version_tag(self):
        self._export(["--version", "v99"])
        meta = json.loads((self.out_dir / "metadata.json").read_text())
        self.assertEqual(meta["export_version"], "v99")

    def test_list_flag_shows_history(self):
        self._export()
        result = _run(PK_SCRIPTS / "export_training.py",
                      ["--slug", self.slug, "--list"],
                      env=self.env)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v1", result.stdout)


class TestPrepareData(unittest.TestCase):
    """prepare_data.py accepts export_training.py output and produces prepared/."""

    def setUp(self):
        self.tmp     = tempfile.mkdtemp()
        self.slug    = "smoke-prepare"
        self.name    = "Prep Person"
        self.ds_dir  = Path(self.tmp) / "datasets" / self.slug
        self.train_dir   = Path(self.tmp) / "training"
        self.prepared_dir = Path(self.tmp) / "prepared"
        self.ds_dir.mkdir(parents=True)
        _seed_dataset(self.ds_dir, self.slug, self.name)
        self.env = {"OPENPERSONA_DATASETS": str(self.ds_dir.parent)}
        # Export first so prepare_data has real input
        _run(PK_SCRIPTS / "export_training.py",
             ["--slug", self.slug, "--output", str(self.train_dir)],
             env=self.env)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _prepare(self) -> subprocess.CompletedProcess:
        return _run(PMT_SCRIPTS / "prepare_data.py", [
            "--input",   str(self.train_dir / "conversations.jsonl"),
            "--raw-dir", str(self.train_dir / "raw"),
            "--profile", str(self.train_dir / "profile.md"),
            "--output",  str(self.prepared_dir),
        ])

    def test_prepare_exits_zero(self):
        result = self._prepare()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_output_files_present(self):
        self._prepare()
        self.assertTrue((self.prepared_dir / "train.jsonl").exists())
        self.assertTrue((self.prepared_dir / "eval.jsonl").exists())
        self.assertTrue((self.prepared_dir / "stats.json").exists())

    def test_train_jsonl_valid(self):
        self._prepare()
        lines = (self.prepared_dir / "train.jsonl").read_text().splitlines()
        self.assertGreater(len(lines), 0)
        for line in lines:
            obj = json.loads(line)
            self.assertIn("messages", obj)

    def test_stats_json_fields(self):
        self._prepare()
        stats = json.loads((self.prepared_dir / "stats.json").read_text())
        self.assertIn("train", stats)
        self.assertIn("eval", stats)
        self.assertIn("data_hash", stats)
        self.assertTrue(stats["data_hash"].startswith("sha256:"))

    def test_eval_jsonl_always_produced(self):
        """eval.jsonl is always generated (temporal split), even with small data."""
        self._prepare()
        self.assertTrue((self.prepared_dir / "eval.jsonl").exists())
        lines = (self.prepared_dir / "eval.jsonl").read_text().splitlines()
        self.assertGreater(len(lines), 0)


class TestVersionList(unittest.TestCase):
    """version.py list reads mock adapter dirs and displays a table."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.slug = "smoke-version"
        self.base_dir = Path(self.tmp) / "models" / self.slug
        self.adapters_dir = self.base_dir / "adapters"

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _make_version(self, version: str, summary: dict) -> None:
        vdir = self.adapters_dir / version
        vdir.mkdir(parents=True)
        (vdir / "training_summary.json").write_text(
            json.dumps(summary, indent=2) + "\n"
        )

    def test_list_empty(self):
        result = _run(PMT_SCRIPTS / "version.py",
                      ["list", "--slug", self.slug,
                       "--base-dir", str(self.base_dir)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No versions yet", result.stdout)

    def test_list_shows_versions(self):
        self._make_version("v1", {
            "base_model": "google/gemma-4-E4B-it",
            "train_samples": 300,
            "trained_at": "2026-04-01T10:00:00Z",
        })
        self._make_version("v2", {
            "base_model": "google/gemma-4-E4B-it",
            "train_samples": 450,
            "trained_at": "2026-04-08T10:00:00Z",
        })
        result = _run(PMT_SCRIPTS / "version.py",
                      ["list", "--slug", self.slug,
                       "--base-dir", str(self.base_dir)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v1", result.stdout)
        self.assertIn("v2", result.stdout)

    def test_list_marks_current(self):
        self._make_version("v1", {"base_model": "x", "train_samples": 100})
        self._make_version("v2", {"base_model": "x", "train_samples": 200})
        # Write manifest marking v2 as current
        (self.base_dir / "manifest.json").write_text(
            json.dumps({"current": "v2", "versions": ["v1", "v2"]}) + "\n"
        )
        result = _run(PMT_SCRIPTS / "version.py",
                      ["list", "--slug", self.slug,
                       "--base-dir", str(self.base_dir)])
        lines = result.stdout.splitlines()
        v2_line = next((l for l in lines if "v2" in l), "")
        self.assertIn("*", v2_line)

    def test_list_with_evaluation_summary_exits_zero(self):
        # version.py list shows VERSION/TURNS/FIDELITY/BASE MODEL/DATE columns only;
        # perplexity and probe_score appear in `diff`, not `list`.
        # This test confirms that a summary containing an evaluation block
        # does not crash the list command.
        self._make_version("v1", {
            "base_model": "google/gemma-4-E4B-it",
            "train_samples": 312,
            "trained_at": "2026-04-01T00:00:00Z",
            "evaluation": {"eval_loss": 2.18, "perplexity": 8.85, "probe_score": 0.93},
        })
        result = _run(PMT_SCRIPTS / "version.py",
                      ["list", "--slug", self.slug,
                       "--base-dir", str(self.base_dir)])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("v1", result.stdout)


class TestTraceabilityChain(unittest.TestCase):
    """dataset_version + dataset_export_hash flow from metadata.json → training_summary.json."""

    def setUp(self):
        self.tmp     = tempfile.mkdtemp()
        self.slug    = "smoke-trace"
        self.name    = "Trace Test"
        self.ds_dir  = Path(self.tmp) / "datasets" / self.slug
        self.train_dir = Path(self.tmp) / "training"
        self.ds_dir.mkdir(parents=True)
        _seed_dataset(self.ds_dir, self.slug, self.name)
        self.env = {"OPENPERSONA_DATASETS": str(self.ds_dir.parent)}
        _run(PK_SCRIPTS / "export_training.py",
             ["--slug", self.slug, "--output", str(self.train_dir)],
             env=self.env)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_metadata_export_version_and_hash(self):
        meta = json.loads((self.train_dir / "metadata.json").read_text())
        self.assertIn("export_version", meta)
        self.assertIn("export_hash", meta)
        version = meta["export_version"]
        export_hash = meta["export_hash"]
        self.assertTrue(version.startswith("v"))
        self.assertTrue(export_hash.startswith("sha256:"))

    def test_pipeline_injection_logic(self):
        """Simulate the pipeline.sh Python snippet that injects dataset fields."""
        meta = json.loads((self.train_dir / "metadata.json").read_text())
        # Start with a minimal training_summary (as train.py would write it)
        summary = {"base_model": "x", "train_samples": 50}
        # Mimic pipeline.sh injection
        for k, v in [
            ("dataset_version",     meta.get("export_version")),
            ("dataset_export_hash", meta.get("export_hash")),
        ]:
            if k not in summary and v is not None:
                summary[k] = v
        self.assertIn("dataset_version", summary)
        self.assertIn("dataset_export_hash", summary)
        self.assertEqual(summary["dataset_version"], meta["export_version"])
        self.assertEqual(summary["dataset_export_hash"], meta["export_hash"])

    def test_deterministic_export_hash(self):
        """Same source data produces the same export_hash on re-export."""
        second_out = Path(self.tmp) / "training2"
        _run(PK_SCRIPTS / "export_training.py",
             ["--slug", self.slug, "--output", str(second_out), "--version", "v99"],
             env=self.env)
        meta1 = json.loads((self.train_dir  / "metadata.json").read_text())
        meta2 = json.loads((second_out / "metadata.json").read_text())
        # Both exports are from the same wiki → same conversations → same hash
        self.assertEqual(meta1["export_hash"], meta2["export_hash"])


if __name__ == "__main__":
    unittest.main()
