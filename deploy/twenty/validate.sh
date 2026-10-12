#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env ]]; then
  echo 'Missing .env. Run prepare-env.py on the deployment host.' >&2
  exit 1
fi
# Quiet validation avoids displaying resolved database and encryption secrets.
docker compose --env-file .env -f compose.yaml config --quiet
docker network inspect web >/dev/null
printf '%s\n' 'Compose configuration valid; external web network exists.'
