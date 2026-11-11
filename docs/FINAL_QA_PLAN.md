# Финальная приёмка ЮгАкцент — план проверок (11.11.2026)

Production: https://yugaktsent.neeklo.ru/ · сервер 31.192.111.33 (общий, ~15 сайтов) · ветка `release/2026-11-12`.

## Архитектура (фактическая, не по устаревшему ТЗ на Laravel)

```
Браузер (React/Vite SPA + пререндер HTML для SEO)
  → nginx (TLS, заголовки, limit_req, ресайзер /img, статика dist)
    → NestJS API :3025 (systemd yugaktsent-api) → PostgreSQL yugaktsent_lg (сервер в РФ)
                                               → Redis/BullMQ (очереди новостей/импорта)
    → yugaktsent-profitbase-sync (systemd, Node): фиды из feed_links → API (x-feed-sync)
    → uploads: /srv/yugaktsent-lg/uploads (50 МБ)
Внешние: Profitbase, JCAT, ЦИАН/ДомКлик-выгрузки, Яндекс Карты, YouTube (по клику), Telegram (не настроен), Topnlab (кода нет)
```

Backend фактически NestJS + Prisma; миграцию стека в этом релизе не делали.

## Задачи

| P | Задача | Критерий приёмки | Статус |
|---|---|---|---|
| P0 | Заявка: форма → API → БД | Без согласия/телефона — 400; запись с версией и временем согласия | PASS |
| P0 | Согласие на обработку ПД отдельным документом | `/personal-data-consent`, неотмеченная галочка, версия в БД | PASS |
| P0 | Политика ПД по фактической обработке | Цели, основания, сроки, права, без выдуманных реквизитов | PASS (требует юриста) |
| P0 | Реквизиты оператора | ИНН/ОГРН/юрлицо на сайте | **BLOCKED** — нет данных от владельца |
| P0 | Уведомления о заявках в Telegram | Тестовая заявка приходит в чат | **BLOCKED** — нет токена бота |
| P0 | Админка: CRUD через браузер с входом | ЖК, объекты, заявки, эксперты, фиды | PASS на staging-копии (кроме снятия новостей) |
| P0 | Утечки данных в публичном API | Нет секретов, продавцов, чужих заявок | PASS |
| P0 | Бэкап и восстановление | Свежий дамп восстанавливается | PASS (внешнего хранилища нет — P0 BLOCKED) |
| P1 | SEO: свой title/canonical у каждой страницы, 404 | Нет canonical на главную у /about и т.п. | PASS (исправлено) |
| P1 | SSRF через фиды | Внутренние адреса, в т.ч. через DNS, не скачиваются | PASS (исправлено) |
| P1 | «Долина» на главной | Видна в «Популярных ЖК» | PASS (исправлено) |
| P1 | Тест chessboard-matrix | Зелёный | PASS (тест приведён к движку v4) |
| P1 | Граф Толстой / Хозяин Морей | Причина зафиксирована, обхода TLS и выдуманных площадей нет | BLOCKED (источник) |
| P1 | Производительность ≥ 90 mobile | Lighthouse | **FAIL** (47–86) |
| P2 | Снятие новости с публикации в UI | Кнопка в админке | FAIL |
| P2 | Регионы по URL (/anapa, /maykop) | Свой canonical у города в HTML | Не сделано |
| P2 | Уязвимые зависимости | `pnpm audit` без high в runtime | FAIL (не обновляли перед демо) |

Отчёты: FULL_TEST_REPORT, ADMIN_E2E_REPORT, FEED_HEALTH_REPORT, SEO_GEO_AUDIT, MOBILE_UX_REPORT, PERFORMANCE_REPORT, SECURITY_REPORT, LEGAL_COMPLIANCE_2026-11-11, PRODUCTION_RELEASE_REPORT, CLIENT_ACCEPTANCE.
