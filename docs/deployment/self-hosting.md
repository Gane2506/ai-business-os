# Self-Hosting AI Business OS

This guide covers running AI Business OS on your own infrastructure with
Docker Compose. Three applications deploy together: **Ringee**
(calling/communications), **Twenty** (CRM), and **Mautic** (marketing).

## Prerequisites

| Tool | Minimum version | Install |
| ---- | --------------- | ------- |
| Docker Engine | 27+ | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose | v2.30+ | included with Docker Desktop / Engine |
| Git | 2.40+ | system package manager |
| Python | 3.11+ | for the source-reconstruction scripts |

OS: any recent 64-bit Linux (Ubuntu 22.04+ recommended). macOS and Windows
work for development via Docker Desktop but are not recommended for
production.

## System Requirements

Scope: running **all** components (Ringee + Twenty + Mautic with their
databases). Suitable for small-to-medium production workloads.

| Resource | Minimum | Recommended |
| -------- | ------- | ----------- |
| CPU | 4 cores | 8 cores |
| RAM | 16 GB | 24 GB |
| Disk | 50 GB SSD | 100 GB+ SSD |
| Network | 1 public IPv4, ports 80/443 open | + a reverse proxy (Nginx Proxy Manager, Traefik, Caddy) with TLS |

Container memory budgets (from the Compose files) total roughly 17 GB across
all services; the minimum above leaves headroom for the OS, Docker itself,
and spikes. Disk usage grows with call recordings, CRM attachments, and
database history — SSD is strongly recommended for PostgreSQL.

### Trimming the footprint

You can run a subset to lower requirements:

- **Ringee only** (~8 GB RAM): skip `deploy/twenty` and `deploy/mautic`.
- **Without Mautic**: saves ~2 GB RAM and the MySQL container.
- Disabling optional analytics/edge services further reduces usage; enabling
  them raises it.

## Quickstart

```sh
# 1. Clone
git clone https://github.com/Gane2506/ai-business-os.git
cd ai-business-os

# 2. Reconstruct upstream sources (they are not vendored)
python3 scripts/checkout_sources.py
python3 scripts/check_sources.py
python3 scripts/prepare_component.py ringee-app

# 3. Configure (never commit real secrets)
cp deploy/ringee/.env.example deploy/ringee/.env   # if present, else create from docs
# Edit .env with your secrets — see "Configuration" below.

# 4. Start
cd deploy/ringee && docker compose up -d
```

## Configuration

All secrets come from environment variables — nothing is hardcoded:

| Variable | Purpose |
| -------- | ------- |
| `POSTGRES_PASSWORD` | Database password (generate: `openssl rand -base64 32`) |
| `APP_ENCRYPTION_SECRET` | Application encryption (generate per deploy) |
| `BETTER_AUTH_SECRET` | Auth session signing (generate per deploy) |
| `OAUTH_JWT_SECRET` | OAuth token signing (generate per deploy, keep separate) |
| `TELNYX_API_KEY` | SMS provider (optional; phone verification fails closed without it) |

Copy the provided `.env.example` files and fill in real values. Keep `.env`
out of git (it is git-ignored).

## Ports

| Port | Service |
| ---- | ------- |
| 80 / 443 | Reverse proxy (TLS termination) |
| 3000 | Ringee frontend (internal; proxy in production) |
| 3001 | Ringee backend API (internal) |

See `deploy/*/compose.yaml` for the full list. Change bindings via the
Compose files, not by editing application code.

## Upgrades

1. `git pull` the new release tag.
2. Re-run the source-reconstruction scripts (pins may have moved).
3. `docker compose pull && docker compose up -d`.
4. Back up PostgreSQL before major versions (`pg_dump`).

## Troubleshooting

See `docs/troubleshooting.md`. For security issues, see `SECURITY.md` —
do not file them as public issues.
