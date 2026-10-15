#!/usr/bin/env python3
"""Create fresh Ringee secrets on the target; never print or overwrite keys."""
import argparse
import os
from pathlib import Path
import secrets
import stat


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    destination = args.destination
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.exists() or destination.is_symlink():
        raise SystemExit("Refusing to replace an existing secret file")
    values = {
        "APP_ENCRYPTION_SECRET": secrets.token_hex(32),
        "BETTER_AUTH_SECRET": secrets.token_hex(32),
    }
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write("".join(f"{name}={value}\n" for name, value in values.items()))
        output.flush()
        os.fsync(output.fileno())
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    print("Created secret file with mode 0600; values were not displayed.")


if __name__ == "__main__":
    main()
