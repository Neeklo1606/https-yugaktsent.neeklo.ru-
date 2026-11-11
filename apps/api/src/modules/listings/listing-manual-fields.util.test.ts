import { describe, expect, it } from 'vitest';
import { changedManualFields, mergeManualFields, stripLockedFields } from './listing-manual-fields.util';

const current = {
  price: '7500000.00',
  status: 'ACTIVE',
  isPublished: true,
  apartment: { areaTotal: '41.50', floor: 3, planUrl: '/uploads/a.png', number: '12' },
};

describe('changedManualFields', () => {
  it('ignores unchanged values sent by the form', () => {
    expect(changedManualFields(current, { price: 7_500_000, status: 'ACTIVE', isPublished: true, apartment: { areaTotal: 41.5, floor: 3 } })).toEqual([]);
  });
  it('detects price, publication and apartment fields', () => {
    expect(
      changedManualFields(current, { price: 7_200_000, isPublished: false, apartment: { planUrl: '/uploads/b.png', floor: 3 } }),
    ).toEqual(['price', 'publication', 'apartment.planUrl']);
  });
});

describe('stripLockedFields', () => {
  it('drops locked fields from a feed update, keeps the rest', () => {
    const feed = { price: 8_000_000, status: 'SOLD', isPublished: false, apartment: { areaTotal: 41.5, floor: 3, number: '12' } };
    expect(stripLockedFields(feed, ['price', 'apartment.floor'])).toEqual({
      status: 'SOLD',
      isPublished: false,
      apartment: { areaTotal: 41.5, number: '12' },
    });
    expect(stripLockedFields(feed, ['publication'])).toEqual({ price: 8_000_000, apartment: feed.apartment });
  });
  it('returns input when nothing is locked', () => {
    const feed = { price: 1 };
    expect(stripLockedFields(feed, [])).toBe(feed);
  });
});

it('mergeManualFields dedupes', () => {
  expect(mergeManualFields(['price'], ['publication', 'price'])).toEqual(['price', 'publication']);
});
