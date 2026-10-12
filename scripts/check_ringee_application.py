#!/usr/bin/env python3
"""Check the prepared Ringee source before installing or running application code."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "workspaces/ringee-app"


def require_file(name):
    path = APP / name
    if not path.is_file():
        raise ValueError(f"prepared Ringee source is missing {name}")
    return path


def main():
    manifest = json.loads((ROOT / "config/component-patches.json").read_text())
    if "ringee-app" not in manifest["components"]:
        raise ValueError("ringee-app is absent from the patch manifest")
    package = json.loads(require_file("package.json").read_text())
    pnpm = package.get("packageManager", "")
    if not re.fullmatch(r"pnpm@\d+\.\d+\.\d+", pnpm):
        raise ValueError("Ringee must pin an exact pnpm version")
    lock = require_file("pnpm-lock.yaml").read_text()
    workspace = require_file("pnpm-workspace.yaml").read_text()
    npmrc = require_file(".npmrc").read_text()
    if f"specifier: {pnpm.removeprefix('pnpm@')}" not in lock:
        raise ValueError("pnpm lock does not contain the pinned package manager")
    for importer in ("apps/backend", "apps/orchestrator", "packages/platform", "packages/services", "packages/database"):
        if f"  {importer}:" not in lock:
            raise ValueError(f"pnpm lock is missing {importer}")
    if "onlyBuiltDependencies:" not in workspace or "ignoredBuiltDependencies:" not in workspace:
        raise ValueError("pnpm workspace build policy is missing")
    if "registry=https://registry.npmjs.org/" not in npmrc:
        raise ValueError("Ringee registry pin is missing")
    for name in (
        "packages/platform/src/email/ses.provider.test.ts",
        "packages/platform/src/email/mautic-feedback.client.test.ts",
        "packages/platform/src/email/ses-feedback.test.ts",
        "packages/platform/src/email/sns-feedback.verifier.test.ts",
        "packages/services/src/services/email.service.spec.ts",
        "packages/services/src/services/email-feedback.service.spec.ts",
        "apps/backend/tsconfig.build.json",
        "packages/database/prisma/migrations/20261011000000_fresh_install_baseline/migration.sql",
        "packages/database/prisma/migrations/20261012000000_email_streams/migration.sql",
        "packages/database/prisma/tests/bootstrap-invariants.sql",
        "packages/database/prisma/tests/email-invariants.sql",
    ):
        require_file(name)
    for name in ("bootstrap-invariants.sql", "email-invariants.sql"):
        sql = require_file(f"packages/database/prisma/tests/{name}").read_text().strip()
        if not sql.startswith("-- Run only against a disposable") or not sql.endswith("ROLLBACK;"):
            raise ValueError(f"SQL fixture must be disposable and roll back: {name}")
    print(f"Prepared Ringee source includes {pnpm}, offline email tests, TypeScript config, and disposable SQL fixtures.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
