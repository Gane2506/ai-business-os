# Mautic deployment preparation

This is an isolated, single-tenant Docker Compose deployment template for `marketing.connectxmedia.com`. It does not deploy or contact the server. Each business/isolation boundary gets its own Compose project, Mautic database, credentials, persistent volumes, sender configuration and API principal. Mautic Projects are not treated as a tenant authorization boundary.

## Image and runtime selection

The template uses Mautic's official `mautic/mautic` Apache image at `7.2.1-20260923-apache`, pinned by the multi-platform manifest digest `sha256:ff584fd13c8db06b4a7dd640e837dbbde69bd8c40da62140ff6c3c2dd0402abc`. Docker Registry resolved this manifest on 2026-10-11 to AMD64 image digest `sha256:6527ff1d4f9061e900cf427309d45afcd9f23cefeaf5a17d50f0b8b4bdf90733` and ARM64 image digest `sha256:0b7b0351980d061887fdffd2499f2566c5ecfd28d262f1abdf3ee1bbde24db05`. The database is official `mysql:8.4.7`, pinned to manifest digest `sha256:0426ec38c7a10aa45ba383887df7878f74ee70e2fd589c7b69207f3577901903`; Mautic 7 requires MySQL 8.4 or later. Re-resolve and review both pins before upgrades.

Mautic's official Docker guidance supports image tags for Mautic 5 and later, documents separate web/cron/worker roles and recommends Apache over FPM because of current FPM and example Nginx concerns. Its Compose examples are explicitly examples rather than production-ready configurations. This template uses the Apache role, persistent configuration/log/media volumes, a private DB/cron network, and the existing external NPM network only for the web container. No worker is included: Mautic's Messenger transport is synchronous by default. Add a worker and durable transport only if async queueing is deliberately configured.

This host is reported to have Docker Compose v2, 8 CPU cores, 23 GiB RAM and 357 GiB free disk. Those figures do not account for other services, retention or growth; observe CPU, memory, DB/storage growth and campaign/segment runtimes before sizing production limits.

## Files and required values

- [`compose.yaml`](../../deploy/mautic/compose.yaml) defines Mautic web and scheduled cron containers, MySQL, health checks, persistent volumes, and network boundaries.
- [`.env.example`](../../deploy/mautic/.env.example) contains image references, site routing, and required database values. Copy it to `.env`, replace both password placeholders with distinct high-entropy values from an approved secret manager, and set owner-only file permissions. Do not commit `.env` or paste credentials in tickets/logs.
- `PROXY_NETWORK` must match the existing Docker network shared with Nginx Proxy Manager. Confirm the NPM container is attached to this external network before starting the Compose project. The web container is reachable there as `${TENANT_SLUG}-mautic-web` on port 80; the database and cron process are not attached to that network.

## Bootstrap prerequisites and sequence

1. Confirm the Docker host has Compose v2, the external proxy network exists, and `marketing.connectxmedia.com` resolves to the intended Cloudflare-proxied origin. The DNS record is reported ready; this preparation did not verify its live resolution.
2. Copy `.env.example` to `.env`, generate unique MySQL app/root passwords, and change file permissions to `0600`. `TENANT_SLUG` must be unique per tenant and URL-safe. Set `PROXY_NETWORK` to the verified NPM network name.
3. Have an NPM proxy host route `marketing.connectxmedia.com` to `http://connectx-mautic-web:80`; configure a valid origin certificate and Cloudflare SSL/TLS mode `Full (strict)`. Do this before completing the Mautic installer so its canonical URL is HTTPS.
4. Start only the database and web services, wait for the DB health check, then finish the browser installer at `https://marketing.connectxmedia.com`. Enter `db` as the SQL host, port `3306`, and the database/user/password from `.env`. Set the public site URL to the HTTPS hostname, use a dedicated administrator account with MFA where available, and do not enable demo/test data. The included web health check verifies the login page responds; it does not prove that setup, SMTP, API authorization or campaigns work.
5. After installation and an administrative login succeed, start `mautic_cron`. The official image's cron role runs Mautic's scheduled work. Confirm its logs and Mautic system status, then verify that segment updates, campaign rebuild/trigger, broadcasts and webhook queue processing have the expected schedules for the selected release. Use only commands present in the pinned release (`php bin/console list mautic`).
6. Before the Twenty integration, enable Mautic API access intentionally, leave Basic authentication disabled unless a specific reviewed client requires it, provision a least-privilege integration principal and OAuth credentials, and store secrets outside source control. Validate a read-only API request and signed webhook verification with synthetic data before enabling writes.
7. Configure SMTP/transactional mail, sender identity, bounce/return-path handling, SPF, DKIM and DMARC with the chosen provider. Start with provider sandbox/test recipients and verify deliverability and suppression behavior before any production recipient is enrolled. SMS provider credentials, callback configuration and spend limits remain separate prerequisites. No email or SMS was sent as part of this preparation.

The documented one-time `mautic:install` CLI route accepts an administrator password as a command argument, which may be exposed in shell history or process listings. Prefer the browser installer or a controlled secret-injection method for bootstrap; never put the password in this document or a shell command copied into a ticket.

## Health, backups and operations

The database health check uses `mysqladmin ping`; the web check requests `/s/login` with the configured host header. The `start_period` allows first initialization and database migrations to complete. Docker health is a liveness/readiness signal only: monitor application errors, cron completion/lag, database health, disk growth and outbound provider failures as well.

Back up the MySQL volume and all Mautic volumes (`config`, `logs`, `files`, `images`) consistently, encrypt backups, and test a restore before production. The config volume can contain local application configuration and secrets. Define retention, off-host storage, recovery point and recovery time targets. Never use `docker compose down -v` for routine maintenance because it removes persistent volumes.

## Verified upstream references

- [Official Mautic Docker image README](https://github.com/mautic/docker-mautic): supported major versions, Apache/FPM guidance, container roles, environment variables, volume paths, CLI use, and the warning that sample Compose files are not production-ready.
- [Official image tags](https://hub.docker.com/r/mautic/mautic/tags): current Mautic 7.2.1 dated Apache tag and platform variants were listed during this audit. The full manifest and child digests above were queried directly from Docker Registry on 2026-10-11.
- [Mautic 7.2.1 release metadata in the audited source](https://github.com/mautic/mautic/blob/bc46b64883255608e5b14a41987c207de9535616/app/release_metadata.json): PHP and database requirements. The checked-out source confirms Mautic 7.2.1 but does not itself prove that source commit produced the container artifact.
- [Official Mautic API configuration](https://github.com/mautic/mautic/blob/bc46b64883255608e5b14a41987c207de9535616/app/bundles/ApiBundle/Config/config.php): API and Basic authentication defaults in audited source.
- [Official Docker Compose v2 documentation](https://docs.docker.com/compose/): Compose file behavior and service health dependency support.

## State and remaining gates

No deployment, SSH access, server health check, environment/secret read, NPM change, mail-provider setup, API call to a live Mautic instance or message sending occurred. SMTP credentials/provider, sender domain verification, SMS configuration, backup destination/restore test, alerting, per-tenant subdomain decisions, first administrator provisioning, and runtime load are still open. The separate-instance design follows the source audit's finding that Mautic Projects and owner permissions do not prove tenant isolation.
