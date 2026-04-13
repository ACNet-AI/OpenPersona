#!/usr/bin/env python3
"""
Export a persona dataset to a training/ directory compatible with persona-model-trainer.

Output structure:
    training/
      raw/                    # copied from sources/ (authentic voice)
      conversations.jsonl     # distilled Q-A pairs from wiki + sources
      profile.md              # character sheet from wiki summary
      metadata.json           # aggregated stats + export version/hash
      probes.json             # keyword probes for role consistency eval

Usage:
    python scripts/export_training.py --slug sam --output training/
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DATASETS_ROOT = Path(os.environ.get(
    'OPENPERSONA_DATASETS',
    Path.home() / '.openpersona' / 'datasets'
))


def main():
    parser = argparse.ArgumentParser(description='Export dataset to training/ directory')
    parser.add_argument('--slug', required=True, help='Persona dataset slug')
    parser.add_argument('--output', default='training', help='Output directory (default: training/)')
    parser.add_argument('--wiki-only', action='store_true', help='Only generate conversations from wiki (skip raw copy)')
    parser.add_argument('--version', help='Export version tag (default: auto-increment v1/v2/...)')
    parser.add_argument('--list', action='store_true', help='List export history and exit')

    args = parser.parse_args()

    dataset_dir = DATASETS_ROOT / args.slug
    if not dataset_dir.exists():
        print(f'❌ Dataset not found: {dataset_dir}', file=sys.stderr)
        sys.exit(1)

    # --- --list: show export history and exit ---
    if args.list:
        _list_exports(dataset_dir)
        return

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    meta = json.loads((dataset_dir / 'dataset.json').read_text())
    slug = meta['slug']
    name = meta.get('name', slug)

    print(f'📦 Exporting dataset: {name} ({slug})')

    # --- 1. Copy raw sources ---
    raw_stats = {'files': 0, 'messages': 0}
    if not args.wiki_only:
        raw_stats = _copy_raw_sources(dataset_dir, output_dir)

    # --- 2. Generate conversations.jsonl from wiki ---
    conv_count = _generate_conversations(dataset_dir, output_dir, name, wiki_only=args.wiki_only)

    # --- 3. Generate profile.md from wiki ---
    _generate_profile(dataset_dir, output_dir, name, slug)

    # --- 4. Write metadata.json (with version fields) ---
    version      = args.version or _next_version(dataset_dir)
    export_hash  = _compute_export_hash(output_dir)
    src_snapshot = _build_source_snapshot(dataset_dir)

    # Warn if explicit version already exists in history
    existing = _load_export_history(dataset_dir)
    if args.version and any(e.get('version') == args.version for e in existing):
        print(f'Warning: version {args.version} already exists in export_history', file=sys.stderr)

    _write_metadata(dataset_dir, output_dir, slug, name, raw_stats, conv_count,
                    version, export_hash, src_snapshot)

    # --- 5. Quality report (rewrites metadata.json to add quality field) ---
    quality = _compute_quality_report(output_dir)

    # --- 6. Generate probes.json for probe-based evaluation ---
    _generate_probes(dataset_dir, output_dir, name, slug)

    # --- 7. Append export history (after export is fully complete) ---
    _append_export_history(dataset_dir, version, export_hash, src_snapshot, conv_count,
                           {'wiki_only': args.wiki_only})

    print(f'\n✅ Export complete: {output_dir}/')
    print(f'   version: {version}  hash: {export_hash}')
    print(f'   raw/: {raw_stats["files"]} files')
    print(f'   conversations.jsonl: {conv_count} turns')
    print(f'   profile.md: generated')
    print(f'   metadata.json: generated')
    print(f'\n📊 Quality report:')
    print(f'   Role balance: {quality["assistant_turns"]} assistant / {quality["user_turns"]} user'
          f' (ratio {quality["role_ratio"]:.2f})')
    print(f'   Avg turn length: {quality["avg_assistant_len"]:.0f} chars (assistant)'
          f' / {quality["avg_user_len"]:.0f} chars (user)')
    print(f'   Topics covered: {quality["topic_count"]}')
    if quality.get('unique_questions', 0) > 0:
        print(f'   Unique questions: {quality["unique_questions"]}')


def _copy_raw_sources(dataset_dir: Path, output_dir: Path) -> dict:
    """Copy sources/ JSONL/TXT files to training/raw/."""
    raw_dir = output_dir / 'raw'
    raw_dir.mkdir(exist_ok=True)

    sources_dir = dataset_dir / 'sources'
    stats = {'files': 0, 'messages': 0}

    for src_file in sources_dir.iterdir():
        if src_file.name.startswith('.'):
            continue
        if src_file.suffix not in ('.jsonl', '.txt', '.json', '.csv'):
            continue

        dst = raw_dir / src_file.name
        shutil.copy2(src_file, dst)
        stats['files'] += 1

        if src_file.suffix == '.jsonl':
            stats['messages'] += sum(1 for line in src_file.open() if line.strip())
        elif src_file.suffix == '.txt':
            stats['messages'] += len(re.findall(r'\n{2,}', src_file.read_text()))

    print(f'   raw/: copied {stats["files"]} source files')
    return stats


def _generate_conversations(dataset_dir: Path, output_dir: Path, name: str,
                            *, wiki_only: bool = False) -> int:
    """
    Generate conversations.jsonl from wiki pages and (optionally) source data.

    Reads wiki content pages and creates structured Q-A pairs.
    When wiki_only is False (default), also includes raw assistant turns from sources/.
    """
    wiki_dir = dataset_dir / 'wiki'
    conv_path = output_dir / 'conversations.jsonl'
    turns = []

    # Read all wiki content pages
    content_pages = {}
    if wiki_dir.exists():
        for md_file in sorted(wiki_dir.glob('*.md')):
            if md_file.name.startswith('_'):
                continue
            text = md_file.read_text()
            if '(awaiting' in text and len(text.strip()) < 200:
                continue
            content_pages[md_file.stem] = text

    # Generate conversation pairs from wiki content
    for page_name, content in content_pages.items():
        sections = _extract_sections(content)
        for section_title, section_text in sections:
            # Strip evidence tags for training data
            clean_text = re.sub(r'\[L\d:?[\w-]*\]', '', section_text).strip()
            clean_text = re.sub(r'\[\[([\w-]+)\]\]', r'\1', clean_text)

            if len(clean_text) < 30:
                continue

            question = _generate_question(page_name, section_title)
            turns.append({'role': 'user', 'content': question})
            turns.append({'role': 'assistant', 'content': clean_text})

    # Also include raw source assistant turns as paired conversations (unless wiki-only mode)
    if not wiki_only:
        sources_dir = dataset_dir / 'sources'
        if sources_dir.exists():
            for jsonl_file in sources_dir.glob('*.jsonl'):
                for line in jsonl_file.open():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        if msg.get('role') == 'assistant' and len(msg.get('content', '')) >= 20:
                            turns.append({'role': 'user', 'content': 'Go on.'})
                            turns.append({'role': 'assistant', 'content': msg['content']})
                    except json.JSONDecodeError:
                        continue

    with open(conv_path, 'w') as f:
        for turn in turns:
            f.write(json.dumps(turn, ensure_ascii=False) + '\n')

    print(f'   conversations.jsonl: {len(turns)} turns')
    return len(turns)


_STRUCTURAL_SECTIONS = {'Sources', 'See also', 'References', 'Metadata'}


def _extract_sections(markdown: str) -> list[tuple[str, str]]:
    """Extract ## Content sections from markdown, skipping structural sections."""
    sections = []
    current_title = ''
    current_lines = []

    for line in markdown.splitlines():
        if line.startswith('## '):
            if current_title and current_title not in _STRUCTURAL_SECTIONS and current_lines:
                text = '\n'.join(current_lines).strip()
                if text and text != '(awaiting data ingestion)':
                    sections.append((current_title, text))
            current_title = line[3:].strip()
            current_lines = []
        elif current_title:
            if not line.startswith('# '):
                current_lines.append(line)

    if current_title and current_title not in _STRUCTURAL_SECTIONS and current_lines:
        text = '\n'.join(current_lines).strip()
        if text and text != '(awaiting data ingestion)':
            sections.append((current_title, text))

    return sections


