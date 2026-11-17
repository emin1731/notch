#!/bin/sh
# Replaces the live database with a dump. Stop the api first (docker compose stop api), then:
#   docker compose run --rm --entrypoint sh backup /scripts/restore.sh /backups/notch-YYYY-MM-DD.dump
set -eu

file=${1:?usage: restore.sh /backups/notch-YYYY-MM-DD.dump}
echo "This replaces every table in $PGDATABASE with $file."
pg_restore --clean --if-exists --no-owner --exit-on-error --single-transaction --dbname="$PGDATABASE" "$file"
echo "Restored. Start the api again: docker compose start api"
