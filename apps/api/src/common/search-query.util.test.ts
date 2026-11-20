import { describe, expect, it } from 'vitest';
import { isGenericComplexQuery, normalizeSearchQuery } from './search-query.util';

describe('normalizeSearchQuery', () => {
  it('убирает служебные слова «жк», «жилой комплекс»', () => {
    expect(normalizeSearchQuery('ЖК Борский')).toBe('Борский');
    expect(normalizeSearchQuery('Борский ЖК')).toBe('Борский');
    expect(normalizeSearchQuery('жк «Сердце»')).toBe('Сердце');
    expect(normalizeSearchQuery('жилой комплекс Традиции')).toBe('Традиции');
  });

  it('не трогает слова, где «жк»/«комплекс» — часть слова', () => {
    expect(normalizeSearchQuery('ЖКХ')).toBe('ЖКХ');
    expect(normalizeSearchQuery('комплексный')).toBe('комплексный');
    expect(normalizeSearchQuery('Жуковского')).toBe('Жуковского');
  });

  it('«жк» и «новостройки» без названия — запрос на все ЖК', () => {
    expect(isGenericComplexQuery('жк')).toBe(true);
    expect(isGenericComplexQuery('Новостройки')).toBe(true);
    expect(isGenericComplexQuery('жк борский')).toBe(false);
    expect(isGenericComplexQuery('')).toBe(false);
  });
});
