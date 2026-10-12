# Implementation plan

Start with Phase 0 source verification. Repository default-branch snapshots are pinned for reproducible inspection; deployment should use reviewed supported releases and immutable images. No calling, marketing sending, application deployment, or provider configuration has been performed. Cloudflare DNS and read-only Contabo/NPM access checks are complete.

## Phase 0 audit and pin

1. Establish controlled checkouts of Ringee App, Voice, Mobile, Twenty, and Mautic. Completed; run `scripts/check_sources.py` to verify.
2. Inspect licenses and source capabilities with evidence. First specialist source audits completed; full dependency inventory remains open.
3. Consolidate feature status, service/dependency map, identity/tenancy boundaries, and gaps. First findings and prioritized backlog are in `discovery/summary.md`.
4. Record architecture decisions and select supported production revisions. Default-branch audit pins are not release recommendations.
5. Identify runtime prerequisites and prepare an isolated validation deployment plan.

## First local implementation

Ringee MCP authorization and fresh-install migration bootstrap are implemented and tested locally. See [foundation status](implementation/foundation-status.md). Original audit pins remain clean; the changes are preserved as a fingerprinted patch in `patches/ringee-app/`. Inbound isolation and production validation remain open.

## Phase 1 core platform

Prepare deployment manifests from reviewed upstream examples. Separate application, databases, queues, telephony/media, and reverse proxy responsibilities. Pin images by digest and record resource/port needs. Prepare secrets templates, TLS, health checks, logging, retention, backup and restore procedures. Validate locally or in an authorized staging target before Contabo production rollout.

Inputs needed for deployment: intended Contabo host and available CPU/RAM/storage, domain/subdomain plan, existing services and port constraints, secret provisioning method, and selected telephony/email providers. Collect these when the source findings establish the service topology.

## Phases 2 through 5 identity calling and marketing

Verify native workspace boundaries before designing extensions. Implement stable IDs and idempotent Twenty-to-Ringee contact sync through supported APIs. Deliver human web/mobile calling and timeline reconciliation. Enable verified native AI calling before adding missing voice components. Integrate Mautic enrollment and engagement with authoritative eligibility and unsubscribe policy.

## Phases 6 through 8 agents and business operations

Prefer native Twenty workflows and Ringee call orchestration. Add cross-domain coordination only when a documented gap requires it. Enforce scoped identities, action attribution, human approval rules, tool budgets, and reconciliation. Extend email/calendar/invoicing through replaceable APIs, then consider advanced autonomy after runtime acceptance gates pass.

## Model assignments

| Work | Role | Model | Complexity | Jev routing |
| --- | --- | --- | --- | --- |
| Ringee App/Voice source architecture | Orchestrator/Investigator | GPT-6 Astra, high reasoning | Highest: voice, tenancy, provider and orchestration boundaries | Orchestrator 0.65; user clarified source audits first |
| Twenty/Mautic source architecture | Orchestrator/Investigator | GPT-6.1 Sol, high reasoning | High: CRM extension, identity and marketing integration | Orchestrator 0.67; user clarified source audits first |
| Mobile source and Android path | Investigator | GPT-6 Luna, high reasoning | Moderate: bounded mobile compatibility and build audit | Investigator 0.45; uncertain routing, parent selected investigator |

Jev role labels are mapped to the available live subagent mechanism. No further delegation is required for these bounded audits.
