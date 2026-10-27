/**
 * Источники данных (фиды) — модель интерфейса до подключения backend (ТЗ v3, 6.2).
 *
 * Правила безопасности, которые соблюдает уже UI:
 * - браузер к фидам не обращается: проверка и загрузка — только на сервере;
 * - полный URL фида (в нём часто токен) не хранится ни в коде, ни в localStorage,
 *   в демо-слое остаётся только хост с маской;
 * - синхронизация не имитируется: статус честно «Ожидает подключения».
 */

export type FeedFormat = 'profitbase_xml' | 'cian_xml' | 'jcat' | 'auto';

export const FEED_FORMAT_LABEL: Record<FeedFormat, string> = {
  profitbase_xml: 'Profitbase XML',
  cian_xml: 'Cian XML',
  jcat: 'JCAT',
  auto: 'Определить автоматически',
};

export type FeedSchedule = 'hourly' | 'every6h' | 'daily';
export const FEED_SCHEDULE_LABEL: Record<FeedSchedule, string> = {
  hourly: 'Каждый час',
  every6h: 'Каждые 6 часов',
  daily: 'Раз в сутки',
};

export type FeedStatus = 'pending_backend' | 'active' | 'error';

export type FeedWarning = { code: 'no_photos' | 'duplicate_url' | 'bad_xml' | 'no_price' | 'no_block' | 'unknown_format'; text: string };

export type DataSource = {
  id: string;
  name: string;
  format: FeedFormat;
  city: string;
  complexName?: string;
  /** Только хост и маска — полный адрес хранится на сервере */
  urlMasked: string;
  /** Одинаковые ключи = один и тот же URL у разных записей (без самого URL) */
  urlGroup?: string;
  schedule: FeedSchedule;
  status: FeedStatus;
  lastSyncAt?: string | null;
  objects?: number | null;
  photos?: number | null;
  errors?: number | null;
  warnings: FeedWarning[];
  /** Откуда запись: от заказчика (ТЗ) или добавлена в демо-интерфейсе */
  origin: 'client' | 'demo';
  createdAt: string;
};

/**
 * Что прислал заказчик (ТЗ v3, 6.2): пять названий, четыре уникальных URL.
 * Сами адреса с токенами в код не попадают — их заводят на сервере.
 */
export const CLIENT_SOURCES: DataSource[] = [
  {
    id: 'graf-tolstoy',
    name: 'Граф Толстой',
    format: 'profitbase_xml',
    city: 'Анапа',
    complexName: 'Граф Толстой',
    urlMasked: 'profitbase.ru/•••',
    schedule: 'every6h',
    status: 'pending_backend',
    warnings: [
      { code: 'no_photos', text: 'Заказчик сообщает, что фото не подтягиваются. В каталоге сейчас 0 фото — проверить теги изображений в XML и их скачивание.' },
    ],
    origin: 'client',
    createdAt: '2026-10-26',
  },
  {
    id: 'cian-18-3',
    name: '18/3',
    format: 'cian_xml',
    city: 'Анапа',
    complexName: '18/3',
    urlMasked: 'cian.ru/•••',
    urlGroup: 'cian-shared',
    schedule: 'every6h',
    status: 'pending_backend',
    warnings: [{ code: 'duplicate_url', text: 'Тот же URL указан для «Центральный». Это один источник, а не два — уточнить у заказчика.' }],
    origin: 'client',
    createdAt: '2026-10-26',
  },
  {
    id: 'cian-central',
    name: 'Центральный',
    format: 'cian_xml',
    city: 'Анапа',
    complexName: 'Центральный',
    urlMasked: 'cian.ru/•••',
    urlGroup: 'cian-shared',
    schedule: 'every6h',
    status: 'pending_backend',
    warnings: [{ code: 'duplicate_url', text: 'Тот же URL указан для «18/3». Это один источник, а не два — уточнить у заказчика.' }],
    origin: 'client',
    createdAt: '2026-10-26',
  },
  {
    id: 'jcat-dolina',
    name: 'Долина',
    format: 'jcat',
    city: 'Анапа',
    complexName: 'Долина',
    urlMasked: 'jcat/•••',
    schedule: 'every6h',
    status: 'pending_backend',
    warnings: [{ code: 'unknown_format', text: 'Формат JCAT нужно согласовать: схема полей у поставщика не описана.' }],
    origin: 'client',
    createdAt: '2026-10-26',
  },
  {
    id: 'jcat-gornye-vysoty',
    name: 'Горные высоты',
    format: 'jcat',
    city: 'Анапа',
    complexName: 'Горные высоты',
    urlMasked: 'jcat/•••',
    schedule: 'every6h',
    status: 'pending_backend',
    warnings: [{ code: 'unknown_format', text: 'Формат JCAT нужно согласовать: схема полей у поставщика не описана.' }],
    origin: 'client',
    createdAt: '2026-10-26',
  },
];

/** Ожидаемое сопоставление полей: что сервер возьмёт из фида (показывается до подключения) */
export const FIELD_MAPPING: { field: string; profitbase: string; cian: string; jcat: string }[] = [
  { field: 'Внешний ID', profitbase: 'offer @internal-id', cian: 'ExternalId', jcat: 'уточнить' },
  { field: 'ЖК', profitbase: 'building-name', cian: 'JKSchema / Name', jcat: 'уточнить' },
  { field: 'Квартира, комнаты', profitbase: 'rooms, studio', cian: 'FlatRoomsCount', jcat: 'уточнить' },
  { field: 'Цена', profitbase: 'price / value', cian: 'BargainTerms / Price', jcat: 'уточнить' },
  { field: 'Площадь', profitbase: 'area / value', cian: 'TotalArea', jcat: 'уточнить' },
  { field: 'Фото', profitbase: 'image', cian: 'Photos / PhotoSchema / FullUrl', jcat: 'уточнить' },
  { field: 'Срок сдачи', profitbase: 'built-year, ready-quarter', cian: 'JKSchema / House / Deadline', jcat: 'уточнить' },
  { field: 'Координаты', profitbase: 'location / latitude, longitude', cian: 'Coordinates / Lat, Lng', jcat: 'уточнить' },
];

/* ─── Валидация и маска URL ─── */

const ALLOWED_PROTOCOL = 'https:';

/** Проверка формы адреса до отправки на сервер. Сам фид браузер не запрашивает. */
export function validateFeedUrl(raw: string): { ok: true; masked: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'Это не похоже на адрес. Нужен вид https://…' };
  }
  if (u.protocol !== ALLOWED_PROTOCOL) return { ok: false, error: 'Только https://' };
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i.test(u.hostname) || u.hostname.endsWith('.local')) {
    return { ok: false, error: 'Внутренние адреса не принимаются' };
  }
  return { ok: true, masked: `${u.hostname}/•••` };
}

/* ─── Демо-хранилище: только в браузере редактора ─── */

const STORAGE_KEY = 'yug_demo_data_sources';

export function readDemoSources(): DataSource[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DataSource[]) : [];
  } catch {
    return [];
  }
}

export function writeDemoSources(list: DataSource[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
