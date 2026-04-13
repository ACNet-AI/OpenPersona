"""
persona-model-trainer test suite — no GPU required.

Covers: prepare_data.py, generate_colab.py, pack_integrate.py, train.py --dry-run
Run: python -m pytest skills/persona-model-trainer/tests/ -v
 or: python -m unittest discover skills/persona-model-trainer/tests/
"""

import ast
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load_module(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── prepare_data.py ───────────────────────────────────────────────────────────

class TestPrepareData(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, *extra_args) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "prepare_data.py")] + list(extra_args),
            capture_output=True, text=True, cwd=self.tmp
        )

    def test_prepare_from_conversations_jsonl(self):
        """Converts conversations.jsonl → train.jsonl + eval.jsonl."""
        conv = self.tmp / "conversations.jsonl"
        # build_samples requires user_text >= 3 chars AND assistant_text >= 5 chars
        turns = []
        for i in range(20):
            turns.append(json.dumps({"role": "user",      "content": f"What do you think about topic {i}?"}))
            turns.append(json.dumps({"role": "assistant", "content": f"I find topic {i} really fascinating and worth exploring."}))
        conv.write_text("\n".join(turns))

        out = self.tmp / "prepared"
        r = self._run("--input", str(conv), "--output", str(out), "--model", "google/gemma-4-E4B-it")
        self.assertEqual(r.returncode, 0, r.stderr)

        train = out / "train.jsonl"
        self.assertTrue(train.exists(), "train.jsonl not created")
        samples = [json.loads(l) for l in train.read_text().splitlines() if l.strip()]
        self.assertGreater(len(samples), 0)
        # Each sample must have "messages" key with list of role/content dicts
        for s in samples:
            self.assertIn("messages", s)
            for msg in s["messages"]:
                self.assertIn("role", msg)
                self.assertIn("content", msg)

    def test_prepare_from_raw_txt(self):
        """Handles raw/*.txt monologue → paired training samples."""
        raw = self.tmp / "raw"
        raw.mkdir()
        # Write a text file with paragraphs
        (raw / "journal.txt").write_text(
            "I love working with AI systems.\n\nMy favorite topic is language models.\n\n"
            "Every day I try to learn something new about machine learning.\n"
        )
        out = self.tmp / "prepared"
        r = self._run("--raw-dir", str(raw), "--output", str(out), "--model", "google/gemma-4-E4B-it")
        self.assertEqual(r.returncode, 0, r.stderr)
        train = out / "train.jsonl"
        self.assertTrue(train.exists())

    def test_output_format_is_model_agnostic(self):
        """Output contains {messages:[]} format, not tokenized strings."""
        conv = self.tmp / "conversations.jsonl"
        # build_samples requires user_text >= 3 chars AND assistant_text >= 5 chars
        conv.write_text(
            json.dumps({"role": "user",      "content": "What is your favorite topic?"}) + "\n" +
            json.dumps({"role": "assistant", "content": "I love discussing language models."}) + "\n"
        )
        out = self.tmp / "prepared"
        r = self._run("--input", str(conv), "--output", str(out), "--model", "meta-llama/Llama-3.1-8B-Instruct")
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = [l for l in (out / "train.jsonl").read_text().splitlines() if l.strip()]
        self.assertGreater(len(lines), 0, "No samples produced — check build_samples filtering")
        sample = json.loads(lines[0])
        self.assertIn("messages", sample, "Output not in messages format")
        self.assertIsInstance(sample["messages"], list)

    def test_max_chars_truncation(self):
        """Samples exceeding --max-chars are excluded."""
        conv = self.tmp / "conversations.jsonl"
        # Very long assistant turn
        long_content = "x" * 10_000
        conv.write_text(
            json.dumps({"role": "user",      "content": "Question"}) + "\n" +
            json.dumps({"role": "assistant", "content": long_content}) + "\n"
        )
        out = self.tmp / "prepared"
        r = self._run("--input", str(conv), "--output", str(out),
                      "--model", "google/gemma-4-E4B-it", "--max-chars", "100")
        self.assertEqual(r.returncode, 0, r.stderr)
        train = out / "train.jsonl"
        if train.exists():
            lines = [l for l in train.read_text().splitlines() if l.strip()]
            for line in lines:
                s = json.loads(line)
                total = sum(len(m.get("content", "")) for m in s.get("messages", []))
                self.assertLessEqual(total, 200, "Sample exceeded max-chars limit")

    def test_missing_input_exits_nonzero(self):
        """Missing --input and --raw-dir should fail gracefully."""
        out = self.tmp / "prepared"
        r = self._run("--output", str(out), "--model", "google/gemma-4-E4B-it")
        self.assertNotEqual(r.returncode, 0, "Should fail with no data source")

    def test_train_eval_split(self):
        """Creates both train.jsonl and eval.jsonl when enough samples."""
        conv = self.tmp / "conversations.jsonl"
        lines = []
        for i in range(50):
            lines.append(json.dumps({"role": "user",      "content": f"What do you think about topic {i}?"}))
            lines.append(json.dumps({"role": "assistant", "content": f"I find topic {i} really fascinating and worth exploring."}))
        conv.write_text("\n".join(lines))
        out = self.tmp / "prepared"
        r = self._run("--input", str(conv), "--output", str(out), "--model", "google/gemma-4-E4B-it")
        self.assertEqual(r.returncode, 0, r.stderr)
        # With 50 pairs, split_dataset should put at least 1 sample into eval.jsonl
        eval_path = out / "eval.jsonl"
        self.assertTrue(eval_path.exists(), "eval.jsonl not created with 50 samples")
        eval_lines = [l for l in eval_path.read_text().splitlines() if l.strip()]
        self.assertGreater(len(eval_lines), 0, "eval.jsonl is empty")


