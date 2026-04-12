"""
JSONL / JSON adapter.

Handles .jsonl (one JSON object per line) and .json (array of objects).
Supports multiple field naming conventions.
"""

import json
from pathlib import Path


ROLE_FIELDS = ('role', 'speaker', 'from', 'sender', 'author')
CONTENT_FIELDS = ('content', 'text', 'message', 'body', 'value')
TS_FIELDS = ('timestamp', 'date', 'time', 'datetime', 'created_at', 'ts')


def parse(source_path: str, *, persona_name: str = '', since: str | None = None, **kwargs) -> list[dict]:
    p = Path(source_path)

    if p.suffix == '.jsonl':
        return _parse_jsonl(p, persona_name=persona_name)

    if p.suffix == '.json':
        data = json.loads(p.read_text(errors='replace'))
        if isinstance(data, list):
            return _parse_array(data, p.name, persona_name=persona_name)
        if isinstance(data, dict):
            # Single object — wrap in list
            return _parse_array([data], p.name, persona_name=persona_name)

    raise ValueError(f'Unsupported format: {source_path}')


def _parse_jsonl(path: Path, *, persona_name: str) -> list[dict]:
    messages = []
    for line_num, line in enumerate(path.open(errors='replace'), 1):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg = _normalize_message(obj, path.name, persona_name)
        if msg:
            messages.append(msg)

    return messages


def _parse_array(data: list, filename: str, *, persona_name: str) -> list[dict]:
    messages = []
    for obj in data:
        if not isinstance(obj, dict):
            continue
        msg = _normalize_message(obj, filename, persona_name)
        if msg:
            messages.append(msg)
    return messages


def _normalize_message(obj: dict, filename: str, persona_name: str) -> dict | None:
    content = _get_field(obj, CONTENT_FIELDS)
    if not content or not str(content).strip():
        return None

    role_raw = _get_field(obj, ROLE_FIELDS) or ''
    role = _resolve_role(str(role_raw), persona_name)
    ts = _get_field(obj, TS_FIELDS)

    if isinstance(ts, (int, float)):
        from datetime import datetime
        try:
            if ts > 1e12:
                ts = datetime.fromtimestamp(ts / 1000).isoformat()
            else:
                ts = datetime.fromtimestamp(ts).isoformat()
        except (ValueError, OSError):
            ts = str(ts)

    return {
        'role': role,
        'content': str(content).strip(),
        'timestamp': str(ts) if ts else None,
        'source_file': filename,
        'source_type': 'jsonl',
        'metadata': {k: v for k, v in obj.items() if k not in (*ROLE_FIELDS, *CONTENT_FIELDS, *TS_FIELDS)},
    }


def _get_field(obj: dict, candidates: tuple) -> str | None:
    for key in candidates:
        if key in obj:
            return obj[key]
    return None


def _resolve_role(role_raw: str, persona_name: str) -> str:
    role_lower = role_raw.lower().strip()

    if role_lower in ('assistant', 'bot', 'ai', 'system'):
        return 'assistant'
    if role_lower in ('user', 'human'):
        return 'user'

    if persona_name and persona_name.lower() in role_lower:
        return 'assistant'

    return 'assistant' if not role_raw else 'user'
