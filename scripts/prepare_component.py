#!/usr/bin/env python3
"""Create an isolated pinned component checkout and apply reviewed local patches."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(*args, cwd=None, check=True):
    return subprocess.run(args, cwd=cwd, check=check, capture_output=True, text=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('component', help='component name in config/component-patches.json')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'config/component-patches.json').read_text())
    config = manifest['components'][args.component]
    if not config['patches']:
        raise SystemExit('No reviewed patches are registered for this component.')
    lock = json.loads((ROOT / 'config/upstream-lock.json').read_text())
    source = next(r for r in lock['repositories'] if r['name'] == args.component)
    if config['base_commit'] != source['commit']:
        raise SystemExit('Patch base differs from locked source; review the manifest first.')
    patches = []
    for entry in config['patches']:
        path = ROOT / entry['path']
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise SystemExit(f'Patch fingerprint mismatch: {entry["path"]}')
        patches.append(path)
    upstream = ROOT / source['path']
    head = run('git', '-C', str(upstream), 'rev-parse', 'HEAD').stdout.strip()
    if head != source['commit']:
        raise SystemExit('Upstream checkout does not match the locked revision.')
    target = ROOT / 'workspaces' / args.component
    if target.exists():
        existing = run('git', '-C', str(target), 'rev-parse', 'HEAD').stdout.strip()
        if existing != source['commit']:
            raise SystemExit('Existing workspace has a different HEAD; left untouched.')
        # A reverse check shows each complete patch is already present. Never reset files.
        if all(run('git', '-C', str(target), 'apply', '--reverse', '--check', str(p), check=False).returncode == 0 for p in patches):
            print(f'{args.component}: patches already present; workspace left untouched.')
            return
        if run('git', '-C', str(target), 'status', '--porcelain').stdout.strip():
            raise SystemExit('Existing workspace contains changes; left untouched.')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        run('git', '-C', str(upstream), 'worktree', 'add', '--detach', str(target), source['commit'])
    # Check the complete series together before making any source changes.
    run('git', '-C', str(target), 'apply', '--check', *(str(p) for p in patches))
    run('git', '-C', str(target), 'apply', *(str(p) for p in patches))
    print(f'{args.component}: applied {len(patches)} patches at {source["commit"]} in {target}')

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.stderr.strip() or str(exc)) from exc
