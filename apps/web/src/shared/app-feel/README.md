# App-feel: сайт на телефоне как приложение

Что входит (без новых зависимостей):

| Что | Где | Поведение |
|---|---|---|
| Отклик на касание | `src/index.css` (`@media (hover:none) and (pointer:coarse)`) | кнопки, чипы, вкладки — `scale(.97)`, карточки `.rounded-card` — `scale(.985)`; класс `.press` для своих элементов |
| Нет «залипшего» hover | `tailwind.config.ts` → `future.hoverOnlyWhenSupported` | `hover:` только на устройствах с мышью |
| Без задержки 300 мс и серой вспышки | `html { touch-action: manipulation; -webkit-tap-highlight-color: transparent }` | |
| Плавный вход страницы | `PageEnter` (AppFeel.tsx) + `.page-enter main` | 200 мс, только прозрачность у `main` (transform сломал бы fixed-панели); «Назад» и первая загрузка — без анимации |
| Полоса перехода | `NavProgress` | 2 px сверху, только если переход дольше 150 мс |
| Предзагрузка по касанию | `useIntentPrefetch` | на `pointerdown`/`focus`: код страницы (`route-prefetch.ts`) и главный запрос ЖК / квартиры в кэш react-query |
| «Назад» на то же место | `components/ScrollToTop.tsx` | позиция по ключу записи истории в sessionStorage; докрутка, пока данные догружаются (до 2 с); смена `?фильтров` не кидает наверх |
| Фото | `StableMediaFrame` | из кэша — сразу (проверка `img.complete`), пока грузится — перелив `.shimmer` |
| Установка на экран | `public/site.webmanifest` (`standalone`), `index.html` (theme-color, viewport-fit=cover, apple-mobile-web-app-*) | |
| Градиенты | `.bg-brand-gradient`, `.bg-brand-soft`, `.bg-primary-gradient`, `.bg-footer-gradient`, `.text-brand-gradient` | цвета из токенов бренда |

Сервис-воркера (офлайн, кэш) пока нет — отдельное решение: нужен выключатель и правила «не кэшировать API и админку».

Проверка (встроенный браузер, 375 px): маркер `window.__navMarker` переживает переходы (без перезагрузок);
каталог → ЖК за ~80 мс; «Назад» возвращает прокрутку 1500 → 1500 px.
