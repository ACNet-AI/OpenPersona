"""
Plaintext adapter.

Handles .txt, .csv, and .pdf files.
"""

import csv
import re
from pathlib import Path


def parse(source_path: str, *, persona_name: str = '', since: str | None = None, **kwargs) -> list[dict]:
    p = Path(source_path)
    suffix = p.suffix.lower()

    if suffix == '.txt':
        return _parse_txt(p)
    if suffix == '.csv':
        return _parse_csv(p, persona_name=persona_name)
    if suffix == '.pdf':
        return _parse_pdf(p)

    raise ValueError(f'Unsupported plaintext format: {suffix}')


def _parse_txt(path: Path) -> list[dict]:
    """Split text into paragraphs, each becomes an assistant monologue entry."""
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
    """Auto-detect speaker/content columns and parse rows."""
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

        # Auto-detect columns
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
    """Extract text from PDF using pdfplumber (preferred) or PyPDF2."""
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
