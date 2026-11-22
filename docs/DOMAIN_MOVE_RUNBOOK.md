# ЮгАкцент — переезд на домен заказчика (пошагово)

Обновлено 23.11.2026. Сейчас сайт работает на `yugaktsent.neeklo.ru` (сервер 31.192.111.33).
Ниже — как переключить его на домен заказчика (Reg.ru), не потеряв поиск, заявки и карты.
Переезд на другой **сервер** — отдельный документ: `docs/MIGRATION_PLAN_2026-11.md`.

Обозначения: `NEW` — новый домен (например `yugaktsent.ru`), `OLD` — `yugaktsent.neeklo.ru`.

## 0. Что нужно от заказчика заранее
- Доступ к DNS домена `NEW` (панель Reg.ru) или готовность внести 2 записи по нашей инструкции.
- Ключ Яндекс Карт (JavaScript API), ограниченный доменом `NEW`.
- Номер своего счётчика Метрики, коды Вебмастера и Search Console для `NEW`.
- Реквизиты (юрлицо, ИНН, ОГРН, адрес) — для подвала и политики.

## 1. DNS (за сутки до переезда)
1. Снизить TTL записей `NEW` до 300 с.
2. Записи: `A NEW → 31.192.111.33`, `A www.NEW → 31.192.111.33` (IPv6 — только если сервер его отдаёт).
3. Проверить: `dig +short NEW` возвращает адрес сервера.

## 2. Сервер: сертификат и nginx
1. Сертификат: `certbot certonly --webroot -w /var/www/certbot -d NEW -d www.NEW`.
2. Конфиг: `SITE_DOMAIN=NEW bash deploy/yugaktsent/scripts/install-nginx.sh` — создаёт server-блоки для `NEW`
   (тот же набор: ресайзер, лимиты форм и входа, заголовки безопасности). **Не трогать `/etc/nginx/hostcare/*`.**
3. `www.NEW` и `OLD` → постоянный редирект 301 на `https://NEW$request_uri` (сохраняет ссылки и вес в поиске).
4. `nginx -t && systemctl reload nginx`.

## 3. Настройки приложения
1. `/etc/yugaktsent/api.env`: `PUBLIC_SITE_URL=https://NEW`, `CORS_ORIGINS=https://NEW,https://www.NEW`
   → `systemctl restart yugaktsent-api`.
2. `/etc/yugaktsent/profitbase-sync.env`: адрес API не меняется (локальный), трогать не нужно.
3. Сборка сайта с новым адресом (влияет на canonical, sitemap, Open Graph, JSON-LD):
   `VITE_PUBLIC_SITE_URL=https://NEW PRERENDER_API_BASE=https://NEW/api/v1 …` — затем обычная выкладка
   и `bash deploy/yugaktsent/scripts/prerender-web.sh` (пересоберёт 10 856 страниц квартир с новым адресом).
4. Проверить `https://NEW/sitemap.xml` и `https://NEW/robots.txt` — внутри должен быть `NEW`, не `OLD`.

## 4. Ключи в админке («Ключи и подключения»)
- Ключ Яндекс Карт для `NEW`.
- Свой номер счётчика Метрики. **Отключить вставку Метрики в панели хостинга** (иначе два счётчика и Метрика до согласия).
- Коды Вебмастера и Search Console → они попадут в код страниц при следующем пререндере (до 6 ч или вручную).

## 5. Поисковики
1. Яндекс Вебмастер: добавить `NEW`, подтвердить, отправить `sitemap.xml`; для `OLD` — «Переезд сайта» на `NEW`.
2. Google Search Console: добавить `NEW`, отправить sitemap; для `OLD` — «Изменение адреса».
3. Через 1–2 недели проверить, что в выдаче `NEW`, а `OLD` отдаёт 301.

## 6. Проверка после переключения
- `QA_CHROME=chrome QA_WIDTHS=375,768,1280 QA_BASE=https://NEW node deploy/yugaktsent/qa/browser-qa.mjs` — 0 ошибок.
- Тестовая заявка с сайта → видна в админке «Заявки» (и в CRM/Telegram, если подключены).
- Карта на странице ЖК и на «Поиске на карте» работает с новым ключом.
- `curl -I https://OLD/catalog` → `301 Location: https://NEW/catalog`.
- Вход в админку `https://NEW/admin`, раздел «Фиды» — обновления идут.

## 7. Откат
Вернуть `A NEW` не нужно — достаточно снять редирект `OLD → NEW` в nginx и пересобрать сайт со старым
`VITE_PUBLIC_SITE_URL`. Копии выкладок — `/root/rollback-web-dist-*`, `/root/rollback-api-dist-*`.
