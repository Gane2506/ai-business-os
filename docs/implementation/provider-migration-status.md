# Provider migration status

Selected providers: Better Auth, AWS SES, OpenRouter, Telnyx, Stripe and WhatsApp.

The active cumulative Ringee patch is `patches/ringee-app/0003-email-production-integration.patch`, registered by SHA-256 in `config/component-patches.json`. GitHub Actions recreates the pinned upstream source and applies this patch.

## Implemented source

AWS SES v2 replaces Resend at Ringee email call sites. The central sender persists tenant domains and stream identities, preferences, suppression, unsubscribe tokens and a delivery ledger. All configured stream senders use `noreply`. Sending defaults to disabled and checks production access, identity/configuration readiness, ownership, quota and suppression. Signed SNS feedback and a Mautic integration are included; live feedback delivery remains unverified.

OpenRouter is the default for text chat, tool calls and summarization using the existing OpenAI-compatible SDK. Both canonical and legacy text clients are lazy. Only the reviewed default model is enabled; see [OpenRouter implementation](openrouter-text.md) for settings and scope. Voice, audio and realtime media retain their existing paths.

## Validation

The main branch before the OpenRouter change passed all three GitHub Actions jobs: repository fingerprints and offline tests, pinned source/evidence checks, and Ringee mocked email tests, backend type checking and disposable PostgreSQL17 migrations/invariants. The OpenRouter pull request adds mocked provider routing and streaming tests; its CI results are recorded on the pull request.

No live AI requests were made for this change. Earlier authorized SES infrastructure messages are recorded in `evidence/`; the user prohibits all further test sends. No combined application deployment has occurred.

## Remaining work

Better Auth is planned, not implemented. See [migration plan](better-auth-migration-plan.md). Backend, frontend, websocket, MCP and SDK authentication must retain UUID ownership and closed signup. Twenty and Mautic identity integration remain separate.

SES is configured in `ca-central-1`; six stream domains are verified. Production SES access, runtime permissions, platform-domain enrollment and signed feedback subscription remain deployment gates. Bitwarden holds AWS, OpenRouter, Telnyx and Stripe credentials. WhatsApp credentials and application callback routing still need completion. Telnyx has no MCP connection.

Deployment drafts remain incomplete. First-admin provisioning, NPM hosts/TLS, backups, runtime secret injection and application acceptance checks must be completed before production traffic.
