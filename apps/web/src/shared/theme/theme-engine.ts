/**
 * Theme Engine: подмена семантических токенов дизайн-системы на лету.
 *
 * Все цвета витрины и админки читаются из CSS-переменных (index.css), поэтому
 * тема — это набор переопределений `--token: H S% L%` на <html>. Источники по
 * приоритету: черновик предпросмотра в админке (localStorage) → настройка сайта
 * `theme_tokens` (JSON с HEX) → значения по умолчанию из index.css.
 */

export type ThemeTokenKey =
  | 'primary'
  | 'primary-hover'
  | 'background'
  | 'card'
  | 'surface-soft'
  | 'foreground'
  | 'muted-foreground'
  | 'border'
  | 'focus';

export type ThemeOverrides = Partial<Record<ThemeTokenKey, string>>;

export interface ThemeTokenMeta {
  key: ThemeTokenKey;
  label: string;
  /** Значение по умолчанию (Re-Apple Emerald 2.0) */
  hex: string;
}

export const THEME_TOKENS: ThemeTokenMeta[] = [
  { key: 'primary', label: 'Основной (кнопки, ссылки)', hex: '#165447' },
  { key: 'primary-hover', label: 'Основной при наведении', hex: '#103E36' },
  { key: 'background', label: 'Фон страницы', hex: '#F8FAF9' },
  { key: 'card', label: 'Карточки и поля', hex: '#FFFFFF' },
  { key: 'surface-soft', label: 'Лёгкая подложка', hex: '#EDF3F1' },
  { key: 'foreground', label: 'Основной текст', hex: '#20282D' },
  { key: 'muted-foreground', label: 'Второстепенный текст', hex: '#64716E' },
  { key: 'border', label: 'Разделители', hex: '#DEE6E3' },
  { key: 'focus', label: 'Контур фокуса', hex: '#3D907D' },
];

export interface ThemePreset {
  id: string;
  name: string;
  overrides: ThemeOverrides;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'emerald', name: 'Изумруд (по умолчанию)', overrides: {} },
  {
    id: 'sea',
    name: 'Морской',
    overrides: { primary: '#14505E', 'primary-hover': '#0E3B46', 'surface-soft': '#EBF2F4', focus: '#3A8799' },
  },
  {
    id: 'graphite',
    name: 'Графит',
    overrides: { primary: '#26302F', 'primary-hover': '#151B1A', 'surface-soft': '#EFF1F0', focus: '#4F6B66' },
  },
];

/** Ключ setting в CMS, где хранится опубликованная тема */
export const THEME_SETTING_KEY = 'theme_tokens';
/** Черновик предпросмотра из админки — только в браузере редактора */
export const THEME_DRAFT_STORAGE_KEY = 'yug_theme_draft';

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/** `#165447` → `167 58% 21%` (формат переменных shadcn/Tailwind) */
export function hexToHslTriplet(hex: string): string | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Разбор настройки темы: невалидные ключи и цвета отбрасываются молча */
export function parseThemeOverrides(raw: string | null | undefined): ThemeOverrides {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const allowed = new Set(THEME_TOKENS.map((t) => t.key));
    const out: ThemeOverrides = {};
    for (const [k, v] of Object.entries(obj)) {
      if (allowed.has(k as ThemeTokenKey) && typeof v === 'string' && HEX_RE.test(v.trim())) {
        out[k as ThemeTokenKey] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

const applied = new Set<string>();

/** Ставит переопределения на <html>; ранее применённые, но отсутствующие ключи снимает */
export function applyThemeOverrides(overrides: ThemeOverrides, root: HTMLElement = document.documentElement): void {
  const next = new Set<string>();
  for (const [key, hex] of Object.entries(overrides)) {
    const hsl = hex ? hexToHslTriplet(hex) : null;
    if (!hsl) continue;
    root.style.setProperty(`--${key}`, hsl);
    next.add(key);
    // Связанные токены, чтобы акцент не расходился с кольцом фокуса и подложками
    if (key === 'primary') root.style.setProperty('--accent-foreground', hsl);
    if (key === 'focus') root.style.setProperty('--ring', hsl);
    if (key === 'card') root.style.setProperty('--popover', hsl);
    if (key === 'foreground') root.style.setProperty('--card-foreground', hsl);
  }
  for (const key of applied) {
    if (!next.has(key)) root.style.removeProperty(`--${key}`);
  }
  if (!next.has('primary')) root.style.removeProperty('--accent-foreground');
  if (!next.has('focus')) root.style.removeProperty('--ring');
  if (!next.has('card')) root.style.removeProperty('--popover');
  if (!next.has('foreground')) root.style.removeProperty('--card-foreground');
  applied.clear();
  next.forEach((k) => applied.add(k));
}

export function readThemeDraft(): ThemeOverrides | null {
  try {
    const raw = localStorage.getItem(THEME_DRAFT_STORAGE_KEY);
    return raw ? parseThemeOverrides(raw) : null;
  } catch {
    return null;
  }
}
