#!/usr/bin/env python3
"""Accept a token at a masked terminal prompt; never echo it or replace a key."""
import getpass
import os
from pathlib import Path
import re


def main():
    destination = Path("/opt/ai-business-os/secrets/bitwarden-runtime-token")
    if destination.exists() or destination.is_symlink():
        raise SystemExit("Refusing to overwrite an existing runtime token")
    token = getpass.getpass("Paste Bitwarden token here, then press Enter (hidden): ").strip()
    if not re.fullmatch(r"\d+\.[0-9a-fA-F-]{36}\.[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+", token):
        raise SystemExit("Token structure is invalid; nothing was saved")
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(token + "\n")
        output.flush()
        os.fsync(output.fileno())
    print("Token saved privately. Its value was not displayed.")


if __name__ == "__main__":
    main()
