#!/usr/bin/env python3
"""Validate tracked JSON, locked source metadata, and patch fingerprints."""

import hashlib
import json
import re
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")


def project_file(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"unsafe project path: {name}")
    result = ROOT.joinpath(*path.parts)
    if not result.is_file() or result.is_symlink():
        raise ValueError(f"missing or linked project file: {name}")
    return result


def main():
    json_files = [*ROOT.joinpath("config").glob("*.json")]
    json_files += [*ROOT.joinpath("deploy", "email").rglob("*.json")]
    json_files += [*ROOT.joinpath("docs", "discovery").glob("*.json")]
    json_files += [*ROOT.joinpath("docs", "implementation", "evidence").glob("*.json")]
    json_files = sorted(path for path in json_files if "node_modules" not in path.parts)
    for path in json_files:
        json.loads(path.read_text(encoding="utf-8"))

    lock = json.loads(project_file("config/upstream-lock.json").read_text())
    manifest = json.loads(project_file("config/component-patches.json").read_text())
    if lock.get("schema_version") != 1 or manifest.get("schema_version") != 1:
        raise ValueError("unsupported lock or patch manifest schema")
    sources = {}
    for source in lock["repositories"]:
        name = source["name"]
        if name in sources or not COMMIT.fullmatch(source["commit"]):
            raise ValueError(f"duplicate source or invalid commit: {name}")
        if source["path"] != f"upstream/{name}":
            raise ValueError(f"unexpected source path: {name}")
        if not source["url"].startswith("https://github.com/") or not source["url"].endswith(".git"):
            raise ValueError(f"unexpected source URL: {name}")
        sources[name] = source

    if not manifest["components"]:
        raise ValueError("patch manifest has no components")
    patch_count = 0
    for name, component in manifest["components"].items():
        if name not in sources or component["base_commit"] != sources[name]["commit"]:
            raise ValueError(f"patch base differs from source lock: {name}")
        if not component["patches"]:
            raise ValueError(f"component has no patches: {name}")
        for entry in component["patches"]:
            patch_name = entry["path"]
            if not patch_name.startswith(f"patches/{name}/") or not patch_name.endswith(".patch"):
                raise ValueError(f"unexpected patch path: {patch_name}")
            if not SHA256.fullmatch(entry["sha256"]):
                raise ValueError(f"invalid patch fingerprint: {patch_name}")
            actual = hashlib.sha256(project_file(patch_name).read_bytes()).hexdigest()
            if actual != entry["sha256"]:
                raise ValueError(f"patch fingerprint mismatch: {patch_name}")
            patch_count += 1
    print(f"Validated {len(json_files)} JSON files, {len(sources)} source pins, and {patch_count} patch fingerprints.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(str(exc)) from exc
