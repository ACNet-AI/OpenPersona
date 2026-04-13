#!/usr/bin/env python3
"""
Initialize a persona dataset with MemPalace-backed storage,
Knowledge Graph, wiki structure, and source backup directory.

Usage:
    python scripts/init_dataset.py --slug sam --name "Samantha"
    python scripts/init_dataset.py --slug sam --stats
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DATASETS_ROOT = Path(os.environ.get(
    'OPENPERSONA_DATASETS',
    Path.home() / '.openpersona' / 'datasets'
))

HALLS = [
    ('hall_facts', 'Identity — background, career, education, demographics'),
    ('hall_events', 'Memory — key events, turning points, milestones'),
    ('hall_preferences', 'Personality — values, preferences, boundaries, opinions'),
    ('hall_discoveries', 'Procedure — mental models, decision heuristics, problem-solving'),
    ('hall_voice', 'Interaction — vocabulary, rhythm, humor, emotional temperature'),
]

WIKI_PAGES = [
    '_schema.md',
    'identity.md',
    'voice.md',
    'values.md',
    'thinking.md',
    'relationships.md',
    'timeline.md',
    '_contradictions.md',
    '_changelog.md',
    '_evidence.md',
]


def dataset_path(slug: str) -> Path:
    return DATASETS_ROOT / slug


def init_dataset(slug: str, name: str) -> Path:
    root = dataset_path(slug)
    if root.exists():
        print(f'⚠️  Dataset already exists: {root}', file=sys.stderr)
        print('   Use --stats to inspect, or delete manually to re-init.', file=sys.stderr)
        sys.exit(1)

    root.mkdir(parents=True)

    # --- dataset.json ---
    meta = {
        'schema_version': 1,
        'slug': slug,
        'name': name,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'framework': 'persona-knowledge',
        'version': '0.1.0',
        'stats': {
            'sources': 0,
            'total_messages': 0,
            'assistant_turns': 0,
            'kg_entities': 0,
            'kg_relationships': 0,
            'wiki_pages': len(WIKI_PAGES),
        },
        'export_history': [],
    }
    (root / 'dataset.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')

    # --- sources/ ---
    sources_dir = root / 'sources'
    sources_dir.mkdir()
    source_index = {'files': [], 'last_updated': meta['created_at']}
    (sources_dir / '.source-index.json').write_text(
        json.dumps(source_index, indent=2, ensure_ascii=False) + '\n'
    )

    # --- MemPalace initialization ---
    palace_dir = root / '.mempalace'
    init_mempalace(palace_dir, slug)

    # --- wiki/ ---
    wiki_dir = root / 'wiki'
    wiki_dir.mkdir()
    init_wiki(wiki_dir, slug, name)

    print(f'✅ Dataset initialized: {root}')
    print(f'   Slug: {slug}')
    print(f'   Name: {name}')
    print(f'   MemPalace: {palace_dir}')
    print(f'   Wiki: {wiki_dir} ({len(WIKI_PAGES)} pages)')
    print(f'   Sources: {sources_dir}')
    return root


def init_mempalace(palace_dir: Path, slug: str):
    """Initialize MemPalace with wing + halls for the persona."""
    try:
        from mempalace import MemPalace
    except ImportError:
        print('⚠️  mempalace not installed — creating directory structure only.', file=sys.stderr)
        print('   Install: pip install mempalace', file=sys.stderr)
        palace_dir.mkdir(parents=True, exist_ok=True)
        _write_mempalace_stub(palace_dir, slug)
        return

    palace_path = str(palace_dir / 'palace')
    mp = MemPalace(palace_path=palace_path)

    wing_id = mp.create_wing(slug, f'Persona dataset: {slug}')
    print(f'   MemPalace wing: {wing_id}')

    for hall_name, hall_desc in HALLS:
        hall_id = mp.create_hall(wing_id, hall_name, hall_desc)
        print(f'   MemPalace hall: {hall_name} → {hall_id}')

    # Initialize Knowledge Graph
    try:
        from mempalace.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph(palace_path=palace_path)
        kg.create_entity(slug, entity_type='persona', metadata={'name': slug})
        print(f'   Knowledge Graph: initialized (root entity: {slug})')
    except (ImportError, AttributeError):
        print('   Knowledge Graph: skipped (requires mempalace >= 3.1.0)', file=sys.stderr)


def _write_mempalace_stub(palace_dir: Path, slug: str):
    """Write a config stub when MemPalace is not installed."""
    config = {
        'slug': slug,
        'wing': slug,
        'halls': {h[0]: h[1] for h in HALLS},
        'status': 'stub — install mempalace to activate',
    }
    (palace_dir / 'config.json').write_text(
        json.dumps(config, indent=2, ensure_ascii=False) + '\n'
    )


def init_wiki(wiki_dir: Path, slug: str, name: str):
    """Create initial wiki pages with templates."""
    schema_path = Path(__file__).resolve().parent.parent / 'references' / 'wiki-schema.md'
    if schema_path.exists():
        (wiki_dir / '_schema.md').write_text(schema_path.read_text())
    else:
        (wiki_dir / '_schema.md').write_text(_default_schema())

    pages = {
        'identity.md': f'# Identity\n\n> Core identity facts about {name}.\n\n## Content\n\n(awaiting data ingestion)\n\n## Sources\n\n## See also\n\n- [[voice]]\n- [[values]]\n',
        'voice.md': f'# Voice\n\n> How {name} communicates: vocabulary, rhythm, tone.\n\n## Content\n\n(awaiting data ingestion)\n\n## Sources\n\n## See also\n\n- [[identity]]\n- [[thinking]]\n',
        'values.md': f'# Values\n\n> Core values, preferences, and boundaries of {name}.\n\n## Content\n\n(awaiting data ingestion)\n\n## Sources\n\n## See also\n\n- [[identity]]\n- [[thinking]]\n',
        'thinking.md': f'# Thinking\n\n> Mental models, decision-making patterns, heuristics.\n\n## Content\n\n(awaiting data ingestion)\n\n## Sources\n\n## See also\n\n- [[values]]\n- [[voice]]\n',
        'relationships.md': f'# Relationships\n\n> Key relationships and social dynamics (generated from Knowledge Graph).\n\n## Content\n\n(awaiting KG data)\n\n## Sources\n\n## See also\n\n- [[timeline]]\n- [[identity]]\n',
        'timeline.md': f'# Timeline\n\n> Chronological events and milestones (generated from Knowledge Graph).\n\n## Content\n\n(awaiting KG data)\n\n## Sources\n\n## See also\n\n- [[relationships]]\n- [[identity]]\n',
        '_contradictions.md': f'# Contradictions\n\n> Conflicting data points found across sources for {name}.\n\nNo contradictions recorded yet.\n',
        '_changelog.md': '# Changelog\n\n> Record of wiki updates.\n\n| Date | Pages | Action | Source |\n|------|-------|--------|--------|\n',
        '_evidence.md': '# Evidence Index\n\n> Evidence tag counts per page.\n\n| Page | L1 (direct) | L2 (reported) | L3 (inferred) | L4 (inspired) |\n|------|-------------|----------------|----------------|----------------|\n',
    }

    for filename, content in pages.items():
        (wiki_dir / filename).write_text(content)


def _default_schema():
    return '''# Wiki Schema

> Maintenance rules for the persona wiki. LLM agents should follow these rules when updating pages.

## Page structure

Every page follows this template:

```
# {Title}

> One-sentence scope.

## Content

{Structured content with [L?:source] evidence tags and [[backlinks]]}

## Sources

- {source_file}: {what was extracted} [L?]

## See also

- [[related_page]]
```

## Evidence levels

- `[L1:source]` — Direct quote, traceable to a specific message/document
- `[L2]` — Reported or paraphrased, can be verified from context
- `[L3:inferred]` — Reasonably inferred from multiple signals
- `[L4:inspired]` — Impression-based, subjective interpretation

## Update rules

1. Always add evidence tags when writing content
2. Add backlinks to related pages using `[[page]]` wikilink syntax
3. When new info contradicts existing content, add to `_contradictions.md` first
4. Record every update in `_changelog.md` with date, pages, action, source
5. Maintain the evidence counts in `_evidence.md`

## KG-driven pages

`relationships.md` and `timeline.md` are derived from the Knowledge Graph.
After KG updates, regenerate these pages from the graph data, then annotate.

## File naming

- Content pages: lowercase, no spaces (use hyphens)
- System pages: prefixed with `_`
- All pages: `.md` extension
'''


def show_stats(slug: str):
    root = dataset_path(slug)
    if not root.exists():
        print(f'❌ Dataset not found: {root}', file=sys.stderr)
        sys.exit(1)

    meta_path = root / 'dataset.json'
    if not meta_path.exists():
        print(f'❌ No dataset.json found in {root}', file=sys.stderr)
        sys.exit(1)

    meta = json.loads(meta_path.read_text())
    stats = meta.get('stats', {})

    print(f'📊 Dataset: {meta["name"]} ({meta["slug"]})')
    print(f'   Created: {meta["created_at"]}')
    print(f'   Sources: {stats.get("sources", 0)} files')
    print(f'   Messages: {stats.get("total_messages", 0)} total, {stats.get("assistant_turns", 0)} assistant turns')
    print(f'   KG: {stats.get("kg_entities", 0)} entities, {stats.get("kg_relationships", 0)} relationships')
    print(f'   Wiki: {stats.get("wiki_pages", 0)} pages')

    # Source index details
    source_index_path = root / 'sources' / '.source-index.json'
    if source_index_path.exists():
        si = json.loads(source_index_path.read_text())
        files = si.get('files', [])
        if files:
            print(f'\n   Sources detail:')
            for f in files:
                pii = f' ⚠️ PII:{f["pii_flags"]}' if f.get('pii_flags') else ''
                print(f'     - {f["filename"]}: {f.get("lines", "?")} lines{pii}')

    # Wiki page status
    wiki_dir = root / 'wiki'
    if wiki_dir.exists():
        populated = 0
        for md in wiki_dir.glob('*.md'):
            if md.name.startswith('_'):
                continue
            text = md.read_text()
            if '(awaiting' not in text and len(text.strip()) > 100:
                populated += 1
        total = sum(1 for md in wiki_dir.glob('*.md') if not md.name.startswith('_'))
        print(f'\n   Wiki: {populated}/{total} content pages populated')


def main():
    parser = argparse.ArgumentParser(
        description='Initialize or inspect a persona dataset'
    )
    parser.add_argument('--slug', required=True, help='Persona slug identifier')
    parser.add_argument('--name', help='Display name (required for init)')
    parser.add_argument('--stats', action='store_true', help='Show dataset statistics')

    args = parser.parse_args()

    if args.stats:
        show_stats(args.slug)
    else:
        if not args.name:
            parser.error('--name is required for initialization')
        init_dataset(args.slug, args.name)


if __name__ == '__main__':
    main()
