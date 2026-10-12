# Better Auth runtime compatibility proof

This isolated proof pins Better Auth 1.7.7 and TypeScript 5.9.3. It compiles to Ringee's CommonJS/ES2017 module shape, then uses an untranspiled CommonJS bridge containing native `import()` to load Better Auth's ESM entry points. It does not convert the application to ESM or replace Clerk.

The smoke test uses the actual Better Auth package and Node handler. It verifies an empty unauthenticated session, a blocked email/password signup, and a loopback HTTP session request. The fixed secret, email and password are test fixtures only. It creates no user, persists no database records, sends no email and contacts no provider service.

The cloud proof passed on Node 20.20.2. The dedicated GitHub Actions workflow runs it on Node 22, matching the application CI. Run locally in this directory with `npm ci --ignore-scripts --legacy-peer-deps` and `NODE_ENV=test npm test`.

This establishes a candidate loading boundary for the compiled backend. It does not prove Nest lifecycle integration, Prisma adapter compatibility, hashed session storage, signed cookies, organization roles, existing identity adoption, or frontend/MCP/websocket migration. Those requirements remain in the [migration plan](../../docs/implementation/better-auth-migration-plan.md).

Better Auth documents ESM as its supported module format. This bridge loads the ESM build through Node's native loader; it is a compatibility experiment that must be included in application validation before adoption.

Sources: [Better Auth installation](https://better-auth.com/docs/installation), [Node/Express integration](https://better-auth.com/docs/integrations/express), [v1.7.7 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.7).
