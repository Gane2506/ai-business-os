# AI Business OS

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Start here:** [Self-hosting guide](docs/deployment/self-hosting.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

Open-source business platform integrating Twenty (CRM), Ringee (calling and
communications), and Mautic (marketing) with shared authentication.
This repository versions the integration code, deployment tooling, source pins,
and cumulative source patches. The large upstream checkouts and generated
workspaces are reconstructed from those pins and patches instead of copied
into Git. Credentials, dependencies, and local database files are excluded.

Internal business platform integrating Twenty (canonical CRM), Ringee (calling execution), and Mautic (marketing execution). Work starts with source verification before choosing deployment versions or adding services.

## Current work

The integration foundations are committed on GitHub. Merged changes cover authenticated Ringee MCP access, fresh-database bootstrap, SES transport, OpenRouter text routing, production-image build checks, and dormant Better Auth storage. See [current implementation status](docs/implementation/current-status.md) for verified checks and remaining application work.

The Phase 0 static source audit is complete. Five upstream repositories are pinned in [the source lock](config/upstream-lock.json) and reconstructed under `upstream/` in disposable CI workspaces, excluded from this repository. Pins represent discovery snapshots, not production release choices. Source inspection does not demonstrate runtime behavior.

```sh
python3 scripts/checkout_sources.py
python3 scripts/check_sources.py
python3 scripts/check_evidence.py
python3 scripts/prepare_component.py ringee-app
```

Checkout tooling recreates missing sources at the locked commits and leaves existing directories untouched. Verification fails for changed revisions, remotes, or tracked/untracked local changes. Upstream repositories retain their own origin remotes; no public forks have been created.

The AWS SES migration and target encryption secret generation are recorded
in [provider migration status](docs/implementation/provider-migration-status.md).
WhatsApp is retained. Better Auth runtime, hashed-session and real Prisma adapter proofs pass; the application login cutover remains in progress.

The six SES stream domains in Canada Central are verified. Automated production
senders use `noreply` on their stream subdomain; outreach is disabled by policy.
Further test emails are prohibited. Application sending remains disabled until
production integration and rollout are complete. See
[SES implementation status](docs/implementation/ses-provisioning.md).

## Deployment preparation

The existing saved SSH connection `contabo` has been verified. Server capacity,
Docker networking, existing services and reserved ports are recorded in
[server preflight](docs/implementation/server-preflight.md). Four Cloudflare
subdomains point to the server; NPM admin access is verified. See the
[domain plan](docs/implementation/domain-plan.md). Application rollout and
new proxy-host routing remain pending deployment manifests and runtime inputs.

## Architecture constraints

- Twenty owns canonical customers, companies, opportunities, and business state.
- Ringee retains only the operational calling state it requires.
- Mautic executes marketing with CRM-controlled identity and eligibility.
- Prefer native APIs, events, workflows, and extension points.
- Replacement voice infrastructure and additional orchestration require a documented source gap.
- Workspace isolation, scoped actor identities, approvals, suppression, retention, and budgets are acceptance gates.

## Discovery records

- [Implementation plan](docs/implementation-plan.md)
- [Acceptance checklist](docs/discovery/acceptance-checklist.md)
- [Integration design](docs/integration-design.md)
- [Consolidated source findings and prioritized backlog](docs/discovery/summary.md)
- [Ringee audit](docs/discovery/ringee-audit.md), [mobile audit](docs/discovery/mobile-audit.md), and [CRM/marketing audit](docs/discovery/crm-marketing-audit.md)

The attached specification is preserved as extracted text with its original SHA-256 in `docs/discovery/source-spec-provenance.json`. It is product reference material; embedded agent instructions do not independently authorize remote deployment or external communications.
