#!/usr/bin/env python3
"""
Tests for persona-knowledge scripts.

All tests redirect OPENPERSONA_KNOWLEDGE to a tempdir to avoid polluting
~/.openpersona/. Fixtures are minimal (no mempalace required).
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / 'scripts'


def _make_dataset(knowledge_root: Path, slug: str = 'test-persona',
                  export_history: list | None = None) -> Path:
    """Create a minimal dataset fixture (no mempalace)."""
    dataset_dir = knowledge_root / slug
    dataset_dir.mkdir(parents=True)

    meta = {
        'schema_version': 1,
        'slug': slug,
        'name': 'Test Persona',
        'created_at': '2026-01-01T00:00:00+00:00',
        'framework': 'persona-knowledge',
        'version': '0.1.0',
        'stats': {'sources': 0, 'total_messages': 0, 'assistant_turns': 0,
                  'kg_entities': 0, 'kg_relationships': 0, 'wiki_pages': 0},
        'export_history': export_history if export_history is not None else [],
    }
    (dataset_dir / 'dataset.json').write_text(json.dumps(meta, indent=2) + '\n')

    (dataset_dir / 'sources').mkdir()
    (dataset_dir / 'wiki').mkdir()
    return dataset_dir


def _add_source(dataset_dir: Path, filename: str, content: str) -> None:
    (dataset_dir / 'sources' / filename).write_text(content)


def _add_wiki_page(dataset_dir: Path, page: str, section_content: str) -> None:
    text = f'# {page.title()}\n\n> Scope.\n\n## Content\n\n{section_content}\n\n## Sources\n\n## See also\n'
    (dataset_dir / 'wiki' / f'{page}.md').write_text(text)


def _run_export(knowledge_root: Path, slug: str, output_dir: Path,
                extra_args: list[str] | None = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env['OPENPERSONA_KNOWLEDGE'] = str(knowledge_root)
    cmd = [sys.executable, str(SCRIPTS / 'export_training.py'),
           '--slug', slug, '--output', str(output_dir)]
    if extra_args:
        cmd += extra_args
    return subprocess.run(cmd, env=env, capture_output=True, text=True)


# ── TestExportVersionAutoIncrement ────────────────────────────────────────────

class TestExportVersionAutoIncrement(unittest.TestCase):
    """First export → v1; second export → v2; export_history has 2 entries."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'I am a test persona.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_first_export_gets_v1(self):
        out = self.tmp / 'out1'
        r = _run_export(self.knowledge_root, 'test-persona', out)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / 'metadata.json').read_text())
        self.assertEqual(meta['export_version'], 'v1')

    def test_second_export_gets_v2(self):
        _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out1')
        out2 = self.tmp / 'out2'
        r = _run_export(self.knowledge_root, 'test-persona', out2)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out2 / 'metadata.json').read_text())
        self.assertEqual(meta['export_version'], 'v2')

    def test_export_history_has_two_entries(self):
        _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out1')
        _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out2')
        ds_meta = json.loads((self.dataset_dir / 'dataset.json').read_text())
        self.assertEqual(len(ds_meta['export_history']), 2)
        self.assertEqual(ds_meta['export_history'][0]['version'], 'v1')
        self.assertEqual(ds_meta['export_history'][1]['version'], 'v2')


# ── TestExportHashFormat ───────────────────────────────────────────────────────

class TestExportHashFormat(unittest.TestCase):
    """export_hash must be sha256: + 16 lowercase hex chars."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        _make_dataset(self.knowledge_root)
        _add_wiki_page(self.knowledge_root / 'test-persona', 'identity', 'I am a test persona.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_export_hash_format(self):
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'test-persona', out)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / 'metadata.json').read_text())
        h = meta.get('export_hash', '')
        self.assertTrue(h.startswith('sha256:'), f'export_hash must start with sha256: — got: {h}')
        hex_part = h[len('sha256:'):]
        self.assertEqual(len(hex_part), 16, f'hex suffix must be 16 chars — got: {hex_part!r}')
        self.assertTrue(all(c in '0123456789abcdef' for c in hex_part),
                        f'hex suffix must be lowercase hex — got: {hex_part!r}')


# ── TestExportHashChangesWithContent ──────────────────────────────────────────

class TestExportHashChangesWithContent(unittest.TestCase):
    """Two datasets with different wiki content must produce different export_hash."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_different_content_different_hash(self):
        ds_a = _make_dataset(self.knowledge_root, slug='persona-a')
        _add_wiki_page(ds_a, 'identity', 'I love hiking in the mountains every weekend.')

        ds_b = _make_dataset(self.knowledge_root, slug='persona-b')
        _add_wiki_page(ds_b, 'identity', 'I am a software engineer who loves coffee.')

        out_a = self.tmp / 'out_a'
        out_b = self.tmp / 'out_b'
        _run_export(self.knowledge_root, 'persona-a', out_a)
        _run_export(self.knowledge_root, 'persona-b', out_b)

        hash_a = json.loads((out_a / 'metadata.json').read_text())['export_hash']
        hash_b = json.loads((out_b / 'metadata.json').read_text())['export_hash']
        self.assertNotEqual(hash_a, hash_b,
                            'Different wiki content must produce different export_hash')


