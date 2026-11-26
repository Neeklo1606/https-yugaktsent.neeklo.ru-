#!/bin/bash
# Выкладка фронтенда ЮгАкцент на общий сервер (без deploy-full.sh — он пересобирает всё на месте).
# Собирает сайт и SSR локально с боевыми флагами, заливает в dist.new / dist-ssr.new, переносит
# старые файлы ассетов (чтобы открытые вкладки не ловили 404 на чанках), меняет папки местами,
# кладёт свежий spa-template.html и перегенерирует первый экран (пререндер) по данным API.
#
# Запуск из корня репозитория: deploy/yugaktsent/scripts/deploy-web-remote.sh
# Перед запуском: код закоммичен и запушен, сервер сверен (см. правила деплоя).
set -euo pipefail
HOST="${DEPLOY_HOST:-root@31.192.111.33}"
REMOTE="${DEPLOY_DIR:-/var/www/yugaktsent.neeklo.ru}/apps/web"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "Есть незакоммиченные изменения — сначала коммит и пуш" >&2
  exit 1
fi

export VITE_PUBLIC_SITE_URL="${VITE_PUBLIC_SITE_URL:-https://yugaktsent.neeklo.ru}"
export VITE_DEFAULT_BRAND="${VITE_DEFAULT_BRAND:-ЮгАкцент}"
export VITE_DEFAULT_REGION_CODE="${VITE_DEFAULT_REGION_CODE:-anapa}"
export VITE_IMAGE_PROXY=1 VITE_IMAGE_PROXY_LOCAL=1 VITE_ADMIN_DEMO_EDITING=1

cd "$ROOT/packages/shared" && node_modules/.bin/tsc -p .
cd "$ROOT/apps/web"
node_modules/.bin/vite build
node_modules/.bin/vite build --config vite.ssr.config.ts

ssh "$HOST" "rm -rf $REMOTE/dist.new $REMOTE/dist-ssr.new"
rsync -az --delete dist/ "$HOST:$REMOTE/dist.new/"
rsync -az --delete dist-ssr/ "$HOST:$REMOTE/dist-ssr.new/"

ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd "$REMOTE"
cp -a dist "/root/rollback-web-dist-$TS"
cp -a dist-ssr "/root/rollback-web-dist-ssr-$TS"
# старые чанки — для вкладок, открытых до выкладки; шаблон пререндера НЕ переносим
cp -rn dist/assets/. dist.new/assets/ 2>/dev/null || true
mv dist "dist.old-$TS" && mv dist.new dist
mv dist-ssr "dist-ssr.old-$TS" && mv dist-ssr.new dist-ssr
cp dist/index.html dist/spa-template.html
chown -R root:root dist dist-ssr
bash ../../deploy/yugaktsent/scripts/prerender-web.sh | tail -3
# оставляем 3 последние старые сборки
ls -dt dist.old-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
ls -dt dist-ssr.old-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
echo "web deployed $TS"
EOF
