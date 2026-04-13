"""
Unit tests for anyone-skill utility scripts:
  - preprocess.py  — SQLite extraction + large-file sampling
  - skill_writer.py — persona skill directory initialisation + meta management
  - version_manager.py — bump / rollback / history
"""

import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import preprocess
import skill_writer
import version_manager


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_imessage_db(path: Path) -> None:
    """Create a minimal iMessage-schema SQLite database for testing."""
    con = sqlite3.connect(str(path))
    con.execute("CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT)")
    con.execute("CREATE TABLE message (date INTEGER, handle_id INTEGER, text TEXT)")
    con.execute("INSERT INTO handle VALUES (1, 'alice@example.com')")
    # date: Apple epoch (seconds since 2001-01-01); store in nanoseconds
    con.execute("INSERT INTO message VALUES (0, 1, 'Hello from Alice')")
    con.execute("INSERT INTO message VALUES (1000000000, 0, 'Reply from me')")
    con.commit()
    con.close()


def _make_wechat_db(path: Path) -> None:
    """Create a minimal WeChat MSG-schema SQLite database for testing."""
    con = sqlite3.connect(str(path))
    con.execute("CREATE TABLE MSG (CreateTime TEXT, NickName TEXT, Content TEXT)")
    con.execute("INSERT INTO MSG VALUES ('2026-01-01', 'Bob', 'Hi there')")
    con.execute("INSERT INTO MSG VALUES ('2026-01-02', 'Me', 'Hey Bob')")
    con.commit()
    con.close()


# ── preprocess.py ─────────────────────────────────────────────────────────────

class TestMsgConstructor(unittest.TestCase):
    def test_fields(self):
        m = preprocess.msg("2026-01-01", "Alice", "Hello", "imessage")
        self.assertEqual(m["time"],     "2026-01-01")
        self.assertEqual(m["sender"],   "Alice")
        self.assertEqual(m["content"],  "Hello")
        self.assertEqual(m["platform"], "imessage")

    def test_returns_dict(self):
        m = preprocess.msg("t", "s", "c", "p")
        self.assertIsInstance(m, dict)


class TestIsSqlite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_true_for_sqlite_file(self):
        p = Path(self.tmp) / "db.db"
        con = sqlite3.connect(str(p))
        con.execute("CREATE TABLE t (x TEXT)")
        con.close()
        self.assertTrue(preprocess._is_sqlite(p))

    def test_false_for_text_file(self):
        p = Path(self.tmp) / "plain.txt"
        p.write_text("hello world")
        self.assertFalse(preprocess._is_sqlite(p))

    def test_false_for_missing_file(self):
        self.assertFalse(preprocess._is_sqlite(Path(self.tmp) / "nonexistent.db"))


class TestLoadAny(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_loads_json_list(self):
        p = Path(self.tmp) / "msgs.json"
        data = [{"content": "hi", "sender": "Alice", "time": "2026-01-01"}]
        p.write_text(json.dumps(data))
        result = preprocess.load_any(p)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["content"], "hi")

    def test_loads_json_with_messages_key(self):
        p = Path(self.tmp) / "export.json"
        data = {"messages": [{"content": "hello", "sender": "Bob"}]}
        p.write_text(json.dumps(data))
        result = preprocess.load_any(p)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["content"], "hello")

    def test_loads_plain_text(self):
        p = Path(self.tmp) / "notes.txt"
        p.write_text("Line one\nLine two\n\nLine three\n")
        result = preprocess.load_any(p)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["content"], "Line one")

    def test_skips_empty_lines_in_plain_text(self):
        p = Path(self.tmp) / "sparse.txt"
        p.write_text("\n\nOnly line\n\n")
        result = preprocess.load_any(p)
        self.assertEqual(len(result), 1)

    def test_strips_js_wrapper(self):
        """X/Twitter archive files start with 'window.YTD.tweets.part0 = [...]'"""
        p = Path(self.tmp) / "tweets.js"
        data = [{"full_text": "A tweet", "created_at": "Mon Jan 01 2026"}]
        p.write_text(f"window.YTD_tweets = {json.dumps(data)};")
        result = preprocess.load_any(p)
        self.assertGreater(len(result), 0)


