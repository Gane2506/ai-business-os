# Ringee fresh-install database baseline

Implemented on 2026-10-11 in `workspaces/ringee-app`, branch
`codex/business-os-foundation`. This is a reproducible **fresh-install** path.
Existing Ringee database upgrades and migration-history adoption remain a
separately reviewed task; no existing user database was accessed or changed.

## Deployment contract

The authoritative fresh-install chain is
`packages/database/prisma/migrations/`. It now contains the tracked PostgreSQL
migration lock and `20261011000000_fresh_install_baseline/migration.sql`.
The baseline was generated from the unchanged checked-in `schema.prisma` using
Prisma **6.16.3**, the exact version resolved by the preserved Prisma pin in `pnpm-lock.yaml` (later SES additions do not change it):

```sh
packages/database/node_modules/.bin/prisma migrate diff \
  --from-empty \
  --to-schema-datamodel packages/database/prisma/schema.prisma \
  --script
```

The generated DDL is augmented with an empty-schema guard and the SQL-only
objects listed below. Regenerating the DDL alone loses those additions. The
baseline creates 123 application tables, 95 enum types, and 490 indexes.

Set `DATABASE_URL` explicitly to a newly provisioned empty PostgreSQL database
before running, from the Ringee repository root:

```sh
pnpm prisma:migrate
```

The repaired root alias runs the database package's `prisma:migrate` script,
which delegates to the existing `db:deploy` (`prisma migrate deploy`). Subsequent
runs apply only pending tracked migrations. Export `DATABASE_URL` through the
environment; these scripts do not load the repository-root `.env` themselves.
The initial migration refuses an existing application schema, even if its
Prisma history table has already been initialized. Do not use `prisma db push`
as the bootstrap path because it cannot install all required database objects.

## Preserved SQL-only guarantees

Both `migrations-pending/` (23 migration files) and `pending-migrations/`
(8 SQL files) were inspected. Their historical ALTERs and data backfills were
not replayed after creating the current schema.

| Object                                                                                            | Historical source                                         | Required behavior                                                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DNCEntry_org_phone_unique` and `DNCEntry_user_phone_unique`                                      | `20260513000100_dnc_freelancer/migration.sql`             | One phone per organization or personal workspace; no implicit merging of scopes (CMP-005).     |
| `Company_organizationId_normalizedName_active_key` and `Company_userId_normalizedName_active_key` | `20261009190000_company_active_name_unique/migration.sql` | The repository's partial `ON CONFLICT` targets work; deleted rows do not reserve active names. |
| `InboundRoute_one_number`                                                                         | `20260920000000_inbound_routing/migration.sql`            | Exactly one purchased or external number per inbound route.                                    |
| `Call_open_inboundTransferRequestedAt_idx`                                                        | `20260922000200_ai_receptionist_call_indexes.sql`         | Index pending transfer requests on calls that have not ended.                                  |
| `InboundRingAttempt_legacy_endpointKey` function and trigger                                      | `20260922000100_ai_receptionist.sql`                      | Old writers receive a derived endpoint key and retain per-call deduplication.                  |

The transfer index uses a normal index build on an empty installation; the
historical concurrent build remains reference material for live upgrades.
All historical named indexes are present in the baseline except
`InboundRingAttempt_callId_userId_key`, which the later receptionist migration
explicitly replaced with `InboundRingAttempt_callId_endpointKey_key`.
Other pending-folder indexes and foreign keys are already represented by the
current Prisma schema and are emitted once by the generated baseline.

## Validation evidence

Validation used the locally installed PostgreSQL **16.9** server in the isolated
`.tools/postgres-foundation/data` cluster, listening only on `127.0.0.1:55432`.
Only synthetic databases `ringee_foundation_validation` and
`ringee_foundation_nonempty` were used. There were no external provider calls.

- Fresh `prisma migrate deploy`: passed; one completed migration history row.
- Live database → current Prisma schema `migrate diff --exit-code`: passed,
  `No difference detected.` This checks Prisma-representable objects only.
- `prisma/tests/bootstrap-invariants.sql`, executed by `psql -X -v ON_ERROR_STOP=1`:
  passed. It verifies valid partial indexes, DNC duplicate rejection in both
  scopes, cross-workspace independence, the exact company upsert predicates,
  company reuse after soft deletion, inbound-route XOR rejection, and trigger
  fallback/explicit-key behavior plus legacy ring-attempt deduplication.
  Fixtures run in a transaction ending in `ROLLBACK`; zero fixture users remain.
- Second `prisma migrate deploy`: passed, `No pending migrations to apply.`
- Repaired root `pnpm prisma:migrate` command: passed against the same disposable
  database with no pending migrations.
- A second database containing only a synthetic sentinel table: deploy correctly
  refused with Prisma `P3005`. Executing the baseline's opening guard directly
  also refused the nonempty schema before any application DDL.
- `git check-ignore` confirms the migration and lock are not ignored.
- Targeted Prettier checks passed for changed Markdown and package manifests.

The direct Prisma commands used for deployment and schema comparison were:

```sh
DATABASE_URL='postgresql://ganesh@127.0.0.1:55432/ringee_foundation_validation?schema=public' \
  packages/database/node_modules/.bin/prisma migrate deploy \
  --schema packages/database/prisma/schema.prisma
packages/database/node_modules/.bin/prisma migrate diff \
  --from-url 'postgresql://ganesh@127.0.0.1:55432/ringee_foundation_validation?schema=public' \
  --to-schema-datamodel packages/database/prisma/schema.prisma --exit-code
```

The negative test used the same deploy command with
`ringee_foundation_nonempty`, after creating `bootstrap_sentinel (id integer)`.
`psql -X -v ON_ERROR_STOP=1 -f /tmp/ringee-bootstrap-guard.sql` against that
synthetic database executed only the baseline's opening `DO` block and exited
3 with the expected empty-schema exception. The sentinel remained the only
public table. The temporary guard extraction is validation output, not a
second migration source.

To repeat the invariant assertions against a disposable migrated database,
use libpq's connection flags (the Prisma `?schema=public` URL parameter is not
a libpq connection option):

```sh
psql -X -h 127.0.0.1 -p 55432 -U ganesh \
  -d ringee_foundation_validation -v ON_ERROR_STOP=1 \
  -f packages/database/prisma/tests/bootstrap-invariants.sql
```

PostgreSQL 17, used by the upstream deployment configuration, was not exercised
in this run. Production connection, deploy, and upgrade validation remain out
of scope. The test cluster can be stopped after validation.

## Existing-database adoption remains open

The two pending directories are historical reference material, not a reliable
ordered production history. Do not run this baseline against an existing Ringee
database, replay those pending files wholesale, or mark the baseline applied
just to silence a nonempty-schema error.

A separate adoption review must inventory the target's actual schema, migration
history, SQL-only objects, and relevant data; compare that state with this
baseline; prepare target-specific data-safe upgrade SQL and a tested
backup/restore plan; and verify constraints and application behavior before
recording an adopted migration history. In particular, existing duplicate
company or DNC rows and partially applied historical changes require deliberate
handling. `DEBT-002` therefore remains partially fixed, and `DEBT-013` still
needs a compatible existing-database upgrade plan.
