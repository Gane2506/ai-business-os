# Contributing to AI Business OS

Thank you for your interest in contributing! This document will get you from
zero to a working development setup and explain how we work.

## Quickstart

```sh
# 1. Reconstruct the upstream sources and workspaces (nothing is vendored)
python3 scripts/checkout_sources.py
python3 scripts/check_sources.py
python3 scripts/prepare_component.py ringee-app

# 2. Verify the repository state
python3 scripts/check_repository.py
```

The repository holds **integration code, deployment tooling, source pins, and a
cumulative source patch** — not vendored applications. Large upstream checkouts
are reconstructed from pins and patches. See `docs/implementation/HANDOFF.md`
for the full architecture.

## How We Work

- **Issues first**: open an issue describing the problem before large PRs.
- **Small, focused PRs**: one logical change per PR. Keep diffs reviewable.
- **Tests with changes**: add or update tests alongside behavior changes.
- **No dead code**: remove what you replace; don't leave commented-out blocks.
- **Conventional Commits**: use `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
  prefixes so changelogs can be generated.

## Development Setup

Prerequisites: Python 3.11+, Node 22, pnpm 10+, Docker.

```sh
# Install Ringee application dependencies (from its lockfile)
cd workspaces/ringee-app
pnpm install --frozen-lockfile
```

See `docs/implementation/HANDOFF.md` §8 for the critical engineering
contracts (cumulative-patch rules, identity invariants, credential separation).
Read it before touching `patches/`.

## Pull Request Process

1. Fork and create a branch from `main` (`feat/...`, `fix/...`).
2. Make your change; run the relevant checks (`python3 scripts/check_repository.py`
   at minimum).
3. Update `CHANGELOG.md` under `[Unreleased]` if the change is user-facing.
4. Open a PR using the template; link the issue it closes.
5. A maintainer will review. We aim to respond within a week (best effort).

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE). Please sign off your commits (`git commit -s`) to
attest you have the right to submit them (Developer Certificate of Origin).

## Reporting Bugs

Use the bug report template (`.github/ISSUE_TEMPLATE/bug_report.yml`) and
include: what you did, what you expected, what happened, versions/commit SHA,
and logs. See [SECURITY.md](SECURITY.md) for vulnerabilities — do not file
those as public issues.

## Code of Conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
