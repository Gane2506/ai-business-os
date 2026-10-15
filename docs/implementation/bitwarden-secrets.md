# Bitwarden Secrets Manager

The user selected self-hosted Bitwarden on 2026-10-11. The user selected a new Contabo deployment.
The user has no Enterprise Secrets Manager license and requested another option.
Self-hosted Bitwarden Secrets Manager deployment is therefore deferred.
Recommended alternative: Bitwarden cloud Free, pending the user’s hosting choice.
Its published limits are two users, three projects, three machine accounts, and
unlimited secrets: https://bitwarden.com/help/secrets-manager-plans/ No Bitwarden server, machine account,
access token, secret upload or CLI installation has been performed.

Use official Bitwarden Secrets Manager and its bws CLI for deployment access.
A project-scoped read-only machine account should retrieve runtime secrets;
initial import needs a separately authorized write-capable provisioning path.
Do not use a person's complete password vault for application startup.

The existing generated encryption secrets remain unchanged in the root-only
Contabo bootstrap file /opt/ai-business-os/secrets/ringee-crypto.env. Import these
existing values when the chosen Bitwarden endpoint is available; do not
regenerate keys as part of migration. Verify retrieval before retiring any
bootstrap file or changing running services.

Runtime wiring should keep access tokens and decrypted values out of logs,
command arguments, repository files and image layers. The machine access token
still requires a protected bootstrap location on the server. Runtime access
must be limited to the AI Business OS project and environment.

Self-hosted Secrets Manager requires an Enterprise organization and its license
file according to the official FAQ. Confirm this entitlement before deploying
a server intended to satisfy the application secrets-manager requirement.
Do not substitute a password-only vault and claim bws compatibility.

Official references:
- https://bitwarden.com/en-gb/help/secrets-manager-faqs/
- https://bitwarden.com/help/secrets-manager-cli/
- https://bitwarden.com/help/machine-accounts/
- https://bitwarden.com/help/access-tokens/

No bws or bw executable was found on the local machine or Contabo during checks.
Authentication migration and provider configuration remain independent work.

## Final hosting selection

The user selected Bitwarden cloud Free. No self-hosted Bitwarden deployment
is planned. Cloud region/account connection is pending. Preserve the existing
keys during import and grant the runtime machine account access only to the
AI Business OS project. The NPM password is an infrastructure credential and
should not be accessible to the application runtime machine account.

## Cloud setup progress

Created Connect X Media Free organization, AI Business OS project, and the empty
contabo-ai-business-os machine account. The project contains zero secrets.
The machine account has zero saved project assignments and zero access tokens.
AI Business OS / Can read is staged in the browser, awaiting action-time
confirmation before Save. Identifiers are recorded in deployment-inputs.json.
No encryption values or NPM credentials were uploaded or changed.

## Non-expiring token status

User requested no expiry. The AI Business OS Can read assignment is saved,
and contabo-runtime is verified Active with Expires Never. Its one-time value
was not captured through the browser clipboard before the dialog closed.
No token was installed on Contabo, and no application keys were uploaded.
User confirmation is required before revoking this token and issuing a
replacement, unless the user saved its value independently.

## Replacement progress

User revoked the first token. The empty-token list was verified. A replacement
contabo-runtime token was created with Expires Never; Bitwarden displayed
Access token created and copied to clipboard. The browser clipboard bridge
returned an empty string, so no token was transferred or installed by the
agent. Direct user transfer from the system clipboard is pending.

## Corrected transfer workflow

The clipboard pipe instruction was flawed: copying that command replaced the
token. The resulting file contained the command, not a Bitwarden credential.
Authentication failed, and a structural check verified the mistake without
displaying clipboard contents. No usable token is installed.

A masked input helper is installed at
/opt/ai-business-os/bin/save-bitwarden-token.py. It validates token structure,
uses exclusive creation and mode 0600, and never prints the token. The user
must open its prompt BEFORE generating the next token, then paste the token
directly into that prompt. Computer use cannot open Terminal on this host.

Official bws Docker CLI 2.1.0 was downloaded and pinned to the digest recorded
in deployment-inputs.json. Project authentication remains pending a valid token.

## Verified connection

The user saved the runtime token through the masked prompt. Its structure and
mode 0600 were verified. Contabo successfully authenticated with the pinned
bws CLI, fetched the AI Business OS project, and retrieved its empty secret
list. Secret count is zero. No credential values were displayed.
