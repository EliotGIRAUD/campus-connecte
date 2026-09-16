#!/bin/sh
# Creates campus_lake on existing Postgres volumes (init script only runs on first boot).
set -e
if psql "$LAKE_DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
  exit 0
fi
BASE="${DATABASE_URL%/*}"
psql "${BASE}/postgres" -c "CREATE DATABASE campus_lake;"