# ── generate_colab.py ─────────────────────────────────────────────────────────

class TestGenerateColab(unittest.TestCase):

    TRAIN_DATA = [
        {"messages": [
            {"role": "system",    "content": "You are Alice."},
            {"role": "user",      "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]}
    ]

    def setUp(self):
        # Fresh import to reset cell counter state
        if "generate_colab" in sys.modules:
            del sys.modules["generate_colab"]
        self.gc = load_module("generate_colab")

    def _build(self, slug="alice", model="google/gemma-4-E4B-it",
                train=None, eval_data=None, profile=""):
        return self.gc.build_notebook(
            slug=slug, model=model,
            lora_rank=16, epochs=3, batch_size=2, learning_rate=2e-4,
            train_data=train or self.TRAIN_DATA,
            eval_data=eval_data or [],
            profile_text=profile,
        )

    def _code_cells(self, nb):
        return [c for c in nb["cells"] if c["cell_type"] == "code"]

    # ── Notebook structure ────────────────────────────────────────────────

    def test_notebook_structure(self):
        nb = self._build()
        self.assertEqual(nb["nbformat"], 4)
        self.assertIn("colab", nb["metadata"])
        self.assertEqual(nb["metadata"]["colab"]["gpuType"], "T4")

    def test_title_cell_unzip_path_and_method(self):
        """Title cell must reference export/ subdirectory and --method skip-train (not --skip-train)."""
        nb = self._build(slug="mia", model="google/gemma-4-E4B-it")
        # Cell 0 is the markdown title cell
        title_src = nb["cells"][0]["source"]
        self.assertEqual(nb["cells"][0]["cell_type"], "markdown")
        # Unzip path must point to export/ subdirectory
        self.assertIn("models/mia/export/", title_src,
                      "Title cell must reference models/{slug}/export/ for unzip")
        # Must not use outdated models/{slug}/ (without export/)
        self.assertNotIn("models/mia/ ", title_src)
        # Pipeline flag must be --method skip-train, not --skip-train
        self.assertIn("--method skip-train", title_src,
                      "Title cell must use '--method skip-train', not '--skip-train'")
        self.assertNotIn("--skip-train", title_src.replace("--method skip-train", ""))

    def test_cell_count(self):
        nb = self._build()
        # Title(md) + Install + HF auth + GPU check + Config + Data + Model + Format + Train + Save + Download
        self.assertGreaterEqual(len(nb["cells"]), 10)

    def test_cell_ids_unique(self):
        nb = self._build()
        ids = [c["id"] for c in nb["cells"]]
        self.assertEqual(len(ids), len(set(ids)), "Duplicate cell IDs")

    def test_cell_counter_resets(self):
        nb1 = self._build(slug="alice")
        nb2 = self._build(slug="bob")
        self.assertEqual(nb1["cells"][0]["id"], nb2["cells"][0]["id"],
                         "Cell counter should reset for each build")

    def test_all_code_cells_valid_python(self):
        nb = self._build()
        for i, cell in enumerate(self._code_cells(nb)):
            clean = "\n".join(
                l for l in cell["source"].splitlines()
                if not l.lstrip().startswith("!")
            )
            try:
                ast.parse(clean)
            except SyntaxError as e:
                self.fail(f"Syntax error in code cell {i}: {e}\n{clean[:200]}")

    # ── Slug injection safety ─────────────────────────────────────────────

    def test_model_id_with_quotes_no_syntax_error(self):
        """Model ID containing double-quotes must not cause SyntaxError in generated notebook."""
        nb = self._build(model='org/model"with"quotes')
        for i, cell in enumerate(self._code_cells(nb)):
            clean = "\n".join(
                l for l in cell["source"].splitlines()
                if not l.lstrip().startswith("!")
            )
            try:
                ast.parse(clean)
            except SyntaxError as e:
                self.fail(f"Model ID with quotes caused SyntaxError in cell {i}: {e}")

    def test_next_steps_uses_model_id_variable(self):
        """Download cell next-steps must reference MODEL_ID variable (f-string), not hardcode it."""
        nb = self._build(slug="samantha", model="google/gemma-4-E4B-it")
        # Find the download cell (contains 'files.download')
        download_cell = next(
            (c for c in self._code_cells(nb) if "files.download" in c["source"]),
            None
        )
        self.assertIsNotNone(download_cell, "download cell not found")
        src = download_cell["source"]
        # Slug must appear as a concrete value, not a placeholder
        self.assertIn("samantha", src)
        # MODEL_ID must appear as a Python variable reference inside an f-string
        # i.e. the source must contain  f"...{MODEL_ID}..."  (not literal "{MODEL_ID}")
        self.assertIn("{MODEL_ID}", src,
                      "MODEL_ID variable reference should appear in next-steps print")
        # No residual {{MODEL_ID}} double-brace (would render as literal, not variable)
        self.assertNotIn("{{MODEL_ID}}", src)
        # The print must be an f-string so MODEL_ID is evaluated at Colab runtime
        import re
        self.assertRegex(src, r'print\(f["\'].*\{MODEL_ID\}')

    def test_valid_slugs_accepted(self):
        for slug in ["alice", "my-persona", "AI_agent2", "Test123"]:
            try:
                nb = self._build(slug=slug)
                cfg = next(c for c in nb["cells"]
                           if "SLUG" in str(c["source"]) and "MODEL_ID" in str(c["source"]))
                ast.parse(cfg["source"])
            except Exception as e:
                self.fail(f"Valid slug {slug!r} failed: {e}")

    def test_slug_validation_rejects_special_chars(self):
        for bad in ['bad"slug', "bad/slug", "bad slug", ""]:
            self.assertFalse(
                bool(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9\-_]*", bad)),
                f"Bad slug {bad!r} should be rejected"
            )

    # ── enable_thinking detection ─────────────────────────────────────────

    def test_gemma4_gets_enable_thinking(self):
        nb = self._build(model="google/gemma-4-E4B-it")
        src = "\n".join(c["source"] for c in nb["cells"])
        self.assertIn("enable_thinking", src)
        self.assertIn("False", src)

    def test_qwen3_gets_enable_thinking(self):
        nb = self._build(model="Qwen/Qwen3-4B-Instruct")
        src = "\n".join(c["source"] for c in nb["cells"])
        self.assertIn("enable_thinking", src)

    def test_llama_no_enable_thinking(self):
        nb = self._build(model="meta-llama/Llama-3.1-8B-Instruct")
        fmt_cell = next(c for c in nb["cells"] if "extra_template_kwargs" in str(c["source"]))
        self.assertIn("extra_template_kwargs = {}", fmt_cell["source"])

    # ── Gated model detection ─────────────────────────────────────────────

    def test_gemma_is_gated(self):
        nb = self._build(model="google/gemma-4-E4B-it")
        auth = next(c for c in nb["cells"] if "IS_GATED" in str(c["source"]))
        self.assertIn("IS_GATED = True", auth["source"])

    def test_llama_is_gated(self):
        nb = self._build(model="meta-llama/Llama-3.1-8B-Instruct")
        auth = next(c for c in nb["cells"] if "IS_GATED" in str(c["source"]))
        self.assertIn("IS_GATED = True", auth["source"])

    def test_mistral_not_gated(self):
        nb = self._build(model="mistralai/Mistral-7B-Instruct-v0.3")
        auth = next(c for c in nb["cells"] if "IS_GATED" in str(c["source"]))
        self.assertIn("IS_GATED = False", auth["source"])

    def test_qwen_not_gated(self):
        nb = self._build(model="Qwen/Qwen3-4B-Instruct")
        auth = next(c for c in nb["cells"] if "IS_GATED" in str(c["source"]))
        self.assertIn("IS_GATED = False", auth["source"])

    # ── Empty eval_data ───────────────────────────────────────────────────

    def test_empty_eval_conditional_write(self):
        nb = self._build(eval_data=[])
        data_cell = next(c for c in nb["cells"]
                         if "train_data" in str(c["source"]) and "eval_data" in str(c["source"]))
        self.assertIn("if eval_data:", data_cell["source"])
        self.assertIn("HAS_EVAL = bool(eval_data)", data_cell["source"])

    def test_empty_eval_train_cell_uses_has_eval(self):
        nb = self._build(eval_data=[])
        train_cell = next(c for c in nb["cells"] if "trainer.train()" in str(c["source"]))
        self.assertIn("HAS_EVAL", train_cell["source"])
        self.assertIn('eval_strategy="epoch" if HAS_EVAL else "no"', train_cell["source"])

    def test_nonempty_eval_written(self):
        nb = self._build(eval_data=self.TRAIN_DATA)
        data_cell = next(c for c in nb["cells"]
                         if "train_data" in str(c["source"]) and "eval_data" in str(c["source"]))
        self.assertIn("if eval_data:", data_cell["source"])

    # ── HAS_EVAL guard ────────────────────────────────────────────────────

    def test_has_eval_uses_globals(self):
        nb = self._build()
        train_cell = next(c for c in nb["cells"] if "trainer.train()" in str(c["source"]))
        self.assertIn("globals().get(", train_cell["source"])

    # ── Profile text escaping ─────────────────────────────────────────────

    def test_profile_special_chars_roundtrip(self):
        profile = 'She said: "Hello\nWorld"\t(tab here)\\'
        nb = self._build(profile=profile)
        data_cell = next(c for c in nb["cells"]
                         if "profile_text" in str(c["source"]) and "train_data" in str(c["source"]))
        for line in data_cell["source"].splitlines():
            if line.startswith("profile_text = "):
                val = eval(line.split(" = ", 1)[1])
                self.assertEqual(val, profile)
                return
        self.fail("profile_text line not found")

    # ── Training data inlining ────────────────────────────────────────────

    def test_training_data_inlined(self):
        nb = self._build()
        data_cell = next(c for c in nb["cells"]
                         if "train_data" in str(c["source"]) and "eval_data" in str(c["source"]))
        self.assertIn("Hi there!", data_cell["source"])

    def test_braces_in_content_safe(self):
        """Training data with JSON/dict-like content doesn't break f-string."""
        tricky = [{"messages": [
            {"role": "user",      "content": 'What is {"key": "value"}?'},
            {"role": "assistant", "content": "It's a JSON object with {braces}."},
        ]}]
        nb = self._build(train=tricky)
        data_cell = next(c for c in nb["cells"]
                         if "train_data" in str(c["source"]) and "eval_data" in str(c["source"]))
        clean = "\n".join(l for l in data_cell["source"].splitlines()
                          if not l.lstrip().startswith("!"))
        ast.parse(clean)  # must not raise

    # ── CLI ───────────────────────────────────────────────────────────────

    def test_cli_bad_slug_exits(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            (tmp / "train.jsonl").write_text(
                json.dumps({"messages": [{"role": "user", "content": "hi"},
                                         {"role": "assistant", "content": "hello"}]}) + "\n"
            )
            r = subprocess.run(
                [sys.executable, str(SCRIPTS / "generate_colab.py"),
                 "--slug", 'bad"slug', "--model", "google/gemma-4-E4B-it",
                 "--training-dir", str(tmp)],
                capture_output=True, text=True
            )
            self.assertNotEqual(r.returncode, 0, "Bad slug should cause non-zero exit")
            self.assertIn("Invalid slug", r.stdout + r.stderr)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


# ── pack_integrate.py ─────────────────────────────────────────────────────────

class TestPackIntegrate(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.pack = self.tmp / "persona-alice"
        self.pack.mkdir()
        self.model_dir = self.tmp / "models" / "alice"
        self.model_dir.mkdir(parents=True)

        # Minimal persona.json
        (self.pack / "persona.json").write_text(json.dumps({
            "soul": {"identity": {"personaName": "Alice", "slug": "alice",
                                  "bio": "Test persona."}},
            "body": {"runtime": {"framework": "openclaw"}},
        }, indent=2))
        (self.pack / "SKILL.md").write_text("# Alice")

        # adapter_weights/
        adapter = self.model_dir / "adapter_weights"
        adapter.mkdir()
        (adapter / "adapter_config.json").write_text('{"r": 16}')

        # training_summary.json
        self.summary = {
            "base_model": "google/gemma-4-E4B-it",
            "method": "mlx",
            "lora_rank": 16,
            "epochs": 3,
            "train_samples": 100,
            "eval_samples": 10,
            "device": "apple-silicon",
            "adapter_path": str(adapter),
            "export": {"formats": ["gguf"], "quant": "Q4_K_M"},
        }
        (self.model_dir / "training_summary.json").write_text(
            json.dumps(self.summary, indent=2)
        )
        # voice_test_results.json
        (self.model_dir / "voice_test_results.json").write_text(json.dumps({
            "overall_score": 3.8, "pass": True,
            "category_scores": {"domain": 4.0},
        }, indent=2))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, *extra):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "pack_integrate.py"),
             "--slug", "alice",
             "--model-dir", str(self.model_dir),
             "--pack-dir", str(self.pack)] + list(extra),
            capture_output=True, text=True
        )

    def test_dry_run_writes_nothing(self):
        r = self._run("--dry-run")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse((self.pack / "model").exists(),
                         "dry-run must not create any files")

    def test_basic_integration(self):
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        # adapter_weights copied
        self.assertTrue((self.pack / "model" / "adapter_weights").exists())
        # training_summary copied
        self.assertTrue((self.pack / "model" / "training_summary.json").exists())
        # voice_test_results copied
        self.assertTrue((self.pack / "model" / "voice_test_results.json").exists())

    def test_persona_json_updated(self):
        self._run()
        pj = json.loads((self.pack / "persona.json").read_text())
        models = pj["body"]["runtime"]["models"]
        self.assertEqual(len(models), 1)
        m = models[0]
        self.assertEqual(m["id"], "alice-local")
        self.assertEqual(m["type"], "fine-tuned")
        self.assertEqual(m["base"], "google/gemma-4-E4B-it")
        self.assertEqual(m["lora_rank"], 16)
        self.assertTrue(m["trainable"])
        self.assertEqual(m["fidelity_score"], 3.8)
        self.assertEqual(m["adapter"], "./model/adapter_weights/")

    def test_running_md_generated(self):
        self._run()
        running = self.pack / "model" / "RUNNING.md"
        self.assertTrue(running.exists())
        content = running.read_text()
        self.assertIn("ollama run alice", content)
        self.assertIn("gemma-4-E4B-it", content)
        self.assertIn("3.8", content)  # fidelity score

    def test_idempotent(self):
        """Running twice should update, not duplicate."""
        self._run()
        self._run()
        pj = json.loads((self.pack / "persona.json").read_text())
        models = pj["body"]["runtime"]["models"]
        self.assertEqual(len(models), 1, "Should have exactly one model entry after two runs")

    def test_missing_model_dir_exits(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "pack_integrate.py"),
             "--slug", "alice",
             "--model-dir", "/nonexistent/path",
             "--pack-dir", str(self.pack)],
            capture_output=True, text=True
        )
        self.assertNotEqual(r.returncode, 0)

    def test_missing_training_summary_exits(self):
        (self.model_dir / "training_summary.json").unlink()
        r = self._run()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("training_summary.json", r.stdout + r.stderr)

    def test_no_voice_results_still_works(self):
        """voice_test_results.json is optional."""
        (self.model_dir / "voice_test_results.json").unlink()
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        pj = json.loads((self.pack / "persona.json").read_text())
        m = pj["body"]["runtime"]["models"][0]
        self.assertNotIn("fidelity_score", m)

    def test_existing_models_preserved(self):
        """Existing unrelated model entries are not clobbered."""
        pj = json.loads((self.pack / "persona.json").read_text())
        pj["body"]["runtime"]["models"] = [
            {"id": "cloud-gpt4o", "type": "api", "provider": "openai"}
        ]
        (self.pack / "persona.json").write_text(json.dumps(pj, indent=2))
        self._run()
        pj2 = json.loads((self.pack / "persona.json").read_text())
        models = pj2["body"]["runtime"]["models"]
        ids = {m["id"] for m in models}
        self.assertIn("cloud-gpt4o", ids, "Existing model entry should be preserved")
        self.assertIn("alice-local", ids, "New model entry should be added")
        self.assertEqual(len(models), 2)

    def test_soul_null_in_persona_json(self):
        """persona.json with soul: null should not crash slug derivation."""
        (self.pack / "persona.json").write_text(json.dumps({
            "soul": None,
            "body": {"runtime": {"framework": "openclaw"}},
        }, indent=2))
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        pj = json.loads((self.pack / "persona.json").read_text())
        # slug falls back to directory name "persona-alice" → "alice"
        models = pj["body"]["runtime"]["models"]
        self.assertEqual(len(models), 1)
        self.assertEqual(models[0]["id"], "alice-local")

    def test_body_null_in_persona_json(self):
        """persona.json with body: null should not crash (creates body.runtime.models)."""
        (self.pack / "persona.json").write_text(json.dumps({
            "soul": {"identity": {"personaName": "Alice", "slug": "alice",
                                  "bio": "Test persona."}},
            "body": None,
        }, indent=2))
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        pj = json.loads((self.pack / "persona.json").read_text())
        self.assertIsInstance(pj["body"], dict)
        self.assertIsInstance(pj["body"]["runtime"], dict)
        self.assertIsInstance(pj["body"]["runtime"]["models"], list)

    def test_adapter_path_null_in_summary(self):
        """adapter_path: null in training_summary.json falls back to model_dir/adapter_weights."""
        summary = dict(self.summary)
        summary["adapter_path"] = None
        (self.model_dir / "training_summary.json").write_text(json.dumps(summary, indent=2))
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.pack / "model" / "adapter_weights").exists())

    def test_export_null_in_summary(self):
        """export: null in training_summary.json should not crash (treated as absent)."""
        summary = dict(self.summary)
        summary["export"] = None
        (self.model_dir / "training_summary.json").write_text(json.dumps(summary, indent=2))
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_overall_score_null_in_voice_results(self):
        """overall_score: null should not crash and must NOT write fidelity_score (unknown ≠ zero)."""
        (self.model_dir / "voice_test_results.json").write_text(json.dumps({
            "overall_score": None, "pass": False,
        }, indent=2))
        r = self._run()
        self.assertEqual(r.returncode, 0, r.stderr)
        pj = json.loads((self.pack / "persona.json").read_text())
        m = pj["body"]["runtime"]["models"][0]
        # overall_score null → fidelity_raw None → fidelity None → omitted from model entry
        self.assertNotIn("fidelity_score", m,
                         "null overall_score must not produce fidelity_score: 0.0 in persona.json")

    def test_null_fields_in_summary_show_dash_in_running_md(self):
        """null lora_rank/epochs/method show '—' in RUNNING.md, not 'None'."""
        summary = dict(self.summary)
        summary["lora_rank"] = None
        summary["epochs"] = None
        summary["method"] = None
        (self.model_dir / "training_summary.json").write_text(json.dumps(summary, indent=2))
        self._run()
        content = (self.pack / "model" / "RUNNING.md").read_text()
        self.assertNotIn("None", content, "Null fields must not render as 'None' in RUNNING.md")
        self.assertIn("—", content)


