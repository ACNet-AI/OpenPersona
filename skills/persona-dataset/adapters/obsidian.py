"""
Obsidian vault adapter.

Reads all markdown files from an Obsidian vault, extracts YAML frontmatter
and content, and converts to unified message format.
"""

import os
import re
from datetime import datetime
from pathlib import Path


def parse(source_path: str, *, persona_name: str = '', since: str | None = None, **kwargs) -> list[dict]:
    vault = Path(source_path)
    if not vault.is_dir():
        raise ValueError(f'Not a directory: {source_path}')

    ignore_patterns = _load_ignore_patterns(vault)
    since_dt = datetime.fromisoformat(since) if since else None
    messages = []

    for md_file in sorted(vault.rglob('*.md')):
        rel = md_file.relative_to(vault)

        if _should_ignore(str(rel), ignore_patterns):
            continue
        if any(part.startswith('.') for part in rel.parts):
            continue

        try:
            text = md_file.read_text(errors='replace')
        except OSError:
            continue

        frontmatter, body = _split_frontmatter(text)
        body = _strip_wikilinks(body).strip()

        if not body or len(body) < 20:
            continue

        timestamp = _extract_date(frontmatter, md_file)
        if since_dt and timestamp:
            try:
                if datetime.fromisoformat(timestamp) < since_dt:
                    continue
            except (ValueError, TypeError):
                pass

        messages.append({
            'role': 'assistant',
            'content': body,
            'timestamp': timestamp,
            'source_file': str(rel),
            'source_type': 'obsidian',
            'metadata': {
                'frontmatter': frontmatter,
                'tags': frontmatter.get('tags', []) if isinstance(frontmatter, dict) else [],
            },
        })

    return messages


def _load_ignore_patterns(vault: Path) -> list[str]:
    patterns = ['.obsidian', '.trash', 'node_modules']
    for ignore_file in ('.obsidianignore', '.gitignore'):
        path = vault / ignore_file
        if path.exists():
            for line in path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#'):
                    patterns.append(line.rstrip('/'))
    return patterns


def _should_ignore(rel_path: str, patterns: list[str]) -> bool:
    parts = rel_path.split(os.sep)
    for p in patterns:
        if p in parts or rel_path.startswith(p):
            return True
    return False


def _split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith('---'):
        return {}, text

    end = text.find('---', 3)
    if end == -1:
        return {}, text

    fm_text = text[3:end].strip()
    body = text[end + 3:].strip()

    fm = {}
    for line in fm_text.splitlines():
        if ':' in line:
            key, _, val = line.partition(':')
            key = key.strip()
            val = val.strip()
            if val.startswith('[') and val.endswith(']'):
                val = [v.strip().strip('"').strip("'") for v in val[1:-1].split(',')]
            fm[key] = val

    return fm, body


def _strip_wikilinks(text: str) -> str:
    """Convert [[link|display]] → display, [[link]] → link."""
    text = re.sub(r'\[\[([^|\]]+)\|([^\]]+)\]\]', r'\2', text)
    text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)
    return text


def _extract_date(frontmatter: dict, file_path: Path) -> str | None:
    for key in ('date', 'created', 'created_at', 'timestamp'):
        if key in frontmatter:
            val = frontmatter[key]
            if isinstance(val, str) and len(val) >= 8:
                return val

    name = file_path.stem
    date_match = re.search(r'(\d{4}-\d{2}-\d{2})', name)
    if date_match:
        return date_match.group(1)

    try:
        mtime = file_path.stat().st_mtime
        return datetime.fromtimestamp(mtime).isoformat()
    except OSError:
        return None
