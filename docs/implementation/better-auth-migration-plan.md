# Better Auth migration plan for Ringee

Status: implementation plan, not an implemented or deployed authentication change. Prepared 2026-10-12 from Ringee source and Better Auth primary documentation. Scope is Ringee inside the combined business OS; Twenty and Mautic identity integration remains separate.

## Decision and preserved contracts

Replace Clerk with a self-hosted Better Auth instance behind Ringee's backend. Keep PostgreSQL/Prisma, Ringee's UUID identities, service ownership checks, Telnyx, Stripe, WhatsApp, and the cumulative AWS SES work. Do not open public signup as a side effect of replacing the provider.

The inspected source establishes these constraints:

- `User.id` and `Organization.id` are `String @id @default(uuid()) @db.Uuid`. Every downstream ownership reference must retain these IDs.
- `User.clerkId` is already nullable and unique. `Organization.clerkId` is currently required and unique; new Better Auth organizations need it nullable.
- `OrganizationMembership.id` is UUID; `organizationId` is required UUID, `userId` is nullable UUID for legacy unresolved invitations, and `clerkUserId` is nullable. Preserve unique pairs `organizationId/userId`, `organizationId/clerkUserId`, and `organizationId/extension`.
- **There is no RoleEnum in this Ringee schema.** `OrganizationMembership.role` is `String`; `OrgAdminGuard`, `resolveMemberFilter`, and `createDashboardContext` recognize the exact domain value `org:admin`.
- `UserEmail.email` is globally unique. Verification status is `EmailStatus.pending|verified|unverified`; its primary-email and alias behavior cannot be replaced with an unverified email claim.
- `OwnershipContext = { userId, organizationId? }`: organization reads filter by organization alone; personal reads require user UUID **and** `organizationId: null`.
- The source retains a closed signup/demo-review flow (LIFE-004), generated temporary passwords for staff/demo provisioning (LIFE-005), phone onboarding, product account blocks, per-user call permissions, and staff access through verified-email allowlisting.
- The actual super-admin guard has **no fallback allowlist**. Its source overrides stale prose in BUSINESS_RULES.md claiming a hard-coded fallback.
- `20261011000000_fresh_install_baseline` is for empty schemas. Preserve the following `20261012000000_email_streams` migration and the `EmailDomain`, `EmailIdentity`, `EmailPreference`, `EmailSuppression`, `EmailDelivery`, `EmailEvent`, and `EmailUnsubscribeToken` models from cumulative patch 0003.

Source basis: upstream Ringee revision `b04a4b889a9c827e76f64574f6f3b2f1c5f79241`, the earlier source inspection recorded during this work, and the business-OS migration/MCP/SES patches. Cloud handoff identifies business-OS `main` revision prefix `cddeed4`; revalidate the current full commit and patch order before implementation. The upstream code is not vendored in the control repository; reconstruct it in a disposable **cloud** checkout and apply the active cumulative patch according to the repository's source manifest. Do not apply superseded patches twice.

## 1. Prove the integration before broad edits

Choose and pin one published Better Auth release plus matching plugin/adapter versions and lockfile integrity. The repository HEAD noted in decision 0003 is discovery provenance, not a deployment version.

Two compatibility checks are release gates, not reasons to ask the user for routine implementation permission:

