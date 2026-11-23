#!/bin/sh
# Restores a dump (default: the newest) into a scratch database and compares row counts with the
# live database, then drops the scratch database. Run it through the backup service:
#   docker compose run --rm --entrypoint sh backup /scripts/verify-backup.sh [/backups/notch-…dump]
set -eu

file=${1:-$(ls -1 /backups/notch-*.dump | sort | tail -n 1)}
scratch=notch_restore_check
echo "Restoring $file into $scratch …"
dropdb --if-exists "$scratch"
createdb "$scratch"
pg_restore --no-owner --exit-on-error --dbname="$scratch" "$file"

status=0
for table in User Session Core Habit HabitLog TargetChange WeeklyReview; do
  live=$(psql -tAc "SELECT count(*) FROM \"$table\"")
  restored=$(psql -d "$scratch" -tAc "SELECT count(*) FROM \"$table\"")
  printf '%-14s live %6s  restored %6s\n' "$table" "$live" "$restored"
  # The dump can be older than the live data, never larger.
  [ "$restored" -le "$live" ] || status=1
done
dropdb "$scratch"
[ "$status" -eq 0 ] && echo "OK: the backup restores." || { echo "MISMATCH" >&2; exit 1; }
