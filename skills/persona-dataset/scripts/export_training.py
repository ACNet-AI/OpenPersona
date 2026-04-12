#!/usr/bin/env python3
"""
Export a persona dataset to a training/ directory compatible with persona-model-trainer.

Output structure:
    training/
      raw/                    # copied from sources/ (authentic voice)
      conversations.jsonl     # distilled Q-A pairs from wiki + sources
      profile.md              # character sheet from wiki summary
      metadata.json           # aggregated stats

Usage:
    python scripts/export_training.py --slug sam --output training/
"""

import argparse
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

    args = parser.parse_args()

    dataset_dir = DATASETS_ROOT / args.slug
    if not dataset_dir.exists():
        print(f'❌ Dataset not found: {dataset_dir}', file=sys.stderr)
        sys.exit(1)

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

    # --- 4. Write metadata.json ---
    _write_metadata(dataset_dir, output_dir, slug, name, raw_stats, conv_count)

    # --- 5. Quality report ---
    quality = _compute_quality_report(output_dir)

    print(f'\n✅ Export complete: {output_dir}/')
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


def _write_metadata(dataset_dir: Path, output_dir: Path, slug: str, name: str,
                    raw_stats: dict, conv_count: int):
    total_words = _count_total_words(dataset_dir)

    meta = {
        'slug': slug,
        'name': name,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'source': f'persona-dataset ({dataset_dir})',
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
    dataset_meta_path = dataset_dir / 'dataset.json'
    if dataset_meta_path.exists():
        dm = json.loads(dataset_meta_path.read_text())
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


if __name__ == '__main__':
    main()