# ── voice_test.py — unit tests (no model loading) ────────────────────────────

class TestVoiceTestHelpers(unittest.TestCase):

    def setUp(self):
        if "voice_test" in sys.modules:
            del sys.modules["voice_test"]
        self.vt = load_module("voice_test")

    def test_score_response_off_topic_generic_phrases(self):
        """Generic AI phrases on off-topic questions lower score."""
        result = self.vt.score_response(
            "Can you write code?", "As an AI, I cannot do that.",
            "off_topic", "profile"
        )
        self.assertLessEqual(result["score"], 2)
        self.assertIn("broke persona", result["notes"])

    def test_score_response_off_topic_in_character(self):
        """In-character deflection on off-topic increases score."""
        result = self.vt.score_response(
            "Can you write code?", "I prefer poetry to code, honestly.",
            "off_topic", "profile"
        )
        self.assertGreaterEqual(result["score"], 3)

    def test_score_response_too_short(self):
        result = self.vt.score_response("Q", "OK", "casual", "profile")
        self.assertLessEqual(result["score"], 3)

    def test_score_response_clamped_1_to_5(self):
        for q, resp, cat in [
            ("Q", "x", "off_topic"),   # might score very low
            ("Q", "A wonderful long answer about anything.", "casual"),
        ]:
            result = self.vt.score_response(q, resp, cat, "profile")
            self.assertGreaterEqual(result["score"], 1)
            self.assertLessEqual(result["score"], 5)

    def test_load_profile_traits_missing_file(self):
        """Missing profile returns empty string, not exception."""
        result = self.vt.load_profile_traits(Path("/nonexistent/profile.md"))
        self.assertEqual(result, "")

    def test_load_profile_traits_truncates(self):
        tmp_dir = Path(tempfile.mkdtemp())
        try:
            profile = tmp_dir / "profile.md"
            profile.write_text("A" * 2000)
            result = self.vt.load_profile_traits(profile)
            self.assertLessEqual(len(result), 1000)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_probe_chat_template_kwargs_returns_dict(self):
        """probe_chat_template_kwargs returns a dict (may be empty without real tokenizer)."""

        class FakeTokenizer:
            def apply_chat_template(self, *args, **kwargs):
                if "enable_thinking" in kwargs:
                    raise TypeError("unknown kwarg")
                return ""

        result = self.vt.probe_chat_template_kwargs(FakeTokenizer())
        self.assertEqual(result, {})

    def test_probe_chat_template_kwargs_enables_thinking(self):
        class FakeGemmaTokenizer:
            def apply_chat_template(self, *args, **kwargs):
                return ""  # accepts enable_thinking

        result = self.vt.probe_chat_template_kwargs(FakeGemmaTokenizer())
        self.assertEqual(result, {"enable_thinking": False})

    def test_questions_zero_rejected(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "voice_test.py"),
             "--model", "/tmp/fake", "--base-model", "google/gemma-4-E4B-it",
             "--questions", "0"],
            capture_output=True, text=True
        )
        self.assertNotEqual(r.returncode, 0)


