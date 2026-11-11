# Полный отчёт о тестировании — финальная матрица приёмки (11.11.2026)

Обозначения: PASS / FAIL / BLOCKED / N/A / NOT RUN. Ссылки — на отчёты в `docs/` и тесты в репозитории.

## Infrastructure

| Пункт | Результат | Доказательство / ограничение |
|---|---|---|
| Production доступен | PASS | `/api/v1/health` ok, все страницы 200 |
| HTTPS | PASS | LE до 07.02.2027, автопродление |
| Backend | PASS | systemd active после 2 рестартов |
| База | PASS | миграция `20261111200000_request_consent` применена |
| Очереди | PASS (staging) | публикация новости через BullMQ |
| Cron / синхронизация | PASS | прогон 04:45 UTC, 6/8 ok |
| Backup | PASS / **внешнего хранилища нет** | ежедневно 03:40; дамп восстановлен локально (79 таблиц, 0 ошибок), копия на Mac владельца |
| Monitoring | **FAIL** | внешнего мониторинга нет; логи в /var/log/yugaktsent-lg |

## Public website

| Пункт | Результат | Примечание |
|---|---|---|
| Главная | PASS | H1 исправлен, «Долина» в «Популярных ЖК» |
| Анапа / Майкоп | PASS | переключатель города; 4+2 ЖК |
| Каталог, фильтры, подсказки | PASS (юнит) | «2к до 15 млн», «двушка до 7,5 млн», «студия от 25 м²», «евродвушка» — `smart-query.test.ts` |
| Карточки ЖК / квартир | PASS | открываются, 0 ошибок консоли, 0 битых картинок на главной |
| Карта, избранное | NOT RUN в этом цикле | прошлый прогон 03.11 |
| Новости | PASS | 0 опубликованных — раздел пустой |
| Эксперт | PASS | `/experts/vladislav-goncharov` с пререндером |
| Контакты | PASS | |
| Формы | PASS | без согласия/телефона — 400; тестовая заявка #1 в БД с согласием и utm |
| Юридические страницы | PASS | 4 страницы, мобильная ширина без скролла |
| 404 | PASS | настоящий код 404 |

## Admin — см. ADMIN_E2E_REPORT.md

Вход PASS · Роли NOT RUN · Dashboard PASS · ЖК CRUD PASS · Квартиры/цены PASS · Ручные изменения PASS ·
Фиды PASS · Справочники/застройщики PASS (создание на месте) · Новости PARTIAL (нет снятия) · Эксперты PASS ·
Заявки PASS · Настройки/Тема/SEO NOT RUN. Всё — на staging-копии; на проде UI админки не тестировался (нет доступа).

## Integrations

| Пункт | Результат |
|---|---|
| Фиды | 6 PASS, 2 BLOCKED (источник) — FEED_HEALTH_REPORT |
| Telegram | **BLOCKED** — токен и чат не заданы; заявка сохраняется, `telegram_sent=false` |
| Topnlab | **BLOCKED / N/A** — интеграции нет в коде, доступов нет |
| Карты | PASS (Яндекс) |
| Аналитика | N/A — счётчик не подключён |
| Авито / Яндекс.Недвижимость | N/A — не реализовано |

## Quality

Mobile PASS (375 px) · Tablet NOT RUN · Desktop PASS · Accessibility PASS (Lighthouse 98–100) ·
Performance **FAIL** (47–86) · SEO PASS · Regional SEO PARTIAL · GEO PARTIAL · Security PASS c рисками ·
Legal **Legal Blocker** (реквизиты оператора, РКН).

## Автотесты

- Web: `npx vitest run` — 47 файлов, 203+ тестов, **все зелёные** (в т.ч. ранее падавший chessboard-matrix).
- API: `vitest --config apps/api/vitest.config.mjs src/modules/requests` — 10/10 (валидация заявок).
- Web typecheck: 441 ошибка = базовая линия, новых нет. API `nest build` — OK.
