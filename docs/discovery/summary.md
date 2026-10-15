# Source discovery findings

The first static audit is complete for five pinned upstream repositories. The integrated platform has not been deployed or runtime-tested. Audit pins and license fingerprints are recorded in `config/upstream-lock.json`; these are not production release selections.

## Architecture supported by the source

Reuse Twenty as canonical CRM and its native agents, workflows, MCP and application extension surfaces. Reuse Ringee's existing human calling, Telnyx AI outbound calls and inbound receptionist rather than building a new voice stack. Use Mautic's contact, segment, campaign and webhook primitives for marketing. Prefer separate Mautic installations for required isolated client boundaries because Projects grouping is not a tenant authorization boundary.

Ringee App's inspected call path uses Telnyx. Ringee Voice contains Asterisk-derived source, but no App-to-Voice runtime integration was found. Running both repositories does not establish an integrated self-hosted AI media stack. A provider-independent local voice architecture would be additional work requiring a separate gap decision.

## Prioritized implementation backlog

| Order | Work item | Smallest implementation | Completion evidence |
| --- | --- | --- | --- |
| 1 | Ringee reproducible database bootstrap | Establish tracked baseline and ordered pending migrations, preserve required partial indexes | Empty DB boot plus upgrade/recovery validation |
| 2 | Ringee MCP authorization | Disable legacy raw UUID authority; use authenticated scoped API-key paths | Leaked ID, revoked key and cross-workspace denial tests |
| 3 | Ringee inbound isolation | Complete per-user credentials and DID/media routing; eliminate bundled shared browser credentials | Another workspace receives neither call offer nor caller identity |
| 4 | Production release and license selection | Match supported releases to immutable images/source; resolve Twenty Enterprise boundaries, mobile license grant and third-party notices | Release manifest and exact notices/entitlement record |
| 5 | Android credential and signing preparation | Backend-issued scoped credentials; protected signing configuration; brand/backend configuration | APK/AAB build record and device validation |
| 6 | Twenty–Ringee integration | Existing custom-integration endpoints, stable external IDs, signed event writeback and reconciliation | One canonical customer and outcome despite duplicate/reordered delivery |
| 7 | Calling execution controls | Explicit approval, calling windows, suppression, provider-spend limits and idempotency at execution | Denied action creates no call; timeout reconciles without blind redial |
| 8 | Mautic integration | Per-boundary instance, API contact/segment mapping and signed engagement/DNC webhooks | Sandbox enrollment and unsubscribe/bounce suppression |
| 9 | Native agent enablement | Scoped Twenty agents/workflows and Ringee tools; external spend checks separate from Twenty credits | Permission, approval and budget tests |

The ordering records dependencies, not a claim that each item must be performed serially. Deployment inputs and isolated staging resources are needed for runtime work. No commercial provider account or mobile build prerequisites were configured during the audit.

## Component evidence

- [Ringee App and Voice audit](ringee-audit.md): service map, native voice capability matrix, auth and migration gaps, exact licenses and pinned source references.
- [Mobile audit](mobile-audit.md): Android APK/AAB paths, API/auth source compatibility, bundled SIP credential risk, debug release signing and missing app license evidence.
- [Twenty and Mautic audit](crm-marketing-audit.md): native extension/agent/approval surfaces, license boundaries, service dependencies and tenancy assessment.
- [Runtime validation plan](runtime-validation-plan.md): controlled scenarios required before marking capabilities operational.
- [Acceptance checklist](acceptance-checklist.md): product gates; all runtime outcomes remain unverified.

## Verification completed

All five checkouts pass revision, remote, local-change and root-license fingerprint checks. Checkout tooling was exercised against existing sources without changes. Python syntax checks passed. Temporary-fixture checks confirmed the verifier rejects altered licenses and incorrect revisions. Report source paths and line anchors were checked against the locked revisions; this validates evidence locators, not the truth of every inference or runtime functionality.

## Phase 0 remaining work

The first source inspection milestone is complete. Full dependency SBOM, exact Ringee Voice fork delta against an identified upstream Asterisk revision, production artifact provenance, license/entitlement decisions, provider configuration, and runtime verification remain open. Keep these explicit rather than marking the entire discovery phase or product acceptance complete.
