import { describe, expect, it } from 'vitest';
import {
  POSITION_MAX,
  PRICE_SCALE_MAX,
  formatRubles,
  normalizePriceRange,
  parseRubles,
  positionToPrice,
  priceToPosition,
} from './price-scale';

describe('price-scale', () => {
  it('края шкалы', () => {
    expect(positionToPrice(0)).toBe(0);
    expect(positionToPrice(POSITION_MAX)).toBe(PRICE_SCALE_MAX);
    expect(positionToPrice(-50)).toBe(0);
    expect(positionToPrice(POSITION_MAX + 50)).toBe(PRICE_SCALE_MAX);
  });

  it('массовый диапазон занимает большую часть трека', () => {
    expect(positionToPrice(600)).toBe(20_000_000);
    expect(priceToPosition(10_000_000)).toBe(300);
    expect(priceToPosition(50_000_000)).toBe(850);
  });

  it('позиция и цена переводятся туда и обратно без скачков', () => {
    for (const price of [1_400_000, 7_500_000, 15_200_000, 21_700_000, 49_000_000, 120_000_000]) {
      const back = positionToPrice(priceToPosition(price));
      expect(Math.abs(back - price) / price).toBeLessThan(0.02);
    }
  });

  it('цена за потолком не выводит ручку за трек', () => {
    expect(priceToPosition(400_000_000)).toBe(POSITION_MAX);
  });

  it('normalizePriceRange меняет местами перепутанные границы и снимает потолок', () => {
    expect(normalizePriceRange(30_000_000, 5_000_000)).toEqual({ min: 5_000_000, max: 30_000_000 });
    expect(normalizePriceRange(0, PRICE_SCALE_MAX)).toEqual({ min: undefined, max: undefined });
    expect(normalizePriceRange(-5, Number.NaN)).toEqual({ min: undefined, max: undefined });
  });

  it('разбор и формат рублей', () => {
    expect(parseRubles('1 500 000 ₽')).toBe(1_500_000);
    expect(parseRubles('')).toBeUndefined();
    expect(parseRubles('abc')).toBeUndefined();
    expect(formatRubles(1_500_000).replace(/\s/g, ' ')).toBe('1 500 000');
    expect(formatRubles(undefined)).toBe('');
  });
});
