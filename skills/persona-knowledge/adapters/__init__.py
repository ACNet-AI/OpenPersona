"""
Source adapters for persona-knowledge.

Three adapters cover all supported source formats:

- universal:    Markdown dirs (Obsidian / GBrain export), .txt, .csv, .pdf,
                .jsonl, .json — all pure file reading
- chat_export:  WhatsApp / Telegram / Signal / iMessage — needs special
                timestamp parsing and SQLite binary reading
- social:       X (Twitter) / Instagram archive — needs JS wrapper stripping
                and archive directory structure parsing

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
    'universal': 'adapters.universal',
    'chat_export': 'adapters.chat_export',
    'social': 'adapters.social',
}


def detect_adapter(source_path: str) -> str | None:
    """Auto-detect the appropriate adapter for a source path."""
    p = Path(source_path)

    if p.is_dir():
        # Social archives (check first — they also contain .json files)
        if (p / 'data' / 'tweets.js').exists():
            return 'social'
        if (p / 'content' / 'posts_1.json').exists():
            return 'social'

        return 'universal'

    suffix = p.suffix.lower()

    # Chat export detection
    if suffix == '.db':
        return 'chat_export'

    if suffix == '.txt':
        try:
            head = p.read_text(errors='replace')[:1024]
            import re
            if re.search(r'\d+/\d+/\d+,\s*\d+:\d+\s*[AP]?M?\s*-\s*.+:', head):
                return 'chat_export'
        except OSError:
            pass
        return 'universal'

    if suffix == '.json':
        try:
            import json
            data = json.loads(p.read_text(errors='replace')[:4096])
            if isinstance(data, dict) and 'chats' in data:
                return 'chat_export'
            if isinstance(data, list) and data and 'sender' in data[0]:
                return 'chat_export'
        except (json.JSONDecodeError, KeyError, IndexError, OSError):
            pass
        return 'universal'

    # Everything else → universal
    if suffix in ('.jsonl', '.csv', '.pdf', '.md'):
        return 'universal'

    return None
