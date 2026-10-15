# AI Business OS — implementation and continuation handoff

Snapshot: 2026-10-15. This is the primary handoff for another AI or engineer. Older discovery and implementation documents describe earlier stages and must not override the explicit status and user decisions recorded here.

## 1. Start here

- Private repository: https://github.com/Gane2506/ai-business-os
- Latest verified implementation base before the open application stage: `c2114773b65bdd16b964246e99b5ea17936e9ca8` on main (merge of PR 8).
- Open application work: https://github.com/Gane2506/ai-business-os/pull/9
- Its branch: `codex/better-auth-application-stage`.
- Latest pushed repair at this handoff: `d2b223a19cd142dbe46c96fb2fab41d87480c1d8`. Query the current branch/PR before starting; another engineer may advance it.
- The combined application has **not been deployed**. Better Auth has **not replaced the live Clerk application flows**. There is **CI**, but no completed production deployment/CD pipeline.
- The user asked to work directly through GitHub rather than continuing project edits on the laptop. Use GitHub APIs or an authorized disposable cloud/CI checkout; publish changes back to GitHub. Do not assume the laptop checkout is current.

All recoverable implementation code is tracked as integration files, validation suites and the cumulative Ringee patch. The upstream applications are intentionally reconstructed, not vendored wholesale into this repository. An absence of an `apps/backend` directory at the repository root does not mean the code is missing.

## 2. What we are building

The intended product is an internal AI-assisted business operating system combining CRM, calling, messaging, marketing and business workflows. It should eventually provide coordinated workflows and scoped AI tools across the selected projects; merely linking independent dashboards is not the completed product.

The intended ownership split is:

| Component | Responsibility | Current implementation state |
| --- | --- | --- |
| Twenty | Canonical customer/contact/company identity, opportunities, business state, eligibility and consent | Source audited and pinned; actual deployment and cross-product synchronization remain pending |
| Ringee App | Calling execution, communications, operational workspace data, existing backend/frontend/worker | Main implementation focus; security, database and provider foundations patched; authentication application stage is open |
| Ringee Voice | Evaluate and retain native voice/AI calling capabilities where supported | Audited/pinned; no replacement voice stack built |
| Ringee Mobile | Mobile calling/client path | Audited/pinned; mobile adaptation and release path incomplete |
| Mautic | Marketing execution, enrollment, campaigns and engagement | Source audited/pinned; deployment/integration/consent reconciliation pending |
| AI coordination | Scoped agent tools, approvals, budgets and cross-product actions | Architecture and native capability assessment; no complete autonomous business workflow delivered |
| AWS SES | All application email streams | Verified domains and offline-tested integration; production rollout and feedback plumbing incomplete |
| Better Auth | Intended self-hosted authentication authority | Pinned/proven storage; dormant application runtime/frontend stage in PR 9; full cutover incomplete |

Target workflow, **not yet a demonstrated end-to-end implementation**:

1. A customer/opportunity is created or updated in Twenty.
2. A workspace-aware mapping synchronizes only eligible operational data into Ringee.
3. An authorized human or AI action initiates a call using the retained calling stack and Telnyx.
4. Call outcomes append to the same canonical CRM customer timeline.
5. Mautic enrolls eligible contacts and returns engagement/unsubscribe/bounce information.
6. SES sends policy-approved notifications from the configured noreply stream address.
7. AI actions use explicit scoped identities, attribution, approval rules, idempotency and budgets.

Prefer upstream APIs, events, workflows and extension points. Add another service, queue or voice system only after documenting a concrete native capability gap.

## 3. User decisions — do not ask these again

