# Re-Apple Emerald 2.0 — дизайн-система ЮГАКЦЕНТ

Источник требований: `YUGAKCENT_FRONTEND_REDESIGN_V3.md`, раздел 3. Реализация: `apps/web/src/index.css`, `apps/web/tailwind.config.ts`, `apps/web/src/components/ui/*`, `apps/web/src/shared/theme/*`.

## Правило одно

Цвет, радиус и тень компонент берёт **только из токенов**. HEX в компонентах запрещён. Исключение — разметка Яндекс.Карт и canvas, для них `BRAND_PRIMARY_HEX` в `redesign/lib/button-styles.ts`.

## Цвета

| Токен (CSS) | Tailwind | HEX | Назначение |
|---|---|---|---|
| `--background` | `bg-background` | `#F8FAF9` | фон страницы |
| `--card` | `bg-card` | `#FFFFFF` | карточки, поля |
| `--surface-soft` | `bg-surface-soft` | `#EDF3F1` | лёгкая подложка, hover вторичной кнопки |
| `--primary` | `bg-primary`, `text-primary` | `#165447` | главное действие экрана |
| `--primary-hover` | `bg-primary-hover` | `#103E36` | hover основного |
| `--foreground` | `text-foreground` | `#20282D` | основной текст |
| `--muted-foreground` | `text-muted-foreground` | `#64716E` | второстепенный текст (контраст 4.8:1 на фоне) |
| `--border` | `border-border` | `#DEE6E3` | разделители, рамки |
| `--focus` | `ring-focus`, `border-focus` | `#3D907D` | контур фокуса с клавиатуры |
| `--success` | `text-success` | `#20795F` | успех, «Свободно» |
| `--destructive` | `text-destructive` | `#B34343` | ошибка |
| `--warning`, `--warning-soft` | `text-warning`, `bg-warning-soft` | охра | статус «Бронь», предупреждения (не жёлтый) |
| `--graphite` | `bg-graphite` | `#1A2125` | тёмные лид-блоки, скрим поверх фото |

Синий, фиолетовый и жёлтый удалены из публичных компонентов (Favorites, TrustBadgeRow, PromotionBadge, LeadForm, статусы «Бронь», метка карты).

## Типографика

Шрифт: **Inter Variable** (`@fontsource-variable/inter`, свой хостинг, кириллица). Rubik удалён.

| Класс | Mobile → Desktop | Где |
|---|---|---|
| `.text-display` | 32 → 44 → 60 px, lh 1.12 → 1.06 | H1 первого экрана |
| `.text-section-title` | 26 → 32 → 40 px | H2 секций |
| `.text-title` | 20 → 22 px | H3 карточек и подблоков |
| `.text-lead` | 16 → 18 px, muted | абзац под заголовком |
| `.text-body` | 15 px, lh 1.55 | основной текст |
| `.text-overline` | 13 px, primary, **без капса и разрядки** | надзаголовок |
| `.text-price` | tabular numerals, 650 | цены и числа |

## Сетка и ритм

- Контейнер `.container-page`: поля 16 → 20 → 32 px, контент до 1320 px.
- Секции `.section-y`: 32 → 48 → 72 px по вертикали.
- Шкала отступов — стандартная Tailwind (4/8/12/16/24/32/48/64/96).
- Нижняя мобильная панель: `--mobile-nav-h: 64px`. Утилиты `.pb-mobile-nav` и `.bottom-mobile-nav` учитывают `env(safe-area-inset-bottom)`.

## Радиусы и тени

| Токен | Значение | Tailwind |
|---|---|---|
| `--radius` | 12 px | `rounded-lg` — кнопки, поля |
| `--radius-card` | 20 px | `rounded-card` — карточки |
| `--radius-sheet` | 24 px | `rounded-sheet` — шторки, крупные панели |
| `--shadow-card` | почти плоская | `shadow-card` |
| `--shadow-raised` | всплывающее | `shadow-raised` |
| `--shadow-overlay` | модалки, шторки | `shadow-overlay` |

## Кнопки (`components/ui/button.tsx`, `btnClass()`)

| Вариант | Вид | Когда |
|---|---|---|
| `primary` | заливка primary, hover primary-hover | одно главное действие на экране |
| `secondary` | белая с рамкой border | альтернативное действие |
| `inverse` | белая заливка | главное действие поверх фото |
| `inverseOutline` | полупрозрачная с белой рамкой | второе действие поверх фото |
| `ghost`, `link` | текст primary | третичные действия |

Высота 48 px на мобильном и 44 px с `sm`, радиус 12 px. Фокус — кольцо `--focus`, нажатие сдвигает кнопку на 1 px.

## Поля

`Input`, `Textarea`, `Select`:
- фон `bg-card`, рамка `--input`, радиус 12 px;
- на фокусе рамка `--focus` и мягкое кольцо 3 px;
- шрифт 16 px на мобильном, чтобы iOS не зумил страницу при фокусе.

## Theme Engine (`shared/theme`)

- `theme-engine.ts` — список редактируемых токенов, пресеты «Изумруд», «Морской», «Графит», перевод HEX → HSL, применение к `<html>`.
- `ThemeBootstrap` (подключён в `App.tsx`) применяет тему в порядке приоритета:
  1. черновик `localStorage.yug_theme_draft` — предпросмотр в Theme Builder, событие `yug:theme-draft`;
  2. опубликованная настройка сайта `theme_tokens` (JSON с HEX);
  3. значения по умолчанию из `index.css`.
- Связанные токены синхронизируются автоматически: primary → accent-foreground, focus → ring, card → popover.
- Тесты: `shared/theme/theme-engine.test.ts`.

## Доступность

- Глобальный `:focus-visible` — контур 2 px `--focus`.
- `prefers-reduced-motion` отключает анимации и плавную прокрутку.
- Основные действия не меньше 44×44 CSS px.
