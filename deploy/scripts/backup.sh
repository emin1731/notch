#!/bin/sh
# Runs in the backup container: a pg_dump every day at BACKUP_HOUR_UTC, plus one at start if
# today's is missing. Dumps are written atomically and pruned after BACKUP_KEEP_DAYS days.
set -eu

dump() {
  file="/backups/notch-$(date -u +%Y-%m-%d).dump"
  pg_dump --format=custom --no-owner --file="$file.tmp"
  mv "$file.tmp" "$file"
  find /backups -name 'notch-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
  echo "$(date -u +%FT%TZ) backup written: $file ($(du -h "$file" | cut -f1))"
}

until pg_isready -q; do sleep 2; done
[ -f "/backups/notch-$(date -u +%Y-%m-%d).dump" ] || dump

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $(printf '%02d' "$BACKUP_HOUR_UTC"):00:00" +%s)
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  sleep $((next - now))
  dump || echo "$(date -u +%FT%TZ) backup FAILED" >&2
done
