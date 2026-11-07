#!/usr/bin/env bash
# Дамп БД ЮгАкцент. Хранит KEEP_DAYS дней локально.
# Прошлый провайдер потерял сервер вместе с бэкапами в /root — поэтому
# если задан BACKUP_RSYNC_TARGET (user@host:/path) или BACKUP_RCLONE_TARGET
# (remote:bucket/path), дамп копируется ВНЕ сервера.
set -euo pipefail

DB_NAME="${YUGAKTSENT_DB_NAME:-yugaktsent_lg}"
OUT_DIR="${BACKUP_DIR:-/root/db-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
[ -f /etc/yugaktsent/backup.env ] && . /etc/yugaktsent/backup.env

mkdir -p "$OUT_DIR"
file="$OUT_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M).dump"
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$file"
echo "$(date -Is) dump ok: $file ($(du -h "$file" | cut -f1))"

if [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  rsync -a "$file" "$BACKUP_RSYNC_TARGET/" && echo "copied → $BACKUP_RSYNC_TARGET"
fi
if [ -n "${BACKUP_RCLONE_TARGET:-}" ] && command -v rclone >/dev/null; then
  rclone copy "$file" "$BACKUP_RCLONE_TARGET" && echo "copied → $BACKUP_RCLONE_TARGET"
fi

find "$OUT_DIR" -name "${DB_NAME}-*.dump" -mtime +"$KEEP_DAYS" -delete
