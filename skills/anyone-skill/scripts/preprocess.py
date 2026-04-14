#!/usr/bin/env python3
"""
preprocess.py — Data pre-processor for anyone-skill

Handles two things the agent cannot do natively:

  1. SQLite extraction — reads binary database files (iMessage chat.db,
     WeChat PyWxDump .db) and outputs a readable JSON list.

  2. Large-file sampling — when a file exceeds --max messages, samples
     down to a representative subset before the agent reads it.
     Uses time-distributed sampling weighted by keyword hits.

For all other formats (WhatsApp _chat.txt, Telegram result.json,
Slack/Discord JSON exports, email .eml, Twitter/X archive, plain text,
CSV, etc.) — pass the file directly to the agent via the Read tool.
The agent understands these formats natively.

Usage:
  # Extract SQLite database
  python3 preprocess.py --input ~/Library/Messages/chat.db --output messages.json

  # Sample a large export file
  python3 preprocess.py --input big-export.json --max 3000 --output sampled.json

  # Filter to one person + sample
  python3 preprocess.py --input export.json --target "Alice" --max 2000 --output alice.json
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Optional


# ── Unified message schema ────────────────────────────────────────────────────

def msg(time: str, sender: str, content: str, platform: str) -> dict:
    return {"time": time, "sender": sender, "content": content, "platform": platform}


# ── SQLite extractors ─────────────────────────────────────────────────────────

def _is_sqlite(path: Path) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(6) == b"SQLite"
    except Exception:
        return False


def _sqlite_tables(path: Path) -> set:
    try:
        con = sqlite3.connect(str(path))
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        con.close()
        return tables
    except Exception:
        return set()


def extract_imessage(path: Path, target: Optional[str]) -> list:
    """Extract from macOS iMessage chat.db (~Library/Messages/chat.db)."""
    results = []
    try:
        con = sqlite3.connect(str(path))
        rows = con.execute("""
            SELECT
                datetime(message.date/1000000000 + 978307200, 'unixepoch') AS dt,
                COALESCE(handle.id, 'me') AS sender,
                message.text
            FROM message
            LEFT JOIN handle ON message.handle_id = handle.ROWID
            WHERE message.text IS NOT NULL AND message.text != ''
            ORDER BY message.date
        """).fetchall()
        con.close()
        for t, sender, content in rows:
            if target and target.lower() not in sender.lower():
                continue
            results.append(msg(str(t), sender, content, "imessage"))
    except Exception as e:
        print(f"❌ iMessage extraction failed: {e}", file=sys.stderr)
    return results


def extract_wechat(path: Path, target: Optional[str]) -> list:
    """Extract from WeChat PyWxDump / WeChatMsg SQLite database."""
    results = []
    try:
        con = sqlite3.connect(str(path))
        tables = _sqlite_tables(path)

        # Try known schemas in order of preference
        queries = []
        if "MSG" in tables:
            queries.append("SELECT CreateTime, NickName, Content FROM MSG")
        if "ChatInfo" in tables:
            queries.append("SELECT CreateTime, Sender, Content FROM ChatInfo")
        if not queries:
            # Generic fallback: look for time/sender/content columns
            for tbl in tables:
                try:
                    cols = {r[1].lower() for r in con.execute(f"PRAGMA table_info({tbl})").fetchall()}
                    if {"content"} & cols and len(cols & {"sender", "nickname", "from", "user"}) > 0:
                        queries.append(f"SELECT * FROM {tbl}")
                except Exception:
                    pass

        for sql in queries:
            try:
                for row in con.execute(sql).fetchall():
                    # Heuristic: first col = time, second = sender, third = content
                    t, sender, content = str(row[0]), str(row[1] or ""), str(row[2] or "")
                    if not content.strip():
                        continue
                    if target and target not in sender:
                        continue
                    results.append(msg(t, sender, content, "wechat"))
                break
            except sqlite3.OperationalError:
                continue
        con.close()
    except Exception as e:
        print(f"❌ WeChat extraction failed: {e}", file=sys.stderr)
    return results


def extract_sqlite(path: Path, target: Optional[str]) -> list:
    """Auto-detect SQLite type and dispatch to the right extractor."""
    tables = _sqlite_tables(path)
    if "message" in tables and "handle" in tables:
        print(f"  → Detected: iMessage database", file=sys.stderr)
        return extract_imessage(path, target)
    if "MSG" in tables or "ChatInfo" in tables:
        print(f"  → Detected: WeChat database", file=sys.stderr)
        return extract_wechat(path, target)
    print(f"  ⚠️  Unknown SQLite schema (tables: {tables}). Trying generic extraction.", file=sys.stderr)
    return extract_wechat(path, target)  # best-effort fallback


# ── Sampler ───────────────────────────────────────────────────────────────────

def load_any(path: Path) -> list:
    """
    Best-effort loader for any readable file.
    Returns a list of message dicts (may be partial for non-standard formats).
    For standard formats the agent should read directly — this is only used
    to count and sample when the file is too large.
    """
    text = path.read_text(encoding="utf-8", errors="ignore")

    # Try JSON first
    try:
        cleaned = re.sub(r"^window\.\w+\s*=\s*", "", text.strip()).rstrip(";")
        data = json.loads(cleaned)
        items = data if isinstance(data, list) else \
                data.get("messages", data.get("statuses", data.get("items", [])))
        if isinstance(items, list) and items:
            results = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                content = str(
                    item.get("content") or item.get("text") or
                    item.get("full_text") or item.get("body") or ""
                )
                content = re.sub(r"<[^>]+>", "", content).strip()
                if not content:
                    continue
                sender = str(
                    item.get("sender") or item.get("from") or
                    item.get("user") or item.get("NickName") or
                    (item.get("author", {}).get("name") if isinstance(item.get("author"), dict) else "") or ""
                )
                t = str(
                    item.get("time") or item.get("date") or
                    item.get("created_at") or item.get("ts") or
                    item.get("create_time") or item.get("timestamp") or ""
                )
                results.append(msg(t, sender, content, "generic"))
            return results
    except Exception:
        pass

    # Plain text: one entry per non-empty line
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    return [msg("", "", line, "plain") for line in lines]


def sample(messages: list, max_count: int, keywords: list = None) -> list:
    """
    Reduce to max_count messages.
    Strategy: keyword-matching messages get priority slots (up to 30%),
    remaining slots filled by time-distributed uniform sampling.
    """
    if len(messages) <= max_count:
        return messages

    kw = [k.lower() for k in (keywords or [])]
    if kw:
        important = [m for m in messages if any(k in m.get("content", "").lower() for k in kw)]
        important_ids = {id(m) for m in important}
        rest = [m for m in messages if id(m) not in important_ids]
        priority_quota = min(len(important), max_count * 3 // 10)
        fill_quota = max_count - priority_quota
    else:
        important, rest = [], messages
        priority_quota, fill_quota = 0, max_count

    # Uniform time-distributed sample from rest
    step = max(1, len(rest) // fill_quota) if fill_quota > 0 else len(rest)
    sampled_rest = rest[::step][:fill_quota]

    result = important[:priority_quota] + sampled_rest
    result.sort(key=lambda x: x.get("time", ""))
    return result[:max_count]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="anyone-skill pre-processor: SQLite extraction + large-file sampling"
    )
    parser.add_argument("--input", required=True,
                        help="SQLite .db file, or any large export file to sample")
    parser.add_argument("--target", help="Filter to this sender name/ID only")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    parser.add_argument("--max", type=int, default=5000,
                        help="Max messages to keep (default: 5000). Only applies to sampling mode.")
    parser.add_argument("--keywords", help="Comma-separated keywords to prioritize during sampling")
    args = parser.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"❌ File not found: {path}", file=sys.stderr)
        sys.exit(1)

    keywords = [k.strip() for k in args.keywords.split(",")] if args.keywords else []

    # SQLite: always extract (binary, agent cannot Read)
    if path.suffix == ".db" or _is_sqlite(path):
        print(f"  Mode: SQLite extraction", file=sys.stderr)
        messages = extract_sqlite(path, args.target)

    # Large file: sample down before agent reads
    else:
        messages = load_any(path)
        if args.target:
            messages = [m for m in messages if args.target in m.get("sender", "")]
        if len(messages) > args.max:
            print(f"  Mode: sampling {len(messages)} → {args.max} messages", file=sys.stderr)
            messages = sample(messages, args.max, keywords)
        else:
            print(f"  Mode: pass-through ({len(messages)} messages, under --max threshold)", file=sys.stderr)
            print(f"  ℹ️  Consider reading this file directly with the Read tool instead.", file=sys.stderr)

    messages.sort(key=lambda x: x.get("time", ""))

    output = json.dumps(messages, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"\n✅ {len(messages)} messages → {args.output}", file=sys.stderr)
    else:
        print(output)
        print(f"\n✅ Total: {len(messages)} messages", file=sys.stderr)


if __name__ == "__main__":
    main()
