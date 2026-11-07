#!/usr/bin/env bash
source /var/www/yugaktsent-lg/deploy/load-api-env.sh
psql "$DATABASE_URL" -c "SELECT a.floor, count(*) FROM listings l JOIN listing_apartments a ON a.listing_id=l.id WHERE l.block_id=3 AND l.kind='APARTMENT' AND l.is_published=true GROUP BY a.floor ORDER BY count DESC LIMIT 10;"