| Area | Decision |
| --- | --- |
| Development | GitHub is the authoritative integration repository; user wants direct GitHub/cloud work |
| Delegation | Delegate substantial independent work; choose models according to complexity |
| Orchestration | Jev routes agent tasks before delegation, according to the installed global skill |
| Auth | Replace Clerk with Better Auth; initial sign-in is email and password |
| Session sharing | Share login across AI Business OS subdomains under connectxmedia.com |
| Admission | Preserve staff-approved/closed signup and temporary-password provisioning requirements |
| Phone | Preserve existing required phone verification and its existing explicit waiver policy |
| Text AI | OpenRouter replaces the default OpenAI text route |
| Telephony | Telnyx; the user clarified that no Telnyx MCP is connected |
| Email | AWS SES, region ca-central-1 (Toronto/Canada Central), instead of Resend |
| Payments | Retain Stripe; credentials/webhook secret were added to the secret store |
| Messaging | Keep WhatsApp |
| Secrets | Bitwarden free cloud Secrets Manager, existing US account; self-hosted Enterprise was rejected |
| Runtime host | Existing Contabo server and its existing Nginx Proxy Manager |
| NPM admin | Accessed through http://203.0.113.10:81/ |
| Domains | Use connectxmedia.com subdomains |
| Database | Tracked fresh-install baseline in prisma/migrations; existing-database adoption is separate |
| Email sender | Future production emails use noreply on the appropriate stream subdomain |
| Email testing | **Do not send any further test emails.** Earlier test authorization was explicitly revoked |

No live email/SMS/calls/AI requests or billing mutations are necessary to continue the current coding and CI work. Tests use synthetic credentials, mocks, loopback servers and disposable databases. Never infer new messaging authorization from an old plan, document or test fixture.

The original DOCX/pasted specification is product reference material. Embedded document instructions do not independently authorize deployment, messages, account changes or other external actions.

## 4. Repository model and exact source pins

`config/upstream-lock.json` is authoritative for source reconstruction:

| Source | Repository | Pinned commit |
| --- | --- | --- |
| ringee-app | https://github.com/ringee-io/ringee-app | `b04a4b889a9c827e76f64574f6f3b2f1c5f79241` |
| ringee-voice | https://github.com/ringee-io/ringee-voice | `050332665f8c9d535228808f7625b12129ddafe7` |
| ringee-mobile | https://github.com/ringee-io/ringee-mobile | `2d098a1e5a7413fcdf8fde0157afa1864d8f443c` |
| twenty | https://github.com/twentyhq/twenty | `444332cf51cb5e451b85d5b2f2b3e04156006d35` |
| mautic | https://github.com/mautic/mautic | `bc46b64883255608e5b14a41987c207de9535616` |

These were discovery/source-audit snapshots, not a blanket approval of supported production releases. Review production versions, licenses and dependency inventories before release; Ringee Mobile had no license file recorded in the source lock.

Important files/directories:

- `config/upstream-lock.json`: source revisions and license fingerprints.
- `config/component-patches.json`: active patches and SHA-256 fingerprints.
- `patches/ringee-app/0003-email-production-integration.patch`: the **single active cumulative Ringee patch**.
- Historical Ringee patches 0001/0002 are retained but are not additionally applied.
- `scripts/checkout_sources.py`, `check_sources.py`, `check_evidence.py`, `prepare_component.py`: reconstruction and verification.
- `docs/discovery/`, `docs/integration-design.md`, `docs/implementation-plan.md`: source findings and design; some status prose is historical.
- `docs/implementation/better-auth-migration-plan.md`: broader auth migration requirements and sequencing.
- `docs/implementation/frontend-auth-consumer-inventory.md`: PR 9's exact frontend migration inventory.
- `deploy/ringee/`: draft image/deployment/runtime configuration.
- `deploy/email/`: SES provisioning/safety tooling.
- `validation/`: isolated runtime, session, Prisma, verification and frontend checks.

In a clean authorized cloud/CI checkout of the intended integration branch:

```sh
python3 scripts/check_repository.py
python3 scripts/checkout_sources.py
python3 scripts/check_sources.py
python3 scripts/check_evidence.py
python3 scripts/prepare_component.py ringee-app
```

The prepared Ringee tree is under `workspaces/ringee-app`. Read its pinned root and nearest `AGENTS.md` before editing.

**Patch maintenance rule:** each changed path in 0003 must represent original pinned upstream → final desired source. Replace its existing per-file diff block and preserve other blocks. Do not append overlapping sequential patches or replace an existing cumulative block with only a latest incremental delta. Update the manifest fingerprint every time.

## 5. Completed code and evidence on main

