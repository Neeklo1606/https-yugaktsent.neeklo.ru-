/**
 * Шкала ползунка цены.
 *
 * Цены в каталоге — от 1,4 до ~150 млн ₽, но почти все объекты лежат в 2–30 млн.
 * На линейной шкале 0–150 млн весь этот диапазон сжимался бы в первую пятую трека,
 * а при прежнем потолке 50 млн дорогие объекты нельзя было выбрать вовсе.
 * Поэтому трек кусочно-линейный: первые 60 % — до 20 млн, следующие 25 % — до 50 млн,
 * остаток — до потолка. Ручка двигается по позиции 0…POSITION_MAX, наружу уходят рубли.
 */
export const POSITION_MAX = 1000;
export const PRICE_SCALE_MAX = 150_000_000;

/** [позиция, цена] — опорные точки шкалы, по возрастанию */
const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [600, 20_000_000],
  [850, 50_000_000],
  [POSITION_MAX, PRICE_SCALE_MAX],
];

/** Шаг округления: мелкий в «массовом» диапазоне, крупный — в дорогом */
function stepFor(price: number): number {
  if (price < 20_000_000) return 100_000;
  if (price < 50_000_000) return 500_000;
  return 1_000_000;
}

export function positionToPrice(position: number): number {
  const p = Math.min(Math.max(position, 0), POSITION_MAX);
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, v0] = KNOTS[i - 1];
    const [p1, v1] = KNOTS[i];
    if (p <= p1) {
      const raw = v0 + ((p - p0) / (p1 - p0)) * (v1 - v0);
      const step = stepFor(raw);
      return Math.min(Math.round(raw / step) * step, PRICE_SCALE_MAX);
    }
  }
  return PRICE_SCALE_MAX;
}

export function priceToPosition(price: number): number {
  const v = Math.min(Math.max(price, 0), PRICE_SCALE_MAX);
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, v0] = KNOTS[i - 1];
    const [p1, v1] = KNOTS[i];
    if (v <= v1) return Math.round(p0 + ((v - v0) / (v1 - v0)) * (p1 - p0));
  }
  return POSITION_MAX;
}

/**
 * Приводит пару «от/до» к допустимому виду: без отрицательных и нулевых значений,
 * «от» не больше «до» (если перепутаны — меняем местами), потолок шкалы = «без ограничения».
 */
export function normalizePriceRange(min?: number, max?: number): { min?: number; max?: number } {
  let a = min != null && Number.isFinite(min) && min > 0 ? Math.round(min) : undefined;
  let b = max != null && Number.isFinite(max) && max > 0 ? Math.round(max) : undefined;
  if (a != null && b != null && a > b) [a, b] = [b, a];
  if (b != null && b >= PRICE_SCALE_MAX) b = undefined;
  return { min: a, max: b };
}

/** «1 500 000» → 1500000; пусто или мусор → undefined */
export function parseRubles(raw: string): number | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 1500000 → «1 500 000» (неразрывные пробелы, как в ru-RU) */
export function formatRubles(value?: number): string {
  return value == null ? '' : Math.round(value).toLocaleString('ru-RU');
}