# ── train.py --dry-run (no GPU) ───────────────────────────────────────────────

class TestTrainDryRun(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        data = self.tmp / "data"
        data.mkdir()
        # Minimal train.jsonl
        (data / "train.jsonl").write_text(
            json.dumps({"messages": [
                {"role": "system",    "content": "You are Alice."},
                {"role": "user",      "content": "Hi"},
                {"role": "assistant", "content": "Hello!"},
            ]}) + "\n"
        )
        self.data_dir = data
        self.out_dir = self.tmp / "out"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_dry_run_exits_zero(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "train.py"),
             "--model", "google/gemma-4-E4B-it",
             "--data", str(self.data_dir),
             "--output", str(self.out_dir),
             "--method", "mlx",
             "--dry-run"],
            capture_output=True, text=True
        )
        self.assertEqual(r.returncode, 0, f"dry-run failed:\n{r.stdout}\n{r.stderr}")
        self.assertIn("Dry run", r.stdout)

    def test_dry_run_creates_no_artifacts(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "train.py"),
             "--model", "google/gemma-4-E4B-it",
             "--data", str(self.data_dir),
             "--output", str(self.out_dir),
             "--method", "mlx", "--dry-run"],
            capture_output=True, text=True
        )
        self.assertEqual(r.returncode, 0, f"dry-run exited non-zero:\n{r.stdout}\n{r.stderr}")
        self.assertFalse((self.out_dir / "adapter_weights").exists())

    def test_missing_train_data_exits_nonzero(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "train.py"),
             "--model", "google/gemma-4-E4B-it",
             "--data", "/nonexistent/path",
             "--output", str(self.out_dir),
             "--method", "mlx"],
            capture_output=True, text=True
        )
        self.assertNotEqual(r.returncode, 0)


