"""
Chat export adapter.

Handles WhatsApp (.txt), Telegram (result.json), Signal (JSON array),
and iMessage (SQLite .db).
"""

import json
import re
import sqlite3
from pathlib import Path


def parse(source_path: str, *, persona_name: str = '', since: str | None = None, **kwargs) -> list[dict]:
    p = Path(source_path)

    if p.suffix == '.db':
        return _parse_imessage(p, persona_name=persona_name)

    if p.suffix == '.txt':
        return _parse_whatsapp(p, persona_name=persona_name)

    if p.suffix == '.json':
        data = json.loads(p.read_text(errors='replace'))
        if isinstance(data, dict) and 'chats' in data:
            return _parse_telegram(data, persona_name=persona_name)
        if isinstance(data, list):
            if data and 'sender' in data[0]:
                return _parse_signal(data, persona_name=persona_name)

    raise ValueError(f'Unrecognized chat export format: {source_path}')


# --- WhatsApp ---

_WA_PATTERN = re.compile(
    r'^(\d{1,2}/\d{1,2}/\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AP]?M?)\s*-\s*([^:]+):\s*(.*)',
    re.MULTILINE
)


def _parse_whatsapp(path: Path, *, persona_name: str) -> list[dict]:
    text = path.read_text(errors='replace')
    messages = []
    persona_lower = persona_name.lower().strip()

    for match in _WA_PATTERN.finditer(text):
        ts_raw, sender, content = match.group(1), match.group(2).strip(), match.group(3).strip()
        if not content or content == '<Media omitted>':
            continue

        is_persona = (
            persona_lower and persona_lower in sender.lower()
        ) if persona_name else False

        messages.append({
            'role': 'assistant' if is_persona else 'user',
            'content': content,
            'timestamp': _normalize_wa_ts(ts_raw),
            'source_file': path.name,
            'source_type': 'whatsapp',
            'metadata': {'sender': sender},
        })

    return messages


def _normalize_wa_ts(raw: str) -> str:
    for fmt in (
        '%m/%d/%y, %I:%M %p',
        '%m/%d/%Y, %I:%M %p',
        '%m/%d/%y, %H:%M',
        '%d/%m/%y, %H:%M',
        '%d/%m/%Y, %H:%M',
    ):
        try:
            from datetime import datetime
            return datetime.strptime(raw.strip(), fmt).isoformat()
        except ValueError:
            continue
    return raw


# --- Telegram ---

def _parse_telegram(data: dict, *, persona_name: str) -> list[dict]:
    messages = []
    persona_lower = persona_name.lower().strip()
    chat_list = data.get('chats', {}).get('list', [])

    for chat in chat_list:
        for msg in chat.get('messages', []):
            sender = msg.get('from', msg.get('from_id', ''))
            text_parts = msg.get('text', '')

            if isinstance(text_parts, list):
                text = ''.join(
                    p if isinstance(p, str) else p.get('text', '')
                    for p in text_parts
                )
            else:
                text = str(text_parts)

            if not text.strip():
                continue

            is_persona = bool(persona_lower and persona_lower in str(sender).lower())

            messages.append({
                'role': 'assistant' if is_persona else 'user',
                'content': text.strip(),
                'timestamp': msg.get('date'),
                'source_file': 'telegram-export',
                'source_type': 'telegram',
                'metadata': {'sender': str(sender), 'chat': chat.get('name', '')},
            })

    return messages


# --- Signal ---

def _parse_signal(data: list, *, persona_name: str) -> list[dict]:
    messages = []
    persona_lower = persona_name.lower().strip()

    for msg in data:
        sender = msg.get('sender', msg.get('source', ''))
        body = msg.get('body', msg.get('text', ''))
        if not body or not body.strip():
            continue

        ts = msg.get('timestamp')
        if isinstance(ts, (int, float)) and ts > 1e12:
            from datetime import datetime
            ts = datetime.fromtimestamp(ts / 1000).isoformat()
        elif isinstance(ts, (int, float)):
            from datetime import datetime
            ts = datetime.fromtimestamp(ts).isoformat()

        is_persona = bool(persona_lower and persona_lower in str(sender).lower())

        messages.append({
            'role': 'assistant' if is_persona else 'user',
            'content': body.strip(),
            'timestamp': str(ts) if ts else None,
            'source_file': 'signal-export',
            'source_type': 'signal',
            'metadata': {'sender': str(sender)},
        })

    return messages


# --- iMessage ---

_IMESSAGE_QUERY = '''
SELECT
    m.text,
    m.is_from_me,
    m.date,
    h.id AS handle_id
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE m.text IS NOT NULL AND m.text != ''
ORDER BY m.date ASC
'''


def _parse_imessage(db_path: Path, *, persona_name: str) -> list[dict]:
    messages = []

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.execute(_IMESSAGE_QUERY)
    except sqlite3.Error as e:
        raise ValueError(f'Failed to read iMessage database: {e}')

    for text, is_from_me, date_val, handle_id in cursor:
        if not text or not text.strip():
            continue

        ts = None
        if date_val:
            from datetime import datetime
            try:
                # iMessage stores nanoseconds since 2001-01-01
                epoch_offset = 978307200
                ts = datetime.fromtimestamp(date_val / 1e9 + epoch_offset).isoformat()
            except (ValueError, OSError):
                ts = str(date_val)

        messages.append({
            'role': 'assistant' if is_from_me else 'user',
            'content': text.strip(),
            'timestamp': ts,
            'source_file': db_path.name,
            'source_type': 'imessage',
            'metadata': {'handle': handle_id or '', 'is_from_me': bool(is_from_me)},
        })

    conn.close()
    return messages
