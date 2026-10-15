#!/usr/bin/env python3
"""Recreate missing audit sources; never reset an existing checkout."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
lock = json.loads((ROOT / 'config/upstream-lock.json').read_text())
for repo in lock['repositories']:
    destination = ROOT / repo['path']
    if destination.exists():
        print(f"Keeping existing {repo['name']}; use check_sources.py to verify it.")
        continue
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'init', str(destination)], check=True)
    subprocess.run(['git', '-C', str(destination), 'remote', 'add', 'origin', repo['url']], check=True)
    subprocess.run(['git', '-C', str(destination), 'fetch', '--depth', '1', 'origin', repo['commit']], check=True)
    subprocess.run(['git', '-C', str(destination), 'checkout', '--detach', repo['commit']], check=True)
