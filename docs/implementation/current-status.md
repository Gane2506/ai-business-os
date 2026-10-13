# Implementation status

Updated 2026-10-13. The authoritative integration code is in this private GitHub repository. Upstream applications are reconstructed from locked commits and the registered cumulative patch; they are not missing vendored directories.

## Merged and verified

| Change | GitHub evidence | Verification |
| --- | --- | --- |
| OpenRouter text routing and selected-provider configuration | [PR 1](https://github.com/Gane2506/ai-business-os/pull/1) | Mocked provider tests, backend compile and integration CI passed. |
| Better Auth 1.7.7 native ESM loading from CommonJS | [PR 2](https://github.com/Gane2506/ai-business-os/pull/2) | Node 22 compiled runtime proof passed. |
| Production Ringee runtime image and PostgreSQL matrix | [PR 3](https://github.com/Gane2506/ai-business-os/pull/3) | Docker runtime build and entrypoint/UID checks; PostgreSQL 16 and 17 checks passed. |
| Hashed session adapter and scoped session management proof | [PR 4](https://github.com/Gane2506/ai-business-os/pull/4) | Nine isolated Better Auth tests passed. |
| Additive Better Auth storage foundation | [PR 5](https://github.com/Gane2506/ai-business-os/pull/5) | Fresh migrations, preserved SQL invariants, backend compile and runtime-image build passed. |
| Real generated Prisma/Better Auth adapter proof | [PR 6](https://github.com/Gane2506/ai-business-os/pull/6) | Five real integration tests passed on each PostgreSQL 16 and 17 database. |
| Protected verification storage proof | [PR 8](https://github.com/Gane2506/ai-business-os/pull/8) | Nine memory tests and five real Prisma tests passed on each PostgreSQL 16 and 17 job, including independent-context concurrent consumption. |

The merged base for the next authentication work is `c2114773b65bdd16b964246e99b5ea17936e9ca8`. Source reconstruction is controlled by `config/upstream-lock.json` and `config/component-patches.json`. Only the registered cumulative Ringee patch is applied; older patch files are historical artifacts.

## Authentication work in progress

The user selected email and password, with shared login across the AI Business OS subdomains under `connectxmedia.com`. Staff-approved accounts, closed public signup, required phone verification and existing UUID ownership remain requirements. Sharing the login session does not grant cross-application or cross-workspace permissions.

The storage migration and runtime proofs are dormant foundations. Clerk remains the active application authentication provider until backend, frontend, provisioning, phone verification, realtime and external-consumer replacements are integrated and verified. No application cutover or production enrollment is claimed by the proofs.

Current work covers the backend principal/runtime boundary, frontend auth facade and sign-in flow, and application composition of the now-verified protected verification-record adapter. OAuth, extension/ChatGPT parity and account lifecycle paths require their own verified integration. Proof-only disabled routes must not be mistaken for complete production password-reset/account-management behavior.

## Production gates still open

The combined Twenty/Ringee/Mautic application has not been deployed. New NPM proxy routing/TLS, runtime inputs and application-level integration remain open. Docker CI verifies a build and packaged entrypoint files; it does not start, publish or deploy the application.

SES identities are verified in Canada Central, but production access, final runtime IAM and SNS feedback delivery are not complete. Application email sending remains disabled. Future production messages use `noreply` on their configured stream subdomain; outreach remains disabled by policy. The user's instruction prohibits further test emails.

All new verification uses synthetic credentials, local fakes or disposable databases. No live emails, SMS, calls, AI requests or billing actions are needed for the current coding work.
