#!/usr/bin/env bash
# Подготовка ЧИСТОГО сервера Ubuntu 22.04/24.04 под ЮгАкцент (с нуля, root).
# Ставит Node 22 + pnpm, PostgreSQL 16 + PostGIS, Redis, nginx + image_filter,
# certbot, ufw, swap; затем клонирует репозиторий и запускает bootstrap-server.sh.
#
# Usage (на новом сервере под root):
#   export SITE_DOMAIN=yugaktsent.neeklo.ru CERTBOT_EMAIL=you@example.com
#   curl -fsSL https://raw.githubusercontent.com/letoceiling-coder/https-yugaktsent.neeklo.ru-/main/deploy/yugaktsent/provision-server.sh | bash
# или после git clone: bash deploy/yugaktsent/provision-server.sh
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
LG_REPO_URL="${LG_REPO_URL:-https://github.com/letoceiling-coder/https-yugaktsent.neeklo.ru-.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SITE_DOMAIN="${SITE_DOMAIN:?Задайте SITE_DOMAIN, например yugaktsent.neeklo.ru}"
SWAP_GB="${SWAP_GB:-4}"
export DEPLOY_ROOT SITE_DOMAIN DEPLOY_BRANCH LG_REPO_URL

[ "$(id -u)" = 0 ] || { echo "Запускать от root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "=== 1. Системные пакеты ==="
apt-get update -y
apt-get install -y ca-certificates curl gnupg git build-essential openssl rsync ufw \
  nginx libnginx-mod-http-image-filter certbot redis-server

echo "=== 2. PostgreSQL 16 + PostGIS (репозиторий PGDG) ==="
if ! command -v psql >/dev/null || ! psql --version | grep -q ' 16'; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  . /etc/os-release
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-16 postgresql-16-postgis-3
fi
systemctl enable --now postgresql redis-server nginx

echo "=== 3. Node.js 22 + pnpm ==="
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@10 --activate

echo "=== 4. Swap ${SWAP_GB}G (сборка фронта ест память) ==="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GB}G" /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "=== 5. Фаервол: только SSH, HTTP, HTTPS ==="
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable

echo "=== 6. Каталоги ==="
mkdir -p /var/log/yugaktsent-lg /srv/yugaktsent-lg/uploads /var/www/certbot /root/db-backups
chmod 755 /srv/yugaktsent-lg/uploads

echo "=== 7. Код ==="
if [ ! -d "$DEPLOY_ROOT/.git" ]; then
  mkdir -p "$(dirname "$DEPLOY_ROOT")"
  git clone -b "$DEPLOY_BRANCH" "$LG_REPO_URL" "$DEPLOY_ROOT"
fi

echo "=== 8. Ежедневный бэкап БД ==="
install -m 0755 "$DEPLOY_ROOT/deploy/yugaktsent/scripts/backup-db.sh" /usr/local/bin/yugaktsent-backup-db
echo '30 3 * * * root /usr/local/bin/yugaktsent-backup-db >> /var/log/yugaktsent-lg/backup.log 2>&1' \
  > /etc/cron.d/yugaktsent-backup

echo "=== 9. БД, .env, сборка, службы, nginx ==="
exec bash "$DEPLOY_ROOT/deploy/yugaktsent/bootstrap-server.sh"