_QUESTION_MAP = {
    'identity': 'Tell me about yourself.',
    'voice': 'How do you typically express yourself?',
    'values': 'What do you value most?',
    'thinking': 'How do you approach problems?',
    'relationships': 'Tell me about the people in your life.',
    'timeline': 'What are some important events in your life?',
}


def _generate_question(page_name: str, section_title: str) -> str:
    if page_name in _QUESTION_MAP:
        return _QUESTION_MAP[page_name]
    topic = page_name.replace('-', ' ') if section_title.lower() == 'content' else section_title.lower()
    return f'Tell me about your {topic}.'


def _generate_profile(dataset_dir: Path, output_dir: Path, name: str, slug: str):
    """Generate profile.md from wiki pages."""
    wiki_dir = dataset_dir / 'wiki'
    profile_path = output_dir / 'profile.md'

    sections = []
    sections.append(f'# {name}\n')

    page_order = ['identity', 'voice', 'values', 'thinking']
    for page_name in page_order:
        page_path = wiki_dir / f'{page_name}.md'
        if not page_path.exists():
            continue

        text = page_path.read_text()
        if '(awaiting' in text and len(text.strip()) < 200:
            continue

        # Extract content section only
        content_match = re.search(r'## Content\s*\n(.*?)(?=\n## |\Z)', text, re.DOTALL)
        if content_match:
            content = content_match.group(1).strip()
            content = re.sub(r'\[L\d:?[\w-]*\]', '', content)
            content = re.sub(r'\[\[([\w-]+)\]\]', r'\1', content)
            if content and len(content) >= 20:
                sections.append(f'## {page_name.title()}\n\n{content}\n')

    if len(sections) <= 1:
        sections.append('(No wiki content available yet. Ingest data and build wiki first.)\n')

    profile_path.write_text('\n'.join(sections))
    print(f'   profile.md: generated')


