#!/usr/bin/env python3
"""
Wiki health check and MemPalace coverage analysis.

Checks:
- Broken [[wikilinks]]
- Empty or stub pages
- Unresolved contradictions
- Evidence coverage per page
- Source coverage (MemPalace entries not reflected in wiki)

Usage:
    python scripts/lint_wiki.py --slug sam
    python scripts/lint_wiki.py --slug sam --fix-links
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

DATASETS_ROOT = Path(os.environ.get(
    'OPENPERSONA_DATASETS',
    Path.home() / '.openpersona' / 'datasets'
))

WIKILINK_PATTERN = re.compile(r'\[\[([^\]|]+)(?:\|[^\]]+)?\]\]')
EVIDENCE_PATTERN = re.compile(r'\[L(\d)(?::[\w-]+)?\]')


def main():
    parser = argparse.ArgumentParser(description='Wiki health check for persona dataset')
    parser.add_argument('--slug', required=True, help='Persona dataset slug')
    parser.add_argument('--fix-links', action='store_true', help='Auto-create missing link targets')
    parser.add_argument('--json', action='store_true', help='Output as JSON')

    args = parser.parse_args()

    dataset_dir = DATASETS_ROOT / args.slug
    wiki_dir = dataset_dir / 'wiki'

    if not wiki_dir.exists():
        print(f'❌ Wiki not found: {wiki_dir}', file=sys.stderr)
        sys.exit(1)

    report = lint_wiki(wiki_dir, dataset_dir, fix_links=args.fix_links)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_report(report)

    sys.exit(1 if report['issues'] else 0)


def lint_wiki(wiki_dir: Path, dataset_dir: Path, *, fix_links: bool = False) -> dict:
    pages = {}
    for md in wiki_dir.glob('*.md'):
        pages[md.stem] = md.read_text()

    issues = []
    warnings = []

    # 1. Broken wikilinks (skip system pages — they contain example/doc wikilinks)
    for page_name, content in pages.items():
        if page_name.startswith('_'):
            continue
        for match in WIKILINK_PATTERN.finditer(content):
            target = match.group(1).strip()
            if target not in pages:
                issues.append({
                    'type': 'broken_link',
                    'page': page_name,
                    'target': target,
                    'message': f'{page_name}.md → [[{target}]] (target not found)',
                })
                if fix_links:
                    _create_stub_page(wiki_dir, target)

    # 2. Empty/stub pages
    for page_name, content in pages.items():
        if page_name.startswith('_'):
            continue
        stripped = content.strip()
        if len(stripped) < 100 or '(awaiting' in content:
            warnings.append({
                'type': 'empty_page',
                'page': page_name,
                'message': f'{page_name}.md is empty or stub ({len(stripped)} chars)',
            })

    # 3. Unresolved contradictions
    contradictions_content = pages.get('_contradictions', '')
    unresolved = _count_unresolved_contradictions(contradictions_content)
    if unresolved > 0:
        warnings.append({
            'type': 'unresolved_contradictions',
            'count': unresolved,
            'message': f'{unresolved} unresolved contradiction(s) in _contradictions.md',
        })

    # 4. Evidence coverage
    evidence_stats = {}
    for page_name, content in pages.items():
        if page_name.startswith('_'):
            continue
        counts = {'L1': 0, 'L2': 0, 'L3': 0, 'L4': 0}
        for match in EVIDENCE_PATTERN.finditer(content):
            level = f'L{match.group(1)}'
            counts[level] = counts.get(level, 0) + 1
        total = sum(counts.values())
        evidence_stats[page_name] = counts

        if total < 2 and len(content.strip()) > 100:
            warnings.append({
                'type': 'low_evidence',
                'page': page_name,
                'count': total,
                'message': f'{page_name}.md has only {total} evidence tag(s) (minimum: 2)',
            })

    # 5. Source coverage (MemPalace vs wiki)
    coverage = _check_source_coverage(dataset_dir, pages)
    if coverage['gap_pct'] > 30:
        warnings.append({
            'type': 'low_source_coverage',
            'coverage_pct': 100 - coverage['gap_pct'],
            'message': (
                f'Only ~{100 - coverage["gap_pct"]}% of ingested sources '
                f'are reflected in wiki pages'
            ),
        })

    # 6. Changelog recency — count actual data rows
    # Separator lines (|------|...) are already excluded (all-dash content → empty set).
    # Only subtract 1 for the header row.
    changelog_content = pages.get('_changelog', '')
    changelog_data_rows = sum(
        1 for line in changelog_content.splitlines()
        if '|' in line and not line.startswith('#') and not line.startswith('>')
        and not set(line.strip().replace('|', '').replace('-', '').replace(' ', '')) <= {''}
    ) - 1  # subtract header row (separator row is already excluded by the set check)
    if changelog_data_rows < 1:
        warnings.append({
            'type': 'empty_changelog',
            'message': '_changelog.md has no recorded updates',
        })

    return {
        'slug': dataset_dir.name,
        'wiki_pages': len(pages),
        'content_pages': sum(1 for p in pages if not p.startswith('_')),
        'issues': issues,
        'warnings': warnings,
        'evidence': evidence_stats,
        'source_coverage': coverage,
    }


def _count_unresolved_contradictions(content: str) -> int:
    """Count ## sections not marked as resolved."""
    count = 0
    in_section = False
    resolved = False

    for line in content.splitlines():
        if line.startswith('## '):
            if in_section and not resolved:
                count += 1
            in_section = True
            resolved = False
        elif 'resolved' in line.lower() or 'Status: resolved' in line:
            resolved = True

    if in_section and not resolved:
        count += 1

    return count


