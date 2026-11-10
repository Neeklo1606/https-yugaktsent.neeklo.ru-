#!/usr/bin/env bash
set -euo pipefail
# Брендинг и регион для yugaktsent.neeklo.ru (запускать на сервере).
ROOT="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
LOGO_PUBLIC="${LOGO_PUBLIC:-/logo-yug-aktsent.png}"

sudo -u postgres psql -v ON_ERROR_STOP=1 -d yugaktsent_lg <<'SQL'
UPDATE feed_regions SET is_enabled = false WHERE code <> 'anapa';
UPDATE feed_regions SET is_enabled = true, name = 'Анапа', public_site_url = 'https://yugaktsent.neeklo.ru'
  WHERE code = 'anapa';

INSERT INTO site_settings (key, value, group_name, label, field_type, sort_order, updated_at)
VALUES
  ('site_logo_url', '/logo-yug-aktsent.png', 'company', 'Логотип сайта', 'IMAGE', 10, now()),
  ('site_tagline', 'Агентство недвижимости', 'company', 'Слоган', 'TEXT', 11, now()),
  ('default_region_code', 'anapa', 'geo', 'Код региона по умолчанию', 'TEXT', 0, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

UPDATE site_settings SET value = 'ЮгАкцент' WHERE key = 'company_name';
UPDATE site_settings SET value = 'ЮгАкцент — новостройки Анапы' WHERE key = 'site_title';
UPDATE site_settings SET value = '/logo-yug-aktsent.png' WHERE key = 'site_logo_url';
UPDATE site_settings SET value = 'Агентство недвижимости' WHERE key = 'site_tagline';
UPDATE site_settings SET value = 'Агентство недвижимости в Анапе: новостройки, каталог квартир и ЖК.' WHERE key = 'meta_description';
UPDATE site_settings SET value = 'info@yugaktsent.ru' WHERE key = 'email';
UPDATE site_settings SET value = 'Офис Южный Акцент' WHERE key = 'office_title';
UPDATE site_settings SET value = '44.8956' WHERE key = 'office_lat';
UPDATE site_settings SET value = '37.3163' WHERE key = 'office_lng';
SQL

echo "→ brand settings applied"
