#!/usr/bin/env bash
source /var/www/yugaktsent-lg/deploy/load-api-env.sh
psql "$DATABASE_URL" -c "SELECT status, count(*) FROM listings WHERE block_id=3 AND kind='APARTMENT' GROUP BY status ORDER BY count DESC;"