def _count_total_words(dataset_dir: Path) -> int:
    """Estimate total word count across all source files."""
    total = 0
    sources_dir = dataset_dir / 'sources'
    if not sources_dir.exists():
        return 0
    for src_file in sources_dir.iterdir():
        if src_file.name.startswith('.'):
            continue
        if src_file.suffix == '.jsonl':
            for line in src_file.open(errors='replace'):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    total += len(msg.get('content', '').split())
                except json.JSONDecodeError:
                    continue
        elif src_file.suffix in ('.txt', '.md', '.csv'):
            total += len(src_file.read_text(errors='replace').split())
    return total


def _next_version(dataset_dir: Path) -> str:
    """Auto-increment export version based on export_history in dataset.json."""
    meta_path = dataset_dir / 'dataset.json'
    if not meta_path.exists():
        return 'v1'
    meta = json.loads(meta_path.read_text())
    history = meta.get('export_history', [])
    if not history:
        return 'v1'
    last = history[-1].get('version', '')
    try:
        n = int(last.lstrip('v'))
        return f'v{n + 1}'
    except ValueError:
        return f'v{len(history) + 1}'   # non-standard tag fallback


def _compute_export_hash(output_dir: Path) -> str:
    """SHA-256 of conversations.jsonl — captures export content identity."""
    conv = output_dir / 'conversations.jsonl'
    if not conv.exists():
        return 'sha256:empty'
    return 'sha256:' + hashlib.sha256(conv.read_bytes()).hexdigest()[:16]


