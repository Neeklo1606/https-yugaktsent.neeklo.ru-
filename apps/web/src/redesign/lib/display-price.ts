/**
 * Единая точка форматирования цены для всей витрины.
 * Iteration 3 — price fallback normalization.
 */

export const MIN_REASONABLE_PRICE_RUB = 100_000;

export const PRICE_ON_REQUEST = 'Цена по запросу';

export const MORTGAGE_UNAVAILABLE = 'Ипотека недоступна';

export type PricePrefix = 'от' | 'до';

export type FormatDisplayPriceOptions = {
  prefix?: PricePrefix;
  /** Include trailing « ₽». Default true. */
  withCurrency?: boolean;
};

/** Parse API / model value into valid rubles or null. */
export function normalizePriceValue(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < MIN_REASONABLE_PRICE_RUB) return null;
  return n;
}

/** True when UI should show «Цена по запросу». */
export function isPriceHidden(value: string | number | null | undefined): boolean {
  return normalizePriceValue(value) === null;
}

function formatAmountRub(rub: number, withCurrency: boolean): string {
  let amount: string;
  // Русская десятичная запятая и неразрывные пробелы: «7,5 млн ₽» не рвётся по строкам
  if (rub >= 1_000_000) {
    amount = `${(rub / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}\u00a0млн`;
  } else {
    amount = `${Math.round(rub / 1000)}\u00a0тыс`;
  }
  return withCurrency ? `${amount}\u00a0₽` : amount;
}

/**
 * Core formatter. Invalid → PRICE_ON_REQUEST.
 * Valid → «6,8 млн ₽» / «350 тыс ₽» (optional prefix «от» / «до»).
 */
export function formatDisplayPrice(
  value: string | number | null | undefined,
  options?: FormatDisplayPriceOptions,
): string {
  const rub = normalizePriceValue(value);
  if (rub === null) return PRICE_ON_REQUEST;

  const withCurrency = options?.withCurrency !== false;
  const amount = formatAmountRub(rub, withCurrency);

  if (options?.prefix === 'от') return `от ${amount}`;
  if (options?.prefix === 'до') return `до ${amount}`;
  return amount;
}

/** Card / popup default: «от 6.8 млн ₽» or PRICE_ON_REQUEST. */
export function formatPriceFrom(
  value: string | number | null | undefined,
  withCurrency = true,
): string {
  return formatDisplayPrice(value, { prefix: 'от', withCurrency });
}

/** ЖК marketplace cards — full ruble amount without «млн» rounding (TrendAgent-style). */
export function formatPriceFromExact(
  value: string | number | null | undefined,
  withCurrency = true,
): string {
  const rub = normalizePriceValue(value);
  if (rub === null) return PRICE_ON_REQUEST;
  const amount = Math.round(rub).toLocaleString('ru-RU');
  const suffix = withCurrency ? ' ₽' : '';
  return `от ${amount}${suffix}`;
}

/** Map marker badge: «от 6.8 млн» without ₽. */
export function formatMarkerPriceFrom(value: string | number | null | undefined): string {
  return formatDisplayPrice(value, { prefix: 'от', withCurrency: false });
}

/** Min–max range for tables and complex headers. */
export function formatPriceRangeDisplay(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const minRub = normalizePriceValue(min);
  const maxRub = normalizePriceValue(max);

  if (minRub === null && maxRub === null) return PRICE_ON_REQUEST;
  if (minRub !== null && maxRub !== null && Math.abs(minRub - maxRub) < 1) {
    return formatDisplayPrice(minRub);
  }
  if (minRub !== null && maxRub !== null) {
    return `${formatDisplayPrice(minRub, { prefix: 'от' })} ${formatDisplayPrice(maxRub, { prefix: 'до' })}`;
  }
  if (minRub !== null) return formatDisplayPrice(minRub, { prefix: 'от' });
  if (maxRub !== null) return formatDisplayPrice(maxRub, { prefix: 'до' });
  return PRICE_ON_REQUEST;
}

/** Mortgage / installment label with unavailable fallback. */
export function formatMortgageLabel(value: string | null | undefined): string {
  const t = value?.trim();
  if (!t || t === '—' || /^undefined/i.test(t)) return MORTGAGE_UNAVAILABLE;
  return t;
}

/** aria-label when visible text is a fallback (screen readers). */
export function priceAriaLabel(displayText: string): string | undefined {
  if (displayText === PRICE_ON_REQUEST || displayText === '—') return PRICE_ON_REQUEST;
  return undefined;
}

/** Whether muted styling should apply (no valid price). */
export function isPriceFallbackText(displayText: string): boolean {
  return displayText === PRICE_ON_REQUEST;
}

/** Tailwind class for «Цена по запросу» (spec: #6b7280). */
export const PRICE_ON_REQUEST_CLASS = 'text-muted-foreground';

/** Alias — canonical safe formatter. */
export const formatPriceSafe = formatDisplayPrice;

/** Alias — min/max range. */
export const formatPriceRangeSafe = formatPriceRangeDisplay;

/** Alias — valid price check. */
export function hasValidPrice(value: string | number | null | undefined): boolean {
  return normalizePriceValue(value) !== null;
}

/** Sort key: invalid prices → +Infinity (last when sorting asc). */
export function priceSortKey(value: string | number | null | undefined): number {
  const rub = normalizePriceValue(value);
  return rub ?? Number.POSITIVE_INFINITY;
}

/** Compare two prices; invalid sorts last in ascending order. */
export function compareByPrice(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: 'asc' | 'desc' = 'asc',
): number {
  const diff = priceSortKey(a) - priceSortKey(b);
  return dir === 'asc' ? diff : -diff;
}

/** ₽/m² — invalid price or area → PRICE_ON_REQUEST (no NaN). */
export function formatPricePerMeterSafe(
  price: string | number | null | undefined,
  area: string | number | null | undefined,
): string {
  const rub = normalizePriceValue(price);
  if (rub === null) return PRICE_ON_REQUEST;
  const areaN =
    typeof area === 'number'
      ? area
      : Number(String(area ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(areaN) || areaN <= 0) return PRICE_ON_REQUEST;
  const ppm = Math.round(rub / areaN);
  if (!Number.isFinite(ppm) || ppm <= 0) return PRICE_ON_REQUEST;
  return `${ppm.toLocaleString('ru-RU')} ₽/м²`;
}

/** cn() helper: muted class when display text is on-request. */
export function priceFallbackClass(displayText: string, extra?: string): string {
  return isPriceFallbackText(displayText) ? PRICE_ON_REQUEST_CLASS : (extra ?? '');
}

/**
 * Короткая подпись для ручки слайдера: «0», «7,5 млн», «50 млн+».
 * Край диапазона помечаем плюсом — иначе «50 млн» читается как точная граница.
 */
export function formatSliderPrice(rub: number, max?: number): string {
  if (rub <= 0) return '0 ₽';
  const atMax = max != null && rub >= max;
  if (rub >= 1_000_000) {
    const mln = (rub / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${mln} млн${atMax ? '+' : ''} ₽`;
  }
  return `${Math.round(rub / 1000)} тыс ₽`;
}
