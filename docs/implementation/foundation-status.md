# Foundation implementation status

Implemented locally on 2026-10-11 in `workspaces/ringee-app`, branch
`codex/business-os-foundation`, against the locked Ringee source revision.
The portable patch and hash are preserved in `patches/ringee-app/` and
`config/component-patches.json`. The original audit sources remain clean.

## Completed changes

- Legacy UUID MCP routes return HTTP 410 without resolving identity or dispatching tools. Authenticated API-key transports retain their behavior; dashboard and connection guidance no longer issue legacy URLs. Old CLI configs receive migration guidance. The bundled URL-only plugin remains unsupported until its transport is migrated.
- A tracked fresh-install PostgreSQL migration baseline creates the current Prisma schema and preserves five partial indexes, an inbound-route check and the legacy endpoint-key function/trigger pair. Scripts now provide a working `pnpm prisma:migrate` entry point. Existing database adoption is explicitly separate and the baseline refuses a nonempty application schema.
- `scripts/prepare_component.py` recreates an isolated component worktree and applies fingerprinted patches without resetting existing changes.

## Verification

| Check | Result |
| --- | --- |
| Backend HTTP authorization suite | 27/27 passed; real Nest router, API-key guard and service with in-memory persistence/workspace fixtures |
| Agent client suite | 32/32 passed, including actual loopback HTTP 410 through installed MCP SDK |
| Backend and database builds | Passed |
| Agent production build and CLI typecheck | Passed |
| Agent full typecheck | Two existing errors in untouched `src/tools/catalog.test.ts`, lines 23 and 33; independently reproduced at the pristine pinned revision |
| PostgreSQL fresh deploy and schema diff | Passed on disposable PostgreSQL 16.9; 123 tables, 95 enums, 490 indexes; no Prisma-representable differences |
| SQL-only invariant assertions | Passed; transaction rolled back all synthetic fixtures |
| Repeat migration and nonempty-database rejection | Passed; repeated deploy no-op, nonempty database refused |
| Changed source lint and formatting | Passed |
| Original source/evidence validation | Passed for five pinned clean sources and 250 pinned evidence links |
| Portable patch checks | Clean-source apply check, fingerprint/idempotence/tampering fixtures and actual pinned-source roundtrip passed |

No live OAuth/provider flow, production database, real call, remote deployment,
or production stream was exercised. The backend HTTP harness does not test the
unchanged global Clerk guard; transport dispatch is spied. PostgreSQL 17 from
the upstream deployment configuration remains to be tested. The temporary local
PostgreSQL test server was stopped after validation.

Detailed evidence: [MCP implementation](mcp-security.md) and
[database baseline](database-bootstrap.md).

## Next implementation work

1. Finish per-user WebRTC credentials and DID routing so another workspace never receives shared inbound caller/media offers.
2. Select supported source releases and immutable images; account for Twenty Enterprise boundaries, mobile licensing/signing and external provider dependencies.
3. Build the Twenty–Ringee mapping and signed-event adapter using the existing custom integration surfaces, with durable deduplication and reconciliation.
4. Prepare isolated staging deployment, then test provider calls, client isolation, backups/restores and retention controls.

These local fixes clear two source-level blockers. They do not complete Phase 1
or the product's runtime acceptance gates.

## Agent assignments

Jev selected Executor for both implementation tasks: MCP confidence 1.00,
database confidence 0.97. GPT-6.1 Sol handled the security/consumer change;
GPT-6 Astra handled the migration baseline and SQL invariant validation.
The user selected a tracked fresh-install baseline in `prisma/migrations/`.
The parent reviewed changes, performed builds, reproduced the baseline typecheck
errors, packaged patches and verified their reproducibility. A considered extra
reviewer was not dispatched; parent review was performed inline.

## Later provider changes

The active cumulative patch is now `0002-foundation-ses.patch`, which preserves
these foundation fixes and adds AWS SES. See [provider migration status](provider-migration-status.md).
The original 0001 snapshot remains available. Better Auth is pending.
