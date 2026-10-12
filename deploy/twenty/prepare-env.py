#!/usr/bin/env python3
"""Generate infrastructure credentials on the deployment host without printing them."""
import base64
import os
from pathlib import Path
import secrets


def main():
    destination = Path(__file__).resolve().parent / ".env"
    contents = "\n".join([
        "SERVER_URL=https://os.connectxmedia.com",
        "PG_DATABASE_USER=twenty",
        "PG_DATABASE_NAME=twenty",
        f"PG_DATABASE_PASSWORD={secrets.token_hex(32)}",
        f"ENCRYPTION_KEY={base64.b64encode(secrets.token_bytes(32)).decode('ascii')}",
        "",
    ])
    # Exclusive creation prevents replacing keys for an existing database.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as file:
        file.write(contents)
    print(f"Created {destination} with mode 0600. Back up this file securely before startup.")


if __name__ == "__main__":
    main()
