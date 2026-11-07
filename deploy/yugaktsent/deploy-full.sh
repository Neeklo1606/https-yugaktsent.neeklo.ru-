#!/usr/bin/env bash
set -euo pipefail

# Полный деплой ЮгАкцент на yugaktsent.neeklo.ru.
# Запуск: bash /var/www/yugaktsent-lg/deploy/yugaktsent/deploy-full.sh

PROJECT_DIR="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
export DEPLOY_ROOT="$PROJECT_DIR"
LOG_DIR="/var/log/yugaktsent-lg"

echo "=== ЮгАкцент: деплой ==="
echo "Project: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy deploy/yugaktsent/env.example → .env and configure."
  exit 1
fi

mkdir -p "$LOG_DIR" /srv/yugaktsent-lg/uploads

# shellcheck disable=SC1090
source "$PROJECT_DIR/deploy/load-api-env.sh"

API_PORT="${API_PORT:-3025}"

echo "→ Installing dependencies..."
export CI=true
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "→ Generating Prisma client..."
cd packages/database
pnpm exec prisma generate
cd "$PROJECT_DIR"

echo "→ Applying DB migrations..."
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi
cd packages/database
pnpm exec prisma migrate deploy
cd "$PROJECT_DIR"

echo "→ Seeding DB (admin user, defaults)..."
cd packages/database
DATABASE_URL="${DATABASE_URL}" pnpm exec tsx prisma/seed.ts 2>/dev/null || echo "WARN: seed skipped or failed"
cd "$PROJECT_DIR"

echo "→ Building shared..."
pnpm --filter @lg/shared build

echo "→ Building API..."
pnpm --filter @lg/api build

echo "→ Building frontend..."
rm -rf apps/web/dist apps/web/node_modules/.vite
rm -rf apps/web/public/assets apps/web/public/catalog apps/web/public/complex apps/web/public/index.html
SITE_FOR_WEB="${VITE_PUBLIC_SITE_URL:-${PUBLIC_SITE_URL:-https://yugaktsent.neeklo.ru}}"
SITE_FOR_WEB="${SITE_FOR_WEB%/}"
export VITE_PUBLIC_SITE_URL="$SITE_FOR_WEB"
# Флаги прод-сборки (раньше задавались руками при ручной сборке — теперь здесь):
#  IMAGE_PROXY / IMAGE_PROXY_LOCAL — фото через nginx-ресайзер /img/<w>/...
#  ADMIN_DEMO_EDITING — редактор экспертов в админке, пока нет API сохранения
export VITE_DEFAULT_BRAND="${VITE_DEFAULT_BRAND:-ЮгАкцент}"
export VITE_DEFAULT_REGION_CODE="${VITE_DEFAULT_REGION_CODE:-anapa}"
export VITE_IMAGE_PROXY="${VITE_IMAGE_PROXY:-1}"
export VITE_IMAGE_PROXY_LOCAL="${VITE_IMAGE_PROXY_LOCAL:-1}"
export VITE_ADMIN_DEMO_EDITING="${VITE_ADMIN_DEMO_EDITING:-1}"
# Пререндер страниц ЖК берёт список из локального API, а не через домен:
# во время переезда DNS ещё может смотреть на старый сервер.
# На самом первом деплое API ещё не запущен — пререндерятся только / и /catalog;
# после первой синхронизации фидов запустите deploy-full.sh повторно.
export PRERENDER_API_BASE="${PRERENDER_API_BASE:-http://127.0.0.1:${API_PORT}/api/v1}"
pnpm build:web
# index.html, robots.txt, sitemap.xml содержат исходный домен строкой —
# при переезде на другой домен переписываем его в готовой сборке.
if [ "$SITE_FOR_WEB" != "https://yugaktsent.neeklo.ru" ]; then
  echo "→ Домен сборки: $SITE_FOR_WEB (замена в dist)"
  grep -rlF "https://yugaktsent.neeklo.ru" apps/web/dist --include='*.html' --include='*.txt' --include='*.xml' \
    | xargs -r sed -i "s#https://yugaktsent\.neeklo\.ru#${SITE_FOR_WEB}#g"
fi

echo "→ Installing profitbase-sync dependencies..."
cd deploy/yugaktsent/profitbase-sync
# npm ci не трогает package-lock.json. npm install его переписывал, и файл
# становился «изменённым» — следующий git pull --ff-only падал на нём.
if [ -f package-lock.json ]; then
  npm ci --omit=dev 2>/dev/null || npm install --omit=dev
else
  npm install --omit=dev
fi
cd "$PROJECT_DIR"

echo "→ Перезапуск служб (API + синхронизация Profitbase)..."
export DEPLOY_ROOT="$PROJECT_DIR"
# Окружение пересобираем из .env на каждом деплое: правки в .env должны
# доезжать до служб без ручных действий.
bash deploy/yugaktsent/scripts/install-systemd.sh

echo "→ Updating nginx..."
# Домен берём из PUBLIC_SITE_URL (.env), конфиг — из шаблона, который работал на проде
SITE_DOMAIN="${SITE_DOMAIN:-$(printf '%s' "$SITE_FOR_WEB" | sed -E 's#^https?://##; s#/.*$##')}"
SITE_DOMAIN="$SITE_DOMAIN" DEPLOY_ROOT="$PROJECT_DIR" bash deploy/yugaktsent/scripts/install-nginx.sh

echo ""
echo "=== Deploy complete ==="
systemctl --no-pager --plain list-units 'yugaktsent-*' | head -5
sleep 2
echo "Health:"
curl -sf "http://127.0.0.1:${API_PORT}/api/v1/health" | head -c 300 || echo "WARN: health check failed"
echo ""
