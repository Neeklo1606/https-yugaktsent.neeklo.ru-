#!/usr/bin/env bash
# Ставит юниты systemd для API и синхронизации Profitbase.
# Идемпотентен: можно гонять повторно, в том числе из деплоя.
#
# Usage: bash deploy/yugaktsent/scripts/install-systemd.sh
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
UNIT_SRC="$DEPLOY_ROOT/deploy/yugaktsent/systemd"
UNITS=(yugaktsent-api.service yugaktsent-profitbase-sync.service)

echo "=== Окружение для systemd из .env ==="
node "$DEPLOY_ROOT/deploy/yugaktsent/scripts/write-systemd-env.mjs"

mkdir -p /var/log/yugaktsent-lg

echo "=== Установка юнитов ==="
for unit in "${UNITS[@]}"; do
  install -m 0644 "$UNIT_SRC/$unit" "/etc/systemd/system/$unit"
  echo "  $unit"
done

systemctl daemon-reload

# PM2 и systemd не должны держать один и тот же порт.
if command -v pm2 >/dev/null 2>&1; then
  for app in yugaktsent-lg-api yugaktsent-profitbase-sync; do
    if pm2 describe "$app" >/dev/null 2>&1; then
      echo "=== Снимаем $app с PM2 (его забирает systemd) ==="
      pm2 delete "$app" >/dev/null 2>&1 || true
    fi
  done
  pm2 save --force >/dev/null 2>&1 || true
fi

echo "=== Запуск ==="
for unit in "${UNITS[@]}"; do
  systemctl enable "$unit" >/dev/null 2>&1
  systemctl restart "$unit"
done

sleep 3
for unit in "${UNITS[@]}"; do
  printf '%-40s %s\n' "$unit" "$(systemctl is-active "$unit")"
done
