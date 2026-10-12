#!/usr/bin/env python3
"""Check source report pins, file paths, line anchors and evidence identifiers."""
import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
lock = json.loads((ROOT / 'config/upstream-lock.json').read_text())
repositories = {
    r['url'].removesuffix('.git').removeprefix('https://github.com/'): r
    for r in lock['repositories']
}
errors = []
count = 0
pattern = r'https://github.com/([^/]+/[^/]+)/blob/([0-9a-f]{40})/([^\s)]+?)#L(\d+)(?:-L(\d+))?'
for report in (ROOT / 'docs/discovery').glob('*audit.md'):
    content = report.read_text()
    # Ringee uses individual evidence identifiers with a source index table.
    if report.name == 'ringee-audit.md':
        used = set(re.findall(r'\[([A-Z]\d{2})\]', content))
        defined = set(re.findall(r'^\|\s*([A-Z]\d{2})\s*\|', content, re.MULTILINE))
        defined.update(re.findall(r'^- \*\*([A-Z]\d{2}):\*\*', content, re.MULTILINE))
        for missing in sorted(used - defined):
            errors.append(f'{report.name}: unresolved evidence ID {missing}')
    for repo, sha, filename, start, end in re.findall(pattern, content):
        count += 1
        item = repositories.get(repo)
        if not item or sha != item['commit']:
            errors.append(f'{report.name}: unknown repository or mismatched pin: {repo}')
            continue
        path = ROOT / item['path'] / unquote(filename)
        if not path.is_file():
            errors.append(f'{report.name}: missing source path: {filename}')
            continue
        lines = len(path.read_text(errors='replace').splitlines())
        if not 1 <= int(start) <= int(end or start) <= lines:
            errors.append(f'{report.name}: invalid line anchor: {filename}:{start}-{end}')
print(f'Checked {count} pinned source evidence links.')
for error in errors:
    print(error)
if errors:
    raise SystemExit(1)
print('Evidence identifiers, source paths and line anchors resolve. Claims still require review.')
