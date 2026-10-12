# Twenty deployment preparation

Prepared 2026-10-11 for Ubuntu at `203.0.113.10`, amd64, Docker 29.1.2 / Compose 5.0.0, 8 cores, 23 GiB RAM and 357 GiB free disk. Host facts and existing Nginx Proxy Manager network `web` were supplied by the main task; this work did not SSH, inspect secrets, start containers, change upstream source or publish routing. The Cloudflare-proxied A record for `os.connectxmedia.com` is reported configured. Live application readiness remains unverified.

## Artifact selection and source evidence

Use the official stable [Twenty v2.45.0 release](https://github.com/twentyhq/twenty/releases/tag/twenty/v2.45.0), published 2026-10-05, source tag commit `7e1431c84adbb264db98ab8b8d008a8401b6d4d6`. This is separate from the audit's pinned commit `444332cf51cb5e451b85d5b2f2b3e04156006d35`; audit findings requiring particular features must be rechecked against this release at runtime. The [official installation guidance](https://github.com/twentyhq/twenty/blob/444332cf51cb5e451b85d5b2f2b3e04156006d35/packages/twenty-docs/developers/self-host/capabilities/docker-compose.mdx) calls for full release image tags and matching release Compose files. Current official guidance was also checked on 2026-10-11.

Public Docker Registry v2 metadata was queried for these image tags, and both amd64 and arm64 manifests were present. The bundle uses tag plus index digest, so a moved tag cannot silently change the artifact. The full index/platform metadata is retained in `deploy/twenty/evidence/artifact-lock.json`.

| Artifact | Exact selected tag | Immutable index digest |
| --- | --- | --- |
| Twenty server and worker | `twentycrm/twenty:v2.45.0` | `sha256:81b6444c146fc39aec5e8de6ff6f996c78714910abf117f129ba78c925690dfd` |
| PostgreSQL | `postgres:16.15-bookworm` | `sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4` |
| Redis | `redis:8.2.10-bookworm` | `sha256:47670742d7924adbcdb404d1288b6327815b23141969c0939b8e5d61f78c2634` |

PostgreSQL stays on the official release Compose's major 16. Its unversioned Redis image is replaced by the current official Redis 8 artifact, with the same `noeviction` policy and added persistence; compatibility needs the queue acceptance test. Registry provenance confirms the publisher's release tag and fetched bytes, but Twenty's image labels contain no source-revision field; a reproducible-build/source attestation has not been established.

Matching [release Compose](https://github.com/twentyhq/twenty/blob/7e1431c84adbb264db98ab8b8d008a8401b6d4d6/packages/twenty-docker/docker-compose.yml), [entrypoint](https://github.com/twentyhq/twenty/blob/7e1431c84adbb264db98ab8b8d008a8401b6d4d6/packages/twenty-docker/twenty/entrypoint.sh), [configuration definitions](https://github.com/twentyhq/twenty/blob/7e1431c84adbb264db98ab8b8d008a8401b6d4d6/packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts) and worker script were reviewed. Evidence snapshots are kept locally. Infrastructure environment names in the manifest come from these sources. No fictional signup or admin credential variable is used.

## Topology and capacity

`compose.yaml` runs one server, one `yarn worker:prod` process, PostgreSQL and Redis. Only the server joins external `web`, under alias `business-os-twenty`, and exposes container port 3000 without any host port. All four services use the separate Compose `app` network. Neither PostgreSQL nor Redis is attached to `web` or published to the host. The application network allows worker/provider outbound traffic.

Named volumes retain database, shared uploads and Redis AOF data. Local storage matches the single-host upstream deployment; back up the uploads volume. S3 can be configured later through the admin panel using actual provider credentials. Do not assume local volumes alone constitute off-host disaster recovery.

Initial limits are server 3 GiB / 2 CPUs, worker 2 GiB / 2 CPUs, PostgreSQL 2 GiB / 2 CPUs and Redis 768 MiB / 0.5 CPU, with Redis maxmemory 384 MiB and `noeviction`. These are operational guardrails, not load-tested sizing or reservations. AOF rewrites need headroom; monitor Redis RSS, OOM/restarts, job lag and failed jobs. A full Redis allocation causes write failures instead of eviction; increase capacity deliberately before it fills. Log rotation is capped at 3 × 10 MB per service. Measure shared-host contention with other business services before expanding workload.

## Prerequisites and missing credentials

- Authorized SSH account/key and target deployment directory. No credential location was supplied to this subtask; none was read. A directory such as `/opt/business-os/twenty` is a proposed deployment location, not an observed existing directory.
- Existing Nginx Proxy Manager must really join Docker network `web`; confirm it before public cutover. NPM admin access and certificate issuance/installation access are required. The DNS record alone does not provide origin TLS.
- Generate `PG_DATABASE_PASSWORD` and `ENCRYPTION_KEY` on the target using the bundled helper. Keep an encrypted off-host recovery copy of `.env`; losing the encryption key makes stored integration secrets unusable. A fresh installation needs no legacy `APP_SECRET` or `FALLBACK_ENCRYPTION_KEY`.
- Owner email/name and a newly chosen strong account password for the private first-admin setup. These are entered into the UI; they are not Compose variables. Confirm intended first workspace/business and initial administrators.
- SMTP provider host/port, username/password, verified sender address and provider DNS/deliverability configuration before enabling invitations, verification or password recovery for general users. Source defaults to a logging email driver; application startup is not proof of delivered mail.
- AI-provider accounts/keys, models, budget policy and applicable Twenty entitlement before testing agents. Google/Microsoft OAuth app credentials and registered callback URLs if calendar/mail/SSO is requested. Lambda/E2B credentials if sandboxed logic functions/code execution is required. Production defaults keep those execution drivers disabled.
- Workspace API credentials and webhook secrets for the external integration adapter, provisioned after owner setup with least privilege. Business/workspace boundaries and Enterprise-only features require the audit's license and isolation decisions.
- Backup destination, encryption key custody, retention, monitoring owner and a tested restore target before storing production CRM data.

## Private first-admin bootstrap

These steps are instructions for the future operator; they have not been executed. Copy only this bundle to the chosen target directory. Do not publish an NPM Proxy Host for the CRM yet, and ensure no existing proxy forwards to the new service.

On the target, from the bundle directory:

```bash
python3 prepare-env.py
docker compose --env-file .env -f compose.yaml -f compose.bootstrap.yaml config --quiet
docker network inspect web >/dev/null
docker compose --env-file .env -f compose.yaml -f compose.bootstrap.yaml pull
docker compose --env-file .env -f compose.yaml -f compose.bootstrap.yaml up -d --wait --wait-timeout 600
docker compose --env-file .env -f compose.yaml -f compose.bootstrap.yaml ps
```

The helper creates `.env` mode 0600 exclusively and refuses to replace an existing file. Its password is hex because the upstream URL interpolates it without encoding; its encryption key is 32 random bytes encoded in base64. Back up the generated file through the chosen secure process. `.env.example` intentionally has blank required secrets and cannot start the stack.

The bootstrap override binds `127.0.0.1:13000`, removes the server from `web`, and uses `http://localhost:13000` for both app processes. Its `!override` syntax requires Compose >=2.24.4 and is supported by the reported target Compose 5.0.0. Do not bind to `0.0.0.0` or bypass the private owner setup.

From the operator's own computer, substitute the authorized SSH account:

```bash
ssh -N -L 13000:127.0.0.1:13000 AUTHORIZED_USER@203.0.113.10
```

Open `http://localhost:13000` in the browser, establish the owner account and first workspace, and verify owner/admin access. Enter no production contact data during bootstrap. The stable release's `IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS` defaults to `true`, restricts later signup to invitations or approved access domains, and is explicitly ignored when no workspace exists. Thus its default does not protect the empty installation. Verify this setting is enabled in the admin configuration after creating the owner, review approved access domains and invite policies, and test an uninvited email is refused. `IS_MULTIWORKSPACE_ENABLED` defaults to `false`; this bundle begins with one workspace. A multi-business hostname and workspace routing plan is separate acceptance work.

Most configuration is database-backed by default (`IS_CONFIG_VARIABLES_IN_DB_ENABLED=true`). Configure SMTP and optional integrations in Settings → Admin Panel → Configuration Variables and verify both processes see the changes. If an environment-only deployment is chosen later, declare each intended application variable in both server and worker and set the supported mode explicitly; adding variables to `.env` alone does not forward them.

## Public cutover and proxy

Complete owner and signup checks before making a public route. Stop the privately bootstrapped app processes and recreate from the primary Compose file; `.env` already contains the final public URL:

```bash
docker compose --env-file .env -f compose.yaml -f compose.bootstrap.yaml stop server worker
docker compose --env-file .env -f compose.yaml up -d --wait --wait-timeout 600
docker compose --env-file .env -f compose.yaml ps
bash validate.sh
```

Confirm port 13000 is no longer bound and the primary containers have no published host ports. Do not include the bootstrap override in subsequent public operations.

In NPM create the Proxy Host only now:

| NPM field | Value |
| --- | --- |
| Domain Names | `os.connectxmedia.com` |
| Scheme | `http` |
| Forward Hostname / IP | `business-os-twenty` |
| Forward Port | `3000` |
| Websockets Support | enabled |
| SSL | valid origin certificate for the domain; Force SSL enabled |

Preserve host and forwarded scheme/IP headers. Confirm Cloudflare uses Full (strict) against a valid origin certificate; the public browser origin and Twenty `SERVER_URL` must both be `https://os.connectxmedia.com`. The [NPM guide](https://nginxproxymanager.com/guide/) documents using a shared external Docker network and forwarding by service hostname. Do not create a Cloudflare cache-everything rule for authenticated/API traffic. Access controls must allow the adapter/provider webhook and OAuth callback paths once they are configured.

## Migrations and readiness acceptance

The release entrypoint initializes an empty database, flushes cache, runs `yarn command:prod upgrade`, flushes cache again, and registers all recurring jobs. Only the server performs these steps; the worker sets both disable flags to `true` and starts after server health. Do not run upstream development reset commands on this database.

The entrypoint prints warnings and continues when upgrade or cron registration fails. `/healthz` checks HTTP liveness only in the reviewed source. The worker probe confirms a running `dist/queue-worker/queue-worker` process only, not successful queue consumption. Compose `--wait` alone cannot certify a valid migration or functioning jobs.

Before declaring acceptance, record:

1. All four services healthy; no restart/OOM loop; server startup logs contain no failed upgrade/registration warnings or database errors. Inspect logs locally and redact them before sharing, because the logging mail driver may include sensitive mail content.
2. Public TLS and `/healthz` succeed; UI login/logout, secure cookies, redirects and actual WebSocket connections work through NPM/Cloudflare. No localhost URL remains in outgoing links.
3. Owner exists, uninvited signup fails under the configured policy, and an invited synthetic test user has the intended role. Verify email delivery/password reset with a controlled recipient after SMTP setup.
4. Create/update a synthetic CRM record, upload/download a test attachment and verify both survive an ordinary container restart.
5. Run a harmless synthetic workflow/background task that produces an observable completed result. Check worker logs/job status, then restart Redis during this synthetic acceptance exercise and verify durable queued work is reconciled without duplicate business effects. Do not use paid communications for this check.
6. Validate MCP/API credentials, agents, app platform and permission gates against the selected release only when their provider credentials and entitlements exist. Verify cross-workspace denials before multi-business production use.
7. Complete an isolated restore drill including DB, uploads and the exact encryption key. Record backup age, restore result and operational ownership.

## Backup and recovery

Create a coherent backup with app writes paused. The following commands are run on the target from the bundle directory; they use container variables and never print database credentials. Secure the backup directory and encrypt/copy it off-host afterward.

```bash
umask 077
mkdir -p backups
docker compose stop server worker
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/database.dump
docker compose run --rm --no-deps --entrypoint tar server -C /app/packages/twenty-server/.local-storage -czf - . > backups/uploads.tar.gz
docker compose up -d --wait --wait-timeout 600
```

Keep the matching artifact-lock/Compose configuration and secure `.env` recovery copy with the backup set. Redis AOF retains live queue state; monitor persistence and back up/reconcile queue state under an agreed drain/quiesce procedure before upgrades. A database/file backup alone does not restore already-queued side effects. Never blindly replay operational jobs after recovery.

Restore first into an isolated, non-public test project using the exact same images and recovered key. On a fresh database, with app processes stopped, use `pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB"` from the dump and restore the uploads tarball into the shared local storage volume. Use a clean database rather than layering a dump over an initialized schema. Remove provider credentials/public routing in the restore environment and reconcile external effects before resuming jobs. Confirm attachment access, records and decryption of a synthetic encrypted setting before production recovery.

For upgrades, take a coherent backup, consult the release's upgrade sequence and breaking changes, update the fixed digests explicitly, and validate migrations/cron plus actual jobs again. An older image against a migrated database is not a rollback plan; restore the coherent pre-upgrade data/key/artifacts after deciding how to reconcile operations performed since the snapshot. Never use `docker compose down -v` against production volumes.

## Local verification and remaining limits

Validation recorded for this bundle: Compose 2.37.1 parses primary and bootstrap configurations with synthetic credentials; required missing secrets fail configuration; server has no host ports in the primary configuration, bootstrap binds localhost only and removes `web`; server/worker image digests and infrastructure settings match; only server migrates/registers jobs; all images pin fetched immutable public digests. Python helper syntax and exclusive mode-0600 generation are checked in a temporary directory using generated dummy credentials, not a real deployment `.env`.

No container image was run, target external network inspected, NPM/TLS configured, provider connected, backup taken or runtime scenario completed by this subtask. Runtime readiness, stable-release feature parity, actual shared-host load and full restore behavior remain acceptance items.
