# Better Auth 1.7.7 hashed-session storage proof

**Isolated security proof, not production authentication integration.** Ringee still uses its existing authentication. No application routes, Prisma client, production database, provider, email, or credentials are connected. Disabling account deletion/password reset/password change below is proof-only containment; the production cutover must implement those contracts and preserve Ringee LIFE005 account lifecycle requirements.

## Reproduce

Use Node 22:

```sh
cd validation/better-auth-sessions
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm test
```

Better Auth is exactly 1.7.7 with an integrity-locked dependency graph. Test credentials and signing secrets are random in-memory synthetic fixtures, never configuration for a deployed service. Tests exercise the real Better Auth handler, signed cookies, password verification, internal adapter, memory adapter, and transaction context. They do not prove PostgreSQL/Prisma behavior.

## Storage and bearer boundary

The wrapper accepts canonical Better Auth DBAdapter session operations. It transforms raw tokens before calling the underlying adapter:

`tokenHash = "h1." + SHA256(UTF8("ringee:session:v1\0") || UTF8(rawToken))`

Here `\0` denotes one NUL byte, not two text characters. This is domain-separated SHA-256, not encryption or HMAC. It relies on Better Auth's random high-entropy session tokens. A hash is irreversible and is never returned as a bearer. All values starting with `h1.` are rejected as incoming raw tokens, including values recovered from correctly signed cookies.

Configure `session.modelName = "AuthSession"` and `session.fields.token = "tokenHash"`. The SQL foundation can enforce a unique tokenHash and `^h1\.[0-9a-f]{64}$`. User/session UUIDs are preserved; this proof does not change organization IDs or roles.

A per-operation local map restores only raw tokens the current call supplied. Creation restores the newly generated raw token; lookup restores the presented raw token; rotation restores the new raw token. There is no persisted raw-token registry, reversible fallback, or hash-to-bearer reconstruction. Token-constrained AND queries support equality and IN; unsupported enumeration, projections, unrecognized joins, unknown/OR connectors, token sorting, and bulk updates fail closed. Transaction adapters are wrapped recursively. Core 1.7.7 always supplies shallow findOne session→user and user→account joins even without experimental joins. Only those exact shapes (and empty joins) are allowed; aliases, nested joins, and every other join shape are rejected.

The proof factory refuses secondary storage, cookie session caches, experimental joins, plugins, and session hooks. A secondary store would otherwise create a second raw-token persistence channel. The fixtures explicitly keep origin and CSRF checks enabled even under NODE_ENV=test.

## Why this is not a transparent adapter

Better Auth's built-in list/revoke flows enumerate session token values. Its revoke-other flow compares them with the current bearer and deletes by token. Hash-only storage cannot reconstruct those values safely. Consequently these built-in paths are disabled:

- /list-sessions, /revoke-session, /revoke-sessions, /revoke-other-sessions
- /change-password, /reset-password, /delete-user

Disabled paths reject HTTP requests. Calling unsupported management API methods directly also reaches fail-closed adapter checks. The broad delete check is necessary independently of findMany: the pinned hooks implementation can swallow a prefetch failure before attempting deletion.

`session-management.mjs` demonstrates the required explicit server boundary. It authenticates signed cookies, lists only id/createdAt/expiresAt/current, and deletes by session UUID **AND authenticated user UUID**. UUIDs select records; they confer no authorization. Mutation requires the exact configured Origin. Cross-user or missing session IDs fail with the same generic error. The unwrapped adapter is private to server composition and must never reach clients or arbitrary query APIs.

This is a service proof, not mounted HTTP routes. Production must add authenticated POST routes, the established CSRF policy, blocked-user and fresh-session checks where required, authorization rechecks/race handling, rate limits, safe errors, cookie clearing for current-session deletion, and lifecycle hooks/outbox/cleanup. Revoke-all semantics must define sessions concurrently created after the operation. The direct management deletes bypass Better Auth hooks intentionally; plugins/hooks are prohibited in this proof.

Before Clerk cutover, implement and test replacement password-change/reset/account-deletion contracts (including session invalidation and existing product behavior), invited enrollment with public signup closed, active-organization authorization and deletion, and websocket/MCP/SDK credential boundaries. Do not enable the blocked built-ins as a shortcut. OAuth account token encryption and protected verification records require separate adapters and lifecycle tests.

## Evidence and limits

The recovered final nine-test suite passed on cloud Node 20.20.2 on 2026-10-13 UTC: 9 passed, 0 failed, approximately 2.56 seconds including the join/connector regressions (Composio log log_H_KqItwpihcV). The added GitHub workflow independently runs Node 22; its result must be checked on the published commit. No Node 22 success is claimed from this cloud run.

Coverage:

1. Real password sign-in, signed session lookup, UUID identity, wrong password, tampered cookie, strict foreign-origin rejection, closed signup, sign-out.
2. Internal token rotation, expiry, token-constrained batch lookup and deletion. Rotation response cookie issuance is not covered.
3. Safe session listing, current/revoke-other/revoke-all, cross-user denial, missing/foreign-origin mutation denial.
4. Disabled built-in routes and unsupported broad operations leave stored sessions intact.
5. Wrapped transaction create/read/delete and rollback.
6. Configuration guards prohibit raw-token caches and unsupported extensions.
7. Concurrent request lookups never swap raw tokens or users.
8. Better Auth's actual async transaction context uses the wrapped adapter and rolls back.
9. A stored hash fails direct lookup, Authorization bearer-only lookup (no bearer plugin), and a correctly signed digest cookie. A synthetic signed **raw** cookie succeeds first, verifying the signing format used by the negative test.

The database assertions inspect the memory store's physical AuthSession rows and scan for known raw fixture tokens. This proves that adapter path, not disk/Redis logging, crash dumps, PostgreSQL queries, or application responses. Normal authenticated request/response memory and test clients necessarily contain raw tokens. No bearer plugin compatibility is claimed.

## Pinned primary-source audit

- [Internal adapter](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/db/internal-adapter.ts): session token creation, lookup, update, and secondary-storage behavior.
- [Session routes](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/api/routes/session.ts): token-based list/revocation contracts.
- [Transaction context](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/core/src/context/transaction.ts): transaction-scoped adapter propagation.
- [Database hooks](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/db/with-hooks.ts): prefetch and deletion behavior.
- [Prisma adapter](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/prisma-adapter/src/prisma-adapter.ts): a separate integration must enable transaction support and verify mapping against the actual generated Prisma client.

The test imports pinned package APIs, including the internal transaction context; a Better Auth version change requires a new source audit and this suite before reuse.
