"""
GBrain MCP adapter.

Queries a running GBrain MCP server for memories related to an entity.
Requires MCP tools to be available (e.g., in Cursor or Claude Code).

Usage: --adapter gbrain --entity "Person Name"
"""

import json
import sys
from pathlib import Path


def parse(source_path: str = '', *, entity: str = '', persona_name: str = '', **kwargs) -> list[dict]:
    if not entity and persona_name:
        entity = persona_name

    if not entity:
        raise ValueError(
            'GBrain adapter requires --entity "Name" to query.\n'
            'Example: python scripts/ingest.py --slug sam --adapter gbrain --entity "Samantha"'
        )

    print(f'🧠 Querying GBrain for entity: {entity}', file=sys.stderr)

    memories = _query_gbrain(entity)
    if not memories:
        print(f'⚠️  No memories found for entity: {entity}', file=sys.stderr)
        return []

    messages = []
    for mem in memories:
        content = mem.get('content', mem.get('text', mem.get('memory', '')))
        if not content or not str(content).strip():
            continue

        ts = mem.get('timestamp', mem.get('created_at', mem.get('date')))

        messages.append({
            'role': 'assistant',
            'content': str(content).strip(),
            'timestamp': str(ts) if ts else None,
            'source_file': 'gbrain-mcp',
            'source_type': 'gbrain',
            'metadata': {
                'entity': entity,
                'memory_id': mem.get('id', ''),
                'tags': mem.get('tags', []),
            },
        })

    print(f'   Retrieved {len(messages)} memories from GBrain', file=sys.stderr)
    return messages


def _query_gbrain(entity: str) -> list[dict]:
    """
    Query GBrain via its MCP interface.

    Falls back to reading a local export file if MCP is not available.
    In an MCP-capable environment, the agent should use the GBrain MCP tools
    directly rather than calling this adapter script.
    """
    # Try local export file first (user may have pre-exported)
    local_exports = [
        Path(f'gbrain-export-{entity.lower().replace(" ", "-")}.json'),
        Path('gbrain-export.json'),
    ]
    for export_path in local_exports:
        if export_path.exists():
            print(f'   Reading local export: {export_path}', file=sys.stderr)
            data = json.loads(export_path.read_text())
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and 'memories' in data:
                return data['memories']

    print(
        '⚠️  GBrain MCP not directly accessible from script.\n'
        '   Options:\n'
        '   1. Use GBrain MCP tools in your agent environment (Cursor/Claude Code)\n'
        '   2. Export memories to gbrain-export.json first:\n'
        f'      gbrain export --entity "{entity}" --output gbrain-export.json',
        file=sys.stderr
    )
    return []
