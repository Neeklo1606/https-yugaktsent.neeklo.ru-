# ЮГАКЦЕНТ — frontend baseline (PROMPT 0)

Дата: 26.10.2026 · ветка `redesign/v3` от `main` = `ce62968` (совпадает с боевой сборкой от 07.10.2026).

## Структура

| Что | Где |
|---|---|
| Витрина и админка | `apps/web` (React 18 + Vite 5 + TS + Tailwind + shadcn/ui, TanStack Query, react-router 6) |
| Маршруты | `apps/web/src/App.tsx`: все страницы ленивые (`lazyWithReload`), админка — отдельные чанки под `/admin/*` |
| Публичные страницы | `src/redesign/pages/*` (главная, каталог, ЖК, квартира, объект, карта), `src/pages/*` (о компании, контакты, новости, избранное, юр. страницы) |
| Тема | `src/index.css` (CSS-переменные shadcn), `tailwind.config.ts` |
| API-клиент | `src/lib/api.ts` (`/api/v1`, JWT в localStorage); в dev Vite проксирует `/api`, `/uploads` |
| Источник данных в dev | `.env.local` → `VITE_API_PROXY_TARGET=https://yugaktsent.neeklo.ru` — **боевой API** |
| SEO | клиентские `SeoRouteMeta`, `useEntitySeoMeta`, `SeoJsonLd`; пререндер `scripts/prerender-seo.mjs` (главная, каталог, ЖК) |

## Зависимость от production API и защита

До изменений любой `POST/PATCH/DELETE` из локального фронта (форма заявки, вход и сохранение в админке) уходил в боевую БД.

Сделано: `apps/web/staging-guard.ts` — middleware dev/preview-сервера Vite. Включается сам, если цель прокси не localhost; отключается `STAGING_ALLOW_WRITES=1`.

| Запрос | Что происходит |
|---|---|
| GET/HEAD/OPTIONS | уходит в прокси, но без `Authorization` и `cookie` |
| `POST /requests` (заявка) | демо-ответ `201 {demo:true}`, в CRM и Telegram ничего не уходит |
| `POST /auth/login`, `/auth/refresh` | демо-токен; пароль на прод не отправляется |
| `GET /auth/me` с демо-токеном | демо-админ (`role: admin`) |
| прочие записи | `403 StagingReadOnly` с понятным текстом |

В интерфейсе — метка «Демо» (`StagingBadge`). Проверено curl через dev-сервер и юнит-тестами `src/test/staging-guard.test.ts`.

## Исходные показатели проверок

| Проверка | Baseline |
|---|---|
| `pnpm typecheck` | 441 ошибка в 53 файлах (в основном админка CRM, `unknown` из API) |
| `pnpm lint` | 112 проблем: 68 ошибок, 44 предупреждения |
| `vitest` | 147/150; падают 3 теста шахматки (`chessboard-board`, `chessboard-matrix`) |
| `vite build` | проходит; главный чанк 391 КБ (как на проде) |

Правило: новых ошибок не добавлять — сравниваем с этими числами.

## Baseline-скриншоты

`docs/redesign-v3/baseline/` — 390 и 1440 для Home, Catalog, Complex (`eden-family-hotel`), Property (`/apartment/13113`). Снимались скриптом `apps/e2e/scripts/capture-screens.mjs`. Горизонтального переполнения на этих экранах не было.

Главная на 390 px — 9014 px высоты.

## Исходные проблемы UI (по скриншотам и коду)

1. **Hero** на всю высоту экрана: на телефоне заголовок внизу, две равные полноширинные CTA. Пока ЖК грузятся, мелькает запасной слайд без фото.
2. **Фильтр главной** — 8 полей столбиком.
   - Показываются пустые типы (комнаты, дома, участки, дачи, коммерция — в данных 0).
   - Подсказка «ЖК, район, улица».
3. **Популярные ЖК, «Горячие», «Старт продаж»** — три похожих блока:
   - карточки на 4–5 строк цен;
   - заглушки «Фото отсутствует»;
   - обрезанная соседняя карточка.
4. **«О компании»** — стена текста и неподтверждённые цифры (2017, 2300+, 18, 24, «ипотека от 4,9%»).
5. **Нижняя панель** — 5 вкладок, «Избранное» у гостя на карточке ЖК ведёт на `/login`.
6. **Цвета.** В публичных компонентах синие, фиолетовые и янтарные классы (Favorites, TrustBadgeRow, PromotionBadge, статусы «Бронь»), метка карты `#1d4ed8`.
7. **Типографика** — Rubik, капс с разрядкой в надзаголовках, цены «7.5 млн».
8. **Глобальный спиннер** `Suspense` на весь экран при переходах (`App.tsx`).
9. **Каталог и объект.**
   - На телефоне у каталога и квартиры нет `<h1>`.
   - «95.5 м²» с точкой.
   - «Метро» в фильтре и на странице ЖК, «Адрес —», «Описание появится позже».
10. **Медиа.** Хост `pb16100.tochno.profitbase.ru` отдаёт поддельный сертификат (`Kubernetes Ingress Controller Fake Certificate`). Фото ЖК «Хозяин Морей» не грузятся ни у кого — это задача для backend.
11. **Медленный API.** Через прокси ответы API идут ~2,5 с. Первый экран ждёт цепочку `settings` + `regions` → `blocks`.

## Файлы для следующих фаз

| Фаза | Файлы |
|---|---|
| PROMPT 4 · каталог / ЖК / объект | `redesign/pages/RedesignCatalog.tsx`, `RedesignComplex.tsx`, `RedesignApartment.tsx`, `RedesignListingDetail.tsx`; `redesign/components/ComplexCard.tsx`, `ListingCard.tsx`, `FilterSidebar.tsx`, `ComplexStickySidebar.tsx`, `ComplexAnchorNav.tsx`, `ConversionCTABar.tsx`, `ListingLocationMap.tsx`; `redesign/lib/card-visual.ts`, `listing-page-from-api.ts` (`hasCoords`), `catalog-url-sync.ts` |
| PROMPT 5 · админка | `admin/layout/AdminLayout.tsx`, `admin/lib/admin-demo-nav.ts`, `admin/pages/AdminFeedLinks.tsx`, `AdminTokens.tsx` (→ Theme Builder на `shared/theme`), `AdminMedia.tsx`, новые `admin/pages/AdminDataSources*.tsx` |
| PROMPT 6 · скорость | `App.tsx` (глобальный Suspense), `redesign/hooks/useHomeBlocks.ts`, `useDefaultRegionId.ts`, `StableMediaFrame.tsx`, `vite.config.ts` (manualChunks), `scripts/prerender-seo.mjs` |
