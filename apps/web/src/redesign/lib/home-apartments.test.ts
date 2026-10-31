import { describe, expect, it } from 'vitest';
import type { ApiListingCardRow } from '@/redesign/components/ListingCard';
import { isShowcaseApartment, pickHomeApartments } from './home-apartments';

const flat = (id: number, block: string, over: Partial<NonNullable<ApiListingCardRow['apartment']>> = {}, rest: Partial<ApiListingCardRow> = {}): ApiListingCardRow => ({
  id,
  kind: 'APARTMENT',
  price: 9_000_000,
  status: 'ACTIVE',
  block: { name: block, slug: block },
  apartment: { areaTotal: '42.5', areaKitchen: null, floor: 3, floorsTotal: 9, planUrl: '/uploads/media/p.png', ...over },
  updatedAt: new Date().toISOString(),
  ...rest,
});

describe('home-apartments', () => {
  it('отсекает кладовки, подвал, лоты без планировки и проданные', () => {
    expect(isShowcaseApartment(flat(1, 'a'))).toBe(true);
    expect(isShowcaseApartment(flat(2, 'a', { areaTotal: '13.25' }))).toBe(false);
    expect(isShowcaseApartment(flat(3, 'a', { floor: -1 }))).toBe(false);
    expect(isShowcaseApartment(flat(4, 'a', { planUrl: null }))).toBe(false);
    expect(isShowcaseApartment(flat(5, 'a', {}, { status: 'SOLD' }))).toBe(false);
    expect(isShowcaseApartment(flat(6, 'a', {}, { price: null }))).toBe(false);
    expect(isShowcaseApartment(flat(7, 'a', { areaTotal: '103.9', roomType: { name: 'Студия' } }))).toBe(false);
    expect(isShowcaseApartment(flat(8, 'a', {}, { updatedAt: '2025-01-01T00:00:00Z' }))).toBe(false);
  });

  it('чередует ЖК и соблюдает лимит', () => {
    const rows = [flat(1, 'a'), flat(2, 'a', { areaTotal: '60' }), flat(3, 'a', { areaTotal: '80' }), flat(4, 'b'), flat(5, 'c')];
    expect(pickHomeApartments(rows, 4).map((r) => r.id)).toEqual([1, 4, 5, 2]);
  });

  it('одинаковая планировка на разных этажах попадает один раз', () => {
    const rows = [flat(1, 'a', { floor: 2 }), flat(2, 'a', { floor: 3 }), flat(3, 'a', { areaTotal: '70' })];
    expect(pickHomeApartments(rows, 8).map((r) => r.id)).toEqual([1, 3]);
  });
});
