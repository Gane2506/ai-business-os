# Provider migration status

User choices on 2026-10-11: Better Auth, AWS SES, Telnyx, Stripe, retained
WhatsApp. See decision 0003 for primary references and connection discovery.

## Implemented locally

AWS SES replaces Resend in Ringee application email call sites. The provider
uses pinned AWS SDK 3.940.0 and the standard AWS credential chain. Reply-to, CC,
and BCC are preserved; requests fail if AWS rejects the message or returns no
message ID. No error body or email content is logged by the transport.

Affected sender and internal support identities use EMAIL_FROM_ADDRESS and
INTERNAL_SUPPORT_EMAIL (the latter defaults to the former), replacing upstream
hardcoded mailboxes. Configure a verified SES From identity and AWS_SES_REGION.
The upstream WhatsApp feature and required startup settings remain enabled.

The active cumulative patch is patches/ringee-app/0002-foundation-ses.patch.
It supersedes 0001 and includes its MCP and database fixes. The patch hash is
registered in config/component-patches.json. Original source pins remain clean.

## Validation

- Four SES transport tests: recipient/reply routing, AWS rejection, absent
  acceptance ID, and header injection prevention.
- Seventeen existing missed-call notification tests: recipient isolation,
  retry behavior, duplicate events and team routing.
- Backend Nest build and platform TypeScript check passed.
- Offline frozen-lockfile validation passed after temporary extraction of the
  application document for pnpm 11. Original package-manager metadata and
  existing package version pins were preserved.
- Clean-base patch application, current-tree reverse check and preparation
  idempotence passed.
- Secret generator checks confirmed two independent 256-bit values, mode 0600,
  and refusal to overwrite an existing file.

No live email, call, billing operation or new application deployment occurred.

## Remaining work

Better Auth migration is not implemented. It must replace backend/frontend
Clerk session, organization, administration, webhook and websocket behavior
without weakening ownership or workspace checks. Native Twenty and Mautic
identity are separate from the Ringee Clerk replacement.

Resolve the user-mentioned Telnyx MCP, application runtime credentials, SES
region/verified sender and AWS credentials, Stripe webhook configuration,
WhatsApp credentials, and AI provider credentials before deployment. An active
Stripe connector is confirmed, but its credentials are not automatically
available to the application.

The deployment-agent drafts stopped at an account usage limit. They remain
explicitly marked incomplete. Inbound credential isolation, first-admin
bootstrap, NPM host/certificate setup, backups and runtime acceptance remain
open deployment gates.