def _build_source_snapshot(dataset_dir: Path) -> dict:
    """Hash each source file to record which sources existed at export time."""
    snapshot = {}
    sources_dir = dataset_dir / 'sources'
    if not sources_dir.exists():
        return snapshot
    for f in sorted(sources_dir.iterdir()):
        if f.name.startswith('.') or f.suffix not in ('.jsonl', '.txt', '.json', '.csv'):
            continue
        snapshot[f.name] = 'sha256:' + hashlib.sha256(f.read_bytes()).hexdigest()[:16]
    return snapshot


def _load_export_history(dataset_dir: Path) -> list:
    """Read export_history from dataset.json; returns [] on any failure."""
    meta_path = dataset_dir / 'dataset.json'
    if not meta_path.exists():
        return []
    try:
        return json.loads(meta_path.read_text()).get('export_history', [])
    except (json.JSONDecodeError, OSError):
        return []


def _list_exports(dataset_dir: Path) -> None:
    """Print export history table and exit."""
    history = _load_export_history(dataset_dir)
    if not history:
        print('No exports yet.')
        return
    for entry in history:
        ver   = entry.get('version', '?')
        ts    = entry.get('exported_at', '')[:16].replace('T', ' ')
        turns = entry.get('conversation_count', '?')
        h     = entry.get('export_hash', '')
        nsrc  = len(entry.get('source_snapshot', {}))
        print(f'{ver:<4}  {ts}  {turns} turns  {h}  {nsrc} sources')


def _append_export_history(dataset_dir: Path, version: str, export_hash: str,
                           source_snapshot: dict, conv_count: int,
                           export_params: dict) -> None:
    """Append one record to dataset.json export_history (last step after full export)."""
    meta_path = dataset_dir / 'dataset.json'
    if not meta_path.exists():
        print('Warning: dataset.json not found — skipping history append', file=sys.stderr)
        return
    meta = json.loads(meta_path.read_text())
    meta.setdefault('export_history', [])
    meta['export_history'].append({
        'version':            version,
        'exported_at':        datetime.now(timezone.utc).isoformat(),
        'export_hash':        export_hash,
        'source_snapshot':    source_snapshot,
        'conversation_count': conv_count,
        'export_params':      export_params,
    })
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')


def _write_metadata(dataset_dir: Path, output_dir: Path, slug: str, name: str,
                    raw_stats: dict, conv_count: int,
                    version: str, export_hash: str, source_snapshot: dict):
    total_words = _count_total_words(dataset_dir)

    # Load dataset.json for extra fields
    dataset_meta_path = dataset_dir / 'dataset.json'
    dm = json.loads(dataset_meta_path.read_text()) if dataset_meta_path.exists() else {}

    now_iso = datetime.now(timezone.utc).isoformat()
    meta = {
        'slug': slug,
        'name': name,
        'subject_type': dm.get('subject_type', 'personal'),
        'created_at': dm.get('created_at', now_iso),   # matches persona-model-trainer Phase 1 spec
        'exported_at': now_iso,
        'export_version':  version,
        'export_hash':     export_hash,
        'source_snapshot': source_snapshot,
        'source': f'persona-knowledge ({dataset_dir})',
        'source_count': raw_stats['files'],
        'total_words': total_words,
        'raw_files': [
            f.name for f in sorted((dataset_dir / 'sources').iterdir())
            if not f.name.startswith('.') and f.suffix in ('.jsonl', '.txt', '.json', '.csv')
        ] if (dataset_dir / 'sources').exists() else [],
        'distilled_turns': conv_count,
        'total_estimated_turns': raw_stats.get('messages', 0) + conv_count,
    }

    # Merge dataset.json stats
    if dm:
        stats = dm.get('stats', {})
        meta['dataset_stats'] = stats

    (output_dir / 'metadata.json').write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + '\n'
    )