class TestVersionFields(unittest.TestCase):
    """Tests for new versioning fields written by train.py."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.data_dir = self.tmp / "data"
        self.data_dir.mkdir()
        (self.data_dir / "train.jsonl").write_text(
            '{"messages":[{"role":"user","content":"Hi"},{"role":"assistant","content":"Hey"}]}\n'
        )
        self.out_dir = self.tmp / "out"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run_dry_train(self, extra_args=None):
        """Run train.py --dry-run; returns summary written to out_dir or None."""
        cmd = [
            sys.executable, str(SCRIPTS / "train.py"),
            "--model", "google/gemma-4-E4B-it",
            "--data", str(self.data_dir),
            "--output", str(self.out_dir),
            "--method", "mlx", "--dry-run",
        ]
        if extra_args:
            cmd += extra_args
        subprocess.run(cmd, capture_output=True, text=True)
        # dry-run does not write summary; we write a minimal one to simulate post-train state
        # and test the helper independently by calling the module directly.

    def test_version_fields_in_training_summary(self):
        """_version_fields helper writes all 5 new keys."""
        spec = importlib.util.spec_from_file_location("train", SCRIPTS / "train.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        class FakeArgs:
            version = "v2"
            profile = None
            formats = "gguf,ollama,vllm"
            quant = "Q8_0"

        fields = mod._version_fields(FakeArgs())
        for key in ("version", "trained_at", "profile_path", "formats", "quant"):
            self.assertIn(key, fields, f"Missing key: {key}")
        self.assertEqual(fields["version"], "v2")
        self.assertEqual(fields["formats"], "gguf,ollama,vllm")
        self.assertEqual(fields["quant"], "Q8_0")
        self.assertIsNone(fields["profile_path"])

    def test_trained_at_is_iso8601(self):
        """trained_at field matches ISO 8601 UTC format."""
        import re as _re
        spec = importlib.util.spec_from_file_location("train", SCRIPTS / "train.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        class FakeArgs:
            version = "v1"
            profile = None
            formats = "gguf"
            quant = "Q4_K_M"

        fields = mod._version_fields(FakeArgs())
        self.assertRegex(fields["trained_at"],
                         r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

    def test_profile_path_is_absolute(self):
        """profile_path is stored as absolute path when a file is given."""
        spec = importlib.util.spec_from_file_location("train", SCRIPTS / "train.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        profile_file = self.tmp / "profile.md"
        profile_file.write_text("# Bio\nFriendly assistant\n")

        class FakeArgs:
            version = "v1"
            formats = "gguf"
            quant = "Q4_K_M"

        FakeArgs.profile = str(profile_file)

        fields = mod._version_fields(FakeArgs())
        self.assertTrue(Path(fields["profile_path"]).is_absolute())


class TestUpdateManifest(unittest.TestCase):
    """Tests for version.py update-manifest sub-command."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py")] + list(args),
            capture_output=True, text=True
        )

    def test_update_manifest_creates_and_sets_current(self):
        r = self._run("update-manifest", "--slug", "alice",
                      "--version", "v1", "--base-dir", str(self.tmp))
        self.assertEqual(r.returncode, 0, r.stderr)
        m = json.loads((self.tmp / "manifest.json").read_text())
        self.assertEqual(m["current"], "v1")
        self.assertIn("v1", m["versions"])

    def test_update_manifest_appends_new_version(self):
        self._run("update-manifest", "--slug", "alice",
                  "--version", "v1", "--base-dir", str(self.tmp))
        self._run("update-manifest", "--slug", "alice",
                  "--version", "v2", "--base-dir", str(self.tmp))
        m = json.loads((self.tmp / "manifest.json").read_text())
        self.assertEqual(m["current"], "v2")
        self.assertIn("v1", m["versions"])
        self.assertIn("v2", m["versions"])

    def test_update_manifest_no_duplicate_versions(self):
        """Running update-manifest twice for same version should not duplicate."""
        self._run("update-manifest", "--slug", "alice",
                  "--version", "v1", "--base-dir", str(self.tmp))
        self._run("update-manifest", "--slug", "alice",
                  "--version", "v1", "--base-dir", str(self.tmp))
        m = json.loads((self.tmp / "manifest.json").read_text())
        self.assertEqual(m["versions"].count("v1"), 1)


