# Better Auth schema foundation

This adds dormant storage for Better Auth 1.7.7. Clerk remains active. No auth routes, signup paths, adapters, OAuth providers, sends, enrollment, role conversion, or live database adoption are enabled.

## Mapping contract for later implementation

| Logical Better Auth field | Prisma target |
| --- | --- |
| user | User (existing UUID identity) |
| user.email / name / emailVerified / image | authEmail / authName / authEmailVerified / imageUrl |
| session | AuthSession |
| session.token | tokenHash, through the complete digest adapter |
| account | AuthAccount |
| account.password | passwordHash |
| account.accessToken / refreshToken / idToken | accessTokenEncrypted / refreshTokenEncrypted / idTokenEncrypted |
| verification | AuthVerification |
| verification.identifier / value | identifierHash / valueEncrypted |
| organization | Organization (existing UUID identity) |
| organization.logo / metadata | imageUrl / authMetadata |
| member | OrganizationMembership (unchanged) |
| invitation | AuthInvitation |

Sources: [1.7.7 core database schema](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/core/src/db/get-tables.ts) and [1.7.7 organization runtime schema](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/organization/organization.ts). The actual runtime schema has no account issuer field; providerId/accountId is the unique identity pair. Each configured OAuth provider must therefore have a distinct, issuer-bound providerId; multi-issuer adoption needs its own proof. Organization metadata is serialized JSON text. Runtime invitation role is optional and expiresAt is required. Teams, dynamic roles, MFA, and OAuth-provider tables belong to later plugin phases.

Column mapping alone performs no hashing or encryption. Only the isolated session proof currently covers protected storage. OAuth and verification remain disabled pending complete protection, lookup, replay, and expiration proofs. Verification identifiers can contain reset credentials, so both identifier and value need protection. The verification identifier index is intentionally nonunique, matching upstream core schema. OAuth access/refresh/id tokens must be recoverably encrypted; passwords need the pinned password hash format. No generic encryption algorithm is invented by this migration.

Session tokenHash uses h1. plus 64 lowercase hex characters; the proof computes SHA-256 over UTF-8 `ringee:session:v1\0` followed by the raw token. The SQL check enforces representation only. It does not prove entropy, token digestion, or authentication. Raw-token memory handling, no secondary-storage/cookie-cache bypass, and session management by UUID remain required.

User authEmail/authName remain null for legacy rows. SQL rejects partial enrollment, empty names/emails, nonnormalized email, and verified null identities. This does not reconcile UserEmail: enrollment must atomically establish verified-email provenance and Ringee initialization before granting product access. New organization slug and resolved membership requirements must be enforced by that integration. Existing UserEmail aliases and statuses remain authoritative until deliberately reconciled.

Organization.clerkId becomes nullable while preserving its unique index. Existing UUIDs, clerk IDs, customer/encryption data, String membership roles (including exact org:admin), all three membership unique pairs, legacy null-user invitations, and SES models are preserved. Auth sessions selecting a deleted organization are deleted by FK cascade, avoiding implicit personal fallback. Membership verification still belongs in every authorization path.

## Validation

Use only disposable PostgreSQL. From a reconstructed Ringee tree:

1. Apply baseline and email_streams migrations.
2. Apply fixtures-before.sql from this directory.
3. Apply 20261012010000_auth_foundation/migration.sql.
4. Run invariants.sql with psql -X -v ON_ERROR_STOP=1.

Separately deploy the complete fresh-install chain into a second empty database with `prisma migrate deploy`, then run it again and require no pending migrations. Run Prisma format/validate/generate and the actual backend TypeScript build against the generated client.

The SQL tests verify retained UUIDs, encryption metadata, membership role/extension and null invites, UserEmail alias states, SES table presence, enrollment shape, all membership unique pairs, nullable-but-unique Clerk organizations, auth email uniqueness, digest representation/uniqueness, session FKs, provider/account uniqueness, and fail-closed organization deletion. The invariant test body rolls back; migration fixtures are confined to a disposable database.

Cloud validation completed with Prisma 6.16.3 and PostgreSQL 17: schema format/validate/generate; all three SQL migrations with pre-auth fixtures; every invariant assertion; complete Prisma deployment and a clean second deploy. Existing baseline and SES migration blocks are byte-for-byte unchanged. Actual full-backend compilation remains a parent CI gate.

This fresh-install migration chain must not run against an existing unbaselined Ringee database. Existing-database adoption remains a separate reviewed deliverable.
