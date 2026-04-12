"""
Universal file adapter.

Handles all file-based sources: markdown (Obsidian / GBrain export), plaintext,
CSV, PDF, JSONL, and JSON. Delegates to format-specific parsers by extension.
"""

import csv
import json
import os
import re
from datetime import datetime
from pathlib import Path


# --- JSON field name conventions ---

ROLE_FIELDS = ('role', 'speaker', 'from', 'sender', 'author')
CONTENT_FIELDS = ('content', 'text', 'message', 'body', 'value', 'memory')
TS_FIELDS = ('timestamp', 'date', 'time', 'datetime', 'created_at', 'ts')


def parse(source_path: str, *, persona_name: str = '', since: str | None = None,
          entity: str = '', **kwargs) -> list[dict]:
    p = Path(source_path)

    if p.is_dir():
        return _parse_directory(p, persona_name=persona_name, since=since)

    suffix = p.suffix.lower()

    if suffix == '.md':
        return _parse_single_markdown(p)
    if suffix == '.txt':
        return _parse_txt(p)
    if suffix == '.csv':
        return _parse_csv(p, persona_name=persona_name)
    if suffix == '.pdf':
        return _parse_pdf(p)
    if suffix == '.jsonl':
        return _parse_jsonl(p, persona_name=persona_name)
    if suffix == '.json':
        return _parse_json_file(p, persona_name=persona_name, entity=entity)

    raise ValueError(f'Unsupported format: {suffix} — universal adapter handles '
                     '.md, .txt, .csv, .pdf, .jsonl, .json and directories')


# ============================================================================
# Directory parsing (Obsidian vaults, GBrain export, generic markdown dirs)
# ============================================================================

def _parse_directory(root: Path, *, persona_name: str, since: str | None) -> list[dict]:
    ignore_patterns = _load_ignore_patterns(root)
    since_dt = datetime.fromisoformat(since) if since else None
    messages = []

    has_raw_sidecars = any(root.rglob('.raw'))
    is_obsidian = (root / '.obsidian').exists()

    for md_file in sorted(root.rglob('*.md')):
        rel = md_file.relative_to(root)

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

        source_type = 'obsidian' if is_obsidian else ('gbrain-export' if has_raw_sidecars else 'markdown')

        msg = {
            'role': 'assistant',
            'content': body,
            'timestamp': timestamp,
            'source_file': str(rel),
            'source_type': source_type,
            'metadata': {
                'frontmatter': frontmatter,
                'tags': frontmatter.get('tags', []) if isinstance(frontmatter, dict) else [],
            },
        }

        # GBrain export: attach raw sidecar data if present
        if has_raw_sidecars:
            sidecar = _find_raw_sidecar(root, rel)
            if sidecar:
                msg['metadata']['raw_data'] = sidecar

        messages.append(msg)

    return messages


def _find_raw_sidecar(root: Path, md_rel: Path) -> dict | None:
    """Look for GBrain .raw/ sidecar JSON next to a markdown file."""
    parts = md_rel.parts
    raw_dir = root / Path(*parts[:-1]) / '.raw' if len(parts) > 1 else root / '.raw'
    sidecar_path = raw_dir / (md_rel.stem + '.json')
    if sidecar_path.exists():
        try:
            return json.loads(sidecar_path.read_text(errors='replace'))
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _load_ignore_patterns(root: Path) -> list[str]:
    patterns = ['.obsidian', '.trash', 'node_modules', '.raw']
    for ignore_file in ('.obsidianignore', '.gitignore'):
        path = root / ignore_file
        if path.exists():
            try:
                for line in path.read_text().splitlines():
                    line = line.strip()
                    if line and not line.startswith('#'):
                        patterns.append(line.rstrip('/'))
            except OSError:
                pass
    return patterns


def _should_ignore(rel_path: str, patterns: list[str]) -> bool:
    parts = rel_path.split(os.sep)
    for p in patterns:
        if p in parts or rel_path.startswith(p):
            return True
    return False


# --- Markdown helpers ---

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
    """Convert [[link|display]] -> display, [[link]] -> link."""
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


def _parse_single_markdown(path: Path) -> list[dict]:
    """Parse a single .md file (not a directory)."""
    text = path.read_text(errors='replace')
    frontmatter, body = _split_frontmatter(text)
    body = _strip_wikilinks(body).strip()

    if not body or len(body) < 20:
        return []

    return [{
        'role': 'assistant',
        'content': body,
        'timestamp': _extract_date(frontmatter, path),
        'source_file': path.name,
        'source_type': 'markdown',
        'metadata': {
            'frontmatter': frontmatter,
            'tags': frontmatter.get('tags', []) if isinstance(frontmatter, dict) else [],
        },
    }]


# ============================================================================
# Plaintext / CSV / PDF
# ============================================================================

def _parse_txt(path: Path) -> list[dict]:
    text = path.read_text(errors='replace')
    paragraphs = re.split(r'\n{2,}', text)

    messages = []
    for para in paragraphs:
        para = para.strip()
        if len(para) < 20:
            continue

        messages.append({
            'role': 'assistant',
            'content': para,
            'timestamp': None,
            'source_file': path.name,
            'source_type': 'plaintext',
            'metadata': {},
        })

    return messages