class TestVersionList(unittest.TestCase):
    """Tests for version.py list sub-command."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _make_adapter(self, version: str, summary: dict, voice: dict | None = None):
        d = self.tmp / "adapters" / version
        d.mkdir(parents=True, exist_ok=True)
        (d / "training_summary.json").write_text(json.dumps(summary))
        if voice:
            (d / "voice_test_results.json").write_text(json.dumps(voice))

    def _run_list(self):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py"),
             "list", "--slug", "alice", "--base-dir", str(self.tmp)],
            capture_output=True, text=True
        )

    def test_version_list_empty_adapters_no_crash(self):
        (self.tmp / "adapters").mkdir()
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("No versions", r.stdout)

    def test_version_list_no_adapters_dir_no_crash(self):
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("No versions", r.stdout)

    def test_version_list_numeric_sort(self):
        """v2 should appear before v10 in the list (not v10 before v2 lexically)."""
        for i in [1, 2, 10]:
            self._make_adapter(f"v{i}", {
                "base_model": f"model", "train_samples": i * 100,
                "trained_at": f"2026-0{min(i,9)}-01T00:00:00Z",
            })
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        idx_v2 = r.stdout.index("v2")
        idx_v10 = r.stdout.index("v10")
        self.assertLess(idx_v2, idx_v10, "v2 should appear before v10 in output")

    def test_version_list_column_alignment(self):
        """Header and data rows must share the same first-column width (11 chars)."""
        self._make_adapter("v1", {"base_model": "m", "train_samples": 10,
                                  "trained_at": "2026-01-01T00:00:00Z"})
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = r.stdout.splitlines()
        # Find the separator line (all dashes)
        sep_line = next((l for l in lines if l.strip().startswith("---")), None)
        self.assertIsNotNone(sep_line, "separator line not found")
        # The leading "  " prefix is followed by 11 dashes for the first column
        self.assertTrue(
            sep_line.startswith("  " + "-" * 11 + " "),
            f"Expected first column separator = 11 dashes, got: {sep_line!r}"
        )
        # Find the header line containing "VERSION"
        header_line = next((l for l in lines if "VERSION" in l), None)
        self.assertIsNotNone(header_line, "header line not found")
        # Find the data line containing "v1"
        data_line = next((l for l in lines if "v1" in l and "VERSION" not in l), None)
        self.assertIsNotNone(data_line, "data line not found")
        # Both header and data row must have TURNS at the same column offset
        header_turns_pos = header_line.index("TURNS")
        data_turns_pos   = data_line.index("TURNS") if "TURNS" in data_line else None
        if data_turns_pos is not None:
            self.assertEqual(header_turns_pos, data_turns_pos)
        else:
            # Verify data row has "  " prefix, marker char, space, then version
            self.assertRegex(data_line, r"^  [ *] v1")

    def test_version_list_shows_fidelity(self):
        self._make_adapter("v1",
            {"base_model": "google/gemma-4", "train_samples": 100,
             "trained_at": "2026-01-01T00:00:00Z"},
            {"overall_score": 4.2})
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("4.2", r.stdout)

    def test_version_list_corrupt_summary_shows_placeholder(self):
        """Corrupt training_summary.json shows '—' and does not crash."""
        d = self.tmp / "adapters" / "v1"
        d.mkdir(parents=True, exist_ok=True)
        (d / "training_summary.json").write_text("NOT_JSON{{{")
        r = self._run_list()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("—", r.stdout)


class TestVersionActivateGuards(unittest.TestCase):
    """Guard checks in version.py activate that should exit with a clear error."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_activate_missing_adapter_weights_exits_with_error(self):
        """activate must exit 1 with a friendly message when adapter_weights/ is absent from archive."""
        # Create archive dir with training_summary.json but NO adapter_weights/
        v1 = self.tmp / "adapters" / "v1"
        v1.mkdir(parents=True)
        (v1 / "training_summary.json").write_text(json.dumps({
            "base_model": "google/gemma-4-E4B-it",
            "version": "v1",
            "formats": "gguf,ollama",
            "quant": "Q4_K_M",
        }))
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py"),
             "activate", "--slug", "alice", "--version", "v1",
             "--base-dir", str(self.tmp)],
            capture_output=True, text=True
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("adapter_weights", r.stderr,
                      "Error message must mention adapter_weights/")

    def test_activate_missing_version_exits_with_error(self):
        """activate must exit 1 when requested version does not exist."""
        (self.tmp / "adapters").mkdir(parents=True)
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py"),
             "activate", "--slug", "alice", "--version", "v99",
             "--base-dir", str(self.tmp)],
            capture_output=True, text=True
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("v99", r.stderr)


