# Better Auth frontend stage verification

This checks the dormant facade/form. It does not mount authentication routes, create real users, send messages, or claim a live Clerk cutover.

Prepare Ringee at pinned upstream `b04a4b889a9c827e76f64574f6f3b2f1c5f79241`, apply the active cumulative patch, and install its locked dependencies. The frontend-shared package must include exact Better Auth `1.7.7`; backend integration owns that dependency and lock update.

From the control repository, run:

```sh
node validation/better-auth-frontend/check.mjs /absolute/path/to/prepared/ringee-app
```

The runner validates English/Spanish message keys, checks final formatting and changed-source ESLint, runs strict TypeScript checks including actual TSX/form dependencies, and executes seven mocked SDK/HTTP tests. It uses pinned `tsx@4.20.6` via npx as a CI-only test loader; no source manifest or lock is changed. The test fixtures are synthetic and install mocked fetch before creating the SDK client, because the SDK captures transport at construction.

An unchanged upstream unused-token warning in ApiClient.maybeMock is allowed by the repository's warning policy. The runner does not start Next.js, prerender authenticated routes, use credentials, or call production endpoints. A full frontend build remains a separate CI/release gate.

The exact 57 production Clerk files plus one existing test reference are recorded in `docs/implementation/frontend-auth-consumer-inventory.md`. Live migration remains gated on all-consumer and lifecycle parity.
