#!/usr/bin/env bash
# Fails fast with a clear message if Postgres isn't up, instead of letting
# apps/api's e2e suite or apps/web's Playwright webServer (which needs the
# api dev server, which needs the db) fail later with an opaque timeout.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! docker compose exec -T db pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; then
  echo ""
  echo "✖ Postgres isn't running (or isn't ready yet)."
  echo "  The e2e suite needs it — start it with:"
  echo ""
  echo "    docker compose up -d db"
  echo ""
  exit 1
fi
