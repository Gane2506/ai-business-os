# Better Auth 1.7.7 protected verification storage proof

**Isolated storage proof, not application authentication integration.** This folder adds no schema, application routes, OAuth, transport, deployment configuration or production credentials. Ringee still uses its existing authentication. Closed signup, staff approval and mandatory phone verification remain cutover requirements; this proof does not implement or waive them. Existing session-proof password/reset/deletion route blocks remain unchanged.

## Reproduce

Use Node 22:

```sh
cd validation/better-auth-verification
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm test
```

The separate GitHub workflow reconstructs the pinned Ringee source, applies the active cumulative patch, generates its actual Prisma client, migrates disposable PostgreSQL 16 and 17, and runs both the memory suite and `npm run test:prisma`. The Prisma suite requires `AUTH_PRISMA_PROOF=disposable`, a loopback database named `auth_prisma_ci`, and `RINGEE_DATABASE_PACKAGE_FILE` pointing to that generated database package. It does not accept a remote database. All cryptographic keys and credentials are random synthetic in-memory fixtures and are never printed.

The Better Auth dependency is exactly 1.7.7 with the existing proof's integrity-locked dependency graph. No successful execution is claimed in this document; check the workflow result on the exact published commit. Initial cloud execution was blocked by incomplete dependency extraction after an npm timeout, before any semantic test ran.

## Storage contract

The wrapper acts outside the pinned canonical DBAdapter, before its model/field mapping. Use:

```js
verification: {
  modelName: "AuthVerification",
  fields: { identifier: "identifierHash", value: "valueEncrypted" },
  storeIdentifier: "plain",
}
```

Here `storeIdentifier: "plain"` disables Better Auth's own identifier transformation and fallback lookup; the outer wrapper immediately applies HMAC before storage. It is not permission to persist plaintext. The existing Prisma schema has UUID `id`, indexed nonunique `identifierHash`, text `valueEncrypted`, expiry and timestamps. No schema alteration is needed.

Stored identifiers are `vh1.` plus the hex HMAC-SHA256 of the domain `ringee:verification:identifier:v1\0` followed by the exact UTF-8 identifier. The NUL is one byte. Identifiers are not normalized, hashed identifiers cannot be supplied as credentials, malformed Unicode is rejected, and only exact equality/IN predicates are supported.

Values are AES-256-GCM envelopes `vg1.<nonce>.<ciphertext>.<tag>` using canonical base64url, a fresh random 96-bit nonce and a 128-bit tag. The encrypted JSON contains both the original identifier and value, allowing the pinned UUID-only consume path to restore the canonical record without any plaintext registry. Additional authenticated data binds the version/domain, row UUID, HMAC identifier, expiration milliseconds and creation milliseconds. Moving ciphertext to another row, extending expiry or manipulating newest-row ordering fails authentication. The payload has a 300,000-byte serialized limit, checked before any write; each value also has a 65,536 JavaScript-character cap. Two independent 32-byte keys are required and copied at construction; equal or invalid-length keys are rejected.

Wrong keys, malformed envelopes and authentication failures emit the same generic error without embedding verification data. Expired records never return plaintext to callers. This is defense in depth around the library's expiry gate.

## Pinned semantics and fail-closed boundaries

The proof covers canonical create, findOne/findMany, update, delete/deleteMany, count, consumeOne and transaction adapters. Updates read/decrypt the existing record, re-encrypt with a fresh nonce, and compare the original ciphertext plus UUID when writing. A competing consume/update cannot resurrect or overwrite a changed record; callers must handle conditional-update conflicts. Identifier rotation and expiry changes rebind the ciphertext.

The wrapper rejects bulk updates, unsupported predicates/connectors, projections, sensitive-field sorting, unknown verification fields, physical-model bypasses and joins other than the pinned shallow session-to-user/user-to-account shapes. Expiry-only cleanup predicates are allowed only for past/current cutoffs. Transaction adapters are recursively wrapped. Secondary storage, verification hooks, plugins, experimental joins and alternate identifier storage modes are rejected because they add unproven persistence or mutation paths.

The pinned `findVerificationValue` returns the latest-created row and invokes expiry cleanup. The wrapper filters expired records before return. `consumeVerificationValue` runs in a transaction, selects the newest record, calls `consumeOne` by UUID and removes stale records for the identifier. The PostgreSQL suite uses two independent auth contexts, so an in-process lock alone cannot satisfy the concurrency assertion. Plain find followed by delete is not a single-use primitive and must never authorize a reset or verification state change.

`reserveVerificationValue` is deliberately unsupported: its pinned deterministic non-UUID ID conflicts with Ringee's UUID schema and the authenticated row contract. This proof does not support SAML/JWT replay-tombstone reservation, OAuth, OTP plugins or key rotation. Rotation requires a separately designed migration/key-version policy; replacing keys makes old records unreadable.

## Evidence scope and remaining work

The memory suite exercises actual Better Auth 1.7.7 internal methods, transaction context and memory adapter, plus direct canonical DBAdapter operations. It checks nonce uniqueness, malformed/tag/ciphertext/identifier/UUID/expiry/creation-time tampering, key separation, digest-as-input rejection, single-use duplicate invalidation, rollback, expiry cleanup, unsupported operations, serialized-size limits and closed signup.

The PostgreSQL suite checks actual generated Prisma mapping, stored rows and query parameters for plaintext, UUID preservation, conditional updates, duplicate identifiers, independent-context concurrent consumption, transaction rollback, cleanup and digest rejection. These are executable assertions, not a substitute for a green run on the current commit. Synthetic tamper writes in the test intentionally modify encrypted columns to verify rejection.

No reset-email handler, password reset, phone OTP delivery, admission policy, staff provisioning, verified-email alias reconciliation or production session composition is connected here. Browser/cookie/authenticated-memory responses can contain verification plaintext by design; logs, crash dumps, database backups and production services are outside this proof. The wrapper is a server-owned storage boundary, not an authorization API. Possession of a row UUID is not authorization.

Before cutover, compose this boundary with hashed sessions and actual lifecycle services; preserve closed admission, staff approval and mandatory phone verification; implement transport fakes and whole-flow replay/expiry tests; define cleanup scheduling and key lifecycle; and validate HTTP errors, rate limits, CSRF/origin policy and production logging. No emails, SMS, live provider requests or deployments are part of this proof.

## Pinned primary sources

- [Internal verification lifecycle](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/db/internal-adapter.ts)
- [Verification identifier processing](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/db/verification-token-storage.ts)
- [Database hooks and consume semantics](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/db/with-hooks.ts)
- [Prisma adapter](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/prisma-adapter/src/prisma-adapter.ts)
- [Transaction context](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/core/src/context/transaction.ts)

Any Better Auth version change requires a fresh audit of these contracts and new proof results.
