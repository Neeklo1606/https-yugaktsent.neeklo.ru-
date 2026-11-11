#!/bin/bash
# Перегенерация HTML первого экрана (главная, каталог, ЖК) и sitemap по свежим данным API.
# Вызывается сервисом синхронизации фидов после каждого прогона; можно запускать вручную.
# Нужны собранные apps/web/dist и apps/web/dist-ssr (их кладёт деплой фронтенда).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT/apps/web"
if [ ! -f dist-ssr/prerender-entry.mjs ] || [ ! -f dist/index.html ]; then
  echo "[prerender-web] нет dist или dist-ssr — пропуск"
  exit 0
fi
export VITE_PUBLIC_SITE_URL="${VITE_PUBLIC_SITE_URL:-https://yugaktsent.neeklo.ru}"
export VITE_DEFAULT_BRAND="${VITE_DEFAULT_BRAND:-ЮгАкцент}"
export VITE_DEFAULT_REGION_CODE="${VITE_DEFAULT_REGION_CODE:-anapa}"
export VITE_IMAGE_PROXY="${VITE_IMAGE_PROXY:-1}"
export VITE_IMAGE_PROXY_LOCAL="${VITE_IMAGE_PROXY_LOCAL:-1}"
export PRERENDER_API_BASE="${PRERENDER_API_BASE:-http://127.0.0.1:3025/api/v1}"
exec timeout 300 node scripts/prerender-seo.mjs