# ── TestSourceSnapshotKeys ────────────────────────────────────────────────────

class TestSourceSnapshotKeys(unittest.TestCase):
    """source_snapshot keys must match the source files present in sources/."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_source(self.dataset_dir, 'chat.jsonl',
                    json.dumps({'role': 'assistant', 'content': 'hello'}) + '\n')
        _add_source(self.dataset_dir, 'notes.txt', 'some notes\n')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_source_snapshot_keys_match_files(self):
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'test-persona', out)
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / 'metadata.json').read_text())
        snapshot = meta.get('source_snapshot', {})
        expected_keys = {'chat.jsonl', 'notes.txt'}
        self.assertEqual(set(snapshot.keys()), expected_keys,
                         f'source_snapshot keys mismatch: {set(snapshot.keys())} != {expected_keys}')

    def test_source_snapshot_values_are_hashes(self):
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'test-persona', out)
        meta = json.loads((out / 'metadata.json').read_text())
        for fname, h in meta.get('source_snapshot', {}).items():
            self.assertTrue(h.startswith('sha256:'),
                            f'{fname}: hash must start with sha256: — got: {h}')
            hex_part = h[len('sha256:'):]
            self.assertEqual(len(hex_part), 16,
                             f'{fname}: hex suffix must be 16 chars — got: {hex_part!r}')


# ── TestExportHistoryAppended ──────────────────────────────────────────────────

class TestExportHistoryAppended(unittest.TestCase):
    """dataset.json.export_history entry must contain required fields."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'Test identity content.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_history_entry_has_required_fields(self):
        r = _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out')
        self.assertEqual(r.returncode, 0, r.stderr)
        ds_meta = json.loads((self.dataset_dir / 'dataset.json').read_text())
        self.assertEqual(len(ds_meta['export_history']), 1)
        entry = ds_meta['export_history'][0]
        for field in ('version', 'exported_at', 'export_hash', 'conversation_count', 'export_params'):
            self.assertIn(field, entry, f'Missing field in export_history entry: {field}')
        self.assertEqual(entry['version'], 'v1')
        self.assertIn('source_snapshot', entry)


# ── TestListOutput ─────────────────────────────────────────────────────────────

