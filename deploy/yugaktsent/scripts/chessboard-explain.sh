#!/usr/bin/env bash
source /var/www/yugaktsent-lg/deploy/load-api-env.sh
psql "$DATABASE_URL" -c "SELECT count(*) AS chess_listings FROM listings WHERE block_id=3 AND kind='APARTMENT' AND visibility='PUBLIC' AND is_published=true;"
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT l.id FROM listings l LEFT JOIN listing_apartments a ON a.listing_id=l.id WHERE l.block_id=3 AND l.kind='APARTMENT' ORDER BY a.floor DESC NULLS LAST, l.id ASC LIMIT 10;"