def _check_source_coverage(dataset_dir: Path, pages: dict) -> dict:
    """Compare source file references in wiki against actual sources."""
    sources_dir = dataset_dir / 'sources'
    if not sources_dir.exists():
        return {'total_sources': 0, 'referenced': 0, 'gap_pct': 0}

    source_files = [
        f.name for f in sources_dir.iterdir()
        if not f.name.startswith('.') and f.suffix in ('.jsonl', '.txt', '.json')
    ]

    all_wiki_text = '\n'.join(pages.values())
    referenced = sum(1 for sf in source_files if sf.replace('.jsonl', '') in all_wiki_text or sf in all_wiki_text)

    total = len(source_files) or 1
    gap_pct = round((total - referenced) / total * 100)

    return {
        'total_sources': len(source_files),
        'referenced': referenced,
        'unreferenced': [sf for sf in source_files if sf.replace('.jsonl', '') not in all_wiki_text and sf not in all_wiki_text],
        'gap_pct': gap_pct,
    }


def _create_stub_page(wiki_dir: Path, page_name: str):
    page_path = wiki_dir / f'{page_name}.md'
    if page_path.exists():
        return

    page_path.write_text(
        f'# {page_name.replace("-", " ").title()}\n\n'
        f'> (auto-created stub — populate with data)\n\n'
        f'## Content\n\n## Sources\n\n## See also\n'
    )
    print(f'   📝 Created stub: {page_name}.md')


def _print_report(report: dict):
    print(f'🔍 Wiki lint: {report["slug"]}')
    print(f'   Pages: {report["content_pages"]} content + {report["wiki_pages"] - report["content_pages"]} system')

    if not report['issues'] and not report['warnings']:
        print(f'\n   ✅ All checks passed!')
        return

    if report['issues']:
        print(f'\n   ❌ Issues ({len(report["issues"])}):')
        for issue in report['issues']:
            print(f'      - {issue["message"]}')

    if report['warnings']:
        print(f'\n   ⚠️  Warnings ({len(report["warnings"])}):')
        for warn in report['warnings']:
            print(f'      - {warn["message"]}')

    # Evidence summary
    print(f'\n   📊 Evidence coverage:')
    for page, counts in sorted(report.get('evidence', {}).items()):
        total = sum(counts.values())
        bar = '█' * min(total, 20)
        print(f'      {page:20s} {bar} ({total})')

    # Source coverage
    cov = report.get('source_coverage', {})
    if cov.get('total_sources', 0) > 0:
        print(f'\n   📂 Source coverage: {cov.get("referenced", 0)}/{cov["total_sources"]} files referenced')
        for uf in cov.get('unreferenced', [])[:5]:
            print(f'      - {uf} (not in any wiki page)')


if __name__ == '__main__':
    main()
