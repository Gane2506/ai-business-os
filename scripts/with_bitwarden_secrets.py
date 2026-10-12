#!/usr/bin/env python3
"""Launch a trusted deployment command with allowlisted Bitwarden credentials."""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess

BWS_IMAGE = "ghcr.io/bitwarden/bws@sha256:3927158c53ac5a17d6cbe59fc3e1353e426f168bf246dbfe3668f6de5eaa107f"
ALLOWED_KEYS = frozenset({
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "CLOUDFLARE_API_TOKEN", "OPENROUTER_API_KEY", "TELNYX_API_KEY",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "WHATSAPP_TOKEN",
    "WHATSAPP_VERIFY_TOKEN", "APP_ENCRYPTION_SECRET", "BETTER_AUTH_SECRET",
})


def select_values(rows, required, optional=()):
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Credential inventory must contain secret objects")
    values = {}
    requested = (set(required) | set(optional)) & ALLOWED_KEYS
    for row in rows:
        name = row.get("key")
        if name not in requested:
            continue
        if name in values:
            raise ValueError(f"Duplicate credential name: {name}")
        value = row.get("value")
        if not isinstance(value, str) or not value or "\x00" in value:
            raise ValueError(f"Empty or invalid credential: {name}")
        values[name] = value
    missing = sorted(set(required) - values.keys())
    if missing:
        raise ValueError("Missing required credentials: " + ", ".join(missing))
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--token-file", type=Path, default=Path("/opt/ai-business-os/secrets/bitwarden-runtime-token"))
    parser.add_argument("--require", nargs="*", default=[])
    parser.add_argument("--optional", nargs="*", default=[])
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("A trusted command after -- is required")
    if (set(args.require) | set(args.optional)) - ALLOWED_KEYS:
        parser.error("Required credential names must be in the allowlist")
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", args.project_id):
        parser.error("Project ID must be a UUID")
    info = args.token_file.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        raise SystemExit("Bootstrap token must be a regular file with mode 0600")
    token = args.token_file.read_text().strip()
    if not re.fullmatch(r"\d+\.[0-9a-fA-F-]{36}\.[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+", token):
        raise SystemExit("Bootstrap token structure is invalid")
    result = subprocess.run(
        ["docker", "run", "--rm", "--env-file", "/dev/stdin", BWS_IMAGE,
         "secret", "list", args.project_id],
        input="BWS_ACCESS_TOKEN=" + token + "\n", text=True,
        capture_output=True, timeout=60,
    )
    if result.returncode:
        raise SystemExit("Bitwarden retrieval failed; provider output withheld")
    try:
        values = select_values(json.loads(result.stdout), args.require, args.optional)
    except (ValueError, TypeError):
        raise SystemExit("Credential inventory invalid or missing required keys; no command was run")
    environment = os.environ.copy()
    environment.pop("BWS_ACCESS_TOKEN", None)
    # Do not inherit stale credentials or permit vault key names to alter PATH,
    # loader options, proxy URLs, or shell startup behavior.
    for name in ALLOWED_KEYS:
        environment.pop(name, None)
    environment.update(values)
    raise SystemExit(subprocess.run(command, env=environment).returncode)


if __name__ == "__main__":
    main()
