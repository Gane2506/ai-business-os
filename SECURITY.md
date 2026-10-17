# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes are provided for the latest release
only.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < latest| :x:                |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Use [GitHub Private Vulnerability Reporting](../../security/advisories/new)
(the preferred channel). If that is unavailable, contact the maintainers
through the contact listed in the repository profile.

Please include:

- A description of the vulnerability
- Steps to reproduce (proof of concept if possible)
- Affected versions / commit SHAs
- Your assessment of impact
- Suggested fix, if you have one

## Response Timeline

This is a small, best-effort project. We aim to:

- Acknowledge reports within **72 hours**
- Provide status updates as the fix progresses
- Publish a GitHub Security Advisory once a fix is available

We follow coordinated disclosure with a 90-day default window. Reporters are
credited in the advisory unless they prefer to remain anonymous.

## Scope

In scope: vulnerabilities that enable malicious exploitation of a deployed
instance (authentication bypass, privilege escalation, remote code execution,
secret exposure, SSRF that reaches internal services).

Out of scope (please file as public issues instead): hardening suggestions,
missing rate limits without demonstrated abuse, best-practice deviations that
do not enable exploitation, and vulnerabilities in upstream dependencies
(report those upstream; we track them via Dependabot).

## Secrets

If you discover a committed secret (API key, token, private key) in this
repository's history, report it via the same private channel. Do not open a
public issue, PR, or discussion containing the secret value.
