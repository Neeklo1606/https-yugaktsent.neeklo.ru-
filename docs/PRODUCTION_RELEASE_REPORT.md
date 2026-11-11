# Релиз 11.11.2026

**Production:** https://yugaktsent.neeklo.ru/ · **Выложенный код:** `d1bbff3` (ветка `release/2026-11-12`, fork `Neeklo1606/…`).
Коммиты релиза: `c6b54a5` (согласие ПД, заявки, SEO-пререндер), `bdc5548` (главная, поиск), `d1bbff3` (SSRF).

## Последовательность (без pnpm на сервере — урок инцидента bcrypt)

1. Бэкап БД `/root/db-backups/yugaktsent_lg-predeploy-20261111-0723.dump` (+ копия в `UGACENT/backups/`, восстановление проверено).
2. Копии `apps/api/dist`, `apps/web/dist` → `/root/rollback-api-dist-20261111-0723` и `-0744`, `/root/rollback-web-dist-20261111-0723`; прежний HEAD `2ed3dee` в `/root/rollback-head-20261111-0723`.
3. `git merge --ff-only` от пользователя admin.
4. `node packages/database/node_modules/prisma/build/index.js migrate deploy` + `generate`.
5. Проверка `bcrypt_lib.node` → `nest build` → `systemctl restart yugaktsent-api` → health ok.
6. Фронт собран локально с боевыми флагами (`VITE_IMAGE_PROXY=1`, `VITE_IMAGE_PROXY_LOCAL=1`, бренд, регион), пререндер по боевому API, `rsync` в `dist.new`, старые чанки сохранены, атомарная замена.
7. nginx: бэкап `/root/nginx-yug-before-404-20261111-0728.conf`, правка маршрутов (`spa.html` / `404.html`), `nginx -t`, reload.
8. Воркер синхронизации: архив `src` в `/root/profitbase-sync-src-*.tgz`, рестарт, полный прогон — ok.

## Smoke после выкладки

Все публичные страницы 200 со своими title; 404 для неизвестных; health ok; 6/8 фидов ok, 0 дублей;
негативные тесты формы 400; тестовая заявка #1 («QA-тест, не звонить») записана с согласием.

## Откат

```
cd /var/www/yugaktsent.neeklo.ru
cp -a /root/rollback-api-dist-20261111-0744/. apps/api/dist/ && systemctl restart yugaktsent-api   # API до SSRF-фикса
mv apps/web/dist apps/web/dist.bad && cp -a apps/web/dist.old-072804 apps/web/dist                 # фронт до релиза
cp /root/nginx-yug-before-404-20261111-0728.conf /etc/nginx/sites-enabled/yugaktsent.neeklo.ru.conf && nginx -t && systemctl reload nginx
```
Миграция добавочная (3 nullable-колонки) — откатывать не нужно, старый код её не замечает.

## Решение

**NO-GO для публичного запуска** · **GO для демонстрации заказчику 12.11** (см. CLIENT_ACCEPTANCE.md).

Блокеры запуска: (1) реквизиты оператора ПД и уведомление РКН — Legal Blocker; (2) Telegram-бот не подключён — менеджеры не узнают о заявках (заявки при этом сохраняются); (3) копии БД только на том же сервере; (4) нет внешнего мониторинга.
