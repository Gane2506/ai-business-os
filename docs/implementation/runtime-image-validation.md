# Runtime image validation

The Ringee runtime workflow recreates the pinned source, applies the cumulative patch, and builds the checked-in Dockerfile's `runtime` target. It checks that the image runs as UID 1000 and includes backend, worker and migration CLI entrypoints. It does not start the application, publish an image, access runtime credentials or deploy services.

Application CI tests migrations and SQL invariants on both the deployment draft's digest-pinned PostgreSQL16 image and upstream PostgreSQL17. These are disposable databases; no existing database is upgraded.

Frontend image validation remains pending the Better Auth build contract. The current frontend draft still uses Clerk public settings. Twenty/Mautic image checks, registry publishing, secret injection, rollback and deployment acceptance are subsequent CI/CD work.
