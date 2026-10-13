# Better Auth Prisma/PostgreSQL contract proof

This isolated suite runs pinned Better Auth1.7.7 and its Prisma adapter against the actual generated Ringee client and the complete fresh-install migration chain. It uses synthetic, explicitly seeded verified identities. No application login, enrollment, organization plugin, production database, secrets, provider service or email is connected.

Adapter transactions are explicitly enabled. Tests check physical digest-only session rows and query parameters, UUID preservation and verified aliases, closed signup, signed-cookie digest rejection, atomic user/account/session rollback, internal rotation, expiry, scoped revocation and a second auth instance observing revocation.

The suite reuses the reviewed session wrapper and management boundary from `../better-auth-sessions`. Its proof-only route restrictions and production limitations still apply. OAuth and verification fields are mapped for schema compatibility but those flows stay disabled; naming a column encrypted does not encrypt a value. Fixtures seed password hashes directly.

CI runs Node22 and disposable PostgreSQL16/17, generates the pinned Ringee Prisma client, applies migrations and runs the suite. It must pass before any runtime adoption. Guardrails require explicit disposable mode, a loopback database URL named auth_prisma_ci and an absolute path to the reconstructed database package. These guards are an extra protection, not authorization to use an existing database.

This proves database adapter contracts only. Production still needs enrollment/provenance, blocked-user and organization authorization, mounted CSRF-protected management/lifecycle routes, cookie handling, websocket/MCP/SDK integration, protected OAuth/verification storage and existing-database adoption.