1. **Module loading.** Ringee backend/platform/database currently compile CommonJS with ES2017 targets. Current Better Auth Express documentation requires ESM. Prove a narrow platform-owned ESM module loaded through a native dynamic import from the compiled backend and worker. Inspect emitted JavaScript: TypeScript must not rewrite that import into `require()`. Package the ESM file in both production images. If that is unsupported by the pinned runtime, deliberately migrate the affected build graph and validate every consumer; do not discover this only after deployment. [Official Express integration](https://better-auth.com/docs/integrations/express).
2. **Credential storage.** Better Auth's documented session schema includes a unique `token` field; do not claim the Prisma adapter hashes it automatically. Ringee's platform guidance requires stored token hashes. Audit the pinned release for supported digest storage. If absent, implement and test a narrowly scoped adapter wrapper covering creation, lookup, update, deletion, rotation, and session listing, with no bearer-token digest exposed as a new credential. Verify that library response/cookie generation still receives the original token only in request memory. A half-implemented hashing hook is not acceptable. Include verification-token and OAuth refresh-token storage in this audit. Do not weaken the security rule silently. [Official database schema](https://better-auth.com/docs/concepts/database).

Run these proofs against a disposable PostgreSQL database and compiled artifacts, with email/SMS/provider transports replaced by local fakes. No production credentials, outbound messages, calls, billing mutations, or placeholder runtime secrets are needed.

## 2. Additive Prisma design

Use the existing `PrismaService` instance. Put Better Auth imports and configuration in `packages/platform/src/auth/better-auth/`; the database package retains ownership of Prisma types, repositories, and migrations. Inject dependencies through module wiring rather than importing services back into platform.

The chosen design maps Better Auth's user, organization, and member models onto existing domain rows. It avoids a second membership database that can drift after a revocation. Better Auth supports field/model mapping and UUID generation; generate its schema into a scratch file, then manually reconcile the exact pinned-release fields. Prisma migrations remain the deployment mechanism; do not run the Better Auth migration command against Prisma or overwrite Ringee's full schema. [Prisma adapter](https://better-auth.com/docs/adapters/prisma).

| Better Auth concept | Ringee target | Required migration and behavior |
| --- | --- | --- |
| User | Existing `User` | Keep `id` unchanged. Add `authEmail String? @unique`, `authName String?`, and `authEmailVerified Boolean @default(false)`; map Better Auth email/name/emailVerified to these. Map image to `imageUrl`. New enrolled users must have real, nonempty name/email values. Nullable columns preserve pre-enrollment legacy rows; they are not usable auth identities until enrolled. |
| Session | New `AuthSession` | UUID PK and `userId @db.Uuid` FK to User; expiration, timestamps, IP/user-agent, active organization UUID, and the pinned release's required session fields. Implement token storage according to the proof above. Index user and expiry; enforce uniqueness on the stored token representation. |
| Account | New `AuthAccount` | UUID PK, UUID User FK, provider/account identifiers, password hash and required OAuth fields. Add provider/account identity uniqueness consistent with pinned adapter semantics. Never put password hashes in User metadata. |
| Verification | New `AuthVerification` | UUID PK; identifier, protected value, expiration and timestamps exactly matching the pinned release's schema. Preserve single-use/expiry semantics and implement cleanup. |
| Organization | Existing `Organization` | Keep UUID and all domain relations. Relax only `clerkId` nullability, retain its unique index. Add plugin metadata field with its expected storage type; map logo to `imageUrl`. Existing nullable slug remains compatible data, but require a unique slug on newly created organizations. Preserve customer ID, encryption key and creation metadata. |
| Member | Existing `OrganizationMembership` | Keep existing UUIDs, extension and all unique constraints. New Better Auth members always have a resolved User UUID. Legacy null-user rows are not authenticated members and are never returned as such. Add only genuinely required plugin fields from the pinned schema. |
| Invitation | New `AuthInvitation` | UUID PK; organization UUID, inviter User UUID, normalized recipient email, role, status and expiry. Pending invitations belong here, not in a fabricated User or unresolved membership. Require verified mailbox ownership before acceptance. |

This is a schema proposal: the nullable legacy compatibility must pass the pinned adapter's schema validation and real integration tests before committing it. Reject null auth email/name at enrollment and session creation; never invent `unknown@example.com`, a fake Clerk ID, or a shared default password. Keep all legacy Clerk columns as historical references. Do not copy a Better Auth UUID into `clerkId`.

Use explicit UUID generation throughout auth rows and FK columns. Do not rely on a default opaque string ID accidentally fitting PostgreSQL UUID columns. Keep existing SQL-only partial indexes, checks, triggers, delete actions and billing uniqueness intact.

User profile/email reconciliation belongs in the existing UserService/UserRepository path. Ensure a newly created auth user has its UserEmail row, encryption material and domain initialization before product authorization succeeds. Project only trusted auth fields; do not expose privateMetadata, encryptionKey, customer data or operational controls through Better Auth additional fields. Reconciliation must be retryable and fail closed; after-hooks are not evidence that dependent writes committed atomically. Email uniqueness failures must not leave a second accessible account. Use transaction boundaries where supported and test recovery after every partial failure.

For email changes, synchronize authEmail and the primary UserEmail through a controlled flow. A pending new email cannot inherit verification from the previous address. Retain verified aliases only when their provenance remains valid. Disable automatic cross-account linking unless it has explicit, verified identity proof.

Create a new ordered migration after the email-stream migration; do not rewrite a deployed baseline. Add MFA and OAuth-provider tables in their respective phases from the pinned plugin schema. Phone-verification fields must map to the existing User fields where compatible rather than creating a competing truth.

## 3. Organization authorization and ownership

Enable the organization plugin against the mapped Organization and OrganizationMembership models. Use its owner/admin/member authorization for organization-management operations and preserve Ringee's domain role shape at the adapter boundary. Owners/admins become `org:admin`; members become `org:member`. Reject unsupported/multi-role values until deliberately supported. Preserve the plugin's owner lifecycle restrictions, including last-owner handling; organization admin does not grant staff access. [Organization plugin](https://better-auth.com/docs/plugins/organization).

Do not use string substring checks for admin authorization. Update `OrganizationRepository.findAdminMembersWithEmails`, which currently searches for roles containing "admin", to explicit supported role handling so an owner receives operational notifications. Normalize every role exposed by OrganizationService and member list APIs, not only the frontend hook.

At each authenticated request:

1. Resolve a verified, unexpired, non-revoked session.
2. Load the Ringee User UUID and enforce blockedAt and enrollment requirements.
3. Read the session's selected organization and validate a current resolved membership from the database.
4. Derive the role server-side and build CurrentUserData/OwnershipContext through existing helpers.
5. If an explicit organization is invalid, reject the request rather than silently granting personal permissions.

A switch request may propose an organization UUID; only membership validation makes it authoritative. Never accept userId, organizationId, role or private metadata from the browser as proof. Null selection means personal workspace. Membership revocation/downgrade invalidates cached role state and causes existing streams to revalidate.

Existing deployed Clerk membership role strings require a reviewed conversion for plugin compatibility during adoption. Preserve member UUIDs and dialing extensions. Do not reinterpret a legacy admin as a staff user.

## 4. Backend and realtime contract replacement

| Existing files | Planned change |
| --- | --- |
| `apps/backend/src/main.ts`, `app.module.ts` | Replace Clerk middleware/global guard with the platform auth handler plus AuthGuard. Mount the exact `/api/auth` subtree with Express 5-compatible matching before its request body is consumed. Preserve Telnyx/Stripe raw bodies, SES SNS raw bytes and the SDK CORS ordering. |
| `apps/backend/src/clerk.auth.guard.ts` | Replace with `auth.guard.ts`, retaining global default denial and explicit Public metadata handling. Resolve the complete server principal once per request. |
| `packages/platform/src/auth/clerk/current.user.ts`, `auth.module.ts`, auth barrels | Move CurrentUser to provider-neutral auth ownership. Read a verified principal; eliminate provider fetch/privateMetadata identity recovery from decorators. Do not re-export Better Auth SDK objects into services. |
| `packages/platform/src/auth/org-admin.guard.ts` | Read neutral request fields; preserve personal-scope behavior and AllowOrgMember semantics. |
| `api/guards/super-admin.guard.ts`, `routes/backoffice-access.controller.ts`, `guards/voice-agent-organization.guard.ts` | Remove Clerk request fields. Staff requires a currently verified email in BACKOFFICE_SUPER_ADMIN_EMAILS, with empty/missing configuration denying access. |
| `packages/services/src/services/user.service.ts`, `organization.service.ts`; corresponding database repositories | Replace Clerk synchronization paths with provider-neutral user/organization operations. Preserve UUID cache keys or explicitly invalidate old keys. PostgreSQL remains authoritative if Redis is unavailable. |
| `apps/backend/src/api/routes/user-access-enforcement.service.ts` | Replace provider bans/session revocation, retaining persistent product block, canCall enforcement, live-call termination, campaign logout, and device notifications. Unblock only the intended reason; never erase unrelated enforcement. |
| `packages/services/src/services/accounts/account-provisioning.service.ts`, demo-request service/repository, Temporal activities | Replace create/find/set-password provider operations and add a neutral auth identity reference to DemoRequest. Retain generated-password retry/idempotency rules and closed signup. Never reset an existing unrelated user's password. |
| `apps/backend/src/api/routes/clerk.controller.ts`, API module | Remove Clerk webhook registration only when its lifecycle replacements are covered. Update AUTH-003, LIFE-001, WRK-006/007 prose to the new source of truth. |

Better Auth may write sessions directly through its adapter, but business provisioning, notification policies, credit grants and product deletion stay in their existing domain services. User/org deletion must not gain a new route that bypasses Ringee cleanup and retention rules. Do not enable the generic admin plugin's public administration endpoints merely to obtain a ban API.

For `apps/backend/src/realtime/user-events.gateway.ts`, preserve the first auth frame, handshake timeout, device identity, close codes, per-user channels and account-block events. Replace Clerk JWT verification with platform verification. For the browser, obtain a short-lived, one-use realtime ticket over the authenticated API; store its digest with session/user/expiry binding and consume it atomically. The frame's `token` value carries this ticket, with an explicit version/kind negotiated by upgraded clients. It is never a URL query parameter.

Tie the connection to its parent session, revalidate on reconnect and periodically, and close it on logout, revocation, membership change where relevant or block. Ticket replay, expired tickets, client-supplied user UUIDs and tickets from another session must fail. Update `packages/platform/src/realtime/realtime.contracts.ts`, shared realtime client/hooks, and the extension together. Document that old Clerk-only clients require an update; do not silently accept unverified tokens for compatibility.

## 5. Frontend and all consumers

Create a browser-only auth facade in `packages/frontend-shared/src/auth/`, wrapping Better Auth's React client. Keep server SDK/configuration imports out of frontend code. Existing shared ApiClient already sends credentials; preserve device-id headers, error shapes, 402/409 handling and request-scoped server cookies.

Migrate these owners before sweeping leaf components:

- `packages/frontend-shared/src/hooks/use.api.ts`, `lib/api.server.ts`, frontend `lib/api.server`: cookie-based browser requests and a per-request server client. Never cache a user's Cookie/Authorization header in a module singleton.
- `use-org-role.ts`, `use-org-members.ts`, `components/org-switcher.tsx`: neutral principal and organization operations; preserve loading states, personal selection and server-derived permissions.
- `apps/frontend/src/components/layout/clerk-app-provider.tsx`, `src/middleware.ts`, authenticated route layouts: replace provider/hook/UI components; keep protected dashboard, backoffice, infra and CLI approval routes and locale handling. A cookie's presence is only a routing hint; backend authorization remains mandatory.
- Auth/profile pages, `features/auth/lib/phone-access.server.ts`, `phone-verification.ts`, `verify-phone-view.tsx`, sign-in and continuation pages: preserve password reset, verified-email onboarding and phoneRequired waiver behavior.
- `apps/browser-extension/src/background/service-worker.ts`, sidepanel provider/sign-in UI and manifest permissions: replace Clerk Sync Host with a supported authenticated authorization flow. Prefer OAuth authorization code + PKCE for the extension, exact registered redirects and revocable credentials in extension storage, never content-script/local page storage.
- Analytics, infra, profile, calls and integration components using Clerk hooks must move to the facade. Regenerate published setup content only from canonical source.

Use Better Auth's phone and MFA capabilities through platform adapters, mapping the existing verification fields and adding their required tables. Email verification and invitation messages route through Ringee EmailService/SES; phone OTP delivery routes through the retained Telnyx adapter. Missing transport configuration must fail closed with a usable onboarding error, not waive verification. Do not mark imported MFA secrets usable unless an independently validated migration supports them. [Phone plugin](https://better-auth.com/docs/plugins/phone-number), [2FA plugin](https://better-auth.com/docs/plugins/2fa).

Before any later real provisioning email is enabled, explicitly configure deployment-owned sender and recipient policy: the upstream provisioning code hard-codes an Edison sender and edison@getringee.com CC, including credential messages. Do not carry that third-party recipient into this deployment by accident. Document the corresponding LIFE-004/005 policy update; no message delivery is part of this migration preparation.

Public email signup, OAuth auto-signup and invitation-driven enrollment must all respect the closed signup/admission rule. Test every route that can create a user; hiding the signup page is insufficient. OAuth social buttons only appear when the corresponding real provider configuration exists.

## 6. MCP, CLI, SDK and retained integrations

Keep three credential classes separate:

| Surface | Required behavior |
| --- | --- |
| API-key MCP `POST /api/mcp`, `GET /api/mcp/sse`, `POST /api/mcp/messages` | Preserve PersonalApiKeyGuard/Service, hashed keys, blocked-user checks and server-selected workspace. These do not become Better Auth browser sessions. |
| Retired UUID-only MCP URLs | Preserve all four 410 tombstones from the MCP security patch. A UUID remains an identifier, even when a bearer header is also present. |
| ChatGPT MCP `/api/mcp/chatgpt/*` | Replace Clerk OAuth validation with a genuine OAuth resource-server verifier; preserve protected-resource discovery and WWW-Authenticate challenges. Verify issuer, audience/resource, scopes, expiry and revocation, then resolve the Ringee UUID and current workspace membership. |
| CLI `ringee login` | Keep the current browser approval/device-code-to-personal-key flow and environment precedence. Replace dashboard authentication on the approval page; do not replace saved API keys with browser cookies. |
| Dialer SDK `/api/v1/sdk/*` | Preserve SdkSessionGuard, publishable-key checks, email OTP, HMAC session token type/prefix, allowed origins and live integration/user checks. These signed agent sessions remain distinct from Better Auth. |
| Chat/WhatsApp and call-session links | Preserve their existing independently proven authentication and ownership paths. They do not become publicly trusted merely because Clerk is gone. |

A bearer session plugin alone does **not** replace the Clerk OAuth authorization server. Implement the pinned Better Auth OAuth-provider plugin, its schema, authorization/consent UI, exact redirect registration, PKCE and token validation as a dedicated phase. Register only actual needed clients; disable unneeded grants and open dynamic registration by default. The browser extension and ChatGPT connector can use this authority while keeping their distinct scopes/audiences. [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider), [Bearer sessions](https://better-auth.com/docs/plugins/bearer).

For ChatGPT OAuth, preserve OrganizationService's chosen MCP workspace and membership revalidation. Do not let an MCP workspace selection alter a separate browser session unexpectedly. Check blocked users explicitly here: the existing ChatGPT controller bypasses the global guard to emit its own OAuth challenge.

Review `apps/chatgpt-app/src/server/auth.ts`, `ringee-mcp.ts`, `packages/agent/src/clients/auth-client.ts`, `mcp-client.ts`, Attio/HubSpot consumers and the published Dialer SDK. Preserve external response schemas where possible. Add neutral auth fields before removing Clerk-named output fields; never fill a deprecated Clerk field with a different provider's ID. Update consumers in the same release and document any unavoidable breaking response changes.

## 7. Execution order and verification

1. Cloud checkout/source reconstruction, complete Clerk reference inventory, pinned-release runtime and token-storage proofs.
2. Additive schema/configuration/platform adapter with real isolated PostgreSQL tests.
3. Backend principal/guards, provisioning, block/revocation and org/member operations.
4. Browser facade, auth/onboarding/org UI, realtime ticket flow.
5. OAuth resource server/extension/ChatGPT parity; regress CLI, API-key MCP and SDK.
6. Remove active Clerk imports, environment requirements and webhook handler; retain historical nullable IDs and adoption tooling.
7. Update source patches, deployment docs, architecture rules and CI from the same reviewed tree. No live cutover until all required surfaces pass.

Add configuration in `packages/configuration/src/api.configuration.ts`: required Better Auth secret, canonical base URL, explicit trusted origins, and only selected plugin/provider settings. Reuse the separately generated deployment secret described in decision 0003 at eventual deployment; this planning task must not read it. Keep authentication secrets separate from APP_ENCRYPTION_SECRET. Reject missing production values; examples document variable names without working credentials.

Package runtime dependencies wherever the compiled backend and orchestrator resolve them, at matching versions. Verify both production-like startup paths, not only TypeScript compilation. Extend the architecture lint boundary for server-side Better Auth imports while allowing the browser facade's client imports.

Meaningful acceptance tests:

- Empty PostgreSQL migration chain plus second deploy is clean; UUID/FK/unique constraints and SQL-only baseline invariants survive. SES models and their tenant relations remain intact.
- Provision/sign-in/sign-out/reset/verification with faked transports; closed signup across direct API, social login and invitation paths; unknown email and null legacy enrollment fail safely.
- Real guard HTTP tests: missing/expired/revoked session, blocked user, forged UUID/role, invalid selected org, removal/downgrade, personal/org isolation, member-scoped filters and staff allowlist verification.
- Two organizations plus personal data: no cross-tenant reads/writes or stale role access after switching; concurrent member operations preserve extension uniqueness.
- Adapter security tests inspect stored rows and logs for bearer/reset/OTP leakage, replay protection, token rotation and failed partial operations.
- Staff provisioning/demo retry tests retain one login and prevent password resets on unrelated users; all email/SMS deliveries use fakes.
- WebSocket real local-server tests for ticket reuse/expiry, session logout/block, reconnect/device events and unauthorized origin.
- MCP legacy 410 regression, API-key/session token separation, OAuth invalid issuer/audience/scope/revocation, consent/PKCE/redirect rejection and workspace changes between messages.
- SDK OTP/session/publishable-key tests, CLI approval tests, extension login/logout/reconnect tests, frontend loading/errors and cookies/CSRF/origin behavior.
- Raw-body regression for Telnyx, Stripe and SES signatures; SDK CORS remains noncredentialed/dynamic while browser auth origins remain explicit.

From the Ringee workspace, use existing commands after confirming the scripts: `pnpm prisma:generate`, `pnpm prisma:migrate` against disposable PostgreSQL only, `pnpm --filter backend test`, affected package tests/typechecks, `pnpm build:database`, `pnpm build:backend`, `pnpm build:frontend`, `pnpm build:orchestrator`, `pnpm lint`, and `pnpm format:check`. Compare existing failures with the pinned baseline; do not label an unrun check passed. Run no provider smoke sends.

## 8. Existing-database adoption is a separate deliverable

The fresh-install path above does not authorize applying the baseline to an existing Ringee schema or silently enrolling legacy identities.

For adoption, inventory the actual database schema/history, backup and prove restore, compare SQL-only invariants, and create a reviewed forward migration. Match legacy User UUIDs using validated Clerk identity provenance and verified emails; duplicate/ambiguous identities require reconciliation, not automatic merging. Populate auth fields without changing User/Organization/membership UUIDs, customer IDs, encryption keys, credits, ownership, extensions or SES records. Convert legacy role values deliberately and identify an owner for each organization using verified administrative provenance; never promote the first arbitrary member.

Classify pending invitations separately from members; preserve recipient proof. Password migration requires verified supported hash export/import; otherwise perform reset/enrollment through the approved delivery process later. Clerk sessions, OAuth grants, phone/MFA assertions and recovery codes are not automatically Better Auth credentials. Re-enroll or reauthorize wherever proof cannot be carried safely.

Plan a drained cutover with new application instances, new sessions, stream termination and rollback restoration boundaries. Old running processes retain old authentication behavior. Test a restored copy before any production migration. No production adoption, email, SMS, provider action, secret read or deployment was performed to prepare this document.
