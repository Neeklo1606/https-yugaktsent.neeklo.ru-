import { describe, expect, it } from 'vitest';
import { inRegionPhrase } from './catalog-seo-meta';

describe('inRegionPhrase', () => {
  it('склоняет однословные названия', () => {
    expect(inRegionPhrase('Анапа')).toBe(' в Анапе');
    expect(inRegionPhrase('Краснодар')).toBe(' в Краснодаре');
    expect(inRegionPhrase('Тюмень')).toBe(' в Тюмени');
    expect(inRegionPhrase('Сочи')).toBe(' в Сочи');
  });
  it('многословные не склоняет', () => {
    expect(inRegionPhrase('Краснодарский край')).toBe(' — Краснодарский край');
  });
});
