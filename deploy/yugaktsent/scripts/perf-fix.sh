#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
cd "$PROJECT_DIR"
source deploy/load-api-env.sh

echo "=== perf-fix: migrate + MV refresh + build ==="
cd packages/database
pnpm exec prisma generate
pnpm exec prisma migrate deploy
cd "$PROJECT_DIR"

echo "→ Refresh materialized view..."
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY catalog_apartment_active_mv;" \
  || psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW catalog_apartment_active_mv;"

echo "→ Build API..."
pnpm --filter @lg/shared build
pnpm --filter @lg/api build

echo "→ Build web..."
export VITE_PUBLIC_SITE_URL="${VITE_PUBLIC_SITE_URL:-https://yugaktsent.neeklo.ru}"
rm -rf apps/web/dist apps/web/node_modules/.vite
pnpm build:web

echo "→ Restart PM2..."
pm2 reload deploy/yugaktsent/ecosystem.config.js --update-env
sleep 3

echo "=== Benchmarks ==="
bash deploy/yugaktsent/scripts/perf-check.sh
time curl -sf -m 15 -o /dev/null -w "block_slug=%{time_total}\n" \
  "http://127.0.0.1:3025/api/v1/blocks/%D0%B6%D0%BA-%D1%85%D0%BE%D0%B7%D1%8F%D0%B8%D0%BD-%D0%BC%D0%BE%D1%80%D0%B5%D0%B9"
time curl -sf -m 15 -o /dev/null -w "block_slug_cached=%{time_total}\n" \
  "http://127.0.0.1:3025/api/v1/blocks/%D0%B6%D0%BA-%D1%85%D0%BE%D0%B7%D1%8F%D0%B8%D0%BD-%D0%BC%D0%BE%D1%80%D0%B5%D0%B9"
echo "=== perf-fix done ==="