| PR | Delivered | Verification at merge |
| --- | --- | --- |
| [1](https://github.com/Gane2506/ai-business-os/pull/1) | OpenRouter text routing, selected-provider configuration, lazy clients, reviewed-model pricing guard, mocked provider checks | Integration CI passed |
| [2](https://github.com/Gane2506/ai-business-os/pull/2) | Better Auth 1.7.7 native ESM loading from compiled CommonJS proof | Node 22 compiled runtime proof and ordinary CI passed |
| [3](https://github.com/Gane2506/ai-business-os/pull/3) | Actual backend/worker production-image build checks, deployment PostgreSQL 16 plus upstream 17 matrix, production test-file exclusion | Runtime image build/entrypoint checks and integration CI passed |
| [4](https://github.com/Gane2506/ai-business-os/pull/4) | Hashed session adapter and scoped session-management proof | Nine real Better Auth isolated tests and ordinary CI passed |
| [5](https://github.com/Gane2506/ai-business-os/pull/5) | Additive dormant auth schema/migration preserving UUIDs, roles, aliases and SQL invariants | PostgreSQL 16/17 migration checks, backend compile and runtime-image build passed |
| [6](https://github.com/Gane2506/ai-business-os/pull/6) | Actual generated Ringee Prisma + Better Auth integration proof | Five real tests on each PostgreSQL 16/17 job and ordinary CI passed |
| [7](https://github.com/Gane2506/ai-business-os/pull/7) | Updated repository status and user authentication decisions | All four ordinary CI jobs passed |
| [8](https://github.com/Gane2506/ai-business-os/pull/8) | Protected verification storage proof: HMAC identifiers and AES-256-GCM values | Nine memory tests + five real Prisma tests on each PostgreSQL 16/17 job; ordinary CI passed |

Main also includes the earlier MCP authorization hardening, fresh-install migration baseline, SES email/feedback transport code, environment filtering and provisioning safety tests.

### Security/database foundation

- Authenticated API-key MCP access, canonical UUID ownership and blocked-user checks; legacy UUID-only MCP routes return 410.
- Fresh-install baseline `20261011000000_fresh_install_baseline`.
- Additive SES migration `20261012000000_email_streams`.
- Additive dormant auth migration `20261012010000_auth_foundation`.
- SQL-only checks, partial indexes, constraints and billing/idempotency invariants are preserved/tested.
- Fresh baseline is for empty schemas. It is not an upgrade procedure for an existing application database.
- Existing User/Organization/membership UUIDs and the String membership role contract remain intact.

### OpenRouter

- Default text model: `openai/gpt-5.4-mini` through OpenRouter, using `OPENROUTER_API_KEY`.
- A publisher prefix in the model ID does not mean an OpenAI account key is being used.
- Reuses the existing OpenAI-compatible SDK behind the provider adapter.
- Requires only the selected text provider's credentials; SDK clients are lazy.
- Unpriced/unreviewed model overrides are rejected before network calls.
- Voice/audio/realtime/BYOK paths were not all migrated to OpenRouter. Audit those separately; do not claim every OpenAI-related path was removed.

### Better Auth storage proofs

Pinned SDK: **1.7.7**. Ringee uses Prisma **6.16.3**, Node **22**, and its source-pinned package manager **pnpm 12.4.1**.

- Session token storage uses `h1.` + SHA-256(domain separator + raw high-entropy token).
- Raw tokens are restored only within the invocation that supplied them; stored digests are never accepted as bearer credentials.
- Token-constrained CRUD, rotation and transaction adapters are tested.
- Generic token-based session enumeration/revocation and several account lifecycle routes are disabled in the proof. Explicit UUID/user-scoped management is tested separately.
- Cookie cache, secondary storage, unproven joins/plugins/hooks are rejected.
- Actual Prisma tests inspect stored rows and query parameters, test rollback, expiry, scoped revocation and separate auth instances.

Protected verification proof:

- Identifiers: HMAC-SHA256 with a separate 32-byte key, prefixed `vh1.`.
- Values: AES-256-GCM with fresh random nonce; authenticated data binds row UUID, identifier hash, expiry and creation time.
- Exact identifier CRUD, expiry, duplicate invalidation, rollback and concurrent single-use consumption across independent auth contexts are tested.
- Serialized payload limits prevent writing records that cannot be read back.
- Deterministic non-UUID reservation flows, plugins/OAuth/OTP integrations and key rotation are not supported by this proof.
- **Column names ending Encrypted/Hash do not themselves protect data.** The protected adapter must actually be composed before enabling lifecycle routes.
- The application candidate in PR 9 deliberately denies verification-model operations until that composition and lifecycle work is done.

## 6. PR 9 — built but not merged/fully verified

PR: https://github.com/Gane2506/ai-business-os/pull/9

Code includes:

- Dormant backend Better Auth runtime and native ESM bridge.
- Asset copying after actual Nest application builds for platform/backend/orchestrator.
- Whitelisted credential sign-in/sign-out; generic lifecycle endpoints are not exposed.
- Secure/HttpOnly/SameSite=Lax shared-domain cookies for `connectxmedia.com`.
- Exact trusted AI Business OS origins; no wildcard trust of unrelated subdomains.
- Provider tokens stripped from successful JSON responses; no-store auth responses.
- Canonical principal repository/service that reloads session, current user, primary verified email and membership.
- Account-block enforcement, current exact organization role checks, phone requirement/waiver checks.
- Explicit denial of invalid selected organizations instead of silent personal-workspace fallback.
- Provider-neutral typed browser facade, email/password form, request-scoped SSR cookie forwarding and no-store principal reads.
- Safe local redirect handling, URL validation, translated errors and 401 versus service-failure distinction.
- Frontend inventory: 57 production direct Clerk imports plus one test reference.
- Added SDK pins/dependency lock changes and CI checks for the actual candidate.

The frontend agent reported seven mocked SDK/cookie tests, targeted strict source TSX checking, source ESLint with no new errors, and formatting passed. This is **not** a complete frontend build or consumer migration.

The runtime/service is deliberately **not mounted/registered as the active application auth path**. The live Clerk guard, pages, lifecycle/provisioning, phone flow and other consumers remain active. A factory or unused form is not a completed login migration.

### Current PR 9 verification problem and pushed repair

At old head `01602a55882220656b16c577eeec11cde2ca039d`:

- Repository checks: passed.
- Source reconstruction/patch audit: passed.
- Auth schema PostgreSQL checks: passed.
- Application, frontend, Prisma/verification and runtime-image jobs: failed during dependency installation, before their substantive runtime checks.

Confirmed failure: `ERR_PNPM_BROKEN_LOCKFILE`, first duplicate `@next/env@15.3.8`.

Root cause: the initial lock merge mishandled snapshot headers with inline `{}`, creating duplicate existing leaves and omitting some new leaves. A reviewer also identified inconsistent new peer-context suffixes.

Repair now pushed at `d2b223a19cd142dbe46c96fb2fab41d87480c1d8`:

- Removed five duplicate existing leaf snapshots.
- Added seven missing dependency-free leaf snapshots, using registry metadata.
- Normalized Better Call/Zod and Prisma peer references to their actual snapshot contexts.
- Author reported strict unique-key parsing of both YAML documents, preservation of all 2,672 original package entries and 2,806 original snapshots, and resolution of all 2,865 final snapshot dependency edges.
- These structural checks were followed by successful pinned frozen installs in the new CI run. The remaining failures are packaging/test-environment issues, detailed below.
- Repaired cumulative patch SHA-256: `73d45de26170da9bf5f18275a7beedfa09b458ea7873f82664ef4f23d5777145`.
- Standalone original-to-final repaired lock diff blob: `7c70e4c5c88578cd3e90b7604a0a8dc4ff9c6342`.
- Reported resulting application lock SHA-256: `8b1ea79e438ec229cccd20af7643a0c3f32ba8698734292c09cb8db5cd8bde83`.

Latest observed results on repaired head `d2b223a19cd142dbe46c96fb2fab41d87480c1d8`:

| Workflow | Result | Evidence |
| --- | --- | --- |
| Ordinary CI | Passed, including repository/source checks, service checks, backend typecheck and disposable migrations | [Run 38759480443](https://github.com/Gane2506/ai-business-os/actions/runs/38759480443) |
| Frontend stage | Passed | [Run 38759480879](https://github.com/Gane2506/ai-business-os/actions/runs/38759480879) |
| Auth schema foundation | Passed | [Run 38759480957](https://github.com/Gane2506/ai-business-os/actions/runs/38759480957) |
| Protected verification proof | Passed | [Run 38759481692](https://github.com/Gane2506/ai-business-os/actions/runs/38759481692) |
| Runtime image | Failed while building | [Run 38759480461](https://github.com/Gane2506/ai-business-os/actions/runs/38759480461) |
| Prisma/application runtime proof | Blocked by compiled-asset smoke failure; PostgreSQL 17 job failed and the 16 job was completing cleanup when observed | [Run 38759480720](https://github.com/Gane2506/ai-business-os/actions/runs/38759480720) |

The dependency-lock failure is resolved far enough for frozen installs and source application builds. Two **confirmed next fixes** remain:

1. `deploy/ringee/Dockerfile.dockerignore` allowlists apps/packages but excludes the new `scripts/copy-auth-runtime.cjs`. The Docker platform build exits with `Cannot find module '/app/scripts/copy-auth-runtime.cjs'`. Include the required build helper in the build context without exposing secrets or generated files.
2. The Prisma workflow's actual application builds complete, then `scripts/auth-runtime.test.cjs` imports compiled configuration without the complete synthetic startup environment. It exits listing missing WhatsApp, frontend/backend URL, OpenRouter, Redis, SES, encryption, Telnyx and Stripe settings. Supply controlled **synthetic test values** before requiring the compiled module, including in the production-image smoke path. Reuse/review the existing patched backend test environment helper where appropriate; do not read production credentials or weaken real configuration validation.

The new actual runtime/Prisma assertions after that smoke step have not been established as passing. Do not merge based only on the green subset or old proof results. Query the exact head again before continuing.

Relevant workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/ringee-runtime-image.yml`
- `.github/workflows/better-auth-frontend.yml`
- `.github/workflows/better-auth-prisma.yml`
- `.github/workflows/better-auth-schema.yml`
- `.github/workflows/better-auth-verification.yml`
- Existing isolated `better-auth-runtime.yml` and `better-auth-sessions.yml`.

The runtime-image stage builds and checks packaged artifacts; it does not deploy, publish an image, or demonstrate complete service startup.

## 7. Historical infrastructure/account state — reverify before changing it

The following was verified earlier in this project, not re-audited on 2026-10-15.

### Contabo and routing

- Server: `203.0.113.10`; saved SSH alias `contabo`, root on port 22.
- Existing NPM admin: `http://203.0.113.10:81/`.
- Existing services on the host must be preserved.
- Four AI Business OS DNS A records were created pointing to the host: `os`, `calls`, `calls-api`, `marketing.connectxmedia.com`.
- Intended roles: Twenty/OS at os, Ringee frontend at calls, Ringee backend at calls-api, Mautic at marketing.
- New application proxy-host/TLS routing and combined application rollout remain pending verification/completion.
- Existing `api.connectxmedia.com` belongs to another application; do not overwrite it.
- Ringee draft NPM network aliases: `business-os-ringee-api` and `business-os-ringee-web`.
- Inspect the actual deployment files and server preflight/domain docs for network names, reserved ports and resource constraints before acting.

### SES

Region: `ca-central-1`.

| Stream | Verified domain | Configuration set | Future sender |
| --- | --- | --- | --- |
| Auth | auth.connectxmedia.com | ses-auth | noreply@auth.connectxmedia.com |
| Transactional | tx.connectxmedia.com | ses-transactional | noreply@tx.connectxmedia.com |
| Communication | mail.connectxmedia.com | ses-communication | noreply@mail.connectxmedia.com |
| Marketing | news.connectxmedia.com | ses-marketing | noreply@news.connectxmedia.com |
| Promotional | offers.connectxmedia.com | ses-promotional | noreply@offers.connectxmedia.com |
| Outreach | outreach.connectxmedia.com | ses-outreach | Disabled by application policy |

All six identities had DKIM and custom MAIL FROM verification success. Cloudflare provisioning added 36 SES DNS records and preserved existing records, including the existing proxied mail CNAME.

Last account state: SES sandbox, production access false, quota 200/day and 1/second. Existing IAM sending restrictions covered five exact noreply addresses and the earlier designated recipient. Production runtime policy examples were prepared but not applied as final unrestricted production authorization.

Earlier test emails were sent before the user's ban. **No further test email is authorized**, including to admin@example.com. Do not use historical test commands as permission.

Application sending remains disabled via `EMAIL_SEND_ENABLED=false`. Outreach is disabled by application policy; do not claim its SES configuration set was disabled at AWS.

Signed feedback transport/code has offline tests. SNS topic/subscription and real feedback delivery are not configured/verified end to end. Production access, runtime IAM and platform/domain enrollment still need completion.

### Secrets — locations/names only, never values

Bitwarden US cloud Secrets Manager:

- Organization: ConnectXMedia, ID `baf6429a-2db2-4345-9571-b4e10007420a`.
- Project: AI Business OS, ID `9bb6c2fe-9e20-4f09-a68d-b4e1000759ee`.
- Machine account: contabo-ai-business-os, ID `cd9c26c2-84c5-42ff-9a05-b4e100078be2`, read-only runtime access.
- User explicitly requested a non-expiring machine access token.
- Runtime bootstrap path: `/opt/ai-business-os/secrets/bitwarden-runtime-token`, root-only mode 0600.
- Never print the token, put it into command arguments/logs, or request that it be pasted into chat.

Last known stored names:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
OPENROUTER_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
TELNYX_API_KEY
```

Independent encryption/auth secrets were generated on the server in `/opt/ai-business-os/secrets/ringee-crypto.env`: `APP_ENCRYPTION_SECRET` and `BETTER_AUTH_SECRET`, root-only mode 0600. They were not imported into Bitwarden at the last verification. **Do not regenerate/overwrite them as a convenience.** Rotation needs an explicit migration/key-lifecycle plan.

The Bitwarden loader uses an allowlisted environment and pinned BWS image. Check the committed tooling for exact version/digest and supported keys. Do not put .env files, access tokens, SSH private keys or provider keys into GitHub.

Missing/unconfirmed runtime inputs include WhatsApp credentials, Telnyx connection/control/public-key and messaging/verification profile/from-number settings. Do not assume an API key alone establishes those resources. Stripe webhook secret already exists in the secret store; inspect configuration before creating duplicates.

## 8. Critical contracts for the next AI

Read pinned Ringee `AGENTS.md` and `docs/engineering/` first.

- Request flow: controller → services → database repository. External server SDKs belong in platform adapters; browser SDK use belongs in its frontend facade.
- User, organization and membership UUIDs are canonical. Never put a Better Auth UUID into a historical clerkId field.
- Membership role is a String, not a newly invented enum. Preserve exact `org:admin` and `org:member`.
- Personal scope is userId AND organizationId null. Organization scope filters by current validated organizationId.
- Browser-supplied user/org/member IDs and roles are not authorization.
- Organization-admin permissions do not imply staff/super-admin permissions.
- Staff access must use currently verified email provenance and the configured allowlist; the actual old guard has no fallback allowlist.
- Preserve UserEmail aliases, primary/verification provenance and global uniqueness. Nullable auth columns preserve legacy unenrolled rows; do not fabricate enrollment.
- Preserve LIFE-004 closed signup/admission and LIFE-005 temporary-password/provisioning idempotency. Do not reset an unrelated existing user's password.
- Preserve product blocks, canCall, account enforcement, concurrent-call protections and revocation behavior.
- Required phone onboarding must not be waived because an integration is missing.
- Credit mutations use existing idempotent CreditService/ledger boundaries.
- Preserve raw webhook bytes and signature verification for Telnyx, Stripe and SNS.
- API-key MCP, CLI personal keys, SDK sessions and browser sessions are distinct credential types.
- A bearer-session plugin is not a replacement OAuth authority for ChatGPT/extension integrations.
- Fresh migrations and existing-database adoption are separate deliverables.
- Use matching SDK versions in actual runtime owners and the pinned pnpm version. The lock has multiple YAML documents; never flatten or silently overwrite existing entries.

## 9. Pending work in recommended order

### A. Finish PR 9 validation and review

1. Read exact repaired-head CI. The lock repair now passes frozen installs; fix the confirmed Docker build-context omission and synthetic smoke-test startup environment first.
2. Confirm the active patch fingerprint and clean upstream-to-final application.
3. Pass ordinary CI, frontend checks, PostgreSQL schema/session/runtime/verification suites, and production-image compiled-factory smoke.
4. Review actual source/behavior, not only filenames or isolated proofs. Merge only when checks appropriate to this stage pass.
5. Record exact head/check results; do not describe this as active auth migration or deployment.

### B. Complete application authentication

1. Compose protected verification storage with hashed sessions using server-owned purpose-separated keys and a defined key lifecycle.
2. Register repository/service/runtime providers deliberately; implement a sanitized GET /api/auth/principal and guarded domain operations.
3. Replace the active global guard/CurrentUser path while preserving every existing caller's contracts.
4. Implement controlled staff enrollment/provisioning, alias reconciliation, verified email, reset/change password, session management, sign-out, account block/unblock and deletion cleanup.
5. Replace Clerk phone verification with the retained Telnyx transport and local fakes; preserve required onboarding and waiver policy.
6. Implement native workspace selection, organization/member/invitation management preserving IDs, roles, extension uniqueness and revocation.
7. Migrate frontend middleware/layouts/shared API/hooks/profile/org UI and all inventory consumers, retaining locale behavior and SSR isolation.
8. Replace realtime Clerk JWTs with a reviewed short-lived single-use ticket flow tied to the parent session, including logout/block/revocation handling.
9. Implement genuine OAuth/PKCE/consent/resource-server parity for extension/ChatGPT consumers; regress MCP API keys, CLI browser approval, SDK OTP/session paths and other integrations.
10. Remove active Clerk environment/webhook/dependency requirements only after full parity. Preserve historical IDs and separately plan any legacy adoption.
11. A shared-domain cookie alone does not give Twenty/Mautic SSO; integrate each app's supported authority/session flow separately.

### C. Deploy core applications safely

- Select reviewed production revisions/images and complete license/dependency review.
- Finalize Twenty, Ringee and Mautic manifests/runtime inputs, health checks, logs, persistence, resource constraints and startup verification.
- Finish NPM proxy hosts/TLS on intended subdomains without changing unrelated services.
- Load secrets through Bitwarden; configure existing crypto values securely.
- Apply the correct fresh-install path only to new databases.
- Prove backup/restore and rollback before relying on production data.
- Add real image publication and authorized deployment/CD only after build and rollout gates are concrete.

### D. Complete email production integration

- Obtain SES production access and final scoped runtime policy.
- Connect signed SNS feedback to the existing backend; validate replay/duplicate/suppression handling with mocks/synthetic payloads.
- Finish stream routing, consent/preferences/suppression and auth/provisioning integration.
- Preserve noreply sender policy; keep outreach disabled unless separately approved.
- Do not send test emails or enable sending merely to complete a checklist.

### E. Deliver actual cross-product workflows

- Implement canonical workspace/customer mappings and idempotent Twenty→Ringee sync.
- Resolve ambiguous phone matches through review rather than treating a phone number as identity.
- Reconcile call results/timeline, contact eligibility, consent and suppression.
- Integrate Mautic enrollment/engagement/unsubscribe without unauthorized re-enrollment.
- Complete shared business UI/workflow experience.
- Enable appropriate human-approved calling and then native AI calling only after its runtime/ownership/budget gates.
- Add scoped agent operations, explicit action approvals/expiry, attribution, rate/cost limits and reconciliation.
- Extend calendar, invoicing and other business operations through verified existing APIs as planned.

The event vocabulary in design docs is proposed internal design, not a claim that all upstream events already exist.

## 10. Agent/cloud execution lessons

User prefers substantial delegation with model complexity matched to work. During this project Astra/high was used for auth/schema/security and Sol/high for bounded frontend/CI work. Route new delegations through the installed Jev skill; recovery of the same task to the same agent follows its documented exception. Do not ask again for settled user choices.

Agent usage limits interrupted turns repeatedly. A failed agent turn is not evidence that work was completed. Persist artifacts before relying on transient agent memory.

Composio cloud scratch was reclaimed multiple times. `/mnt/files` repeatedly failed/hung as an s3fs mount; `/tmp` was small. `/home/user/<task>` was more useful but also ephemeral. Persist final source/patches/test artifacts on GitHub promptly. Shared Jupyter variables can collide; prefix task variables. Provider helper functions advertised in Workbench were sometimes missing; prefer native GitHub tools for complete blob reads/writes.

Large GitHub `fetch_file` results may return empty content; use `fetch_blob` with its SHA. Native blob tools handled the large cumulative patch and lockfile. If using Git trees, always provide the actual parent tree as base_tree; a changed-files-only tree without it can delete unrelated repository content. Never force-push as a recovery shortcut.

Cloud install/compile commands were killed or timed out. Do not report them as passed. GitHub Actions on the exact published commit is the authoritative remaining integration gate.

## 11. Minimal continuation prompt

See [AI_CONTINUATION_PROMPT.md](AI_CONTINUATION_PROMPT.md). It points back here and gives the next AI the immediate repair/validation task and constraints. No chat transcript or secret values should be necessary to understand the code state.
