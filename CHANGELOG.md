# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open-source release preparation: MIT license, contributing guide, code of
  conduct, security policy, issue/PR templates.
- Self-hosting documentation with minimum/recommended server requirements.

## [0.1.0] - 2026-10-16

### Added
- Initial public release of the AI Business OS integration repository.
- Cumulative patch model against pinned upstream sources (Twenty, Ringee,
  Mautic) with fingerprint-verified reconstruction.
- Better Auth cutover (workstreams 1–4): backend auth core, provisioning and
  organization lifecycle, realtime one-use tickets, frontend cutover.
- Deployment tooling for Ringee, Twenty, and Mautic via Docker Compose.
- CI workflows: application build/test, Better Auth proofs, runtime image.
