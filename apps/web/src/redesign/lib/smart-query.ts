/**
 * Разбор поисковой фразы в фильтры, как у LiveGrid/ЦИАН: «2к до 8 млн», «студия от 25 м²»,
 * «трёшка у моря». Найденные части становятся фильтрами, остальное остаётся текстом поиска.
 */
export type SmartQuery = {
  rooms?: number[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  /** Текст без распознанных частей — уходит в обычный поиск */
  rest: string;
};

// В JS \b не видит кириллицу — границы слова задаём через \p{L} (флаг u)
const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}])';
const WORD_ROOMS: [RegExp, number][] = [
  // Евроформаты: в каталоге «2 комнаты» включает и классические двушки, и евродвушки (2Е)
  [new RegExp(`${L}евро-?двушк[\\p{L}]*`, 'giu'), 2],
  [new RegExp(`${L}евро-?тр[её]шк[\\p{L}]*`, 'giu'), 3],
  [new RegExp(`${L}студи[\\p{L}]*`, 'giu'), 0],
  [new RegExp(`${L}(?:однокомнатн[\\p{L}]*|однушк[\\p{L}]*)`, 'giu'), 1],
  [new RegExp(`${L}(?:двухкомнатн[\\p{L}]*|двушк[\\p{L}]*)`, 'giu'), 2],
  [new RegExp(`${L}(?:тр[её]хкомнатн[\\p{L}]*|тр[её]шк[\\p{L}]*)`, 'giu'), 3],
  [new RegExp(`${L}четыр[её]хкомнатн[\\p{L}]*`, 'giu'), 4],
];

const num = (raw: string) => Number(raw.replace(/\s+/g, '').replace(',', '.'));

