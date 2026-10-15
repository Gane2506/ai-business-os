#!/usr/bin/env python3
"""Verify audit checkouts match the reviewed revisions without modifying them."""
import json
import hashlib
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args], text=True).strip()

def main():
    lock = json.loads((ROOT / 'config/upstream-lock.json').read_text())
    errors = []
    for item in lock['repositories']:
        path = ROOT / item['path']
        try:
            if git(path, 'rev-parse', 'HEAD') != item['commit']:
                errors.append(f"{item['name']}: HEAD differs from audit pin")
            if git(path, 'status', '--porcelain'):
                errors.append(f"{item['name']}: checkout has local changes")
            if git(path, 'remote', 'get-url', 'origin') != item['url']:
                errors.append(f"{item['name']}: origin differs from lock")
            for filename, expected in item['license_sha256'].items():
                actual = hashlib.sha256((path / filename).read_bytes()).hexdigest()
                if actual != expected:
                    errors.append(f"{item['name']}: license fingerprint changed: {filename}")
        except (OSError, subprocess.CalledProcessError):
            errors.append(f"{item['name']}: checkout unavailable")
    for error in errors:
        print(error)
    if errors:
        raise SystemExit(1)
    print(f"Verified {len(lock['repositories'])} clean checkouts at their audit pins.")

if __name__ == '__main__':
    main()