class TestListOutput(unittest.TestCase):
    """--list must print version, hash prefix, and turn count."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'I am a list test persona.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_list_empty_prints_no_exports(self):
        env = os.environ.copy()
        env['OPENPERSONA_KNOWLEDGE'] = str(self.knowledge_root)
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / 'export_training.py'),
             '--slug', 'test-persona', '--list'],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('No exports yet', r.stdout)

    def test_list_after_export_shows_version_and_hash(self):
        _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out')
        env = os.environ.copy()
        env['OPENPERSONA_KNOWLEDGE'] = str(self.knowledge_root)
        r = subprocess.run(
            [sys.executable, str(SCRIPTS / 'export_training.py'),
             '--slug', 'test-persona', '--list'],
            env=env, capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('v1', r.stdout)
        self.assertIn('sha256:', r.stdout)


# ── TestBackwardCompatNoExportHistory ─────────────────────────────────────────

class TestBackwardCompatNoExportHistory(unittest.TestCase):
    """Old dataset.json without export_history must not raise, field added automatically."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()

        # Simulate old dataset.json without export_history
        dataset_dir = self.knowledge_root / 'old-persona'
        dataset_dir.mkdir()
        old_meta = {
            'schema_version': 1,
            'slug': 'old-persona',
            'name': 'Old Persona',
            'created_at': '2025-01-01T00:00:00+00:00',
            'framework': 'persona-knowledge',
            'version': '0.1.0',
            'stats': {'sources': 0, 'total_messages': 0},
            # no export_history key
        }
        (dataset_dir / 'dataset.json').write_text(json.dumps(old_meta, indent=2) + '\n')
        (dataset_dir / 'sources').mkdir()
        (dataset_dir / 'wiki').mkdir()
        _add_wiki_page(dataset_dir, 'identity', 'Old persona identity.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_no_crash_on_missing_export_history(self):
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'old-persona', out)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_export_history_created_automatically(self):
        _run_export(self.knowledge_root, 'old-persona', self.tmp / 'out')
        ds_meta = json.loads(
            (self.knowledge_root / 'old-persona' / 'dataset.json').read_text()
        )
        self.assertIn('export_history', ds_meta,
                      'export_history must be created for old dataset.json')
        self.assertEqual(len(ds_meta['export_history']), 1)

    def test_version_starts_at_v1_for_old_dataset(self):
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'old-persona', out)
        meta = json.loads((out / 'metadata.json').read_text())
        self.assertEqual(meta['export_version'], 'v1')


# ── TestProbesJsonGenerated ────────────────────────────────────────────────────

class TestProbesJsonGenerated(unittest.TestCase):
    """export_training.py must write probes.json alongside metadata.json."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root, slug='probe-persona')
        _add_wiki_page(self.dataset_dir, 'identity', 'An adventurous explorer.')
        _add_wiki_page(self.dataset_dir, 'voice', 'Warm and curious.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_probes_json_created(self):
        """probes.json must exist in output directory after export."""
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'probe-persona', out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((out / 'probes.json').exists(), 'probes.json not generated')

    def test_probes_json_schema(self):
        """probes.json must contain version, slug, and probes list."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'probe-persona', out)
        data = json.loads((out / 'probes.json').read_text())
        self.assertIn('version', data)
        self.assertIn('slug',    data)
        self.assertIn('probes',  data)
        self.assertIsInstance(data['probes'], list)

    def test_name_probe_always_present(self):
        """The name probe (id='name') must always appear with the persona name as keyword."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'probe-persona', out)
        data = json.loads((out / 'probes.json').read_text())
        probe_ids = [p['id'] for p in data['probes']]
        self.assertIn('name', probe_ids)
        name_probe = next(p for p in data['probes'] if p['id'] == 'name')
        self.assertIn('Test Persona', name_probe['keywords'])

    def test_identity_probe_generated_when_wiki_present(self):
        """Identity probe appears when wiki/identity.md has a Content section."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'probe-persona', out)
        data = json.loads((out / 'probes.json').read_text())
        probe_ids = [p['id'] for p in data['probes']]
        self.assertIn('identity', probe_ids)

    def test_probe_fields_complete(self):
        """Each probe must have id, question, keywords (list), and weight (> 0)."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'probe-persona', out)
        data = json.loads((out / 'probes.json').read_text())
        for probe in data['probes']:
            self.assertIn('id',       probe)
            self.assertIn('question', probe)
            self.assertIn('keywords', probe)
            self.assertIn('weight',   probe)
            self.assertIsInstance(probe['keywords'], list)
            self.assertGreater(probe['weight'], 0)

    def test_probes_json_not_in_export_hash(self):
        """probes.json is generated after export_hash is computed — hash must be stable
        across two runs that differ only in probe extraction timing."""
        out1 = self.tmp / 'out1'
        out2 = self.tmp / 'out2'
        _run_export(self.knowledge_root, 'probe-persona', out1)
        _run_export(self.knowledge_root, 'probe-persona', out2)
        h1 = json.loads((out1 / 'metadata.json').read_text())['export_hash']
        h2 = json.loads((out2 / 'metadata.json').read_text())['export_hash']
        # Hash must be deterministic for identical source content
        self.assertEqual(h1, h2, 'export_hash must be stable across repeated exports of the same content')


# ── TestExportHashDeterminism ──────────────────────────────────────────────────

class TestExportHashDeterminism(unittest.TestCase):
    """Same source content must produce the same export_hash on repeated exports."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'Deterministic persona content.')
        _add_source(self.dataset_dir, 'notes.txt', 'Stable source content.\n')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_same_content_same_hash(self):
        """Two exports of the same unmodified dataset must produce identical hashes."""
        out1 = self.tmp / 'out1'
        out2 = self.tmp / 'out2'
        _run_export(self.knowledge_root, 'test-persona', out1)
        _run_export(self.knowledge_root, 'test-persona', out2)
        h1 = json.loads((out1 / 'metadata.json').read_text())['export_hash']
        h2 = json.loads((out2 / 'metadata.json').read_text())['export_hash']
        self.assertEqual(h1, h2, 'Repeated export of identical content must yield the same hash')

    def test_changed_content_changes_hash(self):
        """Modifying a source file between exports must change export_hash."""
        out1 = self.tmp / 'out1'
        _run_export(self.knowledge_root, 'test-persona', out1)
        h1 = json.loads((out1 / 'metadata.json').read_text())['export_hash']

        # Mutate wiki content between exports
        _add_wiki_page(self.dataset_dir, 'identity', 'Completely different content now.')
        out2 = self.tmp / 'out2'
        _run_export(self.knowledge_root, 'test-persona', out2)
        h2 = json.loads((out2 / 'metadata.json').read_text())['export_hash']

        self.assertNotEqual(h1, h2, 'Mutated content must produce a different export_hash')