/** «8 млн» → 8 000 000, «7,5 млн» → 7 500 000, «900 тыс» → 900 000, «6500000» → 6 500 000 */
function money(value: string, unit?: string): number | undefined {
  const n = num(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const u = (unit ?? '').toLowerCase();
  if (u.startsWith('млн') || u === 'м' || u === 'kk') return Math.round(n * 1_000_000);
  if (u.startsWith('тыс') || u === 'к') return Math.round(n * 1_000);
  // Голое число: маленькое — миллионы («до 8»), большое — рубли
  return n < 1000 ? Math.round(n * 1_000_000) : Math.round(n);
}

export function parseSmartQuery(input: string): SmartQuery {
  let text = ` ${input.toLowerCase().replace(/ё/g, 'е')} `;
  const out: SmartQuery = { rest: '' };
  const rooms = new Set<number>();
  const cut = (re: RegExp) => {
    text = text.replace(re, ' ');
  };

  // Площадь раньше цены: «от 40 м2» не должно стать «от 40 млн»
  const areaRange = /(?:от\s*)?(\d+(?:[.,]\d+)?)\s*(?:-|–|до)\s*(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м|метр\w*)/i.exec(text);
  if (areaRange) {
    out.areaMin = num(areaRange[1]);
    out.areaMax = num(areaRange[2]);
    cut(areaRange[0] ? new RegExp(escapeRe(areaRange[0])) : /$^/);
  }
  const areaFrom = /от\s*(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м|метр\w*)/i.exec(text);
  if (areaFrom) {
    out.areaMin = num(areaFrom[1]);
    cut(new RegExp(escapeRe(areaFrom[0])));
  }
  const areaTo = /до\s*(\d+(?:[.,]\d+)?)\s*(?:м2|м²|кв\.?\s*м|метр\w*)/i.exec(text);
  if (areaTo) {
    out.areaMax = num(areaTo[1]);
    cut(new RegExp(escapeRe(areaTo[0])));
  }

  const priceTo = /до\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(млн\.?|миллион\w*|тыс\.?|тысяч\w*|kk|₽|руб\w*)?(?=\s|$)/i.exec(text);
  if (priceTo) {
    const unit = /^миллион/i.test(priceTo[2] ?? '') ? 'млн' : /^тысяч/i.test(priceTo[2] ?? '') ? 'тыс' : priceTo[2];
    out.priceMax = money(priceTo[1], unit);
    cut(new RegExp(escapeRe(priceTo[0])));
  }
  const priceFrom = /от\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(млн\.?|миллион\w*|тыс\.?|тысяч\w*|kk|₽|руб\w*)(?=\s|$)/i.exec(text);
  if (priceFrom) {
    const unit = /^миллион/i.test(priceFrom[2] ?? '') ? 'млн' : /^тысяч/i.test(priceFrom[2] ?? '') ? 'тыс' : priceFrom[2];
    out.priceMin = money(priceFrom[1], unit);
    cut(new RegExp(escapeRe(priceFrom[0])));
  }

  // «2к», «2-к», «2 комн», «2-комнатная», «1к и 2к»
  const roomRe = new RegExp(`${L}([1-5])\\s*-?\\s*(?:к\\.?${R}|кк${R}|комн[\\p{L}]*\\.?)`, 'giu');
  for (const m of text.matchAll(roomRe)) rooms.add(Math.min(4, Number(m[1])));
  cut(roomRe);
  for (const [re, n] of WORD_ROOMS) {
    re.lastIndex = 0;
    if (re.test(text)) {
      rooms.add(n);
      re.lastIndex = 0;
      cut(re);
    }
  }

  if (rooms.size) out.rooms = [...rooms].sort((a, b) => a - b);
  out.rest = text
    .replace(new RegExp(`${L}(?:квартир[\\p{L}]*|купить|новостройк[\\p{L}]*|и|в|с)${R}`, 'giu'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out;
}

export function hasSmartFilters(q: SmartQuery): boolean {
  return Boolean(q.rooms?.length || q.priceMin || q.priceMax || q.areaMin || q.areaMax);
}

const ROOM_WORD = ['студии', '1-комнатные', '2-комнатные', '3-комнатные', '4+ комнат'];

const millions = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн ₽` : `${v.toLocaleString('ru-RU')} ₽`;

/** «2-комнатные · до 8 млн ₽ · от 40 м²» — подпись для строки «Показать …» */
export function smartQueryLabel(q: SmartQuery): string {
  const parts: string[] = [];
  if (q.rooms?.length) parts.push(q.rooms.map((r) => ROOM_WORD[r] ?? `${r}-комнатные`).join(', '));
  if (q.priceMin && q.priceMax) parts.push(`${millions(q.priceMin)} – ${millions(q.priceMax)}`);
  else if (q.priceMax) parts.push(`до ${millions(q.priceMax)}`);
  else if (q.priceMin) parts.push(`от ${millions(q.priceMin)}`);
  if (q.areaMin && q.areaMax) parts.push(`${q.areaMin}–${q.areaMax} м²`);
  else if (q.areaMin) parts.push(`от ${q.areaMin} м²`);
  else if (q.areaMax) parts.push(`до ${q.areaMax} м²`);
  if (q.rest) parts.push(`«${q.rest}»`);
  return parts.join(' · ');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Применяет распознанную фразу к фильтрам каталога: комнаты добавляются к выбранным,
 * цена и площадь из фразы заменяют заданные, в поиске остаётся только нераспознанный текст.
 */
export function applySmartQuery<F extends { search: string; rooms: number[]; priceMin?: number; priceMax?: number; areaMin?: number; areaMax?: number }>(
  filters: F,
): F {
  const q = parseSmartQuery(filters.search ?? '');
  if (!hasSmartFilters(q)) return filters;
  return {
    ...filters,
    search: q.rest,
    rooms: q.rooms?.length ? [...new Set([...filters.rooms, ...q.rooms])].sort((a, b) => a - b) : filters.rooms,
    priceMin: q.priceMin ?? filters.priceMin,
    priceMax: q.priceMax ?? filters.priceMax,
    areaMin: q.areaMin ?? filters.areaMin,
    areaMax: q.areaMax ?? filters.areaMax,
  };
}
