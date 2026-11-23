# Правка nginx 23.11.2026 — ПРИМЕНЕНА 23.11 (OK владельца), копия до правки: /root/nginx-yugaktsent.conf.bak-20261123-031157

Применять только с OK владельца сервера. Файл: `/etc/nginx/sites-enabled/yugaktsent.neeklo.ru.conf`.
`/etc/nginx/hostcare/*` не трогать. Перед правкой: `cp -a <файл> /root/nginx-yugaktsent.conf.bak-$(date +%Y%m%d-%H%M%S)`,
после: `nginx -t && systemctl reload nginx`; при ошибке — вернуть копию.

## 1. CSP в режиме отчёта (ничего не блокирует, только сообщает)
Добавить в локации HTML (маршруты приложения, `/404.html`, `location /`) рядом с `Permissions-Policy`:

```nginx
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yastatic.net https://api-maps.yandex.ru https://*.yandex.ru; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://mc.yandex.ru https://*.yandex.ru wss://mc.yandex.ru https://api-maps.yandex.ru; frame-src 'self' https://*.yandex.ru https://www.youtube.com https://rutube.ru https://vk.com https://vkvideo.ru; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report" always;
```

Приёмник отчётов уже в API (`POST /api/v1/csp-report`, пишет каждое новое нарушение один раз в журнал:
`grep CSP /var/log/yugaktsent-lg/api-out.log`). Лимит перед ним:

```nginx
location = /api/v1/csp-report {
    limit_req zone=perip burst=20 nodelay;
    limit_req_status 429;
    client_max_body_size 64k;
    proxy_pass http://127.0.0.1:3025;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Через неделю без лишних отчётов — заменить `Content-Security-Policy-Report-Only` на `Content-Security-Policy`.

## 2. Планировки ССК через наш кэш
LCP страницы квартиры ССК — планировка с `bx.sskuban.ru`: ~2 с уходит на соединение со сторонним сервером.
Во внутренний server `127.0.0.1:8099` (перед `location / { return 404; }`):

```nginx
location ~ "^/s/(upload/.+\.(?:png|jpe?g|webp))$" {
    proxy_pass https://bx.sskuban.ru/$1;
    proxy_set_header Host bx.sskuban.ru;
    proxy_ssl_server_name on;
    proxy_ssl_name bx.sskuban.ru;
}
```

В публичный server (перед `location ^~ /uploads/`):

```nginx
location ~ "^/img/ssk/(upload/.+)$" {
    proxy_pass http://127.0.0.1:8099/s/$1;
    proxy_cache yug_img;
    proxy_cache_key $uri;
    proxy_cache_valid 200 30d;
    proxy_cache_valid any 1m;
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating;
    proxy_ignore_headers Cache-Control Expires Set-Cookie;
    add_header Cache-Control "public, max-age=2592000, immutable";
    add_header Strict-Transport-Security $sec_hsts always;
    add_header X-Content-Type-Options "nosniff" always;
    access_log off;
}
```

После применения — во фронте в `proxiedImageUrl` (`apps/web/src/redesign/lib/image-media.ts`) сопоставить
`https://bx.sskuban.ru/upload/…` → `/img/ssk/upload/…` и пересобрать сайт.

## 3. WebP (позже)
Модуль `image_filter` не перекодирует в WebP. Нужен отдельный конвертер (установка пакета на сервер) — отдельное решение.