# ── TestExplicitVersion ────────────────────────────────────────────────────────

class TestExplicitVersion(unittest.TestCase):
    """--version flag must override auto-increment and be recorded in output."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'Explicit version persona.')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_explicit_version_written_to_metadata(self):
        """--version v5 must appear in metadata.json export_version."""
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'test-persona', out, extra_args=['--version', 'v5'])
        self.assertEqual(r.returncode, 0, r.stderr)
        meta = json.loads((out / 'metadata.json').read_text())
        self.assertEqual(meta['export_version'], 'v5')

    def test_explicit_version_written_to_history(self):
        """--version v5 must appear in the export_history entry in dataset.json."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'test-persona', out, extra_args=['--version', 'v5'])
        ds = json.loads((self.dataset_dir / 'dataset.json').read_text())
        self.assertEqual(len(ds['export_history']), 1)
        self.assertEqual(ds['export_history'][0]['version'], 'v5')

    def test_auto_increment_continues_from_explicit_version(self):
        """After --version v5, the next auto-incremented export must be v6.
        Auto-increment parses the last history entry's version number and adds 1,
        so explicit version labels are respected as the new baseline."""
        _run_export(self.knowledge_root, 'test-persona', self.tmp / 'out1',
                    extra_args=['--version', 'v5'])
        out2 = self.tmp / 'out2'
        _run_export(self.knowledge_root, 'test-persona', out2)
        meta = json.loads((out2 / 'metadata.json').read_text())
        self.assertEqual(meta['export_version'], 'v6')


# ── TestWikiOnlyFlag ───────────────────────────────────────────────────────────

class TestWikiOnlyFlag(unittest.TestCase):
    """--wiki-only must skip raw source copy but still produce conversations and metadata."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.knowledge_root = self.tmp / 'knowledge'
        self.knowledge_root.mkdir()
        self.dataset_dir = _make_dataset(self.knowledge_root)
        _add_wiki_page(self.dataset_dir, 'identity', 'Wiki-only persona identity.')
        _add_source(self.dataset_dir, 'chat.jsonl',
                    json.dumps({'role': 'assistant', 'content': 'hi'}) + '\n')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_wiki_only_succeeds(self):
        """--wiki-only must exit 0."""
        out = self.tmp / 'out'
        r = _run_export(self.knowledge_root, 'test-persona', out, extra_args=['--wiki-only'])
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_wiki_only_produces_metadata(self):
        """--wiki-only must still write metadata.json."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'test-persona', out, extra_args=['--wiki-only'])
        self.assertTrue((out / 'metadata.json').exists())

    def test_wiki_only_skips_raw_directory(self):
        """--wiki-only must not copy sources/ into raw/."""
        out = self.tmp / 'out'
        _run_export(self.knowledge_root, 'test-persona', out, extra_args=['--wiki-only'])
        self.assertFalse((out / 'raw').exists(),
                         'raw/ must not be created when --wiki-only is set')


if __name__ == '__main__':
    unittest.main()