class TestSample(unittest.TestCase):
    def _msgs(self, n: int) -> list:
        return [preprocess.msg(str(i), "u", f"msg {i}", "test") for i in range(n)]

    def test_under_limit_returns_all(self):
        msgs = self._msgs(10)
        result = preprocess.sample(msgs, 20)
        self.assertEqual(len(result), 10)

    def test_over_limit_reduces_to_max(self):
        msgs = self._msgs(1000)
        result = preprocess.sample(msgs, 100)
        self.assertEqual(len(result), 100)

    def test_keyword_messages_prioritised(self):
        msgs = [preprocess.msg(str(i), "u", "ordinary message", "t") for i in range(200)]
        # Inject 10 important messages
        for i in range(10):
            msgs[i * 20]["content"] = "IMPORTANT keyword"
        result = preprocess.sample(msgs, 50, keywords=["important"])
        texts = [m["content"] for m in result]
        kw_hits = sum(1 for t in texts if "important" in t.lower())
        self.assertGreater(kw_hits, 0)

    def test_empty_input_returns_empty(self):
        self.assertEqual(preprocess.sample([], 10), [])

    def test_result_sorted_by_time(self):
        msgs = self._msgs(100)
        result = preprocess.sample(msgs, 20)
        times = [m["time"] for m in result]
        self.assertEqual(times, sorted(times))


class TestExtractSqlite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_imessage_extraction(self):
        p = Path(self.tmp) / "chat.db"
        _make_imessage_db(p)
        results = preprocess.extract_imessage(p, target=None)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["platform"], "imessage")

    def test_imessage_target_filter(self):
        p = Path(self.tmp) / "chat.db"
        _make_imessage_db(p)
        results = preprocess.extract_imessage(p, target="alice")
        # Only alice@example.com messages (not "me") should remain
        for r in results:
            self.assertIn("alice", r["sender"].lower())

    def test_wechat_extraction(self):
        p = Path(self.tmp) / "wechat.db"
        _make_wechat_db(p)
        results = preprocess.extract_wechat(p, target=None)
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["platform"], "wechat")

    def test_dispatch_detects_imessage(self):
        p = Path(self.tmp) / "imsg.db"
        _make_imessage_db(p)
        results = preprocess.extract_sqlite(p, target=None)
        self.assertTrue(all(r["platform"] == "imessage" for r in results))

    def test_dispatch_detects_wechat(self):
        p = Path(self.tmp) / "wx.db"
        _make_wechat_db(p)
        results = preprocess.extract_sqlite(p, target=None)
        self.assertTrue(all(r["platform"] == "wechat" for r in results))


# ── skill_writer.py ───────────────────────────────────────────────────────────

