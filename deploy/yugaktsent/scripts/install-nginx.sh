#!/usr/bin/env bash
# Ставит конфиг nginx для сайта из шаблона deploy/yugaktsent/nginx/.
# Идемпотентен, вызывается из deploy-full.sh и provision-server.sh.
#
# Если сертификата Let's Encrypt для домена ещё нет (первый запуск на новом
# сервере), ставит временный конфиг только на :80 с /.well-known и выпускает
# сертификат через certbot --webroot, затем ставит полный конфиг.
#
# Usage: SITE_DOMAIN=yugaktsent.neeklo.ru [CERTBOT_EMAIL=...] bash deploy/yugaktsent/scripts/install-nginx.sh
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/yugaktsent-lg}"
SITE_DOMAIN="${SITE_DOMAIN:-yugaktsent.neeklo.ru}"
SRC="$DEPLOY_ROOT/deploy/yugaktsent/nginx"
SITE_CONF="/etc/nginx/sites-available/${SITE_DOMAIN}.conf"
SITE_LINK="/etc/nginx/sites-enabled/${SITE_DOMAIN}.conf"
CERT="/etc/letsencrypt/live/${SITE_DOMAIN}/fullchain.pem"

mkdir -p /var/cache/nginx/yug_img /var/www/certbot
chown www-data:www-data /var/cache/nginx/yug_img 2>/dev/null || true
install -m 0644 "$SRC/yugaktsent-http.conf" /etc/nginx/conf.d/yugaktsent-http.conf

# Дефолтный сайт nginx перехватывает :80 — убираем
rm -f /etc/nginx/sites-enabled/default

if [ ! -f "$CERT" ]; then
  echo "=== Сертификата для $SITE_DOMAIN нет — временный конфиг :80 и certbot ==="
  cat > "$SITE_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SITE_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 503; }
}
EOF
  ln -sf "$SITE_CONF" "$SITE_LINK"
  nginx -t && systemctl reload nginx
  if [ -z "${CERTBOT_EMAIL:-}" ]; then
    echo "ERROR: задайте CERTBOT_EMAIL для выпуска сертификата (DNS A-запись должна уже указывать на этот сервер)"
    exit 1
  fi
  certbot certonly --webroot -w /var/www/certbot -d "$SITE_DOMAIN" \
    --email "$CERTBOT_EMAIL" --agree-tos --non-interactive
fi

sed "s/__DOMAIN__/${SITE_DOMAIN}/g" "$SRC/site.conf.template" > "$SITE_CONF"
ln -sf "$SITE_CONF" "$SITE_LINK"
nginx -t && systemctl reload nginx
echo "nginx: $SITE_CONF установлен"
