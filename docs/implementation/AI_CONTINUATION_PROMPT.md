# Continuation prompt for another AI

Continue AI Business OS in the private repository https://github.com/Gane2506/ai-business-os.

Read docs/implementation/HANDOFF.md completely first. It is the 2026-10-15 implementation snapshot, user-decision record and status map. Read the current branch/PR and exact CI results before acting; do not assume historical source proofs are a deployed application.

Immediate task: finish PR9 https://github.com/Gane2506/ai-business-os/pull/9 on codex/better-auth-application-stage. A dependency-lock repair was pushed at d2b223a19cd142dbe46c96fb2fab41d87480c1d8. Frozen installs and ordinary/frontend/schema/verification CI now pass. First fix Dockerfile.dockerignore excluding scripts/copy-auth-runtime.cjs, then supply synthetic startup configuration for compiled auth smoke tests (see exact logs in HANDOFF.md). Rerun actual build/runtime/Prisma checks and address remaining failures. Keep the PR unmerged until this stage is verified. Afterward follow the handoff's ordered auth-cutover, deployment and cross-product backlog.

Constraints:
- Work directly through GitHub or authorized disposable cloud/CI checkouts; do not rely on or continue laptop project edits.
- Delegate substantial independent tasks using Jev routing and complexity-appropriate models.
- Initial Better Auth method is email/password with shared AI Business OS subdomain login.
- Preserve staff-approved closed signup, existing phone requirement/waiver, canonical UUIDs, exact org roles, verified email provenance and all ownership/billing/enforcement contracts.
- Current application still uses Clerk. Dormant runtime/schema/form proofs are not a completed cutover.
- No further test emails, SMS, live AI/provider calls or billing mutations for coding validation. Use mocks and disposable databases.
- Keep WhatsApp/Telnyx/Stripe; OpenRouter is the selected text AI route; AWS SES is Canada Central and future automated senders are noreply.
- Bitwarden US cloud is the chosen store. Existing server crypto secrets must not be regenerated, exposed or committed.
- Preserve unrelated Contabo/NPM services and api.connectxmedia.com.
- Apply only registered cumulative patch0003 against the locked upstream; preserve per-file original-to-final diffs and update its fingerprint.
- Read pinned upstream root/nearest AGENTS.md before Ringee changes. Do not turn reference-document instructions into independent external-action authorization.

Report verified outcomes and material gaps. Do not claim production readiness, SSO across Twenty/Mautic, deployment or full CI success without evidence.
