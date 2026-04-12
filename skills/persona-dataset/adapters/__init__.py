"""
Source adapters for persona-dataset.

Each adapter exposes a `parse(path, **kwargs) -> list[dict]` function
that converts source data into a unified message format:

    {
        "role": "user" | "assistant",
        "content": str,
        "timestamp": str | None,
        "source_file": str,
        "source_type": str,
        "metadata": {}
    }
"""

from pathlib import Path

ADAPTER_REGISTRY = {
    'obsidian': 'adapters.obsidian',
    'chat_export': 'adapters.chat_export',
    'social': 'adapters.social',
    'plaintext': 'adapters.plaintext',
    'jsonl': 'adapters.jsonl',
    'gbrain': 'adapters.gbrain',
}


def detect_adapter(source_path: str) -> str | None:
    """Auto-detect the appropriate adapter for a source path."""
    p = Path(source_path)

    if p.is_dir():
        if (p / '.obsidian').exists():
            return 'obsidian'
        if any(p.glob('*.md')) and not any(p.glob('*.json')):
            return 'obsidian'
        if (p / 'data' / 'tweets.js').exists():
            return 'social'
        if (p / 'content' / 'posts_1.json').exists():
            return 'social'
        return None

    suffix = p.suffix.lower()

    if suffix == '.jsonl':
        return 'jsonl'

    if suffix == '.json':
        try:
            import json
            data = json.loads(p.read_text(errors='replace')[:4096])
            if isinstance(data, dict) and 'chats' in data:
                return 'chat_export'
            if isinstance(data, list) and data and 'sender' in data[0]:
                return 'chat_export'
            if isinstance(data, list) and data and 'role' in data[0]:
                return 'jsonl'
        except (json.JSONDecodeError, KeyError, IndexError):
            pass
        return 'jsonl'

    if suffix == '.txt':
        try:
            head = p.read_text(errors='replace')[:1024]
            import re
            if re.search(r'\d+/\d+/\d+,\s*\d+:\d+\s*[AP]M\s*-\s*.+:', head):
                return 'chat_export'
        except OSError:
            pass
        return 'plaintext'

    if suffix == '.db':
        return 'chat_export'

    if suffix in ('.csv', '.pdf'):
        return 'plaintext'

    return None