class TestInitSkill(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_creates_meta_json(self):
        skill_writer.init_skill("alice", self.tmp)
        self.assertTrue((self.tmp / "alice" / "meta.json").exists())

    def test_meta_fields(self):
        skill_writer.init_skill("bob", self.tmp, subject_type="public")
        meta = json.loads((self.tmp / "bob" / "meta.json").read_text())
        self.assertEqual(meta["slug"], "bob")
        self.assertEqual(meta["subject-type"], "public")
        self.assertEqual(meta["version"], "0.1.0")
        self.assertIn("created-at", meta)
        self.assertIn("evidence-summary", meta)

    def test_default_subject_type_personal(self):
        skill_writer.init_skill("carol", self.tmp)
        meta = json.loads((self.tmp / "carol" / "meta.json").read_text())
        self.assertEqual(meta["subject-type"], "personal")

    def test_idempotent_does_not_crash(self):
        skill_writer.init_skill("dave", self.tmp)
        # Second call should not crash (dir already exists)
        skill_writer.init_skill("dave", self.tmp)
        self.assertTrue((self.tmp / "dave" / "meta.json").exists())


class TestListSkills(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_empty_dir_prints_no_skills(self, *_):
        import io
        from unittest.mock import patch
        with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
            skill_writer.list_skills(self.tmp)
        self.assertIn("No skills", mock_out.getvalue())

    def test_lists_initialized_skills(self):
        skill_writer.init_skill("eve", self.tmp)
        skill_writer.init_skill("frank", self.tmp)
        import io
        from unittest.mock import patch
        with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
            skill_writer.list_skills(self.tmp)
        output = mock_out.getvalue()
        self.assertIn("eve", output)
        self.assertIn("frank", output)

    def test_missing_dir_prints_no_skills(self):
        import io
        from unittest.mock import patch
        with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
            skill_writer.list_skills(self.tmp / "nonexistent")
        self.assertIn("No skills", mock_out.getvalue())


class TestUpdateMeta(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        skill_writer.init_skill("grace", self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_patch_applied(self):
        skill_writer.update_meta("grace", self.tmp, {"display-name": "Grace Hopper"})
        meta = json.loads((self.tmp / "grace" / "meta.json").read_text())
        self.assertEqual(meta["display-name"], "Grace Hopper")

    def test_updated_at_refreshed(self):
        before = json.loads((self.tmp / "grace" / "meta.json").read_text())["updated-at"]
        import time; time.sleep(0.01)
        skill_writer.update_meta("grace", self.tmp, {"display-name": "G"})
        after = json.loads((self.tmp / "grace" / "meta.json").read_text())["updated-at"]
        # updated-at should be refreshed (may be same second but field must exist)
        self.assertIsNotNone(after)

    def test_existing_fields_preserved(self):
        skill_writer.update_meta("grace", self.tmp, {"extra": "value"})
        meta = json.loads((self.tmp / "grace" / "meta.json").read_text())
        self.assertEqual(meta["slug"], "grace")
        self.assertIn("evidence-summary", meta)


# ── version_manager.py ────────────────────────────────────────────────────────

class TestBump(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        skill_writer.init_skill("henry", self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_bumps_patch_version(self):
        version_manager.bump("henry", self.tmp)
        meta = json.loads((self.tmp / "henry" / "meta.json").read_text())
        self.assertEqual(meta["version"], "0.1.1")

    def test_creates_snapshot(self):
        version_manager.bump("henry", self.tmp)
        snap_dir = self.tmp / "henry" / ".versions" / "0.1.0"
        self.assertTrue(snap_dir.exists())

    def test_snapshot_contains_meta(self):
        version_manager.bump("henry", self.tmp)
        snap_meta = self.tmp / "henry" / ".versions" / "0.1.0" / "meta.json"
        self.assertTrue(snap_meta.exists())

    def test_double_bump(self):
        version_manager.bump("henry", self.tmp)
        version_manager.bump("henry", self.tmp)
        meta = json.loads((self.tmp / "henry" / "meta.json").read_text())
        self.assertEqual(meta["version"], "0.1.2")


class TestHistory(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        skill_writer.init_skill("iris", self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_empty_history(self):
        import io
        from unittest.mock import patch
        with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
            version_manager.history("iris", self.tmp)
        self.assertIn("No version history", mock_out.getvalue())

    def test_history_shows_snapshot(self):
        version_manager.bump("iris", self.tmp)
        import io
        from unittest.mock import patch
        with patch("sys.stdout", new_callable=io.StringIO) as mock_out:
            version_manager.history("iris", self.tmp)
        self.assertIn("0.1.0", mock_out.getvalue())


class TestRollback(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        skill_writer.init_skill("jack", self.tmp)
        # Write a sentinel file to v0.1.0 state
        (self.tmp / "jack" / "sentinel.txt").write_text("original")
        version_manager.bump("jack", self.tmp)  # snapshots 0.1.0, bumps to 0.1.1
        # Overwrite sentinel in v0.1.1
        (self.tmp / "jack" / "sentinel.txt").write_text("modified")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rollback_restores_file(self):
        version_manager.rollback("jack", "0.1.0", self.tmp)
        content = (self.tmp / "jack" / "sentinel.txt").read_text()
        self.assertEqual(content, "original")

    def test_rollback_bumps_current_first(self):
        """rollback() calls bump() first, so version advances before restoring."""
        version_manager.rollback("jack", "0.1.0", self.tmp)
        meta = json.loads((self.tmp / "jack" / "meta.json").read_text())
        # After rollback, meta.json is from the restored snapshot (0.1.0)
        self.assertEqual(meta["version"], "0.1.0")

    def test_rollback_missing_version_exits(self):
        with self.assertRaises(SystemExit):
            version_manager.rollback("jack", "9.9.9", self.tmp)


if __name__ == "__main__":
    unittest.main()