def _compute_quality_report(output_dir: Path) -> dict:
    """Compute quality metrics from the exported conversations.jsonl."""
    conv_path = output_dir / 'conversations.jsonl'
    assistant_lens = []
    user_lens = []
    questions = set()
    topics = set()

    if conv_path.exists():
        for line in conv_path.open():
            line = line.strip()
            if not line:
                continue
            try:
                turn = json.loads(line)
            except json.JSONDecodeError:
                continue

            content = turn.get('content', '')
            if turn.get('role') == 'assistant':
                assistant_lens.append(len(content))
            elif turn.get('role') == 'user':
                user_lens.append(len(content))
                questions.add(content)
                topic_match = re.search(r'(?:about your |about )([\w\s-]+)', content, re.IGNORECASE)
                if topic_match:
                    topics.add(topic_match.group(1).strip().lower())

    assistant_count = len(assistant_lens)
    user_count = len(user_lens)
    ratio = assistant_count / user_count if user_count > 0 else 0.0

    report = {
        'assistant_turns': assistant_count,
        'user_turns': user_count,
        'role_ratio': ratio,
        'avg_assistant_len': sum(assistant_lens) / assistant_count if assistant_count else 0,
        'avg_user_len': sum(user_lens) / user_count if user_count else 0,
        'topic_count': len(topics),
        'unique_questions': len(questions),
    }

    meta_path = output_dir / 'metadata.json'
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta['quality'] = report
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')

    return report


def _extract_wiki_keywords(wiki_dir: Path, page_name: str, max_chars: int = 20) -> list:
    """Extract a short keyword string from a wiki page's Content section.

    Uses a character-slice approach (v1 simplification) that works for both
    Chinese (no word boundaries) and English personas without requiring a
    tokenizer or stopword list.
    """
    page = wiki_dir / f'{page_name}.md'
    if not page.exists():
        return []
    text = page.read_text(encoding='utf-8')
    m = re.search(r'## Content\s*\n(.*?)(?=\n## |\Z)', text, re.DOTALL)
    if not m:
        return []
    content = m.group(1).strip()
    # Strip markup annotations like [L1:label]
    content = re.sub(r'\[L\d+:?[\w-]*\]', '', content).strip()
    if not content or '(awaiting' in content:
        return []
    snippet = content[:max_chars].strip()
    return [snippet] if snippet else []


def _generate_probes(dataset_dir: Path, output_dir: Path, name: str, slug: str):
    """Generate probes.json for keyword-based role consistency evaluation.

    The name probe (weight 1.0) checks if the model knows its own name.
    The identity probe (weight 0.8) checks a short snippet from the identity wiki page.
    The voice probe (weight 0.5) checks a snippet from the voice wiki page.

    Probes with empty keywords are omitted to avoid trivially-passing checks.
    """
    wiki_dir = dataset_dir / 'wiki'
    probes = []

    # Name probe — most critical; always included
    probes.append({
        'id': 'name',
        'question': 'What is your name?',
        'keywords': [name],
        'weight': 1.0,
    })

    # Identity probe — from wiki/identity.md Content section
    identity_kw = _extract_wiki_keywords(wiki_dir, 'identity', max_chars=20)
    if identity_kw:
        probes.append({
            'id': 'identity',
            'question': 'Tell me about yourself.',
            'keywords': identity_kw,
            'weight': 0.8,
        })

    # Voice probe — from wiki/voice.md Content section
    voice_kw = _extract_wiki_keywords(wiki_dir, 'voice', max_chars=10)
    if voice_kw:
        probes.append({
            'id': 'voice',
            'question': 'Say something in your own style.',
            'keywords': voice_kw,
            'weight': 0.5,
        })

    probes_data = {
        'version': '1',
        'slug': slug,
        'probes': probes,
    }
    probes_path = output_dir / 'probes.json'
    probes_path.write_text(json.dumps(probes_data, indent=2, ensure_ascii=False) + '\n')
    print(f'   probes.json: {len(probes)} probe(s) generated')


if __name__ == '__main__':
    main()
