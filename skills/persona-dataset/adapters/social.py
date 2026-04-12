"""
Social media adapter.

Handles X (Twitter) archive and Instagram archive.
"""

import json
import re
from pathlib import Path


def parse(source_path: str, *, persona_name: str = '', since: str | None = None, **kwargs) -> list[dict]:
    p = Path(source_path)

    if not p.is_dir():
        raise ValueError(f'Social adapter expects a directory, got: {source_path}')

    if (p / 'data' / 'tweets.js').exists():
        return _parse_twitter(p, persona_name=persona_name)

    if (p / 'content' / 'posts_1.json').exists():
        return _parse_instagram(p, persona_name=persona_name)

    raise ValueError(
        f'Unrecognized social archive format in: {source_path}\n'
        'Expected Twitter archive (data/tweets.js) or Instagram (content/posts_1.json)'
    )


# --- X / Twitter ---

def _parse_twitter(archive_dir: Path, *, persona_name: str) -> list[dict]:
    tweets_js = archive_dir / 'data' / 'tweets.js'
    raw = tweets_js.read_text(errors='replace')

    # Strip JS wrapper: window.YTD.tweets.part0 = [...]
    json_start = raw.find('[')
    if json_start == -1:
        raise ValueError('Cannot find JSON array in tweets.js')
    data = json.loads(raw[json_start:])

    messages = []
    for item in data:
        tweet = item.get('tweet', item)
        text = tweet.get('full_text', tweet.get('text', ''))

        if not text or text.startswith('RT @'):
            continue

        # Strip t.co URLs for cleaner content
        text = re.sub(r'https?://t\.co/\S+', '', text).strip()
        if not text:
            continue

        ts = tweet.get('created_at')
        if ts:
            ts = _parse_twitter_ts(ts)

        is_reply = tweet.get('in_reply_to_screen_name') is not None
        is_quote = 'quoted_status' in tweet or 'quoted_status_id_str' in tweet

        messages.append({
            'role': 'assistant',
            'content': text,
            'timestamp': ts,
            'source_file': 'tweets.js',
            'source_type': 'twitter',
            'metadata': {
                'tweet_id': tweet.get('id_str', ''),
                'is_reply': is_reply,
                'is_quote': is_quote,
                'reply_to': tweet.get('in_reply_to_screen_name', ''),
            },
        })

    # DMs (optional)
    dms_js = archive_dir / 'data' / 'direct-messages.js'
    if dms_js.exists():
        messages.extend(_parse_twitter_dms(dms_js, persona_name=persona_name))

    return messages


def _parse_twitter_dms(dms_path: Path, *, persona_name: str) -> list[dict]:
    raw = dms_path.read_text(errors='replace')
    json_start = raw.find('[')
    if json_start == -1:
        return []

    try:
        data = json.loads(raw[json_start:])
    except json.JSONDecodeError:
        return []

    messages = []
    for convo in data:
        dm_convo = convo.get('dmConversation', {})
        for msg in dm_convo.get('messages', []):
            msg_data = msg.get('messageCreate', {})
            text = msg_data.get('text', '')
            if not text.strip():
                continue

            sender_id = msg_data.get('senderId', '')
            ts = msg_data.get('createdAt')

            messages.append({
                'role': 'assistant',
                'content': text.strip(),
                'timestamp': ts,
                'source_file': 'direct-messages.js',
                'source_type': 'twitter-dm',
                'metadata': {'sender_id': sender_id},
            })

    return messages


def _parse_twitter_ts(raw: str) -> str | None:
    """Parse Twitter's timestamp format: 'Wed Oct 10 20:19:24 +0000 2012'"""
    try:
        from datetime import datetime
        dt = datetime.strptime(raw, '%a %b %d %H:%M:%S %z %Y')
        return dt.isoformat()
    except ValueError:
        return raw


# --- Instagram ---

def _parse_instagram(archive_dir: Path, *, persona_name: str) -> list[dict]:
    messages = []

    # Posts
    for posts_file in sorted((archive_dir / 'content').glob('posts_*.json')):
        try:
            data = json.loads(posts_file.read_text(errors='replace'))
        except json.JSONDecodeError:
            continue

        if isinstance(data, list):
            for post in data:
                media_list = post.get('media', [post]) if 'media' in post else [post]
                for media in media_list:
                    caption = media.get('title', media.get('caption', ''))
                    if not caption or not caption.strip():
                        continue

                    ts = media.get('creation_timestamp')
                    if isinstance(ts, (int, float)):
                        from datetime import datetime
                        ts = datetime.fromtimestamp(ts).isoformat()

                    messages.append({
                        'role': 'assistant',
                        'content': caption.strip(),
                        'timestamp': str(ts) if ts else None,
                        'source_file': posts_file.name,
                        'source_type': 'instagram',
                        'metadata': {'type': 'post'},
                    })

    # DMs (optional)
    inbox = archive_dir / 'messages' / 'inbox'
    if inbox.exists():
        messages.extend(_parse_instagram_dms(inbox, persona_name=persona_name))

    return messages


def _parse_instagram_dms(inbox_dir: Path, *, persona_name: str) -> list[dict]:
    messages = []
    persona_lower = persona_name.lower().strip()

    for convo_dir in inbox_dir.iterdir():
        if not convo_dir.is_dir():
            continue
        for msg_file in sorted(convo_dir.glob('message_*.json')):
            try:
                data = json.loads(msg_file.read_text(errors='replace'))
            except json.JSONDecodeError:
                continue

            for msg in data.get('messages', []):
                content = msg.get('content', '')
                if not content or not content.strip():
                    continue

                sender = msg.get('sender_name', '')
                is_persona = bool(persona_lower and persona_lower in sender.lower())

                ts = msg.get('timestamp_ms')
                if isinstance(ts, (int, float)):
                    from datetime import datetime
                    ts = datetime.fromtimestamp(ts / 1000).isoformat()

                messages.append({
                    'role': 'assistant' if is_persona else 'user',
                    'content': content.strip(),
                    'timestamp': str(ts) if ts else None,
                    'source_file': f'{convo_dir.name}/{msg_file.name}',
                    'source_type': 'instagram-dm',
                    'metadata': {'sender': sender},
                })

    return messages
