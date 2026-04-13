#!/usr/bin/env python3
"""
Unified ingestion pipeline for persona-knowledge.

Dispatches to the appropriate source adapter, runs PII scanning,
content-hash deduplication, writes to MemPalace, extracts KG triples,
and backs up raw data to sources/.

Usage:
    python scripts/ingest.py --slug sam --source ~/whatsapp-export.txt --persona-name "Samantha"
    python scripts/ingest.py --slug sam --source ~/twitter-archive/ --persona-name "Sam"
    python scripts/ingest.py --slug sam --source data.jsonl --adapter universal
    python scripts/ingest.py --slug sam --source gbrain-export.json --entity "Samantha"
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve adapters relative to this script's parent directory
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SKILL_DIR))

from adapters import detect_adapter

DATASETS_ROOT = Path(os.environ.get(
    'OPENPERSONA_DATASETS',
    Path.home() / '.openpersona' / 'datasets'
))

# PII patterns (conservative — flag, don't block)
PII_PATTERNS = [
    (re.compile(r'\b\d{3}-\d{2}-\d{4}\b'), 'SSN'),
    (re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'), 'credit_card'),
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'), 'email'),
    (re.compile(r'\b(?:password|passwd|pwd)\s*[:=]\s*\S+', re.IGNORECASE), 'password'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), 'phone'),
]


def main():
    parser = argparse.ArgumentParser(description='Ingest data into a persona dataset')
    parser.add_argument('--slug', required=True, help='Persona dataset slug')
    parser.add_argument('--source', help='Path to source file or directory')
    parser.add_argument('--adapter', help='Force specific adapter (universal/chat_export/social)')
    parser.add_argument('--persona-name', default='', help='Persona display name (for role detection)')
    parser.add_argument('--since', help='Only ingest data after this date (ISO 8601)')
    parser.add_argument('--entity', help='Entity name for GBrain JSON export')
    parser.add_argument('--dry-run', action='store_true', help='Parse and report without writing')

    args = parser.parse_args()

    dataset_dir = DATASETS_ROOT / args.slug
    if not dataset_dir.exists():
        print(f'❌ Dataset not found: {dataset_dir}', file=sys.stderr)
        print(f'   Run: python scripts/init_dataset.py --slug {args.slug} --name "..."', file=sys.stderr)
        sys.exit(1)

    # --- Resolve adapter ---
    adapter_name = args.adapter
    if not adapter_name and args.source:
        adapter_name = detect_adapter(args.source)
    if not adapter_name:
        print('❌ Cannot detect adapter. Specify --adapter explicitly.', file=sys.stderr)
        sys.exit(1)

    # --- Load adapter and parse ---
    adapter_module = _load_adapter(adapter_name)
    print(f'📥 Ingesting via [{adapter_name}] adapter...')

    parse_kwargs = {
        'persona_name': args.persona_name,
        'since': args.since,
    }
    if args.entity:
        parse_kwargs['entity'] = args.entity

    source_path = args.source or ''
    messages = adapter_module.parse(source_path, **parse_kwargs)

    if not messages:
        print('⚠️  No messages parsed from source.')
        return

    print(f'   Parsed: {len(messages)} messages')

    # --- PII scan ---
    pii_flags = scan_pii(messages)
    if pii_flags:
        print(f'   ⚠️  PII detected: {", ".join(sorted(pii_flags))}')
    else:
        print(f'   PII: none detected')

    # --- Dedup ---
    existing_hashes = _load_existing_hashes(dataset_dir)
    new_messages, dup_count = dedup_messages(messages, existing_hashes)
    if dup_count:
        print(f'   Dedup: {dup_count} duplicates skipped')
    print(f'   New: {len(new_messages)} messages to ingest')

    if not new_messages:
        print('✅ Nothing new to ingest.')
        return

    if args.dry_run:
        _report_dry_run(new_messages, adapter_name, pii_flags)
        return

    # --- Write sources/ backup ---
    source_filename = _write_sources_backup(dataset_dir, new_messages, adapter_name, args.source, pii_flags)

    # --- Store in MemPalace ---
    _store_in_mempalace(dataset_dir, args.slug, new_messages)

    # --- Extract KG triples ---
    kg_stats = _extract_kg_triples(dataset_dir, new_messages)

    # --- Update dataset.json stats ---
    _update_stats(dataset_dir, new_messages, kg_stats)

    # --- Report ---
    assistant_turns = sum(1 for m in new_messages if m['role'] == 'assistant')
    print(f'\n✅ {source_filename} → {len(new_messages)} messages ({assistant_turns} assistant turns)')
    pii_str = ', '.join(sorted(pii_flags)) if pii_flags else 'none detected'
    print(f'   PII: {pii_str}')
    print(f'   KG: +{kg_stats["entities"]} entities, +{kg_stats["relationships"]} relationships')
    print(f'   → sources/{source_filename}')


def _load_adapter(name: str):
    """Dynamically import an adapter module."""
    import importlib
    try:
        return importlib.import_module(f'adapters.{name}')
    except ImportError as e:
        print(f'❌ Adapter not found: {name} ({e})', file=sys.stderr)
        sys.exit(1)


# --- PII Scanning ---

def scan_pii(messages: list[dict]) -> set[str]:
    flags = set()
    for msg in messages:
        content = msg.get('content', '')
        for pattern, label in PII_PATTERNS:
            if pattern.search(content):
                flags.add(label)
    return flags


# --- Deduplication ---

def _content_hash(msg: dict) -> str:
    key = f'{msg["role"]}:{msg["content"]}'
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _load_existing_hashes(dataset_dir: Path) -> set[str]:
    hashes = set()
    sources_dir = dataset_dir / 'sources'
    for jsonl_file in sources_dir.glob('*.jsonl'):
        for line in jsonl_file.open():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                hashes.add(_content_hash(obj))
            except (json.JSONDecodeError, KeyError):
                continue
    return hashes


def dedup_messages(messages: list[dict], existing_hashes: set[str]) -> tuple[list[dict], int]:
    seen = set(existing_hashes)
    new_messages = []
    dup_count = 0

    for msg in messages:
        h = _content_hash(msg)
        if h in seen:
            dup_count += 1
            continue
        seen.add(h)
        new_messages.append(msg)

    return new_messages, dup_count


# --- Sources backup ---

def _write_sources_backup(dataset_dir: Path, messages: list[dict], adapter_name: str,
                          source_path: str | None, pii_flags: set[str]) -> str:
    sources_dir = dataset_dir / 'sources'
    sources_dir.mkdir(exist_ok=True)

    # Generate filename from source
    if source_path:
        base = Path(source_path).stem.lower()
        base = re.sub(r'[^a-z0-9_-]', '-', base)
    else:
        base = adapter_name

    ts = datetime.now().strftime('%Y%m%d')
    filename = f'{base}-{ts}.jsonl'

    # Avoid collision
    counter = 1
    while (sources_dir / filename).exists():
        filename = f'{base}-{ts}-{counter}.jsonl'
        counter += 1

    # Write JSONL
    with open(sources_dir / filename, 'w') as f:
        for msg in messages:
            f.write(json.dumps(msg, ensure_ascii=False) + '\n')

    # Update source index
    index_path = sources_dir / '.source-index.json'
    if index_path.exists():
        index = json.loads(index_path.read_text())
    else:
        index = {'files': [], 'last_updated': ''}

    index['files'].append({
        'filename': filename,
        'adapter': adapter_name,
        'source': source_path or adapter_name,
        'imported_at': datetime.now(timezone.utc).isoformat(),
        'lines': len(messages),
        'assistant_turns': sum(1 for m in messages if m['role'] == 'assistant'),
        'content_hash': hashlib.sha256(
            ''.join(m['content'] for m in messages).encode()
        ).hexdigest()[:16],
        'pii_flags': sorted(pii_flags) if pii_flags else None,
    })
    index['last_updated'] = datetime.now(timezone.utc).isoformat()

    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n')
    return filename


# --- MemPalace storage ---

HALL_ROUTING = {
    'obsidian': 'hall_facts',
    'markdown': 'hall_facts',
    'gbrain-export': 'hall_facts',
    'gbrain': 'hall_facts',
    'whatsapp': 'hall_voice',
    'telegram': 'hall_voice',
    'signal': 'hall_voice',
    'imessage': 'hall_voice',
    'twitter': 'hall_voice',
    'twitter-dm': 'hall_voice',
    'instagram': 'hall_voice',
    'instagram-dm': 'hall_voice',
    'csv': 'hall_facts',
    'plaintext': 'hall_facts',
    'pdf': 'hall_facts',
    'jsonl': 'hall_voice',
}


def _store_in_mempalace(dataset_dir: Path, slug: str, messages: list[dict]) -> int:
    palace_dir = dataset_dir / '.mempalace' / 'palace'

    try:
        from mempalace import MemPalace
    except ImportError:
        print('   ⚠️  mempalace not installed — skipping vector storage', file=sys.stderr)
        return 0

    try:
        mp = MemPalace(palace_path=str(palace_dir))
    except Exception as e:
        print(f'   ⚠️  MemPalace init failed: {e} — skipping', file=sys.stderr)
        return 0

    stored = 0
    for msg in messages:
        source_type = msg.get('source_type', msg.get('metadata', {}).get('type', ''))
        hall = HALL_ROUTING.get(source_type, 'hall_voice')

        try:
            mp.store(
                content=msg['content'],
                wing=slug,
                hall=hall,
                metadata={
                    'role': msg['role'],
                    'timestamp': msg.get('timestamp'),
                    'source_file': msg.get('source_file'),
                    'source_type': source_type,
                }
            )
            stored += 1
        except Exception as e:
            print(f'   ⚠️  MemPalace store failed: {e}', file=sys.stderr)

    print(f'   MemPalace: {stored}/{len(messages)} stored')
    return stored


# --- Knowledge Graph extraction ---

# Simple entity/relationship patterns for automatic extraction
_PERSON_PATTERN = re.compile(
    r'\b(?:[Mm]y (?:friend|brother|sister|mom|dad|mother|father|wife|husband|partner|boss|colleague|coworker)|'
    r'(?:with|told|asked|met|called|texted|emailed)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b'
)

_RELATIONSHIP_KEYWORDS = {
    'friend': 'friend_of',
    'brother': 'sibling_of',
    'sister': 'sibling_of',
    'mom': 'parent_of',
    'mother': 'parent_of',
    'dad': 'parent_of',
    'father': 'parent_of',
    'wife': 'spouse_of',
    'husband': 'spouse_of',
    'partner': 'partner_of',
    'boss': 'reports_to',
    'colleague': 'colleague_of',
    'coworker': 'colleague_of',
}

_RELATIONSHIP_PATTERNS = tuple(
    (re.compile(rf'\b[Mm]y\s+{kw}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b'), rel)
    for kw, rel in _RELATIONSHIP_KEYWORDS.items()
)


def _extract_kg_triples(dataset_dir: Path, messages: list[dict]) -> dict:
    """Extract entities and relationships from message content."""
    slug = dataset_dir.name
    entities = set()
    relationships = []

    for msg in messages:
        if msg['role'] != 'assistant':
            continue

        content = msg['content']

        for pattern, rel_type in _RELATIONSHIP_PATTERNS:
            for match in pattern.finditer(content):
                name = match.group(1)
                entities.add(name)
                relationships.append({
                    'from': name,
                    'to': slug,
                    'type': rel_type,
                    'confidence': 'extracted',
                    'timestamp': msg.get('timestamp'),
                    'source': msg.get('source_file'),
                })

        # General person mentions
        for match in _PERSON_PATTERN.finditer(content):
            entities.add(match.group(1))

    # Write to KG if available
    palace_dir = dataset_dir / '.mempalace' / 'palace'
    _write_kg(palace_dir, entities, relationships)

    return {
        'entities': len(entities),
        'relationships': len(relationships),
    }


def _write_kg(palace_dir: Path, entities: set[str], relationships: list[dict]):
    """Write extracted entities/relationships to the Knowledge Graph."""
    try:
        from mempalace.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph(palace_path=str(palace_dir))

        for entity in entities:
            try:
                kg.create_entity(entity, entity_type='person')
            except Exception:
                pass

        for rel in relationships:
            try:
                kg.create_relationship(
                    from_entity=rel['from'],
                    to_entity=rel.get('to', ''),
                    relationship_type=rel['type'],
                    metadata={
                        'timestamp': rel.get('timestamp'),
                        'source': rel.get('source'),
                        'confidence': rel.get('confidence', 'extracted'),
                    },
                )
            except Exception:
                pass

    except ImportError:
        # Store as fallback JSON
        kg_file = palace_dir.parent / 'kg-pending.json'
        pending = []
        if kg_file.exists():
            try:
                pending = json.loads(kg_file.read_text())
            except json.JSONDecodeError:
                pass

        for entity in entities:
            pending.append({'_entry': 'entity', 'name': entity, 'entity_type': 'person'})
        for rel in relationships:
            pending.append({'_entry': 'relationship', **rel})

        kg_file.write_text(json.dumps(pending, indent=2, ensure_ascii=False) + '\n')


# --- Stats update ---

def _update_stats(dataset_dir: Path, messages: list[dict], kg_stats: dict):
    meta_path = dataset_dir / 'dataset.json'
    meta = json.loads(meta_path.read_text())

    stats = meta.setdefault('stats', {})
    stats['sources'] = stats.get('sources', 0) + 1
    stats['total_messages'] = stats.get('total_messages', 0) + len(messages)
    stats['assistant_turns'] = stats.get('assistant_turns', 0) + sum(
        1 for m in messages if m['role'] == 'assistant'
    )
    stats['kg_entities'] = stats.get('kg_entities', 0) + kg_stats['entities']
    stats['kg_relationships'] = stats.get('kg_relationships', 0) + kg_stats['relationships']

    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')


# --- Dry run report ---

def _report_dry_run(messages: list[dict], adapter_name: str, pii_flags: set[str]):
    assistant = sum(1 for m in messages if m['role'] == 'assistant')
    user = sum(1 for m in messages if m['role'] == 'user')
    sources = set(m.get('source_type', '') for m in messages)

    print(f'\n📋 Dry run report:')
    print(f'   Adapter: {adapter_name}')
    print(f'   Messages: {len(messages)} ({assistant} assistant, {user} user)')
    print(f'   Source types: {", ".join(sources)}')
    print(f'   PII flags: {", ".join(sorted(pii_flags)) if pii_flags else "none"}')

    if messages:
        print(f'\n   Sample (first 3):')
        for msg in messages[:3]:
            content_preview = msg['content'][:80].replace('\n', ' ')
            print(f'     [{msg["role"]}] {content_preview}...')

    print(f'\n   ℹ️  Remove --dry-run to write to dataset.')


if __name__ == '__main__':
    main()
