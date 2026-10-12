# Twenty deployment bundle

Prepared for `os.connectxmedia.com` on the existing Ubuntu Docker host. No rollout has been performed.

See [the runbook](../../docs/implementation/twenty-deployment.md) for prerequisites, private first-admin bootstrap, Nginx Proxy Manager settings, acceptance, backups and rollback.

- `compose.yaml`: immutable Twenty, PostgreSQL and Redis images; persistent data; shared server/worker configuration; external proxy network `web`.
- `compose.bootstrap.yaml`: local-only port 13000 and removal of the proxy network during initial owner setup.
- `.env.example`: documented placeholders, deliberately invalid until keys are supplied.
- `prepare-env.py`: exclusive mode-0600 credential-file creation on the target host. It never displays keys or overwrites an existing file.
- `validate.sh`: quiet configuration and external-network validation on the target.
- `evidence/`: release metadata, digests and matching upstream Compose/entrypoint snapshots. These are evidence, not alternate deployment files.

Run commands from this directory. Do not use `docker compose config` without `--quiet` on a real environment: resolved configuration contains secrets.