def _parse_csv(path: Path, *, persona_name: str) -> list[dict]:
    messages = []
    persona_lower = persona_name.lower().strip()

    with open(path, newline='', errors='replace') as f:
        try:
            dialect = csv.Sniffer().sniff(f.read(4096))
            f.seek(0)
        except csv.Error:
            dialect = csv.excel
            f.seek(0)

        reader = csv.DictReader(f, dialect=dialect)
        if not reader.fieldnames:
            return messages

        fields_lower = {fn.lower(): fn for fn in reader.fieldnames}

        speaker_col = _find_col(fields_lower, ('speaker', 'sender', 'from', 'role', 'author', 'name'))
        content_col = _find_col(fields_lower, ('content', 'text', 'message', 'body', 'value'))
        ts_col = _find_col(fields_lower, ('timestamp', 'date', 'time', 'datetime', 'created_at'))

        if not content_col:
            return messages

        for row in reader:
            text = row.get(content_col, '').strip()
            if not text:
                continue

            speaker = row.get(speaker_col, '') if speaker_col else ''
            is_persona = bool(persona_lower and persona_lower in speaker.lower())
            role = 'assistant' if (is_persona or not speaker_col) else 'user'

            messages.append({
                'role': role,
                'content': text,
                'timestamp': row.get(ts_col) if ts_col else None,
                'source_file': path.name,
                'source_type': 'csv',
                'metadata': {'speaker': speaker} if speaker else {},
            })

    return messages


def _find_col(fields_lower: dict, candidates: tuple) -> str | None:
    for c in candidates:
        if c in fields_lower:
            return fields_lower[c]
    return None


def _parse_pdf(path: Path) -> list[dict]:
    text = ''

    try:
        import pdfplumber
        with pdfplumber.open(str(path)) as pdf:
            text = '\n\n'.join(
                page.extract_text() or '' for page in pdf.pages
            )
    except ImportError:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(str(path))
            text = '\n\n'.join(
                page.extract_text() or '' for page in reader.pages
            )
        except ImportError:
            raise ImportError(
                'PDF parsing requires pdfplumber or PyPDF2.\n'
                'Install: pip install pdfplumber'
            )

    paragraphs = re.split(r'\n{2,}', text)
    messages = []
    for para in paragraphs:
        para = para.strip()
        if len(para) < 20:
            continue

        messages.append({
            'role': 'assistant',
            'content': para,
            'timestamp': None,
            'source_file': path.name,
            'source_type': 'pdf',
            'metadata': {},
        })

    return messages


# ============================================================================
# JSONL / JSON (includes GBrain export JSON)
# ============================================================================

def _parse_jsonl(path: Path, *, persona_name: str) -> list[dict]:
    messages = []
    for line in path.open(errors='replace'):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg = _normalize_json_message(obj, path.name, persona_name)
        if msg:
            messages.append(msg)

    return messages


def _parse_json_file(path: Path, *, persona_name: str, entity: str = '') -> list[dict]:
    data = json.loads(path.read_text(errors='replace'))

    # GBrain entity export: {"memories": [...]} or [...]
    if entity:
        return _parse_gbrain_json(data, entity)

    if isinstance(data, list):
        return _parse_json_array(data, path.name, persona_name=persona_name)

    if isinstance(data, dict):
        if 'memories' in data:
            return _parse_gbrain_json(data, entity or persona_name)
        return _parse_json_array([data], path.name, persona_name=persona_name)

    return []


def _parse_json_array(data: list, filename: str, *, persona_name: str) -> list[dict]:
    messages = []
    for obj in data:
        if not isinstance(obj, dict):
            continue
        msg = _normalize_json_message(obj, filename, persona_name)
        if msg:
            messages.append(msg)
    return messages


def _parse_gbrain_json(data, entity: str) -> list[dict]:
    """Parse GBrain export format: list of memories or {memories: [...]}."""
    if isinstance(data, dict) and 'memories' in data:
        items = data['memories']
    elif isinstance(data, list):
        items = data
    else:
        return []

    messages = []
    for mem in items:
        if not isinstance(mem, dict):
            continue
        content = _get_json_field(mem, CONTENT_FIELDS)
        if not content or not str(content).strip():
            continue

        ts = _get_json_field(mem, TS_FIELDS)

        messages.append({
            'role': 'assistant',
            'content': str(content).strip(),
            'timestamp': str(ts) if ts else None,
            'source_file': 'gbrain-export',
            'source_type': 'gbrain',
            'metadata': {
                'entity': entity,
                'memory_id': mem.get('id', ''),
                'tags': mem.get('tags', []),
            },
        })

    return messages


def _normalize_json_message(obj: dict, filename: str, persona_name: str) -> dict | None:
    content = _get_json_field(obj, CONTENT_FIELDS)
    if not content or not str(content).strip():
        return None

    role_raw = _get_json_field(obj, ROLE_FIELDS) or ''
    role = _resolve_role(str(role_raw), persona_name)
    ts = _get_json_field(obj, TS_FIELDS)

    if isinstance(ts, (int, float)):
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
        'metadata': {k: v for k, v in obj.items()
                     if k not in (*ROLE_FIELDS, *CONTENT_FIELDS, *TS_FIELDS)},
    }


def _get_json_field(obj: dict, candidates: tuple):
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
