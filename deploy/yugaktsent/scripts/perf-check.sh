#!/bin/bash
source /var/www/yugaktsent-lg/deploy/load-api-env.sh
psql "$DATABASE_URL" -c "SELECT count(*) AS listings FROM listings WHERE block_id=3;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM catalog_apartment_active_mv WHERE block_id=3;"
time curl -sf -m 10 -o /dev/null -w "health=%{time_total}\n" http://127.0.0.1:3025/api/v1/health
