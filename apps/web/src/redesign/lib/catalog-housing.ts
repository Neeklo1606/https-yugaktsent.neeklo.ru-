/**
 * Тип жилья ЖК (housingType в API): квартиры в ЖК, апартаменты (гостиничные
 * комплексы), коттеджи и посёлки. В адресе каталога — отдельный параметр
 * `housing`; он не пересекается с `type` (вид объявления) и `group` (ЖК/квартиры).
 * Нет параметра — показываем все типы.
 */
export type HousingType = 'flat' | 'aparthotel' | 'cottage';

export const HOUSING_URL_KEY = 'housing';

export const HOUSING_TYPES: readonly HousingType[] = ['flat', 'aparthotel', 'cottage'];

export const HOUSING_OPTIONS: ReadonlyArray<{ value: HousingType; label: string; hint: string }> = [
  { value: 'flat', label: 'Квартиры', hint: 'Квартиры в жилых комплексах' },
  { value: 'aparthotel', label: 'Апартаменты', hint: 'Гостиничные и апарт-комплексы' },
  { value: 'cottage', label: 'Коттеджи', hint: 'Коттеджные посёлки' },
];

/** Заголовок каталога и слова для «Найдено N …» по типу жилья */
export const HOUSING_COPY: Record<HousingType, { title: string; forms: [string, string, string] }> = {
  flat: { title: 'Жилые комплексы', forms: ['жилой комплекс', 'жилых комплекса', 'жилых комплексов'] },
  aparthotel: { title: 'Апартаменты', forms: ['апарт-комплекс', 'апарт-комплекса', 'апарт-комплексов'] },
  cottage: { title: 'Коттеджные посёлки', forms: ['коттеджный посёлок', 'коттеджных посёлка', 'коттеджных посёлков'] },
};

export function parseHousingParam(raw: string | null | undefined): HousingType | null {
  const v = (raw ?? '').trim().toLowerCase();
  return (HOUSING_TYPES as readonly string[]).includes(v) ? (v as HousingType) : null;
}

export function housingFromSearchParams(sp: URLSearchParams): HousingType | null {
  return parseHousingParam(sp.get(HOUSING_URL_KEY));
}

/** Возвращает копию параметров с выставленным (или убранным при null) `housing`. */
export function withHousingParam(base: URLSearchParams, housing: HousingType | null): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  if (housing) p.set(HOUSING_URL_KEY, housing);
  else p.delete(HOUSING_URL_KEY);
  return p;
}

/** Тип жилья у строки API: со старого API поля может не быть — читаем осторожно. */
export function housingTypeOfRow(row: unknown): HousingType | null {
  if (!row || typeof row !== 'object') return null;
  return parseHousingParam((row as { housingType?: string | null }).housingType ?? null);
}
