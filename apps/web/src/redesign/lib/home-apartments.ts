import { listingFreshnessBadge } from '@lg/shared';
import type { ApiListingCardRow } from '@/redesign/components/ListingCard';

/** Меньше — кладовки и технические помещения, которые фид отдаёт как «студии» */
const MIN_AREA_M2 = 18;
/** Студия больше этого — почти наверняка коммерческое помещение, записанное фидом как студия */
const MAX_STUDIO_AREA_M2 = 45;

const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Годится ли лот для витрины главной: свободен, актуален, есть цена, планировка, площадь и жилой этаж */
export function isShowcaseApartment(l: ApiListingCardRow): boolean {
  if (l.kind !== 'APARTMENT' || l.status !== 'ACTIVE') return false;
  if (toNum(l.price) <= 0) return false;
  const a = l.apartment;
  if (!a?.planUrl?.trim()) return false;
  if (toNum(a.areaTotal) < MIN_AREA_M2) return false;
  // Этаж −1/0 — подвал и цоколь: там в фидах лежат кладовые, а не квартиры
  if (a.floor != null && a.floor < 1) return false;
  if (/студ/i.test(a.roomType?.name ?? '') && toNum(a.areaTotal) > MAX_STUDIO_AREA_M2) return false;
  // На витрину — только то, что обновлялось недавно: устаревший фид не выдаём за «в продаже»
  if (listingFreshnessBadge({ dataSource: l.dataSource, lastActivityAt: l.lastActivityAt, updatedAt: l.updatedAt }) == null) return false;
  return true;
}

/**
 * Подборка для блока «Квартиры в продаже»: по очереди из разных ЖК и без повторов
 * одной планировки, чтобы витрину не заняли восемь одинаковых квартир одного комплекса.
 */
export function pickHomeApartments(rows: readonly ApiListingCardRow[], limit: number): ApiListingCardRow[] {
  const byBlock = new Map<string, ApiListingCardRow[]>();
  const seenLayouts = new Set<string>();
  for (const l of rows) {
    if (!isShowcaseApartment(l)) continue;
    const key = l.block?.slug ?? `none-${l.id}`;
    // Одна и та же планировка на соседних этажах — один раз
    const layout = `${key}|${l.apartment?.roomType?.name ?? ''}|${Math.round(toNum(l.apartment?.areaTotal))}`;
    if (seenLayouts.has(layout)) continue;
    seenLayouts.add(layout);
    const list = byBlock.get(key);
    if (list) list.push(l);
    else byBlock.set(key, [l]);
  }
  const queues = [...byBlock.values()];
  const out: ApiListingCardRow[] = [];
  for (let round = 0; out.length < limit && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (round < q.length && out.length < limit) out.push(q[round]);
    }
  }
  return out;
}