class TestVersionDiff(unittest.TestCase):
    """Tests for version.py diff sub-command."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        for ver, quant in [("v1", "Q4_K_M"), ("v2", "Q8_0")]:
            d = self.tmp / "adapters" / ver
            d.mkdir(parents=True, exist_ok=True)
            (d / "training_summary.json").write_text(json.dumps({
                "base_model": "google/gemma-4",
                "method": "mlx",
                "epochs": 3,
                "lora_rank": 16,
                "train_samples": 100,
                "trained_at": "2026-01-01T00:00:00Z",
                "version": ver,
                "formats": "gguf,ollama",
                "quant": quant,
            }))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_diff_exits_zero(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py"),
             "diff", "--slug", "alice",
             "--version-a", "v1", "--version-b", "v2",
             "--base-dir", str(self.tmp)],
            capture_output=True, text=True
        )
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_diff_includes_quant(self):
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / "version.py"),
             "diff", "--slug", "alice",
             "--version-a", "v1", "--version-b", "v2",
             "--base-dir", str(self.tmp)],
            capture_output=True, text=True
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Q4_K_M", r.stdout)
        self.assertIn("Q8_0", r.stdout)


class TestPackIntegrateVersioned(unittest.TestCase):
    """Tests for pack_integrate.py three-level fallback and versioned id."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        # Minimal persona pack
        self.pack = self.tmp / "pack"
        self.pack.mkdir()
        (self.pack / "persona.json").write_text(json.dumps({
            "soul": {"identity": {"slug": "alice", "personaName": "Alice", "bio": "Test"}},
        }))
        # Each test calls _write_persona() to set up the exact persona.json it needs

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _write_persona(self):
        (self.pack / "persona.json").write_text(json.dumps({
            "soul": {"identity": {"slug": "alice", "personaName": "Alice",
                                  "bio": "Test persona"}},
        }))

    def _base_summary(self, version="v1"):
        return {
            "base_model": "google/gemma-4-E4B-it",
            "method": "mlx",
            "lora_rank": 16,
            "epochs": 3,
            "train_samples": 100,
            "eval_samples": 10,
            "device": "apple-silicon",
            "adapter_path": None,
            "version": version,
            "trained_at": "2026-01-01T00:00:00Z",
            "formats": "gguf,ollama",
            "quant": "Q4_K_M",
        }

    def _run_pack_integrate(self, model_dir, extra_args=None):
        cmd = [
            sys.executable, str(SCRIPTS / "pack_integrate.py"),
            "--slug", "alice",
            "--model-dir", str(model_dir),
            "--pack-dir", str(self.pack),
            "--dry-run",
        ]
        if extra_args:
            cmd += extra_args
        return subprocess.run(cmd, capture_output=True, text=True)

    def test_fallback_level1_manifest(self):
        """Level 1: manifest.json + export/training_summary.json → uses export/."""
        base = self.tmp / "models" / "alice"
        export = base / "export"
        export.mkdir(parents=True)
        (base / "manifest.json").write_text(json.dumps({"current": "v2", "versions": ["v1", "v2"]}))
        (export / "training_summary.json").write_text(json.dumps(self._base_summary("v2")))
        self._write_persona()
        r = self._run_pack_integrate(base)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("alice-local-v2", r.stdout)

    def test_fallback_level2_export_no_manifest(self):
        """Level 2: export/training_summary.json without manifest.json."""
        base = self.tmp / "models" / "alice2"
        export = base / "export"
        export.mkdir(parents=True)
        (export / "training_summary.json").write_text(json.dumps(self._base_summary("v1")))
        self._write_persona()
        r = self._run_pack_integrate(base)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("alice-local-v1", r.stdout)

    def test_fallback_level3_flat_structure(self):
        """Level 3: old flat structure — training_summary.json directly in model_dir."""
        base = self.tmp / "models" / "alice3"
        base.mkdir(parents=True)
        summary = self._base_summary()
        del summary["version"]  # old summary without version field
        (base / "training_summary.json").write_text(json.dumps(summary))
        self._write_persona()
        r = self._run_pack_integrate(base)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("alice-local", r.stdout)

    def test_missing_export_dir_exits_with_error(self):
        """manifest.json present but export/ missing → friendly error, exit 1."""
        base = self.tmp / "models" / "alice4"
        base.mkdir(parents=True)
        (base / "manifest.json").write_text(json.dumps({"current": "v1", "versions": ["v1"]}))
        # export/ intentionally absent
        self._write_persona()
        r = self._run_pack_integrate(base)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("export", r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
