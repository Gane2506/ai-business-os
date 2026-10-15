# Auth and provider selection

User decision on 2026-10-11 supersedes upstream defaults:

- Replace Ringee Clerk identity with Better Auth.
- Replace Ringee Resend email transport with AWS SES.
- Keep Telnyx, Stripe, and WhatsApp.
- Generate application encryption material on the target server.

Better Auth official repository: https://github.com/better-auth/better-auth
Repository HEAD observed: fe2559b7a08365136f341802bbea1b933a4e4f25.
This is discovery provenance, not the selected deployment release.

Clerk is referenced in 89 source files across backend, frontend, platform, and
services. Migration must cover verified sessions, websocket authentication,
organization membership and active organization, account creation/admin bans,
phone verification, email identity, frontend session state, and removal of
Clerk webhooks. Ringee database UUIDs and ownership checks must be preserved;
existing Twenty and Mautic identity are separate integration decisions.

Better Auth references:
- https://better-auth.com/docs/installation
- https://better-auth.com/docs/adapters/prisma
- https://better-auth.com/docs/integrations/express

AWS SES transport follows the official SendEmailCommand interface and default
credential chain: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/ses-examples-sending-email.html
Region, verified From identity, credentials and sandbox/production status must
be resolved before sending. No email is sent during local transport tests.

WhatsApp serves Ringee chat assistant and chat login. The user explicitly chose
to retain it; its required startup configuration remains in place.

Two independent 32-byte random secrets (APP_ENCRYPTION_SECRET and reserved
BETTER_AUTH_SECRET) were generated on Contabo at
/opt/ai-business-os/secrets/ringee-crypto.env. Directory mode 0700 and file mode
0600 were verified. No values were displayed, copied into this repository, or
applied to running services. Existing keys are never replaced by the generator.
Secure backup and restore acceptance remain pending.

Composio discovery confirms an active Connect X Media Stripe connection.
Connected MCP credentials are not automatically application runtime credentials.
Telnyx has no active Composio connection; the user-mentioned MCP is not yet
available among this session's tools. No suitable AWS SES tool was returned by
provider-specific discovery; unrelated Resend/Gmail suggestions were rejected.

Deployment-agent drafts were interrupted by an account usage limit. They are
unreviewed preparation artifacts, not deployable acceptance evidence. Better
Auth migration is not yet implemented. No new application has been deployed.
