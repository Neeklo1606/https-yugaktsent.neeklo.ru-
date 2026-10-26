import { describe, expect, it } from 'vitest';
import { formatArea, shortRoomLabel } from './listing-format';
import { complexMinPrice } from './card-visual';
import type { ResidentialComplex } from '@/redesign/data/types';

describe('listing-format', () => {
  it('площадь с русской запятой и одной цифрой после неё', () => {
    expect(formatArea(78.33)).toBe('78,3 м²');
    expect(formatArea(95.5)).toBe('95,5 м²');
    expect(formatArea(40)).toBe('40 м²');
  });

  it('комнатность в формате карточки', () => {
    expect(shortRoomLabel('3-комнатная')).toBe('3-к.кв');
    expect(shortRoomLabel('1 комн.')).toBe('1-к.кв');
    expect(shortRoomLabel('Студия')).toBe('Студия');
    expect(shortRoomLabel('')).toBeNull();
  });
});

describe('complexMinPrice', () => {
  const base = { priceFrom: 8_540_016, priceRanges: undefined } as unknown as ResidentialComplex;

  it('берёт минимум по комнатности — та же цифра, что в каталоге', () => {
    expect(
      complexMinPrice({ ...base, priceRanges: [{ rooms: 1, priceMin: 7_537_500 }, { rooms: 2, priceMin: 9_970_400 }] }),
    ).toBe(7_537_500);
  });

  it('без диапазонов — priceFrom, без цены вовсе — null', () => {
    expect(complexMinPrice(base)).toBe(8_540_016);
    expect(complexMinPrice({ ...base, priceFrom: 0 })).toBeNull();
  });
});
